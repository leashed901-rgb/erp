import { NextResponse } from 'next/server';
import { listAudit } from '@/lib/platformAdmin';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const limit = Math.min(200, Math.max(1, Number(new URL(req.url).searchParams.get('limit') || 100)));
  try {
    return NextResponse.json({ data: { events: await listAudit(limit) } });
  } catch (e) {
    return NextResponse.json({ error: { code: 'ADMIN_AUDIT_FAILED', message: e instanceof Error ? e.message : 'Failed' } }, { status: 500 });
  }
}
