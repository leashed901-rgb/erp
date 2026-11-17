import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * Allocation rules (Batch I). GET ?allocationId= — the split for one
 * allocation. POST — add a rule (destination account + percentage or
 * fixed amount; at least one of the two). DELETE ?id= — remove a rule.
 * acct_allocation_rules has NO tenant_id column — rules are scoped
 * through their allocation.
 */
export async function GET(req: NextRequest) {
  const allocationId = new URL(req.url).searchParams.get('allocationId');
  if (!allocationId) return err('VALIDATION', 'allocationId is required', 400);
  const sb = supabaseAdmin();
  const { data, error } = await sb.from('acct_allocation_rules').select('*').eq('allocation_id', allocationId);
  if (error) return err('INTERNAL', error.message, 500);
  const destIds = [...new Set(((data ?? []) as { destination_account_id: string | null }[]).map((r) => r.destination_account_id).filter(Boolean))] as string[];
  const { data: accounts } = destIds.length
    ? await sb.from('acct_chart_of_accounts').select('id, code, name').in('id', destIds)
    : { data: [] };
  const accountById = new Map(((accounts ?? []) as Record<string, unknown>[]).map((a) => [a.id, `${a.code} · ${a.name}`]));
  return NextResponse.json({
    data: ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      id: r.id,
      allocationId: r.allocation_id,
      destinationAccountId: r.destination_account_id,
      destinationAccount: (accountById.get(r.destination_account_id as string) as string) || '—',
      percentage: r.percentage == null ? null : Number(r.percentage),
      fixedAmount: r.fixed_amount == null ? null : Number(r.fixed_amount),
      dimensions: r.dimensions,
    })),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const allocationId = String(body.allocationId || '');
  const destinationAccountId = String(body.destinationAccountId || '');
  const percentage = body.percentage == null ? null : Number(body.percentage);
  const fixedAmount = body.fixedAmount == null ? null : Number(body.fixedAmount);
  const dimensions = (body.dimensions && typeof body.dimensions === 'object' ? body.dimensions : {}) as Record<string, unknown>;
  if (!allocationId) return err('VALIDATION', 'allocationId is required', 400);
  if (!destinationAccountId) return err('VALIDATION', 'destinationAccountId is required', 400);
  if (percentage == null && fixedAmount == null) return err('VALIDATION', 'percentage or fixedAmount is required', 400);
  if (percentage != null && (!Number.isFinite(percentage) || percentage <= 0 || percentage > 100)) return err('VALIDATION', 'percentage must be between 0 and 100', 400);
  if (fixedAmount != null && (!Number.isFinite(fixedAmount) || fixedAmount <= 0)) return err('VALIDATION', 'fixedAmount must be positive', 400);
  const sb = supabaseAdmin();
  const [{ data: alloc }, { data: account }] = await Promise.all([
    sb.from('acct_allocations').select('id').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', allocationId).single(),
    sb.from('acct_chart_of_accounts').select('id').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', destinationAccountId).single(),
  ]);
  if (!alloc) return err('VALIDATION', 'Unknown allocation', 400);
  if (!account) return err('VALIDATION', 'Unknown destination account', 400);
  const { data, error } = await sb.from('acct_allocation_rules').insert({
    allocation_id: allocationId,
    destination_account_id: destinationAccountId,
    percentage,
    fixed_amount: fixedAmount,
    dimensions,
  }).select().single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { id: data.id, allocationId: data.allocation_id, destinationAccountId: data.destination_account_id, percentage: data.percentage == null ? null : Number(data.percentage), fixedAmount: data.fixed_amount == null ? null : Number(data.fixed_amount) } }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return err('VALIDATION', 'id is required', 400);
  const { error } = await supabaseAdmin().from('acct_allocation_rules').delete().eq('id', id);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { deleted: true } });
}
