import { NextRequest, NextResponse } from 'next/server';
import { getProvider, getOAuthApp } from '@/lib/connect';

export const dynamic = 'force-dynamic';

/**
 * Start an OAuth connection: redirect the tenant to the provider's
 * authorize page using an app registered for this platform (the
 * tenant's own OAuth app when they supplied one, otherwise the
 * platform app from env). The provider sends them back to /callback.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider: code } = await params;
  const provider = await getProvider(code);
  if (!provider?.connect?.authorizationUrl) {
    return NextResponse.json(
      { error: { code: 'NO_CONFIG', message: `No OAuth config for '${code}'.` } },
      { status: 404 },
    );
  }
  const app = await getOAuthApp(code);
  if (!app) {
    return NextResponse.json(
      {
        error: {
          code: 'OAUTH_APP_MISSING',
          message: `No OAuth app is registered for ${provider.name} yet — add the app's client ID and secret from the Integrations page first.`,
        },
      },
      { status: 409 },
    );
  }
  const nonce = crypto.randomUUID();
  const redirectUri = `${req.nextUrl.origin}/api/integrations/oauth/${code}/callback`;
  const url = new URL(provider.connect.authorizationUrl);
  url.searchParams.set('client_id', app.clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', nonce);
  if (provider.connect.scopes?.length) {
    url.searchParams.set('scope', provider.connect.scopes.join(' '));
  }
  const res = NextResponse.redirect(url);
  res.cookies.set('oauth_state', nonce, {
    httpOnly: true,
    sameSite: 'lax',
    path: `/api/integrations/oauth/${code}`,
    maxAge: 600,
  });
  res.cookies.set('oauth_provider', code, {
    httpOnly: true,
    sameSite: 'lax',
    path: `/api/integrations/oauth/${code}`,
    maxAge: 600,
  });
  return res;
}
