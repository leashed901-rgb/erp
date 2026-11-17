import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

const SECTIONS = ['profit_and_loss', 'balance_sheet', 'cash_flow', 'trial_balance', 'kpis', 'flux', 'close_status', 'ar_aging', 'ap_aging'];

/**
 * Report packages (Batch I). GET — the saved report bundles (name +
 * sections + flux thresholds + recipients). The engine validates
 * sections against the nine known report types. POST — create.
 * PATCH ?id= — edit. DELETE ?id=.
 */
export async function GET() {
  const { data, error } = await supabaseAdmin().from('acct_report_packages').select('*').eq('tenant_id', DEFAULT_TENANT_ID).order('name');
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({
    data: ((data ?? []) as Record<string, unknown>[]).map((p) => ({
      id: p.id,
      name: p.name,
      sections: p.sections,
      fluxAmountThreshold: p.flux_amount_threshold == null ? null : Number(p.flux_amount_threshold),
      fluxPctThreshold: p.flux_pct_threshold == null ? null : Number(p.flux_pct_threshold),
      recipients: p.recipients,
    })),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const name = String(body.name || '').trim();
  const sections = Array.isArray(body.sections) ? body.sections.map((s: unknown) => String(s)) : [];
  if (!name) return err('VALIDATION', 'name is required', 400);
  if (sections.some((s: string) => !SECTIONS.includes(s))) return err('VALIDATION', `sections must be among ${SECTIONS.join(', ')}`, 400);
  const { data, error } = await supabaseAdmin().from('acct_report_packages').insert({
    tenant_id: DEFAULT_TENANT_ID,
    name,
    sections,
    flux_amount_threshold: body.fluxAmountThreshold == null ? 500 : Number(body.fluxAmountThreshold),
    flux_pct_threshold: body.fluxPctThreshold == null ? 0.10 : Number(body.fluxPctThreshold),
    recipients: Array.isArray(body.recipients) ? body.recipients.map((r: unknown) => String(r)) : [],
  }).select().single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { id: data.id, name: data.name, sections: data.sections, fluxAmountThreshold: data.flux_amount_threshold == null ? null : Number(data.flux_amount_threshold), fluxPctThreshold: data.flux_pct_threshold == null ? null : Number(data.flux_pct_threshold), recipients: data.recipients } }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return err('VALIDATION', 'id is required', 400);
  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) patch.name = String(body.name || '').trim();
  if (body.sections !== undefined) {
    const sections = Array.isArray(body.sections) ? body.sections.map((s: unknown) => String(s)) : [];
    if (sections.some((s: string) => !SECTIONS.includes(s))) return err('VALIDATION', `sections must be among ${SECTIONS.join(', ')}`, 400);
    patch.sections = sections;
  }
  if (body.fluxAmountThreshold !== undefined) patch.flux_amount_threshold = body.fluxAmountThreshold == null ? null : Number(body.fluxAmountThreshold);
  if (body.fluxPctThreshold !== undefined) patch.flux_pct_threshold = body.fluxPctThreshold == null ? null : Number(body.fluxPctThreshold);
  if (body.recipients !== undefined) patch.recipients = Array.isArray(body.recipients) ? body.recipients.map((r: unknown) => String(r)) : [];
  if (Object.keys(patch).length === 0) return err('VALIDATION', 'Nothing to update', 400);
  if (patch.name === '') return err('VALIDATION', 'name cannot be empty', 400);
  const { data, error } = await supabaseAdmin().from('acct_report_packages').update(patch).eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id).select().single();
  if (error || !data) return err('NOT_FOUND', 'Report package not found', 404);
  return NextResponse.json({ data: { id: data.id, name: data.name, sections: data.sections, recipients: data.recipients } });
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return err('VALIDATION', 'id is required', 400);
  const { error } = await supabaseAdmin().from('acct_report_packages').delete().eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { deleted: true } });
}
