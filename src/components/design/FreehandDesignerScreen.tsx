/* eslint-disable react-hooks/rules-of-hooks, react-hooks/refs, react-hooks/immutability */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { DomainKey } from '@/data/shellData';
import { useDesignCanvas } from '@/lib/designCanvasStore';
import { createDesign, getDesign } from '@/lib/podApi';

/**
 * Free-hand designer — a 1:1 port of tecpack_designer.html, wired to the
 * live routes. The canvas is a flat garment view (front/back/side), never a
 * model photo; layers are drawn on the flat inside the print area. Save
 * writes a real design_versions row and sets designs.current_version_id —
 * the existing PATCH /api/v1/designs/:id never versions, which is why a
 * design saved on the Konva canvas cannot be turned into a tech pack.
 * The HTML's demo layers (YOUR/DESIGN text) are mockup content and are
 * not ported: a new design starts with an empty canvas.
 */

type ViewKey = 'front' | 'back' | 'side';
type LayerType = 'shape' | 'text' | 'image' | 'path' | 'pattern';
type Layer = {
  id: string;
  type: LayerType;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotation: number;
  fill: string;
  opacity: number;
  visible: boolean;
  shape?: string;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: number;
  svgContent?: string;
  imageUrl?: string;
  assetId?: string;
  storagePath?: string;
  pathD?: string;
  strokeWidth?: number;
  pattern?: string;
};

type Colorway = { id: string; name: string; hex: string | null; pantone: string | null };
type BlankCard = {
  id: string;
  title: string;
  sku: string;
  image: string | null;
  bestPrice: number | null;
  suppliers: number;
  variantCount: number;
};

const FRONT_BODY =
  'M 85 85 L 60 105 L 35 170 L 60 180 L 75 155 L 75 355 L 245 355 L 245 155 L 260 180 L 285 170 L 260 105 L 235 85 L 200 65 L 190 68 Q 160 92 130 68 L 120 65 Z';
const BACK_BODY =
  'M 85 85 L 60 105 L 35 170 L 60 180 L 75 155 L 75 355 L 245 355 L 245 155 L 260 180 L 285 170 L 260 105 L 235 85 L 200 65 Q 160 45 120 65 Z';
const SIDE_BODY =
  'M 140 85 L 100 105 L 80 170 L 100 180 L 115 155 L 115 355 L 220 355 L 220 155 L 235 180 L 255 170 L 235 105 L 195 85 L 175 80 L 165 85 Z';

const SWATCHES = [
  '#1a1c1e', '#6b1e28', '#0a6400', '#0077c5', '#1e5a38', '#8a5a00', '#5c3fc4', '#be185d',
  '#ffffff', '#f5f2ed', '#9ca3a8', '#6f7a69', '#dad9dd', '#f4f3f7', '#eeedf1', '#e3e2e6',
];

const SHAPES = [
  { kind: 'rect', label: 'Rectangle' },
  { kind: 'circle', label: 'Circle' },
  { kind: 'triangle', label: 'Triangle' },
  { kind: 'star', label: 'Star' },
  { kind: 'arrow', label: 'Arrow' },
  { kind: 'line', label: 'Line' },
  { kind: 'wave', label: 'Wave' },
  { kind: 'diamond', label: 'Diamond' },
] as const;

const ASSET_SHAPES: Record<string, string> = {
  mountain: '<polygon points="10,80 30,40 50,60 70,30 90,80" fill="currentColor"/>',
  sun: '<circle cx="50" cy="50" r="25" fill="currentColor"/><line x1="50" y1="10" x2="50" y2="20" stroke="currentColor" stroke-width="3"/><line x1="50" y1="80" x2="50" y2="90" stroke="currentColor" stroke-width="3"/><line x1="10" y1="50" x2="20" y2="50" stroke="currentColor" stroke-width="3"/><line x1="80" y1="50" x2="90" y2="50" stroke="currentColor" stroke-width="3"/>',
  wave: '<path d="M 10 40 Q 30 20 50 40 T 90 40 L 90 60 Q 70 80 50 60 T 10 60 Z" fill="currentColor"/>',
  leaf: '<path d="M 50 15 Q 30 40 30 70 Q 50 60 50 60 Q 50 60 70 70 Q 70 40 50 15 Z" fill="currentColor"/>',
  star: '<polygon points="50,15 61,42 85,45 67,61 72,85 50,73 28,85 33,61 15,45 39,42" fill="currentColor"/>',
  flower: '<circle cx="50" cy="30" r="12" fill="currentColor"/><circle cx="70" cy="45" r="12" fill="currentColor"/><circle cx="63" cy="68" r="12" fill="currentColor"/><circle cx="37" cy="68" r="12" fill="currentColor"/><circle cx="30" cy="45" r="12" fill="currentColor"/><circle cx="50" cy="50" r="8" fill="#fff"/>',
  tree: '<rect x="45" y="55" width="10" height="35" fill="currentColor"/><circle cx="50" cy="40" r="25" fill="currentColor"/>',
  abstract: '<path d="M 20 70 Q 30 20 50 50 Q 70 80 80 30 L 80 80 L 20 80 Z" fill="currentColor"/>',
};

const PATTERNS: Record<string, string> = {
  'stripes-h': '<rect width="100" height="100" fill="#faf9fc"/><rect x="0" y="10" width="100" height="10" fill="currentColor"/><rect x="0" y="35" width="100" height="10" fill="currentColor"/><rect x="0" y="60" width="100" height="10" fill="currentColor"/><rect x="0" y="85" width="100" height="10" fill="currentColor"/>',
  'stripes-v': '<rect width="100" height="100" fill="#faf9fc"/><rect x="10" y="0" width="10" height="100" fill="currentColor"/><rect x="35" y="0" width="10" height="100" fill="currentColor"/><rect x="60" y="0" width="10" height="100" fill="currentColor"/><rect x="85" y="0" width="10" height="100" fill="currentColor"/>',
  'stripes-d': '<rect width="100" height="100" fill="#faf9fc"/><path d="M 0 20 L 20 0 M 0 50 L 50 0 M 0 80 L 80 0 M 20 100 L 100 20 M 50 100 L 100 50 M 80 100 L 100 80" stroke="currentColor" stroke-width="6"/>',
  dots: '<rect width="100" height="100" fill="#faf9fc"/><circle cx="20" cy="20" r="6" fill="currentColor"/><circle cx="60" cy="20" r="6" fill="currentColor"/><circle cx="20" cy="60" r="6" fill="currentColor"/><circle cx="60" cy="60" r="6" fill="currentColor"/>',
  check: '<rect width="50" height="50" fill="currentColor"/><rect x="50" y="50" width="50" height="50" fill="currentColor"/>',
  grid: '<rect width="100" height="100" fill="#faf9fc"/><path d="M 0 20 L 100 20 M 0 40 L 100 40 M 0 60 L 100 60 M 0 80 L 100 80 M 20 0 L 20 100 M 40 0 L 40 100 M 60 0 L 60 100 M 80 0 L 80 100" stroke="currentColor" stroke-width="2"/>',
  herringbone: '<rect width="100" height="100" fill="#faf9fc"/><path d="M 0 20 L 20 0 M 20 20 L 40 0 M 40 20 L 60 0 M 60 20 L 80 0 M 80 20 L 100 0 M 0 40 L 20 20 M 20 40 L 40 20 M 40 40 L 60 20 M 60 40 L 80 20 M 80 40 L 100 20" stroke="currentColor" stroke-width="3"/>',
  'tie-dye': '<rect width="100" height="100" fill="#faf9fc"/><circle cx="30" cy="30" r="15" fill="currentColor" opacity=".5"/><circle cx="70" cy="40" r="20" fill="#0077c5" opacity=".4"/><circle cx="40" cy="75" r="18" fill="#8a5a00" opacity=".4"/>',
};

function shapeSvg(shape: string, w: number, h: number, fill: string): string {
  switch (shape) {
    case 'rect':
      return `<rect width="${w}" height="${h}" fill="${fill}"/>`;
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
    case 'line':
      return `<line x1="0" y1="${h / 2}" x2="${w}" y2="${h / 2}" stroke="${fill}" stroke-width="4"/>`;
    case 'wave':
      return `<path d="M 0 ${h / 2} Q ${w / 4} ${h / 6} ${w / 2} ${h / 2} T ${w} ${h / 2}" stroke="${fill}" stroke-width="4" fill="none"/>`;
    case 'diamond':
      return `<polygon points="${w / 2},0 ${w},${h / 2} ${w / 2},${h} 0,${h / 2}" fill="${fill}"/>`;
    default:
      return `<rect width="${w}" height="${h}" fill="${fill}"/>`;
  }
}

