import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * Book account mappings (Batch I). GET — source account → target
 * book / target account (used when a second book needs its own
 * account for the same posting). POST — create. DELETE ?id=.
 */
export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb.from('acct_book_account_mappings').select('*').eq('tenant_id', DEFAULT_TENANT_ID).order('source_account_id').limit(500);
  if (error) return err('INTERNAL', error.message, 500);
  const accountIds = [...new Set(((data ?? []) as { source_account_id: string | null; target_account_id: string | null }[]).flatMap((m) => [m.source_account_id, m.target_account_id]).filter(Boolean))] as string[];
  const bookIds = [...new Set(((data ?? []) as { target_book_id: string | null }[]).map((m) => m.target_book_id).filter(Boolean))] as string[];
  const [{ data: accounts }, { data: books }] = await Promise.all([
    accountIds.length ? sb.from('acct_chart_of_accounts').select('id, code, name').in('id', accountIds) : Promise.resolve({ data: [] }),
    bookIds.length ? sb.from('acct_books').select('id, name').in('id', bookIds) : Promise.resolve({ data: [] }),
  ]);
  const accountById = new Map(((accounts ?? []) as Record<string, unknown>[]).map((a) => [a.id, `${a.code} · ${a.name}`]));
  const bookById = new Map(((books ?? []) as Record<string, unknown>[]).map((b) => [b.id, b.name]));
  return NextResponse.json({
    data: ((data ?? []) as Record<string, unknown>[]).map((m) => ({
      id: m.id,
      sourceAccountId: m.source_account_id,
      sourceAccount: (accountById.get(m.source_account_id as string) as string) || '—',
      targetBookId: m.target_book_id,
      targetBook: (bookById.get(m.target_book_id as string) as string) || '—',
      targetAccountId: m.target_account_id,
      targetAccount: (accountById.get(m.target_account_id as string) as string) || '—',
    })),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const sourceAccountId = String(body.sourceAccountId || '');
  const targetBookId = String(body.targetBookId || '');
  const targetAccountId = String(body.targetAccountId || '');
  if (!sourceAccountId) return err('VALIDATION', 'sourceAccountId is required', 400);
  if (!targetBookId) return err('VALIDATION', 'targetBookId is required', 400);
  if (!targetAccountId) return err('VALIDATION', 'targetAccountId is required', 400);
  const sb = supabaseAdmin();
  const [{ data: source }, { data: target }, { data: book }] = await Promise.all([
    sb.from('acct_chart_of_accounts').select('id').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', sourceAccountId).single(),
    sb.from('acct_chart_of_accounts').select('id').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', targetAccountId).single(),
    sb.from('acct_books').select('id').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', targetBookId).single(),
  ]);
  if (!source) return err('VALIDATION', 'Unknown source account', 400);
  if (!target) return err('VALIDATION', 'Unknown target account', 400);
  if (!book) return err('VALIDATION', 'Unknown target book', 400);
  const { data, error } = await sb.from('acct_book_account_mappings').insert({
    tenant_id: DEFAULT_TENANT_ID,
    source_account_id: sourceAccountId,
    target_book_id: targetBookId,
    target_account_id: targetAccountId,
  }).select().single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { id: data.id, sourceAccountId: data.source_account_id, targetBookId: data.target_book_id, targetAccountId: data.target_account_id } }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return err('VALIDATION', 'id is required', 400);
  const { error } = await supabaseAdmin().from('acct_book_account_mappings').delete().eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { deleted: true } });
}
