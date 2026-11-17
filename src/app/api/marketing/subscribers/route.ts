import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { toSubscriber } from '@/lib/marketingTypes';

/* Newsletter subscribers (doc 24) over newsletter_subscribers. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('newsletter_subscribers')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: (data || []).map((r) => toSubscriber(r as Record<string, unknown>)) });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  if (!email || !email.includes('@')) return err('VALIDATION', 'a valid email is required', 400);
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('newsletter_subscribers')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      email,
      source: typeof body.source === 'string' ? body.source : 'admin',
      confirmed_at: body.confirmed === true ? new Date().toISOString() : null,
      confirm_token: crypto.randomUUID(),
    })
    .select('*')
    .single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: toSubscriber(data as Record<string, unknown>) }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return err('VALIDATION', 'id query param required', 400);
  const sb = supabaseAdmin();
  const { error } = await sb.from('newsletter_subscribers').delete().eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { id, deleted: true } });
}
