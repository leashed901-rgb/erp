import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { apiError } from '@/lib/podServer';

/**
 * GET /api/v1/rfqs — the tenant's RFQs (tenant-scoped).
 * POST /api/v1/rfqs — create. Replicates ds_create_rfq (the RPC's
 * membership assert needs a signed-in user session, which the app's
 * service-role API routes never have): rfq_number from
 * erp_next_document_number, nda_id from the tenant's active NDA, then one
 * line for the tech pack. Body: { title, techPackId?, bidDeadline?,
 * currency?, incoterm?, sealed?, quantity?, sizeBreakdown?, targetUnitCost? }
 */
export async function GET(req: NextRequest) {
  try {
    const params = new URL(req.url).searchParams;
    const status = params.get('status');
    const techPackId = params.get('techPackId');
    const limit = Math.min(Math.max(parseInt(params.get('limit') ?? '50', 10) || 50, 1), 100);
    let query = supabaseAdmin()
      .from('rfqs')
      .select(
        'id,rfq_number,title,season_id,status,sealed,allow_bid_revisions,currency,incoterm,ship_to,target_delivery_date,questions_deadline,bid_deadline,nda_id,published_at,closed_at,awarded_at,cancelled_reason,created_by,created_at,updated_at',
      )
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (status) query = query.eq('status', status);
    if (techPackId) {
      const { data: lineRfqs } = await supabaseAdmin()
        .from('rfq_lines')
        .select('rfq_id')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .eq('tech_pack_id', techPackId);
      const ids = [...new Set((lineRfqs ?? []).map((l) => l.rfq_id as string))];
      if (ids.length === 0) return NextResponse.json({ items: [], nextCursor: null });
      query = query.in('id', ids);
    }
    const { data, error } = await query;
    if (error) throw new Error(`rfqs: ${error.message}`);
    return NextResponse.json({ items: data ?? [], nextCursor: null });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to list RFQs.');
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const title = String(body?.title ?? '').trim();
    if (!title) {
      return NextResponse.json(
        { error: { code: 'VALIDATION', message: 'title is required.', requestId: crypto.randomUUID() } },
        { status: 400 },
      );
    }
    const [{ data: rfqNumber, error: numberError }, { data: nda }] = await Promise.all([
      supabaseAdmin().rpc('erp_next_document_number', {
        p_tenant_id: DEFAULT_TENANT_ID,
        p_document_type: 'rfq',
      }),
      supabaseAdmin()
        .from('ds_ndas')
        .select('id')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle(),
    ]);
    if (numberError) throw new Error(`erp_next_document_number: ${numberError.message}`);
    const { data: row, error } = await supabaseAdmin()
      .from('rfqs')
      .insert({
        tenant_id: DEFAULT_TENANT_ID,
        rfq_number: rfqNumber as string,
        title,
        bid_deadline: body?.bidDeadline ?? null,
        currency: body?.currency ?? 'USD',
        incoterm: body?.incoterm ?? null,
        sealed: body?.sealed ?? true,
        nda_id: nda?.id ?? null,
      })
      .select(
        'id,rfq_number,title,status,sealed,currency,incoterm,bid_deadline,nda_id,published_at,closed_at,awarded_at,created_at,updated_at',
      )
      .single();
    if (error) throw new Error(`rfqs create: ${error.message}`);
    if (body?.techPackId) {
      const { error: lineError } = await supabaseAdmin().from('rfq_lines').insert({
        tenant_id: DEFAULT_TENANT_ID,
        rfq_id: row.id,
        line_no: 1,
        tech_pack_id: body.techPackId,
        quantity: body?.quantity ?? 0,
        size_breakdown: body?.sizeBreakdown ?? {},
        target_unit_cost: body?.targetUnitCost ?? null,
      });
      if (lineError) {
        // Roll back the header so a failed line never leaves an orphan RFQ.
        await supabaseAdmin().from('rfqs').delete().eq('id', row.id);
        throw new Error(`rfq_lines: ${lineError.message}`);
      }
    }
    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to create RFQ.');
  }
}
