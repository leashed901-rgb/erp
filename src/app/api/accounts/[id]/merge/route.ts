import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/** POST /api/accounts/[id]/merge — merge this account into another.
 *  Both accounts must be the same class (P&L vs balance sheet) — the
 *  same rule the CoA trigger enforces for parents.
 *
 *  Journal lines move by reclass, because posted journal lines are
 *  immutable in this DB (trigger): each posted entry touching the
 *  source is reversed and re-posted with the source account swapped
 *  for the target, so history stays intact and balances move. Draft
 *  lines re-point directly. Non-journal references (bank-transaction
 *  categories, vendor AP/default-expense accounts, bank-account GL
 *  links, rule splits) re-point directly. The source is then
 *  deactivated. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return err('VALIDATION', 'Invalid JSON', 400);
  }
  const intoId = body.into_account_id as string | undefined;
  if (!intoId) return err('VALIDATION', 'into_account_id is required', 400);
  if (intoId === id) return err('VALIDATION', 'Cannot merge an account into itself', 400);

  const sb = supabaseAdmin();
  const { data: rows } = await sb
    .from('acct_chart_of_accounts')
    .select('id, code, name, account_type, is_system')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .in('id', [id, intoId]);
  const source = (rows || []).find((r) => r.id === id);
  const target = (rows || []).find((r) => r.id === intoId);
  if (!source) return err('NOT_FOUND', 'Source account not found', 404);
  if (!target) return err('NOT_FOUND', 'Target account not found', 404);
  if (source.is_system) return err('VALIDATION', `System account ${source.code} cannot be merged away`, 400);
  const isPL = (t: string) => t === 'revenue' || t === 'expense';
  if (isPL(source.account_type) !== isPL(target.account_type)) {
    return err('VALIDATION', `Cannot merge ${source.code} (${source.account_type}) into ${target.code} (${target.account_type}) — balance-sheet and P&L accounts cannot mix`, 400);
  }

  const moved: Record<string, number> = {};
  try {
    // ── Journal lines ──
    const { data: srcLines } = await sb
      .from('acct_journal_lines')
      .select('id, journal_entry_id')
      .eq('account_id', id)
      .eq('tenant_id', DEFAULT_TENANT_ID);
    const entryIds = [...new Set((srcLines || []).map((l) => l.journal_entry_id))];
    let reclassedEntries = 0;
    let draftLines = 0;
    let skippedEntries = 0;
    if (entryIds.length > 0) {
      const { data: entries } = await sb
        .from('acct_journal_entries')
        .select('id, entry_no, posting_date, status, reversal_of_id, reversed_by_id, entity_id')
        .in('id', entryIds);
      for (const entry of entries || []) {
        if (entry.status === 'posted' && !entry.reversed_by_id && !entry.reversal_of_id) {
          const { error: revErr } = await sb.rpc('acct_reverse_journal', {
            p_journal_id: entry.id,
            p_reversal_date: entry.posting_date,
            p_memo: `Merge ${source.code} into ${target.code}`,
          });
          if (revErr) throw new Error(`Could not reverse entry #${entry.entry_no}: ${revErr.message}`);
          const { data: allLines } = await sb
            .from('acct_journal_lines')
            .select('account_id, debit, credit, description')
            .eq('journal_entry_id', entry.id);
          const newLines = (allLines || []).map((l) => ({
            account_id: l.account_id === id ? intoId : l.account_id,
            debit: Number(l.debit || 0),
            credit: Number(l.credit || 0),
            description: l.description,
          }));
          const { error: postErr } = await sb.rpc('acct_post_entry', {
            p_tenant_id: DEFAULT_TENANT_ID,
            p_entity_id: entry.entity_id,
            p_entry_date: entry.posting_date,
            p_lines: newLines,
            // 'merge' is not in the acct_source_type enum — 'manual'
            // with the merge in the reference/memo is the honest source.
            p_source: 'manual',
            p_reference: `Merge ${source.code}→${target.code} #${entry.entry_no}`,
            p_memo: `Reclass from merge of ${source.code} ${source.name} into ${target.code} ${target.name}`,
          });
          if (postErr) throw new Error(`Could not re-post entry #${entry.entry_no}: ${postErr.message}`);
          reclassedEntries++;
        } else if (entry.status === 'draft') {
          const { data, error } = await sb
            .from('acct_journal_lines')
            .update({ account_id: intoId })
            .eq('journal_entry_id', entry.id)
            .eq('account_id', id)
            .select('id');
          if (error) throw new Error(`Could not re-point draft entry #${entry.entry_no}: ${error.message}`);
          draftLines += (data || []).length;
        } else {
          // Already reversed, or is itself a reversal — history stays.
          skippedEntries++;
        }
      }
    }
    moved.journal_entries_reclassed = reclassedEntries;
    moved.journal_lines_draft = draftLines;
    moved.journal_entries_skipped = skippedEntries;

    // ── Non-journal references (direct re-point) ──
    const repoint = async (table: string, col: string) => {
      const { data, error } = await sb
        .from(table)
        .update({ [col]: intoId })
        .eq(col, id)
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .select('id');
      if (error) throw new Error(`${table}.${col}: ${error.message}`);
      moved[`${table}.${col}`] = (data || []).length;
    };
    await repoint('acct_bank_transactions', 'category_account_id');
    await repoint('acct_vendors', 'ap_account_id');
    await repoint('acct_vendors', 'default_expense_account_id');
    await repoint('acct_bank_accounts', 'gl_account_id');
    await repoint('acct_bank_rule_splits', 'account_id');
  } catch (e) {
    return err('INTERNAL', (e as Error).message, 500);
  }

  await sb
    .from('acct_chart_of_accounts')
    .update({ is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID);

  return NextResponse.json({
    data: { source_id: id, target_id: intoId, moved },
    meta: { moved },
    message: `${source.code} ${source.name} merged into ${target.code} ${target.name}`,
  });
}
