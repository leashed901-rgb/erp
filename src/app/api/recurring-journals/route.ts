import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

const FREQUENCIES = ['weekly', 'biweekly', 'monthly', 'quarterly', 'annually', 'yearly'];

/**
 * GET /api/recurring-journals — recurring journal templates (Batch I).
 * POST — create (book + name + frequency + first run date + template
 * jsonb; the template is an array of lines with account_id, debit
 * and credit, each one required). The runner lives at
 * POST /api/recurring-journals/run — it posts every due active
 * template through acct_post_entry and advances next_run_date.
 */
export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb.from('acct_recurring_journals').select('*').eq('tenant_id', DEFAULT_TENANT_ID).order('next_run_date', { ascending: true });
  if (error) return err('INTERNAL', error.message, 500);
  const bookIds = [...new Set(((data ?? []) as { book_id: string }[]).map((r) => r.book_id))] as string[];
  const { data: books } = bookIds.length
    ? await sb.from('acct_books').select('id, name').in('id', bookIds)
    : { data: [] };
  const bookById = new Map(((books ?? []) as Record<string, unknown>[]).map((b) => [b.id, b.name]));
  return NextResponse.json({
    data: ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      id: r.id,
      bookId: r.book_id,
      book: (bookById.get(r.book_id as string) as string) || '—',
      name: r.name,
      frequency: r.frequency,
      intervalN: r.interval_n,
      nextRunDate: r.next_run_date,
      active: r.active,
      template: r.template,
    })),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const bookId = String(body.bookId || '');
  const name = String(body.name || '').trim();
  const frequency = String(body.frequency || 'monthly');
  const nextRunDate = String(body.nextRunDate || '').slice(0, 10);
  const template = Array.isArray(body.template) ? body.template : [];
  if (!bookId) return err('VALIDATION', 'bookId is required', 400);
  if (!name) return err('VALIDATION', 'name is required', 400);
  if (!FREQUENCIES.includes(frequency)) return err('VALIDATION', `frequency must be one of ${FREQUENCIES.join(', ')}`, 400);
  if (!nextRunDate) return err('VALIDATION', 'nextRunDate is required', 400);
  if (template.length < 2) return err('VALIDATION', 'A journal template needs at least two lines', 400);
  const parsed = template.map((l: Record<string, unknown>) => ({
    account_id: String(l.accountId || l.account_id || ''),
    debit: Number(l.debit || 0),
    credit: Number(l.credit || 0),
    description: String(l.description || ''),
  }));
  if (parsed.some((l: { account_id: string }) => !l.account_id)) return err('VALIDATION', 'Every template line needs an account', 400);
  const debits = parsed.reduce((s: number, l: { debit: number }) => s + l.debit, 0);
  const credits = parsed.reduce((s: number, l: { credit: number }) => s + l.credit, 0);
  if (Math.abs(debits - credits) > 0.005) return err('VALIDATION', 'Template lines must balance (debits = credits)', 400);
  const sb = supabaseAdmin();
  const { data: book } = await sb.from('acct_books').select('id').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', bookId).single();
  if (!book) return err('VALIDATION', 'Unknown book', 400);
  const { data, error } = await sb.from('acct_recurring_journals').insert({
    tenant_id: DEFAULT_TENANT_ID,
    book_id: bookId,
    name,
    frequency,
    interval_n: Number(body.intervalN || 1),
    next_run_date: nextRunDate,
    template: parsed,
    active: body.active !== false,
  }).select().single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { id: data.id, name: data.name, frequency: data.frequency, nextRunDate: data.next_run_date, active: data.active } }, { status: 201 });
}
