import { useEffect, useMemo, useRef, useState } from 'react';
import type { DomainKey } from '@/data/shellData';
import { useDesignCanvas } from '@/lib/designCanvasStore';
import { supabaseBrowser } from '@/lib/supabaseBrowser';
import {
  TECH_PACK_ALLOWED_TO,
  TECH_PACK_TRANSITION_LABEL,
  techPackStatusLabel,
  type PomLibraryRow,
  type TechPackSnapshot,
} from '@/lib/techPackTypes';
import TechPackSnapshotDrawer from './TechPackSnapshotDrawer';
import type { BomLedger } from '@/lib/bomLedger';

/* Garment flats — the same SVG outlines as tech_pack_preview.html. */

const FRONT_BODY =
  'M 85 85 L 60 105 L 35 170 L 60 180 L 75 155 L 75 355 L 245 355 L 245 155 L 260 180 L 285 170 L 260 105 L 235 85 L 200 65 L 190 68 Q 160 92 130 68 L 120 65 Z';
const BACK_BODY =
  'M 85 85 L 60 105 L 35 170 L 60 180 L 75 155 L 75 355 L 245 355 L 245 155 L 260 180 L 285 170 L 260 105 L 235 85 L 200 65 Q 160 45 120 65 Z';
const SIDE_BODY =
  'M 140 85 L 100 105 L 80 170 L 100 180 L 115 155 L 115 355 L 220 355 L 220 155 L 235 180 L 255 170 L 235 105 L 195 85 L 175 80 L 165 85 Z';

function FrontFlat({ callouts, placements }: { callouts: boolean; placements: Array<{ ref: string; w: number; h: number }> }) {
  return (
    <svg className="tp-garment" viewBox="0 0 320 400" role="img" aria-label="Front flat">
      <path d={FRONT_BODY} fill="#fff" stroke="#1a1c1e" strokeWidth="1.2" />
      <path d="M 120 65 Q 160 92 200 65" fill="none" stroke="#1a1c1e" strokeWidth="1" />
      <path d="M 122 72 Q 160 98 198 72" fill="none" stroke="#1a1c1e" strokeWidth="0.8" />
      <line x1="85" y1="85" x2="120" y2="65" stroke="#1a1c1e" strokeWidth="0.8" />
      <line x1="235" y1="85" x2="200" y2="65" stroke="#1a1c1e" strokeWidth="0.8" />
      <line x1="35" y1="165" x2="62" y2="176" stroke="#1a1c1e" strokeWidth="0.8" />
      <line x1="285" y1="165" x2="258" y2="176" stroke="#1a1c1e" strokeWidth="0.8" />
      <line x1="75" y1="155" x2="75" y2="355" stroke="#1a1c1e" strokeWidth="0.8" />
      <line x1="245" y1="155" x2="245" y2="355" stroke="#1a1c1e" strokeWidth="0.8" />
      <line x1="75" y1="345" x2="245" y2="345" stroke="#1a1c1e" strokeWidth="0.8" />
      {placements.map((p) => {
        const w = Math.min(p.w * 0.5, 200);
        const h = Math.min(p.h * 0.5, 150);
        return (
          <g key={p.ref}>
            <rect x={160 - w / 2} y={170 - h / 2} width={w} height={h} fill="none" stroke="#0077c5" strokeWidth="1" strokeDasharray="5 3" />
            <text x="160" y={170 - 4} textAnchor="middle" className="tp-tiny">{p.ref}</text>
            <text x="160" y={170 + 12} textAnchor="middle" className="tp-tiny">
              {p.w}×{p.h}mm
            </text>
          </g>
        );
      })}
      {callouts && (
        <g>
          <line x1="60" y1="195" x2="260" y2="195" stroke="#0a6400" strokeWidth="1" />
          <circle cx="75" cy="195" r="2.5" fill="#0a6400" />
          <circle cx="245" cy="195" r="2.5" fill="#0a6400" />
          <text x="160" y="188" textAnchor="middle" className="tp-label">A</text>
          <line x1="305" y1="85" x2="305" y2="355" stroke="#0a6400" strokeWidth="1" />
          <circle cx="305" cy="85" r="2.5" fill="#0a6400" />
          <circle cx="305" cy="355" r="2.5" fill="#0a6400" />
          <text x="313" y="222" className="tp-label">B</text>
          <text x="160" y="52" textAnchor="middle" className="tp-label">C</text>
          <line x1="120" y1="65" x2="200" y2="65" stroke="#0a6400" strokeWidth="1" />
          <line x1="35" y1="170" x2="75" y2="155" stroke="#0a6400" strokeWidth="1" />
          <text x="50" y="145" className="tp-label">D</text>
          <text x="160" y="108" textAnchor="middle" className="tp-label">E</text>
          <line x1="75" y1="367" x2="245" y2="367" stroke="#0a6400" strokeWidth="1" />
          <circle cx="75" cy="367" r="2.5" fill="#0a6400" />
          <circle cx="245" cy="367" r="2.5" fill="#0a6400" />
          <text x="160" y="382" textAnchor="middle" className="tp-label">F</text>
        </g>
      )}
    </svg>
  );
}

function BackFlat({ placements }: { placements: Array<{ ref: string; w: number; h: number }> }) {
  return (
    <svg className="tp-garment" viewBox="0 0 320 400" role="img" aria-label="Back flat">
      <path d={BACK_BODY} fill="#fff" stroke="#1a1c1e" strokeWidth="1.2" />
      <path d="M 120 65 Q 160 48 200 65" fill="none" stroke="#1a1c1e" strokeWidth="1" />
      <line x1="75" y1="345" x2="245" y2="345" stroke="#1a1c1e" strokeWidth="0.8" />
      <line x1="75" y1="155" x2="75" y2="355" stroke="#1a1c1e" strokeWidth="0.8" />
      <line x1="245" y1="155" x2="245" y2="355" stroke="#1a1c1e" strokeWidth="0.8" />
      {placements.map((p) => {
        const w = Math.min(p.w * 0.5, 200);
        const h = Math.min(p.h * 0.5, 150);
        return (
          <g key={p.ref}>
            <rect x={160 - w / 2} y={160 - h / 2} width={w} height={h} fill="none" stroke="#0077c5" strokeWidth="1" strokeDasharray="5 3" />
            <text x="160" y={160 - 4} textAnchor="middle" className="tp-tiny">{p.ref}</text>
            <text x="160" y={160 + 12} textAnchor="middle" className="tp-tiny">
              {p.w}×{p.h}mm
            </text>
          </g>
        );
      })}
    </svg>
  );
}

