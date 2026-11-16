import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * Currencies (Batch I). GET — all currencies (code is the PK;
 * tenant has 1 row today: USD). POST — add a currency. PATCH
 * ?code= — edit. DELETE ?code= — refused while an exchange rate or
 * an expense report references the code.
 */
export async function GET() {
  const { data, error } = await supabaseAdmin().from('acct_currencies').select('*').eq('tenant_id', DEFAULT_TENANT_ID).order('code');
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({
    data: ((data ?? []) as Record<string, unknown>[]).map((c) => ({
      code: c.code,
      name: c.name,
      symbol: c.symbol,
      minorUnits: c.minor_units,
      isActive: c.is_active,
    })),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const code = String(body.code || '').trim().toUpperCase();
  const name = String(body.name || '').trim();
  if (!code || code.length !== 3) return err('VALIDATION', 'code is required (3 letters, e.g. EUR)', 400);
  if (!name) return err('VALIDATION', 'name is required', 400);
  const { data, error } = await supabaseAdmin().from('acct_currencies').insert({
    tenant_id: DEFAULT_TENANT_ID,
    code,
    name,
    symbol: body.symbol ? String(body.symbol) : null,
    minor_units: Number(body.minorUnits ?? 2),
    is_active: body.isActive !== false,
  }).select().single();
  if (error) {
    if ((error as { code?: string }).code === '23505') return err('CONFLICT', `Currency ${code} already exists`, 409);
    return err('INTERNAL', error.message, 500);
  }
  return NextResponse.json({ data: { code: data.code, name: data.name, symbol: data.symbol, minorUnits: data.minor_units, isActive: data.is_active } }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const code = new URL(req.url).searchParams.get('code');
  if (!code) return err('VALIDATION', 'code is required', 400);
  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  if (body.name !== undefined) patch.name = String(body.name || '').trim();
  if (body.symbol !== undefined) patch.symbol = body.symbol ? String(body.symbol) : null;
  if (body.minorUnits !== undefined) patch.minor_units = Number(body.minorUnits);
  if (body.isActive !== undefined) patch.is_active = !!body.isActive;
  if (Object.keys(patch).length === 0) return err('VALIDATION', 'Nothing to update', 400);
  if (patch.name === '') return err('VALIDATION', 'name cannot be empty', 400);
  const { data, error } = await supabaseAdmin().from('acct_currencies').update(patch).eq('tenant_id', DEFAULT_TENANT_ID).eq('code', code.toUpperCase()).select().single();
  if (error || !data) return err('NOT_FOUND', 'Currency not found', 404);
  return NextResponse.json({ data: { code: data.code, name: data.name, symbol: data.symbol, minorUnits: data.minor_units, isActive: data.is_active } });
}

export async function DELETE(req: NextRequest) {
  const code = new URL(req.url).searchParams.get('code');
  if (!code) return err('VALIDATION', 'code is required', 400);
  const upper = code.toUpperCase();
  const sb = supabaseAdmin();
  const [{ count: rateCount }, { count: reportCount }] = await Promise.all([
    sb.from('acct_exchange_rates').select('id', { count: 'exact', head: true }).eq('tenant_id', DEFAULT_TENANT_ID).or(`from_currency.eq.${upper},to_currency.eq.${upper}`),
    sb.from('acct_expense_reports').select('id', { count: 'exact', head: true }).eq('tenant_id', DEFAULT_TENANT_ID).eq('currency', upper),
  ]);
  if ((rateCount || 0) > 0) return err('VALIDATION', `Currency is used by ${rateCount} exchange rate(s)`, 400);
  if ((reportCount || 0) > 0) return err('VALIDATION', `Currency is used by ${reportCount} expense report(s)`, 400);
  const { error } = await sb.from('acct_currencies').delete().eq('tenant_id', DEFAULT_TENANT_ID).eq('code', upper);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { deleted: true } });
}
