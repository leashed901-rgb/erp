import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { toWebform } from '@/lib/marketingTypes';

/* Webforms (doc 24) over platform_webforms. Public submissions go
   through the platform_submit_webform RPC (see the submit route). */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('platform_webforms')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: (data || []).map((r) => toWebform(r as Record<string, unknown>)) });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  if (!name) return err('VALIDATION', 'name is required', 400);
  const slug =
    typeof body.slug === 'string' && body.slug.trim()
      ? body.slug.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-')
      : name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('platform_webforms')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      name,
      slug,
      creates: typeof body.creates === 'string' ? body.creates : 'lead',
      fields: Array.isArray(body.fields) ? body.fields : [],
      ...(typeof body.successMessage === 'string' ? { success_message: body.successMessage } : {}),
      ...(typeof body.redirectUrl === 'string' ? { redirect_url: body.redirectUrl } : {}),
      is_active: body.isActive !== false,
    })
    .select('*')
    .single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: toWebform(data as Record<string, unknown>) }, { status: 201 });
}
