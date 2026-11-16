import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/** GET /api/close/templates/[id] — template + its tasks. */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { data: tpl, error } = await supabaseAdmin()
    .from('acct_close_templates')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .single();
  if (error || !tpl) return err('NOT_FOUND', 'Template not found', 404);
  const { data: tasks } = await supabaseAdmin()
    .from('acct_close_template_tasks')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('template_id', id)
    .order('sort_order', { ascending: true });
  const t = tpl as Record<string, unknown>;
  return NextResponse.json({
    data: {
      id: t.id, name: t.name, frequency: t.frequency,
      isDefault: t.is_default, isActive: t.is_active,
      tasks: ((tasks ?? []) as Record<string, unknown>[]).map((x) => ({
        id: x.id, section: x.section, title: x.title, description: x.description,
        sortOrder: x.sort_order, dueOffsetDays: x.due_offset_days, appliesTo: x.applies_to,
        checkCode: x.check_code, requiresSignoff: x.requires_signoff, priority: x.priority,
      })),
    },
  });
}
