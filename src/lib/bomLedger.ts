/**
 * Reactive BOM Ledger — the bottom-right box of Sunny's pipeline diagram:
 *
 *   [Parametric 2D Pattern Engine] ──(Seam Graph + Meshes)──> [WASM/WebGPU Cloth Solver]
 *                 │ │
 *       (Piece Areas + Edge Lengths) (3D Fit & Stress Maps)
 *                 │ │
 *                 ▼ ▼
 *      [2D Marker Nesting Engine] ────────────────────────────> [Reactive BOM Ledger]
 *          (Fabric Yield & Waste %) (Cost, Trims, Thread)
 *
 * The ledger is a COMPUTED view, not stored rows: every read re-derives the
 * BOM from the tech pack's own data — POM values at the base size (the
 * pattern engine's piece areas and edge lengths), construction ops (stitch
 * types, SPI, seam allowance), and the priced materials library. Change a
 * POM, a material price, the marker efficiency or the waste %, and the
 * ledger moves. The manual BOM rows stay the record; the ledger is the
 * check that can write its computed quantity back onto a row ("apply").
 *
 * Piece model (crew tee, base size, cm) — rectangles and one trapezoid,
 * each dimension taken from a real POM, plus the seam allowance from the
 * construction ops (default 6 mm):
 *   front  = (A + 2·sa) × (B + sa)
 *   back   = front
 *   sleeve = (D + sa) × ((A − C + G + 2·sa) + (G + 2·sa)) / 2   (trapezoid)
 * Seam lengths (cm) for thread, from the same POMs:
 *   shoulder 2·(C − E)/2 · side 2·B · sleeve underarm 2·D · set-in 2·(D + G)
 *   neck 2·E · bottom hem F · sleeve hems 2·G
 * Thread factors are the standard industry consumption ratios per stitch
 * type (lockstitch 301 ≈ 2.5× seam length, overlock 504 ≈ 4.5×,
 * 607 ≈ 5.0×, coverstitch 406 ≈ 5.5×). When a revision carries no
 * construction ops, every seam uses the blended default 4.0× and the
 * ledger says so — it never invents an op.
 */
import type { TechPackSnapshot } from '@/lib/techPackSnapshot';

export type BomLedgerSettings = {
  /** Fabric width in cm the marker is nested on. Default 150. */
  fabricWidthCm: number;
  /** Marker efficiency as a fraction (0.85 = 85% of the marker is pieces). */
  markerEfficiency: number;
  /** Cutting waste as a fraction on top of the marker. Default 0.05. */
  wastePct: number;
};

export const DEFAULT_BOM_LEDGER_SETTINGS: BomLedgerSettings = {
  fabricWidthCm: 150,
  markerEfficiency: 0.85,
  wastePct: 0.05,
};

export type BomLedgerLine = {
  bomLineId: string | null;
  materialId: string | null;
  kind: string;
  description: string;
  uom: string;
  enteredQty: number;
  enteredUnitCost: number;
  enteredExt: number;
  /** Computed quantity in the line's own uom, null when not computable. */
  computedQty: number | null;
  computedExt: number;
  /** The working, in plain words — inputs, intermediates, result. */
  basis: string;
  /** 'computed' = derived from pattern data; 'count' = 1-per-garment check;
   *  'uncomputed' = no derivation available, entered value stands. */
  status: 'computed' | 'count' | 'uncomputed';
  /** True when the computed quantity may be written back onto the BOM row. */
  canApply: boolean;
};

export type BomLedger = {
  techPackId: string;
  baseSize: string;
  settings: BomLedgerSettings;
  lines: BomLedgerLine[];
  enteredTotal: number;
  computedTotal: number;
  notes: string[];
};

type BomRow = {
  id?: string;
  material_id?: string | null;
  kind?: string | null;
  description?: string | null;
  quantity?: number | string | null;
  uom?: string | null;
  unit_cost?: number | string | null;
};

export type LedgerMaterial = {
  id: string;
  code?: string | null;
  name?: string | null;
  kind?: string | null;
  unit_cost?: number | string | null;
  uom?: string | null;
  weight_gsm?: number | string | null;
  width_cm?: number | string | null;
};

