import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { toSlot } from '@/lib/cmsTypes';

/* Slots (doc 25) over cms_slots + cms_slot_items — placement slots
   control which content appears where on a page type. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function GET() {
  const sb = supabaseAdmin();
  const { data: slots, error } = await sb
    .from('cms_slots')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('slot_key', { ascending: true });
  if (error) return err('INTERNAL', error.message, 500);
  const slotRows = (slots || []) as Record<string, unknown>[];
  const ids = slotRows.map((s) => String(s.id));
  const itemsBySlot = new Map<string, Record<string, unknown>[]>();
  if (ids.length) {
    const { data: items } = await sb
      .from('cms_slot_items')
      .select('*')
      .in('slot_id', ids)
      .order('sort_order', { ascending: true })
      .limit(1000);
    for (const it of items || []) {
      const row = it as Record<string, unknown>;
      const key = String(row.slot_id);
      if (!itemsBySlot.has(key)) itemsBySlot.set(key, []);
      itemsBySlot.get(key)!.push(row);
    }
  }
  return NextResponse.json({
    data: slotRows.map((s) => ({ ...toSlot(s), items: itemsBySlot.get(String(s.id)) || [] })),
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const slotKey = typeof body.slotKey === 'string' ? body.slotKey.trim() : '';
  const pageType = typeof body.pageType === 'string' ? body.pageType.trim() : '';
  if (!slotKey || !pageType) return err('VALIDATION', 'slotKey and pageType are required', 400);
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('cms_slots')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      slot_key: slotKey,
      page_type: pageType,
      max_items: typeof body.maxItems === 'number' ? body.maxItems : null,
      description: typeof body.description === 'string' ? body.description : null,
    })
    .select('*')
    .single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { ...toSlot(data as Record<string, unknown>), items: [] } }, { status: 201 });
}
