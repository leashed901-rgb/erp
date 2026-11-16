import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * Price book lines (Batch I). GET ?priceBookId= — lines for a book.
 * POST — add a line (sku or catalog product + base or override
 * price). DELETE ?id= — remove a line.
 */
export async function GET(req: NextRequest) {
  const priceBookId = new URL(req.url).searchParams.get('priceBookId');
  if (!priceBookId) return err('VALIDATION', 'priceBookId is required', 400);
  const { data, error } = await supabaseAdmin().from('acct_price_book_lines').select('*').eq('price_book_id', priceBookId).order('sku');
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({
    data: ((data ?? []) as Record<string, unknown>[]).map((l) => ({
      id: l.id,
      priceBookId: l.price_book_id,
      catalogProductId: l.catalog_product_id,
      sku: l.sku,
      channel: l.channel,
      basePrice: l.base_price == null ? null : Number(l.base_price),
      overridePrice: l.override_price == null ? null : Number(l.override_price),
    })),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const priceBookId = String(body.priceBookId || '');
  const sku = body.sku ? String(body.sku) : null;
  const catalogProductId = body.catalogProductId ? String(body.catalogProductId) : null;
  const basePrice = body.basePrice == null ? null : Number(body.basePrice);
  const overridePrice = body.overridePrice == null ? null : Number(body.overridePrice);
  if (!priceBookId) return err('VALIDATION', 'priceBookId is required', 400);
  if (!sku && !catalogProductId) return err('VALIDATION', 'sku or catalogProductId is required', 400);
  if (basePrice != null && !Number.isFinite(basePrice)) return err('VALIDATION', 'basePrice must be a number', 400);
  if (overridePrice != null && !Number.isFinite(overridePrice)) return err('VALIDATION', 'overridePrice must be a number', 400);
  const sb = supabaseAdmin();
  const { data: book } = await sb.from('acct_price_books').select('id').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', priceBookId).single();
  if (!book) return err('VALIDATION', 'Unknown price book', 400);
  if (catalogProductId) {
    const { data: product } = await sb.from('products').select('id').eq('id', catalogProductId).single();
    if (!product) return err('VALIDATION', 'Unknown catalog product', 400);
  }
  const { data, error } = await sb.from('acct_price_book_lines').insert({
    tenant_id: DEFAULT_TENANT_ID,
    price_book_id: priceBookId,
    catalog_product_id: catalogProductId,
    sku,
    channel: body.channel ? String(body.channel) : null,
    base_price: basePrice,
    override_price: overridePrice,
  }).select().single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { id: data.id, priceBookId: data.price_book_id, sku: data.sku, channel: data.channel, basePrice: data.base_price == null ? null : Number(data.base_price), overridePrice: data.override_price == null ? null : Number(data.override_price) } }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return err('VALIDATION', 'id is required', 400);
  const { error } = await supabaseAdmin().from('acct_price_book_lines').delete().eq('id', id);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { deleted: true } });
}
