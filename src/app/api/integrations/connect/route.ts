import { NextRequest, NextResponse } from 'next/server';
import {
  getProvider,
  verifyCredentials,
  saveTenantSecret,
  markConnection,
} from '@/lib/connect';

export const dynamic = 'force-dynamic';

function fail(code: string, message: string, status: number) {
  return NextResponse.json(
    { error: { code, message, requestId: crypto.randomUUID() } },
    { status },
  );
}

/**
 * Connect a provider with the tenant's own API key / basic credentials.
 * The credentials are verified against the provider's real API first;
 * only an accepted credential is stored (in the tenant's vault) and
 * marked active.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const code = String(body.provider || '');
  const credentials = (body.credentials || {}) as Record<string, string>;
  const connectionConfig = (body.connectionConfig || {}) as Record<string, string>;
  if (!code) return fail('VALIDATION', 'provider is required.', 400);

  const provider = await getProvider(code);
  if (!provider?.connect) {
    return fail('NO_CONFIG', `No connect config for '${code}' yet.`, 404);
  }
  const cfg = provider.connect;
  if (cfg.authMode === 'OAUTH2' || cfg.authMode === 'OAUTH1' || cfg.authMode === 'MCP_OAUTH2') {
    return fail('VALIDATION', `${provider.name} connects with OAuth — use the OAuth flow.`, 400);
  }
  for (const field of [...cfg.credentialFields, ...cfg.connectionFields]) {
    const source = cfg.credentialFields.includes(field) ? credentials : connectionConfig;
    if (field.required && !source[field.name]) {
      return fail('VALIDATION', `${field.title} is required.`, 400);
    }
  }

  const verdict = await verifyCredentials(cfg, credentials, connectionConfig);
  if (!verdict.ok) {
    await markConnection(provider, 'error', { detail: verdict.detail });
    return fail(
      'VERIFICATION_FAILED',
      `${provider.name} did not accept those credentials (${verdict.status || 'no answer'}): ${verdict.detail}`,
      422,
    );
  }

  await saveTenantSecret(code, 'CREDENTIALS', { ...credentials, __connection: connectionConfig });
  await markConnection(provider, 'active', {
    detail: `Verified via ${verdict.mode} check (${verdict.status}).`,
  });
  return NextResponse.json({
    data: { provider: code, status: 'active', verified: true, verifyMode: verdict.mode },
  });
}
