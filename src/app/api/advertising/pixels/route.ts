import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/* Pixels (doc 22, Advertising → Pixels). The platform has no pixel
   table: a pixel DEFINITION is tenant configuration, so it lives in
   policy_settings (scope 'advertising', key 'pixel:<uuid>', value =
   JSON). Live stats (events 24h / 30d, last event, observed event
   types) come from the real ad_events stream keyed by tracking_id.
   Tracking ids observed in ad_events with no saved definition are
   returned as observed-only rows — nothing is invented. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

const SCOPE = 'advertising';
const KEY_PREFIX = 'pixel:';

interface PixelEventDef { name: string; kind: string; valueField?: string }
interface PixelDef {
  name: string;
  network: string;
  pixelId: string;
  install: string;
  status: string;
  events: PixelEventDef[];
}

interface PixelDto extends PixelDef {
  id: string;
  defined: boolean;
  events24: number;
  events30: number;
  lastEvent: string | null;
}

function parseDef(value: string): PixelDef | null {
  try {
    const v = JSON.parse(value) as Partial<PixelDef>;
    if (!v || typeof v.name !== 'string' || typeof v.pixelId !== 'string') return null;
    return {
      name: v.name,
      network: typeof v.network === 'string' ? v.network : 'Meta',
      pixelId: v.pixelId,
      install: typeof v.install === 'string' ? v.install : 'Script in <head>',
      status: typeof v.status === 'string' ? v.status : 'Live',
      events: Array.isArray(v.events) ? (v.events as PixelEventDef[]) : [],
    };
  } catch {
    return null;
  }
}

interface Stat { events24: number; events30: number; lastEvent: string | null; types: Set<string> }

async function eventStats(): Promise<Map<string, Stat>> {
  const sb = supabaseAdmin();
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const { data } = await sb
    .from('ad_events')
    .select('tracking_id, event_type, event_time')
    .gte('event_time', since)
    .order('event_time', { ascending: false })
    .limit(10000);
  const dayAgo = Date.now() - 86400000;
  const map = new Map<string, Stat>();
  for (const r of (data || []) as { tracking_id: string | null; event_type: string; event_time: string }[]) {
    if (!r.tracking_id) continue;
    const cur = map.get(r.tracking_id) || { events24: 0, events30: 0, lastEvent: null, types: new Set<string>() };
    cur.events30 += 1;
    if (new Date(r.event_time).getTime() >= dayAgo) cur.events24 += 1;
    if (!cur.lastEvent || r.event_time > cur.lastEvent) cur.lastEvent = r.event_time;
    if (r.event_type) cur.types.add(r.event_type);
    map.set(r.tracking_id, cur);
  }
  return map;
}

async function loadPixels(): Promise<PixelDto[]> {
  const sb = supabaseAdmin();
  const [{ data: defs }, stats] = await Promise.all([
    sb.from('policy_settings').select('key, value').eq('tenant_id', DEFAULT_TENANT_ID).eq('scope', SCOPE).like('key', `${KEY_PREFIX}%`),
    eventStats(),
  ]);
  const out: PixelDto[] = [];
  const definedIds = new Set<string>();
  for (const row of (defs || []) as { key: string; value: string }[]) {
    const def = parseDef(row.value);
    if (!def) continue;
    const id = row.key.slice(KEY_PREFIX.length);
    definedIds.add(def.pixelId);
    const st = stats.get(def.pixelId);
    out.push({
      id,
      defined: true,
      ...def,
      events24: st?.events24 ?? 0,
      events30: st?.events30 ?? 0,
      lastEvent: st?.lastEvent ?? null,
    });
  }
  for (const [trackingId, st] of stats) {
    if (definedIds.has(trackingId)) continue;
    out.push({
      id: `obs-${trackingId}`,
      defined: false,
      name: trackingId,
      network: 'Unknown',
      pixelId: trackingId,
      install: '—',
      status: st.events24 > 0 ? 'Live' : 'Paused',
      events: [...st.types].map((t) => ({ name: t, kind: 'observed' })),
      events24: st.events24,
      events30: st.events30,
      lastEvent: st.lastEvent,
    });
  }
  out.sort((a, b) => (b.lastEvent || '').localeCompare(a.lastEvent || ''));
  return out;
}

export async function GET() {
  try {
    return NextResponse.json({ data: await loadPixels() });
  } catch (e) {
    return err('INTERNAL', e instanceof Error ? e.message : String(e), 500);
  }
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as Partial<PixelDef> | null;
  if (!body?.name?.trim() || !body?.pixelId?.trim()) return err('VALIDATION', 'name and pixelId are required', 400);
  const def: PixelDef = {
    name: body.name.trim(),
    network: body.network || 'Meta',
    pixelId: body.pixelId.trim(),
    install: body.install || 'Script in <head>',
    status: body.status || 'Live',
    events: Array.isArray(body.events) ? body.events : [],
  };
  const id = crypto.randomUUID();
  const sb = supabaseAdmin();
  const { error } = await sb.from('policy_settings').insert({
    tenant_id: DEFAULT_TENANT_ID,
    scope: SCOPE,
    key: `${KEY_PREFIX}${id}`,
    value: JSON.stringify(def),
  });
  if (error) return err('INTERNAL', error.message, 500);
  const all = await loadPixels();
  return NextResponse.json({ data: all.find((p) => p.id === id) }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as (Partial<PixelDef> & { id?: string }) | null;
  if (!body?.id) return err('VALIDATION', 'id is required', 400);
  const sb = supabaseAdmin();
  const key = `${KEY_PREFIX}${body.id}`;
  const { data: existing } = await sb.from('policy_settings').select('value').eq('tenant_id', DEFAULT_TENANT_ID).eq('scope', SCOPE).eq('key', key).maybeSingle();
  if (!existing) return err('NOT_FOUND', 'Pixel definition not found', 404);
  const cur = parseDef((existing as { value: string }).value);
  if (!cur) return err('INTERNAL', 'Stored pixel definition is unreadable', 500);
  const next: PixelDef = {
    name: body.name?.trim() || cur.name,
    network: body.network || cur.network,
    pixelId: body.pixelId?.trim() || cur.pixelId,
    install: body.install || cur.install,
    status: body.status || cur.status,
    events: Array.isArray(body.events) ? body.events : cur.events,
  };
  const { error } = await sb.from('policy_settings').update({ value: JSON.stringify(next), updated_at: new Date().toISOString() }).eq('tenant_id', DEFAULT_TENANT_ID).eq('scope', SCOPE).eq('key', key);
  if (error) return err('INTERNAL', error.message, 500);
  const all = await loadPixels();
  return NextResponse.json({ data: all.find((p) => p.id === body.id) });
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return err('VALIDATION', 'id is required', 400);
  const sb = supabaseAdmin();
  const { error } = await sb.from('policy_settings').delete().eq('tenant_id', DEFAULT_TENANT_ID).eq('scope', SCOPE).eq('key', `${KEY_PREFIX}${id}`);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { id, deleted: true } });
}
