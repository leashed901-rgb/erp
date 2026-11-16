import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/** GET /api/close/templates — close templates with task counts. */
export async function GET() {
  const { data, error } = await supabaseAdmin()
    .from('acct_close_templates')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('created_at', { ascending: true });
  if (error) return err('INTERNAL', error.message, 500);
  const rows = (data ?? []) as Record<string, unknown>[];
  const ids = rows.map((r) => r.id as string);
  const counts = new Map<string, number>();
  if (ids.length > 0) {
    const { data: tasks } = await supabaseAdmin()
      .from('acct_close_template_tasks')
      .select('template_id')
      .in('template_id', ids);
    for (const t of (tasks ?? []) as { template_id: string }[]) {
      counts.set(t.template_id, (counts.get(t.template_id) ?? 0) + 1);
    }
  }
  return NextResponse.json({
    data: rows.map((r) => ({
      id: r.id, name: r.name, frequency: r.frequency,
      isDefault: r.is_default, isActive: r.is_active,
      taskCount: counts.get(r.id as string) ?? 0,
    })),
  });
}

/**
 * POST /api/close/templates — create a template. The default
 * "Month-end close" is created by the engine on first close
 * generation, not here — this route is for additional templates.
 */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err('VALIDATION', 'Invalid JSON', 400);
  }
  const name = String(body.name || '').trim();
  const frequency = String(body.frequency || 'monthly');
  if (!name) return err('VALIDATION', 'name is required', 400);
  const { data, error } = await supabaseAdmin()
    .from('acct_close_templates')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      name,
      frequency,
      is_default: body.isDefault === true,
      is_active: body.isActive !== false,
    })
    .select('*')
    .single();
  if (error) return err('VALIDATION', error.message, 400);
  return NextResponse.json({ data }, { status: 201 });
}
