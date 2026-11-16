import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function fail(code: string, message: string, status: number) {
  return NextResponse.json(
    { error: { code, message, requestId: crypto.randomUUID() } },
    { status },
  );
}

/**
 * PATCH /api/crm/routes/[id]/stops/[stopId] — stop actions from the
 * Route Builder template:
 *   { action: 'up' | 'down' }  swap sequence with the neighbor
 *   { action: 'arrive' }       arrived_at = now, status 'arrived'
 *   { action: 'complete' }     completed_at = now, status 'completed'
 *   { action: 'prioritize' }   move to the front of the route
 * DELETE removes the stop and renumbers the rest.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; stopId: string }> }) {
  const { id, stopId } = await params;
  const body = await req.json().catch(() => null) as Record<string, unknown> | null;
  const action = body?.action ? String(body.action) : '';
  if (!['up', 'down', 'arrive', 'complete', 'prioritize'].includes(action)) {
    return fail('VALIDATION', 'action must be up, down, arrive, complete or prioritize', 400);
  }
  const sb = supabaseAdmin();
  const { data: stops, error } = await sb
    .from('crm_route_stops')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('route_id', id)
    .order('seq', { ascending: true });
  if (error) return fail('INTERNAL', error.message, 500);
  const rows = stops || [];
  const idx = rows.findIndex(s => s.id === stopId);
  if (idx < 0) return fail('NOT_FOUND', 'Stop not found', 404);
  const stop = rows[idx];

  if (action === 'arrive' || action === 'complete') {
    const updates = action === 'arrive'
      ? { arrived_at: new Date().toISOString(), status: 'arrived' }
      : { completed_at: new Date().toISOString(), status: 'completed' };
    const { data, error: updateError } = await sb
      .from('crm_route_stops')
      .update(updates)
      .eq('id', stopId)
      .select('*')
      .single();
    if (updateError) return fail('INTERNAL', updateError.message, 500);
    return NextResponse.json({ data });
  }

  // Reorder: build the new order, then write seq 1..n.
  const order = rows.map(s => s.id);
  if (action === 'up' && idx > 0) {
    [order[idx - 1], order[idx]] = [order[idx], order[idx - 1]];
  } else if (action === 'down' && idx < rows.length - 1) {
    [order[idx + 1], order[idx]] = [order[idx], order[idx + 1]];
  } else if (action === 'prioritize' && idx > 0) {
    order.splice(idx, 1);
    order.unshift(stopId);
  }
  // Two-phase: a unique (route_id, seq) constraint makes direct
  // swaps collide, so park every stop at seq+1000 first.
  for (let i = 0; i < order.length; i++) {
    await sb.from('crm_route_stops').update({ seq: 1000 + i }).eq('id', order[i]);
  }
  for (let i = 0; i < order.length; i++) {
    await sb.from('crm_route_stops').update({ seq: i + 1 }).eq('id', order[i]);
  }
  const { data: fresh } = await sb.from('crm_route_stops').select('*').eq('id', stopId).single();
  return NextResponse.json({ data: fresh });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; stopId: string }> }) {
  const { id, stopId } = await params;
  const sb = supabaseAdmin();
  const { error } = await sb
    .from('crm_route_stops')
    .delete()
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('route_id', id)
    .eq('id', stopId);
  if (error) return fail('INTERNAL', error.message, 500);
  const { data: stops } = await sb
    .from('crm_route_stops')
    .select('id')
    .eq('route_id', id)
    .order('seq', { ascending: true });
  for (let i = 0; i < (stops || []).length; i++) {
    await sb.from('crm_route_stops').update({ seq: 1000 + i }).eq('id', stops![i].id);
  }
  for (let i = 0; i < (stops || []).length; i++) {
    await sb.from('crm_route_stops').update({ seq: i + 1 }).eq('id', stops![i].id);
  }
  return NextResponse.json({ data: { id: stopId, deleted: true } });
}
