import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/* KPI targets (Settings → KPI targets; consumed by the Executive
   dashboard's "vs Plan" compare) over platform_kpi_targets. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

interface KpiTargetRow {
  id: string;
  metric_code: string;
  period_type: string;
  period_start: string;
  target_value: number;
  notes: string | null;
}

function dto(r: KpiTargetRow) {
  return {
    id: r.id,
    metricCode: r.metric_code,
    periodType: r.period_type,
    periodStart: r.period_start,
    targetValue: Number(r.target_value) || 0,
    notes: r.notes || '',
  };
}

export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('platform_kpi_targets')
    .select('id, metric_code, period_type, period_start, target_value, notes')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('period_start', { ascending: false })
    .limit(300);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: (data || []).map((r) => dto(r as KpiTargetRow)) });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { metricCode?: string; periodType?: string; periodStart?: string; targetValue?: number; notes?: string } | null;
  if (!body?.metricCode?.trim() || !body?.periodType?.trim() || !body?.periodStart || typeof body.targetValue !== 'number') {
    return err('VALIDATION', 'metricCode, periodType, periodStart and a numeric targetValue are required', 400);
  }
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('platform_kpi_targets')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      metric_code: body.metricCode.trim(),
      period_type: body.periodType.trim(),
      period_start: body.periodStart,
      target_value: body.targetValue,
      notes: body.notes || null,
    })
    .select('id, metric_code, period_type, period_start, target_value, notes')
    .single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: dto(data as KpiTargetRow) }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return err('VALIDATION', 'id is required', 400);
  const sb = supabaseAdmin();
  const { error } = await sb.from('platform_kpi_targets').delete().eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { id, deleted: true } });
}