function SideFlat() {
  return (
    <svg className="tp-garment" viewBox="0 0 320 400" role="img" aria-label="Side flat">
      <path d={SIDE_BODY} fill="#fff" stroke="#1a1c1e" strokeWidth="1.2" />
      <line x1="115" y1="345" x2="220" y2="345" stroke="#1a1c1e" strokeWidth="0.8" />
      <path d="M 115 155 Q 135 165 135 205" fill="none" stroke="#1a1c1e" strokeWidth="0.8" />
    </svg>
  );
}

const money = (n: number) => `$${n.toFixed(2)}`;
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }) : '—';

const STITCH_FAMILY = (stitch: string | null) => {
  const s = (stitch ?? '').toLowerCase();
  if (s.includes('coverstitch') || s.includes('406')) return 'Coverstitch';
  if (s.includes('lockstitch') || s.includes('301')) return 'Lockstitch';
  if (s.includes('overlock') || s.includes('504') || s.includes('607')) return 'Overlock';
  return stitch ?? '—';
};

const PAGES = [
  { id: 'cover', label: 'Cover' },
  { id: 'views', label: 'Views' },
  { id: 'spec', label: 'Spec sheet' },
  { id: 'bom', label: 'BOM' },
  { id: 'construction', label: 'Construction' },
  { id: 'revisions', label: 'Revisions' },
] as const;

