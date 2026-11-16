/**
 * designTypes — the ONE home for the Design Studio's core types (doc 19 gap:
 * "consolidate Design, DesignVersion, Blank, RenderJob, TechPack into one
 * designTypes.ts"). Previously these lived in four places (podApi,
 * designCanvasStore, renderJobAdapter, renderWorker) with overlapping
 * shapes; the old locations re-export from here, so existing imports keep
 * working. Every shape below mirrors its real table/route — no invented
 * fields.
 */

import type { PlacementSpec } from './podApi';

// ── Design ───────────────────────────────────────────────────────────────
// The `designs` row as GET /api/v1/designs returns it (incl. publications).
export interface Design {
  id: string;
  name: string;
  status: string;
  supplier_catalog_product_id: string | null;
  garment_color: string | null;
  product_type: string | null;
  retail_price: number | null;
  /** Reusable-template flag (designs.is_template). */
  is_template: boolean;
  collection_id: string | null;
  created_at: string;
  updated_at: string;
  publications: {
    id: string;
    status: string;
    mockup_url: string | null;
    product_variant_id: string | null;
  }[];
}

// ── DesignVersion ────────────────────────────────────────────────────────
// The `design_versions` row (S600): one versioned snapshot of a design's
// canvas_state, locked once a tech pack or render references it.
export interface DesignVersion {
  id: string;
  design_id: string;
  tenant_id: string;
  version_no: number;
  label: string | null;
  message: string | null;
  canvas_state: Record<string, unknown> | null;
  placement_spec?: PlacementSpec | null;
  sha256: string | null;
  is_locked: boolean;
  source_app: string | null;
  document_asset_id: string | null;
  preview_asset_id: string | null;
  created_by: string | null;
  created_at: string;
}

// ── Blank ────────────────────────────────────────────────────────────────
// The canvas blank (moved from designCanvasStore — the store re-exports it).
// The API-side blank shapes (BlankCard / BlankDetail) live in podApi and
// carry the supplier data; this is the canvas's minimal view of one.
export interface Blank {
  key: string;
  name: string;
  brand: string;
  price: number;
  /** Inline SVG data URI — keeps the mockup self-contained, no asset fetch. */
  img: string;
  /** Product family — drives which print-area pills render on the canvas. */
  family: 'tops' | 'books' | 'drinkware';
}

// ── RenderJob ────────────────────────────────────────────────────────────
// One render job: a `craft_jobs` row (kind='mockup_render') with its shadow
// `design_renders` row. The worker claims these via ds_claim_jobs.
export interface RenderJobInput {
  designId: string;
  blankId: string | null; // canonical_product_id
  view: string; // view_angle
  color: string;
  kind: 'mockup' | 'print'; // the original design_renders.kind
  inputHash: string; // design_renders.input_hash
  rendererVersion: string; // design_renders.renderer_version
  renderRowId?: string | null; // shadow design_renders.id, if mirrored
}

/** Adapter return on enqueue — both IDs so callers can update either surface. */
export interface EnqueueResult {
  jobId: string; // craft_jobs.id
  renderRowId: string | null; // design_renders.id (null if mirroring disabled)
}

/** Adapter return on claim — the worker consumes these. */
export interface ClaimedRenderJob {
  jobId: string; // craft_jobs.id
  attempts: number; // craft_jobs.attempts (post-increment)
  input: RenderJobInput;
}

/** Output shape for a successful finish. */
export interface RenderJobOutput {
  storagePath: string;
  width: number;
  height: number;
}

/** The job itself, as the queue/worker see it. */
export interface RenderJob {
  jobId: string;
  attempts: number;
  status: string;
  input: RenderJobInput;
  output: RenderJobOutput | null;
  error: string | null;
}

/** The worker's per-job execution result (moved from renderWorker). */
export interface RenderJobResult {
  id: string;
  designId: string;
  view: string;
  color: string;
  kind: string;
  hash: string;
  ms: number;
  result: 'succeeded' | 'reused' | 'failed' | 'queued';
  storagePath: string | null;
  error?: string;
}

// ── TechPack ─────────────────────────────────────────────────────────────
// The `tech_packs` row (S600 production studio): a versioned, reviewable
// production spec for one design version. No tech-pack UI is wired in this
// pass — the type is consolidated here so the plan layer has one shape.
export interface TechPack {
  id: string;
  tenant_id: string;
  design_id: string;
  version_id: string;
  revision: number;
  style_number: string | null;
  title: string;
  season_id: string | null;
  size_range_id: string | null;
  base_size: string | null;
  status: 'draft' | 'in_review' | 'approved' | 'released' | 'superseded' | 'archived';
  supersedes_id: string | null;
  pdf_asset_id: string | null;
  preview_pdf_asset_id: string | null;
  notes: string | null;
  approved_by: string | null;
  approved_at: string | null;
  released_at: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}
