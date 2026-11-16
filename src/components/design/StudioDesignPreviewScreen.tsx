/* eslint-disable react-hooks/rules-of-hooks */
import { useEffect, useMemo, useState } from 'react';
import type { DomainKey } from '@/data/shellData';
import { useDesignCanvas } from '@/lib/designCanvasStore';
import type { TechPackSnapshot } from '@/lib/techPackTypes';

/**
 * Studio Design Preview — a 1:1 port of design_preview.html, wired to the
 * live routes. Three tabs over one design:
 *   Mockup — the Konva-style render pipeline (design_queue position,
 *     design_renders rows, print zone from product_canvas_templates) with
 *     the design's freehand layers drawn on the flat.
 *   Tech pack — the 4-sheet document (Cover / Spec / Construction+QC /
 *     Revisions) hydrated from the design's latest tech pack snapshot.
 *   Downstream — the live chain Design → tech pack → RFQ → award → PO.
 *     The award and PO nodes show the REAL award (rfq_awards) and the REAL
 *     PO (erp_purchase_orders via rfq_awards.purchase_order_id) — the fix
 *     for the preview screen's static "Not yet created" line.
 * No render worker runs yet, so enqueued renders stay queued — the screen
 * says so instead of faking a finished render.
 */

const FRONT_BODY =
  'M 85 85 L 60 105 L 35 170 L 60 180 L 75 155 L 75 355 L 245 355 L 245 155 L 260 180 L 285 170 L 260 105 L 235 85 L 200 65 L 190 68 Q 160 92 130 68 L 120 65 Z';
const BACK_BODY =
  'M 85 85 L 60 105 L 35 170 L 60 180 L 75 155 L 75 355 L 245 355 L 245 155 L 260 180 L 285 170 L 260 105 L 235 85 L 200 65 Q 160 45 120 65 Z';

/* Print zones from design_preview.html (400×500 space), scaled ×1.5 into
 * this screen's 600×800 viewer: front 110×140 @ (145,180), back 80×60 @
 * (160,130). A product_canvas_templates row overrides them when one is on
 * file for the blank. */
const ZONE_FRONT = { x: 217, y: 270, w: 165, h: 210 };
const ZONE_BACK = { x: 240, y: 195, w: 120, h: 90 };

type ViewKey = 'front' | 'back';
type Layer = {
  id: string;
  type: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation?: number;
  opacity?: number;
  visible?: boolean;
  fill?: string;
  shape?: string;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: number | string;
  imageUrl?: string | null;
  svgContent?: string | null;
  pathD?: string;
  strokeWidth?: number;
  pattern?: string;
};

type DesignRow = {
  id: string;
  name: string;
  blankId: string | null;
  status: string;
  canvasState: Record<string, unknown>;
  garmentColor: string | null;
  productType: string | null;
};

type PackRow = {
  id: string;
  revision: number;
  status: string;
  style_number: string | null;
  title: string | null;
  created_at: string;
};

type RenderRow = {
  id: string;
  kind: string;
  view_angle: string;
  color: string | null;
  input_hash: string | null;
  renderer_version: string | null;
  storage_path: string | null;
  status: string;
  attempts: number;
  created_at: string;
  finished_at: string | null;
  error: string | null;
  last_error: string | null;
};

type RendersPayload = {
  queuePosition: number | null;
  queue: Array<Record<string, unknown>>;
  renders: RenderRow[];
  template: {
    view_angle: string;
    normalized_x: number | null;
    normalized_y: number | null;
    normalized_width: number | null;
    normalized_height: number | null;
  } | null;
};

type RfqRow = {
  id: string;
  rfq_number: string;
  title: string;
  status: string;
  deadline_at?: string | null;
  response_deadline?: string | null;
  created_at: string;
};

type BoardPayload = {
  rfq: Record<string, unknown>;
  lines: Array<Record<string, unknown>>;
  invitations: Array<Record<string, unknown>>;
  bids: Array<Record<string, unknown>>;
  awards: Array<Record<string, unknown>>;
};

const money = (n: number) => `$${n.toFixed(2)}`;
const fmtDate = (iso: string | null | undefined) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

function shapeSvg(shape: string, w: number, h: number, fill: string): string {
  switch (shape) {
    case 'circle':
      return `<ellipse cx="${w / 2}" cy="${h / 2}" rx="${w / 2}" ry="${h / 2}" fill="${fill}"/>`;
    case 'triangle':
      return `<polygon points="${w / 2},0 ${w},${h} 0,${h}" fill="${fill}"/>`;
    case 'star': {
      const cx = w / 2;
      const cy = h / 2;
      const outer = Math.min(w, h) / 2;
      const inner = outer * 0.45;
      const pts: string[] = [];
      for (let i = 0; i < 10; i++) {
        const r = i % 2 === 0 ? outer : inner;
        const a = (Math.PI / 5) * i - Math.PI / 2;
        pts.push(`${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`);
      }
      return `<polygon points="${pts.join(' ')}" fill="${fill}"/>`;
    }
    case 'arrow': {
      const m = Math.min(w, h);
      return `<path d="M 0 ${m / 2} L ${w * 0.75} ${m / 2} M ${w * 0.6} ${m / 4} L ${w} ${m / 2} L ${w * 0.6} ${m * 3 / 4}" stroke="${fill}" stroke-width="${m / 10}" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`;
    }
    case 'line': {
      const m = Math.min(w, h);
      return `<path d="M 0 ${m / 2} L ${w} ${m / 2}" stroke="${fill}" stroke-width="${m / 10}" stroke-linecap="round"/>`;
    }
    default:
      return `<rect width="${w}" height="${h}" fill="${fill}"/>`;
  }
}

/* Per-operation technical diagrams from design_preview.html, matched by
 * operation text. A pack op with no match renders without an illustration. */
const OP_ILLUSTRATIONS: Array<{ match: RegExp; svg: string }> = [
  {
    match: /shoulder/i,
    svg: `<svg viewBox="0 0 300 180"><path d="M 20 60 L 150 60 L 150 140 L 20 140 Z" fill="#faf9fc" stroke="#1a1c1e" stroke-width="1.5"/><path d="M 150 60 L 280 60 L 280 140 L 150 140 Z" fill="#f4f3f7" stroke="#1a1c1e" stroke-width="1.5"/><path d="M 145 70 L 155 78 M 145 80 L 155 88 M 145 90 L 155 98 M 145 100 L 155 108 M 145 110 L 155 118 M 145 120 L 155 128 M 145 130 L 155 138" stroke="#0a6400" stroke-width="2" stroke-linecap="round"/><text x="150" y="45" text-anchor="middle" font-family="Inter" font-size="9" font-weight="700" fill="#6f7a69">RIGHT SIDES TOGETHER</text><text x="150" y="165" text-anchor="middle" font-family="Inter" font-size="9" font-weight="700" fill="#0077c5">SA 6mm</text></svg>`,
  },
  {
    match: /neck/i,
    svg: `<svg viewBox="0 0 300 180"><path d="M 30 90 Q 150 40 270 90" fill="none" stroke="#1a1c1e" stroke-width="2"/><path d="M 30 90 Q 150 40 270 90 L 270 110 Q 150 60 30 110 Z" fill="#f4f3f7" stroke="#1a1c1e" stroke-width="1.5"/><path d="M 50 92 L 50 105 M 70 85 L 70 100 M 90 78 L 90 95 M 110 73 L 110 90 M 130 70 L 130 88 M 150 68 L 150 86 M 170 70 L 170 88 M 190 73 L 190 90 M 210 78 L 210 95 M 230 85 L 230 100 M 250 92 L 250 105" stroke="#0a6400" stroke-width="2"/><text x="150" y="140" text-anchor="middle" font-family="Inter" font-size="9" font-weight="700" fill="#6f7a69">RIBBED NECKLINE · 1:1 STRETCH</text></svg>`,
  },
  {
    match: /sleeve.*set|armscye/i,
    svg: `<svg viewBox="0 0 300 180"><path d="M 60 40 L 200 40 L 200 160 L 60 160 Z" fill="#faf9fc" stroke="#1a1c1e" stroke-width="1.5"/><path d="M 200 40 Q 250 80 200 160" fill="none" stroke="#1a1c1e" stroke-width="2"/><path d="M 200 40 Q 250 80 200 160 L 260 170 Q 300 100 260 50 Z" fill="#f4f3f7" stroke="#1a1c1e" stroke-width="1.5"/><circle cx="230" cy="80" r="3" fill="#0a6400"/><circle cx="215" cy="65" r="3" fill="#0a6400"/><circle cx="215" cy="135" r="3" fill="#0a6400"/><text x="150" y="175" text-anchor="middle" font-family="Inter" font-size="9" font-weight="700" fill="#6f7a69">NOTCH-MATCHED ARMSCCYE</text></svg>`,
  },
  {
    match: /side|sleeve.*seam|underarm/i,
    svg: `<svg viewBox="0 0 300 180"><path d="M 100 30 L 100 150 L 60 150 L 60 30 Z" fill="#faf9fc" stroke="#1a1c1e" stroke-width="1.5"/><path d="M 100 30 L 100 150 L 140 150 L 140 30 Z" fill="#f4f3f7" stroke="#1a1c1e" stroke-width="1.5"/><path d="M 95 40 L 105 48 M 95 50 L 105 58 M 95 60 L 105 68 M 95 70 L 105 78 M 95 80 L 105 88 M 95 90 L 105 98 M 95 100 L 105 108 M 95 110 L 105 118 M 95 120 L 105 128 M 95 130 L 105 138 M 95 140 L 105 148" stroke="#0a6400" stroke-width="2"/><text x="150" y="95" font-family="Inter" font-size="9" font-weight="700" fill="#6f7a69">SIDE + SLEEVE</text><text x="115" y="165" font-family="Inter" font-size="9" font-weight="700" fill="#0077c5">ONE PASS</text></svg>`,
  },
  {
    match: /sleeve.*hem/i,
    svg: `<svg viewBox="0 0 300 180"><path d="M 50 70 L 250 70 L 250 130 L 50 130 Z" fill="#f4f3f7" stroke="#1a1c1e" stroke-width="1.5"/><path d="M 50 100 L 250 100" stroke="#0077c5" stroke-width="1" stroke-dasharray="4 3"/><path d="M 50 110 L 250 110 M 50 120 L 250 120" stroke="#0a6400" stroke-width="2"/><circle cx="80" cy="110" r="3" fill="#0a6400"/><circle cx="80" cy="120" r="3" fill="#0a6400"/><text x="150" y="150" text-anchor="middle" font-family="Inter" font-size="9" font-weight="700" fill="#6f7a69">TWIN NEEDLE · 6mm + 6mm</text></svg>`,
  },
  {
    match: /hem/i,
    svg: `<svg viewBox="0 0 300 180"><path d="M 40 40 L 260 40 L 260 150 L 40 150 Z" fill="#f4f3f7" stroke="#1a1c1e" stroke-width="1.5"/><path d="M 40 120 L 260 120" stroke="#0077c5" stroke-width="1" stroke-dasharray="4 3"/><path d="M 40 130 L 260 130 M 40 140 L 260 140" stroke="#0a6400" stroke-width="2"/><circle cx="70" cy="130" r="3" fill="#0a6400"/><circle cx="70" cy="140" r="3" fill="#0a6400"/><text x="150" y="168" text-anchor="middle" font-family="Inter" font-size="9" font-weight="700" fill="#6f7a69">BOTTOM HEM · FLAT</text></svg>`,
  },
];