function shapeThumb(kind: string): string {
  switch (kind) {
    case 'rect':
      return '<rect x="20" y="20" width="60" height="60" fill="#1a1c1e"/>';
    case 'circle':
      return '<circle cx="50" cy="50" r="30" fill="#1a1c1e"/>';
    case 'triangle':
      return '<polygon points="50,20 80,80 20,80" fill="#1a1c1e"/>';
    case 'star':
      return '<polygon points="50,20 61,42 85,45 67,61 72,85 50,73 28,85 33,61 15,45 39,42" fill="#1a1c1e"/>';
    case 'arrow':
      return '<path d="M 20 50 L 80 50 M 60 30 L 80 50 L 60 70" stroke="#1a1c1e" stroke-width="6" fill="none" stroke-linecap="round" stroke-linejoin="round"/>';
    case 'line':
      return '<line x1="20" y1="50" x2="80" y2="50" stroke="#1a1c1e" stroke-width="4"/>';
    case 'wave':
      return '<path d="M 20 50 Q 30 30 40 50 T 60 50 T 80 50" stroke="#1a1c1e" stroke-width="4" fill="none"/>';
    case 'diamond':
      return '<polygon points="50,15 85,50 50,85 15,50" fill="#1a1c1e"/>';
    default:
      return '';
  }
}

