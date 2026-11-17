import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/**
 * The tech pack snapshot, assembled from direct tenant-scoped reads.
 * Same shape as ds_tech_pack_snapshot (tech_pack + design + size_range +
 * colorways + bom + measurements joined to ds_pom_library + construction +
 * artwork). The RPC itself is not callable from the app's service-role
 * API routes — its membership assert needs auth.uid(), which the service
 * role never has — so the route assembles the same JSON directly.
 */
export type TechPackSnapshot = {
  tech_pack: Record<string, unknown>;
  design: Record<string, unknown> | null;
  size_range: Record<string, unknown> | null;
  colorways: unknown[];
  bom: unknown[];
  measurements: unknown[];
  construction: unknown[];
  artwork: unknown[];
};

export async function loadTechPackSnapshot(tpId: string): Promise<TechPackSnapshot | null> {
  const { data: tp, error } = await supabaseAdmin()
    .from('tech_packs')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', tpId)
    .single();
  if (error || !tp) return null;
  const [designRes, sizeRangeRes, colorwaysRes, bomRes, measurementsRes, constructionRes, artworkRes] =
    await Promise.all([
      tp.design_id
        ? supabaseAdmin()
            .from('designs')
            .select('id,name,style_number,product_type')
            .eq('tenant_id', DEFAULT_TENANT_ID)
            .eq('id', tp.design_id as string)
            .single()
        : Promise.resolve({ data: null }),
      tp.size_range_id
        ? supabaseAdmin()
            .from('ds_size_ranges')
            .select('*')
            .eq('tenant_id', DEFAULT_TENANT_ID)
            .eq('id', tp.size_range_id as string)
            .single()
        : Promise.resolve({ data: null }),
      tp.design_id
        ? supabaseAdmin()
            .from('design_colorways')
            .select('*')
            .eq('tenant_id', DEFAULT_TENANT_ID)
            .eq('design_id', tp.design_id as string)
            .order('sort', { ascending: true })
        : Promise.resolve({ data: [] }),
      supabaseAdmin()
        .from('tech_pack_bom_lines')
        .select('*')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .eq('tech_pack_id', tpId)
        .order('sort', { ascending: true }),
      supabaseAdmin()
        .from('tech_pack_measurements')
        .select('*, ds_pom_library!inner(code,name,sort)')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .eq('tech_pack_id', tpId),
      supabaseAdmin()
        .from('tech_pack_construction')
        .select('*')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .eq('tech_pack_id', tpId)
        .order('sort', { ascending: true }),
      supabaseAdmin()
        .from('tech_pack_artwork')
        .select('*')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .eq('tech_pack_id', tpId)
        .order('sort', { ascending: true }),
    ]);
  const measurements = ((measurementsRes.data ?? []) as Array<Record<string, unknown>>)
    .map((m) => {
      const pom = m.ds_pom_library as { code?: string; name?: string; sort?: number } | null;
      return {
        pom: pom?.code ?? null,
        name: pom?.name ?? null,
        pom_sort: pom?.sort ?? 999,
        size: m.size_label,
        value: m.value,
        tol_plus: m.tol_plus,
        tol_minus: m.tol_minus,
        pom_id: m.pom_id,
      };
    })
    .sort((a, b) => {
      if (a.pom_sort !== b.pom_sort) return (a.pom_sort as number) - (b.pom_sort as number);
      if ((a.pom ?? '') !== (b.pom ?? '')) return String(a.pom ?? '').localeCompare(String(b.pom ?? ''));
      return String(a.size ?? '').localeCompare(String(b.size ?? ''));
    });
  return {
    tech_pack: tp as Record<string, unknown>,
    design: (designRes.data as Record<string, unknown> | null) ?? null,
    size_range: (sizeRangeRes.data as Record<string, unknown> | null) ?? null,
    colorways: (colorwaysRes.data ?? []) as unknown[],
    bom: (bomRes.data ?? []) as unknown[],
    measurements,
    construction: (constructionRes.data ?? []) as unknown[],
    artwork: (artworkRes.data ?? []) as unknown[],
  };
}