const QC_CHECKLIST = [
  'Measure chest width (A) flat. Must fall within ±1 cm of spec for the labeled size.',
  'Confirm SPI ≥ 10 on all overlock seams and ≥ 8 on all coverstitch seams.',
  'Inspect neck rib attach — no skipped stitches, no puckering, sits flat when garment laid flat.',
  'Confirm neck label is centered to the back neckline seam within ±3 mm.',
  'Confirm size label is at left side seam, 5 cm above the hem.',
  'Confirm care label is inside left side seam, 2 cm from bottom hem.',
  'Check sleeve and bottom hems — no tunneling, no needle holes, hem sits flat.',
  'Trim all thread tails, no loose ends > 3 mm.',
  'No oil stains, no needle marks, no color bleed across seams.',
  'Confirm print registration — colors align to within ±1.5 mm of the master artwork.',
];

const AQL_ROWS: Array<[string, string, string, string, string, string]> = [
  ['1–150', '8', '0', '1', '1', '2'],
  ['151–500', '20', '1', '2', '2', '3'],
  ['501–1,200', '32', '1', '2', '3', '4'],
  ['1,201–3,200', '50', '2', '3', '5', '6'],
];

const badge = (status: string) => {
  switch (status) {
    case 'done':
    case 'succeeded':
      return 'bg-[#8af5be] text-[#00714b]';
    case 'rendering':
    case 'running':
    case 'queued':
      return 'bg-[#e8f0fb] text-[#0055a5]';
    case 'failed':
      return 'bg-[#ffdad6] text-[#ba1a1a]';
    default:
      return 'bg-[#fff4dc] text-[#8a5a00]';
  }
};

function LayerSvg({ layer, view }: { layer: Layer; view: ViewKey }) {
  return (
    <g
      transform={`translate(${layer.x} ${layer.y}) rotate(${layer.rotation || 0} ${layer.w / 2} ${layer.h / 2})`}
      opacity={layer.opacity}
    >
      {layer.type === 'shape' && <g dangerouslySetInnerHTML={{ __html: shapeSvg(layer.shape ?? 'rect', layer.w, layer.h, layer.fill ?? '#1a1c1e') }} />}
      {layer.type === 'text' && (
        <text x="0" y={layer.fontSize ?? 40} fontFamily={layer.fontFamily ?? 'Inter'} fontWeight={layer.fontWeight ?? 400} fontSize={layer.fontSize ?? 40} fill={layer.fill ?? '#1a1c1e'}>
          {layer.text ?? 'Text'}
        </text>
      )}
      {layer.type === 'image' && layer.svgContent && (
        <g color={layer.fill} dangerouslySetInnerHTML={{ __html: `<svg viewBox="0 0 100 100" width="${layer.w}" height="${layer.h}">${layer.svgContent}</svg>` }} />
      )}
      {layer.type === 'image' && !layer.svgContent && layer.imageUrl && (
        <image href={layer.imageUrl} x="0" y="0" width={layer.w} height={layer.h} preserveAspectRatio="xMidYMid meet" />
      )}
      {layer.type === 'path' && (
        <path d={layer.pathD ?? ''} fill="none" stroke={layer.fill ?? '#1a1c1e'} strokeWidth={layer.strokeWidth ?? 3} strokeLinecap="round" strokeLinejoin="round" transform={`translate(${-layer.x} ${-layer.y})`} />
      )}
      {layer.type === 'pattern' && <rect width={layer.w} height={layer.h} fill={layer.fill ?? '#1a1c1e'} opacity="0.6" />}
    </g>
  );
}