type DownstreamRfq = { id: string; rfq_number: string; title: string; status: string; created_at: string; bids: number };

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export default function TechPackPreviewScreen({
  onNavigate,
  onToast,
}: {
  onNavigate: (domain: DomainKey, screenId: string) => void;
  onToast: (message: string) => void;
}) {
  const { techPackId, openTechPack, closeTechPack } = useDesignCanvas();
  const [snap, setSnap] = useState<TechPackSnapshot | null>(null);
  const [pomLibrary, setPomLibrary] = useState<PomLibraryRow[]>([]);
  const [materials, setMaterials] = useState<Record<string, { code: string; name: string; weight_gsm: number | null }>>({});
  const [ledger, setLedger] = useState<BomLedger | null>(null);
  const [downstream, setDownstream] = useState<DownstreamRfq[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pageNum, setPageNum] = useState(1);
  const [snapshotOpen, setSnapshotOpen] = useState(false);
  const [transitionOpen, setTransitionOpen] = useState(false);
  const [transitioning, setTransitioning] = useState(false);
  const [pdfMenuOpen, setPdfMenuOpen] = useState(false);
  const [supplierMode, setSupplierMode] = useState(false);
  const [capturing, setCapturing] = useState(false);
  const [pdfState, setPdfState] = useState<{ running: boolean; label: string }>({ running: false, label: '' });
  const [checksum, setChecksum] = useState('');
  const docRef = useRef<HTMLDivElement>(null);

  const load = async () => {
    if (!techPackId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [snapRes, pomRes, matRes, rfqRes, ledgerRes] = await Promise.all([
        fetch(`/api/v1/tech-packs/${techPackId}`),
        fetch('/api/v1/pom-library'),
        fetch('/api/v1/materials'),
        fetch(`/api/v1/rfqs?techPackId=${techPackId}`),
        fetch(`/api/v1/tech-packs/${techPackId}/bom-ledger`),
      ]);
      if (!snapRes.ok) throw new Error(`Tech pack load failed (${snapRes.status}).`);
      const s = (await snapRes.json()) as TechPackSnapshot;
      setSnap(s);
      if (ledgerRes.ok) setLedger((await ledgerRes.json()) as BomLedger);
      if (pomRes.ok) setPomLibrary(((await pomRes.json()).items ?? []) as PomLibraryRow[]);
      if (matRes.ok) {
        const map: Record<string, { code: string; name: string; weight_gsm: number | null }> = {};
        for (const m of (await matRes.json()).items ?? []) map[m.id] = m;
        setMaterials(map);
      }
      if (rfqRes.ok) {
        const rfqs = ((await rfqRes.json()).items ?? []) as Array<{ id: string; rfq_number: string; title: string; status: string; created_at: string }>;
        const withBids = await Promise.all(
          rfqs.map(async (r) => {
            let bids = 0;
            try {
              const b = await fetch(`/api/v1/rfqs/${r.id}`);
              if (b.ok) {
                const board = await b.json();
                bids = (board.bids ?? []).length;
              }
            } catch {
              bids = 0;
            }
            return { ...r, bids };
          }),
        );
        setDownstream(withBids);
      }
      setChecksum(await sha256Hex(JSON.stringify({ tp: s.tech_pack, bom: s.bom, measurements: s.measurements, construction: s.construction, artwork: s.artwork })));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load the tech pack.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [techPackId]);

  // Page counter follows the sheet in view, like the HTML's scroll handler.
  useEffect(() => {
    const onScroll = () => {
      const ids = PAGES.map((p) => p.id);
      let current = 0;
      ids.forEach((id, i) => {
        const el = document.getElementById(`tp-${id}`);
        if (el && el.getBoundingClientRect().top < 200) current = i;
      });
      setPageNum(current + 1);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const gotoPage = (id: string) => {
    document.getElementById(`tp-${id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const tp = snap?.tech_pack ?? null;
  const sizes = useMemo(() => {
    if (snap?.size_range?.sizes?.length) return snap.size_range.sizes;
    const order = ['XS', 'S', 'M', 'L', 'XL', '2XL', '3XL', '4XL'];
    const seen = [...new Set((snap?.measurements ?? []).map((m) => m.size))];
    return seen.sort((a, b) => (order.indexOf(a) === -1 ? 99 : order.indexOf(a)) - (order.indexOf(b) === -1 ? 99 : order.indexOf(b)));
  }, [snap]);
  const baseSize = snap?.size_range?.base_size ?? tp?.base_size ?? 'M';
  const bomTotal = useMemo(
    () => (snap?.bom ?? []).reduce((s, b) => s + Number(b.quantity ?? 0) * Number(b.unit_cost ?? 0), 0),
    [snap],
  );
  const pomByCode = useMemo(() => {
    const map = new Map<string, PomLibraryRow>();
    pomLibrary.forEach((p) => map.set(p.code, p));
    return map;
  }, [pomLibrary]);
  const pomRows = useMemo(() => {
    const byPom = new Map<string, { name: string | null; cells: Record<string, TechPackSnapshot['measurements'][number]> }>();
    (snap?.measurements ?? []).forEach((m) => {
      const key = m.pom ?? '?';
      if (!byPom.has(key)) byPom.set(key, { name: m.name, cells: {} });
      byPom.get(key)!.cells[m.size] = m;
    });
    return [...byPom.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [snap]);
  const shellLine = (snap?.bom ?? []).find((b) => (b.kind ?? '').toLowerCase() === 'fabric');
  const shellMat = shellLine?.material_id ? materials[shellLine.material_id] : undefined;
  const constructionFamilies = useMemo(() => {
    const fams: string[] = [];
    (snap?.construction ?? []).forEach((c) => {
      const f = STITCH_FAMILY(c.stitch_type);
      if (f !== '—' && !fams.includes(f)) fams.push(f);
    });
    return fams.join(' + ');
  }, [snap]);
  const artworkByView = useMemo(() => {
    const map: Record<string, TechPackSnapshot['artwork']> = { front: [], back: [], side: [] };
    (snap?.artwork ?? []).forEach((a) => {
      const v = (a.view ?? 'front').toLowerCase();
      if (!map[v]) map[v] = [];
      map[v].push(a);
    });
    return map;
  }, [snap]);
  const placements = (view: string) =>
    (artworkByView[view] ?? []).map((a, i) => ({
      ref: String.fromCharCode(65 + i),
      w: Number(a.width_mm ?? 0),
      h: Number(a.height_mm ?? 0),
    }));

  const doTransition = async (to: string) => {
    if (!tp) return;
    setTransitioning(true);
    setTransitionOpen(false);
    try {
      const { error: rpcError } = await supabaseBrowser.rpc('ds_transition_tech_pack', {
        p_tp: tp.id,
        p_to: to,
      });
      if (rpcError) throw new Error(rpcError.message);
      onToast(`Tech pack moved to ${techPackStatusLabel(to)}.`);
      await load();
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Transition failed.');
    } finally {
      setTransitioning(false);
    }
  };

  // Renders the six sheets to a PDF and stores it. The supplier copy is a
  // derivative of the internal master (the DB requires the chain), so when
  // the pack has no internal PDF yet the master is rendered first.
  const renderAndStore = async (kind: 'internal' | 'supplier', download: boolean) => {
    if (!tp || !snap) return null;
    setSupplierMode(kind === 'supplier');
    setCapturing(true);
    setPdfState({ running: true, label: 'Rendering pages…' });
    try {
      await new Promise((r) => setTimeout(r, 200));
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')]);
      const sheets = Array.from(docRef.current?.querySelectorAll<HTMLElement>('.tp-sheet') ?? []);
      if (sheets.length === 0) throw new Error('No document pages found to render.');
      const pdf = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
      for (let i = 0; i < sheets.length; i++) {
        setPdfState({ running: true, label: `Rendering page ${i + 1} of ${sheets.length}…` });
        const canvas = await html2canvas(sheets[i], { scale: 2, backgroundColor: '#ffffff', useCORS: true });
        const img = canvas.toDataURL('image/jpeg', 0.92);
        const w = 210;
        const h = (canvas.height * w) / canvas.width;
        if (i > 0) pdf.addPage();
        pdf.addImage(img, 'JPEG', 0, 0, w, Math.min(h, 297));
      }
      const blob = pdf.output('blob');
      setPdfState({ running: true, label: 'Storing the PDF…' });
      const form = new FormData();
      form.append('file', blob, `${tp.style_number ?? 'tech-pack'}-rev${tp.revision}-${kind}.pdf`);
      form.append('kind', kind);
      const res = await fetch(`/api/v1/tech-packs/${tp.id}/preview-pdf`, { method: 'POST', body: form });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error?.message ?? `Storing the PDF failed (${res.status}).`);
      }
      const stored = await res.json();
      if (download) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${tp.style_number ?? 'tech-pack'}-rev${tp.revision}-${kind}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      }
      return stored;
    } finally {
      setSupplierMode(false);
      setCapturing(false);
    }
  };

  const exportPdf = async (kind: 'internal' | 'supplier') => {
    if (!tp || !snap) return;
    setPdfMenuOpen(false);
    setPdfState({ running: true, label: 'Rendering pages…' });
    try {
      if (kind === 'supplier' && !tp.pdf_asset_id) {
        setPdfState({ running: true, label: 'Rendering the internal master first…' });
        await renderAndStore('internal', false);
      }
      await renderAndStore(kind, true);
      setPdfState({ running: false, label: '' });
      onToast(
        kind === 'supplier'
          ? 'Supplier preview stored — the RFQ publish gate is satisfied.'
          : 'Internal PDF stored.',
      );
      await load();
    } catch (e) {
      setPdfState({ running: false, label: '' });
      onToast(e instanceof Error ? e.message : 'PDF export failed.');
    }
  };

  if (!techPackId) {
    return (
      <div className="p-8 max-w-2xl">
        <h1 className="text-headline-md font-semibold">No tech pack open</h1>
        <p className="text-body-md text-on-surface-variant mt-2">Open a tech pack from the Tech packs list to preview its document.</p>
        <button className="mt-4 px-4 py-2 rounded bg-primary text-white text-[13px] font-medium" onClick={() => onNavigate('design', 'tech-packs')}>
          Go to Tech packs
        </button>
      </div>
    );
  }
  if (loading) return <div className="p-8 text-body-md text-on-surface-variant">Loading the tech pack document…</div>;
  if (error || !snap || !tp) {
    return (
      <div className="p-8 max-w-2xl">
        <h1 className="text-headline-md font-semibold">Couldn&apos;t load the tech pack</h1>
        <p className="text-body-md text-on-surface-variant mt-2">{error ?? 'Tech pack not found.'}</p>
        <button className="mt-4 px-4 py-2 rounded bg-primary text-white text-[13px] font-medium" onClick={() => onNavigate('design', 'tech-packs')}>
          Back to Tech packs
        </button>
      </div>
    );
  }

  const validTargets = TECH_PACK_ALLOWED_TO[tp.status] ?? [];
  const nextStage = validTargets.find((t) => t !== 'archived');
  const approved = tp.status === 'approved' || tp.status === 'released';
  const released = tp.status === 'released';
  const watermark = `TECH PACK · ${tp.style_number ?? '—'} · REV ${tp.revision}`;
  const styleName = tp.title ?? snap.design?.name ?? 'Untitled style';

  return (
    <div className={capturing ? 'tp-capturing' : ''}>
      <style>{`
        .tp-sheet { background:#fff; border:1px solid #e2e2e5; max-width:920px; margin:0 auto 24px; padding:56px 56px 40px; position:relative; box-shadow:0 1px 3px rgba(0,0,0,.06); }
        .tp-watermark { position:absolute; top:18px; right:24px; font-size:10px; letter-spacing:.14em; color:#9aa39b; font-weight:600; }
        .tp-doc-h1 { font-size:28px; font-weight:700; letter-spacing:-.02em; line-height:1.15; }
        .tp-doc-h2 { font-size:18px; font-weight:700; display:flex; align-items:center; gap:8px; margin-bottom:6px; }
        .tp-doc-h3 { font-size:13px; font-weight:700; margin:24px 0 10px; }
        .tp-doc-meta { font-size:11px; letter-spacing:.12em; text-transform:uppercase; color:#6f7a69; font-weight:600; }
        .tp-doc-label { font-size:11px; color:#6f7a69; font-weight:600; }
        .tp-doc-value { font-size:13px; font-weight:600; }
        .tp-doc-body { font-size:13px; line-height:1.6; color:#1a1c1e; }
        .tp-cover-grid { display:grid; grid-template-columns:340px 1fr; gap:48px; }
        .tp-garment { width:100%; height:auto; }
        .tp-label { font-family:Inter,sans-serif; font-size:11px; font-weight:700; fill:#0a6400; }
        .tp-tiny { font-family:Inter,sans-serif; font-size:8px; fill:#0077c5; font-weight:600; }
        .tp-spec-row { display:flex; justify-content:space-between; gap:16px; padding:7px 0; border-bottom:1px solid #f0f0f2; }
        .tp-table { width:100%; border-collapse:collapse; font-size:12px; }
        .tp-table th { background:#1a1c1e; color:#fff; text-align:left; padding:8px 10px; font-weight:600; }
        .tp-table td { padding:8px 10px; border-bottom:1px solid #eeeef0; }
        .tp-table td.base, .tp-table th.base { background:#f0fdf4; font-weight:700; }
        .tp-approval { border:1px dashed #c9c9cd; border-radius:4px; padding:16px; min-height:96px; }
        .tp-approval.signed { border:1px solid #0a6400; background:#f0fdf4; }
        .tp-supplier-watermark { position:absolute; inset:0; display:flex; align-items:center; justify-content:center; pointer-events:none; z-index:5; }
        .tp-supplier-watermark span { transform:rotate(-28deg); font-size:52px; font-weight:800; letter-spacing:.08em; color:rgba(10,100,0,.07); white-space:nowrap; }
        .tp-capturing .material-symbols-outlined { display:none !important; }
        @media print {
          .tp-chrome, .tp-toolbar { display:none !important; }
          body { background:#fff !important; }
          .tp-sheet { box-shadow:none; border:none; margin:0; max-width:none; page-break-after:always; }
          .tp-sheet:last-child { page-break-after:auto; }
        }
      `}</style>

      {/* Chrome */}
      <div className="tp-chrome sticky top-0 z-[70] bg-surface border-b border-surface-dim">
        <div className="flex items-center gap-3 px-5 py-3">
          <button className="text-[13px] font-medium text-on-surface-variant hover:text-on-surface" onClick={() => { openTechPack(tp.id); onNavigate('design', 'tech-pack-editor'); }}>
            ← Back to editor
          </button>
          <span className="text-on-surface-variant">/</span>
          <span className="text-[13px] font-semibold">{tp.style_number ?? 'Tech pack'} · Rev {tp.revision}</span>
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${approved ? 'bg-[#8af5be] text-[#00714b]' : tp.status === 'in_review' ? 'bg-[#e8f0fb] text-[#0055a5]' : 'bg-[#fff4dc] text-[#8a5a00]'}`}>
            {techPackStatusLabel(tp.status)}
          </span>
          <span className="ml-auto text-[12px] text-on-surface-variant">Page {pageNum} of 6</span>
          <button className="px-3 py-1.5 rounded border border-surface-dim text-[13px] font-medium" onClick={() => window.print()}>
            Print
          </button>
          <div className="relative">
            <button
              className="px-3 py-1.5 rounded border border-surface-dim text-[13px] font-medium disabled:opacity-50"
              disabled={pdfState.running}
              onClick={() => setPdfMenuOpen((v) => !v)}
            >
              {pdfState.running ? pdfState.label : 'Export PDF ▾'}
            </button>
            {pdfMenuOpen && (
              <div className="absolute right-0 mt-1 w-72 bg-white border border-surface-dim rounded shadow-lg z-[72] py-1 text-[13px]">
                <button className="block w-full text-left px-3 py-2 hover:bg-surface-container-low" onClick={() => exportPdf('internal')}>
                  <span className="font-medium">Internal PDF</span>
                  <span className="block text-[12px] text-on-surface-variant">Full document with costs — stored as the internal copy.</span>
                </button>
                <button className="block w-full text-left px-3 py-2 hover:bg-surface-container-low" onClick={() => exportPdf('supplier')}>
                  <span className="font-medium">Supplier preview</span>
                  <span className="block text-[12px] text-on-surface-variant">Watermarked, costs withheld — sets the publish gate for RFQs.</span>
                </button>
              </div>
            )}
          </div>
          <button className="px-3 py-1.5 rounded border border-surface-dim text-[13px] font-medium" onClick={() => setSnapshotOpen(true)}>
            Snapshot
          </button>
          <div className="relative">
            <button
              className="px-3 py-1.5 rounded bg-primary text-white text-[13px] font-medium disabled:opacity-50"
              disabled={transitioning || !nextStage}
              onClick={() => setTransitionOpen((v) => !v)}
            >
              {transitioning ? 'Moving…' : nextStage ? TECH_PACK_TRANSITION_LABEL[nextStage] : techPackStatusLabel(tp.status)}
            </button>
            {transitionOpen && (
              <div className="absolute right-0 mt-1 w-64 bg-white border border-surface-dim rounded shadow-lg z-[72] py-1 text-[13px]">
                {['in_review', 'approved', 'released', 'draft', 'archived'].map((to) => {
                  const allowed = validTargets.includes(to);
                  return (
                    <button
                      key={to}
                      className="block w-full text-left px-3 py-2 hover:bg-surface-container-low disabled:opacity-40 disabled:cursor-not-allowed"
                      disabled={!allowed || transitioning}
                      title={allowed ? undefined : `Cannot move from ${techPackStatusLabel(tp.status)} to ${techPackStatusLabel(to)}.`}
                      onClick={() => doTransition(to)}
                    >
                      {TECH_PACK_TRANSITION_LABEL[to]}
                      {!allowed && <span className="text-on-surface-variant"> — not allowed</span>}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
        <div className="tp-toolbar flex items-center gap-1 px-5 pb-2 overflow-x-auto">
          {PAGES.map((p, i) => (
            <button
              key={p.id}
              onClick={() => gotoPage(p.id)}
              className={`px-3 py-1.5 rounded-full text-[12px] font-medium whitespace-nowrap ${pageNum === i + 1 ? 'bg-primary text-white' : 'text-on-surface-variant hover:bg-surface-container-low'}`}
            >
              {p.label}
            </button>
          ))}
          {tp.preview_pdf_asset_id && (
            <span className="ml-2 text-[12px] text-[#00714b] font-medium">✓ Supplier preview stored — RFQs can publish</span>
          )}
        </div>
      </div>

      <div ref={docRef} className="bg-[#f4f3f7] py-8 px-4">
        {/* PAGE 1 — COVER */}
        <div className="tp-sheet" id="tp-cover">
          {supplierMode && <div className="tp-supplier-watermark"><span>SUPPLIER PREVIEW</span></div>}
          <div className="tp-watermark">{watermark}</div>
          <div style={{ marginBottom: 40 }}>
            <div className="tp-doc-meta">{snap.season?.name ?? 'Season'} · {snap.design?.product_type ?? 'Apparel'}</div>
            <h1 className="tp-doc-h1">{styleName}</h1>
            <div className="tp-doc-body" style={{ color: '#6f7a69', fontSize: 14 }}>
              Style {tp.style_number ?? '—'} · Base size {baseSize} · Sizes {sizes.join('–')}
            </div>
          </div>
          <div className="tp-cover-grid">
            <div>
              <FrontFlat callouts placements={placements('front')} />
            </div>
            <div>
              <h3 className="tp-doc-h3" style={{ marginTop: 0 }}>Style specification</h3>
              <div>
                <div className="tp-spec-row"><span className="tp-doc-label">Style number</span><span className="tp-doc-value">{tp.style_number ?? '—'}</span></div>
                <div className="tp-spec-row"><span className="tp-doc-label">Season</span><span className="tp-doc-value">{snap.season?.name ?? '—'}</span></div>
                <div className="tp-spec-row"><span className="tp-doc-label">Base size</span><span className="tp-doc-value">{baseSize}</span></div>
                <div className="tp-spec-row"><span className="tp-doc-label">Size range</span><span className="tp-doc-value">{snap.size_range?.name ?? sizes.join('–')}</span></div>
                <div className="tp-spec-row"><span className="tp-doc-label">Shell fabric</span><span className="tp-doc-value">{shellMat?.name ?? shellLine?.description ?? '—'}</span></div>
                <div className="tp-spec-row"><span className="tp-doc-label">Weight</span><span className="tp-doc-value">{shellMat?.weight_gsm ? `${shellMat.weight_gsm} gsm` : '—'}</span></div>
                <div className="tp-spec-row"><span className="tp-doc-label">Construction</span><span className="tp-doc-value">{constructionFamilies || '—'}</span></div>
                <div className="tp-spec-row"><span className="tp-doc-label">Country of origin</span><span className="tp-doc-value">TBD</span></div>
              </div>
              <h3 className="tp-doc-h3">Colorways</h3>
              {snap.colorways.length === 0 ? (
                <p className="tp-doc-body" style={{ color: '#6f7a69' }}>No colorways yet — add them on the design.</p>
              ) : (
                <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                  {snap.colorways.map((c, i) => (
                    <div key={c.id ?? i} style={{ textAlign: 'center' }}>
                      <div style={{ width: 44, height: 44, background: c.hex ?? '#eee', border: '1px solid #e2e2e5', borderRadius: 2 }} />
                      <div style={{ fontSize: 10, color: '#6f7a69', marginTop: 6, fontWeight: 600 }}>{c.name ?? c.color ?? 'Colorway'}</div>
                      {c.pantone && <div style={{ fontSize: 9, color: '#6f7a69', fontFamily: 'monospace' }}>{c.pantone}</div>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <h3 className="tp-doc-h3">Approval</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
            <div className={`tp-approval ${approved ? 'signed' : ''}`}>
              <div className="tp-doc-label">Designer</div>
              <div className="tp-doc-body" style={{ marginTop: 8 }}>{approved ? 'Approved' : 'Pending signature'}</div>
              <div className="tp-doc-body" style={{ color: '#6f7a69', fontSize: 11 }}>{approved ? fmtDate(tp.approved_at) : '—'}</div>
            </div>
            <div className="tp-approval">
              <div className="tp-doc-label">Merchandiser</div>
              <div className="tp-doc-body" style={{ marginTop: 8 }}>Pending signature</div>
              <div className="tp-doc-body" style={{ color: '#6f7a69', fontSize: 11 }}>—</div>
            </div>
            <div className={`tp-approval ${released ? 'signed' : ''}`}>
              <div className="tp-doc-label">Production</div>
              <div className="tp-doc-body" style={{ marginTop: 8 }}>{released ? 'Released to suppliers' : 'Pending signature'}</div>
              <div className="tp-doc-body" style={{ color: '#6f7a69', fontSize: 11 }}>{released ? fmtDate(tp.released_at) : '—'}</div>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 40, paddingTop: 12, borderTop: '1px solid #eeeef0', fontSize: 11, color: '#6f7a69' }}>
            <span>{tp.style_number ?? '—'}</span>
            <span>Generated from design {snap.design?.name ?? '—'} · {fmtDate(tp.created_at)}</span>
            <span>Page 1 of 6</span>
          </div>
        </div>

        {/* PAGE 2 — VIEWS */}
        <div className="tp-sheet" id="tp-views">
          {supplierMode && <div className="tp-supplier-watermark"><span>SUPPLIER PREVIEW</span></div>}
          <div className="tp-watermark">{watermark}</div>
          <h2 className="tp-doc-h2"><span className="material-symbols-outlined" style={{ fontSize: 16 }}>visibility</span>Garment views</h2>
          <div className="tp-doc-body" style={{ color: '#6f7a69', marginBottom: 24 }}>
            Three orthographic views. Lettered callouts on the front view reference the Spec sheet (page 3). Print placement zones shown in blue dashed lines.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }}>
            <div><FrontFlat callouts={false} placements={placements('front')} /><div style={{ textAlign: 'center', fontSize: 12, fontWeight: 600, marginTop: 8 }}>Front</div></div>
            <div><BackFlat placements={placements('back')} /><div style={{ textAlign: 'center', fontSize: 12, fontWeight: 600, marginTop: 8 }}>Back</div></div>
            <div><SideFlat /><div style={{ textAlign: 'center', fontSize: 12, fontWeight: 600, marginTop: 8 }}>Side</div></div>
          </div>
          <h3 className="tp-doc-h3">Print placements</h3>
          {snap.artwork.length === 0 ? (
            <p className="tp-doc-body" style={{ color: '#6f7a69' }}>No artwork placements yet — add them in the editor.</p>
          ) : (
            <table className="tp-table">
              <thead>
                <tr><th>Ref</th><th>View</th><th>Placement</th><th>Technique</th><th>Width</th><th>Height</th><th>Offset X</th><th>Offset Y</th><th>Colorway</th></tr>
              </thead>
              <tbody>
                {snap.artwork.map((a, i) => (
                  <tr key={a.id}>
                    <td>{String.fromCharCode(65 + i)}</td>
                    <td style={{ textAlign: 'left' }}>{a.view ?? '—'}</td>
                    <td style={{ textAlign: 'left' }}>{a.placement ?? '—'}</td>
                    <td>{a.technique ?? '—'}</td>
                    <td>{a.width_mm != null ? `${a.width_mm} mm` : '—'}</td>
                    <td>{a.height_mm != null ? `${a.height_mm} mm` : '—'}</td>
                    <td>{a.offset_x_mm ?? 0}</td>
                    <td>{a.offset_y_mm ?? 0}</td>
                    <td>{a.pantone_codes?.length ? a.pantone_codes.join(', ') : 'All'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 40, paddingTop: 12, borderTop: '1px solid #eeeef0', fontSize: 11, color: '#6f7a69' }}>
            <span>{tp.style_number ?? '—'}</span><span>Garment views</span><span>Page 2 of 6</span>
          </div>
        </div>

        {/* PAGE 3 — SPEC */}
        <div className="tp-sheet" id="tp-spec">
          {supplierMode && <div className="tp-supplier-watermark"><span>SUPPLIER PREVIEW</span></div>}
          <div className="tp-watermark">{watermark}</div>
          <h2 className="tp-doc-h2"><span className="material-symbols-outlined" style={{ fontSize: 16 }}>straighten</span>Specification — points of measure</h2>
          <div className="tp-doc-body" style={{ color: '#6f7a69', marginBottom: 24 }}>
            All measurements in {snap.size_range?.unit ?? 'cm'}. Base size {baseSize} highlighted. Tolerance ± unless noted.
          </div>
          {pomRows.length === 0 ? (
            <p className="tp-doc-body" style={{ color: '#6f7a69' }}>No measurements yet — add them in the editor.</p>
          ) : (
            <table className="tp-table">
              <thead>
                <tr>
                  <th>POM</th><th>Point of measure</th>
                  {sizes.map((s) => (
                    <th key={s} className={s === baseSize ? 'base' : ''} style={{ textAlign: 'right' }}>{s}{s === baseSize ? ' ★' : ''}</th>
                  ))}
                  <th style={{ textAlign: 'right' }}>Tol ±</th>
                </tr>
              </thead>
              <tbody>
                {pomRows.map(([code, row]) => {
                  const lib = pomByCode.get(code);
                  const tol = row.cells[sizes[0]]?.tol_plus ?? lib?.default_tol_plus ?? null;
                  return (
                    <tr key={code}>
                      <td><strong>{code}</strong></td>
                      <td style={{ textAlign: 'left' }}>{row.name ?? lib?.name ?? '—'}</td>
                      {sizes.map((s) => (
                        <td key={s} className={s === baseSize ? 'base' : ''} style={{ textAlign: 'right' }}>
                          {row.cells[s]?.value ?? '—'}
                        </td>
                      ))}
                      <td style={{ textAlign: 'right' }}>{tol != null ? `±${tol}` : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <h3 className="tp-doc-h3">How to measure</h3>
          {pomRows.map(([code, row]) => {
            const lib = pomByCode.get(code);
            if (!lib?.how_to_measure) return null;
            return (
              <div key={code} style={{ display: 'flex', gap: 12, padding: '6px 0', borderBottom: '1px solid #f0f0f2' }}>
                <span style={{ fontWeight: 700, fontSize: 12, minWidth: 24 }}>{code}</span>
                <span className="tp-doc-body" style={{ fontSize: 12 }}>{lib.how_to_measure}</span>
              </div>
            );
          })}
          {tp.notes && (
            <>
              <h3 className="tp-doc-h3">Fit notes</h3>
              <p className="tp-doc-body">{tp.notes}</p>
            </>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 40, paddingTop: 12, borderTop: '1px solid #eeeef0', fontSize: 11, color: '#6f7a69' }}>
            <span>{tp.style_number ?? '—'}</span><span>Spec sheet</span><span>Page 3 of 6</span>
          </div>
        </div>

        {/* PAGE 4 — BOM */}
        <div className="tp-sheet" id="tp-bom">
          {supplierMode && <div className="tp-supplier-watermark"><span>SUPPLIER PREVIEW</span></div>}
          <div className="tp-watermark">{watermark}</div>
          <h2 className="tp-doc-h2"><span className="material-symbols-outlined" style={{ fontSize: 16 }}>list_alt</span>Bill of materials</h2>
          <div className="tp-doc-body" style={{ color: '#6f7a69', marginBottom: 24 }}>
            Cost per unit, base size {baseSize}. {supplierMode ? 'Unit costs withheld on the supplier copy.' : 'Supplier copy strips unit costs and is watermarked.'}
          </div>
          {snap.bom.length === 0 ? (
            <p className="tp-doc-body" style={{ color: '#6f7a69' }}>No BOM lines yet — add them in the editor.</p>
          ) : (
            <>
              <table className="tp-table">
                <thead>
                  <tr>
                    <th>#</th><th>Item</th><th>Kind</th><th>Consumption</th>
                    {!supplierMode && <th style={{ textAlign: 'right' }}>Unit cost</th>}
                    {!supplierMode && <th style={{ textAlign: 'right' }}>Extended</th>}
                  </tr>
                </thead>
                <tbody>
                  {snap.bom.map((b, i) => {
                    const mat = b.material_id ? materials[b.material_id] : undefined;
                    return (
                      <tr key={b.id}>
                        <td>{i + 1}</td>
                        <td style={{ textAlign: 'left' }}>
                          <div style={{ fontWeight: 600 }}>{mat?.name ?? b.description ?? '—'}</div>
                          {b.supplier_note && <div style={{ fontSize: 11, color: '#6f7a69' }}>{b.supplier_note}</div>}
                        </td>
                        <td>{b.kind ?? '—'}</td>
                        <td>{b.quantity != null ? `${b.quantity} ${b.uom ?? ''}`.trim() : '—'}</td>
                        {!supplierMode && <td style={{ textAlign: 'right' }}>{b.unit_cost != null ? money(Number(b.unit_cost)) : '—'}</td>}
                        {!supplierMode && <td style={{ textAlign: 'right' }}>{b.unit_cost != null ? money(Number(b.quantity ?? 0) * Number(b.unit_cost)) : '—'}</td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {!supplierMode && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2, marginTop: 12, fontSize: 14 }}>
                  <span style={{ fontWeight: 700 }}>Total per unit&nbsp;&nbsp;{money(bomTotal)}</span>
                  {ledger && (
                    <span style={{ fontSize: 11, color: '#6f7a69', fontWeight: 400 }}>
                      Ledger computed {money(ledger.computedTotal)} from POMs · marker {Math.round(ledger.settings.markerEfficiency * 100)}% · waste {Math.round(ledger.settings.wastePct * 100)}% · fabric {ledger.settings.fabricWidthCm} cm
                    </span>
                  )}
                </div>
              )}
            </>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 40, paddingTop: 12, borderTop: '1px solid #eeeef0', fontSize: 11, color: '#6f7a69' }}>
            <span>{tp.style_number ?? '—'}</span><span>Bill of materials</span><span>Page 4 of 6</span>
          </div>
        </div>

        {/* PAGE 5 — CONSTRUCTION */}
        <div className="tp-sheet" id="tp-construction">
          {supplierMode && <div className="tp-supplier-watermark"><span>SUPPLIER PREVIEW</span></div>}
          <div className="tp-watermark">{watermark}</div>
          <h2 className="tp-doc-h2"><span className="material-symbols-outlined" style={{ fontSize: 16 }}>construction</span>Construction</h2>
          <div className="tp-doc-body" style={{ color: '#6f7a69', marginBottom: 24 }}>
            Operations in sequence. Stitch, seam allowance, and SPI as specified — deviations need written approval.
          </div>
          {snap.construction.length === 0 ? (
            <p className="tp-doc-body" style={{ color: '#6f7a69' }}>No construction operations yet — add them in the editor.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {snap.construction.map((c, i) => (
                <div key={c.id} style={{ border: '1px solid #eeeef0', borderRadius: 4, padding: 16, position: 'relative' }}>
                  <div style={{ position: 'absolute', top: 12, right: 12, width: 26, height: 26, borderRadius: '50%', background: '#1a1c1e', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700 }}>
                    {i + 1}
                  </div>
                  <div style={{ fontWeight: 700, fontSize: 13, paddingRight: 32 }}>{c.operation ?? c.area ?? `Operation ${i + 1}`}</div>
                  {c.area && c.operation && <div style={{ fontSize: 11, color: '#6f7a69', marginTop: 2 }}>{c.area}</div>}
                  {c.notes && <p className="tp-doc-body" style={{ fontSize: 12, marginTop: 8 }}>{c.notes}</p>}
                  <div style={{ display: 'flex', gap: 16, marginTop: 10, fontSize: 12 }}>
                    <span><span className="tp-doc-label">Stitch </span>{c.stitch_type ?? '—'}</span>
                    <span><span className="tp-doc-label">SA </span>{c.seam_allowance_mm != null ? `${c.seam_allowance_mm} mm` : '—'}</span>
                    <span><span className="tp-doc-label">SPI </span>{c.spi ?? '—'}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 40, paddingTop: 12, borderTop: '1px solid #eeeef0', fontSize: 11, color: '#6f7a69' }}>
            <span>{tp.style_number ?? '—'}</span><span>Construction</span><span>Page 5 of 6</span>
          </div>
        </div>

        {/* PAGE 6 — REVISIONS */}
        <div className="tp-sheet" id="tp-revisions">
          {supplierMode && <div className="tp-supplier-watermark"><span>SUPPLIER PREVIEW</span></div>}
          <div className="tp-watermark">{watermark}</div>
          <h2 className="tp-doc-h2"><span className="material-symbols-outlined" style={{ fontSize: 16 }}>history</span>Revision history</h2>
          <div className="tp-doc-body" style={{ color: '#6f7a69', marginBottom: 24 }}>
            Immutable record of every change. Each transition writes a tech_pack_revisions row — snapshot, timestamp, and reason. Never edited, never deleted.
          </div>
          {snap.revisions.length === 0 ? (
            <p className="tp-doc-body" style={{ color: '#6f7a69' }}>No revisions recorded yet — the first transition writes one.</p>
          ) : (
            <table className="tp-table">
              <thead>
                <tr><th>Rev</th><th>Transition</th><th>Change summary</th><th>Author</th><th>Date</th></tr>
              </thead>
              <tbody>
                {snap.revisions.map((r, i) => (
                  <tr key={r.id}>
                    <td><span style={{ fontWeight: 700, color: i === 0 ? '#0a6400' : 'inherit' }}>Rev {r.revision}</span></td>
                    <td>{r.from_status ? `${techPackStatusLabel(r.from_status)} → ${techPackStatusLabel(r.to_status ?? '')}` : `Created as ${techPackStatusLabel(r.to_status ?? '')}`}</td>
                    <td style={{ textAlign: 'left' }}>{r.change_summary ?? '—'}</td>
                    <td>{r.created_by ? r.created_by.slice(0, 8) : '—'}</td>
                    <td>{fmtDate(r.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <h3 className="tp-doc-h3">Version snapshot</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24 }}>
            <div>
              <div className="tp-doc-label">Current version</div>
              <div className="tp-doc-value">Rev {tp.revision} · {techPackStatusLabel(tp.status)}</div>
              <div className="tp-doc-body" style={{ color: '#6f7a69', marginTop: 4 }}>
                {pomRows.length} POMs · {snap.bom.length} BOM lines · {snap.artwork.length} artwork placements · {snap.colorways.length} colorways
              </div>
            </div>
            <div>
              <div className="tp-doc-label">Computed checksum</div>
              <div style={{ fontFamily: 'monospace', fontSize: 11, color: '#6f7a69', marginTop: 2, wordBreak: 'break-all' }}>
                {checksum ? `sha256:${checksum.slice(0, 12)}…${checksum.slice(-4)}` : 'computing…'}
              </div>
              <div className="tp-doc-body" style={{ color: '#6f7a69', marginTop: 4 }}>Any edit changes this hash — audit trail</div>
            </div>
          </div>
          <h3 className="tp-doc-h3">Downstream records</h3>
          {downstream.length === 0 ? (
            <p className="tp-doc-body" style={{ color: '#6f7a69' }}>No RFQs reference this tech pack yet — create one from the editor.</p>
          ) : (
            <table className="tp-table">
              <thead>
                <tr><th>Kind</th><th>Reference</th><th>Status</th><th>Created</th></tr>
              </thead>
              <tbody>
                {downstream.map((r) => (
                  <tr key={r.id}>
                    <td>RFQ</td>
                    <td style={{ textAlign: 'left', fontFamily: 'monospace', fontSize: 11 }}>
                      <button className="underline" onClick={() => { closeTechPack(); onNavigate('design', 'rfqs'); }}>
                        {r.rfq_number} — {r.title}
                      </button>
                    </td>
                    <td>{techPackStatusLabel(r.status)}{r.bids ? ` · ${r.bids} bid${r.bids === 1 ? '' : 's'}` : ''}</td>
                    <td>{fmtDate(r.created_at)}</td>
                  </tr>
                ))}
                <tr>
                  <td>PO</td>
                  <td style={{ color: '#6f7a69' }}>Not yet created — pending RFQ award</td>
                  <td>—</td>
                  <td>—</td>
                </tr>
              </tbody>
            </table>
          )}
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 40, paddingTop: 12, borderTop: '1px solid #eeeef0', fontSize: 11, color: '#6f7a69' }}>
            <span>{tp.style_number ?? '—'}</span><span>Revision history</span><span>Page 6 of 6</span>
          </div>
        </div>
      </div>

      {snapshotOpen && (
        <TechPackSnapshotDrawer snap={snap} pomCount={pomLibrary.length} onClose={() => setSnapshotOpen(false)} />
      )}
    </div>
  );
}
