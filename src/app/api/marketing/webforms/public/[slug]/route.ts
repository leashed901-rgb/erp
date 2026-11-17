import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { toWebform } from '@/lib/marketingTypes';

/* Public webform fetch (doc 24: webform.submit) — returns the active form
   for a slug so /f/[slug] can render it with no auth. Only the public
   shape leaves here; submissions go through the submit route + RPC. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('platform_webforms')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('slug', slug)
    .eq('is_active', true)
    .maybeSingle();
  if (error) return err('INTERNAL', error.message, 500);
  if (!data) return err('NOT_FOUND', 'Webform not found', 404);
  return NextResponse.json({ data: toWebform(data as Record<string, unknown>) });
}
