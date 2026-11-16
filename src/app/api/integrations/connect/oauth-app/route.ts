import { NextRequest, NextResponse } from 'next/server';
import { getProvider, saveTenantSecret } from '@/lib/connect';

export const dynamic = 'force-dynamic';

/**
 * Register the tenant's own OAuth app for a provider (client ID +
 * secret from the app they created in the provider's developer
 * console). Stored in the tenant's vault; the OAuth start route uses
 * it immediately.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const code = String(body.provider || '');
  const clientId = String(body.clientId || '').trim();
  const clientSecret = String(body.clientSecret || '').trim();
  if (!code || !clientId || !clientSecret) {
    return NextResponse.json(
      { error: { code: 'VALIDATION', message: 'provider, clientId and clientSecret are required.' } },
      { status: 400 },
    );
  }
  const provider = await getProvider(code);
  if (!provider?.connect?.authorizationUrl) {
    return NextResponse.json(
      { error: { code: 'NO_CONFIG', message: `No OAuth config for '${code}'.` } },
      { status: 404 },
    );
  }
  await saveTenantSecret(code, 'OAUTH_APP', { client_id: clientId, client_secret: clientSecret });
  return NextResponse.json({
    data: { provider: code, saved: true, startUrl: `/api/integrations/oauth/${code}/start` },
  });
}
