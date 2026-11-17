import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * Payment terms (Batch I). GET — all terms. POST — create (code +
 * name + due_days; discount_days / discount_percent optional).
 * PATCH ?id= — edit. DELETE ?id=.
 */
export async function GET() {
  const { data, error } = await supabaseAdmin().from('acct_payment_terms').select('*').eq('tenant_id', DEFAULT_TENANT_ID).order('due_days');
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({
    data: ((data ?? []) as Record<string, unknown>[]).map((t) => ({
      id: t.id,
      code: t.code,
      name: t.name,
      dueDays: t.due_days,
      discountDays: t.discount_days,
      discountPercent: t.discount_percent == null ? null : Number(t.discount_percent),
    })),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const code = String(body.code || '').trim();
  const name = String(body.name || '').trim();
  const dueDays = Number(body.dueDays);
  if (!code) return err('VALIDATION', 'code is required', 400);
  if (!name) return err('VALIDATION', 'name is required', 400);
  if (!Number.isInteger(dueDays) || dueDays < 0) return err('VALIDATION', 'dueDays must be a whole number of days', 400);
  const { data, error } = await supabaseAdmin().from('acct_payment_terms').insert({
    tenant_id: DEFAULT_TENANT_ID,
    code,
    name,
    due_days: dueDays,
    discount_days: body.discountDays == null ? null : Number(body.discountDays),
    discount_percent: body.discountPercent == null ? null : Number(body.discountPercent),
  }).select().single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { id: data.id, code: data.code, name: data.name, dueDays: data.due_days, discountDays: data.discount_days, discountPercent: data.discount_percent == null ? null : Number(data.discount_percent) } }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return err('VALIDATION', 'id is required', 400);
  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) patch.name = String(body.name || '').trim();
  if (body.dueDays !== undefined) {
    if (!Number.isInteger(Number(body.dueDays)) || Number(body.dueDays) < 0) return err('VALIDATION', 'dueDays must be a whole number of days', 400);
    patch.due_days = Number(body.dueDays);
  }
  if (body.discountDays !== undefined) patch.discount_days = body.discountDays == null ? null : Number(body.discountDays);
  if (body.discountPercent !== undefined) patch.discount_percent = body.discountPercent == null ? null : Number(body.discountPercent);
  if (Object.keys(patch).length === 0) return err('VALIDATION', 'Nothing to update', 400);
  if (patch.name === '') return err('VALIDATION', 'name cannot be empty', 400);
  const { data, error } = await supabaseAdmin().from('acct_payment_terms').update(patch).eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id).select().single();
  if (error || !data) return err('NOT_FOUND', 'Payment term not found', 404);
  return NextResponse.json({ data: { id: data.id, code: data.code, name: data.name, dueDays: data.due_days, discountDays: data.discount_days, discountPercent: data.discount_percent == null ? null : Number(data.discount_percent) } });
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return err('VALIDATION', 'id is required', 400);
  const { error } = await supabaseAdmin().from('acct_payment_terms').delete().eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { deleted: true } });
}
