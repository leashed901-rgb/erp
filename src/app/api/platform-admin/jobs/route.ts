import { NextResponse } from 'next/server';
import { listProvisioningJobs } from '@/lib/platformAdmin';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return NextResponse.json({ data: { jobs: await listProvisioningJobs() } });
  } catch (e) {
    return NextResponse.json({ error: { code: 'ADMIN_JOBS_FAILED', message: e instanceof Error ? e.message : 'Failed' } }, { status: 500 });
  }
}
