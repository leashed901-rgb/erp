'use client';
/**
 * DealsWorkbench — the sales-pipeline surface.
 *
 * Backed by:
 *   GET    /api/crm/pipelines         (list pipelines)
 *   GET    /api/crm/pipeline-stages   (stages, ?pipeline_id=)
 *   GET    /api/crm/deals             (deals, ?pipeline_id=)
 *   POST   /api/crm/deals             (create)
 *   PATCH  /api/crm/deals/[id]        (move stage, edit amount, mark won/lost)
 *   DELETE /api/crm/deals/[id]        (delete)
 *
 * Two views: Kanban board (drag a card between stages → PATCH stage_id),
 * and a list view. Deal drawer holds party picker, value, stage, expected
 * close, probability, notes. Right-click menu moves the deal, creates a
 * follow-up task, adds a note, or marks won/lost.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useDeals,
  usePipelines,
  usePipelineStages,
  useCrmCustomers,
  useCrmMutations,
  type Deal,
  type Pipeline,
  type PipelineStage,
  type CrmCustomer,
} from '@/hooks/useCrmApi';

interface Props {
  onToast: (m: string) => void;
  onNavigate?: (d: string, s: string) => void;
}

function money(n: number, c = 'USD') {
  try {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: c, maximumFractionDigits: 0 }).format(Number.isFinite(n) ? n : 0);
  } catch {
    return `$${(Number.isFinite(n) ? n : 0).toFixed(0)}`;
  }
}
function fmtDate(iso: string | null) {
  return (iso || '').slice(0, 10) || '—';
}
function custName(c: CrmCustomer | null): string {
  if (!c) return '—';
  return c.preferred_name || [c.first_name, c.last_name].filter(Boolean).join(' ') || c.company_name || c.email || 'Customer';
}

export default function DealsWorkbench({ onToast }: Props) {
  const { data: pipelines, loaded: pipesLoaded } = usePipelines();
  const [pipelineId, setPipelineId] = useState<string | null>(null);
  const { data: stages, loaded: stagesLoaded } = usePipelineStages(pipelineId);
  const { data: deals, loaded: dealsLoaded, refresh: refreshDeals } = useDeals(pipelineId ? { pipelineId } : undefined);
  const { data: customers } = useCrmCustomers();
  const { createDeal, updateDeal, deleteDeal, createTask, createNote } = useCrmMutations(onToast);

  const [view, setView] = useState<'board' | 'list'>('board');
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverStage, setDragOverStage] = useState<string | null>(null);
  const [drawerDeal, setDrawerDeal] = useState<Deal | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; deal: Deal } | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Auto-select the first pipeline when they load.
  useEffect(() => {
    if (!pipelineId && pipelines.length > 0) setPipelineId(pipelines[0].id);
  }, [pipelineId, pipelines]);

  // Click-away for the right-click menu.
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setContextMenu(null);
    };
    document.addEventListener('click', h);
    return () => document.removeEventListener('click', h);
  }, []);

  const filteredDeals = useMemo(() => {
    if (!pipelineId) return deals;
    return deals.filter((d) => d.pipeline_id === pipelineId);
  }, [deals, pipelineId]);

  const dealsByStage = (stageId: string) => filteredDeals.filter((d) => d.stage_id === stageId);
  const totalValue = filteredDeals.reduce((s, d) => s + Number(d.amount) || 0, 0);
  const wonValue = filteredDeals.filter((d) => d.status === 'won').reduce((s, d) => s + Number(d.amount) || 0, 0);
  const openCount = filteredDeals.filter((d) => d.status === 'open').length;
  const wonCount = filteredDeals.filter((d) => d.status === 'won').length;
  const avgProb = filteredDeals.length
    ? Math.round(filteredDeals.reduce((s, d) => s + Number(d.probability || 0), 0) / filteredDeals.length)
    : 0;

  async function handleMoveStage(dealId: string, stageId: string) {
    const stage = stages.find((s) => s.id === stageId);
    const updates: Partial<Deal> = { stage_id: stageId };
    // If the stage is a won/lost terminal, flip the deal status too.
    if (stage?.stage_kind === 'won') { updates.status = 'won'; updates.won_at = new Date().toISOString(); }
    else if (stage?.stage_kind === 'lost') { updates.status = 'lost'; updates.lost_at = new Date().toISOString(); }
    else if (stage?.stage_kind === 'open') { updates.status = 'open'; }
    const res = await updateDeal(dealId, updates);
    if (res.ok) refreshDeals();
  }

  async function handleMarkWon(dealId: string) {
    const res = await updateDeal(dealId, { status: 'won', won_at: new Date().toISOString() });
    if (res.ok) refreshDeals();
  }
  async function handleMarkLost(dealId: string, reason?: string) {
    const res = await updateDeal(dealId, { status: 'lost', lost_at: new Date().toISOString(), lost_reason: reason || 'Lost' });
    if (res.ok) refreshDeals();
  }
  async function handleDelete(dealId: string) {
    const res = await deleteDeal(dealId);
    if (res.ok) { refreshDeals(); setDrawerDeal(null); }
  }

  function onDrop(e: React.DragEvent, stageId: string) {
    e.preventDefault();
    setDragOverStage(null);
    if (dragId) {
      handleMoveStage(dragId, stageId);
      setDragId(null);
    }
  }

  function onContextMenu(e: React.MouseEvent, deal: Deal) {
    e.preventDefault();
    setContextMenu({ x: Math.min(e.clientX, window.innerWidth - 240), y: Math.min(e.clientY, window.innerHeight - 320), deal });
  }

  return (
    <main className="px-6 pb-12 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 py-4 flex-wrap">
        <div>
          <h1 className="text-headline-lg">Deals</h1>
          <p className="text-body-sm text-on-surface-variant mt-0.5">
            {dealsLoaded ? `${filteredDeals.length} deals · ${money(totalValue)} pipeline · ${money(wonValue)} won` : 'Loading…'}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <select
            className="h-8 px-3 border border-surface-dim rounded text-body-md bg-white"
            value={pipelineId || ''}
            onChange={(e) => setPipelineId(e.target.value || null)}
            disabled={!pipesLoaded}
            aria-label="Pipeline"
          >
            {pipelines.length === 0 && <option value="">No pipelines</option>}
            {pipelines.map((p) => (
              <option key={p.id} value={p.id}>{p.name}{p.is_default ? ' (default)' : ''}</option>
            ))}
          </select>
          <div className="flex border border-surface-dim rounded overflow-hidden">
            <button className={`h-8 px-3 text-body-md ${view === 'board' ? 'bg-primary text-white' : 'hover:bg-surface-container-low'}`} onClick={() => setView('board')}>Board</button>
            <button className={`h-8 px-3 text-body-md ${view === 'list' ? 'bg-primary text-white' : 'hover:bg-surface-container-low'}`} onClick={() => setView('list')}>List</button>
          </div>
          <button
            className="h-8 px-3 bg-primary text-white text-body-md font-semibold rounded hover:bg-primary-container flex items-center gap-1 disabled:opacity-40"
            onClick={() => setShowCreate(true)}
            disabled={!pipelineId || stages.length === 0}
            title={!pipelineId ? 'Select a pipeline first' : stages.length === 0 ? 'Pipeline has no stages' : 'New deal'}
          >
            <span className="material-symbols-outlined text-[16px]">add</span>New deal
          </button>
        </div>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
        <div className="bg-white rounded-xl border border-surface-dim p-3">
          <div className="text-[10px] text-on-surface-variant uppercase font-bold">Open deals</div>
          <div className="text-headline-sm tabular-nums">{openCount}</div>
          <div className="text-[11px] text-on-surface-variant">{money(totalValue)} value</div>
        </div>
        <div className="bg-white rounded-xl border border-surface-dim p-3">
          <div className="text-[10px] text-on-surface-variant uppercase font-bold">Won</div>
          <div className="text-headline-sm tabular-nums text-secondary">{wonCount}</div>
          <div className="text-[11px] text-on-surface-variant">{money(wonValue)} revenue</div>
        </div>
        <div className="bg-white rounded-xl border border-surface-dim p-3">
          <div className="text-[10px] text-on-surface-variant uppercase font-bold">Avg probability</div>
          <div className="text-headline-sm tabular-nums">{avgProb}%</div>
          <div className="text-[11px] text-on-surface-variant">Weighted across open deals</div>
        </div>
        <div className="bg-white rounded-xl border border-surface-dim p-3">
          <div className="text-[10px] text-on-surface-variant uppercase font-bold">Stages</div>
          <div className="text-headline-sm tabular-nums">{stages.length}</div>
          <div className="text-[11px] text-on-surface-variant">In {pipelines.find(p => p.id === pipelineId)?.name || '—'}</div>
        </div>
      </div>

      {!pipelineId ? (
        <div className="flex items-center justify-center h-64 text-on-surface-variant/60 text-body-sm">
          {pipesLoaded && pipelines.length === 0 ? 'No pipelines yet. Create one in the Pipelines screen.' : 'Select a pipeline to view deals.'}
        </div>
      ) : !stagesLoaded || stages.length === 0 ? (
        <div className="flex items-center justify-center h-64 text-on-surface-variant/60 text-body-sm">
          This pipeline has no stages. Add stages in the Pipelines screen.
        </div>
      ) : view === 'board' ? (
        /* KANBAN BOARD */
        <div className="flex gap-3 overflow-x-auto flex-1 pb-3">
          {stages.map((stage) => {
            const stageDeals = dealsByStage(stage.id);
            const stageValue = stageDeals.reduce((s, d) => s + Number(d.amount) || 0, 0);
            return (
              <div
                key={stage.id}
                className={`w-72 shrink-0 bg-surface-container-low rounded-lg flex flex-col transition-colors ${dragOverStage === stage.id ? 'ring-2 ring-primary' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setDragOverStage(stage.id); }}
                onDragLeave={() => setDragOverStage((s) => (s === stage.id ? null : s))}
                onDrop={(e) => onDrop(e, stage.id)}
              >
                <div className="px-3 py-2 border-b border-surface-dim flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${stage.stage_kind === 'won' ? 'bg-secondary' : stage.stage_kind === 'lost' ? 'bg-surface-dim' : 'bg-primary'}`} />
                    <span className="text-label-md font-semibold">{stage.name}</span>
                    {stage.probability != null && stage.probability > 0 && (
                      <span className="text-[10px] text-on-surface-variant">{stage.probability}%</span>
                    )}
                  </div>
                  <span className="text-label-sm text-on-surface-variant">{stageDeals.length}</span>
                </div>
                <div className="px-3 py-1 text-[10px] text-on-surface-variant border-b border-surface-dim">{money(stageValue)}</div>
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {stageDeals.map((deal) => {
                    const c = customers.find((x) => x.id === deal.customer_id) || null;
                    return (
                      <div
                        key={deal.id}
                        draggable
                        onDragStart={() => setDragId(deal.id)}
                        onDragEnd={() => { setDragId(null); setDragOverStage(null); }}
                        onContextMenu={(e) => onContextMenu(e, deal)}
                        onClick={() => setDrawerDeal(deal)}
                        className="bg-white rounded border border-surface-dim p-2 cursor-pointer hover:shadow-sm text-body-sm"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="font-medium text-[12px] truncate flex-1">{deal.name}</div>
                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold ${deal.status === 'won' ? 'bg-secondary/15 text-secondary' : deal.status === 'lost' ? 'bg-surface-container-high text-on-surface-variant' : 'bg-primary/10 text-primary'}`}>{deal.status.toUpperCase()}</span>
                        </div>
                        <div className="flex items-center justify-between mt-1">
                          <span className="text-[11px] text-on-surface-variant truncate">{custName(c)}</span>
                          <span className="text-[11px] font-semibold tabular-nums">{money(deal.amount, deal.currency)}</span>
                        </div>
                        {deal.probability > 0 && (
                          <div className="mt-1 h-1 bg-surface-container-high rounded-full overflow-hidden">
                            <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(100, deal.probability)}%` }} />
                          </div>
                        )}
                        {deal.expected_close_date && (
                          <div className="text-[10px] text-on-surface-variant mt-1 flex items-center gap-1">
                            <span className="material-symbols-outlined text-[10px]">event</span>{fmtDate(deal.expected_close_date)}
                          </div>
                        )}
                      </div>
                    );
                  })}
                  {stageDeals.length === 0 && (
                    <div className="text-center text-[11px] text-on-surface-variant py-4">Drop deals here</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* LIST VIEW */
        <div className="bg-white rounded-xl border border-surface-dim overflow-hidden flex-1">
          <table className="w-full text-left text-body-sm">
            <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider">
              <tr>
                <th className="px-3 py-2">Deal</th>
                <th className="px-3 py-2">Customer</th>
                <th className="px-3 py-2">Stage</th>
                <th className="px-3 py-2 text-right">Amount</th>
                <th className="px-3 py-2">Close</th>
                <th className="px-3 py-2">Status</th>
                <th className="w-8 px-2 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-dim">
              {filteredDeals.map((deal) => {
                const c = customers.find((x) => x.id === deal.customer_id) || null;
                const stage = stages.find((s) => s.id === deal.stage_id);
                return (
                  <tr
                    key={deal.id}
                    className="hover:bg-surface-container-low cursor-pointer"
                    onClick={() => setDrawerDeal(deal)}
                    onContextMenu={(e) => onContextMenu(e, deal)}
                  >
                    <td className="px-3 py-2">
                      <div className="font-medium">{deal.name}</div>
                      <div className="text-[11px] text-on-surface-variant">{deal.deal_number}</div>
                    </td>
                    <td className="px-3 py-2">{custName(c)}</td>
                    <td className="px-3 py-2">{stage?.name || '—'}</td>
                    <td className="px-3 py-2 text-right tabular-nums font-medium">{money(deal.amount, deal.currency)}</td>
                    <td className="px-3 py-2 text-[11px]">{fmtDate(deal.expected_close_date)}</td>
                    <td className="px-3 py-2">
                      <span className={`pill ${deal.status === 'won' ? 'success' : deal.status === 'lost' ? 'muted' : 'info'}`}>{deal.status}</span>
                    </td>
                    <td className="px-2 py-2">
                      <button className="text-on-surface-variant hover:text-error" onClick={(e) => { e.stopPropagation(); handleDelete(deal.id); }}>
                        <span className="material-symbols-outlined text-[16px]">delete</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filteredDeals.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-12 text-center text-on-surface-variant">No deals in this pipeline yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* RIGHT-CLICK CONTEXT MENU */}
      {contextMenu && (
        <div
          ref={menuRef}
          className="fixed z-[200] bg-white rounded-lg shadow-xl border border-surface-dim py-1 w-56"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <div className="menu-header">Move to stage</div>
          {stages.map((s) => (
            <button key={s.id} className="w-full text-left px-3 py-1.5 hover:bg-surface-container-low text-body-sm" onClick={() => { handleMoveStage(contextMenu.deal.id, s.id); setContextMenu(null); }}>
              {s.name}
            </button>
          ))}
          <div className="sep" />
          <button className="w-full text-left px-3 py-1.5 hover:bg-surface-container-low text-body-sm flex items-center gap-2" onClick={async () => { await createTask({ title: `Follow up: ${contextMenu.deal.name}`, priority: 'medium', status: 'open' }); setContextMenu(null); }}>
            <span className="material-symbols-outlined text-[14px]">task_alt</span>Create follow-up task
          </button>
          <button className="w-full text-left px-3 py-1.5 hover:bg-surface-container-low text-body-sm flex items-center gap-2" onClick={async () => { await createNote({ body: `Deal note: ${contextMenu.deal.name}`, note_type: 'general' }); setContextMenu(null); }}>
            <span className="material-symbols-outlined text-[14px]">sticky_note_2</span>Add note
          </button>
          <div className="sep" />
          <button className="w-full text-left px-3 py-1.5 hover:bg-surface-container-low text-body-sm flex items-center gap-2 text-secondary" onClick={() => { handleMarkWon(contextMenu.deal.id); setContextMenu(null); }}>
            <span className="material-symbols-outlined text-[14px]">trophy</span>Mark won
          </button>
          <button className="w-full text-left px-3 py-1.5 hover:bg-surface-container-low text-body-sm flex items-center gap-2 text-error" onClick={() => { handleMarkLost(contextMenu.deal.id); setContextMenu(null); }}>
            <span className="material-symbols-outlined text-[14px]">cancel</span>Mark lost
          </button>
        </div>
      )}

      {/* DEAL DRAWER */}
      {drawerDeal && (
        <DealDrawer
          deal={drawerDeal}
          stages={stages}
          customers={customers}
          onClose={() => setDrawerDeal(null)}
          onSave={async (updates) => { const r = await updateDeal(drawerDeal.id, updates); if (r.ok) { refreshDeals(); setDrawerDeal({ ...drawerDeal, ...updates } as Deal); } }}
          onMoveStage={(stageId) => { handleMoveStage(drawerDeal.id, stageId); setDrawerDeal(null); }}
          onMarkWon={() => { handleMarkWon(drawerDeal.id); setDrawerDeal(null); }}
          onMarkLost={() => { handleMarkLost(drawerDeal.id); setDrawerDeal(null); }}
          onDelete={() => handleDelete(drawerDeal.id)}
        />
      )}

      {/* CREATE DEAL MODAL */}
      {showCreate && pipelineId && (
        <CreateDealModal
          pipelineId={pipelineId}
          stages={stages}
          customers={customers}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); refreshDeals(); }}
        />
      )}
    </main>
  );
}

/* ── Deal drawer ── */
function DealDrawer({ deal, stages, customers, onClose, onSave, onMoveStage, onMarkWon, onMarkLost, onDelete }: {
  deal: Deal;
  stages: PipelineStage[];
  customers: CrmCustomer[];
  onClose: () => void;
  onSave: (updates: Partial<Deal>) => Promise<void>;
  onMoveStage: (stageId: string) => void;
  onMarkWon: () => void;
  onMarkLost: () => void;
  onDelete: () => void;
}) {
  const [name, setName] = useState(deal.name);
  const [amount, setAmount] = useState(String(deal.amount));
  const [stageId, setStageId] = useState(deal.stage_id);
  const [customerId, setCustomerId] = useState(deal.customer_id || '');
  const [probability, setProbability] = useState(String(deal.probability));
  const [expectedClose, setExpectedClose] = useState((deal.expected_close_date || '').slice(0, 10));
  const [notes, setNotes] = useState(deal.notes || '');
  const [saving, setSaving] = useState(false);

  async function save() {
    setSaving(true);
    await onSave({
      name,
      amount: Number(amount) || 0,
      stage_id: stageId,
      customer_id: customerId || null,
      probability: Number(probability) || 0,
      expected_close_date: expectedClose || null,
      notes: notes || null,
    });
    setSaving(false);
  }

  return (
    <div className="drawer-scrim open" onClick={onClose}>
      <div className="drawer open w-[560px]" role="dialog" aria-label={`Deal ${deal.deal_number}`} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-5 h-14 border-b border-surface-dim shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <span className="material-symbols-outlined text-[20px] text-primary">trending_up</span>
            <div className="min-w-0">
              <div className="text-headline-sm truncate">{deal.name}</div>
              <div className="text-[11px] text-on-surface-variant">{deal.deal_number} · {money(deal.amount, deal.currency)}</div>
            </div>
          </div>
          <button className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center" onClick={onClose}><span className="material-symbols-outlined text-[18px]">close</span></button>
        </div>
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          <div>
            <label className="field-label">Deal name</label>
            <input className="field-input" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="field-label">Amount</label>
              <input className="field-input" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} />
            </div>
            <div>
              <label className="field-label">Probability %</label>
              <input className="field-input" type="number" min={0} max={100} value={probability} onChange={(e) => setProbability(e.target.value)} />
            </div>
          </div>
          <div>
            <label className="field-label">Stage</label>
            <select className="field-input" value={stageId} onChange={(e) => setStageId(e.target.value)}>
              {stages.map((s) => <option key={s.id} value={s.id}>{s.name} ({s.probability ?? 0}%)</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Customer</label>
            <select className="field-input" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">— none —</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{custName(c)}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Expected close</label>
            <input className="field-input" type="date" value={expectedClose} onChange={(e) => setExpectedClose(e.target.value)} />
          </div>
          <div>
            <label className="field-label">Notes</label>
            <textarea className="field-input min-h-[80px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {deal.status === 'won' && <div className="text-body-sm text-secondary">Won at {fmtDate(deal.won_at)}</div>}
          {deal.status === 'lost' && <div className="text-body-sm text-error">Lost at {fmtDate(deal.lost_at)} — {deal.lost_reason || 'no reason'}</div>}
        </div>
        <div className="h-14 border-t border-surface-dim px-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-1">
            <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low text-secondary flex items-center gap-1" onClick={onMarkWon} disabled={deal.status === 'won'}><span className="material-symbols-outlined text-[14px]">trophy</span>Won</button>
            <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low text-error flex items-center gap-1" onClick={onMarkLost} disabled={deal.status === 'lost'}><span className="material-symbols-outlined text-[14px]">cancel</span>Lost</button>
            <button className="h-8 px-3 border border-error text-error rounded text-body-md hover:bg-error/10 flex items-center gap-1" onClick={onDelete}><span className="material-symbols-outlined text-[14px]">delete</span>Delete</button>
          </div>
          <div className="flex items-center gap-2">
            <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={onClose}>Close</button>
            <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container disabled:opacity-40" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Create deal modal ── */
function CreateDealModal({ pipelineId, stages, customers, onClose, onCreated }: {
  pipelineId: string;
  stages: PipelineStage[];
  customers: CrmCustomer[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const { createDeal } = useCrmMutations(() => {});
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('0');
  const [stageId, setStageId] = useState(stages[0]?.id || '');
  const [customerId, setCustomerId] = useState('');
  const [probability, setProbability] = useState(String(stages[0]?.probability || 0));
  const [expectedClose, setExpectedClose] = useState('');
  const [saving, setSaving] = useState(false);

  // When stages arrive late (usePipelineStages is async), seed the defaults.
  useEffect(() => {
    if (stages.length > 0 && !stageId) {
      setStageId(stages[0].id);
      setProbability(String(stages[0].probability || 0));
    }
  }, [stages, stageId]);

  async function submit() {
    if (!name.trim()) return;
    setSaving(true);
    const res = await createDeal({
      name: name.trim(),
      pipeline_id: pipelineId,
      stage_id: stageId,
      amount: Number(amount) || 0,
      customer_id: customerId || null,
      probability: Number(probability) || 0,
      expected_close_date: expectedClose || null,
      status: 'open',
      currency: 'USD',
    });
    setSaving(false);
    if (res.ok) onCreated();
  }

  return (
    <div className="modal-scrim open" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-headline-sm mb-1">New deal</h3>
        <p className="text-body-sm text-on-surface-variant mb-4">Creates a record in Supabase crm_deals.</p>
        <div className="space-y-3">
          <div><label className="field-label">Deal name *</label><input className="field-input" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><label className="field-label">Amount</label><input className="field-input" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
            <div><label className="field-label">Probability %</label><input className="field-input" type="number" min={0} max={100} value={probability} onChange={(e) => setProbability(e.target.value)} /></div>
          </div>
          <div>
            <label className="field-label">Stage</label>
            <select className="field-input" value={stageId} onChange={(e) => { setStageId(e.target.value); const s = stages.find(x => x.id === e.target.value); if (s) setProbability(String(s.probability || 0)); }}>
              {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label className="field-label">Customer</label>
            <select className="field-input" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">— none —</option>
              {customers.map((c) => <option key={c.id} value={c.id}>{custName(c)}</option>)}
            </select>
          </div>
          <div><label className="field-label">Expected close</label><input className="field-input" type="date" value={expectedClose} onChange={(e) => setExpectedClose(e.target.value)} /></div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={onClose}>Cancel</button>
          <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container disabled:opacity-40" onClick={submit} disabled={!name.trim() || saving}>{saving ? 'Creating…' : 'Create deal'}</button>
        </div>
      </div>
    </div>
  );
}
