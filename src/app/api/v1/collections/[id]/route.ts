import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { apiError } from '@/lib/podServer';

/**
 * DELETE /api/v1/collections/:id — delete a collection.
 * Designs and publications pointing at it are unlinked first (their
 * collection_id FKs are ON DELETE SET NULL / NO ACTION respectively, so a
 * bare delete would 409 on publications). Returns the unlinked counts.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { data: existing, error: getErr } = await supabaseAdmin()
      .from('collections')
      .select('id')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('id', id)
      .maybeSingle();
    if (getErr) throw new Error(`collections: ${getErr.message}`);
    if (!existing) return apiError(`No collection ${id}.`, 404);
    const { data: unlinkedDesigns } = await supabaseAdmin()
      .from('designs')
      .update({ collection_id: null })
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('collection_id', id)
      .select('id');
    const { data: unlinkedPubs } = await supabaseAdmin()
      .from('design_publications')
      .update({ collection_id: null })
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('collection_id', id)
      .select('id');
    const { error: delErr } = await supabaseAdmin()
      .from('collections')
      .delete()
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('id', id);
    if (delErr) throw new Error(`collections delete: ${delErr.message}`);
    return NextResponse.json({
      deleted: id,
      unlinkedDesigns: (unlinkedDesigns ?? []).length,
      unlinkedPublications: (unlinkedPubs ?? []).length,
    });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to delete collection.');
  }
}
