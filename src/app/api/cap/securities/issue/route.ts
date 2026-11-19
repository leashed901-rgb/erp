import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status = 400) {
  return NextResponse.json({ error: { code, message } }, { status });
}

/**
 * POST /api/cap/securities/issue
 * - kind=share → cap_issue_shares RPC (authorized-share check, par floor,
 *   posts the equity journal via acct_post_entry when a debit account is given).
 * - kind=safe | convertible_note → cap_record_convertible RPC.
 * - kind=warrant → 400: the cap schema has no warrant table; nothing invented.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const sb = supabaseAdmin();
    const kind = String(body.kind ?? 'share');

    if (kind === 'warrant') {
      return err('UNSUPPORTED', 'Warrants have no table in the cap schema (cap_issuances covers shares; cap_convertibles covers SAFEs/notes).', 400);
    }

    const stakeholderId = String(body.stakeholder_id ?? '');
    if (!stakeholderId) return err('VALIDATION', 'stakeholder_id is required.');

    if (kind === 'safe' || kind === 'convertible_note') {
      const instrument =
        kind === 'convertible_note'
          ? 'convertible_note'
          : String(body.instrument ?? 'safe_post_money');
      if (!['safe_post_money', 'safe_pre_money', 'convertible_note'].includes(instrument)) {
        return err('VALIDATION', 'instrument must be safe_post_money, safe_pre_money, or convertible_note.');
      }
      const principal = Number(body.principal ?? body.principal_amount ?? 0);
      if (!Number.isFinite(principal) || principal <= 0) return err('VALIDATION', 'principal must be positive.');
      const issuedOn = String(body.issued_on ?? body.issue_date ?? '');
      if (!issuedOn) return err('VALIDATION', 'issued_on is required.');
      const discount = body.discount_rate != null ? Number(body.discount_rate) : body.discount_pct != null ? Number(body.discount_pct) / 100 : null;
      const { data, error } = await sb.rpc('cap_record_convertible', {
        p_tenant_id: DEFAULT_TENANT_ID,
        p_stakeholder_id: stakeholderId,
        p_instrument: instrument,
        p_principal: principal,
        p_issued_on: issuedOn,
        p_valuation_cap: body.valuation_cap != null ? Number(body.valuation_cap) : null,
        p_discount_rate: discount,
        p_interest_rate: body.interest_rate != null ? Number(body.interest_rate) : null,
        p_maturity_date: body.maturity_date ?? null,
        p_bank_account_id: body.bank_account_id ?? null,
        p_mfn: Boolean(body.mfn),
        p_document_id: body.document_id ?? null,
      });
      if (error) return err('ISSUE_FAILED', error.message);
      // The RPC has no pro-rata parameter; the column exists on the row.
      if (body.pro_rata_rights !== undefined || body.proRata !== undefined) {
        await sb.from('cap_convertibles').update({ pro_rata_rights: Boolean(body.pro_rata_rights ?? body.proRata) }).eq('id', data);
      }
      return NextResponse.json({ data: { id: data } }, { status: 201 });
    }

    // Shares
    const classId = String(body.class_id ?? body.share_class_id ?? '');
    if (!classId) return err('VALIDATION', 'class_id is required for share issuance.');
    const shares = Number(body.quantity ?? body.shares ?? 0);
    if (!Number.isFinite(shares) || shares <= 0 || shares !== Math.trunc(shares)) {
      return err('VALIDATION', 'shares must be a positive whole number.');
    }
    const price = Number(body.price_per_share ?? 0);
    if (!Number.isFinite(price) || price < 0) return err('VALIDATION', 'price_per_share must be >= 0.');
    const issueDate = String(body.issue_date ?? '');
    if (!issueDate) return err('VALIDATION', 'issue_date is required.');

    let boardDocId: string | null = body.board_consent_document_id ?? null;
    if (!boardDocId && body.board_approval_id) {
      const { data: appr } = await sb.from('cap_board_approvals').select('document_id').eq('id', String(body.board_approval_id)).maybeSingle();
      boardDocId = (appr?.document_id as string | null) ?? null;
    }

    const { data, error } = await sb.rpc('cap_issue_shares', {
      p_tenant_id: DEFAULT_TENANT_ID,
      p_stakeholder_id: stakeholderId,
      p_share_class_id: classId,
      p_shares: shares,
      p_price_per_share: price,
      p_issue_date: issueDate,
      p_consideration: String(body.consideration ?? 'cash'),
      p_bank_account_id: body.bank_account_id ?? null,
      p_offset_account_id: body.offset_account_id ?? null,
      p_round_id: body.round_id ?? null,
      p_board_consent_document_id: boardDocId,
      p_certificate_no: body.certificate_no ?? null,
      p_post: body.post !== undefined ? Boolean(body.post) : true,
      p_vesting_start: body.vesting_start ?? null,
      p_vesting_months: body.vesting_months != null ? Number(body.vesting_months) : null,
      p_cliff_months: body.cliff_months != null ? Number(body.cliff_months) : null,
      p_amount: body.amount != null ? Number(body.amount) : null,
    });
    if (error) return err('ISSUE_FAILED', error.message);
    return NextResponse.json({ data: { id: data } }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to issue security.';
    return err('ISSUE_FAILED', message);
  }
}
