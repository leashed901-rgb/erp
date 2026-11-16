/** Shared tech pack snapshot shape — what GET /api/v1/tech-packs/:id returns. */
export type TechPackSnapshot = {
  tech_pack: {
    id: string;
    design_id: string | null;
    version_id: string | null;
    revision: number;
    style_number: string | null;
    title: string | null;
    season_id: string | null;
    size_range_id: string | null;
    base_size: string | null;
    status: string;
    notes: string | null;
    approved_by: string | null;
    approved_at: string | null;
    released_at: string | null;
    created_at: string;
    updated_at: string;
    preview_pdf_asset_id?: string | null;
    pdf_asset_id?: string | null;
  };
  design: { id: string; name: string; style_number: string | null; product_type: string | null } | null;
  size_range: { id: string; name: string; sizes: string[]; base_size: string; unit: string } | null;
  colorways: Array<{ id?: string; name?: string; hex?: string; pantone?: string; color?: string; sort?: number }>;
  bom: Array<{
    id: string;
    material_id: string | null;
    kind: string | null;
    placement: string | null;
    description: string | null;
    quantity: number | null;
    uom: string | null;
    unit_cost: number | null;
    supplier_note: string | null;
    sort: number | null;
  }>;
  measurements: Array<{
    pom: string | null;
    name: string | null;
    size: string;
    value: number | string;
    tol_plus: number | null;
    tol_minus: number | null;
    pom_id: string;
  }>;
  construction: Array<{
    id: string;
    area: string | null;
    operation: string | null;
    stitch_type: string | null;
    spi: number | null;
    seam_allowance_mm: number | null;
    notes: string | null;
    sort: number | null;
  }>;
  artwork: Array<{
    id: string;
    asset_id: string | null;
    view: string | null;
    placement: string | null;
    technique: string | null;
    width_mm: number | null;
    height_mm: number | null;
    offset_x_mm: number | null;
    offset_y_mm: number | null;
    pantone_codes: string[] | null;
    sort: number | null;
  }>;
  revisions: Array<{
    id: string;
    revision: number;
    from_status: string | null;
    to_status: string | null;
    change_summary: string | null;
    created_by: string | null;
    created_at: string;
  }>;
  season: { id: string; code: string; name: string } | null;
};

export type PomLibraryRow = {
  id: string;
  code: string;
  name: string;
  how_to_measure: string | null;
  default_tol_plus: number | null;
  default_tol_minus: number | null;
};

/** The status machine, exactly as ds_transition_tech_pack enforces it. */
export const TECH_PACK_ALLOWED_TO: Record<string, string[]> = {
  draft: ['in_review', 'archived'],
  in_review: ['draft', 'approved', 'archived'],
  approved: ['released', 'archived'],
  released: [],
  archived: [],
};

export const TECH_PACK_TRANSITION_LABEL: Record<string, string> = {
  in_review: 'Mark for review',
  approved: 'Approve',
  released: 'Release to suppliers',
  draft: 'Back to Draft',
  archived: 'Archive',
};

export const techPackStatusLabel = (s: string) =>
  s === 'in_review' ? 'In review' : s.charAt(0).toUpperCase() + s.slice(1);
