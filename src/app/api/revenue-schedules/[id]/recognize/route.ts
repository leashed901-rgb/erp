import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * POST /api/revenue-schedules/[id]/recognize — recognize one contract
 * schedule row (Batch H). The engine has no runner for contract
 * schedules, so the route posts what the flow requires with the
 * existing posting primitive: Dr deferred revenue / Cr revenue for
 * the unrecognized amount, using the obligation's own accounts. The
 * row's recognized_amount advances and the journal id is recorded.
 */
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => ({}));
  const amount = body.amount != null ? Number(body.amount) : null;
  const { data: row, error } = await supabaseAdmin().from('acct_revenue_recognition_schedules').select('*').eq('id', id).single();
  if (error || !row) return err('NOT_FOUND', 'Recognition schedule row not found', 404);
  const s = row as Record<string, unknown>;
  const scheduled = Number(s.scheduled_amount || 0);
  const recognized = Number(s.recognized_amount || 0);
  const remaining = Math.round((scheduled - recognized) * 100) / 100;
  if (remaining <= 0) return err('VALIDATION', 'This row is already fully recognized', 400);
  const amt = amount == null ? remaining : amount;
  if (!Number.isFinite(amt) || amt <= 0 || amt > remaining) {
    return err('VALIDATION', `Amount must be greater than zero and no more than the remaining ${remaining}`, 400);
  }
  const { data: ob, error: obErr } = await supabaseAdmin().from('acct_revenue_performance_obligations').select('*').eq('id', s.obligation_id as string).single();
  if (obErr || !ob) return err('INTERNAL', 'Obligation not found for this schedule row', 500);
  const o = ob as Record<string, unknown>;
  if (!o.deferred_revenue_account_id || !o.revenue_account_id) {
    return err('VALIDATION', 'The obligation needs a deferred-revenue account and a revenue account before it can be recognized', 400);
  }
  const { data: contract } = await supabaseAdmin().from('acct_revenue_contracts').select('entity_id, contract_number').eq('id', o.contract_id as string).single();
  const c = (contract ?? {}) as Record<string, unknown>;
  const date = String(body.asOf || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
  const { data: je, error: jeErr } = await supabaseAdmin().rpc('acct_post_entry', {
    p_tenant_id: DEFAULT_TENANT_ID,
    p_entity_id: c.entity_id,
    p_entry_date: date,
    p_lines: [
      { account_id: o.deferred_revenue_account_id, debit: amt, description: `Recognize ${o.obligation_code} — ${c.contract_number}` },
      { account_id: o.revenue_account_id, credit: amt, description: `Recognize ${o.obligation_code} — ${c.contract_number}` },
    ],
    p_source: 'revenue_recognition',
    p_reference: String(c.contract_number || ''),
    p_memo: `Recognize ${o.obligation_code} — ${c.contract_number}`,
    p_idempotency_key: `rev-recog-${id}-${date}-${amt}`,
    p_source_doc_type: 'revenue_contract',
    p_source_doc_id: o.contract_id,
  });
  if (jeErr) return err('RPC_FAILED', jeErr.message, 400);
  const newRecognized = Math.round((recognized + amt) * 100) / 100;
  const { error: updErr } = await supabaseAdmin().from('acct_revenue_recognition_schedules').update({
    recognized_amount: newRecognized,
    journal_id: je,
    status: newRecognized >= scheduled ? 'recognized' : 'partial',
  }).eq('id', id);
  if (updErr) return err('DB_ERROR', updErr.message, 400);
  return NextResponse.json({ data: { journalId: je, recognizedAmount: newRecognized, remaining: Math.round((scheduled - newRecognized) * 100) / 100 } });
}
