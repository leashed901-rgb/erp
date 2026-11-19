import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { writePartySpine } from '@/lib/partySpine';
import { toSellerSettlement } from '@/lib/sellerTypes';

function fail(code: string, message: string, status: number) {
  return NextResponse.json(
    { error: { code, message, requestId: crypto.randomUUID() } },
    { status },
  );
}

const OPERATOR_USER_ID = 'd5146f15-a9a8-4e07-b25d-90a5b412bbb6';

/** The SellerProfile DTO, derived from the canonical sellers row
 *  (merged with the self-serve profile row when one exists). */
function profileDto(seller: Record<string, any>, profile: Record<string, any> | null, recordedEarnings: number) {
  return {
    id: seller.id,
    tenant_id: seller.tenant_id,
    seller_id: seller.id,
    user_id: profile?.user_id ?? null,
    case_id: profile?.case_id ?? null,
    applicant_type: seller.seller_type,
    legal_name: seller.legal_name,
    display_name: seller.display_name ?? null,
    gov_id_type: profile?.gov_id_type ?? null,
    gov_id_last4: profile?.gov_id_last4 ?? null,
    tax_id_type: profile?.tax_id_type ?? null,
    tax_id_last4: seller.tax_id_last4 ?? profile?.tax_id_last4 ?? null,
    tax_form_status: profile?.tax_form_status ?? (seller.tax_id_last4 ? 'received' : 'missing'),
    stripe_account_id: profile?.stripe_account_id ?? null,
    tax_form_prompted_at: profile?.tax_form_prompted_at ?? null,
    tax_form_received_at: profile?.tax_form_received_at ?? null,
    tax_form_ticket_ref: profile?.tax_form_ticket_ref ?? null,
    recorded_earnings: profile?.recorded_earnings ?? recordedEarnings,
    completion_ticket_ref: profile?.completion_ticket_ref ?? null,
    created_at: seller.created_at,
    updated_at: seller.updated_at,
  };
}

