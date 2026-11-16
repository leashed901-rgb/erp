import { NextResponse } from 'next/server';
import { listAdminTenants } from '@/lib/platformAdmin';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json({ data: { tenants: await listAdminTenants() } });
  } catch (e) {
    return NextResponse.json({ error: { code: 'ADMIN_TENANTS_FAILED', message: e instanceof Error ? e.message : 'Failed' } }, { status: 500 });
  }
}