const THREAD_FACTOR: Record<string, number> = {
  '301': 2.5,
  '504': 4.5,
  '607': 5.0,
  '406': 5.5,
};
const DEFAULT_THREAD_FACTOR = 4.0;

const num = (v: unknown, fallback = 0): number => {
  const n = typeof v === 'string' ? Number(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) ? n : fallback;
};

const round4 = (n: number): number => Math.round(n * 10000) / 10000;

function pomMap(snapshot: TechPackSnapshot, baseSize: string): Record<string, number> {
  const map: Record<string, number> = {};
  for (const m of snapshot.measurements as Array<Record<string, unknown>>) {
    if (String(m.size ?? '') !== baseSize) continue;
    const code = String(m.pom ?? '');
    if (code) map[code] = num(m.value);
  }
  return map;
}

function seamAllowanceMm(snapshot: TechPackSnapshot): number {
  const ops = snapshot.construction as Array<Record<string, unknown>>;
  const sas = ops.map((o) => num(o.seam_allowance_mm, NaN)).filter((n) => Number.isFinite(n));
  if (sas.length === 0) return 6;
  sas.sort((a, b) => a - b);
  return sas[Math.floor(sas.length / 2)];
}

/** Seam lengths in cm, derived from the base-size POMs. */
function seamLengths(pom: Record<string, number>): Array<{ seam: string; lengthCm: number; stitch: string }> {
  const A = pom.A ?? 0;
  const B = pom.B ?? 0;
  const C = pom.C ?? 0;
  const D = pom.D ?? 0;
  const E = pom.E ?? 0;
  const F = pom.F ?? 0;
  const G = pom.G ?? 0;
  void A;
  return [
    { seam: 'shoulder', lengthCm: 2 * ((C - E) / 2), stitch: '504' },
    { seam: 'side', lengthCm: 2 * B, stitch: '504' },
    { seam: 'sleeve underarm', lengthCm: 2 * D, stitch: '504' },
    { seam: 'sleeve set-in', lengthCm: 2 * (D + G), stitch: '504' },
    { seam: 'neck rib', lengthCm: 2 * E, stitch: '607' },
    { seam: 'bottom hem', lengthCm: F, stitch: '406' },
    { seam: 'sleeve hems', lengthCm: 2 * G, stitch: '406' },
  ];
}

/** Pick the stitch type for a seam from the construction ops, by op text. */
function opStitchFor(
  ops: Array<Record<string, unknown>>,
  seam: string,
  fallback: string,
): string {
  const hay = seam.toLowerCase();
  const match = ops.find((o) => {
    const text = `${String(o.area ?? '')} ${String(o.operation ?? '')}`.toLowerCase();
    if (hay.includes('shoulder')) return text.includes('shoulder');
    if (hay.includes('side')) return text.includes('side');
    if (hay.includes('underarm')) return text.includes('underarm') || text.includes('side');
    if (hay.includes('set-in')) return text.includes('sleeve') && (text.includes('set') || text.includes('armscye'));
    if (hay.includes('neck')) return text.includes('neck');
    if (hay.includes('bottom hem')) return text.includes('bottom') || text.includes('hem');
    if (hay.includes('sleeve hem')) return text.includes('sleeve') && text.includes('hem');
    return false;
  });
  return match ? String(match.stitch_type ?? fallback) : fallback;
}

