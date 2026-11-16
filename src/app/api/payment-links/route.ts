import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status = 400) {
  return NextResponse.json({ error: { code, message } }, { status });
}

type UiStatus = 'Active' | 'Paid' | 'Expired' | 'Inactive';

function uiStatus(r: Record<string, unknown>): UiStatus {
  const status = String(r.status);
  const expiresAt = r.expires_at ? new Date(String(r.expires_at)) : null;
  if (status === 'expired' || (expiresAt && expiresAt.getTime() < Date.now())) return 'Expired';
  if (status === 'inactive') return 'Inactive';
  const amount = Number(r.amount ?? 0);
  if (amount > 0 && Number(r.total_collected ?? 0) >= amount) return 'Paid';
  return 'Active';
}

/** GET /api/payment-links — live acct_payment_links rows + KPI aggregates.
 *  Customer name comes from the linked invoice's customer (when kind =
 *  invoice); generic links have no customer. Collected (30d) sums
 *  acct_ar_receipts tied to a payment link in the last 30 days. */
export async function GET() {
  try {
    const sb = supabaseAdmin();
    const { data, error } = await sb
      .from('acct_payment_links')
      .select('*')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .order('created_at', { ascending: false });
    if (error) return err('LIST_FAILED', error.message, 500);
    const rows = (data || []) as Record<string, unknown>[];

    const invoiceIds = [...new Set(rows.map((r) => r.invoice_id).filter(Boolean) as string[])];
    const customerByInvoice = new Map<string, string>();
    if (invoiceIds.length > 0) {
      const { data: invs } = await sb
        .from('acct_ar_invoices')
        .select('id, customer_id')
        .in('id', invoiceIds);
      const customerIds = [...new Set((invs || []).map((i) => i.customer_id).filter(Boolean) as string[])];
      if (customerIds.length > 0) {
        const { data: parties } = await sb
          .from('platform_parties')
          .select('id, display_name')
          .in('id', customerIds);
        const nameById = new Map((parties || []).map((p) => [String(p.id), String(p.display_name || '—')]));
        for (const inv of invs || []) {
          customerByInvoice.set(
            String(inv.id),
            nameById.get(String(inv.customer_id)) ?? '—',
          );
        }
      }
    }

    const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
    const { data: recentReceipts } = await sb
      .from('acct_ar_receipts')
      .select('amount, payment_link_id')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .not('payment_link_id', 'is', null)
      .gte('receipt_date', thirtyDaysAgo);

    const out = rows.map((r) => ({
      id: String(r.id),
      code: String(r.public_token),
      title: String(r.title),
      description: String(r.description || ''),
      amount: r.amount != null ? Number(r.amount) : null,
      currency: String(r.currency || 'USD'),
      customer: r.invoice_id ? (customerByInvoice.get(String(r.invoice_id)) ?? '—') : '—',
      invoice_id: (r.invoice_id as string | null) ?? null,
      kind: String(r.kind),
      status: uiStatus(r),
      db_status: String(r.status),
      created: String(r.created_at).slice(0, 10),
      expires: r.expires_at ? String(r.expires_at).slice(0, 10) : null,
      use_count: Number(r.use_count ?? 0),
      total_collected: Number(r.total_collected ?? 0),
      provider_url: (r.provider_url as string | null) ?? null,
      public_token: String(r.public_token),
    }));

    const active = out.filter((r) => r.status === 'Active').length;
    const pending = out
      .filter((r) => r.status === 'Active' && r.amount != null)
      .reduce((s, r) => s + Math.max(0, (r.amount ?? 0) - r.total_collected), 0);
    const collected30d = (recentReceipts || []).reduce((s, r) => s + Number(r.amount ?? 0), 0);
    const conversion = out.length > 0 ? Math.round((out.filter((r) => r.use_count > 0).length / out.length) * 100) : 0;

    return NextResponse.json({
      data: out,
      meta: { total: out.length, active, collected30d, pending, conversion },
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to list payment links.';
    return err('LIST_FAILED', message, 500);
  }
}

/** POST /api/payment-links — creates a fixed or invoice link.
 *  Body: { title (or description), description?, amount?, currency?,
 *  expires_at?, invoice_id?, item_id? }. kind is derived: invoice when
 *  invoice_id is given, item when item_id is given, else fixed (amount
 *  required). The public token is the share identifier; provider_url is
 *  only set when a checkout provider publishes the link (none is
 *  connected — see the screen note). */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const sb = supabaseAdmin();
    const { data: entityId, error: entityErr } = await sb.rpc('acct_default_entity', { p_tenant_id: DEFAULT_TENANT_ID });
    if (entityErr) return err('ENTITY_FAILED', entityErr.message);
    const title = String(body.title ?? body.description ?? '').trim();
    if (!title) return err('VALIDATION', 'title (or description) is required.');
    const amount = body.amount != null ? Number(body.amount) : null;
    if (amount != null && (!Number.isFinite(amount) || amount <= 0)) {
      return err('VALIDATION', 'amount must be positive.');
    }
    const invoiceId = body.invoice_id ? String(body.invoice_id) : null;
    const itemId = body.item_id ? String(body.item_id) : null;
    const kind = invoiceId ? 'invoice' : itemId ? 'item' : 'fixed';
    if (kind === 'fixed' && amount == null) return err('VALIDATION', 'amount is required for a fixed link.');
    if (kind === 'invoice' && !invoiceId) return err('VALIDATION', 'invoice_id is required for an invoice link.');
    if (kind === 'item' && !itemId) return err('VALIDATION', 'item_id is required for an item link.');
    const token = Array.from(crypto.getRandomValues(new Uint8Array(6)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase();
    const { data, error } = await sb
      .from('acct_payment_links')
      .insert({
        tenant_id: DEFAULT_TENANT_ID,
        entity_id: entityId,
        kind,
        title,
        description: body.description != null ? String(body.description) : null,
        amount,
        currency: String(body.currency || 'USD'),
        item_id: itemId,
        invoice_id: invoiceId,
        allow_quantity: false,
        collect_tax: false,
        income_account_id: null,
        public_token: `PL-${token}`,
        provider: 'internal',
        provider_link_id: null,
        provider_url: null,
        status: 'active',
        expires_at: body.expires_at ?? null,
        max_uses: body.max_uses != null ? Number(body.max_uses) : null,
        use_count: 0,
        total_collected: 0,
      })
      .select()
      .single();
    if (error) return err('CREATE_FAILED', error.message);
    return NextResponse.json({ data }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to create payment link.';
    return err('CREATE_FAILED', message);
  }
}
