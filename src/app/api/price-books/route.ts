import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * GET /api/price-books — price books (Batch I). A price book is a
 * named set of product price overrides (code + title + method).
 * POST — create.
 */
export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb.from('acct_price_books').select('*').eq('tenant_id', DEFAULT_TENANT_ID).order('code');
  if (error) return err('INTERNAL', error.message, 500);
  const ids = ((data ?? []) as { id: string }[]).map((b) => b.id);
  const counts = new Map<string, number>();
  if (ids.length) {
    for (let i = 0; i < ids.length; i += 100) {
      const { data: lines } = await sb.from('acct_price_book_lines').select('price_book_id').in('price_book_id', ids.slice(i, i + 100));
      for (const l of (lines ?? []) as { price_book_id: string }[]) counts.set(l.price_book_id, (counts.get(l.price_book_id) || 0) + 1);
    }
  }
  return NextResponse.json({
    data: ((data ?? []) as Record<string, unknown>[]).map((b) => ({
      id: b.id,
      code: b.code,
      title: b.title,
      method: b.method,
      qualifyingTerms: b.qualifying_terms,
      catalogScope: b.catalog_scope,
      isActive: b.is_active,
      lineCount: counts.get(b.id as string) || 0,
    })),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const code = String(body.code || '').trim();
  const title = String(body.title || '').trim();
  if (!code) return err('VALIDATION', 'code is required', 400);
  if (!title) return err('VALIDATION', 'title is required', 400);
  const { data, error } = await supabaseAdmin().from('acct_price_books').insert({
    tenant_id: DEFAULT_TENANT_ID,
    code,
    title,
    method: body.method ? String(body.method) : null,
    qualifying_terms: body.qualifyingTerms ? String(body.qualifyingTerms) : null,
    catalog_scope: body.catalogScope ? String(body.catalogScope) : null,
    is_active: body.isActive !== false,
  }).select().single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { id: data.id, code: data.code, title: data.title, method: data.method, isActive: data.is_active, lineCount: 0 } }, { status: 201 });
}
