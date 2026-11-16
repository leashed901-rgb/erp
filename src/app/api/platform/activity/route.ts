import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

export const dynamic = 'force-dynamic';

/**
 * GET /api/platform/activity?table=<table>&id=<uuid> — the per-record
 * activity timeline (SHIP-IT step 4): platform_audit_events rows for
 * exactly this record, newest first. One reader used by every drawer
 * and document page. Records the accounting trail never touched
 * return an honest empty list.
 */
export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const table = url.searchParams.get('table') || '';
  const id = url.searchParams.get('id') || '';
  if (!table || !id) {
    return NextResponse.json({ data: [] });
  }
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('platform_audit_events')
    .select('id, occurred_at, actor_label, action, summary')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('object_table', table)
    .eq('object_ref', id)
    .order('occurred_at', { ascending: false })
    .limit(30);
  if (error) {
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } },
      { status: 500 },
    );
  }
  const pretty = table.replace(/^(acct_|crm_|erp_|platform_|commerce_|support_|social_|cms_|ad_)/, '').replace(/_/g, ' ');
  return NextResponse.json({
    data: (data || []).map((r) => {
      const action = String(r.action || '').toUpperCase();
      return {
        id: r.id,
        who: r.actor_label || 'System',
        what: r.summary || `${action.charAt(0)}${action.slice(1).toLowerCase()} — ${pretty}`,
        kind: action === 'INSERT' ? 'insert' : action === 'UPDATE' ? 'update' : action === 'DELETE' ? 'delete' : 'other',
        when: r.occurred_at,
      };
    }),
  });
}
