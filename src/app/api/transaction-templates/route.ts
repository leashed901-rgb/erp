import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * Transaction templates (Batch I). GET — all templates. POST —
 * create (name + lines jsonb, at least 2 entries per the table
 * CHECK, + parameters jsonb). PATCH ?id= — edit. DELETE ?id=.
 * Lines are { account_id, debit, credit, description? }.
 */
export async function GET() {
  const { data, error } = await supabaseAdmin().from('acct_transaction_templates').select('*').eq('tenant_id', DEFAULT_TENANT_ID).order('name');
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({
    data: ((data ?? []) as Record<string, unknown>[]).map((t) => ({
      id: t.id,
      name: t.name,
      lines: t.lines,
      parameters: t.parameters,
      isAdjusting: t.is_adjusting,
      autoReverse: t.auto_reverse,
      isActive: t.is_active,
    })),
  });
}

function parseLines(body: Record<string, unknown>): { account_id: string; debit: number; credit: number; description: string }[] | null {
  if (!Array.isArray(body.lines)) return null;
  const parsed = (body.lines as Record<string, unknown>[]).map((l) => ({
    account_id: String(l.accountId || l.account_id || ''),
    debit: Number(l.debit || 0),
    credit: Number(l.credit || 0),
    description: String(l.description || ''),
  }));
  if (parsed.length < 2) return null;
  if (parsed.some((l) => !l.account_id)) return null;
  const debits = parsed.reduce((s, l) => s + l.debit, 0);
  const credits = parsed.reduce((s, l) => s + l.credit, 0);
  if (Math.abs(debits - credits) > 0.005) return null;
  return parsed;
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const name = String(body.name || '').trim();
  if (!name) return err('VALIDATION', 'name is required', 400);
  const lines = parseLines(body);
  if (!lines) return err('VALIDATION', 'lines must be at least two balanced lines, each with an account', 400);
  const { data, error } = await supabaseAdmin().from('acct_transaction_templates').insert({
    tenant_id: DEFAULT_TENANT_ID,
    name,
    lines,
    parameters: (body.parameters && typeof body.parameters === 'object' ? body.parameters : {}),
    is_adjusting: !!body.isAdjusting,
    auto_reverse: !!body.autoReverse,
    is_active: body.isActive !== false,
  }).select().single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { id: data.id, name: data.name, lines: data.lines, parameters: data.parameters, isAdjusting: data.is_adjusting, autoReverse: data.auto_reverse, isActive: data.is_active } }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return err('VALIDATION', 'id is required', 400);
  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) patch.name = String(body.name || '').trim();
  if (body.lines !== undefined) {
    const lines = parseLines(body);
    if (!lines) return err('VALIDATION', 'lines must be at least two balanced lines, each with an account', 400);
    patch.lines = lines;
  }
  if (body.parameters !== undefined) patch.parameters = (body.parameters && typeof body.parameters === 'object' ? body.parameters : {});
  if (body.isAdjusting !== undefined) patch.is_adjusting = !!body.isAdjusting;
  if (body.autoReverse !== undefined) patch.auto_reverse = !!body.autoReverse;
  if (body.isActive !== undefined) patch.is_active = !!body.isActive;
  if (Object.keys(patch).length === 0) return err('VALIDATION', 'Nothing to update', 400);
  if (patch.name === '') return err('VALIDATION', 'name cannot be empty', 400);
  const { data, error } = await supabaseAdmin().from('acct_transaction_templates').update(patch).eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id).select().single();
  if (error || !data) return err('NOT_FOUND', 'Transaction template not found', 404);
  return NextResponse.json({ data: { id: data.id, name: data.name, lines: data.lines, parameters: data.parameters, isAdjusting: data.is_adjusting, autoReverse: data.auto_reverse, isActive: data.is_active } });
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return err('VALIDATION', 'id is required', 400);
  const { error } = await supabaseAdmin().from('acct_transaction_templates').delete().eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { deleted: true } });
}