export default function StudioDesignPreviewScreen({
  onToast,
  onNavigate,
}: {
  onToast: (message: string) => void;
  onNavigate: (domain: DomainKey, screenId: string) => void;
}) {
  const storeDesignId = useDesignCanvas((s) => s.designId);
  const storeTechPackId = useDesignCanvas((s) => s.techPackId);
  const openTechPack = useDesignCanvas((s) => s.openTechPack);

  const [tab, setTab] = useState<'mockup' | 'techpack' | 'downstream'>('mockup');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [design, setDesign] = useState<DesignRow | null>(null);
  const [pack, setPack] = useState<PackRow | null>(null);
  const [snap, setSnap] = useState<TechPackSnapshot | null>(null);
  const [materials, setMaterials] = useState<Record<string, { name: string; weight_gsm: number | null }>>({});
  const [seasons, setSeasons] = useState<Record<string, string>>({});
  const [renders, setRenders] = useState<RendersPayload | null>(null);
  const [rfqs, setRfqs] = useState<RfqRow[]>([]);
  const [board, setBoard] = useState<BoardPayload | null>(null);
  const [po, setPo] = useState<Record<string, unknown> | null>(null);
  const [view, setView] = useState<ViewKey>('front');
  const [rendering, setRendering] = useState(false);
  const [busy, setBusy] = useState(false);

  const freehand = useMemo(() => {
    const cs = (design?.canvasState ?? {}) as {
      freehand?: { views?: Record<string, Layer[]>; blankName?: string; activeColorwayId?: string | null };
    };
    return cs.freehand ?? {};
  }, [design]);
  const views = useMemo<Record<ViewKey, Layer[]>>(
    () => ({
      front: (freehand.views?.front ?? []).filter((l) => l.visible !== false),
      back: (freehand.views?.back ?? []).filter((l) => l.visible !== false),
    }),
    [freehand],
  );
  const layerCount = views.front.length + views.back.length;

  const loadRenders = async (designId: string) => {
    const res = await fetch(`/api/v1/designs/${designId}/renders`);
    if (res.ok) setRenders((await res.json()) as RendersPayload);
  };

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        // Resolve the design: the store's open design, else the open tech
        // pack's design.
        let designId = storeDesignId;
        let packSnap: TechPackSnapshot | null = null;
        if (!designId && storeTechPackId) {
          const snapRes = await fetch(`/api/v1/tech-packs/${storeTechPackId}`);
          if (snapRes.ok) {
            packSnap = (await snapRes.json()) as TechPackSnapshot;
            designId = String((packSnap.design as Record<string, unknown> | null)?.id ?? '');
          }
        }
        if (!designId) {
          if (!cancelled) {
            setDesign(null);
            setLoading(false);
          }
          return;
        }
        const [designRes, packsRes, rendersRes, matRes, seasonRes] = await Promise.all([
          fetch(`/api/v1/designs/${designId}`),
          fetch(`/api/v1/tech-packs?designId=${designId}`),
          fetch(`/api/v1/designs/${designId}/renders`),
          fetch('/api/v1/materials'),
          fetch('/api/v1/seasons'),
        ]);
        if (!designRes.ok) throw new Error(`Design load failed (${designRes.status}).`);
        const d = (await designRes.json()).design as DesignRow & { canvasState: Record<string, unknown> };
        if (cancelled) return;
        setDesign({
          id: d.id,
          name: d.name,
          blankId: d.blankId ?? null,
          status: d.status,
          canvasState: (d.canvasState ?? {}) as Record<string, unknown>,
          garmentColor: d.garmentColor ?? null,
          productType: d.productType ?? null,
        });
        const packs = (((await packsRes.json()).items ?? []) as PackRow[]).sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
        // Prefer the pack the user actually opened (the editor sets
        // storeTechPackId); otherwise the newest. Without this the screen
        // would show an archived rev 12 when opened from approved rev 7.
        const latest =
          (storeTechPackId ? packs.find((p) => p.id === storeTechPackId) : undefined) ?? packs[0] ?? null;
        setPack(latest);
        if (rendersRes.ok) setRenders((await rendersRes.json()) as RendersPayload);
        if (matRes.ok) {
          const map: Record<string, { name: string; weight_gsm: number | null }> = {};
          for (const m of ((await matRes.json()).items ?? []) as Array<Record<string, unknown>>) {
            map[String(m.id)] = { name: String(m.name ?? ''), weight_gsm: (m.weight_gsm as number | null) ?? null };
          }
          setMaterials(map);
        }
        if (seasonRes.ok) {
          const map: Record<string, string> = {};
          for (const s of ((await seasonRes.json()).items ?? []) as Array<Record<string, unknown>>) {
            map[String(s.id)] = String(s.name ?? '');
          }
          setSeasons(map);
        }
        if (latest) {
          const [snapRes2, rfqRes] = await Promise.all([
            fetch(`/api/v1/tech-packs/${latest.id}`),
            fetch(`/api/v1/rfqs?techPackId=${latest.id}`),
          ]);
          if (snapRes2.ok && !cancelled) setSnap((await snapRes2.json()) as TechPackSnapshot);
          if (rfqRes.ok) {
            const list = (((await rfqRes.json()).items ?? []) as RfqRow[]).sort(
              (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
            );
            if (!cancelled) setRfqs(list);
            const latestRfq = list[0];
            if (latestRfq) {
              const boardRes = await fetch(`/api/v1/rfqs/${latestRfq.id}`);
              if (boardRes.ok) {
                const b = (await boardRes.json()) as BoardPayload;
                if (!cancelled) setBoard(b);
                const award = (b.awards ?? [])[0] as Record<string, unknown> | undefined;
                const poId = award?.purchase_order_id as string | undefined;
                if (poId) {
                  const poRes = await fetch(`/api/v1/purchase-orders/${poId}`);
                  if (poRes.ok && !cancelled) {
                    const detail = ((await poRes.json()).data ?? {}) as Record<string, unknown>;
                    setPo(detail);
                  }
                }
              }
            }
          }
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load the design preview.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeDesignId, storeTechPackId]);

  const bomTotal = useMemo(
    () => (snap?.bom ?? []).reduce((s, b) => s + Number(b.quantity ?? 0) * Number(b.unit_cost ?? 0), 0),
    [snap],
  );
  const pomCount = useMemo(() => new Set((snap?.measurements ?? []).map((m) => m.pom)).size, [snap]);
  const award = useMemo(() => (board?.awards ?? [])[0] as Record<string, unknown> | undefined, [board]);
  const latestRfq = rfqs[0] ?? null;
  const awardVendorName = useMemo(() => {
    if (!award) return null;
    const bid = (board?.bids ?? []).find((b) => String(b.id) === String(award.bid_id)) as Record<string, unknown> | undefined;
    if (bid?.vendor_name) return String(bid.vendor_name);
    const inv = (board?.invitations ?? []).find((i) => String(i.vendor_id) === String(award.vendor_id)) as Record<string, unknown> | undefined;
    return (inv?.vendor_name as string | undefined) ?? null;
  }, [award, board]);
  const awardBid = useMemo(
    () => (board?.bids ?? []).find((b) => String(b.id) === String(award?.bid_id)) as Record<string, unknown> | undefined,
    [award, board],
  );
  const completedNodes = useMemo(
    () => [Boolean(design), Boolean(pack), Boolean(latestRfq), Boolean(award), Boolean(po)].filter(Boolean).length,
    [design, pack, latestRfq, award, po],
  );

  const zone = useMemo(() => {
    const t = renders?.template;
    if (t && t.normalized_x != null && t.normalized_y != null && t.normalized_width != null && t.normalized_height != null) {
      return {
        x: t.normalized_x * 600,
        y: t.normalized_y * 800,
        w: t.normalized_width * 600,
        h: t.normalized_height * 800,
        fromTemplate: true,
      };
    }
    const z = view === 'front' ? ZONE_FRONT : ZONE_BACK;
    return { ...z, fromTemplate: false };
  }, [renders, view]);

  const reRender = async () => {
    if (!design || rendering) return;
    setRendering(true);
    try {
      const res = await fetch(`/api/v1/designs/${design.id}/renders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ view, color: design.garmentColor ?? '' }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? 'Failed to queue render.');
      onToast(`Render queued — position ${body.queuePosition ?? '—'} in the queue`);
      await loadRenders(design.id);
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Failed to queue render.');
    } finally {
      setRendering(false);
    }
  };

  const retryFailed = async () => {
    if (!design) return;
    const failed = (renders?.renders ?? []).find((r) => r.status === 'failed');
    if (!failed) {
      onToast('No failed renders to retry.');
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/designs/${design.id}/renders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'retry', renderId: failed.id }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? 'Failed to retry render.');
      onToast(`Retrying render — attempt ${(failed.attempts ?? 0) + 1}`);
      await loadRenders(design.id);
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Failed to retry render.');
    } finally {
      setBusy(false);
    }
  };

  const generate3D = async () => {
    if (!design) return;
    setBusy(true);
    try {
      const res = await fetch(`/api/v1/designs/${design.id}/renders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate3d', view }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error?.message ?? 'Failed to queue 3D mockup.');
      onToast('3D mockup queued — craft_jobs kind=mockup_render');
      void body;
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Failed to queue 3D mockup.');
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-[13px] text-on-surface-variant">Loading design preview…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-6">
        <p className="text-[13px] text-[#ba1a1a]">{error}</p>
        <button className="mt-3 h-8 px-3 border border-surface-dim rounded text-[12px] font-semibold" onClick={() => onNavigate('design', 'freehand-designer')}>
          Back to designer
        </button>
      </div>
    );
  }
  if (!design) {
    return (
      <div className="p-6 max-w-[560px]">
        <h2 className="text-[18px] font-semibold">No design selected</h2>
        <p className="text-[13px] text-on-surface-variant mt-2">
          The design preview shows one design&apos;s mockup, tech pack and downstream chain. Open a design in the freehand designer or a tech pack first.
        </p>
        <button className="mt-4 h-8 px-3 rounded bg-[#0a6400] text-white text-[12px] font-semibold" onClick={() => onNavigate('design', 'freehand-designer')}>
          Open freehand designer
        </button>
      </div>
    );
  }

  const tp = (snap?.tech_pack ?? {}) as Record<string, unknown>;
  const sizeRange = (snap?.size_range ?? {}) as Record<string, unknown>;
  const sizes = (sizeRange.sizes as string[] | undefined) ?? [];
  const baseSize = String(sizeRange.base_size ?? 'M');
  const seasonName = tp.season_id ? seasons[String(tp.season_id)] ?? '' : '';
  const shellLine = (snap?.bom ?? []).find((b) => String(b.kind) === 'fabric' && String(b.uom) === 'kg') as Record<string, unknown> | undefined;
  const shellMat = shellLine?.material_id ? materials[String(shellLine.material_id)] : undefined;
  const renderStatus = (renders?.renders ?? []).find((r) => r.view_angle === view)?.status ?? 'none';
  const failedCount = (renders?.renders ?? []).filter((r) => r.status === 'failed').length;
  const renderDuration = (r: RenderRow) =>
    r.finished_at && r.created_at ? `${((new Date(r.finished_at).getTime() - new Date(r.created_at).getTime()) / 1000).toFixed(1)}s` : '—';

  return (
    <div className="min-h-full bg-[#faf9fc]">
      {/* Chrome */}
      <div className="h-[52px] bg-white border-b border-[#dad9dd] flex items-center justify-between px-5 shrink-0 sticky top-0 z-40">
        <div className="flex items-center gap-2.5 text-[13px]">
          <span className="material-symbols-outlined text-[18px] text-[#6f7a69]">preview</span>
          <strong>{design.name}</strong>
          <span className="text-[#6f7a69]">·</span>
          <span className="text-[#6f7a69]">Preview</span>
          <span className="text-[#6f7a69]">·</span>
          <span className={`px-2 py-[3px] rounded-[10px] text-[10px] font-bold uppercase tracking-wide ${badge(pack?.status ?? design.status)}`}>
            {design.status}
            {pack ? ` · Rev ${pack.revision}` : ''}
          </span>
        </div>
        <div className="flex gap-1.5">
          <button
            className="h-8 px-3 rounded-md text-[12px] font-semibold flex items-center gap-1.5 hover:bg-[#f4f3f7]"
            onClick={() => {
              void navigator.clipboard?.writeText(window.location.href);
              onToast('Share link copied');
            }}
          >
            <span className="material-symbols-outlined text-[16px]">share</span>Share
          </button>
          <button className="h-8 px-3 rounded-md text-[12px] font-semibold border border-[#dad9dd] flex items-center gap-1.5 hover:bg-[#f4f3f7]" onClick={() => window.print()}>
            <span className="material-symbols-outlined text-[16px]">print</span>Print
          </button>
          <button
            className="h-8 px-3 rounded-md text-[12px] font-semibold border border-[#dad9dd] flex items-center gap-1.5 hover:bg-[#f4f3f7]"
            onClick={() => {
              if (pack) {
                openTechPack(pack.id);
                onNavigate('design', 'tech-pack-preview');
              } else {
                onToast('No tech pack yet — create one from this design first.');
              }
            }}
          >
            <span className="material-symbols-outlined text-[16px]">download</span>PDF
          </button>
          <button
            className="h-8 px-3 rounded-md text-[12px] font-semibold bg-[#0a6400] text-white flex items-center gap-1.5 hover:bg-[#108000]"
            onClick={() => {
              if (pack) {
                openTechPack(pack.id);
                onNavigate('design', 'tech-pack-editor');
              } else {
                onNavigate('design', 'freehand-designer');
              }
            }}
          >
            <span className="material-symbols-outlined text-[16px]">edit</span>Edit
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="h-11 bg-[#faf9fc] border-b border-[#dad9dd] flex items-center gap-1 px-5 shrink-0 sticky top-[52px] z-40">
        {(
          [
            { id: 'mockup', label: 'Mockup', icon: 'photo_camera' },
            { id: 'techpack', label: 'Tech pack', icon: 'description' },
            { id: 'downstream', label: 'Downstream', icon: 'account_tree', count: completedNodes },
          ] as const
        ).map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`px-3.5 py-2 rounded-md text-[12px] font-semibold flex items-center gap-1.5 ${tab === t.id ? 'bg-[#1a1c1e] text-white' : 'text-[#6f7a69] hover:bg-white'}`}
          >
            <span className="material-symbols-outlined text-[16px]">{t.icon}</span>
            {t.label}
            {'count' in t && <span className={`px-1.5 py-px rounded-lg text-[10px] ${tab === t.id ? 'bg-white/20' : 'bg-black/10'}`}>{t.count}</span>}
          </button>
        ))}
      </div>

      <div className="bg-white">
        {tab === 'mockup' && (
          <MockupPanel
            design={design}
            blankName={freehand.blankName ?? design.productType ?? 'No blank chosen'}
            views={views}
            view={view}
            setView={setView}
            zone={zone}
            renders={renders}
            renderStatus={renderStatus}
            failedCount={failedCount}
            rendering={rendering}
            busy={busy}
            onReRender={reRender}
            onRetryFailed={retryFailed}
            onGenerate3D={generate3D}
            renderDuration={renderDuration}
          />
        )}
        {tab === 'techpack' && (
          <TechPackPanel
            design={design}
            pack={pack}
            snap={snap}
            materials={materials}
            seasonName={seasonName}
            sizes={sizes}
            baseSize={baseSize}
            bomTotal={bomTotal}
            pomCount={pomCount}
            shellMat={shellMat}
            onCreatePack={() => onNavigate('design', 'tech-packs')}
          />
        )}
        {tab === 'downstream' && (
          <DownstreamPanel
            design={design}
            pack={pack}
            snap={snap}
            bomTotal={bomTotal}
            pomCount={pomCount}
            latestRfq={latestRfq}
            board={board}
            award={award}
            awardVendorName={awardVendorName}
            awardBid={awardBid}
            po={po}
            layerCount={layerCount}
            onNavigate={onNavigate}
            openTechPack={openTechPack}
          />
        )}
      </div>
    </div>
  );
}

