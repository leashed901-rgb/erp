'use client';
/**
 * PipelinesScreen — manage sales pipelines and their stages.
 *
 * Backed by:
 *   GET/POST  /api/crm/pipelines
 *   PATCH     /api/crm/pipelines/[id]
 *   GET/POST  /api/crm/pipeline-stages?pipeline_id=
 *   PATCH     /api/crm/pipeline-stages/[id]
 *
 * Lists every pipeline in a left rail; selected pipeline shows its stages
 * in order with inline add. Stage_kind picks open/won/lost to wire the
 * Kanban board's terminal colors on the Deals screen.
 */
import { useEffect, useState } from 'react';
import {
  usePipelines,
  usePipelineStages,
  useCrmMutations,
  type Pipeline,
  type PipelineStage,
} from '@/hooks/useCrmApi';

interface Props {
  onToast: (m: string) => void;
}

const KIND_LABEL: Record<string, string> = { open: 'Open', won: 'Won', lost: 'Lost' };
const KIND_COLOR: Record<string, string> = {
  open: 'bg-primary/10 text-primary',
  won: 'bg-secondary/15 text-secondary',
  lost: 'bg-surface-container-high text-on-surface-variant',
};

export default function PipelinesScreen({ onToast }: Props) {
  const { data: pipelines, loaded, refresh: refetchPipes } = usePipelines();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { data: stages, loaded: stagesLoaded, refresh: refetchStages } = usePipelineStages(selectedId);
  const { createPipeline, updatePipeline, createPipelineStage } = useCrmMutations(onToast);

  const [showCreatePipe, setShowCreatePipe] = useState(false);
  const [newStageName, setNewStageName] = useState('');
  const [newStageKind, setNewStageKind] = useState('open');
  const [newStageProb, setNewStageProb] = useState('0');
  const [addingStage, setAddingStage] = useState(false);

  useEffect(() => {
    if (!selectedId && pipelines.length > 0) setSelectedId(pipelines[0].id);
  }, [selectedId, pipelines]);

  const selected = pipelines.find((p) => p.id === selectedId) || null;

  async function addStage() {
    if (!selectedId || !newStageName.trim()) return;
    setAddingStage(true);
    const nextOrder = stages.length > 0 ? Math.max(...stages.map((s) => s.sort_order)) + 1 : 0;
    const res = await createPipelineStage({
      pipeline_id: selectedId,
      name: newStageName.trim(),
      sort_order: nextOrder,
      probability: Number(newStageProb) || 0,
      stage_kind: newStageKind,
    });
    setAddingStage(false);
    if (res.ok) {
      setNewStageName('');
      setNewStageProb('0');
      setNewStageKind('open');
      refetchStages();
    }
  }

  async function toggleActive(p: Pipeline) {
    const res = await updatePipeline(p.id, { is_active: !p.is_active });
    if (res.ok) refetchPipes();
  }
  async function makeDefault(p: Pipeline) {
    const res = await updatePipeline(p.id, { is_default: true });
    if (res.ok) refetchPipes();
  }

  return (
    <main className="px-6 pb-12 flex flex-col h-full">
      <div className="flex items-start justify-between gap-4 py-4">
        <div>
          <h1 className="text-headline-lg">Pipelines</h1>
          <p className="text-body-sm text-on-surface-variant mt-0.5">
            {loaded ? `${pipelines.length} pipeline${pipelines.length === 1 ? '' : 's'} · ${stagesLoaded ? stages.length : 0} stages in selected` : 'Loading…'}
          </p>
        </div>
        <button className="h-8 px-3 bg-primary text-white text-body-md font-semibold rounded hover:bg-primary-container flex items-center gap-1" onClick={() => setShowCreatePipe(true)}>
          <span className="material-symbols-outlined text-[16px]">add</span>New pipeline
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4 flex-1 min-h-0">
        {/* Pipeline list */}
        <div className="bg-white rounded-xl border border-surface-dim overflow-hidden flex flex-col">
          <div className="px-4 py-2 border-b border-surface-dim bg-surface-container-low text-label-sm font-bold uppercase tracking-wider text-on-surface-variant">Pipelines</div>
          <div className="flex-1 overflow-y-auto">
            {pipelines.map((p) => (
              <button
                key={p.id}
                className={`w-full text-left px-4 py-3 border-b border-surface-dim last:border-0 hover:bg-surface-container-low ${selectedId === p.id ? 'bg-surface-container-low' : ''}`}
                onClick={() => setSelectedId(p.id)}
              >
                <div className="flex items-center gap-2">
                  <span className="font-medium text-body-md">{p.name}</span>
                  {p.is_default && <span className="pill info" style={{ fontSize: 9, padding: '1px 5px' }}>DEFAULT</span>}
                  {!p.is_active && <span className="pill muted" style={{ fontSize: 9, padding: '1px 5px' }}>INACTIVE</span>}
                </div>
                <div className="text-[11px] text-on-surface-variant mt-0.5">{p.currency} · {p.description || 'No description'}</div>
              </button>
            ))}
            {loaded && pipelines.length === 0 && (
              <div className="px-4 py-8 text-center text-on-surface-variant text-body-sm">No pipelines yet.</div>
            )}
          </div>
        </div>

        {/* Stages for the selected pipeline */}
        <div className="bg-white rounded-xl border border-surface-dim overflow-hidden flex flex-col">
          {!selected ? (
            <div className="flex-1 flex items-center justify-center text-on-surface-variant text-body-sm">Select a pipeline to manage its stages.</div>
          ) : (
            <>
              <div className="px-4 py-3 border-b border-surface-dim flex items-center justify-between">
                <div>
                  <div className="text-headline-sm">{selected.name}</div>
                  <div className="text-[11px] text-on-surface-variant">{selected.description || 'No description'} · {selected.currency}</div>
                </div>
                <div className="flex items-center gap-1">
                  <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low" onClick={() => toggleActive(selected)} title={selected.is_active ? 'Deactivate' : 'Activate'}>
                    {selected.is_active ? 'Deactivate' : 'Activate'}
                  </button>
                  {!selected.is_default && (
                    <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low" onClick={() => makeDefault(selected)}>Make default</button>
                  )}
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                <div className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-2">Stages ({stages.length})</div>
                {stages.length === 0 ? (
                  <div className="text-body-sm text-on-surface-variant py-4">No stages yet. Add the first stage below.</div>
                ) : (
                  <ol className="space-y-2">
                    {stages.map((s, i) => (
                      <li key={s.id} className="flex items-center gap-3 p-3 bg-surface-container-low rounded-lg">
                        <span className="text-[11px] text-on-surface-variant font-mono w-6 tabular-nums">{i + 1}.</span>
                        <span className="font-medium flex-1">{s.name}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold ${KIND_COLOR[s.stage_kind || 'open']}`}>{KIND_LABEL[s.stage_kind || 'open']}</span>
                        {s.probability != null && s.probability > 0 && <span className="text-[11px] text-on-surface-variant tabular-nums">{s.probability}%</span>}
                        {s.rotting_days != null && <span className="text-[10px] text-on-surface-variant">rot {s.rotting_days}d</span>}
                      </li>
                    ))}
                  </ol>
                )}

                {/* Add stage */}
                <div className="mt-4 p-3 border border-dashed border-surface-dim rounded-lg">
                  <div className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-2">Add stage</div>
                  <div className="flex items-end gap-2 flex-wrap">
                    <div className="flex-1 min-w-[140px]">
                      <label className="field-label">Name</label>
                      <input className="field-input" value={newStageName} onChange={(e) => setNewStageName(e.target.value)} placeholder="e.g. Proposal" />
                    </div>
                    <div className="w-24">
                      <label className="field-label">Kind</label>
                      <select className="field-input" value={newStageKind} onChange={(e) => setNewStageKind(e.target.value)}>
                        <option value="open">Open</option>
                        <option value="won">Won</option>
                        <option value="lost">Lost</option>
                      </select>
                    </div>
                    <div className="w-20">
                      <label className="field-label">Prob %</label>
                      <input className="field-input" type="number" min={0} max={100} value={newStageProb} onChange={(e) => setNewStageProb(e.target.value)} />
                    </div>
                    <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container disabled:opacity-40 flex items-center gap-1" onClick={addStage} disabled={!newStageName.trim() || addingStage}>
                      {addingStage ? 'Adding…' : 'Add stage'}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Create pipeline modal */}
      {showCreatePipe && (
        <CreatePipelineModal
          onClose={() => setShowCreatePipe(false)}
          onCreated={() => { setShowCreatePipe(false); refetchPipes(); }}
        />
      )}
    </main>
  );
}

function CreatePipelineModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { createPipeline } = useCrmMutations(() => {});
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [currency, setCurrency] = useState('USD');
  const [isDefault, setIsDefault] = useState(false);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!name.trim()) return;
    setSaving(true);
    const res = await createPipeline({ name: name.trim(), description: description.trim() || null, currency, is_default: isDefault });
    setSaving(false);
    if (res.ok) {
      // Seed the default stage set so the board is immediately usable.
      const pipe = (res as { data?: Pipeline }).data;
      if (pipe?.id) {
        const stages = [
          { name: 'New', probability: 10, kind: 'open' },
          { name: 'Qualified', probability: 30, kind: 'open' },
          { name: 'Proposal', probability: 50, kind: 'open' },
          { name: 'Negotiation', probability: 70, kind: 'open' },
          { name: 'Won', probability: 100, kind: 'won' },
          { name: 'Lost', probability: 0, kind: 'lost' },
        ];
        for (let i = 0; i < stages.length; i++) {
          const s = stages[i];
          await fetch('/api/crm/pipeline-stages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pipeline_id: pipe.id, name: s.name, sort_order: i, probability: s.probability, stage_kind: s.kind }),
          });
        }
      }
      onCreated();
    }
  }

  return (
    <div className="modal-scrim open" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-headline-sm mb-1">New pipeline</h3>
        <p className="text-body-sm text-on-surface-variant mb-4">Seeds 6 default stages (New → Qualified → Proposal → Negotiation → Won/Lost).</p>
        <div className="space-y-3">
          <div><label className="field-label">Name *</label><input className="field-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Sales Pipeline" autoFocus /></div>
          <div><label className="field-label">Description</label><input className="field-input" value={description} onChange={(e) => setDescription(e.target.value)} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="field-label">Currency</label><select className="field-input" value={currency} onChange={(e) => setCurrency(e.target.value)}><option>USD</option><option>EUR</option><option>GBP</option><option>CAD</option></select></div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 text-body-sm">
                <input type="checkbox" checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} /> Make default
              </label>
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={onClose}>Cancel</button>
          <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container disabled:opacity-40" onClick={submit} disabled={!name.trim() || saving}>{saving ? 'Creating…' : 'Create pipeline'}</button>
        </div>
      </div>
    </div>
  );
}
