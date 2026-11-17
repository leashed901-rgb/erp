import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

const APPLIES_TO = ['every_close', 'quarter_end', 'year_end'] as const;

/**
 * POST /api/close/templates/[id]/tasks — add a task to a template
 * (Batch G). sort_order defaults to the end of the list; requires_signoff
 * defaults to the engine's true.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return err('VALIDATION', 'Invalid JSON', 400);
  }
  const section = String(body.section || '').trim();
  const title = String(body.title || '').trim();
  const appliesTo = String(body.appliesTo || 'every_close');
  if (!section || !title) return err('VALIDATION', 'section and title are required', 400);
  if (!(APPLIES_TO as readonly string[]).includes(appliesTo)) {
    return err('VALIDATION', `appliesTo must be one of: ${APPLIES_TO.join(', ')}`, 400);
  }
  const { data: tpl } = await supabaseAdmin()
    .from('acct_close_templates')
    .select('id')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .maybeSingle();
  if (!tpl) return err('NOT_FOUND', 'Template not found', 404);
  const { data: maxRow } = await supabaseAdmin()
    .from('acct_close_template_tasks')
    .select('sort_order')
    .eq('template_id', id)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle();
  const sortOrder = body.sortOrder != null
    ? Number(body.sortOrder)
    : ((maxRow as { sort_order?: number } | null)?.sort_order ?? 0) + 10;
  const { data, error } = await supabaseAdmin()
    .from('acct_close_template_tasks')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      template_id: id,
      parent_id: (body.parentId as string) || null,
      section,
      title,
      description: (body.description as string) || null,
      sort_order: sortOrder,
      due_offset_days: Number(body.dueOffsetDays) || 0,
      applies_to: appliesTo,
      check_code: (body.checkCode as string) || null,
      requires_signoff: body.requiresSignoff !== false,
      priority: Number(body.priority) || 1,
      tags: [],
    })
    .select('*')
    .single();
  if (error) return err('VALIDATION', error.message, 400);
  return NextResponse.json({ data }, { status: 201 });
}
