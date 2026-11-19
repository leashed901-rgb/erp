import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { toPopup } from '@/lib/cmsTypes';

/** GET /api/v1/cms/popups — list popups. */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q');
  let query = supabaseAdmin()
    .from('cms_popups')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('created_at', { ascending: false })
    .limit(100);
  if (q) query = query.ilike('name', '%' + q + '%');
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  return NextResponse.json({ data: (data || []).map((r) => toPopup(r as Record<string, unknown>)) });
}

const FIELDS: Record<string, string> = {
  name: 'name', headline: 'headline', body: 'body', imageUrl: 'image_url',
  mobileImageUrl: 'mobile_image_url', ctaLabel: 'cta_label', ctaUrl: 'cta_url',
  collectEmail: 'collect_email', triggerType: 'trigger_type', triggerValue: 'trigger_value',
  frequency: 'frequency', isActive: 'is_active', startsAt: 'starts_at', endsAt: 'ends_at',
};

/** POST — create a popup record. */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Invalid JSON', requestId: crypto.randomUUID() } }, { status: 400 });
  }
  // Same camelCase -> snake_case mapping as the [id] PATCH (see banners).
  const insert: Record<string, unknown> = { tenant_id: DEFAULT_TENANT_ID };
  for (const [camel, col] of Object.entries(FIELDS)) {
    if (body[camel] !== undefined) insert[col] = body[camel];
  }
  if (Array.isArray(body.targetPages)) insert.target_pages = body.targetPages;
  if (typeof body.name !== 'string' || !body.name.trim()) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'name is required', requestId: crypto.randomUUID() } }, { status: 400 });
  }
  const { data, error } = await supabaseAdmin().from('cms_popups').insert(insert).select('*').single();
  if (error) return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  return NextResponse.json({ data: toPopup(data as Record<string, unknown>) }, { status: 201 });
}
