import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/* Saved report views persist as acct_report_snapshots under one
   find-or-created acct_report_packages row named 'Saved views';
   the view's configuration (report id, range, columns, filters,
   visual options) lives in the snapshot's contents jsonb. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

async function savedViewsPackageId(sb: ReturnType<typeof supabaseAdmin>): Promise<string> {
  const { data: existing } = await sb
    .from('acct_report_packages')
    .select('id')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('name', 'Saved views')
    .limit(1);
  if (existing && existing.length) return String((existing[0] as { id: string }).id);
  const { data, error } = await sb
    .from('acct_report_packages')
    .insert({ tenant_id: DEFAULT_TENANT_ID, name: 'Saved views' })
    .select('id')
    .single();
  if (error) throw new Error(error.message);
  return String((data as { id: string }).id);
}

export async function GET() {
  const sb = supabaseAdmin();
  const { data: pkgs } = await sb
    .from('acct_report_packages')
    .select('id')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('name', 'Saved views')
    .limit(1);
  if (!pkgs || !pkgs.length) return NextResponse.json({ data: [] });
  const packageId = String((pkgs[0] as { id: string }).id);
  const { data, error } = await sb
    .from('acct_report_snapshots')
    .select('id, title, period_start, period_end, contents, published_at')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('package_id', packageId)
    .order('published_at', { ascending: false });
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({
    data: ((data || []) as Record<string, unknown>[]).map((s) => ({
      id: String(s.id),
      name: String(s.title || ''),
      from: String(s.period_start || ''),
      to: String(s.period_end || ''),
      config: (s.contents as Record<string, unknown>) || {},
      savedAt: String(s.published_at || ''),
    })),
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const config = (body.config && typeof body.config === 'object' ? body.config : {}) as Record<string, unknown>;
  const from = typeof body.from === 'string' ? body.from : '';
  const to = typeof body.to === 'string' ? body.to : '';
  if (!name) return err('VALIDATION', 'name is required', 400);
  if (!from || !to) return err('VALIDATION', 'from and to are required', 400);
  const sb = supabaseAdmin();
  let packageId: string;
  try {
    packageId = await savedViewsPackageId(sb);
  } catch (e) {
    return err('INTERNAL', e instanceof Error ? e.message : 'Package resolution failed', 500);
  }
  const { data, error } = await sb
    .from('acct_report_snapshots')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      package_id: packageId,
      title: name,
      period_start: from,
      period_end: to,
      contents: config,
      published_at: new Date().toISOString(),
    })
    .select('id')
    .single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { id: String((data as { id: string }).id), name } }, { status: 201 });
}

/* No DELETE: a platform trigger makes published snapshots immutable
   ("Published report snapshots cannot be changed or deleted") —
   saved views are permanent by design, so the API offers none. */
