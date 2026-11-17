import { NextResponse } from 'next/server';
import { listEntitlements, setModuleEnabledForTenant } from '@/lib/platformAdmin';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const tenantId = new URL(req.url).searchParams.get('tenant_id');
  if (!tenantId) return NextResponse.json({ error: { code: 'TENANT_REQUIRED', message: 'tenant_id is required' } }, { status: 400 });
  try {
    return NextResponse.json({ data: await listEntitlements(tenantId) });
  } catch (e) {
    return NextResponse.json({ error: { code: 'ADMIN_ENTITLEMENTS_FAILED', message: e instanceof Error ? e.message : 'Failed' } }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { tenant_id?: string; module_code?: string; enabled?: boolean } | null;
  if (!body?.tenant_id || !body?.module_code || typeof body.enabled !== 'boolean') {
    return NextResponse.json({ error: { code: 'BAD_REQUEST', message: 'tenant_id, module_code and enabled are required' } }, { status: 400 });
  }
  try {
    const result = await setModuleEnabledForTenant(body.tenant_id, body.module_code, body.enabled);
    return NextResponse.json({ data: result });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed';
    const status = message.startsWith('Turn off') ? 400 : message.startsWith('Unknown module') ? 404 : 500;
    return NextResponse.json({ error: { code: 'ENTITLEMENT_CHANGE_FAILED', message } }, { status });
  }
}