export function computeBomLedger(
  snapshot: TechPackSnapshot,
  materialsById: Map<string, LedgerMaterial>,
  settings: BomLedgerSettings = DEFAULT_BOM_LEDGER_SETTINGS,
): BomLedger {
  const tp = snapshot.tech_pack as Record<string, unknown>;
  const sizeRange = (snapshot.size_range as Record<string, unknown> | null) ?? null;
  const baseSize = String(sizeRange?.base_size ?? 'M');
  const pom = pomMap(snapshot, baseSize);
  const notes: string[] = [];

  const ops = snapshot.construction as Array<Record<string, unknown>>;
  const hasOps = ops.length > 0;
  if (!hasOps) {
    notes.push(
      `Revision ${String(tp.revision ?? '')} carries no construction ops — thread is computed from POM seam lengths at the blended default factor ${DEFAULT_THREAD_FACTOR}×, not from per-op stitch types.`,
    );
  }

  const saMm = seamAllowanceMm(snapshot);
  const sa = saMm / 10; // cm
  const A = pom.A ?? 0;
  const B = pom.B ?? 0;
  const C = pom.C ?? 0;
  const D = pom.D ?? 0;
  const E = pom.E ?? 0;
  const F = pom.F ?? 0;
  const G = pom.G ?? 0;
  const H = pom.H ?? 0;
  const missing = ['A', 'B', 'C', 'D', 'E', 'F', 'G'].filter((k) => !(pom[k] > 0));
  if (missing.length > 0) {
    notes.push(`Missing base-size POM values: ${missing.join(', ')} — fabric areas use 0 for those pieces.`);
  }

  // ── Piece areas (cm²) ──────────────────────────────────────────────
  const frontCm2 = (A + 2 * sa) * (B + sa);
  const backCm2 = frontCm2;
  const sleeveTopCm = A - C + G + 2 * sa;
  const sleeveHemCm = G + 2 * sa;
  const sleeveCm2 = (D + sa) * ((sleeveTopCm + sleeveHemCm) / 2);
  const netCm2 = frontCm2 + backCm2 + 2 * sleeveCm2;
  const netM2 = netCm2 / 10000;

  const widthM = settings.fabricWidthCm / 100;
  const markerLengthM = widthM > 0 && settings.markerEfficiency > 0 ? netM2 / widthM / settings.markerEfficiency : 0;
  const grossM2 = markerLengthM * widthM * (1 + settings.wastePct);

  // ── Thread (m) ─────────────────────────────────────────────────────
  const seams = seamLengths(pom).map((s) => ({
    ...s,
    stitch: hasOps ? opStitchFor(ops, s.seam, s.stitch) : s.stitch,
  }));
  const threadM = seams.reduce(
    (sum, s) => sum + s.lengthCm / 100 * (THREAD_FACTOR[s.stitch] ?? DEFAULT_THREAD_FACTOR),
    0,
  );
  const totalSeamM = seams.reduce((sum, s) => sum + s.lengthCm / 100, 0);

  const lines: BomLedgerLine[] = [];
  for (const raw of snapshot.bom as BomRow[]) {
    const material = raw.material_id ? materialsById.get(raw.material_id) : undefined;
    const kind = String(raw.kind ?? material?.kind ?? '');
    const description = String(raw.description ?? material?.name ?? 'BOM line');
    const uom = String(raw.uom ?? material?.uom ?? 'pc');
    const enteredQty = num(raw.quantity);
    const enteredUnitCost = num(raw.unit_cost);
    const enteredExt = enteredQty * enteredUnitCost;
    const isThread = /thread/i.test(description) || /thread/i.test(String(material?.name ?? ''));
    const isFabricByWeight = kind === 'fabric' && uom === 'kg' && num(material?.weight_gsm) > 0;

    if (isFabricByWeight && !isThread) {
      // Shell fabric: the weight-computed line. Rib is priced per pc, so it
      // falls through to the count branch below.
      const gsm = num(material?.weight_gsm);
      const kg = (grossM2 * gsm) / 1000;
      const computedExt = kg * enteredUnitCost;
      lines.push({
        bomLineId: raw.id ?? null,
        materialId: raw.material_id ?? null,
        kind,
        description,
        uom: 'kg',
        enteredQty,
        enteredUnitCost,
        enteredExt,
        computedQty: round4(kg),
        computedExt,
        basis:
          `Pieces (base ${baseSize}, SA ${saMm} mm): front ${(frontCm2 / 10000).toFixed(3)} m² + back ${(backCm2 / 10000).toFixed(3)} m² + 2 sleeves ${(2 * sleeveCm2 / 10000).toFixed(3)} m² = ${netM2.toFixed(3)} m² net. ` +
          `Marker ${markerLengthM.toFixed(3)} m at ${settings.fabricWidthCm} cm width, ${Math.round(settings.markerEfficiency * 100)}% efficiency, +${Math.round(settings.wastePct * 100)}% waste = ${grossM2.toFixed(3)} m² gross. ` +
          `× ${gsm} gsm = ${kg.toFixed(4)} kg.`,
        status: 'computed',
        canApply: true,
      });
      continue;
    }

    if (isThread) {
      const texMatch = String(material?.name ?? description).match(/Tex\s*(\d+)/i);
      const tex = texMatch ? Number(texMatch[1]) : 40;
      const grams = (threadM * tex) / 1000;
      lines.push({
        bomLineId: raw.id ?? null,
        materialId: raw.material_id ?? null,
        kind,
        description,
        uom,
        enteredQty,
        enteredUnitCost,
        enteredExt,
        computedQty: null,
        computedExt: enteredExt,
        basis:
          `Seams ${totalSeamM.toFixed(2)} m total (shoulder, side, underarm, set-in, neck, hems) × stitch factors = ${threadM.toFixed(1)} m thread, Tex ${tex} = ${grams.toFixed(2)} g. ` +
          `Entered line is a flat per-garment allocation (1 pc), not a consumption — cost stands as entered.`,
        status: 'uncomputed',
        canApply: false,
      });
      continue;
    }

    if (kind === 'fabric' && uom === 'pc') {
      // Rib band, priced per piece: 1 per garment. Show the band math as the check.
      const bandLengthCm = 2 * E + 2 * sa;
      lines.push({
        bomLineId: raw.id ?? null,
        materialId: raw.material_id ?? null,
        kind,
        description,
        uom: 'pc',
        enteredQty,
        enteredUnitCost,
        enteredExt,
        computedQty: 1,
        computedExt: enteredUnitCost,
        basis:
          `1 band per garment. Band ${(bandLengthCm).toFixed(1)} cm long × ${H > 0 ? `${H} cm high (POM H)` : 'rib height'} — priced per piece, so quantity is a count, not a weight.`,
        status: 'count',
        canApply: false,
      });
      continue;
    }

    if (kind === 'label' || kind === 'trim') {
      lines.push({
        bomLineId: raw.id ?? null,
        materialId: raw.material_id ?? null,
        kind,
        description,
        uom,
        enteredQty,
        enteredUnitCost,
        enteredExt,
        computedQty: 1,
        computedExt: enteredUnitCost,
        basis: '1 per garment, from the construction spec.',
        status: 'count',
        canApply: false,
      });
      continue;
    }

    lines.push({
      bomLineId: raw.id ?? null,
      materialId: raw.material_id ?? null,
      kind,
      description,
      uom,
      enteredQty,
      enteredUnitCost,
      enteredExt,
      computedQty: null,
      computedExt: enteredExt,
      basis: 'No derivation for this line — entered value stands.',
      status: 'uncomputed',
      canApply: false,
    });
  }

  const enteredTotal = lines.reduce((s, l) => s + l.enteredExt, 0);
  const computedTotal = lines.reduce((s, l) => s + l.computedExt, 0);
  return {
    techPackId: String(tp.id ?? ''),
    baseSize,
    settings,
    lines,
    enteredTotal,
    computedTotal,
    notes,
  };
}

