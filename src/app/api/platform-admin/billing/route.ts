import { NextResponse } from 'next/server';
import { listBilling } from '@/lib/platformAdmin';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json({ data: await listBilling() });
  } catch (e) {
    return NextResponse.json({ error: { code: 'ADMIN_BILLING_FAILED', message: e instanceof Error ? e.message : 'Failed' } }, { status: 500 });
  }
}
