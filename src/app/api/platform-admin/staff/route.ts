import { NextResponse } from 'next/server';
import { listStaff } from '@/lib/platformAdmin';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json({ data: await listStaff() });
  } catch (e) {
    return NextResponse.json({ error: { code: 'ADMIN_STAFF_FAILED', message: e instanceof Error ? e.message : 'Failed' } }, { status: 500 });
  }
}