const uid = () => `layer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const emptyViews = (): Record<ViewKey, Layer[]> => ({ front: [], back: [], side: [] });
const money = (n: number | null) => (n == null ? '—' : `$${n.toFixed(2)}`);

export default function FreehandDesignerScreen({
  onNavigate,
  onToast,
}: {
  onNavigate: (domain: DomainKey, screenId: string) => void;
  onToast: (message: string) => void;
}) {
  const storeDesignId = useDesignCanvas((s) => s.designId);
  const [designId, setDesignId] = useState<string | null>(storeDesignId);
  const [docName, setDocName] = useState('Untitled design');
  const [views, setViews] = useState<Record<ViewKey, Layer[]>>(emptyViews());
  const [activeView, setActiveView] = useState<ViewKey>('front');
  const [selection, setSelection] = useState<string | null>(null);
  const [tool, setTool] = useState<'layers' | 'shapes' | 'type' | 'upload' | 'assets' | 'colors' | 'patterns' | 'ai'>('layers');
  const [hudMode, setHudMode] = useState<'select' | 'draw' | 'shape' | 'text'>('select');
  const [pendingShape, setPendingShape] = useState<string | null>(null);
  const [zoom, setZoom] = useState(100);
  const [showPrintArea, setShowPrintArea] = useState(true);
  const [colorways, setColorways] = useState<Colorway[]>([]);
  const [activeColorwayId, setActiveColorwayId] = useState<string | null>(null);
  const [newColorway, setNewColorway] = useState({ name: '', hex: '#1a1c1e', pantone: '' });
  const [blanks, setBlanks] = useState<BlankCard[]>([]);
  const [blankQuery, setBlankQuery] = useState('');
  const [selectedBlank, setSelectedBlank] = useState<BlankCard | null>(null);
  const [stripTab, setStripTab] = useState<'blank' | 'variants' | 'cost'>('blank');
  const [retailPrice, setRetailPrice] = useState<number | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savedVersion, setSavedVersion] = useState<number | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [banner, setBanner] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiStyle, setAiStyle] = useState('Flat vector');
  const [aiBusy, setAiBusy] = useState(false);
  const [recentAssets, setRecentAssets] = useState<Array<{ id: string; url: string | null; storagePath: string; prompt: string | null }>>([]);
  const [hexInput, setHexInput] = useState('');
  const [drawPoints, setDrawPoints] = useState<Array<[number, number]>>([]);
  const svgRef = useRef<SVGSVGElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const dragRef = useRef<null | {
    kind: 'move' | 'resize' | 'draw';
    id?: string;
    corner?: 'nw' | 'ne' | 'sw' | 'se';
    startX: number;
    startY: number;
    orig?: Layer;
    points?: Array<[number, number]>;
  }>(null);
  const undoRef = useRef<Record<ViewKey, Layer[]>[]>([]);
  const redoRef = useRef<Record<ViewKey, Layer[]>[]>([]);
  const [, setHistoryTick] = useState(0);

  const layers = views[activeView];
  const selected = layers.find((l) => l.id === selection) ?? null;
  const activeColorway = colorways.find((c) => c.id === activeColorwayId) ?? null;
  const flatFill = activeColorway?.hex ?? '#ffffff';

  // ── Load: reopen the store design (latest freehand version) ──
  useEffect(() => {
    if (!storeDesignId) return;
    setDesignId(storeDesignId);
    void (async () => {
      try {
        const { design } = await getDesign(storeDesignId);
        setDocName(design.name ?? 'Untitled design');
        setRetailPrice((design as { retailPrice?: number | null }).retailPrice ?? null);
        const cs = (design.canvasState ?? {}) as { freehand?: { views?: Record<ViewKey, Layer[]>; activeView?: ViewKey; blankId?: string; blankName?: string; activeColorwayId?: string | null } };
        if (cs.freehand?.views) {
          setViews({ front: cs.freehand.views.front ?? [], back: cs.freehand.views.back ?? [], side: cs.freehand.views.side ?? [] });
          if (cs.freehand.activeView) setActiveView(cs.freehand.activeView);
          if (cs.freehand.activeColorwayId) setActiveColorwayId(cs.freehand.activeColorwayId);
        }
        const [verRes, cwRes] = await Promise.all([
          fetch(`/api/v1/designs/${storeDesignId}/versions`),
          fetch(`/api/v1/designs/${storeDesignId}/colorways`),
        ]);
        if (verRes.ok) {
          const v = await verRes.json();
          if ((v.versions ?? []).length > 0) setSavedVersion((v.versions[0] as { version_no: number }).version_no);
        }
        if (cwRes.ok) setColorways(((await cwRes.json()).items ?? []) as Colorway[]);
      } catch (e) {
        setBanner({ kind: 'err', text: e instanceof Error ? e.message : 'Failed to reopen the design.' });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeDesignId]);

  // ── Blanks (search) ──
  const searchBlanks = async (q: string) => {
    try {
      const res = await fetch(`/api/v1/blanks?limit=12${q ? `&q=${encodeURIComponent(q)}` : ''}`);
      if (!res.ok) return;
      const data = await res.json();
      setBlanks(
        ((data.items ?? []) as Array<Record<string, unknown>>).map((b) => ({
          id: String(b.id),
          title: String(b.name ?? 'Blank'),
          sku: (b.sku as string | null) ?? '',
          image: (b.mockupThumbUrl as string | null) || null,
          bestPrice: (b.baseCost as number | null) ?? null,
          suppliers: Number(b.supplierCount ?? 1),
          variantCount: Number(b.variantCount ?? 0),
        })),
      );
    } catch {
      setBlanks([]);
    }
  };
  useEffect(() => {
    searchBlanks('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Recent uploads / AI generations ──
  const loadRecentAssets = async () => {
    try {
      const [up, ai] = await Promise.all([
        fetch('/api/v1/files?kind=upload&limit=12'),
        fetch('/api/v1/files?kind=ai&limit=12'),
      ]);
      const items: Array<{ id: string; url: string | null; storagePath: string; prompt: string | null }> = [];
      for (const r of [up, ai]) {
        if (!r.ok) continue;
        const data = await r.json();
        for (const a of data.assets ?? []) {
          items.push({ id: a.id, url: a.url ?? null, storagePath: a.storagePath, prompt: a.prompt ?? null });
        }
      }
      setRecentAssets(items);
    } catch {
      setRecentAssets([]);
    }
  };
  useEffect(() => {
    loadRecentAssets();
  }, []);

  const pushHistory = () => {
    undoRef.current.push(structuredClone(views));
    if (undoRef.current.length > 50) undoRef.current.shift();
    redoRef.current = [];
    setHistoryTick((t) => t + 1);
  };
  const undo = () => {
    const prev = undoRef.current.pop();
    if (!prev) return;
    redoRef.current.push(structuredClone(views));
    setViews(prev);
    setSelection(null);
    setDirty(true);
    setHistoryTick((t) => t + 1);
  };
  const redo = () => {
    const next = redoRef.current.pop();
    if (!next) return;
    undoRef.current.push(structuredClone(views));
    setViews(next);
    setSelection(null);
    setDirty(true);
    setHistoryTick((t) => t + 1);
  };

  const setViewLayers = (updater: (ls: Layer[]) => Layer[]) => {
    setViews((v) => ({ ...v, [activeView]: updater(v[activeView]) }));
    setDirty(true);
  };

  const addLayer = (
    partial: Partial<Layer> & { type: LayerType; name: string; x: number; y: number; w: number; h: number },
  ): Layer => {
    pushHistory();
    const layer: Layer = {
      id: uid(),
      visible: true,
      rotation: 0,
      opacity: 1,
      fill: '#1a1c1e',
      ...partial,
    };
    setViewLayers((ls) => [...ls, layer]);
    setSelection(layer.id);
    return layer;
  };

  const updateLayer = (id: string, patch: Partial<Layer>) => {
    setViewLayers((ls) => ls.map((l) => (l.id === id ? { ...l, ...patch } : l)));
    setDirty(true);
  };

  const deleteLayer = (id: string) => {
    pushHistory();
    setViewLayers((ls) => ls.filter((l) => l.id !== id));
    setSelection(null);
  };

  const moveLayer = (id: string, dir: 1 | -1) => {
    pushHistory();
    setViewLayers((ls) => {
      const i = ls.findIndex((l) => l.id === id);
      if (i < 0) return ls;
      const j = i + dir;
      if (j < 0 || j >= ls.length) return ls;
      const next = [...ls];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  };

  const toSvg = (e: React.PointerEvent): [number, number] => {
    const rect = svgRef.current!.getBoundingClientRect();
    return [(e.clientX - rect.left) * (600 / rect.width), (e.clientY - rect.top) * (800 / rect.height)];
  };

  const onSvgPointerDown = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    const [x, y] = toSvg(e);
    if (hudMode === 'draw') {
      dragRef.current = { kind: 'draw', startX: x, startY: y, points: [[x, y]] };
      setDrawPoints([[x, y]]);
      (e.currentTarget as Element).setPointerCapture(e.pointerId);
      return;
    }
    if (hudMode === 'shape' && pendingShape) {
      addLayer({ type: 'shape', name: pendingShape, x: x - 100, y: y - 100, w: 200, h: 200, shape: pendingShape });
      setHudMode('select');
      setPendingShape(null);
      return;
    }
    if (hudMode === 'text') {
      addLayer({ type: 'text', name: 'Text', x, y: y + 40, w: 300, h: 60, text: 'Your text', fontSize: 40, fontFamily: 'Inter', fontWeight: 400 });
      setHudMode('select');
      return;
    }
    setSelection(null);
  };

  const onLayerPointerDown = (e: React.PointerEvent, layer: Layer) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    setSelection(layer.id);
    const [x, y] = toSvg(e);
    dragRef.current = { kind: 'move', id: layer.id, startX: x, startY: y, orig: { ...layer } };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };

  const onHandlePointerDown = (e: React.PointerEvent, corner: 'nw' | 'ne' | 'sw' | 'se', layer: Layer) => {
    if (e.button !== 0) return;
    e.stopPropagation();
    const [x, y] = toSvg(e);
    dragRef.current = { kind: 'resize', id: layer.id, corner, startX: x, startY: y, orig: { ...layer } };
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
  };

  const onSvgPointerMove = (e: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const [x, y] = toSvg(e);
    if (drag.kind === 'draw' && drag.points) {
      const last = drag.points[drag.points.length - 1];
      if (Math.hypot(x - last[0], y - last[1]) > 3) {
        drag.points.push([x, y]);
        setDrawPoints([...drag.points]);
      }
      return;
    }
    if ((drag.kind === 'move' || drag.kind === 'resize') && drag.orig && drag.id) {
      const dx = x - drag.startX;
      const dy = y - drag.startY;
      const o = drag.orig;
      if (drag.kind === 'move') {
        updateLayer(drag.id, { x: o.x + dx, y: o.y + dy });
      } else {
        const c = drag.corner!;
        let nx = o.x;
        let ny = o.y;
        let nw = o.w;
        let nh = o.h;
        if (c === 'se') { nw = Math.max(10, o.w + dx); nh = Math.max(10, o.h + dy); }
        if (c === 'sw') { nx = o.x + dx; nw = Math.max(10, o.w - dx); nh = Math.max(10, o.h + dy); }
        if (c === 'ne') { ny = o.y + dy; nw = Math.max(10, o.w + dx); nh = Math.max(10, o.h - dy); }
        if (c === 'nw') { nx = o.x + dx; ny = o.y + dy; nw = Math.max(10, o.w - dx); nh = Math.max(10, o.h - dy); }
        updateLayer(drag.id, { x: nx, y: ny, w: nw, h: nh });
      }
    }
  };

  const onSvgPointerUp = () => {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag?.kind === 'draw' && drag.points && drag.points.length > 1) {
      pushHistory();
      const d = drag.points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
      const xs = drag.points.map((p) => p[0]);
      const ys = drag.points.map((p) => p[1]);
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      const maxX = Math.max(...xs);
      const maxY = Math.max(...ys);
      addLayer({
        type: 'path',
        name: 'Freehand stroke',
        x: minX,
        y: minY,
        w: Math.max(10, maxX - minX),
        h: Math.max(10, maxY - minY),
        pathD: d,
        strokeWidth: 3,
        fill: '#1a1c1e',
      });
    }
    setDrawPoints([]);
  };

  const alignSelected = (mode: 'left' | 'center' | 'right') => {
    if (!selected) return;
    pushHistory();
    const x = mode === 'left' ? 180 : mode === 'right' ? 180 + 240 - selected.w : 180 + (240 - selected.w) / 2;
    updateLayer(selected.id, { x });
  };

  // ── Save / Publish / Tech pack ──
  const canvasState = (): Record<string, unknown> => ({
    views,
    activeView,
    blankId: selectedBlank?.id ?? null,
    blankName: selectedBlank?.title ?? null,
    activeColorwayId,
  });

  const ensureDesignId = async (): Promise<string> => {
    if (designId) return designId;
    const created = await createDesign({
      name: docName.trim() || 'Untitled design',
      // The route only reads supplierCatalogProductId; blankId is required by
      // the helper's type but ignored server-side.
      blankId: selectedBlank?.id ?? '',
      supplierCatalogProductId: selectedBlank?.id,
      garmentColor: activeColorway?.name,
      productType: selectedBlank?.title ?? (docName.trim() || 'Untitled design'),
    });
    setDesignId(created.id);
    useDesignCanvas.setState({ designId: created.id });
    return created.id;
  };

  const save = async (message?: string): Promise<string | null> => {
    setSaving(true);
    setBanner(null);
    try {
      const id = await ensureDesignId();
      const res = await fetch(`/api/v1/designs/${id}/versions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canvas_state: canvasState(), message, source_app: 'freehand' }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? `Save failed (${res.status}).`);
      }
      const data = await res.json();
      setSavedVersion(data.version_no);
      setSavedAt(new Date().toLocaleTimeString());
      setDirty(false);
      return id;
    } catch (e) {
      setBanner({ kind: 'err', text: e instanceof Error ? e.message : 'Save failed.' });
      return null;
    } finally {
      setSaving(false);
    }
  };

  const doPublish = async () => {
    const id = await save('Publish');
    if (!id) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/v1/designs/${id}/publish`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? `Publish failed (${res.status}).`);
      }
      setBanner({ kind: 'ok', text: 'Published to the catalog — find it in My Products.' });
    } catch (e) {
      setBanner({ kind: 'err', text: e instanceof Error ? e.message : 'Publish failed.' });
    } finally {
      setSaving(false);
    }
  };

  const doCreateTechPack = async () => {
    const id = await save('Create tech pack');
    if (!id) return;
    setBanner({ kind: 'ok', text: `Design saved as v${savedVersion ?? ''} — pick “${docName}” in New tech pack.` });
    onNavigate('design', 'tech-packs');
  };

  // ── Upload / AI ──
  const onFileChosen = async (file: File) => {
    setBanner(null);
    try {
      const form = new FormData();
      form.append('file', file);
      if (designId) form.append('designId', designId);
      form.append('kind', 'upload');
      const res = await fetch('/api/v1/files', { method: 'POST', body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? `Upload failed (${res.status}).`);
      }
      const data = await res.json();
      const asset = data.asset as { id: string; url: string | null; storagePath: string };
      if (!asset.url) throw new Error('Upload stored but no preview URL came back.');
      addLayer({ type: 'image', name: file.name, x: 200, y: 300, w: 200, h: 200, imageUrl: asset.url, assetId: asset.id, storagePath: asset.storagePath });
      await loadRecentAssets();
    } catch (e) {
      setBanner({ kind: 'err', text: e instanceof Error ? e.message : 'Upload failed.' });
    }
  };

  const doGenerate = async () => {
    if (!aiPrompt.trim()) {
      setBanner({ kind: 'err', text: 'Describe the artwork first.' });
      return;
    }
    setAiBusy(true);
    setBanner(null);
    try {
      const res = await fetch('/api/v1/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: aiPrompt.trim(), style: aiStyle, designId: designId ?? undefined }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? `Generation failed (${res.status}).`);
      }
      const data = await res.json();
      const asset = data.asset as { id: string; url: string | null; storagePath: string; prompt: string | null };
      if (!asset.url) throw new Error('Generation finished but no image came back.');
      addLayer({ type: 'image', name: asset.prompt ?? 'AI artwork', x: 200, y: 300, w: 240, h: 240, imageUrl: asset.url, assetId: asset.id, storagePath: asset.storagePath });
      await loadRecentAssets();
    } catch (e) {
      setBanner({ kind: 'err', text: e instanceof Error ? e.message : 'Generation failed.' });
    } finally {
      setAiBusy(false);
    }
  };

  const addColorway = async () => {
    if (!newColorway.name.trim()) return;
    const id = designId ?? (await ensureDesignId().catch(() => null));
    if (!id) {
      setBanner({ kind: 'err', text: 'Could not create the design to hold the colorway.' });
      return;
    }
    try {
      const res = await fetch(`/api/v1/designs/${id}/colorways`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newColorway.name.trim(), hex: newColorway.hex, pantone: newColorway.pantone.trim() || undefined }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? `Add colorway failed (${res.status}).`);
      }
      const data = await res.json();
      setColorways((c) => [...c, data.item as Colorway]);
      setActiveColorwayId(data.item.id);
      setNewColorway({ name: '', hex: '#1a1c1e', pantone: '' });
    } catch (e) {
      setBanner({ kind: 'err', text: e instanceof Error ? e.message : 'Add colorway failed.' });
    }
  };

  // ── Render helpers ──
  const renderLayer = (l: Layer) => {
    const common = {
      transform: `translate(${l.x} ${l.y}) rotate(${l.rotation || 0} ${l.w / 2} ${l.h / 2})`,
      opacity: l.opacity,
      style: { cursor: 'pointer' } as React.CSSProperties,
      onPointerDown: (e: React.PointerEvent) => onLayerPointerDown(e, l),
    };
    if (l.type === 'shape') {
      return (
        <g key={l.id} {...common}>
          <g dangerouslySetInnerHTML={{ __html: shapeSvg(l.shape ?? 'rect', l.w, l.h, l.fill) }} />
        </g>
      );
    }
    if (l.type === 'text') {
      return (
        <g key={l.id} {...common}>
          <text x="0" y={l.fontSize ?? 40} fontFamily={l.fontFamily ?? 'Inter'} fontWeight={l.fontWeight ?? 400} fontSize={l.fontSize ?? 40} fill={l.fill} style={{ userSelect: 'none' }}>
            {l.text ?? 'Text'}
          </text>
        </g>
      );
    }
    if (l.type === 'image') {
      if (l.svgContent) {
        return (
          <g key={l.id} {...common}>
            <g color={l.fill} dangerouslySetInnerHTML={{ __html: `<svg viewBox="0 0 100 100" width="${l.w}" height="${l.h}">${l.svgContent}</svg>` }} />
          </g>
        );
      }
      return (
        <g key={l.id} {...common}>
          {l.imageUrl ? (
            <image href={l.imageUrl} x="0" y="0" width={l.w} height={l.h} preserveAspectRatio="xMidYMid meet" />
          ) : (
            <rect width={l.w} height={l.h} fill="#e3e2e6" />
          )}
        </g>
      );
    }
    if (l.type === 'path') {
      return (
        <g key={l.id} {...common}>
          <path d={l.pathD ?? ''} fill="none" stroke={l.fill} strokeWidth={l.strokeWidth ?? 3} strokeLinecap="round" strokeLinejoin="round" transform={`translate(${-l.x} ${-l.y})`} />
        </g>
      );
    }
    if (l.type === 'pattern') {
      return (
        <g key={l.id} {...common}>
          <defs>
            <pattern id={`pat-${l.id}`} width="100" height="100" patternUnits="userSpaceOnUse">
              <g color={l.fill} dangerouslySetInnerHTML={{ __html: PATTERNS[l.pattern ?? 'stripes-h'] ?? '' }} />
            </pattern>
          </defs>
          <rect width={l.w} height={l.h} fill={`url(#pat-${l.id})`} />
        </g>
      );
    }
    return null;
  };

  const flatPath = activeView === 'front' ? FRONT_BODY : activeView === 'back' ? BACK_BODY : SIDE_BODY;
  const blankCost = selectedBlank?.bestPrice ?? null;
  const totalCost = blankCost; // print + ship have no cost source — never fabricate them
  const margin = totalCost != null && retailPrice != null ? retailPrice - totalCost : null;

  return (
    <div className="h-full flex flex-col bg-[#e9e8eb] overflow-hidden">
      {/* Top bar */}
      <div className="bg-white border-b border-[#dad9dd] flex items-center justify-between px-4 h-12 shrink-0 z-20">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[20px] text-[#6f7a69]">palette</span>
          <div>
            <input
              className="text-[13px] font-semibold bg-transparent border-b border-transparent hover:border-[#dad9dd] focus:border-[#0077c5] focus:outline-none w-56"
              value={docName}
              onChange={(e) => { setDocName(e.target.value); setDirty(true); }}
              aria-label="Design name"
            />
            <div className="text-[11px] text-[#6f7a69]">
              {designId ? `Design ${designId.slice(0, 8)}` : 'Unsaved design'}{savedVersion ? ` · v${savedVersion}` : ''}{savedAt ? ` · saved ${savedAt}` : ''}{dirty ? ' · unsaved changes' : ''}
            </div>
          </div>
          <div className="flex items-center gap-1 ml-2 bg-[#f4f3f7] rounded-md p-0.5">
            {(['front', 'back', 'side'] as ViewKey[]).map((v) => (
              <button
                key={v}
                className={`px-2.5 py-1 rounded text-[11px] font-semibold capitalize ${activeView === v ? 'bg-white shadow-sm text-[#0a6400]' : 'text-[#6f7a69]'}`}
                onClick={() => { setActiveView(v); setSelection(null); }}
              >
                {v}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <button className="w-[30px] h-[30px] rounded flex items-center justify-center hover:bg-[#f4f3f7] disabled:opacity-40" disabled={undoRef.current.length === 0} onClick={undo} title="Undo">
            <span className="material-symbols-outlined text-[18px]">undo</span>
          </button>
          <button className="w-[30px] h-[30px] rounded flex items-center justify-center hover:bg-[#f4f3f7] disabled:opacity-40" disabled={redoRef.current.length === 0} onClick={redo} title="Redo">
            <span className="material-symbols-outlined text-[18px]">redo</span>
          </button>
          <div className="w-px h-5 bg-[#dad9dd] mx-1" />
          <div className="flex items-center bg-[#f4f3f7] rounded-md p-0.5">
            <button className="w-6 h-6 rounded flex items-center justify-center hover:bg-white" onClick={() => setZoom((z) => Math.max(25, z - 10))}><span className="material-symbols-outlined text-[16px]">remove</span></button>
            <span className="text-[11px] font-semibold min-w-11 text-center tabular-nums">{zoom}%</span>
            <button className="w-6 h-6 rounded flex items-center justify-center hover:bg-white" onClick={() => setZoom((z) => Math.min(200, z + 10))}><span className="material-symbols-outlined text-[16px]">add</span></button>
          </div>
          <div className="w-px h-5 bg-[#dad9dd] mx-1" />
          <button className="h-[30px] px-2.5 rounded text-[12px] font-semibold flex items-center gap-1 hover:bg-[#f4f3f7]" onClick={() => setPreviewOpen(true)}>
            <span className="material-symbols-outlined text-[16px]">visibility</span>Preview
          </button>
          <button className="h-[30px] px-2.5 rounded border border-[#dad9dd] text-[12px] font-semibold flex items-center gap-1 hover:bg-[#f4f3f7] disabled:opacity-50" disabled={saving} onClick={() => void save()}>
            <span className="material-symbols-outlined text-[16px]">save</span>{saving ? 'Saving…' : 'Save'}
          </button>
          <button className="h-[30px] px-2.5 rounded text-[12px] font-semibold flex items-center gap-1 hover:bg-[#f4f3f7]" onClick={() => void doCreateTechPack()}>
            <span className="material-symbols-outlined text-[16px]">description</span>Tech pack
          </button>
          <button className="h-[30px] px-3 rounded bg-[#0a6400] text-white text-[12px] font-semibold flex items-center gap-1 hover:bg-[#108000] disabled:opacity-50" disabled={saving} onClick={() => void doPublish()}>
            <span className="material-symbols-outlined text-[16px]">rocket_launch</span>Publish
          </button>
        </div>
      </div>

      {banner && (
        <div className={`px-4 py-2 text-[13px] border-b ${banner.kind === 'ok' ? 'bg-[#f0fdf4] border-[#0a6400] text-[#00714b]' : 'bg-[#ffdad6] border-[#ba1a1a] text-[#93000a]'}`} role="status">
          {banner.text}
          <button className="float-right font-semibold" onClick={() => setBanner(null)} aria-label="Dismiss">×</button>
        </div>
      )}

      <div className="flex-1 flex min-h-0">
        {/* Tool rail */}
        <div className="w-16 bg-white border-r border-[#dad9dd] flex flex-col items-center py-2 gap-0.5 shrink-0">
          {([
            ['layers', 'layers', 'Layers'],
            ['shapes', 'category', 'Shapes'],
            ['type', 'title', 'Text'],
            ['upload', 'cloud_upload', 'Upload'],
            ['assets', 'auto_awesome', 'Assets'],
          ] as const).map(([id, icon, label]) => (
            <button key={id} className={`w-11 h-11 flex flex-col items-center justify-center rounded-md ${tool === id ? 'bg-[#f0fdf4] text-[#0a6400]' : 'text-[#6f7a69] hover:bg-[#f4f3f7]'}`} onClick={() => setTool(id)}>
              <span className="material-symbols-outlined text-[20px]">{icon}</span>
              <span className="text-[8px] font-semibold">{label}</span>
            </button>
          ))}
          <div className="w-8 h-px bg-[#dad9dd] my-1" />
          {([
            ['colors', 'palette', 'Color'],
            ['patterns', 'texture', 'Pattern'],
          ] as const).map(([id, icon, label]) => (
            <button key={id} className={`w-11 h-11 flex flex-col items-center justify-center rounded-md ${tool === id ? 'bg-[#f0fdf4] text-[#0a6400]' : 'text-[#6f7a69] hover:bg-[#f4f3f7]'}`} onClick={() => setTool(id)}>
              <span className="material-symbols-outlined text-[20px]">{icon}</span>
              <span className="text-[8px] font-semibold">{label}</span>
            </button>
          ))}
          <div className="w-8 h-px bg-[#dad9dd] my-1" />
          <button className={`w-11 h-11 flex flex-col items-center justify-center rounded-md ${tool === 'ai' ? 'bg-[#f0fdf4] text-[#0a6400]' : 'text-[#6f7a69] hover:bg-[#f4f3f7]'}`} onClick={() => setTool('ai')}>
            <span className="material-symbols-outlined text-[20px]">magic_button</span>
            <span className="text-[8px] font-semibold">AI</span>
          </button>
        </div>

        {/* Left panel */}
        <div className="w-[260px] bg-white border-r border-[#dad9dd] flex flex-col shrink-0 min-h-0">
          <div className="px-3.5 py-2.5 border-b border-[#dad9dd] flex items-center justify-between shrink-0">
            <span className="text-[12px] font-bold uppercase tracking-wide">
              {{ layers: 'Layers', shapes: 'Shapes', type: 'Text', upload: 'Upload', assets: 'Assets', colors: 'Colors', patterns: 'Patterns', ai: 'AI Generate' }[tool]}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {tool === 'layers' && (
              layers.length === 0 ? (
                <div className="text-center py-8 text-[#6f7a69] text-[12px]">
                  <span className="material-symbols-outlined text-[40px] block mb-2 text-[#dad9dd]">layers_clear</span>
                  <div className="font-semibold text-[#1a1c1e] mb-1">No layers yet</div>
                  <div>Add artwork from Upload, Shapes, or Text</div>
                </div>
              ) : (
                <div className="flex flex-col gap-px">
                  {[...layers].reverse().map((l) => (
                    <div key={l.id} className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-[11px] ${selection === l.id ? 'bg-[#f0fdf4] text-[#0a6400] font-semibold' : 'hover:bg-[#f4f3f7]'}`} onClick={() => setSelection(l.id)}>
                      <span className="material-symbols-outlined text-[14px] text-[#6f7a69]">{l.type === 'image' ? 'image' : l.type === 'text' ? 'title' : l.type === 'shape' ? 'category' : l.type === 'path' ? 'edit' : 'circle'}</span>
                      <span className="flex-1 truncate">{l.name}</span>
                      <button className="w-5 h-5 rounded flex items-center justify-center hover:bg-white" title="Toggle visibility" onClick={(e) => { e.stopPropagation(); updateLayer(l.id, { visible: !l.visible }); }}>
                        <span className="material-symbols-outlined text-[14px]">{l.visible === false ? 'visibility_off' : 'visibility'}</span>
                      </button>
                    </div>
                  ))}
                </div>
              )
            )}
            {tool === 'shapes' && (
              <div className="grid grid-cols-2 gap-1.5">
                {SHAPES.map((s) => (
                  <button
                    key={s.kind}
                    className="aspect-square bg-[#f4f3f7] border border-[#dad9dd] rounded hover:border-[#0077c5] flex items-center justify-center"
                    title={s.label}
                    onClick={() => { addLayer({ type: 'shape', name: s.label, x: 200, y: 300, w: 200, h: 200, shape: s.kind }); setTool('layers'); }}
                  >
                    <svg viewBox="0 0 100 100" className="w-full h-full"><g dangerouslySetInnerHTML={{ __html: shapeThumb(s.kind) }} /></svg>
                  </button>
                ))}
              </div>
            )}
            {tool === 'type' && (
              <div className="space-y-4">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#6f7a69] mb-2">Add text</div>
                  <div className="flex flex-col gap-1.5">
                    {([
                      ['heading', 'Heading', 20, 700],
                      ['subheading', 'Subheading', 14, 600],
                      ['body', 'Body text', 12, 400],
                    ] as const).map(([kind, label, size, weight]) => (
                      <button key={kind} className="border border-[#dad9dd] rounded px-3 py-2.5 text-left hover:bg-[#f4f3f7]" style={{ fontSize: size, fontWeight: weight }} onClick={() => { addLayer({ type: 'text', name: label, x: 150, y: 380, w: 300, h: 60, text: label, fontSize: size, fontFamily: 'Inter', fontWeight: weight }); setTool('layers'); }}>
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#6f7a69] mb-2">Font pairs</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button className="border border-[#dad9dd] rounded h-20 flex flex-col items-center justify-center gap-0.5 hover:bg-[#f4f3f7]" onClick={() => { addLayer({ type: 'text', name: 'Inter text', x: 150, y: 380, w: 300, h: 60, text: 'Your text', fontSize: 32, fontFamily: 'Inter', fontWeight: 700 }); setTool('layers'); }}>
                      <span className="text-[16px] font-bold">Inter</span><span className="text-[9px] text-[#6f7a69]">Clean · Modern</span>
                    </button>
                    <button className="border border-[#dad9dd] rounded h-20 flex flex-col items-center justify-center gap-0.5 hover:bg-[#f4f3f7]" onClick={() => { addLayer({ type: 'text', name: 'Georgia text', x: 150, y: 380, w: 300, h: 60, text: 'Your text', fontSize: 32, fontFamily: 'Georgia', fontWeight: 700 }); setTool('layers'); }}>
                      <span className="text-[16px] font-bold" style={{ fontFamily: 'Georgia, serif' }}>Georgia</span><span className="text-[9px] text-[#6f7a69]">Classic · Editorial</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
            {tool === 'upload' && (
              <div>
                <div className="border-2 border-dashed border-[#dad9dd] rounded-lg p-5 text-center cursor-pointer hover:border-[#0077c5] hover:bg-[#f0f8ff]" onClick={() => fileRef.current?.click()}>
                  <span className="material-symbols-outlined text-[32px] text-[#6f7a69] block mb-2">cloud_upload</span>
                  <div className="text-[12px] font-semibold mb-1">Upload artwork</div>
                  <div className="text-[10px] text-[#6f7a69]">Click to browse — stored in your asset library</div>
                  <div className="flex gap-1 justify-center mt-2.5 flex-wrap">
                    {['SVG', 'PNG', 'JPG'].map((t) => <span key={t} className="px-1.5 py-0.5 bg-[#f4f3f7] rounded text-[9px] font-bold text-[#6f7a69]">{t}</span>)}
                  </div>
                </div>
                <input ref={fileRef} type="file" accept=".svg,.png,.jpg,.jpeg" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFileChosen(f); e.target.value = ''; }} />
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#6f7a69] mt-4 mb-2">Recent uploads</div>
                {recentAssets.length === 0 ? (
                  <div className="text-center text-[#6f7a69] text-[11px] py-4">No uploads yet</div>
                ) : (
                  <div className="grid grid-cols-2 gap-1.5">
                    {recentAssets.map((a) => (
                      <button key={a.id} className="aspect-square bg-[#f4f3f7] border border-[#dad9dd] rounded overflow-hidden hover:border-[#0077c5]" title={a.prompt ?? 'Upload'} onClick={() => { if (a.url) addLayer({ type: 'image', name: a.prompt ?? 'Upload', x: 200, y: 300, w: 200, h: 200, imageUrl: a.url, assetId: a.id, storagePath: a.storagePath }); }}>
                        {a.url ? <img src={a.url} alt={a.prompt ?? 'Upload'} className="w-full h-full object-cover" /> : <span className="text-[10px] text-[#6f7a69]">No preview</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {tool === 'assets' && (
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#6f7a69] mb-2">Graphics</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {Object.entries(ASSET_SHAPES).map(([kind, svg]) => (
                    <button key={kind} className="aspect-square bg-[#f4f3f7] border border-[#dad9dd] rounded hover:border-[#0077c5] flex items-center justify-center" title={kind} onClick={() => { addLayer({ type: 'image', name: kind, x: 200, y: 300, w: 200, h: 200, svgContent: svg }); setTool('layers'); }}>
                      <svg viewBox="0 0 100 100" className="w-full h-full" style={{ color: '#1a1c1e' }}><g dangerouslySetInnerHTML={{ __html: svg }} /></svg>
                    </button>
                  ))}
                </div>
              </div>
            )}
            {tool === 'colors' && (
              <div className="space-y-4">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#6f7a69] mb-2">Colorway</div>
                  {colorways.length === 0 ? (
                    <p className="text-[12px] text-[#6f7a69]">No colorways yet — add one below. The active colorway tints the flat.</p>
                  ) : (
                    colorways.map((c) => (
                      <div key={c.id} className={`flex items-center gap-2 px-2 py-1.5 rounded cursor-pointer text-[12px] ${activeColorwayId === c.id ? 'bg-[#f0fdf4] text-[#0a6400] font-semibold' : 'hover:bg-[#f4f3f7]'}`} onClick={() => setActiveColorwayId(c.id)}>
                        <span className="w-5 h-5 rounded-sm border border-[#dad9dd]" style={{ background: c.hex ?? '#eee' }} />
                        <span>{c.name}</span>
                        <span className="ml-auto text-[10px] text-[#6f7a69]">{c.pantone ?? ''}</span>
                      </div>
                    ))
                  )}
                  <div className="grid grid-cols-[1fr_64px] gap-1.5 mt-2">
                    <input className="h-7 px-2 border border-[#dad9dd] rounded text-[11px]" placeholder="Name, e.g. Heather White" value={newColorway.name} onChange={(e) => setNewColorway((n) => ({ ...n, name: e.target.value }))} />
                    <input type="color" className="h-7 w-full border border-[#dad9dd] rounded" value={newColorway.hex} onChange={(e) => setNewColorway((n) => ({ ...n, hex: e.target.value }))} aria-label="Colorway hex" />
                  </div>
                  <div className="flex gap-1.5 mt-1.5">
                    <input className="flex-1 h-7 px-2 border border-[#dad9dd] rounded text-[11px]" placeholder="Pantone, e.g. 11-0601 TCX" value={newColorway.pantone} onChange={(e) => setNewColorway((n) => ({ ...n, pantone: e.target.value }))} />
                    <button className="h-7 px-3 bg-[#1a1c1e] text-white rounded text-[11px] font-semibold disabled:opacity-50" disabled={!newColorway.name.trim()} onClick={() => void addColorway()}>Add</button>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#6f7a69] mb-2">Apply to selected layer</div>
                  <div className="grid grid-cols-8 gap-1">
                    {SWATCHES.map((hex) => (
                      <button key={hex} className={`aspect-square rounded border border-black/10 hover:scale-110 ${selected?.fill === hex ? 'ring-2 ring-[#0a6400]' : ''}`} style={{ background: hex }} title={hex} onClick={() => { if (selected) updateLayer(selected.id, { fill: hex }); }} />
                    ))}
                  </div>
                  <div className="grid grid-cols-[1fr_auto] gap-1.5 mt-3">
                    <input className="h-7 px-2 border border-[#dad9dd] rounded text-[11px]" placeholder="#HEX or rgba()" value={hexInput} onChange={(e) => setHexInput(e.target.value)} />
                    <button className="h-7 px-3 bg-[#1a1c1e] text-white rounded text-[11px] font-semibold" onClick={() => { if (selected && hexInput.trim()) { updateLayer(selected.id, { fill: hexInput.trim() }); setHexInput(''); } }}>Apply</button>
                  </div>
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#6f7a69] mb-2">Gradients</div>
                  <div className="grid grid-cols-2 gap-1.5">
                    {([
                      ['sunset', 'linear-gradient(135deg,#ff6b6b,#feca57)'],
                      ['ocean', 'linear-gradient(135deg,#0077c5,#1e5a38)'],
                      ['forest', 'linear-gradient(135deg,#1e5a38,#8a5a00)'],
                      ['royal', 'linear-gradient(135deg,#5c3fc4,#be185d)'],
                    ] as const).map(([name, css]) => (
                      <button key={name} className="aspect-square rounded border border-[#dad9dd] hover:border-[#0077c5]" style={{ background: css }} title={name} onClick={() => { if (selected) updateLayer(selected.id, { fill: name === 'sunset' ? '#ff6b6b' : name === 'ocean' ? '#0077c5' : name === 'forest' ? '#1e5a38' : '#5c3fc4' }); }} />
                    ))}
                  </div>
                </div>
              </div>
            )}
            {tool === 'patterns' && (
              <div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-[#6f7a69] mb-2">Pattern presets</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {Object.entries(PATTERNS).map(([kind, svg]) => (
                    <button key={kind} className="aspect-square bg-[#f4f3f7] border border-[#dad9dd] rounded hover:border-[#0077c5] overflow-hidden" title={kind} onClick={() => { addLayer({ type: 'pattern', name: kind, x: 180, y: 240, w: 240, h: 320, pattern: kind }); setTool('layers'); }}>
                      <svg viewBox="0 0 100 100" className="w-full h-full" style={{ color: '#1a1c1e' }}><g dangerouslySetInnerHTML={{ __html: svg }} /></svg>
                    </button>
                  ))}
                </div>
                <p className="text-[11px] text-[#6f7a69] mt-3">A pattern fills the print area — apply it to the whole garment or resize it onto a layer.</p>
              </div>
            )}
            {tool === 'ai' && (
              <div className="space-y-4">
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#6f7a69] mb-2">Describe the artwork</div>
                  <textarea className="w-full h-[100px] p-2 border border-[#dad9dd] rounded text-[12px] resize-y" placeholder="e.g. minimal mountain range, retro sunset palette, vector style" value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} />
                </div>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#6f7a69] mb-2">Style</div>
                  <div className="grid grid-cols-2 gap-1">
                    {['Flat vector', 'Line art', 'Watercolor', 'Retro'].map((s) => (
                      <button key={s} className={`border rounded px-2 py-1.5 text-[11px] ${aiStyle === s ? 'border-[#0a6400] bg-[#f0fdf4] text-[#0a6400] font-semibold' : 'border-[#dad9dd]'}`} onClick={() => setAiStyle(s)}>{s}</button>
                    ))}
                  </div>
                </div>
                <button className="w-full py-2.5 bg-[#0a6400] text-white rounded text-[12px] font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50" disabled={aiBusy || !aiPrompt.trim()} onClick={() => void doGenerate()}>
                  <span className="material-symbols-outlined text-[16px]">auto_awesome</span>{aiBusy ? 'Generating…' : 'Generate artwork'}
                </button>
                <div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-[#6f7a69] mb-2">Recent</div>
                  {recentAssets.filter((a) => a.prompt).length === 0 ? (
                    <div className="text-center text-[#6f7a69] text-[11px] py-4">No generations yet</div>
                  ) : (
                    <div className="grid grid-cols-2 gap-1.5">
                      {recentAssets.filter((a) => a.prompt).slice(0, 8).map((a) => (
                        <button key={a.id} className="aspect-square bg-[#f4f3f7] border border-[#dad9dd] rounded overflow-hidden hover:border-[#0077c5]" title={a.prompt ?? ''} onClick={() => { if (a.url) addLayer({ type: 'image', name: a.prompt ?? 'AI artwork', x: 200, y: 300, w: 240, h: 240, imageUrl: a.url, assetId: a.id, storagePath: a.storagePath }); }}>
                          {a.url && <img src={a.url} alt={a.prompt ?? 'AI artwork'} className="w-full h-full object-cover" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 relative overflow-hidden flex items-center justify-center min-w-0" style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, rgba(0,0,0,.08) 1px, transparent 0)', backgroundSize: '20px 20px' }}>
          <div style={{ transform: `scale(${zoom / 100})`, transformOrigin: 'center center' }}>
            <svg
              ref={svgRef}
              viewBox="0 0 600 800"
              width="600"
              height="800"
              className="bg-white shadow-[0_4px_48px_rgba(0,0,0,0.12)] block touch-none select-none"
              onPointerDown={onSvgPointerDown}
              onPointerMove={onSvgPointerMove}
              onPointerUp={onSvgPointerUp}
            >
              <g transform="translate(0 25) scale(1.875)">
                <path d={flatPath} fill={flatFill} fillOpacity={activeColorway ? 0.3 : 1} stroke="#1a1c1e" strokeWidth="0.7" />
                {activeView === 'front' && (
                  <>
                    <path d="M 120 65 Q 160 92 200 65" fill="none" stroke="#1a1c1e" strokeWidth="0.6" />
                    <path d="M 122 72 Q 160 98 198 72" fill="none" stroke="#1a1c1e" strokeWidth="0.5" />
                  </>
                )}
              </g>
              {showPrintArea && (
                <g>
                  <rect x="180" y="240" width="240" height="320" fill="none" stroke="#0077c5" strokeWidth="1" strokeDasharray="6 4" opacity="0.4" />
                  <text x="300" y="232" textAnchor="middle" fontFamily="Inter" fontSize="10" fontWeight="700" fill="#0077c5" opacity="0.6" letterSpacing="1">PRINT AREA · 240×320 mm</text>
                </g>
              )}
              <g>
                {layers.filter((l) => l.visible !== false).map((l) => renderLayer(l))}
              </g>
              {drawPoints.length > 1 && (
                <path d={drawPoints.map(([x, y], i) => `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`).join(' ')} fill="none" stroke="#1a1c1e" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
              )}
              {selected && (
                <g pointerEvents="none">
                  <rect x={selected.x - 4} y={selected.y - 4} width={selected.w + 8} height={selected.h + 8} fill="none" stroke="#0a6400" strokeWidth="1.5" strokeDasharray="4 2" />
                </g>
              )}
              {selected && ([
                ['nw', selected.x - 4, selected.y - 4],
                ['ne', selected.x + selected.w + 4, selected.y - 4],
                ['sw', selected.x - 4, selected.y + selected.h + 4],
                ['se', selected.x + selected.w + 4, selected.y + selected.h + 4],
              ] as const).map(([corner, cx, cy]) => (
                <circle
                  key={corner}
                  cx={cx}
                  cy={cy}
                  r="6"
                  fill="#fff"
                  stroke="#0a6400"
                  strokeWidth="1.5"
                  style={{ cursor: corner === 'nw' || corner === 'se' ? 'nwse-resize' : 'nesw-resize' }}
                  onPointerDown={(e) => onHandlePointerDown(e, corner, selected)}
                />
              ))}
            </svg>
          </div>

          {/* Canvas HUD */}
          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white border border-[#dad9dd] rounded-lg shadow-md p-1.5 flex items-center gap-0.5 z-10">
            {([
              ['select', 'cursor', 'Select (V)'],
              ['draw', 'edit', 'Draw (P)'],
              ['shape', 'square', 'Shape (M)'],
              ['text', 'text_fields', 'Text (T)'],
            ] as const).map(([mode, icon, title]) => (
              <button key={mode} title={title} className={`w-[30px] h-[30px] rounded flex items-center justify-center ${hudMode === mode ? 'bg-[#f0fdf4] text-[#0a6400]' : 'text-[#6f7a69] hover:bg-[#f4f3f7]'}`} onClick={() => { setHudMode(mode); if (mode === 'shape') setTool('shapes'); if (mode === 'text') setTool('type'); }}>
                <span className="material-symbols-outlined text-[16px]">{icon}</span>
              </button>
            ))}
            <div className="w-px h-5 bg-[#dad9dd] mx-1" />
            <button title="Align left" className="w-[30px] h-[30px] rounded flex items-center justify-center text-[#6f7a69] hover:bg-[#f4f3f7] disabled:opacity-40" disabled={!selected} onClick={() => alignSelected('left')}><span className="material-symbols-outlined text-[16px]">align_horizontal_left</span></button>
            <button title="Align center" className="w-[30px] h-[30px] rounded flex items-center justify-center text-[#6f7a69] hover:bg-[#f4f3f7] disabled:opacity-40" disabled={!selected} onClick={() => alignSelected('center')}><span className="material-symbols-outlined text-[16px]">align_horizontal_center</span></button>
            <button title="Align right" className="w-[30px] h-[30px] rounded flex items-center justify-center text-[#6f7a69] hover:bg-[#f4f3f7] disabled:opacity-40" disabled={!selected} onClick={() => alignSelected('right')}><span className="material-symbols-outlined text-[16px]">align_horizontal_right</span></button>
            <div className="w-px h-5 bg-[#dad9dd] mx-1" />
            <button title="Toggle print area" className={`w-[30px] h-[30px] rounded flex items-center justify-center ${showPrintArea ? 'bg-[#f0fdf4] text-[#0a6400]' : 'text-[#6f7a69] hover:bg-[#f4f3f7]'}`} onClick={() => setShowPrintArea((v) => !v)}><span className="material-symbols-outlined text-[16px]">crop_free</span></button>
          </div>
          {hudMode === 'draw' && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-[#1a1c1e] text-white text-[12px] px-3 py-1.5 rounded-full z-10">Freehand — drag on the canvas to sketch</div>
          )}
          {hudMode === 'shape' && pendingShape && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-[#1a1c1e] text-white text-[12px] px-3 py-1.5 rounded-full z-10">Click the canvas to place the {pendingShape}</div>
          )}
        </div>

        {/* Right panel */}
        <div className="w-[300px] bg-white border-l border-[#dad9dd] flex flex-col shrink-0 min-h-0">
          <div className="px-3.5 py-2.5 border-b border-[#dad9dd] flex items-center justify-between shrink-0">
            <span className="text-[12px] font-bold uppercase tracking-wide">Properties</span>
          </div>
          <div className="flex-1 overflow-y-auto">
            {!selected ? (
              <div className="p-4 text-[12px] text-[#6f7a69]">
                <p className="mb-2">Nothing selected.</p>
                <p>Click a layer on the canvas or in the Layers panel to edit its position, size, color, and text.</p>
                <p className="mt-3">The flat shows the {activeView} view. Switch views in the top bar — each view keeps its own layers.</p>
              </div>
            ) : (
              <>
                <div className="px-3.5 py-3 border-b border-[#dad9dd]">
                  <div className="text-[10px] font-bold uppercase tracking-wider mb-2.5 flex justify-between items-center">
                    <span>{selected.type} · {selected.name}</span>
                    <button className="text-[#ba1a1a] normal-case tracking-normal text-[11px] font-semibold" onClick={() => deleteLayer(selected.id)}>Delete</button>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    {([['X', 'x'], ['Y', 'y'], ['W', 'w'], ['H', 'h']] as const).map(([label, key]) => (
                      <label key={key} className="grid grid-cols-[28px_1fr] items-center gap-2">
                        <span className="text-[11px] text-[#6f7a69]">{label}</span>
                        <input
                          type="number"
                          className="h-7 px-2 border border-[#dad9dd] rounded text-[11px] w-full tabular-nums"
                          value={Math.round(selected[key])}
                          onChange={(e) => updateLayer(selected.id, { [key]: Number(e.target.value) || 0 })}
                        />
                      </label>
                    ))}
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <label className="grid grid-cols-[28px_1fr] items-center gap-2">
                      <span className="text-[11px] text-[#6f7a69]">Rot</span>
                      <input type="number" className="h-7 px-2 border border-[#dad9dd] rounded text-[11px] w-full tabular-nums" value={selected.rotation} onChange={(e) => updateLayer(selected.id, { rotation: Number(e.target.value) || 0 })} />
                    </label>
                    <label className="grid grid-cols-[28px_1fr] items-center gap-2">
                      <span className="text-[11px] text-[#6f7a69]">Op</span>
                      <input type="number" min="0" max="1" step="0.05" className="h-7 px-2 border border-[#dad9dd] rounded text-[11px] w-full tabular-nums" value={selected.opacity} onChange={(e) => updateLayer(selected.id, { opacity: Math.min(1, Math.max(0, Number(e.target.value) || 0)) })} />
                    </label>
                  </div>
                  <label className="grid grid-cols-[28px_1fr] items-center gap-2 mt-2">
                    <span className="text-[11px] text-[#6f7a69]">Fill</span>
                    <span className="flex gap-1.5 items-center">
                      <input type="color" className="h-7 w-10 border border-[#dad9dd] rounded" value={/^#[0-9a-fA-F]{6}$/.test(selected.fill) ? selected.fill : '#1a1c1e'} onChange={(e) => updateLayer(selected.id, { fill: e.target.value })} aria-label="Fill color" />
                      <input className="flex-1 h-7 px-2 border border-[#dad9dd] rounded text-[11px]" value={selected.fill} onChange={(e) => updateLayer(selected.id, { fill: e.target.value })} />
                    </span>
                  </label>
                </div>
                {selected.type === 'text' && (
                  <div className="px-3.5 py-3 border-b border-[#dad9dd]">
                    <div className="text-[10px] font-bold uppercase tracking-wider mb-2.5">Text</div>
                    <textarea className="w-full h-16 p-2 border border-[#dad9dd] rounded text-[12px] resize-y" value={selected.text ?? ''} onChange={(e) => updateLayer(selected.id, { text: e.target.value })} />
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <label className="grid grid-cols-[28px_1fr] items-center gap-2">
                        <span className="text-[11px] text-[#6f7a69]">Size</span>
                        <input type="number" className="h-7 px-2 border border-[#dad9dd] rounded text-[11px] w-full" value={selected.fontSize ?? 40} onChange={(e) => updateLayer(selected.id, { fontSize: Number(e.target.value) || 12 })} />
                      </label>
                      <label className="grid grid-cols-[28px_1fr] items-center gap-2">
                        <span className="text-[11px] text-[#6f7a69]">Font</span>
                        <select className="h-7 px-1 border border-[#dad9dd] rounded text-[11px] w-full" value={selected.fontFamily ?? 'Inter'} onChange={(e) => updateLayer(selected.id, { fontFamily: e.target.value })}>
                          <option value="Inter">Inter</option>
                          <option value="Georgia">Georgia</option>
                        </select>
                      </label>
                    </div>
                  </div>
                )}
                <div className="px-3.5 py-3 border-b border-[#dad9dd]">
                  <div className="text-[10px] font-bold uppercase tracking-wider mb-2.5">Layer order</div>
                  <div className="flex gap-1.5">
                    <button className="flex-1 h-7 border border-[#dad9dd] rounded text-[11px] font-semibold hover:bg-[#f4f3f7]" onClick={() => moveLayer(selected.id, 1)}>Bring forward</button>
                    <button className="flex-1 h-7 border border-[#dad9dd] rounded text-[11px] font-semibold hover:bg-[#f4f3f7]" onClick={() => moveLayer(selected.id, -1)}>Send backward</button>
                    <button className="flex-1 h-7 border border-[#dad9dd] rounded text-[11px] font-semibold hover:bg-[#f4f3f7]" onClick={() => { const c = { ...selected, id: uid(), name: `${selected.name} copy`, x: selected.x + 16, y: selected.y + 16 }; pushHistory(); setViewLayers((ls) => [...ls, c]); setSelection(c.id); }}>Duplicate</button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Bottom strip */}
      <div className="bg-white border-t border-[#dad9dd] flex flex-col shrink-0 z-10" style={{ height: 200 }}>
        <div className="px-3.5 py-1.5 border-b border-[#dad9dd] flex items-center justify-between shrink-0">
          <div className="flex gap-0.5">
            {([
              ['blank', 'Blank'],
              ['variants', 'Variants'],
              ['cost', 'Cost & margin'],
            ] as const).map(([id, label]) => (
              <button key={id} className={`px-3.5 py-1.5 rounded text-[11px] font-semibold ${stripTab === id ? 'bg-[#1a1c1e] text-white' : 'text-[#6f7a69] hover:bg-[#f4f3f7]'}`} onClick={() => setStripTab(id)}>
                {label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] text-[#6f7a69]">Saving to:</span>
            <span className="text-[11px] font-semibold">{designId ? `designs.${designId.slice(0, 8)}` : 'new design — saves on first Save'}</span>
          </div>
        </div>
        <div className="flex-1 overflow-x-auto overflow-y-hidden flex gap-2 px-3.5 py-2.5 items-center">
          {stripTab === 'blank' && (
            <>
              <input
                className="h-9 px-3 border border-[#dad9dd] rounded text-[12px] w-56 shrink-0"
                placeholder="Search blanks…"
                value={blankQuery}
                onChange={(e) => { setBlankQuery(e.target.value); void searchBlanks(e.target.value); }}
              />
              {blanks.length === 0 && <span className="text-[12px] text-[#6f7a69]">No blanks match.</span>}
              {blanks.map((b) => (
                <button
                  key={b.id}
                  className={`shrink-0 w-20 text-center rounded-md p-1 ${selectedBlank?.id === b.id ? 'bg-[#f0fdf4]' : 'hover:bg-[#f4f3f7]'}`}
                  onClick={() => { setSelectedBlank(b); setDirty(true); }}
                  title={b.title}
                >
                  <span className="w-20 h-20 bg-[#f4f3f7] border border-[#dad9dd] rounded flex items-center justify-center overflow-hidden block mb-1" style={selectedBlank?.id === b.id ? { borderColor: '#0a6400', boxShadow: '0 0 0 1px #0a6400' } : undefined}>
                    {b.image ? <img src={b.image} alt={b.title} className="w-full h-full object-cover" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} /> : <span className="material-symbols-outlined text-[#6f7a69]">checkroom</span>}
                  </span>
                  <span className="text-[10px] font-semibold block truncate">{b.title}</span>
                  <span className="text-[9px] text-[#6f7a69] block">{b.sku || `${b.suppliers} supplier${b.suppliers === 1 ? '' : 's'} · ${b.variantCount} variants`}</span>
                </button>
              ))}
            </>
          )}
          {stripTab === 'variants' && (
            <>
              {colorways.length === 0 ? (
                <span className="text-[12px] text-[#6f7a69]">No colorways yet — add one in the Color panel.</span>
              ) : (
                colorways.map((c) => (
                  <button key={c.id} className={`shrink-0 w-20 text-center rounded-md p-1 ${activeColorwayId === c.id ? 'bg-[#f0fdf4]' : 'hover:bg-[#f4f3f7]'}`} onClick={() => { setActiveColorwayId(c.id); setDirty(true); }}>
                    <span className="w-20 h-20 border border-[#dad9dd] rounded block mb-1" style={{ background: c.hex ?? '#eee', ...(activeColorwayId === c.id ? { borderColor: '#0a6400', boxShadow: '0 0 0 1px #0a6400' } : {}) }} />
                    <span className="text-[10px] font-semibold block truncate">{c.name}</span>
                    <span className="text-[9px] text-[#6f7a69] block">{c.pantone ?? ''}</span>
                  </button>
                ))
              )}
              {selectedBlank && <span className="text-[12px] text-[#6f7a69] ml-2">Blank: {selectedBlank.title}</span>}
            </>
          )}
          {stripTab === 'cost' && (
            <div className="flex items-center gap-4 px-3.5 h-full tabular-nums">
              {([
                ['Blank', money(blankCost)],
                ['Print', '—'],
                ['Ship', '—'],
                ['Total', money(totalCost)],
                ['Retail', money(retailPrice)],
                ['Margin', margin != null ? `${money(margin)} · ${retailPrice ? Math.round((margin / retailPrice) * 100) : 0}%` : '—'],
              ] as const).map(([k, v], i) => (
                <div key={k} className="flex items-center gap-4">
                  {i > 0 && <div className="w-px h-8 bg-[#dad9dd]" />}
                  <div className="flex flex-col gap-0.5">
                    <span className="text-[9px] font-bold uppercase tracking-wider text-[#6f7a69]">{k}</span>
                    <span className={`text-[14px] font-bold ${k === 'Margin' && margin != null && margin > 0 ? 'text-[#0a6400]' : ''}`}>{v}</span>
                  </div>
                </div>
              ))}
              <span className="text-[11px] text-[#6f7a69] ml-2">Print and shipping costs come from the supplier — no cost is shown until the supplier prices it.</span>
            </div>
          )}
        </div>
      </div>

      {/* Preview drawer */}
      {previewOpen && (
        <div className="fixed inset-0 z-[81] flex justify-end" role="dialog" aria-label="Design preview">
          <div className="absolute inset-0 bg-black/35" onClick={() => setPreviewOpen(false)} />
          <div className="relative w-[640px] max-w-[96vw] bg-white h-full flex flex-col shadow-xl">
            <div className="flex items-center justify-between px-5 py-4 border-b border-[#dad9dd]">
              <div>
                <h2 className="text-[16px] font-semibold">Preview — {docName}</h2>
                <p className="text-[12px] text-[#6f7a69] mt-0.5">{savedVersion ? `v${savedVersion}` : 'Unsaved'} · {activeColorway?.name ?? 'Default colorway'} · {selectedBlank?.title ?? 'No blank chosen'}</p>
              </div>
              <div className="flex items-center gap-1.5">
                {designId && (
                  <button
                    className="h-8 px-3 rounded bg-[#0a6400] text-white text-[12px] font-semibold flex items-center gap-1.5 hover:bg-[#108000]"
                    onClick={() => {
                      setPreviewOpen(false);
                      onNavigate('design', 'studio-design-preview');
                    }}
                  >
                    <span className="material-symbols-outlined text-[16px]">open_in_new</span>Open full preview
                  </button>
                )}
                <button className="w-8 h-8 rounded hover:bg-[#f4f3f7] flex items-center justify-center" onClick={() => setPreviewOpen(false)} aria-label="Close">
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <div className="grid grid-cols-3 gap-4">
                {(['front', 'back', 'side'] as ViewKey[]).map((v) => (
                  <div key={v}>
                    <div className="text-[11px] font-bold uppercase tracking-wider text-center mb-2">{v}</div>
                    <svg viewBox="0 0 600 800" className="w-full bg-white border border-[#dad9dd]">
                      <g transform="translate(0 25) scale(1.875)">
                        <path d={v === 'front' ? FRONT_BODY : v === 'back' ? BACK_BODY : SIDE_BODY} fill={flatFill} fillOpacity={activeColorway ? 0.3 : 1} stroke="#1a1c1e" strokeWidth="0.7" />
                      </g>
                      {showPrintArea && <rect x="180" y="240" width="240" height="320" fill="none" stroke="#0077c5" strokeWidth="1" strokeDasharray="6 4" opacity="0.4" />}
                      {views[v].filter((l) => l.visible !== false).map((l) => (
                        <g key={l.id} transform={`translate(${l.x} ${l.y}) rotate(${l.rotation || 0} ${l.w / 2} ${l.h / 2})`} opacity={l.opacity}>
                          {l.type === 'shape' && <g dangerouslySetInnerHTML={{ __html: shapeSvg(l.shape ?? 'rect', l.w, l.h, l.fill) }} />}
                          {l.type === 'text' && <text x="0" y={l.fontSize ?? 40} fontFamily={l.fontFamily ?? 'Inter'} fontWeight={l.fontWeight ?? 400} fontSize={l.fontSize ?? 40} fill={l.fill}>{l.text ?? 'Text'}</text>}
                          {l.type === 'image' && l.svgContent && <g color={l.fill} dangerouslySetInnerHTML={{ __html: `<svg viewBox="0 0 100 100" width="${l.w}" height="${l.h}">${l.svgContent}</svg>` }} />}
                          {l.type === 'image' && !l.svgContent && l.imageUrl && <image href={l.imageUrl} x="0" y="0" width={l.w} height={l.h} preserveAspectRatio="xMidYMid meet" />}
                          {l.type === 'path' && <path d={l.pathD ?? ''} fill="none" stroke={l.fill} strokeWidth={l.strokeWidth ?? 3} strokeLinecap="round" strokeLinejoin="round" transform={`translate(${-l.x} ${-l.y})`} />}
                          {l.type === 'pattern' && (
                            <>
                              <defs>
                                <pattern id={`pv-${v}-${l.id}`} width="100" height="100" patternUnits="userSpaceOnUse">
                                  <g color={l.fill} dangerouslySetInnerHTML={{ __html: PATTERNS[l.pattern ?? 'stripes-h'] ?? '' }} />
                                </pattern>
                              </defs>
                              <rect width={l.w} height={l.h} fill={`url(#pv-${v}-${l.id})`} />
                            </>
                          )}
                        </g>
                      ))}
                    </svg>
                    <div className="text-[11px] text-[#6f7a69] text-center mt-1">{views[v].length} layer{views[v].length === 1 ? '' : 's'}</div>
                  </div>
                ))}
              </div>
              {dirty && <p className="text-[12px] text-[#8a5a00] mt-4">Unsaved changes — Save before publishing or creating a tech pack.</p>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
