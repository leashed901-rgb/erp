import { NextResponse } from 'next/server';
import { adminOverview } from '@/lib/platformAdmin';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json({ data: await adminOverview() });
  } catch (e) {
    return NextResponse.json({ error: { code: 'ADMIN_OVERVIEW_FAILED', message: e instanceof Error ? e.message : 'Failed' } }, { status: 500 });
  }
}
