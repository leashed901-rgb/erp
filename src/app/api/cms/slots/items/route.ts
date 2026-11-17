import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const slotId = typeof body.slotId === 'string' ? body.slotId : null;
  const itemType = typeof body.itemType === 'string' ? body.itemType : null;
  if (!slotId || !itemType) return err('VALIDATION', 'slotId and itemType are required', 400);
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('cms_slot_items')
    .insert({
      slot_id: slotId,
      item_type: itemType,
      headline: typeof body.headline === 'string' ? body.headline : null,
      body: typeof body.body === 'string' ? body.body : null,
      image_url: typeof body.imageUrl === 'string' ? body.imageUrl : null,
      cta_label: typeof body.ctaLabel === 'string' ? body.ctaLabel : null,
      cta_url: typeof body.ctaUrl === 'string' ? body.ctaUrl : null,
      promo_code: typeof body.promoCode === 'string' ? body.promoCode : null,
      sort_order: typeof body.sortOrder === 'number' ? body.sortOrder : 0,
      status: typeof body.status === 'string' ? body.status : 'published',
    })
    .select('*')
    .single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return err('VALIDATION', 'id query param required', 400);
  const sb = supabaseAdmin();
  const { error } = await sb.from('cms_slot_items').delete().eq('id', id);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { id, deleted: true } });
}
