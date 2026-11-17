import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { toProject } from '@/lib/taskTypes';
import { tenantOperatorUserId } from '@/lib/supportServer';

/* Projects (doc 27) over the projects table. owner_id references
   auth.users — the route resolves the tenant operator server-side. */
function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('projects')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('created_at', { ascending: true })
    .limit(200);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: (data || []).map((r) => toProject(r as Record<string, unknown>)) });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return err('VALIDATION', 'name is required', 400);
  const ownerId = await tenantOperatorUserId();
  if (!ownerId) return err('INTERNAL', 'No operator user to own the project', 500);
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('projects')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      owner_id: ownerId,
      name,
      status: typeof body.status === 'string' ? body.status : 'active',
      canvas_state: {},
    })
    .select('*')
    .single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: toProject(data as Record<string, unknown>) }, { status: 201 });
}