/**
 * GET /api/sellers/[id] — one seller, every lens: the canonical
 * sellers row, its profile DTO, settlements, violations, appeals
 * and feed posts. The seller is a party; `seller.party_id` points
 * into the party spine.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = supabaseAdmin();
  const [sellerRes, profileRes, violationsRes, appealsRes, postsRes, settlementsRes, k1099Res] = await Promise.all([
    sb.from('sellers').select('*').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id).maybeSingle(),
    sb.from('seller_self_serve_profiles').select('*').eq('tenant_id', DEFAULT_TENANT_ID).eq('seller_id', id).maybeSingle(),
    sb.from('seller_violations').select('*').eq('tenant_id', DEFAULT_TENANT_ID).eq('seller_id', id).order('created_at', { ascending: false }),
    sb.from('seller_appeals').select('*').eq('tenant_id', DEFAULT_TENANT_ID).eq('seller_id', id).order('created_at', { ascending: false }),
    sb.from('seller_social_posts').select('*').eq('tenant_id', DEFAULT_TENANT_ID).eq('seller_id', id).order('created_at', { ascending: false }),
    sb.from('seller_settlements').select('*').eq('tenant_id', DEFAULT_TENANT_ID).eq('seller_id', id).order('created_at', { ascending: false }),
    sb.from('seller_1099k_generations').select('*').eq('tenant_id', DEFAULT_TENANT_ID).eq('seller_id', id).order('tax_year', { ascending: false }),
  ]);
  for (const r of [violationsRes, appealsRes, postsRes, settlementsRes]) {
    if (r.error) return fail('INTERNAL', r.error.message, 500);
  }
  const seller = sellerRes.data;
  if (!seller) {
    // Enforcement-only seller: no canonical row yet.
    if ((violationsRes.data || []).length === 0 && (appealsRes.data || []).length === 0) {
      return fail('NOT_FOUND', `No seller ${id}`, 404);
    }
    return NextResponse.json({
      data: {
        profile: null,
        seller: null,
        violations: violationsRes.data || [],
        appeals: appealsRes.data || [],
        posts: postsRes.data || [],
        settlements: (settlementsRes.data || []).map(r => toSellerSettlement(r as Record<string, unknown>)),
        form1099k: k1099Res.data || [],
      },
    });
  }
  const recordedEarnings = (settlementsRes.data || [])
    .filter(s => s.state === 'settled' || s.state === 'partially_reversed')
    .reduce((sum, s) => sum + Number(s.gross_cents || 0) / 100, 0);
  return NextResponse.json({
    data: {
      profile: profileDto(seller, profileRes.data ?? null, recordedEarnings),
      seller,
      violations: violationsRes.data || [],
      appeals: appealsRes.data || [],
      posts: postsRes.data || [],
      settlements: (settlementsRes.data || []).map(r => toSellerSettlement(r as Record<string, unknown>)),
      form1099k: k1099Res.data || [],
    },
  });
}

const SELLER_FIELDS = new Set([
  'legal_name', 'display_name', 'email', 'phone', 'website',
  'commission_rate', 'tax_id_last4', 'slug',
]);
const SELLER_STATUSES = new Set(['applied', 'approved', 'suspended', 'closed']);

/**
 * PATCH /api/sellers/[id] — update the canonical seller: profile
 * fields, commission, and the lifecycle transitions the workbench
 * drives (approve from the onboarding queue stamps approved_at/by;
 * suspend; close; pause/resume operations). The party spine mirror
 * follows the seller's status/name.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  if (!body || typeof body !== 'object') return fail('VALIDATION', 'JSON body required', 400);

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const [k, v] of Object.entries(body)) {
    if (SELLER_FIELDS.has(k) && v !== undefined) updates[k] = v;
  }
  if (body.status !== undefined) {
    if (!SELLER_STATUSES.has(String(body.status))) {
      return fail('VALIDATION', `status must be one of: ${[...SELLER_STATUSES].join(', ')}`, 400);
    }
    updates.status = String(body.status);
    if (body.status === 'approved') {
      updates.approved_at = new Date().toISOString();
      updates.approved_by = OPERATOR_USER_ID;
    }
  }
  if (body.operations_paused !== undefined) {
    updates.operations_paused = !!body.operations_paused;
    updates.operations_paused_at = body.operations_paused ? new Date().toISOString() : null;
    if (typeof body.operations_pause_note === 'string') {
      updates.operations_pause_note = body.operations_pause_note;
    }
  }
  if (updates.commission_rate !== undefined) {
    const rate = Number(updates.commission_rate);
    if (isNaN(rate) || rate < 0 || rate > 1) {
      return fail('VALIDATION', 'commission_rate must be a fraction between 0 and 1', 400);
    }
    updates.commission_rate = rate;
  }
  // Onboarding paperwork fields live on the self-serve profile —
  // the seller's onboarding file, keyed by seller_id. Upsert it so
  // stamping tax_form_prompted_at etc. works for every seller.
  const PAPERWORK_FIELDS = [
    'tax_form_status', 'tax_form_prompted_at', 'tax_form_received_at',
    'tax_form_ticket_ref', 'completion_ticket_ref', 'case_id',
  ];
  const paperwork: Record<string, unknown> = {};
  for (const k of PAPERWORK_FIELDS) {
    if (body[k] !== undefined) paperwork[k] = body[k];
  }
  const hasEntityUpdates = Object.keys(updates).length > 1;
  if (!hasEntityUpdates && Object.keys(paperwork).length === 0) {
    return fail('VALIDATION', 'No updatable seller fields provided', 400);
  }
  if (Object.keys(paperwork).length > 0) {
    const sb0 = supabaseAdmin();
    const { data: sellerRow } = await sb0
      .from('sellers').select('legal_name, display_name, seller_type')
      .eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id).maybeSingle();
    await sb0
      .from('seller_self_serve_profiles')
      .upsert({
        tenant_id: DEFAULT_TENANT_ID,
        seller_id: id,
        legal_name: sellerRow?.legal_name || 'Seller',
        display_name: sellerRow?.display_name || null,
        applicant_type: sellerRow?.seller_type === 'first_party' ? 'business_seller' : 'individual_seller',
        tax_form_status: 'missing',
        recorded_earnings: 0,
        ...paperwork,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'seller_id' });
    if (!hasEntityUpdates) {
      const { data: profileRow } = await sb0
        .from('seller_self_serve_profiles').select('*')
        .eq('tenant_id', DEFAULT_TENANT_ID).eq('seller_id', id).maybeSingle();
      return NextResponse.json({ data: profileRow });
    }
  }

  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('sellers')
    .update(updates)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) return fail('VALIDATION', error.message, 400);
  if (!data) return fail('NOT_FOUND', `No seller ${id}`, 404);

  await writePartySpine(data.id, 'seller', {
    name: data.display_name || data.legal_name,
    email: data.email,
    company: data.legal_name,
    status: data.status,
    sellerType: data.seller_type,
  });

  return NextResponse.json({ data });
}
