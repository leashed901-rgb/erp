import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status = 400) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/**
 * POST /api/val/reports/[id]/adopt — val_adopt_report RPC: requires a board
 * approval of type valuation_adopt dated on/after the report date; supersedes
 * prior valuations and writes the final cap_valuations row (FMV of record).
 */
export async function POST(req: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await req.json().catch(() => ({}));
    const boardApprovalId = String(body.board_approval_id ?? '');
    if (!boardApprovalId) return err('VALIDATION', 'board_approval_id is required.');
    const { data, error } = await supabaseAdmin().rpc('val_adopt_report', {
      p_report_id: id,
      p_board_approval_id: boardApprovalId,
    });
    if (error) return err('ADOPT_FAILED', error.message);
    return NextResponse.json({ data: { valuation_id: data } });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Board adoption failed.';
    return err('ADOPT_FAILED', message);
  }
}
