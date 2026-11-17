import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * POST /api/products/[id]/publish — publish / unpublish (doc 18, registry
 * `product.publish` → `app_publish_product`). Body: { publish?: boolean }
 * (default true). Publishing requires at least one active, priced variant —
 * the RPC enforces it and the error is surfaced. The list screen used to
 * PATCH status directly, bypassing that guard.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown> = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const publish = body.publish !== false;
  const { data: result, error } = await supabaseAdmin().rpc('app_publish_product', {
    p_product_id: id,
    p_publish: publish,
  });
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { id, status: result } });
}
