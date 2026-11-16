import { NextResponse } from 'next/server';
import { listIdentities } from '@/lib/platformAdmin';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json({ data: { users: await listIdentities() } });
  } catch (e) {
    return NextResponse.json({ error: { code: 'ADMIN_USERS_FAILED', message: e instanceof Error ? e.message : 'Failed' } }, { status: 500 });
  }
}
