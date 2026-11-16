import { NextRequest, NextResponse } from 'next/server';
import { getProvider, getOAuthApp, saveTenantSecret, markConnection, verifyCredentials } from '@/lib/connect';

export const dynamic = 'force-dynamic';

function page(title: string, body: string) {
  return new NextResponse(
    `<!doctype html><html><head><meta charset="utf-8"><title>${title}</title></head>` +
      `<body style="font-family:system-ui,sans-serif;padding:40px;color:#1f2937">` +
      `<h2 style="margin:0 0 8px">${title}</h2><p style="color:#6b7280">${body}</p>` +
      `<p><a href="/" style="color:#0a6400;font-weight:600">Return to Unleashe</a></p></body></html>`,
    { headers: { 'Content-Type': 'text/html' } },
  );
}

/**
 * OAuth callback: exchange the code for tokens, store them in the
 * tenant's vault, verify with a real API call, and mark the
 * connection active. Nothing is marked connected on the provider's
 * say-so alone — the token has to work.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider: code } = await params;
  const providerRow = await getProvider(code);
  if (!providerRow?.connect?.tokenUrl) return page('Connection failed', `No OAuth config for '${code}'.`);

  const state = req.nextUrl.searchParams.get('state');
  const expected = req.cookies.get('oauth_state')?.value;
  if (!state || !expected || state !== expected) {
    return page('Connection failed', 'The sign-in state did not match — start the connection again.');
  }
  const authCode = req.nextUrl.searchParams.get('code');
  if (!authCode) {
    const err = req.nextUrl.searchParams.get('error') || 'no code returned';
    return page('Connection failed', `${providerRow.name} did not complete sign-in (${err}).`);
  }
  const app = await getOAuthApp(code);
  if (!app) return page('Connection failed', `No OAuth app is registered for ${providerRow.name}.`);

  const redirectUri = `${req.nextUrl.origin}/api/integrations/oauth/${code}/callback`;
  const tokenRes = await fetch(providerRow.connect.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code: authCode,
      redirect_uri: redirectUri,
      client_id: app.clientId,
      client_secret: app.clientSecret,
    }),
  }).catch(() => null);
  if (!tokenRes?.ok) {
    return page('Connection failed', `${providerRow.name} refused the token exchange (${tokenRes?.status || 'no answer'}).`);
  }
  const tokens = (await tokenRes.json().catch(() => ({}))) as Record<string, unknown>;
  const accessToken = tokens.access_token as string | undefined;
  if (!accessToken) return page('Connection failed', `${providerRow.name} returned no access token.`);

  await saveTenantSecret(code, 'OAUTH', {
    access_token: accessToken,
    refresh_token: tokens.refresh_token || null,
    expires_at: tokens.expires_in
      ? new Date(Date.now() + Number(tokens.expires_in) * 1000).toISOString()
      : null,
    scope: tokens.scope || null,
    app_owner: app.owner,
  });

  const verdict = await verifyCredentials(providerRow.connect, {}, {}, accessToken);
  if (!verdict.ok) {
    await markConnection(providerRow, 'error', { detail: verdict.detail });
    return page(
      'Connected, but verification failed',
      `${providerRow.name} issued a token, but its API rejected it (${verdict.status}). The connection is saved as needing repair.`,
    );
  }
  const scopes = typeof tokens.scope === 'string' ? tokens.scope.split(' ') : providerRow.connect.scopes || [];
  await markConnection(providerRow, 'active', {
    detail: `OAuth token verified via ${verdict.mode} check (${verdict.status}).`,
    scopes,
  });
  return page(
    `${providerRow.name} connected`,
    `The connection is live and verified against ${providerRow.name}'s API. You can close this tab.`,
  );
}
