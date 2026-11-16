import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/* Public webform submission (doc 24: webform.submit) — runs the
   platform_submit_webform RPC, which validates the form, applies
   rate limits and creates the submission (+ lead) atomically. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const formSlug = typeof body.formSlug === 'string' ? body.formSlug : null;
  if (!formSlug) return err('VALIDATION', 'formSlug is required', 400);
  if (!body.payload || typeof body.payload !== 'object') return err('VALIDATION', 'payload object is required', 400);
  const sb = supabaseAdmin();
  const { data: tenant } = await sb.from('tenants').select('slug').eq('id', DEFAULT_TENANT_ID).maybeSingle();
  const tenantSlug = (tenant as { slug?: string } | null)?.slug;
  if (!tenantSlug) return err('INTERNAL', 'Tenant slug not found', 500);
  const { data, error } = await sb.rpc('platform_submit_webform', {
    p_tenant_slug: tenantSlug,
    p_form_slug: formSlug,
    p_payload: body.payload,
    p_source_url: typeof body.sourceUrl === 'string' ? body.sourceUrl : null,
    p_utm: body.utm && typeof body.utm === 'object' ? body.utm : null,
    p_client_ip: null,
  });
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data }, { status: 201 });
}
