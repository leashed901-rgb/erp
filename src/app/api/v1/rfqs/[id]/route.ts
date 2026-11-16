import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { apiError } from '@/lib/podServer';

/**
 * GET /api/v1/rfqs/:id — the full RFQ board: RFQ + lines (each with its
 * tech pack summary: style, base size, BOM cost, artwork count) +
 * invitations (with NDA status from ds_nda_acceptances) + bids +
 * questions + access log. Tenant-scoped.
 *
 * Sealed bids: while the RFQ is sealed and not closed/awarded, bid amounts
 * are redacted server-side — the board shows only that a bid was submitted.
 * ds_compare_bids enforces the same closed/awarded-only rule.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { data: rfq, error } = await supabaseAdmin()
      .from('rfqs')
      .select(
        'id,rfq_number,title,season_id,status,sealed,allow_bid_revisions,currency,incoterm,ship_to,target_delivery_date,questions_deadline,bid_deadline,nda_id,evaluation_weights,meet_space_uri,published_at,closed_at,awarded_at,cancelled_reason,created_by,created_at,updated_at',
      )
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('id', id)
      .single();
    if (error || !rfq) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'RFQ not found.', requestId: crypto.randomUUID() } },
        { status: 404 },
      );
    }

    const [linesRes, invRes, bidsRes, questionsRes, accessRes, awardsRes] = await Promise.all([
      supabaseAdmin()
        .from('rfq_lines')
        .select('id,line_no,tech_pack_id,colorway_id,quantity,size_breakdown,target_unit_cost,notes,created_at,updated_at')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .eq('rfq_id', id)
        .order('line_no', { ascending: true }),
      supabaseAdmin()
        .from('rfq_invitations')
        .select('id,vendor_id,status,invited_by,invited_at,first_viewed_at,last_viewed_at,declined_reason,revoked_at,access_expires_at')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .eq('rfq_id', id)
        .order('invited_at', { ascending: true }),
      supabaseAdmin()
        .from('bids')
        .select('id,invitation_id,vendor_id,revision,status,currency,valid_until,lead_time_days,payment_terms,incoterm,notes,total_amount,submitted_by,submitted_at,created_at,updated_at')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .eq('rfq_id', id)
        .order('submitted_at', { ascending: true }),
      supabaseAdmin()
        .from('rfq_questions')
        .select('id,vendor_id,asked_by,question,answer,answered_by,answered_at,broadcast,created_at')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .eq('rfq_id', id)
        .order('created_at', { ascending: true }),
      supabaseAdmin()
        .from('ds_access_events')
        .select('id,occurred_at,actor_user_id,actor_vendor_id,event,subject_type,subject_id,asset_id,ip,metadata')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .eq('rfq_id', id)
        .order('occurred_at', { ascending: false })
        .limit(50),
      supabaseAdmin()
        .from('rfq_awards')
        .select('id,rfq_line_id,bid_id,bid_line_id,vendor_id,quantity,unit_price,purchase_order_id,awarded_by,awarded_at')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .eq('rfq_id', id),
    ]);
    for (const r of [linesRes, invRes, bidsRes, questionsRes, accessRes, awardsRes]) {
      if (r.error) throw new Error(`rfq board: ${r.error.message}`);
    }
    const lines = linesRes.data ?? [];
    const invitations = invRes.data ?? [];
    const bids = bidsRes.data ?? [];
    const questions = questionsRes.data ?? [];

    // Vendor display names (one lookup for every vendor id on the board).
    const vendorIds = [
      ...new Set([
        ...invitations.map((i) => i.vendor_id as string),
        ...bids.map((b) => b.vendor_id as string),
        ...questions.map((q) => q.vendor_id as string | null).filter(Boolean),
      ] as string[]),
    ];
    const vendorNames = new Map<string, string>();
    if (vendorIds.length > 0) {
      const { data: vendors } = await supabaseAdmin()
        .from('acct_vendors')
        .select('id,display_name,legal_name,company_name')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .in('id', vendorIds);
      for (const v of vendors ?? []) {
        vendorNames.set(
          v.id as string,
          (v.display_name as string) || (v.legal_name as string) || (v.company_name as string) || (v.id as string),
        );
      }
    }
    const vendorName = (vid: string | null) => (vid ? vendorNames.get(vid) ?? vid : null);

    // Tech pack summaries for the lines (style, base size, BOM cost, artwork).
    const tpIds = [...new Set(lines.map((l) => l.tech_pack_id as string).filter(Boolean))];
    const tpSummary = new Map<string, { style_number: string | null; base_size: string | null; bom_cost: number; artwork_count: number; title: string | null }>();
    if (tpIds.length > 0) {
      const [{ data: tps }, { data: bomLines }, { data: artwork }] = await Promise.all([
        supabaseAdmin()
          .from('tech_packs')
          .select('id,style_number,base_size,title')
          .eq('tenant_id', DEFAULT_TENANT_ID)
          .in('id', tpIds),
        supabaseAdmin()
          .from('tech_pack_bom_lines')
          .select('tech_pack_id,quantity,unit_cost')
          .eq('tenant_id', DEFAULT_TENANT_ID)
          .in('tech_pack_id', tpIds),
        supabaseAdmin()
          .from('tech_pack_artwork')
          .select('tech_pack_id')
          .eq('tenant_id', DEFAULT_TENANT_ID)
          .in('tech_pack_id', tpIds),
      ]);
      for (const tp of tps ?? []) {
        tpSummary.set(tp.id as string, {
          style_number: tp.style_number as string | null,
          base_size: tp.base_size as string | null,
          title: tp.title as string | null,
          bom_cost: 0,
          artwork_count: 0,
        });
      }
      for (const b of bomLines ?? []) {
        const s = tpSummary.get(b.tech_pack_id as string);
        if (s) s.bom_cost += Number(b.quantity ?? 0) * Number(b.unit_cost ?? 0);
      }
      for (const a of artwork ?? []) {
        const s = tpSummary.get(a.tech_pack_id as string);
        if (s) s.artwork_count += 1;
      }
    }

    // NDA status per invitation (ds_nda_acceptances on this RFQ's NDA).
    const ndaSigned = new Set<string>();
    if (rfq.nda_id) {
      const { data: acceptances } = await supabaseAdmin()
        .from('ds_nda_acceptances')
        .select('vendor_id')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .eq('nda_id', rfq.nda_id as string);
      for (const a of acceptances ?? []) ndaSigned.add(a.vendor_id as string);
    }

    // Bid lines per bid (unit prices per RFQ line).
    const bidIds = bids.map((b) => b.id as string);
    const bidLinesByBid = new Map<string, unknown[]>();
    if (bidIds.length > 0) {
      const { data: bidLines } = await supabaseAdmin()
        .from('bid_lines')
        .select('id,bid_id,rfq_line_id,unit_price,moq,lead_time_days,sample_cost,tooling_cost,notes')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .in('bid_id', bidIds);
      for (const bl of bidLines ?? []) {
        const list = bidLinesByBid.get(bl.bid_id as string) ?? [];
        list.push(bl);
        bidLinesByBid.set(bl.bid_id as string, list);
      }
    }

    const sealedHidden = Boolean(rfq.sealed) && !['closed', 'awarded'].includes(rfq.status as string);
    const awardRows = awardsRes.data ?? [];
    const poNumbers = new Map<string, string>();
    const poIds = [...new Set(awardRows.map((a) => a.purchase_order_id as string).filter(Boolean))];
    if (poIds.length > 0) {
      const { data: pos } = await supabaseAdmin()
        .from('erp_purchase_orders')
        .select('id,po_number')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .in('id', poIds);
      for (const p of pos ?? []) poNumbers.set(p.id as string, p.po_number as string);
    }
    return NextResponse.json({
      rfq,
      nda_required: Boolean(rfq.nda_id),
      lines: lines.map((l) => ({ ...l, tech_pack: tpSummary.get(l.tech_pack_id as string) ?? null })),
      invitations: invitations.map((i) => ({
        ...i,
        vendor_name: vendorName(i.vendor_id as string),
        nda_signed: rfq.nda_id ? ndaSigned.has(i.vendor_id as string) : null,
      })),
      bids: bids.map((b) =>
        sealedHidden
          ? {
              id: b.id,
              vendor_id: b.vendor_id,
              vendor_name: vendorName(b.vendor_id as string),
              revision: b.revision,
              status: b.status,
              submitted_at: b.submitted_at,
              sealed: true,
            }
          : { ...b, vendor_name: vendorName(b.vendor_id as string), lines: bidLinesByBid.get(b.id as string) ?? [] },
      ),
      sealed_hidden: sealedHidden,
      questions: questions.map((q) => ({ ...q, vendor_name: vendorName(q.vendor_id as string) })),
      access_log: (accessRes.data ?? []).map((e) => ({
        ...e,
        actor_name: e.actor_vendor_id ? vendorName(e.actor_vendor_id as string) : null,
      })),
      awards: awardRows.map((a) => ({
        ...a,
        po_number: a.purchase_order_id ? poNumbers.get(a.purchase_order_id as string) ?? null : null,
      })),
    });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to load RFQ.');
  }
}
