import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/* Dashboards & widgets (Settings → Dashboards & widgets) over
   platform_dashboards + platform_dashboard_widgets (widget counts). */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

interface DashboardRow {
  id: string;
  name: string;
  module: string | null;
  is_default: boolean;
  is_shared: boolean;
  updated_at: string;
}

function dto(r: DashboardRow, widgets: number) {
  return {
    id: r.id,
    name: r.name,
    module: r.module || '—',
    isDefault: !!r.is_default,
    isShared: !!r.is_shared,
    widgets,
    updatedAt: r.updated_at,
  };
}

async function listDashboards() {
  const sb = supabaseAdmin();
  const [{ data: dashboards }, { data: widgets }] = await Promise.all([
    sb.from('platform_dashboards').select('id, name, module, is_default, is_shared, updated_at').eq('tenant_id', DEFAULT_TENANT_ID).order('name'),
    sb.from('platform_dashboard_widgets').select('dashboard_id').eq('tenant_id', DEFAULT_TENANT_ID),
  ]);
  const counts = new Map<string, number>();
  for (const w of (widgets || []) as { dashboard_id: string }[]) counts.set(w.dashboard_id, (counts.get(w.dashboard_id) || 0) + 1);
  return ((dashboards || []) as DashboardRow[]).map((d) => dto(d, counts.get(d.id) || 0));
}

export async function GET() {
  try {
    return NextResponse.json({ data: await listDashboards() });
  } catch (e) {
    return err('INTERNAL', e instanceof Error ? e.message : String(e), 500);
  }
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { name?: string; module?: string; isDefault?: boolean; isShared?: boolean } | null;
  if (!body?.name?.trim()) return err('VALIDATION', 'name is required', 400);
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('platform_dashboards')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      name: body.name.trim(),
      module: body.module || null,
      is_default: !!body.isDefault,
      is_shared: !!body.isShared,
      layout: {},
    })
    .select('id, name, module, is_default, is_shared, updated_at')
    .single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: dto(data as DashboardRow, 0) }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return err('VALIDATION', 'id is required', 400);
  const sb = supabaseAdmin();
  const { error } = await sb.from('platform_dashboards').delete().eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { id, deleted: true } });
}
