import { NextRequest, NextResponse } from 'next/server';
import { loadCapState } from '@/lib/capState';

export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams;
    const asOf = sp.get('as_of') || undefined;
    const state = await loadCapState(asOf);
    return NextResponse.json({ data: state });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to load equity state.';
    return NextResponse.json({ error: { code: 'EQUITY_STATE_FAILED', message } }, { status: 400 });
  }
}
