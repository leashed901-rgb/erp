import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status = 400) {
  return NextResponse.json({ error: { code, message } }, { status });
}

const ALLOWED_ACTIONS = new Set(['exercise', 'transfer', 'repurchase', 'cancel', 'convert', 'split', 'file83b']);

async function recordEvent(
  sb: ReturnType<typeof supabaseAdmin>,
  type: string,
  date: string,
  stakeholderId: string | null,
  classId: string | null,
  shares: number | null,
  amount: number | null,
  relatedType: string | null,
  relatedId: string | null,
  details: Record<string, unknown>,
) {
  const { error } = await sb.rpc('cap__event', {
    p_tenant_id: DEFAULT_TENANT_ID,
    p_type: type,
    p_date: date,
    p_stakeholder: stakeholderId,
    p_class: classId,
    p_shares: shares,
    p_amount: amount,
    p_related_type: relatedType,
    p_related_id: relatedId,
    p_details: details,
  });
  if (error) throw new Error(`cap__event: ${error.message}`);
}

/**
 * POST /api/cap/transactions/[action]
 * exercise → cap_exercise_option RPC · cancel → cap_cancel_options RPC ·
 * convert → cap_issue_shares (consideration=conversion) + convertible marked
 * converted · file83b → cap_record_83b_filing RPC · transfer / repurchase /
 * split → direct issuance/class/pool updates + cap__event ledger entry.
 * Transfers and repurchases move ownership only; no journal is posted
 * (there is no repurchase RPC in the schema).
 */
