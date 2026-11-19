import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/**
 * POST /api/integrations/disconnect — the "not connect" half of the
 * authentication flyout: mark this tenant's connection to a provider
 * disconnected. The saved credentials stay in the tenant's vault
 * (integration_keys) — disconnecting stops use, it does not destroy
 * keys; reconnecting verifies them again.
 */
export async function POST(req: NextRequest) {
  let body: { provider?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'Invalid JSON body', requestId: crypto.randomUUID() } },
      { status: 400 },
    );
  }
  const provider = (body.provider || '').trim();
  if (!provider) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'provider is required', requestId: crypto.randomUUID() } },
      { status: 400 },
    );
  }
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('integration_connections')
    .update({ status: 'disconnected' })
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('provider_code', provider)
    .neq('status', 'disconnected')
    .select('id');
  if (error) {
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } },
      { status: 500 },
    );
  }
  if (!data || data.length === 0) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'No active connection for that provider', requestId: crypto.randomUUID() } },
      { status: 404 },
    );
  }
  return NextResponse.json({ data: { provider, disconnected: data.length } });
}
