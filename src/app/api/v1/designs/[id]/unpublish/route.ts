import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { apiError } from '@/lib/podServer';

/**
 * POST /api/v1/designs/:id/unpublish — pull a published design back to draft.
 * Archives every design_publications row for the design (status
 * 'published'/'draft' → 'archived') and resets the design itself to
 * 'draft'. The My Products table's Unpublish row action had no server
 * counterpart before this — it only showed a toast. Publications are
 * archived, never deleted: the publish history stays provable.
 */
export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { data: design, error: getErr } = await supabaseAdmin()
      .from('designs')
      .select('id,status')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('id', id)
      .maybeSingle();
    if (getErr) throw new Error(`designs: ${getErr.message}`);
    if (!design) return apiError(`No design ${id}.`, 404);
    const { data: pubs, error: pubErr } = await supabaseAdmin()
      .from('design_publications')
      .update({ status: 'archived' })
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('design_id', id)
      .neq('status', 'archived')
      .select('id');
    if (pubErr) throw new Error(`design_publications: ${pubErr.message}`);
    const { error: updErr } = await supabaseAdmin()
      .from('designs')
      .update({ status: 'draft', updated_at: new Date().toISOString() })
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('id', id);
    if (updErr) throw new Error(`designs update: ${updErr.message}`);
    return NextResponse.json({
      id,
      status: 'draft',
      archivedPublications: (pubs ?? []).length,
    });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to unpublish design.');
  }
}
