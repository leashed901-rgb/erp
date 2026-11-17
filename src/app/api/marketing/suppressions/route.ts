import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { toSuppression } from '@/lib/marketingTypes';

/* Marketing suppressions (doc 24) over marketing_suppressions —
   contacts that must not receive sends on a channel. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('marketing_suppressions')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: (data || []).map((r) => toSuppression(r as Record<string, unknown>)) });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const contact = typeof body.contact === 'string' ? body.contact.trim() : '';
  const channel = typeof body.channel === 'string' ? body.channel : 'email';
  if (!contact) return err('VALIDATION', 'contact is required', 400);
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('marketing_suppressions')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      contact,
      channel,
      source: typeof body.source === 'string' ? body.source : 'manual',
      reason: typeof body.reason === 'string' ? body.reason : null,
    })
    .select('*')
    .single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: toSuppression(data as Record<string, unknown>) }, { status: 201 });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get('id');
  if (!id) return err('VALIDATION', 'id query param required', 400);
  const sb = supabaseAdmin();
  const { error } = await sb.from('marketing_suppressions').delete().eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { id, deleted: true } });
}
