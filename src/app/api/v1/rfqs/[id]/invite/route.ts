import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { apiError } from '@/lib/podServer';

/**
 * POST /api/v1/rfqs/:id/invite — replicates ds_invite_vendor_to_rfq (the
 * RPC's membership assert needs a signed-in user session, which the app's
 * service-role API routes never have). Body: { vendorId }. Only a draft
 * or published RFQ takes invitations. The invitation upserts on
 * (rfq_id, vendor_id) — a revoked invitation comes back as invited — and
 * the vendor gets a preview asset grant for every line's tech pack.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const vendorId = String(body?.vendorId ?? '').trim();
    if (!vendorId) {
      return NextResponse.json(
        { error: { code: 'VALIDATION', message: 'vendorId is required.', requestId: crypto.randomUUID() } },
        { status: 400 },
      );
    }
    const [{ data: rfq }, { data: vendor }] = await Promise.all([
      supabaseAdmin()
        .from('rfqs')
        .select('id,status')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .eq('id', id)
        .single(),
      supabaseAdmin()
        .from('acct_vendors')
        .select('id')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .eq('id', vendorId)
        .single(),
    ]);
    if (!rfq) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'RFQ not found.', requestId: crypto.randomUUID() } },
        { status: 404 },
      );
    }
    if (!vendor) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Vendor not found.', requestId: crypto.randomUUID() } },
        { status: 404 },
      );
    }
    if (!['draft', 'published'].includes(rfq.status as string)) {
      return NextResponse.json(
        {
          error: {
            code: 'VALIDATION',
            message: `RFQ is ${rfq.status}.`,
            requestId: crypto.randomUUID(),
          },
        },
        { status: 422 },
      );
    }
    const { data: existing } = await supabaseAdmin()
      .from('rfq_invitations')
      .select('id,status')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('rfq_id', id)
      .eq('vendor_id', vendorId)
      .maybeSingle();
    let invitationId: string;
    if (existing) {
      const { data, error } = await supabaseAdmin()
        .from('rfq_invitations')
        .update({
          status: existing.status === 'revoked' ? 'invited' : existing.status,
          revoked_at: null,
        })
        .eq('id', existing.id as string)
        .select('id')
        .single();
      if (error) throw new Error(`rfq invite: ${error.message}`);
      invitationId = data.id as string;
    } else {
      const { data, error } = await supabaseAdmin()
        .from('rfq_invitations')
        .insert({
          tenant_id: DEFAULT_TENANT_ID,
          rfq_id: id,
          vendor_id: vendorId,
          status: 'invited',
          invited_by: null,
          invited_at: new Date().toISOString(),
        })
        .select('id')
        .single();
      if (error) throw new Error(`rfq invite: ${error.message}`);
      invitationId = data.id as string;
    }
    const { data: lines } = await supabaseAdmin()
      .from('rfq_lines')
      .select('tech_pack_id')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('rfq_id', id);
    for (const line of lines ?? []) {
      await supabaseAdmin()
        .from('asset_release_grants')
        .upsert(
          {
            tenant_id: DEFAULT_TENANT_ID,
            vendor_id: vendorId,
            rfq_id: id,
            tech_pack_id: line.tech_pack_id,
            level: 'preview',
            revoked_at: null,
            revoked_by: null,
            granted_at: new Date().toISOString(),
          },
          { onConflict: 'vendor_id,tech_pack_id,level' },
        );
    }
    return NextResponse.json({ invitation_id: invitationId }, { status: 201 });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to invite vendor.');
  }
}