export function parseLedgerSettings(search: URLSearchParams): BomLedgerSettings {
  const widthRaw = search.get('fabricWidthCm');
  const effRaw = search.get('markerEfficiency');
  const wasteRaw = search.get('wastePct');
  // NOTE: Number(null) is 0, so an absent param must fall back to the
  // default explicitly — 0 is a valid waste value, not "not provided".
  const width = widthRaw === null ? NaN : Number(widthRaw);
  const eff = effRaw === null ? NaN : Number(effRaw);
  const waste = wasteRaw === null ? NaN : Number(wasteRaw);
  return {
    fabricWidthCm: Number.isFinite(width) && width > 0 ? width : DEFAULT_BOM_LEDGER_SETTINGS.fabricWidthCm,
    markerEfficiency:
      Number.isFinite(eff) && eff > 0 && eff <= 1
        ? eff
        : Number.isFinite(eff) && eff > 1 && eff <= 100
          ? eff / 100
          : DEFAULT_BOM_LEDGER_SETTINGS.markerEfficiency,
    wastePct:
      Number.isFinite(waste) && waste >= 0 && waste <= 1
        ? waste
        : Number.isFinite(waste) && waste > 1 && waste <= 100
          ? waste / 100
          : DEFAULT_BOM_LEDGER_SETTINGS.wastePct,
  };
}
