import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import type { EfileFiling } from '@/lib/taxTypes';

const err = (code: string, message: string, status: number) =>
  NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });

const toDto = (r: Record<string, unknown>): EfileFiling => ({
  id: String(r.id),
  formCode: String(r.form_code),
  stateCode: (r.state_code as string) || null,
  taxYear: Number(r.tax_year),
  periodLabel: (r.period_label as string) || null,
  dueDate: (r.due_date as string) || null,
  status: String(r.status),
  channel: (r.channel as string) || null,
  recordCount: r.record_count != null ? Number(r.record_count) : null,
  totalAmount: r.total_amount != null ? Number(r.total_amount) : null,
  confirmationNumber: (r.confirmation_number as string) || null,
  filedAt: (r.filed_at as string) || null,
  blockingIssues: r.blocking_issues ?? null,
  createdAt: String(r.created_at),
});

/** GET /api/tax/efile-filings?year= — year-end e-file filings (efile_filings, doc 10). */
export async function GET(req: NextRequest) {
  const year = Number(new URL(req.url).searchParams.get('year')) || new Date().getFullYear();
  const { data, error } = await supabaseAdmin()
    .from('efile_filings')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('tax_year', year)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: (data || []).map(toDto) });
}

/** POST /api/tax/efile-filings — create a tax return draft (registry: create.tax return). */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err('VALIDATION', 'Invalid JSON', 400); }
  const sb = supabaseAdmin();
  const { data: entity } = await sb
    .from('acct_entities')
    .select('id')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  const insert = {
    tenant_id: DEFAULT_TENANT_ID,
    entity_id: entity?.id || null,
    form_code: String(body.formCode || '1120'),
    state_code: body.stateCode ? String(body.stateCode) : null,
    tax_year: Number(body.taxYear) || new Date().getFullYear(),
    period_label: body.periodLabel ? String(body.periodLabel) : null,
    due_date: body.dueDate ? String(body.dueDate) : null,
    channel: String(body.channel || 'mef'), // IRS Modernized e-File; CHECK: mef/iris_*/state_portal/partner/manual…
    environment: 'production',
    status: 'draft',
    total_amount: body.totalAmount != null ? Number(body.totalAmount) : 0, // column is NOT NULL
  };
  const { data, error } = await sb.from('efile_filings').insert(insert).select('*').single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: toDto(data) }, { status: 201 });
}
