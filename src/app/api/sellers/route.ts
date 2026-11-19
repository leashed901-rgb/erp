import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { writePartySpine } from '@/lib/partySpine';

function fail(code: string, message: string, status: number) {
  return NextResponse.json(
    { error: { code, message, requestId: crypto.randomUUID() } },
    { status },
  );
}

interface SellerListItem {
  id: string;
  seller_id: string;
  profile_id: string | null;
  display_name: string | null;
  legal_name: string | null;
  applicant_type: string | null;
  tax_form_status: string | null;
  recorded_earnings: number | null;
  created_at: string | null;
  open_violations: number;
  pending_appeals: number;
  has_profile: boolean;
  // The seller entity itself (additive): status drives the
  // onboarding queue lens; email/commission render on the workbench.
  status: string | null;
  email: string | null;
  commission_rate: number | null;
  operations_paused: boolean;
}

/**
 * GET /api/sellers — the seller list. A seller is a PARTY: the
 * canonical entity is the `sellers` row (which carries party_id into
 * the party spine), and Sellers / Seller Feed / Onboarding Queue are
 * lenses over that same data — this list is the shared source for
 * all three. Enforcement counters (open violations, pending appeals)
 * and recorded earnings (settled settlement gross) are computed from
 * their tables. Seller ids that appear only in enforcement data are
 * appended, labeled has_profile=false. ?q= filters on names.
 */
export async function GET(req: NextRequest) {
  const q = (req.nextUrl.searchParams.get('q') || '').trim().toLowerCase();
  const sb = supabaseAdmin();

  const [sellersRes, violationsRes, appealsRes, settlementsRes] = await Promise.all([
    sb.from('sellers')
      .select('*')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .order('created_at', { ascending: false }),
    sb.from('seller_violations')
      .select('seller_id, status, created_at')
      .eq('tenant_id', DEFAULT_TENANT_ID),
    sb.from('seller_appeals')
      .select('seller_id, status, created_at')
      .eq('tenant_id', DEFAULT_TENANT_ID),
    sb.from('seller_settlements')
      .select('seller_id, state, gross_cents')
      .eq('tenant_id', DEFAULT_TENANT_ID),
  ]);
  for (const r of [sellersRes, violationsRes, appealsRes, settlementsRes]) {
    if (r.error) return fail('INTERNAL', r.error.message, 500);
  }

  const openViolations = new Map<string, number>();
  const pendingAppeals = new Map<string, number>();
  const enforcementFirstSeen = new Map<string, string>();
  const track = (sellerId: string, createdAt: string) => {
    const prev = enforcementFirstSeen.get(sellerId);
    if (!prev || createdAt < prev) enforcementFirstSeen.set(sellerId, createdAt);
  };
  for (const v of violationsRes.data || []) {
    if (v.status === 'open') openViolations.set(v.seller_id, (openViolations.get(v.seller_id) || 0) + 1);
    track(v.seller_id, v.created_at || '');
  }
  for (const a of appealsRes.data || []) {
    if (a.status === 'pending') pendingAppeals.set(a.seller_id, (pendingAppeals.get(a.seller_id) || 0) + 1);
    track(a.seller_id, a.created_at || '');
  }
  const earnings = new Map<string, number>();
  for (const s of settlementsRes.data || []) {
    if (s.state === 'settled' || s.state === 'partially_reversed') {
      earnings.set(s.seller_id, (earnings.get(s.seller_id) || 0) + Number(s.gross_cents || 0) / 100);
    }
  }

  const items: SellerListItem[] = [];
  const seen = new Set<string>();
  for (const s of sellersRes.data || []) {
    seen.add(s.id);
    items.push({
      id: s.id,
      seller_id: s.id,
      profile_id: s.id,
      display_name: s.display_name ?? null,
      legal_name: s.legal_name ?? null,
      applicant_type: s.seller_type ?? null,
      tax_form_status: s.tax_id_last4 ? 'received' : null,
      recorded_earnings: earnings.get(s.id) ?? 0,
      created_at: s.created_at ?? null,
      open_violations: openViolations.get(s.id) || 0,
      pending_appeals: pendingAppeals.get(s.id) || 0,
      has_profile: true,
      status: s.status ?? null,
      email: s.email ?? null,
      commission_rate: s.commission_rate != null ? Number(s.commission_rate) : null,
      operations_paused: !!s.operations_paused,
    });
  }

  const enforcementOnly = new Set<string>([
    ...(violationsRes.data || []).map(v => v.seller_id),
    ...(appealsRes.data || []).map(a => a.seller_id),
  ]);
  for (const sellerId of enforcementOnly) {
    if (seen.has(sellerId)) continue;
    items.push({
      id: sellerId,
      seller_id: sellerId,
      profile_id: null,
      display_name: null,
      legal_name: null,
      applicant_type: null,
      tax_form_status: null,
      recorded_earnings: earnings.get(sellerId) ?? null,
      created_at: enforcementFirstSeen.get(sellerId) || null,
      open_violations: openViolations.get(sellerId) || 0,
      pending_appeals: pendingAppeals.get(sellerId) || 0,
      has_profile: false,
      status: null,
      email: null,
      commission_rate: null,
      operations_paused: false,
    });
  }

  const filtered = q
    ? items.filter(i =>
        (i.display_name || '').toLowerCase().includes(q) ||
        (i.legal_name || '').toLowerCase().includes(q) ||
        (i.email || '').toLowerCase().includes(q))
    : items;
  return NextResponse.json({ data: filtered });
}

/**
 * POST /api/sellers — add a seller (the workbench "Add seller").
 * Creates the canonical `sellers` row in the onboarding queue
 * (status 'applied') and mirrors it onto the party spine as a
 * seller-role party — a seller is a contact, like every other party.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') return fail('VALIDATION', 'JSON body required', 400);
  const legalName = typeof body.legal_name === 'string' ? body.legal_name.trim() : '';
  if (!legalName) return fail('VALIDATION', 'legal_name is required', 400);
  const displayName = typeof body.display_name === 'string' && body.display_name.trim()
    ? body.display_name.trim()
    : legalName;
  const sellerType = body.applicant_type === 'first_party' || body.seller_type === 'first_party'
    ? 'first_party'
    : 'marketplace';
  const slug = displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'seller';

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('sellers')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      seller_type: sellerType,
      legal_name: legalName,
      display_name: displayName,
      slug: `${slug}-${Math.random().toString(36).slice(2, 7)}`,
      email: typeof body.email === 'string' ? body.email : null,
      status: 'applied',
    })
    .select('*')
    .single();
  if (error) return fail('INTERNAL', error.message, 500);

  await writePartySpine(data.id, 'seller', {
    name: displayName,
    email: data.email,
    company: legalName,
    status: data.status,
    sellerType: sellerType,
  });
  await sb.from('sellers').update({ party_id: data.id }).eq('id', data.id);

  return NextResponse.json({
    data: {
      id: data.id,
      tenant_id: data.tenant_id,
      seller_id: data.id,
      user_id: null,
      case_id: null,
      applicant_type: data.seller_type,
      legal_name: data.legal_name,
      display_name: data.display_name,
      gov_id_type: null,
      gov_id_last4: null,
      tax_id_type: null,
      tax_id_last4: data.tax_id_last4 ?? null,
      tax_form_status: 'missing',
      tax_form_prompted_at: null,
      tax_form_received_at: null,
      tax_form_ticket_ref: null,
      recorded_earnings: 0,
      completion_ticket_ref: null,
      created_at: data.created_at,
      updated_at: data.updated_at,
    },
  }, { status: 201 });
}
