import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/** GET /api/auto-reversals — scheduled journal reversals, newest first. */
export async function GET() {
  const { data, error } = await supabaseAdmin()
    .from('acct_auto_reversals')
    // Two FKs point at acct_journal_entries (journal + reversal), so the
    // embed must name the FK explicitly or PostgREST refuses it.
    .select('*,acct_journal_entries!acct_auto_reversals_journal_entry_id_fkey(entry_no)')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('reverse_on', { ascending: false })
    .limit(100);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({
    data: ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      id: r.id,
      journalEntryId: r.journal_entry_id,
      entryNo: (r.acct_journal_entries as { entry_no?: string } | null)?.entry_no ?? null,
      reverseOn: r.reverse_on,
      reversalJournalId: r.reversal_journal_id,
      status: r.status,
      error: r.error,
    })),
  });
}

/**
 * POST /api/auto-reversals — schedule a journal to reverse (Batch G).
 * Body: {journalEntryId | entryNo, reverseOn?}. reverseOn defaults to
 * the day after the entry's period ends (engine default). Rescheduling
 * the same entry updates its date instead of duplicating the row.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err('VALIDATION', 'Invalid JSON', 400);
  }
  let entryId = String(body.journalEntryId || '');
  if (!entryId && body.entryNo) {
    const { data: je } = await supabaseAdmin()
      .from('acct_journal_entries')
      .select('id')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('entry_no', String(body.entryNo))
      .maybeSingle();
    entryId = (je as { id?: string } | null)?.id ?? '';
  }
  if (!entryId) return err('VALIDATION', 'journalEntryId or entryNo is required', 400);
  const reverseOn = String(body.reverseOn || '');
  if (reverseOn && !/^\d{4}-\d{2}-\d{2}$/.test(reverseOn)) {
    return err('VALIDATION', 'reverseOn must be YYYY-MM-DD', 400);
  }
  const { data, error } = await supabaseAdmin().rpc('acct_schedule_auto_reversal', {
    p_journal_id: entryId,
    p_reverse_on: reverseOn || null,
  });
  if (error) return err('VALIDATION', error.message, 400);
  const { data: row, error: rowErr } = await supabaseAdmin()
    .from('acct_auto_reversals')
    .select('*,acct_journal_entries!acct_auto_reversals_journal_entry_id_fkey(entry_no)')
    .eq('id', data as string)
    .single();
  if (rowErr || !row) return err('INTERNAL', rowErr?.message ?? 'Could not read the scheduled reversal', 500);
  const r = row as Record<string, unknown>;
  return NextResponse.json({
    data: {
      id: r.id,
      journalEntryId: r.journal_entry_id,
      entryNo: (r.acct_journal_entries as { entry_no?: string } | null)?.entry_no ?? null,
      reverseOn: r.reverse_on,
      reversalJournalId: r.reversal_journal_id,
      status: r.status,
      error: r.error,
    },
  }, { status: 201 });
}