function MockupPanel(props: {
  design: DesignRow;
  blankName: string;
  views: Record<ViewKey, Layer[]>;
  view: ViewKey;
  setView: (v: ViewKey) => void;
  zone: { x: number; y: number; w: number; h: number; fromTemplate: boolean };
  renders: RendersPayload | null;
  renderStatus: string;
  failedCount: number;
  rendering: boolean;
  busy: boolean;
  onReRender: () => void;
  onRetryFailed: () => void;
  onGenerate3D: () => void;
  renderDuration: (r: RenderRow) => string;
}) {
  const { design, blankName, views, view, setView, zone, renders, renderStatus, failedCount, rendering, busy } = props;
  const layers = views[view];
  const queuePosition = renders?.queuePosition;
  const recent = renders?.renders ?? [];
  return (
    <div className="bg-[#e9e8eb]">
      <div className="min-h-full p-8 grid grid-cols-[1fr_340px] gap-8">
        <div className="bg-white rounded-lg shadow-[0_4px_24px_rgba(0,0,0,0.08)] overflow-hidden flex flex-col min-h-[640px]">
          <div className="px-4 py-3 border-b border-[#dad9dd] flex items-center justify-between bg-[#faf9fc]">
            <div className="flex items-center gap-2.5">
              <div className="text-[13px] font-semibold">
                {blankName} · {design.garmentColor ?? 'No color'}
              </div>
              <span className={`px-2 py-[3px] rounded-[10px] text-[10px] font-bold uppercase tracking-wide ${badge(renderStatus)}`}>
                {renderStatus === 'none' ? 'Not rendered' : renderStatus}
              </span>
            </div>
            <div className="flex gap-px bg-[#dad9dd] rounded-md p-px">
              {(['front', 'back'] as ViewKey[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={`px-3 py-1 text-[11px] font-semibold rounded ${view === v ? 'bg-[#1a1c1e] text-white' : 'bg-white text-[#6f7a69]'}`}
                >
                  {v === 'front' ? 'Front' : 'Back'}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 bg-[#faf9fc] flex items-center justify-center p-8 relative overflow-hidden">
            <svg viewBox="0 0 600 800" className="max-h-[520px]" role="img" aria-label={`${view} flat`}>
              <g transform="translate(0 25) scale(1.875)">
                <path d={view === 'front' ? FRONT_BODY : BACK_BODY} fill="#f5f2ed" stroke="#1a1c1e" strokeWidth="0.7" />
                <path d="M 75 155 L 75 355 M 245 155 L 245 355 M 75 345 L 245 345" fill="none" stroke="#1a1c1e" strokeWidth="0.4" strokeDasharray="2 2" />
              </g>
              <rect x={zone.x} y={zone.y} width={zone.w} height={zone.h} fill="none" stroke="#0077c5" strokeWidth="1" strokeDasharray="4 3" opacity="0.4" />
              {layers.map((l) => (
                <LayerSvg key={l.id} layer={l} view={view} />
              ))}
              {layers.length === 0 && (
                <text x="300" y="420" textAnchor="middle" fontFamily="Inter" fontSize="14" fontWeight="600" fill="#6f7a69">
                  No layers on the {view} view yet
                </text>
              )}
            </svg>
            {rendering && (
              <div className="absolute inset-0 bg-[#faf9fc]/85 backdrop-blur-[2px] flex items-center justify-center flex-col gap-3 z-10">
                <div className="w-8 h-8 border-[3px] border-[#dad9dd] border-t-[#0a6400] rounded-full animate-spin" />
                <div className="text-[12px] text-[#6f7a69] font-semibold">Queueing mockup…</div>
              </div>
            )}
          </div>
          <div className="px-4 py-2.5 border-t border-[#dad9dd] text-[11px] text-[#6f7a69] flex items-center justify-between">
            <span>
              Print zone {Math.round(zone.w)}×{Math.round(zone.h)} @ ({Math.round(zone.x)},{Math.round(zone.y)}){zone.fromTemplate ? ' · from template' : ' · default zone — no template on file for this blank'}
            </span>
            <span>
              {layers.length} layer{layers.length === 1 ? '' : 's'} on {view}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          <div className="bg-white rounded-lg border border-[#dad9dd] overflow-hidden">
            <div className="px-4 py-3 border-b border-[#dad9dd] flex items-center justify-between bg-[#faf9fc]">
              <div className="text-[11px] font-bold uppercase tracking-wide text-[#6f7a69]">Render queue · design_queue</div>
              <span className="text-[10px] text-[#6f7a69] font-mono">{design.id.slice(0, 8)}</span>
            </div>
            <div className="px-4 py-3.5">
              <div className="flex items-baseline gap-1.5 mb-2.5">
                <span className="text-[22px] font-bold tabular-nums">{queuePosition ?? '—'}</span>
                <span className="text-[11px] text-[#6f7a69]">queued</span>
              </div>
              <div className="text-[11px] text-[#6f7a69] leading-relaxed">
                {queuePosition
                  ? `Position ${queuePosition} = next up. Claimed by render worker every 30s.`
                  : 'This design is not in the render queue. No render worker is running yet, so a queued render waits until a worker claims it.'}
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg border border-[#dad9dd] overflow-hidden">
            <div className="px-4 py-3 border-b border-[#dad9dd] bg-[#faf9fc]">
              <div className="text-[11px] font-bold uppercase tracking-wide text-[#6f7a69]">Recent renders · design_renders</div>
            </div>
            <div className="px-4 py-3.5">
              {recent.length === 0 ? (
                <p className="text-[12px] text-[#6f7a69]">No renders yet — Re-render from canvas queues the first one.</p>
              ) : (
                recent.map((r) => (
                  <div key={r.id} className="grid grid-cols-[32px_1fr_auto] gap-2.5 items-center py-2.5 border-b border-[#dad9dd] last:border-b-0">
                    <div
                      className={`w-8 h-8 rounded flex items-center justify-center text-[16px] ${
                        r.status === 'done' || r.status === 'succeeded'
                          ? 'bg-[#f0fdf4] text-[#0a6400]'
                          : r.status === 'failed'
                            ? 'bg-[#ffdad6] text-[#ba1a1a]'
                            : 'bg-[#e8f0fb] text-[#0077c5]'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[16px]">
                        {r.status === 'done' || r.status === 'succeeded' ? 'check_circle' : r.status === 'failed' ? 'error' : 'autorenew'}
                      </span>
                    </div>
                    <div>
                      <div className="text-[12px] font-semibold capitalize">
                        {r.view_angle} · {r.color || 'no color'}
                      </div>
                      <div className="text-[10px] text-[#6f7a69] font-mono">
                        {r.id.slice(0, 12)} · {props.renderDuration(r)}
                        {r.status === 'failed' && r.last_error ? ` · ${r.last_error.slice(0, 60)}` : ''}
                      </div>
                    </div>
                    <span className={`px-2 py-[2px] rounded-lg text-[9px] font-bold uppercase tracking-wide ${badge(r.status)}`}>{r.status}</span>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-white rounded-lg border border-[#dad9dd] overflow-hidden">
            <div className="px-4 py-3 border-b border-[#dad9dd] bg-[#faf9fc]">
              <div className="text-[11px] font-bold uppercase tracking-wide text-[#6f7a69]">Actions</div>
            </div>
            <div className="px-4 py-3.5 flex flex-col gap-2">
              <button
                className="px-3 py-2.5 rounded-md bg-[#0a6400] text-white text-[12px] font-semibold flex items-center gap-2 hover:bg-[#108000] disabled:opacity-50"
                disabled={rendering || busy}
                onClick={props.onReRender}
              >
                <span className="material-symbols-outlined text-[16px]">refresh</span>
                {rendering ? 'Queueing…' : 'Re-render from canvas'}
              </button>
              <button
                className="px-3 py-2.5 rounded-md border border-[#dad9dd] bg-white text-[12px] font-semibold flex items-center gap-2 hover:border-[#0a6400] hover:bg-[#f0fdf4] disabled:opacity-50"
                disabled={busy || failedCount === 0}
                onClick={props.onRetryFailed}
              >
                <span className="material-symbols-outlined text-[16px]">replay</span>
                Retry failed ({failedCount})
              </button>
              <button
                className="px-3 py-2.5 rounded-md border border-[#dad9dd] bg-white text-[12px] font-semibold flex items-center gap-2 hover:border-[#0a6400] hover:bg-[#f0fdf4] disabled:opacity-50"
                disabled={busy}
                onClick={props.onGenerate3D}
              >
                <span className="material-symbols-outlined text-[16px]">view_in_ar</span>
                Generate 3D mockup
              </button>
              <div className="pt-2 mt-2 border-t border-[#dad9dd]">
                {[
                  ['Template used', renders?.template ? `template · ${renders.template.view_angle}` : 'default flat — no template on file'],
                  ['Print zone', `${Math.round(zone.w)}×${Math.round(zone.h)} @ (${Math.round(zone.x)},${Math.round(zone.y)})`],
                  ['Renderer version', 'konva-v2.4.1'],
                  ['Input hash', recent[0]?.input_hash ? `${recent[0].input_hash.slice(0, 8)}…` : '—'],
                ].map(([k, v]) => (
                  <div key={k} className="flex justify-between py-1 text-[11px]">
                    <span className="text-[#6f7a69]">{k}</span>
                    <span className="font-semibold font-mono text-[10px]">{v}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function TechPackPanel(props: {
  design: DesignRow;
  pack: PackRow | null;
  snap: TechPackSnapshot | null;
  materials: Record<string, { name: string; weight_gsm: number | null }>;
  seasonName: string;
  sizes: string[];
  baseSize: string;
  bomTotal: number;
  pomCount: number;
  shellMat: { name: string; weight_gsm: number | null } | undefined;
  onCreatePack: () => void;
}) {
  const { design, pack, snap, materials, seasonName, sizes, baseSize, bomTotal, pomCount, shellMat } = props;
  if (!pack || !snap) {
    return (
      <div className="bg-[#faf9fc] flex items-center justify-center py-24">
        <div className="text-center max-w-[420px] px-6">
          <span className="material-symbols-outlined text-[48px] text-[#dad9dd] block mb-3">description</span>
          <div className="text-[14px] font-semibold">No tech pack yet</div>
          <p className="text-[12px] text-[#6f7a69] mt-1.5">
            {design.name} has no tech pack. Create one from the design and the document renders here — cover, spec sheet, construction and revisions.
          </p>
          <button className="mt-4 h-8 px-3 rounded bg-[#0a6400] text-white text-[12px] font-semibold" onClick={props.onCreatePack}>
            Go to tech packs
          </button>
        </div>
      </div>
    );
  }
  const tp = snap.tech_pack as Record<string, unknown>;
  const tpNumber = String(tp.tech_pack_number ?? `TP-${String(pack.id).slice(0, 4).toUpperCase()}`);
  const watermark = `TECH PACK · ${tpNumber} · REV ${pack.revision}`;
  // POM grid: group measurements by pom code, ordered by pom_sort.
  const pomRows = useMemo(() => {
    const byPom = new Map<string, { code: string; name: string; sort: number; values: Record<string, number>; tol: number | null }>();
    for (const m of snap.measurements as Array<Record<string, unknown>>) {
      const code = String(m.pom ?? '');
      if (!code) continue;
      const row = byPom.get(code) ?? { code, name: String(m.name ?? code), sort: Number(m.pom_sort ?? 999), values: {}, tol: null };
      row.values[String(m.size ?? '')] = Number(m.value ?? 0);
      if (m.tol_plus != null) row.tol = Number(m.tol_plus);
      byPom.set(code, row);
    }
    return [...byPom.values()].sort((a, b) => a.sort - b.sort);
  }, [snap]);
  const construction = (snap.construction ?? []) as Array<Record<string, unknown>>;
  const revisions = (snap.revisions ?? []) as Array<Record<string, unknown>>;
  const colorways = (snap.colorways ?? []) as Array<Record<string, unknown>>;
  return (
    <div className="bg-[#e9e8eb] p-8">
      <style>{`
        .tp-sheet { background:#fff; max-width:900px; margin:0 auto 24px; padding:44px 52px; box-shadow:0 1px 3px rgba(0,0,0,.08),0 8px 24px rgba(0,0,0,.04); position:relative; }
        .tp-watermark { position:absolute; top:14px; right:22px; font-size:10px; font-weight:700; letter-spacing:.14em; color:#dad9dd; text-transform:uppercase; }
        .tp-footer { border-top:1px solid #dad9dd; margin-top:32px; padding-top:12px; display:flex; justify-content:space-between; font-size:10px; color:#6f7a69; letter-spacing:.05em; }
        .tp-h1 { font-size:30px; font-weight:700; letter-spacing:-.02em; line-height:1.1; margin:6px 0; }
        .tp-h2 { font-size:12px; font-weight:700; letter-spacing:.16em; text-transform:uppercase; color:#0a6400; padding-bottom:8px; border-bottom:2px solid #0a6400; margin:0 0 20px; display:flex; align-items:center; gap:8px; }
        .tp-h3 { font-size:10px; font-weight:700; letter-spacing:.12em; text-transform:uppercase; margin:20px 0 10px; padding-bottom:5px; border-bottom:1px solid #dad9dd; }
        .tp-label { font-size:10px; font-weight:600; letter-spacing:.08em; text-transform:uppercase; color:#6f7a69; margin-bottom:3px; }
        .tp-value { font-size:13px; font-weight:600; }
        .tp-meta { font-size:11px; color:#6f7a69; letter-spacing:.06em; text-transform:uppercase; font-weight:600; }
        .tp-body { font-size:13px; line-height:1.65; }
        .tp-table { width:100%; border-collapse:collapse; font-size:11px; }
        .tp-table th { background:#1a1c1e; color:#fff; padding:7px; font-size:10px; text-transform:uppercase; letter-spacing:.06em; border:1px solid #1a1c1e; }
        .tp-table td { padding:6px; border:1px solid #dad9dd; text-align:center; }
        .tp-const-grid { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
        .tp-const-card { border:1px solid #dad9dd; padding:14px; position:relative; background:#fff; }
        .tp-const-card .num { position:absolute; top:10px; left:10px; width:22px; height:22px; background:#0a6400; color:#fff; font-size:10px; font-weight:700; display:flex; align-items:center; justify-content:center; border-radius:2px; z-index:2; }
        .tp-const-illustration { aspect-ratio:5/3; background:#faf9fc; border:1px solid #dad9dd; margin-bottom:12px; position:relative; overflow:hidden; }
        .tp-const-illustration svg { width:100%; height:100%; }
        .qc-block { background:#f0fdf4; border:1px solid #b8dcb8; border-left:4px solid #0a6400; padding:16px 20px; margin-top:20px; }
        .qc-list { list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:6px; }
        .qc-list li { font-size:12px; line-height:1.55; padding-left:24px; position:relative; }
        .qc-list li::before { content:"✓"; position:absolute; left:0; top:0; width:16px; height:16px; border:1.5px solid #0a6400; border-radius:2px; display:flex; align-items:center; justify-content:center; font-size:10px; color:#0a6400; font-weight:700; }
        .aql-table { width:100%; border-collapse:collapse; font-size:11px; margin-top:8px; }
        .aql-table th { background:#1a1c1e; color:#fff; padding:6px 8px; font-size:10px; text-transform:uppercase; letter-spacing:.05em; font-weight:600; text-align:left; }
        .aql-table td { padding:6px 8px; border-bottom:1px solid #dad9dd; }
        .aql-table td:last-child { text-align:right; font-weight:600; }
      `}</style>
      <div className="p-6">
        {/* COVER */}
        <div className="tp-sheet">
          <div className="tp-watermark">{watermark}</div>
          <div style={{ marginBottom: 32 }}>
            <div className="tp-meta">
              {seasonName || 'No season'} · {String(tp.title ?? design.name)}
            </div>
            <h1 className="tp-h1">{String(tp.title ?? design.name)}</h1>
            <div className="tp-body" style={{ color: '#6f7a69', fontSize: 13 }}>
              Style {String(tp.style_number ?? '—')} · Base size {baseSize} · Sizes {sizes.join('–') || '—'}
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 32, marginBottom: 32 }}>
            <div style={{ aspectRatio: 1, background: '#faf9fc', border: '1px solid #dad9dd', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
              <svg viewBox="0 0 320 400" style={{ width: '100%', height: '100%' }}>
                <path d={FRONT_BODY} fill="#fff" stroke="#1a1c1e" strokeWidth="1.2" />
                <path d="M 120 65 Q 160 92 200 65" fill="none" stroke="#1a1c1e" strokeWidth="1" />
                {pomRows.slice(0, 6).map((r, i) => (
                  <text key={r.code} x={60 + i * 40} y={60} textAnchor="middle" fontFamily="Inter" fontSize="9" fontWeight="700" fill="#0a6400">
                    {r.code}
                  </text>
                ))}
              </svg>
            </div>
            <div>
              <h3 className="tp-h3">Style specification</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px 20px', marginBottom: 20 }}>
                <div>
                  <div className="tp-label">Style number</div>
                  <div className="tp-value">{String(tp.style_number ?? '—')}</div>
                </div>
                <div>
                  <div className="tp-label">Season</div>
                  <div className="tp-value">{seasonName || '—'}</div>
                </div>
                <div>
                  <div className="tp-label">Base size</div>
                  <div className="tp-value">{baseSize}</div>
                </div>
                <div>
                  <div className="tp-label">Size range</div>
                  <div className="tp-value">{sizes.join('–') || '—'}</div>
                </div>
                <div>
                  <div className="tp-label">Fabric</div>
                  <div className="tp-value">{shellMat?.name ?? '—'}</div>
                </div>
                <div>
                  <div className="tp-label">Weight</div>
                  <div className="tp-value">{shellMat?.weight_gsm != null ? `${shellMat.weight_gsm} gsm` : '—'}</div>
                </div>
              </div>
              <h3 className="tp-h3">Colorways</h3>
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                {colorways.length === 0 ? (
                  <span style={{ fontSize: 12, color: '#6f7a69' }}>No colorways recorded.</span>
                ) : (
                  colorways.map((c) => (
                    <div key={String(c.id)} style={{ textAlign: 'center' }}>
                      <div style={{ width: 40, height: 40, background: String(c.hex ?? '#f5f2ed'), border: '1px solid #dad9dd' }} />
                      <div style={{ fontSize: 10, color: '#6f7a69', marginTop: 4, fontWeight: 600 }}>{String(c.name ?? '—')}</div>
                    </div>
                  ))
                )}
              </div>
              <div style={{ marginTop: 20, fontSize: 12, color: '#6f7a69' }}>
                {pomCount} POMs · {snap.bom.length} BOM lines · {construction.length} construction operations · {money(bomTotal)} unit cost
              </div>
            </div>
          </div>
          <div className="tp-footer">
            <span>{tpNumber} · {String(tp.style_number ?? '')}</span>
            <span>Cover</span>
            <span>Page 1 of 4</span>
          </div>
        </div>

        {/* SPEC SHEET */}
        <div className="tp-sheet">
          <div className="tp-watermark">{watermark}</div>
          <h2 className="tp-h2">
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>straighten</span>Spec sheet — points of measure
          </h2>
          <div className="tp-body" style={{ color: '#6f7a69', marginBottom: 16, fontSize: 12 }}>
            Values in centimeters. Base size {baseSize} highlighted. Tolerance symmetric unless noted.
          </div>
          {pomRows.length === 0 ? (
            <p className="tp-body" style={{ color: '#6f7a69' }}>No measurements recorded yet.</p>
          ) : (
            <table className="tp-table">
              <thead>
                <tr>
                  <th>Ref</th>
                  <th style={{ textAlign: 'left' }}>Point of measure</th>
                  {sizes.map((s) => (
                    <th key={s} style={s === baseSize ? { background: '#0a6400', border: '1px solid #0a6400' } : undefined}>{s}</th>
                  ))}
                  <th>Tol</th>
                </tr>
              </thead>
              <tbody>
                {pomRows.map((r) => (
                  <tr key={r.code}>
                    <td style={{ fontWeight: 700, background: '#f4f3f7', color: '#0a6400' }}>{r.code}</td>
                    <td style={{ textAlign: 'left' }}>{r.name}</td>
                    {sizes.map((s) => (
                      <td key={s} style={s === baseSize ? { background: '#f0fdf4', fontWeight: 700 } : undefined}>
                        {r.values[s] ?? '—'}
                      </td>
                    ))}
                    <td style={{ background: '#faf9fc', color: '#6f7a69', fontSize: 10 }}>{r.tol != null ? `±${r.tol}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="tp-footer">
            <span>{tpNumber} · {String(tp.style_number ?? '')}</span>
            <span>Spec sheet</span>
            <span>Page 2 of 4</span>
          </div>
        </div>

        {/* CONSTRUCTION + QC */}
        <div className="tp-sheet">
          <div className="tp-watermark">{watermark}</div>
          <h2 className="tp-h2">
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>construction</span>Construction specification
          </h2>
          <div className="tp-body" style={{ color: '#6f7a69', marginBottom: 20, fontSize: 12 }}>
            Every sewing operation with an inline technical diagram. Sample must match exactly.
          </div>
          {construction.length === 0 ? (
            <p className="tp-body" style={{ color: '#6f7a69' }}>
              No construction operations recorded on this revision — add them in the editor and the diagrams render here.
            </p>
          ) : (
            <div className="tp-const-grid">
              {construction.map((op, i) => {
                const text = `${String(op.area ?? '')} ${String(op.operation ?? '')}`;
                const ill = OP_ILLUSTRATIONS.find((o) => o.match.test(text));
                return (
                  <div key={String(op.id ?? i)} className="tp-const-card">
                    <div className="num">{i + 1}</div>
                    {ill && (
                      <div className="tp-const-illustration">
                        <div dangerouslySetInnerHTML={{ __html: ill.svg }} />
                      </div>
                    )}
                    <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>
                      {String(op.operation ?? op.area ?? `Operation ${i + 1}`)}
                    </div>
                    <div style={{ fontSize: 11, color: '#6f7a69', lineHeight: 1.55, marginBottom: 10 }}>{String(op.notes ?? op.description ?? '')}</div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3px 12px', paddingTop: 10, borderTop: '1px solid #dad9dd', fontSize: 10 }}>
                      <span style={{ color: '#6f7a69', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }}>Stitch</span>
                      <span style={{ fontWeight: 700, textAlign: 'right' }}>{String(op.stitch_type ?? '—')}</span>
                      <span style={{ color: '#6f7a69', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }}>SA</span>
                      <span style={{ fontWeight: 700, textAlign: 'right' }}>{op.seam_allowance_mm != null ? `${op.seam_allowance_mm} mm` : '—'}</span>
                      <span style={{ color: '#6f7a69', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }}>SPI</span>
                      <span style={{ fontWeight: 700, textAlign: 'right' }}>{op.spi != null ? String(op.spi) : '—'}</span>
                      <span style={{ color: '#6f7a69', textTransform: 'uppercase', letterSpacing: '.05em', fontWeight: 600 }}>Area</span>
                      <span style={{ fontWeight: 700, textAlign: 'right' }}>{String(op.area ?? '—')}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <div className="qc-block">
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.08em', color: '#0a6400', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>verified_user</span>
              Quality checkpoints — verify every unit before packing
            </div>
            <ul className="qc-list">
              {QC_CHECKLIST.map((c) => (
                <li key={c}>{c}</li>
              ))}
            </ul>
            <div style={{ fontSize: 10, color: '#6f7a69', marginTop: 10, paddingTop: 10, borderTop: '1px solid #b8dcb8', display: 'flex', gap: 16 }}>
              <span><strong>AQL:</strong> 2.5 major / 4.0 minor</span>
              <span><strong>Sampling:</strong> ISO 2859-1 Level II</span>
              <span><strong>Reject:</strong> return whole lot if critical defects &gt; 0</span>
            </div>
          </div>
          <h3 className="tp-h3">AQL sampling schedule</h3>
          <table className="aql-table">
            <thead>
              <tr>
                <th>Lot size</th><th>Sample size</th><th>Accept (major)</th><th>Reject (major)</th><th>Accept (minor)</th><th>Reject (minor)</th>
              </tr>
            </thead>
            <tbody>
              {AQL_ROWS.map((r) => (
                <tr key={r[0]}>
                  {r.map((c, j) => (
                    <td key={j}>{c}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <div className="tp-footer">
            <span>{tpNumber} · {String(tp.style_number ?? '')}</span>
            <span>Construction &amp; QC</span>
            <span>Page 3 of 4</span>
          </div>
        </div>

        {/* REVISIONS */}
        <div className="tp-sheet">
          <div className="tp-watermark">{watermark}</div>
          <h2 className="tp-h2">
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>history</span>Revision history
          </h2>
          <div className="tp-body" style={{ color: '#6f7a69', marginBottom: 16, fontSize: 12 }}>
            Immutable record — every transition writes a snapshot.
          </div>
          {revisions.length === 0 ? (
            <p className="tp-body" style={{ color: '#6f7a69' }}>No revisions recorded yet — the first transition writes one.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
              <thead>
                <tr style={{ background: '#1a1c1e', color: '#fff' }}>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10, textTransform: 'uppercase', letterSpacing: '.06em' }}>Rev</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10 }}>Transition</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10 }}>Summary</th>
                  <th style={{ padding: '8px 12px', textAlign: 'left', fontSize: 10 }}>Date</th>
                </tr>
              </thead>
              <tbody>
                {revisions.map((r, i) => (
                  <tr key={String(r.id ?? i)} style={i === 0 ? { background: '#f0fdf4', fontWeight: 600 } : undefined}>
                    <td style={{ padding: '8px 12px', borderBottom: '1px solid #dad9dd' }}>
                      <span style={{ padding: '2px 8px', background: i === 0 ? '#8af5be' : '#e8f0fb', color: i === 0 ? '#00714b' : '#0055a5', borderRadius: 10, fontSize: 10, fontWeight: 700 }}>
                        Rev {String(r.revision ?? r.to_status ?? '—')}
                      </span>
                    </td>
                    <td style={{ padding: '8px 12px', borderBottom: '1px solid #dad9dd' }}>{String(r.transition ?? r.to_status ?? '—')}</td>
                    <td style={{ padding: '8px 12px', borderBottom: '1px solid #dad9dd', fontWeight: 400 }}>{String(r.note ?? r.summary ?? '')}</td>
                    <td style={{ padding: '8px 12px', borderBottom: '1px solid #dad9dd' }}>{fmtDate(String(r.created_at ?? ''))}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div className="tp-footer">
            <span>{tpNumber} · {String(tp.style_number ?? '')}</span>
            <span>Revisions</span>
            <span>Page 4 of 4</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ChainNode(props: {
  kind: string;
  icon: string;
  status: 'done' | 'pending' | 'blocked';
  statusLabel: string;
  primary: string;
  meta: React.ReactNode;
  actions?: React.ReactNode;
  timeline?: Array<[string, string]>;
}) {
  const { kind, icon, status, statusLabel, primary, meta, actions, timeline } = props;
  return (
    <div
      className={`bg-white border border-[#dad9dd] rounded-[10px] overflow-hidden relative ${
        status === 'done' ? 'border-l-4 border-l-[#0a6400]' : status === 'pending' ? 'border-l-4 border-l-[#8a5a00] bg-[#fffef8]' : 'border-l-4 border-l-[#6f7a69] opacity-70'
      }`}
    >
      <div className="px-[18px] py-3.5 border-b border-[#dad9dd] flex items-center justify-between bg-[#faf9fc]">
        <div className="text-[10px] font-bold uppercase tracking-wider text-[#6f7a69] flex items-center gap-1.5">
          <span className="material-symbols-outlined text-[16px] text-[#1a1c1e]">{icon}</span>
          {kind}
        </div>
        <span
          className={`px-2 py-[3px] rounded-[10px] text-[10px] font-bold uppercase tracking-wide ${
            status === 'done' ? 'bg-[#8af5be] text-[#00714b]' : status === 'pending' ? 'bg-[#fff4dc] text-[#8a5a00]' : 'bg-[#f4f3f7] text-[#6f7a69]'
          }`}
        >
          {statusLabel}
        </span>
      </div>
      <div className="px-[18px] py-3.5">
        <div className="text-[14px] font-semibold mb-1">{primary}</div>
        <div className="text-[12px] text-[#6f7a69] leading-relaxed">{meta}</div>
        {timeline && timeline.length > 0 && (
          <div className="bg-[#f4f3f7] rounded-md px-3.5 py-3 mt-3 text-[11px]">
            {timeline.map(([k, v]) => (
              <div key={k} className="flex justify-between py-[3px]">
                <span className="text-[#6f7a69]">{k}</span>
                <span className="font-semibold tabular-nums">{v}</span>
              </div>
            ))}
          </div>
        )}
        {actions && <div className="flex gap-2 mt-3">{actions}</div>}
      </div>
    </div>
  );
}

function DownstreamPanel(props: {
  design: DesignRow;
  pack: PackRow | null;
  snap: TechPackSnapshot | null;
  bomTotal: number;
  pomCount: number;
  latestRfq: RfqRow | null;
  board: BoardPayload | null;
  award: Record<string, unknown> | undefined;
  awardVendorName: string | null;
  awardBid: Record<string, unknown> | undefined;
  po: Record<string, unknown> | null;
  layerCount: number;
  onNavigate: (domain: DomainKey, screenId: string) => void;
  openTechPack: (id: string) => void;
}) {
  const { design, pack, snap, bomTotal, pomCount, latestRfq, board, award, awardVendorName, awardBid, po, layerCount, onNavigate, openTechPack } = props;
  const useDesignCanvasOpenRfq = useDesignCanvas((s) => s.openRfq);
  const openBoard = () => {
    if (!latestRfq) return;
    useDesignCanvasOpenRfq(latestRfq.id);
    onNavigate('design', 'rfq-board');
  };
  const invitedCount = (board?.invitations ?? []).filter((i) => String(i.status ?? '') !== 'revoked').length;
  const bidsCount = (board?.bids ?? []).length;
  const deadline = latestRfq ? String((latestRfq.deadline_at ?? latestRfq.response_deadline ?? '') || '') : '';
  const awardTotal =
    award && award.quantity != null && award.unit_price != null ? Number(award.quantity) * Number(award.unit_price) : null;
  const poTotal =
    po != null
      ? Number((po.total_amount ?? po.grand_total ?? po.total ?? po.subtotal ?? awardTotal ?? 0) as number)
      : awardTotal;
  const poStatus = po != null ? String(po.status ?? po.displayStatus ?? '') : '';
  // The PO route returns camelCase (poNumber, expectedDate); the award row
  // carries snake_case po_number. Read both — a missing po_number is what
  // hid the real PUR-000002 behind a "No PO yet" block.
  const poNumber =
    po != null
      ? String((po.poNumber ?? po.po_number ?? (award as Record<string, unknown> | undefined)?.po_number ?? '') as string)
      : award
        ? String((award as Record<string, unknown>).po_number ?? '')
        : '';
  const receipts = (po?.receipts as Array<Record<string, unknown>> | undefined) ?? [];
  const constructionCount = (snap?.construction ?? []).length;
  const tpNumber = pack
    ? String(
        ((snap?.tech_pack as Record<string, unknown> | undefined)?.tech_pack_number as string | undefined) ??
          `TP-${pack.id.slice(0, 4).toUpperCase()}`,
      )
    : '';
  const tpStyle = String(((snap?.tech_pack as Record<string, unknown> | undefined)?.style_number as string | undefined) ?? design.name);

  return (
    <div className="bg-[#faf9fc]">
      <div className="p-8 max-w-[900px] mx-auto">
        <div className="text-[22px] font-bold mb-1.5">Downstream chain</div>
        <div className="text-[13px] text-[#6f7a69] mb-7">Design → tech pack → RFQ → bids → award → PO. Each step is a real record.</div>
        <div className="flex flex-col gap-4">
          <ChainNode
            kind="Design"
            icon="palette"
            status="done"
            statusLabel="Created"
            primary={design.name}
            meta={
              <>
                Canvas · {layerCount} layer{layerCount === 1 ? '' : 's'} · {design.garmentColor ?? 'no color'} · {design.status}
              </>
            }
          />
          <div className="w-[2px] h-5 bg-[#dad9dd] mx-auto" />
          {pack && snap ? (
            <ChainNode
              kind="Tech pack"
              icon="description"
              status="done"
              statusLabel={`Rev ${pack.revision}`}
              primary={`${tpNumber} — ${tpStyle}`}
              meta={
                <>
                  {pomCount} POMs · {snap.bom.length} BOM lines · {constructionCount} construction operations · {money(bomTotal)} unit cost
                </>
              }
              actions={
                <button
                  className="px-3 py-1.5 rounded-md text-[11px] font-semibold border border-[#dad9dd] bg-white flex items-center gap-1"
                  onClick={() => {
                    openTechPack(pack.id);
                    onNavigate('design', 'tech-pack-preview');
                  }}
                >
                  <span className="material-symbols-outlined text-[14px]">description</span>Open tech pack
                </button>
              }
            />
          ) : (
            <ChainNode
              kind="Tech pack"
              icon="description"
              status="pending"
              statusLabel="Pending"
              primary="No tech pack yet"
              meta="Create a tech pack from this design to start the production chain."
              actions={
                <button
                  className="px-3 py-1.5 rounded-md text-[11px] font-semibold bg-[#0a6400] text-white flex items-center gap-1"
                  onClick={() => onNavigate('design', 'tech-packs')}
                >
                  <span className="material-symbols-outlined text-[14px]">description</span>Go to tech packs
                </button>
              }
            />
          )}
          <div className="w-[2px] h-5 bg-[#dad9dd] mx-auto" />
          {latestRfq ? (
            <ChainNode
              kind="RFQ"
              icon="request_quote"
              status={latestRfq.status === 'draft' ? 'pending' : 'done'}
              statusLabel={latestRfq.status === 'draft' ? 'Draft' : latestRfq.status === 'awarded' ? 'Awarded' : latestRfq.status}
              primary={`${latestRfq.rfq_number} — ${latestRfq.title}`}
              meta={
                <>
                  {invitedCount} supplier{invitedCount === 1 ? '' : 's'} invited · {bidsCount} bid{bidsCount === 1 ? '' : 's'} received
                  {deadline ? ` · deadline ${fmtDate(deadline)}` : ''}
                </>
              }
              actions={
                <button
                  className="px-3 py-1.5 rounded-md text-[11px] font-semibold border border-[#dad9dd] bg-white flex items-center gap-1"
                  onClick={openBoard}
                >
                  <span className="material-symbols-outlined text-[14px]">request_quote</span>Open RFQ board
                </button>
              }
            />
          ) : (
            <ChainNode
              kind="RFQ"
              icon="request_quote"
              status="blocked"
              statusLabel="Blocked"
              primary="No RFQ yet"
              meta="Create an RFQ from the tech pack to invite suppliers to bid."
              actions={
                pack ? (
                  <button
                    className="px-3 py-1.5 rounded-md text-[11px] font-semibold bg-[#0a6400] text-white flex items-center gap-1"
                    onClick={() => {
                      openTechPack(pack.id);
                      onNavigate('design', 'tech-pack-editor');
                    }}
                  >
                    <span className="material-symbols-outlined text-[14px]">request_quote</span>Create RFQ from tech pack
                  </button>
                ) : undefined
              }
            />
          )}
          <div className="w-[2px] h-5 bg-[#dad9dd] mx-auto" />
          {award ? (
            <ChainNode
              kind="Award"
              icon="workspace_premium"
              status="done"
              statusLabel="Awarded"
              primary={`${String(award.bid_id ?? '—')} · ${awardVendorName ?? 'Supplier'}`}
              meta={
                <>
                  <strong>{String(award.id)}</strong> · awarded {fmtDate(String(award.awarded_at ?? ''))}
                  <br />
                  Unit {money(Number(award.unit_price ?? 0))} · MOQ {String(award.quantity ?? '—')} · Lead{' '}
                  {awardBid?.lead_time_days != null ? `${awardBid.lead_time_days}d` : '—'}
                  {awardBid?.valid_until ? ` · Valid until ${fmtDate(String(awardBid.valid_until))}` : ''}
                </>
              }
              timeline={[
                ['Bid received', fmtDate(String(awardBid?.created_at ?? ''))],
                ['Awarded via ds_award_rfq', fmtDate(String(award.awarded_at ?? ''))],
                ['PO auto-created', poNumber || '—'],
              ]}
              actions={
                <button
                  className="px-3 py-1.5 rounded-md text-[11px] font-semibold border border-[#dad9dd] bg-white flex items-center gap-1"
                  onClick={openBoard}
                >
                  <span className="material-symbols-outlined text-[14px]">receipt_long</span>View bid
                </button>
              }
            />
          ) : (
            <ChainNode
              kind="Award"
              icon="workspace_premium"
              status="pending"
              statusLabel="Pending"
              primary="No award yet"
              meta="Close the RFQ and award a bid to trigger PO creation."
              actions={
                latestRfq ? (
                  <button
                    className="px-3 py-1.5 rounded-md text-[11px] font-semibold bg-[#0a6400] text-white flex items-center gap-1"
                    onClick={openBoard}
                  >
                    <span className="material-symbols-outlined text-[14px]">workspace_premium</span>Open RFQ to award
                  </button>
                ) : undefined
              }
            />
          )}
          <div className="w-[2px] h-5 bg-[#dad9dd] mx-auto" />
          {po && poNumber ? (
            <ChainNode
              kind="Purchase order"
              icon="shopping_bag"
              status="done"
              statusLabel={poStatus ? poStatus.charAt(0).toUpperCase() + poStatus.slice(1) : 'Issued'}
              primary={`${poNumber} — ${awardVendorName ?? 'Supplier'}`}
              meta={
                <>
                  Auto-created from award {String(award?.id ?? '')} on {fmtDate(String(award?.awarded_at ?? ''))}
                  <br />
                  Total <strong>{money(poTotal ?? 0)}</strong>
                  {award?.quantity != null && award?.unit_price != null
                    ? ` · ${String(award.quantity)} units @ ${money(Number(award.unit_price))}`
                    : ''}
                </>
              }
              timeline={[
                ['PO status', poStatus || '—'],
                ['Issued', fmtDate(String(award?.awarded_at ?? ''))],
                ['Expected delivery', po.expected_delivery_date ?? po.expectedDate ? fmtDate(String(po.expected_delivery_date ?? po.expectedDate)) : '—'],
                ['Receiving', receipts.length > 0 ? `${receipts.length} receipt${receipts.length === 1 ? '' : 's'} recorded` : 'Not yet received'],
              ]}
              actions={
                <>
                  <button
                    className="px-3 py-1.5 rounded-md text-[11px] font-semibold bg-[#0a6400] text-white flex items-center gap-1"
                    onClick={openBoard}
                  >
                    <span className="material-symbols-outlined text-[14px]">open_in_new</span>Open PO
                  </button>
                  <button className="px-3 py-1.5 rounded-md text-[11px] font-semibold border border-[#dad9dd] bg-white flex items-center gap-1" onClick={() => window.print()}>
                    <span className="material-symbols-outlined text-[14px]">print</span>Print
                  </button>
                </>
              }
            />
          ) : (
            <ChainNode
              kind="Purchase order"
              icon="shopping_bag"
              status="blocked"
              statusLabel="Blocked"
              primary="No PO yet"
              meta={
                <>
                  PO is created automatically when a bid is awarded via <code style={{ background: '#f4f3f7', padding: '1px 4px', borderRadius: 3 }}>ds_award_rfq</code>. The{' '}
                  <code style={{ background: '#f4f3f7', padding: '1px 4px', borderRadius: 3 }}>rfq_awards.purchase_order_id</code> field is set on award.
                </>
              }
            />
          )}
        </div>
      </div>
    </div>
  );
}
