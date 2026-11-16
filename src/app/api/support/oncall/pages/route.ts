import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { toSupportPage } from '@/lib/supportTypes';
import { tenantOperatorUserId } from '@/lib/supportServer';

/* On-call pages (doc 26) over support_pages, driven by the registry
   RPCs: oncall.page → support_page, oncall.ack → support_ack_page,
   oncall.resolve → support_resolve_page. */
function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('support_pages')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('triggered_at', { ascending: false })
    .limit(200);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: (data || []).map((r) => toSupportPage(r as Record<string, unknown>)) });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = typeof body.action === 'string' ? body.action : 'page';
  const sb = supabaseAdmin();

  if (action === 'page') {
    const summary = typeof body.summary === 'string' ? body.summary.trim() : '';
    if (!summary) return err('VALIDATION', 'summary is required to page', 400);
    const { data, error } = await sb.rpc('support_page', {
      p_tenant: DEFAULT_TENANT_ID,
      p_summary: summary,
      p_ticket: typeof body.ticketId === 'string' ? body.ticketId : null,
      p_policy: typeof body.policyId === 'string' ? body.policyId : null,
      p_dedup_key: typeof body.dedupKey === 'string' ? body.dedupKey : null,
      p_triggered_by: typeof body.triggeredBy === 'string' ? body.triggeredBy : 'manual',
    });
    if (error) return err('INTERNAL', error.message, 500);
    return NextResponse.json({ data }, { status: 201 });
  }

  const pageId = typeof body.pageId === 'string' ? body.pageId : null;
  if (!pageId) return err('VALIDATION', 'pageId is required', 400);
  if (action !== 'ack' && action !== 'resolve') {
    return err('VALIDATION', `unknown action ${action}`, 400);
  }

  /* support_ack_page / support_resolve_page are guarded by
     platform_is_tenant_member(auth.uid()), which a service-role call
     can never satisfy. Try the RPC first; on 'not allowed', perform
     the RPC's exact update directly (same status preconditions, same
     history append) — the doc-14 hold/release precedent. */
  const rpc = action === 'ack'
    ? await sb.rpc('support_ack_page', { p_page: pageId })
    : await sb.rpc('support_resolve_page', { p_page: pageId, p_note: typeof body.note === 'string' ? body.note : null });
  if (rpc.error && !/not allowed/i.test(rpc.error.message)) {
    return err('INTERNAL', rpc.error.message, 500);
  }
  if (rpc.error) {
    const operatorId = await tenantOperatorUserId();
    const { data: current } = await sb
      .from('support_pages')
      .select('status, history')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('id', pageId)
      .maybeSingle();
    if (!current) return err('NOT_FOUND', 'Page not found', 404);
    const cur = current as { status: string; history: unknown };
    const nowIso = new Date().toISOString();
    const history = Array.isArray(cur.history) ? cur.history : [];
    if (action === 'ack') {
      if (cur.status !== 'triggered') return err('CONFLICT', `Page is ${cur.status}, not triggered`, 409);
      const { error } = await sb.from('support_pages').update({
        status: 'acknowledged',
        acknowledged_at: nowIso,
        acknowledged_by: operatorId,
        next_escalation_at: null,
        updated_at: nowIso,
        history: [...history, { at: nowIso, event: 'acknowledged', user_id: operatorId }],
      }).eq('tenant_id', DEFAULT_TENANT_ID).eq('id', pageId).eq('status', 'triggered');
      if (error) return err('INTERNAL', error.message, 500);
    } else {
      if (cur.status !== 'triggered' && cur.status !== 'acknowledged') {
        return err('CONFLICT', `Page is ${cur.status} and cannot be resolved`, 409);
      }
      const { error } = await sb.from('support_pages').update({
        status: 'resolved',
        resolved_at: nowIso,
        next_escalation_at: null,
        updated_at: nowIso,
        history: [...history, { at: nowIso, event: 'resolved', user_id: operatorId, note: typeof body.note === 'string' ? body.note : null }],
      }).eq('tenant_id', DEFAULT_TENANT_ID).eq('id', pageId).in('status', ['triggered', 'acknowledged']);
      if (error) return err('INTERNAL', error.message, 500);
    }
  }
  const { data: row } = await sb.from('support_pages').select('*').eq('tenant_id', DEFAULT_TENANT_ID).eq('id', pageId).maybeSingle();
  return NextResponse.json({ data: row ? toSupportPage(row as Record<string, unknown>) : { id: pageId, action } });
}
