import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** GET /api/tax/filings?year=2026&form_code=1120
 *  Reads efile_filings — the real e-file table. */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const year = searchParams.get('year');
  const formCode = searchParams.get('form_code');

  let q = supabaseAdmin()
    .from('efile_filings')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('created_at', { ascending: false });
  if (year) q = q.eq('tax_year', Number(year));
  if (formCode) q = q.eq('form_code', formCode);

  const { data, error } = await q;
  if (error) {
    const code = (error as { code?: string }).code;
    if (code === '42P01' || code === 'PGRST205' || code === 'PGRST200') {
      return NextResponse.json({ data: [], schema_pending: true });
    }
    return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  }
  return NextResponse.json({ data });
}

/** POST /api/tax/filings — create a tax return (filing).
 *  Body: { form_code, tax_year, channel?, period_start?, period_end?, due_date? }
 *  Creates an efile_filings row with status='draft'. */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Invalid JSON body', requestId: crypto.randomUUID() } }, { status: 400 });
  }
  if (!body.form_code || !body.tax_year) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'form_code and tax_year are required', requestId: crypto.randomUUID() } }, { status: 400 });
  }

  const { data: entity } = await supabaseAdmin()
    .from('acct_entities')
    .select('id')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .limit(1)
    .maybeSingle();
  const entityId = entity?.id;
  if (!entityId) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'No acct_entities row found for this tenant.' } }, { status: 400 });
  }

  const insert: Record<string, unknown> = {
    tenant_id: DEFAULT_TENANT_ID,
    entity_id: entityId,
    form_code: String(body.form_code),
    tax_year: Number(body.tax_year),
    channel: String(body.channel || 'mef'),
    status: 'draft',
  };
  if (body.period_start) insert.period_start = body.period_start;
  if (body.period_end) insert.period_end = body.period_end;
  if (body.due_date) insert.due_date = body.due_date;
  if (body.period_label) insert.period_label = body.period_label;

  const { data, error } = await supabaseAdmin()
    .from('efile_filings')
    .insert(insert)
    .select('*')
    .single();
  if (error) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  }
  return NextResponse.json({ data }, { status: 201 });
}
