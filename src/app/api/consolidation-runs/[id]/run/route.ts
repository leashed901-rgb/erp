import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * POST /api/consolidation-runs/[id]/run — the consolidation runner.
 *
 * Executes a draft consolidation run:
 * 1. Reads every member of the run's group whose effective range covers
 *    the period end, at its consolidation_percent.
 * 2. Takes each member's trial balance as of the period end
 *    (acct_trial_balance) and aggregates it per account, weighted by
 *    consolidation_percent. Each source account resolves through
 *    acct_book_account_mappings to the parent book's account — a
 *    member's accounts are its own, so without a mapping the line
 *    cannot post to the parent's books and the run fails naming the
 *    unmapped account. Multiple source accounts may map to one
 *    target account; their amounts combine.
 * 3. Posts ONLY the delta against the group's most recent posted run
 *    (its journal lines are re-read for the comparison) — so running the
 *    next period posts that period's movement, never the cumulative
 *    balance twice. A first run posts the full consolidated balance.
 * 4. The delta posts as one adjusting journal to the tenant's default
 *    (parent) entity, source 'consolidation', and the run flips to
 *    'posted' with the journal id.
 *
 * What the engine does NOT invent: fx_adjustment and elimination_amount
 * stay exactly as recorded on the run — they are judgment inputs (rates
 * and intercompany pairs), reported back in the result, never posted
 * as lines against an account the engine guessed. Re-running a
 * completed run returns 409 with the existing journal id.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = supabaseAdmin();

  const { data: run, error: runErr } = await sb
    .from('acct_consolidation_runs')
    .select('*')
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .single();
  if (runErr || !run) return err('NOT_FOUND', 'Consolidation run not found', 404);
  if (run.status === 'posted') {
    return err('CONFLICT', `Run already posted (journal ${run.journal_id || '—'})`, 409);
  }

  const [{ data: group }, { data: members }, { data: period }] = await Promise.all([
    sb.from('acct_consolidation_groups').select('*').eq('id', run.consolidation_group_id).eq('tenant_id', DEFAULT_TENANT_ID).single(),
    sb.from('acct_consolidation_members').select('*').eq('consolidation_group_id', run.consolidation_group_id),
    sb.from('acct_periods').select('*').eq('id', run.period_id).single(),
  ]);
  if (!group) return err('VALIDATION', 'Unknown consolidation group', 400);
  if (!period) return err('VALIDATION', 'Unknown period', 400);
  const activeMembers = ((members ?? []) as Record<string, unknown>[]).filter((m) => {
    const from = String(m.effective_from || '').slice(0, 10);
    const to = String(m.effective_to || '').slice(0, 10);
    const end = String(period.end_date).slice(0, 10);
    if (from && from > end) return false;
    if (to && to < end) return false;
    return true;
  });
  if (activeMembers.length === 0) return err('VALIDATION', 'Group has no members effective for this period', 400);

  const asOf = String(period.end_date).slice(0, 10);
  const { data: parentEntityId0 } = await sb.rpc('acct_default_entity', { p_tenant_id: DEFAULT_TENANT_ID });
  if (!parentEntityId0) return err('INTERNAL', 'No default entity for this tenant', 500);
  const parentEntityId = String(parentEntityId0);
  const { data: parentBook } = await sb
    .from('acct_books')
    .select('id')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('entity_id', parentEntityId)
    .eq('is_primary', true)
    .single();
  if (!parentBook) return err('INTERNAL', 'Parent entity has no primary book', 500);

  // Map every source account to the parent book's account.
  const { data: mappings } = await sb
    .from('acct_book_account_mappings')
    .select('source_account_id, target_account_id')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('target_book_id', String(parentBook.id));
  const targetOf = new Map<string, string>(
    ((mappings ?? []) as Record<string, unknown>[]).map((m) => [String(m.source_account_id), String(m.target_account_id)]),
  );
  const { data: targetAccounts } = await sb
    .from('acct_chart_of_accounts')
    .select('id, code, name')
    .in('id', [...new Set(targetOf.values())]);
  const targetInfo = new Map<string, { code: string; name: string }>(
    ((targetAccounts ?? []) as Record<string, unknown>[]).map((a) => [String(a.id), { code: String(a.code || ''), name: String(a.name || '') }]),
  );

  // Consolidated trial balance per account, weighted by percent.
  const consolidated = new Map<string, { code: string; name: string; net: number }>();
  const memberResults: Record<string, unknown>[] = [];
  for (const m of activeMembers) {
    const pct = Number(m.consolidation_percent ?? 100) / 100;
    const { data: tb, error: tbErr } = await sb.rpc('acct_trial_balance', {
      p_tenant: DEFAULT_TENANT_ID,
      p_as_of: asOf,
      p_entity: String(m.entity_id),
    });
    if (tbErr) return err('INTERNAL', `Trial balance failed for member ${m.entity_id}: ${tbErr.message}`, 500);
    let memberAccounts = 0;
    for (const row of ((tb ?? []) as Record<string, unknown>[])) {
      const net = (Number(row.debit || 0) - Number(row.credit || 0)) * pct;
      if (Math.abs(net) < 0.005) continue;
      memberAccounts += 1;
      const sourceId = String(row.account_id);
      const targetId = targetOf.get(sourceId);
      if (!targetId) {
        return err(
          'VALIDATION',
          `Account ${row.code || sourceId} (${row.name || ''}) has no mapping to the parent book — add a row in acct_book_account_mappings first`,
          400,
        );
      }
      const info = targetInfo.get(targetId) || { code: String(row.code || ''), name: String(row.name || '') };
      const prev = consolidated.get(targetId);
      if (prev) prev.net += net;
      else consolidated.set(targetId, { code: info.code, name: info.name, net });
    }
    memberResults.push({ entityId: String(m.entity_id), consolidationPercent: pct * 100, accounts: memberAccounts });
  }

  // Delta against the group's most recent posted run, so a second
  // period posts movement, not the cumulative balance again.
  const { data: prevRuns } = await sb
    .from('acct_consolidation_runs')
    .select('journal_id')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('consolidation_group_id', group.id)
    .eq('status', 'posted')
    .not('journal_id', 'is', null)
    .order('created_at', { ascending: false })
    .limit(1);
  const prevJournalId = (prevRuns?.[0] as Record<string, unknown> | undefined)?.journal_id as string | undefined;
  const prevNets = new Map<string, number>();
  if (prevJournalId) {
    const { data: prevLines } = await sb
      .from('acct_journal_lines')
      .select('account_id, debit, credit')
      .eq('journal_entry_id', prevJournalId);
    for (const l of ((prevLines ?? []) as Record<string, unknown>[])) {
      const key = String(l.account_id);
      prevNets.set(key, (prevNets.get(key) || 0) + (Number(l.debit || 0) - Number(l.credit || 0)));
    }
  }

  const lines: Record<string, unknown>[] = [];
  let totalDebit = 0;
  let totalCredit = 0;
  for (const [accountId, agg] of consolidated) {
    const delta = agg.net - (prevNets.get(accountId) || 0);
    if (Math.abs(delta) < 0.005) continue;
    if (delta > 0) {
      lines.push({ account_id: accountId, debit: Math.round(delta * 100) / 100, credit: 0, description: `Consolidated ${agg.code} ${agg.name}`.trim() });
      totalDebit += Math.round(delta * 100) / 100;
    } else {
      lines.push({ account_id: accountId, debit: 0, credit: Math.round(-delta * 100) / 100, description: `Consolidated ${agg.code} ${agg.name}`.trim() });
      totalCredit += Math.round(-delta * 100) / 100;
    }
  }
  // Rounding can leave a cent of imbalance; balance it on the largest line.
  const imbalance = Math.round((totalDebit - totalCredit) * 100) / 100;
  if (Math.abs(imbalance) >= 0.01 && lines.length > 0) {
    const biggest = lines.reduce((a, b) => (Number(a.debit || a.credit) >= Number(b.debit || b.credit) ? a : b));
    if (imbalance > 0) {
      biggest.credit = Math.round((Number(biggest.credit || 0) + imbalance) * 100) / 100;
      totalCredit = Math.round((totalCredit + imbalance) * 100) / 100;
    } else {
      biggest.debit = Math.round((Number(biggest.debit || 0) - imbalance) * 100) / 100;
      totalDebit = Math.round((totalDebit - imbalance) * 100) / 100;
    }
  }
  if (lines.length === 0) {
    // Nothing moved since the last run — complete the run with no journal.
    const { error: updErr } = await sb.from('acct_consolidation_runs').update({ status: 'posted' }).eq('id', id);
    if (updErr) return err('INTERNAL', `Run status update failed: ${updErr.message}`, 500);
    return NextResponse.json({
      data: {
        runId: id, groupId: group.id, periodId: period.id, journalId: null,
        accounts: 0, totalDebit: 0, totalCredit: 0, members: memberResults,
        fxAdjustment: run.fx_adjustment == null ? null : Number(run.fx_adjustment),
        eliminationAmount: run.elimination_amount == null ? null : Number(run.elimination_amount),
        note: 'No movement since the previous posted run — completed with no journal.',
      },
    });
  }

  const { data: journalId, error: postErr } = await sb.rpc('acct_post_entry', {
    p_tenant_id: DEFAULT_TENANT_ID,
    p_entity_id: parentEntityId,
    p_entry_date: asOf,
    p_lines: lines,
    p_source: 'consolidation',
    p_source_id: id,
    p_reference: `${group.code || 'CONS'} ${period.name || ''}`.trim(),
    p_memo: `Consolidation ${group.name || ''} — ${period.name || ''}`.trim(),
    p_idempotency_key: `consolidation-run:${id}`,
    p_period_id: period.id,
    p_currency: String(run.reporting_currency || 'USD'),
    p_is_adjusting: true,
    p_source_doc_type: 'consolidation_run',
    p_source_doc_id: id,
  });
  if (postErr || !journalId) return err('INTERNAL', postErr?.message || 'Consolidation journal failed to post', 500);

  const { error: updErr } = await sb.from('acct_consolidation_runs').update({ status: 'posted', journal_id: String(journalId) }).eq('id', id);
  if (updErr) return err('INTERNAL', `Run status update failed: ${updErr.message}`, 500);
  return NextResponse.json({
    data: {
      runId: id, groupId: group.id, periodId: period.id, journalId: String(journalId),
      accounts: lines.length, totalDebit, totalCredit, members: memberResults,
      fxAdjustment: run.fx_adjustment == null ? null : Number(run.fx_adjustment),
      eliminationAmount: run.elimination_amount == null ? null : Number(run.elimination_amount),
    },
  });
}
