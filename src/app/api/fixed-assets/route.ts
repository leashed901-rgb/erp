import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * GET /api/fixed-assets — the fixed-asset register (Batch H).
 * Rows come from the engine's acct_fixed_asset_register RPC (as of
 * today) joined to the raw asset rows for class/dates/detail links.
 * POST — add an asset via acct_add_fixed_asset. Cost must be positive;
 * the class defaults to the engine's EQUIP class when omitted; when
 * the asset is NOT already on the books the RPC posts the acquisition
 * journal (bank GL or the fixed-assets role account).
 */
export async function GET() {
  const [{ data: register, error: regErr }, { data: assets, error: assetErr }] = await Promise.all([
    supabaseAdmin().rpc('acct_fixed_asset_register', { p_tenant_id: DEFAULT_TENANT_ID }),
    supabaseAdmin().from('acct_fixed_assets').select('*').eq('tenant_id', DEFAULT_TENANT_ID).order('asset_number'),
  ]);
  if (regErr) return err('INTERNAL', regErr.message, 500);
  if (assetErr) return err('INTERNAL', assetErr.message, 500);
  const regByNumber = new Map(((register ?? []) as Record<string, unknown>[]).map((r) => [r.asset_number, r]));
  const classes = await supabaseAdmin().from('acct_asset_classes').select('id, code, name').eq('tenant_id', DEFAULT_TENANT_ID);
  const classById = new Map(((classes.data ?? []) as Record<string, unknown>[]).map((c) => [c.id, c]));
  const rows = ((assets ?? []) as Record<string, unknown>[]).map((a) => {
    const reg = regByNumber.get(a.asset_number) as Record<string, unknown> | undefined;
    const cls = classById.get(a.asset_class_id as string) as Record<string, unknown> | undefined;
    const cost = Number(a.original_cost || 0);
    const accum = Number(a.accumulated_depreciation || 0);
    return {
      id: a.id,
      assetNumber: a.asset_number,
      name: a.name,
      description: a.description,
      status: a.status,
      acquired: a.acquisition_date,
      inService: a.placed_in_service_date,
      cost,
      residual: Number(a.residual_value || 0),
      accumulated: accum,
      netBookValue: cost - accum,
      lifeMonths: a.useful_life_months,
      classId: a.asset_class_id,
      className: cls ? `${cls.code} — ${cls.name}` : null,
      location: a.location,
      serial: a.serial_number,
      disposalDate: a.disposal_date,
      disposalProceeds: a.disposal_proceeds == null ? null : Number(a.disposal_proceeds),
      disposalGainLoss: a.disposal_gain_loss == null ? null : Number(a.disposal_gain_loss),
      method: reg ? reg.method : null,
      lastDepreciated: reg ? reg.last_depreciated : null,
    };
  });
  return NextResponse.json({ data: rows });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const name = String(body.name || '').trim();
  const cost = Number(body.cost);
  const acquired = String(body.acquired || '').slice(0, 10);
  if (!name) return err('VALIDATION', 'Name is required', 400);
  if (!Number.isFinite(cost) || cost <= 0) return err('VALIDATION', 'Asset cost must be positive', 400);
  if (!acquired) return err('VALIDATION', 'Acquisition date is required', 400);
  const { data, error } = await supabaseAdmin().rpc('acct_add_fixed_asset', {
    p_tenant_id: DEFAULT_TENANT_ID,
    p_name: name,
    p_cost: cost,
    p_acquired: acquired,
    p_class_id: body.classId || null,
    p_paid_from_bank_account_id: body.paidFromBankAccountId || null,
    p_already_on_books: Boolean(body.alreadyOnBooks),
    p_accumulated_to_date: Number(body.accumulatedToDate || 0),
    p_serial: body.serial ? String(body.serial) : null,
    p_location: body.location ? String(body.location) : null,
  });
  if (error) return err('RPC_FAILED', error.message, 400);
  const { data: row } = await supabaseAdmin().from('acct_fixed_assets').select('asset_number').eq('id', data as string).single();
  return NextResponse.json({ data: { id: data, assetNumber: (row as Record<string, unknown> | null)?.asset_number ?? null } }, { status: 201 });
}
