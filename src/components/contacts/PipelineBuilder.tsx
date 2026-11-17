'use client';

/**
 * StageManager — the stage manager for ONE pipeline, used inline in
 * the Deals screen's Stages panel (Kim's design: pipelines + stages
 * live inline in Deals, not on a separate page). Wired to the doc-02
 * APIs: GET/POST /api/crm/pipeline-stages, PATCH/DELETE
 * /api/crm/pipeline-stages/[id]. Add, reorder (up/down), delete —
 * every action hits the API and reloads from it.
 */
import { useCallback, useEffect, useState } from 'react';

interface Stage {
  id: string;
  pipeline_id: string;
  name: string;
  sort_order: number;
  probability: number;
  stage_kind: 'open' | 'won' | 'lost' | string;
}

async function api<T>(url: string, init?: RequestInit): Promise<{ data: T | null; error: string | null }> {
  try {
    const r = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init });
    const j = await r.json();
    if (!r.ok) return { data: null, error: j?.error?.message || `HTTP ${r.status}` };
    return { data: j.data as T, error: null };
  } catch (e: any) {
    return { data: null, error: e.message };
  }
}

const kindBadge = (k: string) =>
  k === 'won'
    ? 'bg-emerald-100 text-emerald-800'
    : k === 'lost'
      ? 'bg-surface-container text-on-surface-variant'
      : 'bg-emerald-50 text-emerald-700 border border-emerald-200';

export default function StageManager({
  pipelineId,
  pipelineName,
  onToast,
  onChanged,
}: {
  pipelineId: string;
  pipelineName?: string;
  onToast: (m: string) => void;
  onChanged?: () => void;
}) {
  const [stages, setStages] = useState<Stage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [stageName, setStageName] = useState('');
  const [stageKind, setStageKind] = useState('open');
  const [stageProb, setStageProb] = useState('0');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!pipelineId) { setStages([]); setLoaded(true); return; }
    const { data } = await api<Stage[]>(`/api/crm/pipeline-stages?pipeline_id=${pipelineId}`);
    setStages(data || []);
    setLoaded(true);
  }, [pipelineId]);

  useEffect(() => { setLoaded(false); void load(); }, [load]);

  async function addStage() {
    if (!stageName.trim()) { onToast('Stage name is required'); return; }
    const prob = Math.max(0, Math.min(100, Number(stageProb) || 0));
    const sort = stages.length ? Math.max(...stages.map(s => s.sort_order)) + 10 : 10;
    setBusy(true);
    const { error } = await api('/api/crm/pipeline-stages', {
      method: 'POST',
      body: JSON.stringify({ pipeline_id: pipelineId, name: stageName.trim(), sort_order: sort, probability: prob, stage_kind: stageKind }),
    });
    setBusy(false);
    if (error) { onToast(`Add stage failed: ${error}`); return; }
    onToast(`Stage "${stageName.trim()}" added`);
    setStageName('');
    setStageProb('0');
    setStageKind('open');
    await load();
    onChanged?.();
  }

  async function moveStage(stage: Stage, dir: -1 | 1) {
    const idx = stages.findIndex(s => s.id === stage.id);
    const swap = stages[idx + dir];
    if (!swap) return;
    await api(`/api/crm/pipeline-stages/${stage.id}`, { method: 'PATCH', body: JSON.stringify({ sort_order: 10000 + idx }) });
    await api(`/api/crm/pipeline-stages/${swap.id}`, { method: 'PATCH', body: JSON.stringify({ sort_order: stage.sort_order }) });
    await api(`/api/crm/pipeline-stages/${stage.id}`, { method: 'PATCH', body: JSON.stringify({ sort_order: swap.sort_order }) });
    await load();
    onChanged?.();
  }

  async function deleteStage(stage: Stage) {
    const { error } = await api(`/api/crm/pipeline-stages/${stage.id}`, { method: 'DELETE' });
    if (error) { onToast(`Delete failed: ${error}`); return; }
    onToast(`Stage "${stage.name}" removed`);
    await load();
    onChanged?.();
  }

  return (
    <div>
      <div className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
        Stages ({stages.length}){pipelineName ? ` — ${pipelineName}` : ''}
      </div>
      <div className="space-y-2 mt-2">
        {!loaded ? (
          <p className="text-body-sm text-on-surface-variant">Loading stages…</p>
        ) : stages.length === 0 ? (
          <p className="text-body-sm text-on-surface-variant">No stages yet — add the first stage below.</p>
        ) : stages.map((s, i) => (
          <div key={s.id} className="flex items-center gap-3 bg-surface-container-low rounded px-3 py-2.5">
            <span className="text-body-sm text-on-surface-variant w-5">{i + 1}.</span>
            <span className="flex-1 text-body-md font-medium">{s.name}</span>
            <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full capitalize ${kindBadge(s.stage_kind)}`}>{s.stage_kind}</span>
            <span className="text-body-sm tabular-nums w-10 text-right">{Number(s.probability)}%</span>
            <button className="w-7 h-7 rounded hover:bg-surface-container flex items-center justify-center disabled:opacity-30" disabled={i === 0} onClick={() => void moveStage(s, -1)} aria-label="Move stage up">
              <span className="material-symbols-outlined text-[16px]">arrow_upward</span>
            </button>
            <button className="w-7 h-7 rounded hover:bg-surface-container flex items-center justify-center disabled:opacity-30" disabled={i === stages.length - 1} onClick={() => void moveStage(s, 1)} aria-label="Move stage down">
              <span className="material-symbols-outlined text-[16px]">arrow_downward</span>
            </button>
            <button className="w-7 h-7 rounded hover:bg-error-container flex items-center justify-center" onClick={() => void deleteStage(s)} aria-label="Delete stage">
              <span className="material-symbols-outlined text-[16px]">delete</span>
            </button>
          </div>
        ))}
      </div>

      <div className="border border-dashed border-outline-variant rounded-lg p-3 mt-4">
        <div className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Add stage</div>
        <div className="flex items-end gap-2 mt-2 flex-wrap">
          <div className="flex-1 min-w-[180px]">
            <label className="text-[11px] uppercase tracking-wider text-on-surface-variant">Name</label>
            <input className="field-input w-full" placeholder="e.g. Proposal" value={stageName} onChange={e => setStageName(e.target.value)} />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider text-on-surface-variant">Kind</label>
            <select className="field-input" value={stageKind} onChange={e => setStageKind(e.target.value)}>
              <option value="open">Open</option>
              <option value="won">Won</option>
              <option value="lost">Lost</option>
            </select>
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider text-on-surface-variant">Prob %</label>
            <input className="field-input" style={{ width: 80 }} type="number" min={0} max={100} value={stageProb} onChange={e => setStageProb(e.target.value)} />
          </div>
          <button className="h-9 px-3 rounded bg-[#1e7d32] text-white text-body-md font-semibold disabled:opacity-50" disabled={busy} onClick={() => void addStage()}>Add stage</button>
        </div>
      </div>
    </div>
  );
}
