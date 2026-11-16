import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * GET /api/price-books/[id] — one book + its lines (Batch I).
 * PATCH — title / method / terms / scope / active. DELETE — removes
 * the lines first, then the book.
 */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = supabaseAdmin();
  const [{ data: book, error }, { data: lines }] = await Promise.all([
    sb.from('acct_price_books').select('*').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id).single(),
    sb.from('acct_price_book_lines').select('*').eq('price_book_id', id).order('sku'),
  ]);
  if (error || !book) return err('NOT_FOUND', 'Price book not found', 404);
  const productIds = [...new Set(((lines ?? []) as { catalog_product_id: string | null }[]).map((l) => l.catalog_product_id).filter(Boolean))] as string[];
  const { data: products } = productIds.length
    ? await sb.from('products').select('id, title').in('id', productIds)
    : { data: [] };
  const productById = new Map(((products ?? []) as Record<string, unknown>[]).map((p) => [p.id, p.title]));
  return NextResponse.json({
    data: {
      id: book.id,
      code: book.code,
      title: book.title,
      method: book.method,
      qualifyingTerms: book.qualifying_terms,
      catalogScope: book.catalog_scope,
      isActive: book.is_active,
      lines: ((lines ?? []) as Record<string, unknown>[]).map((l) => ({
        id: l.id,
        catalogProductId: l.catalog_product_id,
        product: (productById.get(l.catalog_product_id as string) as string) || null,
        sku: l.sku,
        channel: l.channel,
        basePrice: l.base_price == null ? null : Number(l.base_price),
        overridePrice: l.override_price == null ? null : Number(l.override_price),
      })),
    },
  });
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  if (body.title !== undefined) patch.title = String(body.title || '').trim();
  if (body.method !== undefined) patch.method = body.method ? String(body.method) : null;
  if (body.qualifyingTerms !== undefined) patch.qualifying_terms = body.qualifyingTerms ? String(body.qualifyingTerms) : null;
  if (body.catalogScope !== undefined) patch.catalog_scope = body.catalogScope ? String(body.catalogScope) : null;
  if (body.isActive !== undefined) patch.is_active = !!body.isActive;
  if (Object.keys(patch).length === 0) return err('VALIDATION', 'Nothing to update', 400);
  if (patch.title === '') return err('VALIDATION', 'title cannot be empty', 400);
  const { data, error } = await supabaseAdmin().from('acct_price_books').update(patch).eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id).select().single();
  if (error || !data) return err('NOT_FOUND', 'Price book not found', 404);
  return NextResponse.json({ data: { id: data.id, code: data.code, title: data.title, method: data.method, isActive: data.is_active } });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sb = supabaseAdmin();
  const { data: book } = await sb.from('acct_price_books').select('id').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id).single();
  if (!book) return err('NOT_FOUND', 'Price book not found', 404);
  await sb.from('acct_price_book_lines').delete().eq('price_book_id', id);
  const { error } = await sb.from('acct_price_books').delete().eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { deleted: true } });
}