export async function POST(req: NextRequest, context: { params: Promise<{ action: string }> }) {
  try {
    const { action } = await context.params;
    if (!ALLOWED_ACTIONS.has(action)) {
      return NextResponse.json({ error: { code: 'UNSUPPORTED', message: `Unsupported transaction action: ${action}` } }, { status: 400 });
    }
    const body = await req.json();
    const sb = supabaseAdmin();
    const effectiveDate = String(body.effective_date ?? new Date().toISOString().slice(0, 10));
    const details: Record<string, unknown> = { ...(body.details ?? {}) };
    if (body.board_approval_id) details.board_approval_id = String(body.board_approval_id);

    if (action === 'exercise') {
      const grantId = String(body.grant_id ?? '');
      const shares = Number(body.shares ?? body.quantity ?? 0);
      if (!grantId) return err('VALIDATION', 'grant_id is required.');
      if (!Number.isFinite(shares) || shares <= 0) return err('VALIDATION', 'shares must be positive.');
      const { data, error } = await sb.rpc('cap_exercise_option', {
        p_grant_id: grantId,
        p_shares: shares,
        p_exercised_on: effectiveDate,
        p_bank_account_id: body.bank_account_id ?? null,
      });
      if (error) return err('EXERCISE_FAILED', error.message);
      return NextResponse.json({ data: { issuance_id: data } });
    }

    if (action === 'cancel') {
      const grantId = String(body.grant_id ?? '');
      if (!grantId) return err('VALIDATION', 'grant_id is required.');
      const { data, error } = await sb.rpc('cap_cancel_options', {
        p_grant_id: grantId,
        p_as_of: effectiveDate,
        p_reason: String(body.reason ?? 'cancelled'),
        p_unvested_only: body.unvested_only !== undefined ? Boolean(body.unvested_only) : true,
      });
      if (error) return err('CANCEL_FAILED', error.message);
      return NextResponse.json({ data: { cancelled_shares: data } });
    }

    if (action === 'file83b') {
      let issuanceId = String(body.issuance_id ?? '');
      if (!issuanceId && body.grant_id) {
        const { data: ex } = await sb
          .from('cap_option_exercises')
          .select('issuance_id')
          .eq('grant_id', String(body.grant_id))
          .order('exercised_on', { ascending: false })
          .limit(1)
          .maybeSingle();
        issuanceId = String((ex?.issuance_id as string | null) ?? '');
      }
      if (!issuanceId) return err('VALIDATION', 'issuance_id (or a grant_id with an exercise on file) is required.');
      const { data, error } = await sb.rpc('cap_record_83b_filing', {
        p_issuance_id: issuanceId,
        p_filed_on: effectiveDate,
        p_document_id: body.document_id ?? null,
      });
      if (error) return err('FILING_FAILED', error.message);
      return NextResponse.json({ data: { issuance_id: data } });
    }

    if (action === 'convert') {
      const convertibleId = String(body.convertible_id ?? '');
      const stakeholderId = String(body.stakeholder_id ?? '');
      const classId = String(body.class_id ?? body.share_class_id ?? '');
      const shares = Number(body.shares ?? body.quantity ?? 0);
      const price = Number(body.price_per_share ?? 0);
      if (!convertibleId) return err('VALIDATION', 'convertible_id is required.');
      if (!stakeholderId) return err('VALIDATION', 'stakeholder_id is required.');
      if (!classId) return err('VALIDATION', 'class_id is required.');
      if (!Number.isFinite(shares) || shares <= 0) return err('VALIDATION', 'shares must be positive.');
      const { data: issuanceId, error: issueErr } = await sb.rpc('cap_issue_shares', {
        p_tenant_id: DEFAULT_TENANT_ID,
        p_stakeholder_id: stakeholderId,
        p_share_class_id: classId,
        p_shares: shares,
        p_price_per_share: price,
        p_issue_date: effectiveDate,
        p_consideration: 'conversion',
        p_bank_account_id: null,
        p_offset_account_id: null,
        p_round_id: body.round_id ?? null,
        p_board_consent_document_id: body.board_consent_document_id ?? null,
        p_certificate_no: null,
        p_post: false,
        p_vesting_start: null,
        p_vesting_months: null,
        p_cliff_months: null,
        p_amount: body.amount != null ? Number(body.amount) : null,
      });
      if (issueErr) return err('CONVERT_FAILED', issueErr.message);
      const { error: updErr } = await sb
        .from('cap_convertibles')
        .update({ status: 'converted', converted_issuance_id: issuanceId, converted_round_id: body.round_id ?? null })
        .eq('id', convertibleId);
      if (updErr) return err('CONVERT_FAILED', updErr.message);
      return NextResponse.json({ data: { issuance_id: issuanceId } });
    }

    if (action === 'transfer' || action === 'repurchase') {
      const issuanceId = String(body.issuance_id ?? '');
      if (!issuanceId) return err('VALIDATION', 'issuance_id is required.');
      const { data: issuance, error: issErr } = await sb.from('cap_issuances').select('*').eq('id', issuanceId).single();
      if (issErr || !issuance) return err('NOT_FOUND', 'Issuance not found.');
      const currentShares = Number((issuance as Record<string, unknown>).shares);
      const qty = body.shares != null ? Number(body.shares) : currentShares;
      if (!Number.isFinite(qty) || qty <= 0 || qty > currentShares) {
        return err('VALIDATION', `shares must be between 1 and ${currentShares}.`);
      }
      if (action === 'transfer') {
        const toStakeholder = String(body.to_stakeholder_id ?? '');
        if (!toStakeholder) return err('VALIDATION', 'to_stakeholder_id is required.');
        if (qty === currentShares) {
          const { error } = await sb.from('cap_issuances').update({ stakeholder_id: toStakeholder }).eq('id', issuanceId);
          if (error) return err('TRANSFER_FAILED', error.message);
        } else {
          const { error: redErr } = await sb.from('cap_issuances').update({ shares: currentShares - qty }).eq('id', issuanceId);
          if (redErr) return err('TRANSFER_FAILED', redErr.message);
          const { error: insErr } = await sb.from('cap_issuances').insert({
            tenant_id: DEFAULT_TENANT_ID,
            stakeholder_id: toStakeholder,
            share_class_id: (issuance as Record<string, unknown>).share_class_id,
            round_id: (issuance as Record<string, unknown>).round_id,
            certificate_no: null,
            shares: qty,
            price_per_share: (issuance as Record<string, unknown>).price_per_share,
            issue_date: effectiveDate,
            consideration: 'other',
            amount: 0,
            status: 'active',
            source_type: 'transfer',
            source_id: issuanceId,
          });
          if (insErr) return err('TRANSFER_FAILED', insErr.message);
        }
        await recordEvent(sb, 'transfer', effectiveDate, toStakeholder, String((issuance as Record<string, unknown>).share_class_id), qty, null, 'cap_issuances', issuanceId, details);
        return NextResponse.json({ data: { issuance_id: issuanceId, shares: qty } });
      }
      // repurchase
      if (qty === currentShares) {
        const { error } = await sb.from('cap_issuances').update({ status: 'repurchased' }).eq('id', issuanceId);
        if (error) return err('REPURCHASE_FAILED', error.message);
      } else {
        const { error: redErr } = await sb.from('cap_issuances').update({ shares: currentShares - qty }).eq('id', issuanceId);
        if (redErr) return err('REPURCHASE_FAILED', redErr.message);
        const { error: insErr } = await sb.from('cap_issuances').insert({
          tenant_id: DEFAULT_TENANT_ID,
          stakeholder_id: (issuance as Record<string, unknown>).stakeholder_id,
          share_class_id: (issuance as Record<string, unknown>).share_class_id,
          round_id: (issuance as Record<string, unknown>).round_id,
          certificate_no: null,
          shares: qty,
          price_per_share: (issuance as Record<string, unknown>).price_per_share,
          issue_date: effectiveDate,
          consideration: 'other',
          amount: body.amount != null ? Number(body.amount) : 0,
          status: 'repurchased',
          source_type: 'repurchase',
          source_id: issuanceId,
        });
        if (insErr) return err('REPURCHASE_FAILED', insErr.message);
      }
      await recordEvent(sb, 'repurchase', effectiveDate, String((issuance as Record<string, unknown>).stakeholder_id), String((issuance as Record<string, unknown>).share_class_id), qty, body.amount != null ? Number(body.amount) : null, 'cap_issuances', issuanceId, details);
      return NextResponse.json({ data: { issuance_id: issuanceId, shares: qty } });
    }

    // split — scale every live share count by the multiplier, then ledger it.
    const mult = Number(body.split_multiplier ?? 0);
    if (!Number.isFinite(mult) || mult <= 0 || mult === 1) {
      return err('VALIDATION', 'split_multiplier must be positive and not equal to 1.');
    }
    const { data: classes, error: clsErr } = await sb.from('cap_share_classes').select('id,authorized_shares').eq('tenant_id', DEFAULT_TENANT_ID);
    if (clsErr) return err('SPLIT_FAILED', clsErr.message);
    const { data: pools, error: poolErr } = await sb.from('cap_option_pools').select('id,authorized_shares').eq('tenant_id', DEFAULT_TENANT_ID);
    if (poolErr) return err('SPLIT_FAILED', poolErr.message);
    const { data: grants, error: grErr } = await sb.from('cap_option_grants').select('id,shares,exercised_shares,cancelled_shares').eq('tenant_id', DEFAULT_TENANT_ID);
    if (grErr) return err('SPLIT_FAILED', grErr.message);
    const { data: issuances, error: issErr } = await sb.from('cap_issuances').select('id,shares').eq('tenant_id', DEFAULT_TENANT_ID).eq('status', 'active');
    if (issErr) return err('SPLIT_FAILED', issErr.message);
    for (const c of (classes ?? []) as Record<string, unknown>[]) {
      const { error } = await sb.from('cap_share_classes').update({ authorized_shares: Math.round(Number(c.authorized_shares) * mult) }).eq('id', String(c.id));
      if (error) return err('SPLIT_FAILED', error.message);
    }
    for (const p of (pools ?? []) as Record<string, unknown>[]) {
      const { error } = await sb.from('cap_option_pools').update({ authorized_shares: Math.round(Number(p.authorized_shares) * mult) }).eq('id', String(p.id));
      if (error) return err('SPLIT_FAILED', error.message);
    }
    for (const g of (grants ?? []) as Record<string, unknown>[]) {
      const { error } = await sb.from('cap_option_grants').update({
        shares: Math.round(Number(g.shares) * mult),
        exercised_shares: Math.round(Number(g.exercised_shares) * mult),
        cancelled_shares: Math.round(Number(g.cancelled_shares) * mult),
      }).eq('id', String(g.id));
      if (error) return err('SPLIT_FAILED', error.message);
    }
    for (const i of (issuances ?? []) as Record<string, unknown>[]) {
      const { error } = await sb.from('cap_issuances').update({ shares: Math.round(Number(i.shares) * mult) }).eq('id', String(i.id));
      if (error) return err('SPLIT_FAILED', error.message);
    }
    await recordEvent(sb, 'split', effectiveDate, null, null, null, null, null, null, { ...details, split_multiplier: mult });
    return NextResponse.json({ data: { split_multiplier: mult } });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Transaction failed.';
    return err('TRANSACTION_FAILED', message);
  }
}
