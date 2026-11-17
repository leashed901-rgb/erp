import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { toWebform, toWebformSubmission } from '@/lib/marketingTypes';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sb = supabaseAdmin();
  const { data: form } = await sb
    .from('platform_webforms')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .maybeSingle();
  if (!form) return err('NOT_FOUND', 'Webform not found', 404);
  const { data: subs } = await sb
    .from('platform_webform_submissions')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('webform_id', id)
    .order('created_at', { ascending: false })
    .limit(200);
  return NextResponse.json({
    data: {
      form: toWebform(form as Record<string, unknown>),
      submissions: (subs || []).map((r) => toWebformSubmission(r as Record<string, unknown>)),
    },
  });
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  if (typeof body.name === 'string' && body.name.trim()) patch.name = body.name.trim();
  if (Array.isArray(body.fields)) patch.fields = body.fields;
  if (typeof body.isActive === 'boolean') patch.is_active = body.isActive;
  if (typeof body.successMessage === 'string') patch.success_message = body.successMessage;
  if (typeof body.redirectUrl === 'string') patch.redirect_url = body.redirectUrl;
  if (typeof body.creates === 'string') patch.creates = body.creates;
  if (!Object.keys(patch).length) return err('VALIDATION', 'nothing to update', 400);
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('platform_webforms')
    .update(patch)
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) return err('INTERNAL', error.message, 500);
  if (!data) return err('NOT_FOUND', 'Webform not found', 404);
  return NextResponse.json({ data: toWebform(data as Record<string, unknown>) });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sb = supabaseAdmin();
  const { error } = await sb.from('platform_webforms').delete().eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { id, deleted: true } });
}
