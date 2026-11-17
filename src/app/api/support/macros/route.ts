import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { toMacro } from '@/lib/supportTypes';

/* Macros (doc 26) over support_macros. A macro's `actions` array is
   applied by POST /api/v1/tickets/[id]/macro. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('support_macros')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('name', { ascending: true })
    .limit(200);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: (data || []).map((r) => toMacro(r as Record<string, unknown>)) });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return err('VALIDATION', 'name is required', 400);
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('support_macros')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      scope: 'tenant',
      name,
      description: typeof body.description === 'string' ? body.description : null,
      actions: Array.isArray(body.actions) ? body.actions : [],
      is_active: body.isActive !== false,
    })
    .select('*')
    .single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: toMacro(data as Record<string, unknown>) }, { status: 201 });
}
