import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/** Advance a run date by frequency × interval, clamping the day to the
 *  target month (Jan 31 + 1 month = Feb 28, never Mar 3). */
function advanceDate(dateStr: string, frequency: string, intervalN: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  const days = frequency === 'weekly' ? 7 : frequency === 'biweekly' ? 14 : 0;
  if (days > 0) {
    d.setUTCDate(d.getUTCDate() + days * intervalN);
    return d.toISOString().slice(0, 10);
  }
  const months = frequency === 'quarterly' ? 3 : frequency === 'annually' || frequency === 'yearly' ? 12 : 1;
  const totalMonths = months * intervalN;
  const targetMonth = d.getUTCMonth() + totalMonths;
  const targetYear = d.getUTCFullYear() + Math.floor(targetMonth / 12);
  const targetMonthIdx = ((targetMonth % 12) + 12) % 12;
  const daysInTarget = new Date(Date.UTC(targetYear, targetMonthIdx + 1, 0)).getUTCDate();
  const targetDay = Math.min(d.getUTCDate(), daysInTarget);
  return new Date(Date.UTC(targetYear, targetMonthIdx, targetDay)).toISOString().slice(0, 10);
}

/**
 * POST /api/recurring-journals/run — the recurring-journal runner.
 * For every ACTIVE template whose next_run_date is on or before asOf:
 * validates the template (≥2 lines, balanced, accounts exist), posts it
 * through acct_post_entry dated the run date, and advances next_run_date
 * by frequency × interval. A template past its end_date deactivates
 * instead of scheduling further.
 *
 * Idempotent: the journal posts under idempotency key
 * `recurring-journal:<template-id>:<run-date>`, and next_run_date only
 * advances after a successful post — re-running the same asOf never
 * double-posts. Unbalanced / unknown-account templates fail in place
 * (listed in `failed`) and are NOT advanced.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const asOf = String(body.asOf || '').slice(0, 10) || new Date().toISOString().slice(0, 10);
  const sb = supabaseAdmin();

  const { data: templates, error } = await sb
    .from('acct_recurring_journals')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('active', true)
    .lte('next_run_date', asOf)
    .order('next_run_date', { ascending: true });
  if (error) return err('INTERNAL', error.message, 500);

  const { data: entityId } = await sb.rpc('acct_default_entity', { p_tenant_id: DEFAULT_TENANT_ID });
  if (!entityId) return err('INTERNAL', 'No default entity for this tenant', 500);

  const posted: Record<string, unknown>[] = [];
  const failed: Record<string, unknown>[] = [];

  for (const t of ((templates ?? []) as Record<string, unknown>[])) {
    const id = String(t.id);
    const name = String(t.name || '');
    const tpl = t.template as Array<Record<string, unknown>> | null;
    if (!Array.isArray(tpl) || tpl.length < 2) {
      failed.push({ id, name, reason: 'Template needs at least two lines' });
      continue;
    }
    const lines = tpl.map((l) => ({
      account_id: String(l.accountId || l.account_id || ''),
      debit: Number(l.debit || 0),
      credit: Number(l.credit || 0),
      description: String(l.description || name),
    }));
    if (lines.some((l) => !l.account_id)) {
      failed.push({ id, name, reason: 'Template line is missing an account' });
      continue;
    }
    const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
    const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
    if (totalDebit <= 0 || Math.abs(totalDebit - totalCredit) > 0.005) {
      failed.push({ id, name, reason: `Template is out of balance (debits $${totalDebit.toFixed(2)} vs credits $${totalCredit.toFixed(2)})` });
      continue;
    }
    const accountIds = [...new Set(lines.map((l) => l.account_id))];
    const { data: accts } = await sb.from('acct_chart_of_accounts').select('id').in('id', accountIds);
    if ((accts ?? []).length !== accountIds.length) {
      failed.push({ id, name, reason: 'Template references an unknown account' });
      continue;
    }

    const runDate = String(t.next_run_date).slice(0, 10);
    const { data: journalId, error: postErr } = await sb.rpc('acct_post_entry', {
      p_tenant_id: DEFAULT_TENANT_ID,
      p_entity_id: entityId,
      p_entry_date: runDate,
      p_lines: lines,
      p_source: 'recurring',
      p_source_id: id,
      p_reference: name,
      p_memo: `Recurring journal ${name} — ${runDate}`,
      p_idempotency_key: `recurring-journal:${id}:${runDate}`,
      p_book_id: (t.book_id as string) || null,
      p_source_doc_type: 'recurring_journal',
      p_source_doc_id: id,
    });
    if (postErr || !journalId) {
      failed.push({ id, name, reason: postErr?.message || 'Journal post failed' });
      continue;
    }

    const nextDate = advanceDate(runDate, String(t.frequency || 'monthly'), Number(t.interval_n) || 1);
    const updates: Record<string, unknown> = {
      last_run_at: new Date().toISOString(),
      next_run_date: nextDate,
    };
    if (t.end_date && nextDate > String(t.end_date).slice(0, 10)) updates.active = false;
    await sb.from('acct_recurring_journals').update(updates).eq('id', id);
    posted.push({ id, name, runDate, journalId: String(journalId), nextRunDate: nextDate });
  }

  return NextResponse.json({
    data: { asOf, posted, failed, postedCount: posted.length, failedCount: failed.length },
  });
}
