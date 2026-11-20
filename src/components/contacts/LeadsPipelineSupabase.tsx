'use client';
/**
 * LeadsPipelineSupabase — Leads + Deals pipeline screen.
 *
 * Two screens (Kim's design, docs CRM pack + 2026-11-15): Leads and
 * Deals are separate nav entries, and their management lives INLINE —
 * scoring rules are managed from a flyout on the Leads header,
 * pipelines + stages from the Deals header (Stages panel, Pipeline
 * modal). Segments are saved views on Parties. Conversion is an
 * explicit action on the lead (crm_convert_lead — adds the Customer
 * role to the SAME party and opens a deal); the Deals board has
 * drag-to-move through crm_move_deal and a stage-history drawer.
 *
 * Both kanban boards fit the screen: columns flex to the available
 * width and cards compact — no horizontal scrolling.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  useCrmLeads,
  useCrmMutations,
  useLeadScoreBands,
  useLeadScoringRules,
  useCrmDeals,
  useCrmPipelines,
  useCrmPipelineStages,
  useDealStageHistory,
  usePipelineSummary,
  type CrmLead,
} from '@/hooks/useCrmApi';
import type { CrmDealRow } from '@/lib/crmTypes';
import SequencesScreen from './SequencesScreen';
import StageManager from './PipelineBuilder';
import { scoreBandFor } from '@/lib/crmTypes';
import { importCsvFile } from '@/lib/csvImport';
import { VIEW_DEFS } from '@/lib/viewDefs';

interface LeadsPipelineProps {
  onToast: (m: string) => void;
  onNavigate?: (d: string, s: string) => void;
}

const PIPELINE_STAGES = [
  { id: 'new', label: 'New', color: 'bg-qb-blue' },
  { id: 'contacted', label: 'Contacted', color: 'bg-qb-teal' },
  { id: 'qualified', label: 'Qualified', color: 'bg-primary' },
  { id: 'working', label: 'Working', color: 'bg-qb-maroon' },
  { id: 'pending', label: 'Pending', color: 'bg-qb-navy' },
  { id: 'converted', label: 'Converted', color: 'bg-qb-green' },
  { id: 'lost', label: 'Lost', color: 'bg-surface-dim' },
];

function initials(name: string | null) {
  if (!name) return '?';
  const parts = name.trim().split(' ');
  return (parts[0]?.[0] || '') + (parts[1]?.[0] || '');
}

const money = (n: number | null | undefined) =>
  n == null ? '—' : `$${Number(n).toLocaleString('en-US', { maximumFractionDigits: 0 })}`;

/**
 * Leads screen (default export) and Deals screen (named export) —
 * separate nav entries per Kim's design. Scoring + sequences are
 * managed inline from the Leads header; pipelines + stages inline
 * from the Deals header.
 */
export default function LeadsPipelineSupabase({ onToast, onNavigate }: LeadsPipelineProps) {
  return <LeadsView onToast={onToast} onNavigate={onNavigate} />;
}

export function DealsScreen({ onToast, onNavigate }: LeadsPipelineProps) {
  return <DealsView onToast={onToast} />;
}

/* ── Scoring panel (inline on Leads) ───────────────────────────── */

interface ScoringRule {
  id: string;
  name: string;
  field: string;
  operator: string;
  value: string | null;
  points: number;
  is_active: boolean;
}

const RULE_FIELDS = ['email', 'phone', 'lead_type', 'activity_count_7d', 'days_since_activity', 'source', 'company_name'];
const RULE_OPERATORS = ['eq', 'neq', 'contains', 'gt', 'lt', 'is_set', 'is_not_set'];

async function rulesApi<T>(url: string, init?: RequestInit): Promise<{ data: T | null; error: string | null }> {
  try {
    const r = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init });
    const j = await r.json();
    if (!r.ok) return { data: null, error: j?.error?.message || `HTTP ${r.status}` };
    return { data: j.data as T, error: null };
  } catch (e: any) {
    return { data: null, error: e.message };
  }
}

function ScoringPanel({ onToast, onChanged }: { onToast: (m: string) => void; onChanged: () => void }) {
  const [rules, setRules] = useState<ScoringRule[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [field, setField] = useState('email');
  const [operator, setOperator] = useState('is_set');
  const [value, setValue] = useState('');
  const [points, setPoints] = useState('10');
  const [busy, setBusy] = useState(false);

  // Score bands (crm_lead_score_bands): the hot/warm thresholds the
  // rules score against — a child of lead scoring, set here in the
  // panel, never a page of its own (CRM pack, experience spec).
  const [bands, setBands] = useState<{ hot_min: number; warm_min: number } | null>(null);
  const [hotMin, setHotMin] = useState('');
  const [warmMin, setWarmMin] = useState('');
  const [bandsBusy, setBandsBusy] = useState(false);

  const load = async () => {
    const { data } = await rulesApi<ScoringRule[]>('/api/crm/lead-scoring-rules');
    setRules(data || []);
    const b = await rulesApi<{ hot_min: number; warm_min: number } | null>('/api/crm/lead-score-bands');
    setBands(b.data);
    if (b.data) { setHotMin(String(b.data.hot_min)); setWarmMin(String(b.data.warm_min)); }
    setLoaded(true);
  };
  useEffect(() => { void load(); }, []);

  async function saveBands() {
    const hot = Number(hotMin); const warm = Number(warmMin);
    if (Number.isNaN(hot) || Number.isNaN(warm)) { onToast('Band thresholds must be numbers'); return; }
    if (warm >= hot) { onToast('Warm threshold must be below the hot threshold'); return; }
    setBandsBusy(true);
    const { error } = await rulesApi('/api/crm/lead-score-bands', {
      method: 'PATCH',
      body: JSON.stringify({ hot_min: hot, warm_min: warm }),
    });
    setBandsBusy(false);
    if (error) { onToast(`Save bands failed: ${error}`); return; }
    setBands({ hot_min: hot, warm_min: warm });
    onToast(`Score bands set — hot ≥ ${hot}, warm ≥ ${warm}`);
    onChanged();
  }

  async function toggle(rule: ScoringRule) {
    const { error } = await rulesApi(`/api/crm/lead-scoring-rules/${rule.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active: !rule.is_active }),
    });
    if (error) { onToast(`Toggle failed: ${error}`); return; }
    await load();
    onChanged();
  }

  async function remove(rule: ScoringRule) {
    const { error } = await rulesApi(`/api/crm/lead-scoring-rules/${rule.id}`, { method: 'DELETE' });
    if (error) { onToast(`Delete failed: ${error}`); return; }
    onToast(`Rule "${rule.name}" deleted`);
    await load();
    onChanged();
  }

  async function addRule() {
    const pts = Number(points);
    if (Number.isNaN(pts)) { onToast('Points must be a number'); return; }
    setBusy(true);
    const { error } = await rulesApi('/api/crm/lead-scoring-rules', {
      method: 'POST',
      body: JSON.stringify({
        name: `${field}_${operator}`,
        field,
        operator,
        value: operator === 'is_set' || operator === 'is_not_set' ? null : value || null,
        points: pts,
        is_active: true,
      }),
    });
    setBusy(false);
    if (error) { onToast(`Add rule failed: ${error}`); return; }
    onToast(`Rule "${field}_${operator}" added (${pts > 0 ? '+' : ''}${pts})`);
    setValue('');
    await load();
    onChanged();
  }

  return (
    <div className="border border-outline-variant rounded-lg p-4 mb-3 bg-white">
      <div className="flex items-center gap-2">
        <span className="material-symbols-outlined text-[18px]">score</span>
        <h3 className="text-title-md font-semibold">Lead scoring rules</h3>
        <span className="text-body-sm text-on-surface-variant">{rules.filter(r => r.is_active).length} active of {rules.length}</span>
      </div>
      <div className="space-y-2 mt-3">
        {!loaded ? (
          <p className="text-body-sm text-on-surface-variant">Loading rules…</p>
        ) : rules.length === 0 ? (
          <p className="text-body-sm text-on-surface-variant">No scoring rules yet — add the first one below.</p>
        ) : rules.map(r => (
          <div key={r.id} className="flex items-center gap-3 bg-surface-container-low rounded px-3 py-2">
            <span className="font-mono text-body-sm flex-1">{r.name}</span>
            <span className="text-body-sm text-on-surface-variant">{r.field} {r.operator}{r.value != null && r.value !== '' ? ` ${r.value}` : ''}</span>
            <span className={`text-body-md font-bold tabular-nums ${r.points >= 0 ? 'text-emerald-700' : 'text-error'}`}>{r.points > 0 ? '+' : ''}{r.points}</span>
            <button
              className={`w-9 h-5 rounded-full relative transition-colors ${r.is_active ? 'bg-emerald-600' : 'bg-surface-dim'}`}
              onClick={() => void toggle(r)}
              aria-label={r.is_active ? 'Deactivate rule' : 'Activate rule'}
            >
              <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white ${r.is_active ? 'right-0.5' : 'left-0.5'}`} />
            </button>
            <button className="w-7 h-7 rounded hover:bg-error-container flex items-center justify-center" onClick={() => void remove(r)} aria-label="Delete rule">
              <span className="material-symbols-outlined text-[16px]">delete</span>
            </button>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-2 mt-3 flex-wrap">
        <span className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Score bands</span>
        <span className="text-body-sm text-on-surface-variant">Hot ≥</span>
        <input className="h-8 w-20 px-2 border border-surface-dim rounded text-body-md" inputMode="numeric" value={hotMin} onChange={(e) => setHotMin(e.target.value)} aria-label="Hot threshold" />
        <span className="text-body-sm text-on-surface-variant">Warm ≥</span>
        <input className="h-8 w-20 px-2 border border-surface-dim rounded text-body-md" inputMode="numeric" value={warmMin} onChange={(e) => setWarmMin(e.target.value)} aria-label="Warm threshold" />
        <span className="text-body-sm text-on-surface-variant">below warm is cold{bands ? '' : ' · not set yet'}</span>
        <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container disabled:opacity-50" disabled={bandsBusy} onClick={() => void saveBands()}>Save bands</button>
      </div>
      <div className="border border-dashed border-outline-variant rounded-lg p-3 mt-3">
        <div className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Add rule</div>
        <div className="flex items-end gap-2 mt-2 flex-wrap">
          <div>
            <label className="text-[11px] uppercase tracking-wider text-on-surface-variant">Field</label>
            <select className="field-input" value={field} onChange={e => setField(e.target.value)}>
              {RULE_FIELDS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider text-on-surface-variant">Operator</label>
            <select className="field-input" value={operator} onChange={e => setOperator(e.target.value)}>
              {RULE_OPERATORS.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider text-on-surface-variant">Value</label>
            <input className="field-input" style={{ width: 130 }} value={value} onChange={e => setValue(e.target.value)} disabled={operator === 'is_set' || operator === 'is_not_set'} placeholder={operator === 'is_set' || operator === 'is_not_set' ? '—' : 'value'} />
          </div>
          <div>
            <label className="text-[11px] uppercase tracking-wider text-on-surface-variant">Points</label>
            <input className="field-input" style={{ width: 80 }} type="number" value={points} onChange={e => setPoints(e.target.value)} />
          </div>
          <button className="h-9 px-3 rounded bg-[#1e7d32] text-white text-body-md font-semibold disabled:opacity-50" disabled={busy} onClick={() => void addRule()}>Add rule</button>
        </div>
      </div>
    </div>
  );
}

/* ── Leads ─────────────────────────────────────────────────────── */

function LeadsView({ onToast, onNavigate }: { onToast: (m: string) => void; onNavigate?: (d: string, s: string) => void }) {
  const [panel, setPanel] = useState<'scoring' | 'sequences' | null>(null);
  const { data: leads, loaded, refresh: refetch } = useCrmLeads();
  const { updateLead, deleteLead, rescoreLead, convertLead } = useCrmMutations(onToast);
  const { data: scoreBands } = useLeadScoreBands();
  const { data: scoringRules, refresh: refreshRules } = useLeadScoringRules();
  const [view, setView] = useState<'board' | 'list'>('board');
  const [showCreate, setShowCreate] = useState(false);
  const importRef = useRef<HTMLInputElement | null>(null);

  // Real CSV import (GAP-2): headers map onto the leads columns; the
  // helper snake_cases keys and the field map aligns Source -> lead_source.
  async function handleImport(file: File) {
    const { ok, failed } = await importCsvFile(
      file,
      VIEW_DEFS.leads.columns,
      VIEW_DEFS.leads.apiPath,
      undefined,
      { source: 'lead_source' },
    );
    if (ok === 0 && failed === 0) { onToast('That CSV has no data rows'); return; }
    onToast(`Import finished — ${ok} created${failed ? `, ${failed} failed` : ''}`);
    if (ok > 0) refetch();
  }
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [actionNote, setActionNote] = useState<string | null>(null);
  const [convertingId, setConvertingId] = useState<string | null>(null);

  const leadsByStage = (stageId: string) => leads.filter(l => l.status === stageId);

  async function handleStageChange(id: string, newStatus: string) {
    try {
      await updateLead(id, { status: newStatus });
      refetch();
    } catch (e: any) {
      onToast(`Error: ${e.message}`);
    }
  }

  /** Explicit conversion (registered action lead.convert): the RPC adds
   *  the Customer role to the lead's own party — never a duplicate
   *  record — and opens a deal in the pipeline. */
  async function handleConvert(lead: CrmLead) {
    setConvertingId(lead.id);
    const res = await convertLead(lead.id);
    setConvertingId(null);
    if (res.ok) {
      setActionNote(
        `Converted ${lead.contact_name || lead.email || 'lead'} — the same party now holds the Customer role and a deal was opened. See Deals.`,
      );
      refetch();
    } else {
      onToast(`Convert failed: ${res.error}`);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteLead(id);
      refetch();
    } catch (e: any) { onToast(`Error: ${e.message}`); }
  }

  async function handleRescore(id: string) {
    const res = await rescoreLead(id);
    if (res.ok) refetch();
  }

  function bandLabel(score: number | null | undefined): string | null {
    if (score == null) return null;
    const band = scoreBandFor(score, scoreBands);
    return band ? `${band.charAt(0).toUpperCase() + band.slice(1)} · ${score}` : `${score}`;
  }

  function onDragStart(e: React.DragEvent, id: string) {
    setDraggingId(id);
    e.dataTransfer.effectAllowed = 'move';
  }
  function onDrop(e: React.DragEvent, stage: string) {
    e.preventDefault();
    if (draggingId) {
      handleStageChange(draggingId, stage);
      setDraggingId(null);
    }
  }

  const totalLeads = leads.length;
  const convertedCount = leads.filter(l => l.status === 'converted').length;
  const conversionRate = totalLeads > 0 ? (convertedCount / totalLeads * 100).toFixed(1) : '0';
  const activeRules = (scoringRules || []).filter(r => r.is_active);

  return (
    <main className="px-6 pb-12 flex flex-col h-full">
      <div className="flex items-center justify-between py-4">
        <div>
          <h1 className="text-headline-lg">Leads Pipeline</h1>
          <p className="text-body-sm text-on-surface-variant mt-0.5">From Supabase crm_leads · {totalLeads} leads · {conversionRate}% conversion</p>
        </div>
        <div className="flex items-center gap-2">
          <button className={`h-8 px-3 text-body-md font-semibold rounded border flex items-center gap-1 ${panel === 'scoring' ? 'bg-primary text-white border-primary' : 'border-surface-dim hover:bg-surface-container-low'}`} onClick={() => setPanel(panel === 'scoring' ? null : 'scoring')}>
            <span className="material-symbols-outlined text-[16px]">score</span>Scoring
          </button>
          <button className={`h-8 px-3 text-body-md font-semibold rounded border flex items-center gap-1 ${panel === 'sequences' ? 'bg-primary text-white border-primary' : 'border-surface-dim hover:bg-surface-container-low'}`} onClick={() => setPanel(panel === 'sequences' ? null : 'sequences')}>
            <span className="material-symbols-outlined text-[16px]">timeline</span>Sequences
          </button>
          <div className="flex border border-surface-dim rounded overflow-hidden">
            <button className={`h-8 px-3 text-body-md ${view === 'board' ? 'bg-primary text-white' : 'hover:bg-surface-container-low'}`} onClick={() => setView('board')}>Board</button>
            <button className={`h-8 px-3 text-body-md ${view === 'list' ? 'bg-primary text-white' : 'hover:bg-surface-container-low'}`} onClick={() => setView('list')}>List</button>
          </div>
          <input ref={importRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void handleImport(f); }} />
          <button className="h-8 px-3 text-body-md font-semibold rounded border border-surface-dim hover:bg-surface-container-low flex items-center gap-1" onClick={() => importRef.current?.click()}>
            <span className="material-symbols-outlined text-[16px]">upload</span>Import
          </button>
          <button className="h-8 px-3 bg-primary text-white text-body-md font-semibold rounded hover:bg-primary-container flex items-center gap-1" onClick={() => setShowCreate(true)}>
            <span className="material-symbols-outlined text-[16px]">add</span>New lead
          </button>
        </div>
      </div>

      {panel === 'scoring' && <ScoringPanel onToast={onToast} onChanged={refreshRules} />}
      {panel === 'sequences' && (
        <div className="border border-outline-variant rounded-lg mb-3 bg-white overflow-hidden" style={{ height: 560 }}>
          <SequencesScreen onToast={onToast} onNavigate={onNavigate} />
        </div>
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-4 gap-3 mb-3">
        <div className="bg-white rounded-xl border border-surface-dim p-3">
          <div className="text-[10px] text-on-surface-variant uppercase font-bold">Total leads</div>
          <div className="text-headline-sm tabular-nums">{totalLeads}</div>
        </div>
        <div className="bg-white rounded-xl border border-surface-dim p-3">
          <div className="text-[10px] text-on-surface-variant uppercase font-bold">Open</div>
          <div className="text-headline-sm tabular-nums text-primary">{leads.filter(l => ['new', 'contacted', 'qualified', 'working', 'pending'].includes(l.status)).length}</div>
        </div>
        <div className="bg-white rounded-xl border border-surface-dim p-3">
          <div className="text-[10px] text-on-surface-variant uppercase font-bold">Converted</div>
          <div className="text-headline-sm tabular-nums text-secondary">{convertedCount}</div>
        </div>
        <div className="bg-white rounded-xl border border-surface-dim p-3">
          <div className="text-[10px] text-on-surface-variant uppercase font-bold">Conversion rate</div>
          <div className="text-headline-sm tabular-nums">{conversionRate}%</div>
        </div>
      </div>

      {/* Scoring strip — bands + rules live here with the leads, not on
          a separate screen. */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-3 text-[11px] text-on-surface-variant">
        <span className="font-semibold uppercase tracking-wide text-[10px]">Scoring</span>
        {scoreBands ? (
          <span>
            <span className="pill info" style={{ fontSize: 9, padding: '1px 5px' }}>Hot ≥ {scoreBands.hot_min}</span>{' '}
            <span className="pill info" style={{ fontSize: 9, padding: '1px 5px' }}>Warm ≥ {scoreBands.warm_min}</span>{' '}
            <span className="pill info" style={{ fontSize: 9, padding: '1px 5px' }}>Cold &lt; {scoreBands.warm_min}</span>
          </span>
        ) : (
          <span>No score bands configured</span>
        )}
        <span>
          {activeRules.length} active rule{activeRules.length === 1 ? '' : 's'}
          {activeRules.length > 0 && (
            <>: {activeRules.slice(0, 3).map(r => `${r.name} (${r.points > 0 ? '+' : ''}${r.points})`).join(' · ')}{activeRules.length > 3 ? ` · +${activeRules.length - 3} more` : ''}</>
          )}
        </span>
      </div>

      {actionNote && (
        <div className="mb-3 rounded-lg border border-secondary bg-secondary-container/40 px-3 py-2 text-body-sm flex items-center justify-between">
          <span>{actionNote}</span>
          <button className="text-on-surface-variant hover:text-error" onClick={() => setActionNote(null)} aria-label="Dismiss">
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>
      )}

      {!loaded && leads.length === 0 ? (
        <div className="flex items-center justify-center h-64 text-on-surface-variant/60 text-body-sm">
          Fetching leads from Supabase…
        </div>
      ) : view === 'board' ? (
        /* KANBAN BOARD — columns flex to the screen width; no
           horizontal scroll, cards compact. */
        <div className="flex gap-2 flex-1 min-h-0">
          {PIPELINE_STAGES.map(stage => {
            const stageLeads = leadsByStage(stage.id);
            return (
              <div
                key={stage.id}
                className="flex-1 min-w-0 bg-surface-container-low rounded-lg flex flex-col"
                onDragOver={e => e.preventDefault()}
                onDrop={e => onDrop(e, stage.id)}
              >
                <div className="px-2 py-1.5 border-b border-surface-dim flex items-center justify-between">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className={`w-2 h-2 rounded-full shrink-0 ${stage.color}`}></span>
                    <span className="text-label-md font-semibold truncate">{stage.label}</span>
                  </div>
                  <span className="text-label-sm text-on-surface-variant">{stageLeads.length}</span>
                </div>
                <div className="flex-1 overflow-y-auto p-1.5 space-y-1.5">
                  {stageLeads.map(lead => (
                    <div
                      key={lead.id}
                      draggable
                      onDragStart={e => onDragStart(e, lead.id)}
                      className="bg-white rounded border border-surface-dim p-1.5 cursor-move hover:shadow-sm text-body-sm"
                    >
                      <div className="flex items-start justify-between mb-0.5">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <div className="avatar w-5 h-5 rounded-full bg-surface-container flex items-center justify-center text-[9px] font-bold shrink-0">{initials(lead.contact_name)}</div>
                          <div className="font-medium text-[11px] truncate">{lead.contact_name || 'Unnamed'}</div>
                        </div>
                        <div className="flex items-center shrink-0">
                          <button className="text-on-surface-variant hover:text-primary" onClick={() => handleRescore(lead.id)} title="Recalculate lead score">
                            <span className="material-symbols-outlined text-[13px]">refresh</span>
                          </button>
                          <button className="text-on-surface-variant hover:text-error" onClick={() => handleDelete(lead.id)} title="Delete lead">
                            <span className="material-symbols-outlined text-[13px]">close</span>
                          </button>
                        </div>
                      </div>
                      <div className="text-[10px] text-on-surface-variant truncate">{lead.email || '—'}</div>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {lead.lead_source && (
                          <span className="pill info" style={{ fontSize: 9, padding: '1px 5px' }}>{lead.lead_source}</span>
                        )}
                        {bandLabel(lead.score) && (
                          <span className="pill info" style={{ fontSize: 9, padding: '1px 5px' }}>{bandLabel(lead.score)} pts</span>
                        )}
                      </div>
                      {lead.status !== 'converted' && lead.status !== 'lost' && (
                        <button
                          className="mt-1.5 w-full h-6 text-[10px] font-semibold rounded bg-primary text-white hover:bg-primary-container disabled:opacity-40"
                          onClick={() => handleConvert(lead)}
                          disabled={convertingId === lead.id}
                        >
                          {convertingId === lead.id ? 'Converting…' : 'Convert to customer'}
                        </button>
                      )}
                      {lead.status === 'converted' && lead.customer_id && (
                        <div className="mt-1 text-[10px] text-secondary font-medium">Customer ✓</div>
                      )}
                    </div>
                  ))}
                  {stageLeads.length === 0 && (
                    <div className="text-center text-[10px] text-on-surface-variant py-3">Drop leads here</div>
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
                <th className="px-3 py-2">Lead</th>
                <th className="px-3 py-2">Source</th>
                <th className="px-3 py-2">Status</th>
                <th className="px-3 py-2">Score</th>
                <th className="px-3 py-2">First contact</th>
                <th className="px-3 py-2">Last activity</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-dim">
              {leads.map(lead => (
                <tr key={lead.id} className="hover:bg-surface-container-low">
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="avatar w-6 h-6 rounded-full bg-surface-container flex items-center justify-center text-[10px] font-bold">{initials(lead.contact_name)}</div>
                      <div>
                        <div className="font-medium">{lead.contact_name || 'Unnamed'}</div>
                        <div className="text-[11px] text-on-surface-variant">{lead.email || '—'}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-[11px]">{lead.lead_source || '—'}</td>
                  <td className="px-3 py-2">
                    <select
                      className="text-[11px] border border-surface-dim rounded px-1 py-0.5 bg-white"
                      value={lead.status}
                      onChange={e => handleStageChange(lead.id, e.target.value)}
                    >
                      {PIPELINE_STAGES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-2 text-[11px]">{bandLabel(lead.score) ? <span className="pill info" style={{ fontSize: 9, padding: '1px 5px' }}>{bandLabel(lead.score)} pts</span> : '—'}</td>
                  <td className="px-3 py-2 text-[11px]">{lead.first_contact_at?.slice(0, 10) || '—'}</td>
                  <td className="px-3 py-2 text-[11px]">{lead.last_activity_at?.slice(0, 10) || '—'}</td>
                  <td className="px-2 py-2">
                    <div className="flex items-center gap-2 justify-end">
                      {lead.status !== 'converted' && lead.status !== 'lost' && (
                        <button
                          className="h-6 px-2 text-[10px] font-semibold rounded bg-primary text-white hover:bg-primary-container disabled:opacity-40"
                          onClick={() => handleConvert(lead)}
                          disabled={convertingId === lead.id}
                        >
                          {convertingId === lead.id ? 'Converting…' : 'Convert'}
                        </button>
                      )}
                      <button className="text-on-surface-variant hover:text-error" onClick={() => handleDelete(lead.id)}>
                        <span className="material-symbols-outlined text-[16px]">delete</span>
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showCreate && <CreateLeadModal onToast={onToast} onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); refetch(); }} />}
    </main>
  );
}

/* ── Deals ─────────────────────────────────────────────────────── */

function DealsView({ onToast }: { onToast: (m: string) => void }) {
  const [showStages, setShowStages] = useState(false);
  const [showPipelineModal, setShowPipelineModal] = useState(false);
  const [newPipelineName, setNewPipelineName] = useState('');
  const [creatingPipeline, setCreatingPipeline] = useState(false);
  const { data: pipelines, refresh: refreshPipelines } = useCrmPipelines();
  const [pipelineId, setPipelineId] = useState<string | null>(null);
  const activePipelineId = pipelineId || pipelines.find(p => p.is_default)?.id || pipelines[0]?.id || undefined;
  const { data: stagesRaw, refresh: refreshStages } = useCrmPipelineStages(activePipelineId);
  const { data: deals, refresh: refetchDeals } = useCrmDeals(activePipelineId);
  const { data: summary } = usePipelineSummary(activePipelineId);
  const { moveDeal, createDeal } = useCrmMutations(onToast);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [selectedDeal, setSelectedDeal] = useState<CrmDealRow | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [moveNote, setMoveNote] = useState<string | null>(null);

  const stages = useMemo(
    () => [...(stagesRaw || [])].sort((a, b) => a.sort_order - b.sort_order),
    [stagesRaw],
  );
  const stageName = (id: string | null) => stages.find(s => s.id === id)?.name || '—';
  const openValue = deals.filter(d => d.status === 'open').reduce((s, d) => s + Number(d.amount || 0), 0);
  const wonValue = deals.filter(d => d.status === 'won').reduce((s, d) => s + Number(d.amount || 0), 0);

  async function handleMove(dealId: string, stageId: string) {
    const deal = deals.find(d => d.id === dealId);
    const res = await moveDeal(dealId, stageId);
    if (res.ok) {
      setMoveNote(`Moved "${deal?.name || 'deal'}" to ${stageName(stageId)} — stage history recorded.`);
      refetchDeals();
      if (selectedDeal?.id === dealId) setSelectedDeal({ ...selectedDeal, stage_id: stageId });
    } else {
      onToast(`Move failed: ${res.error}`);
    }
  }

  return (
    <main className="px-6 pb-12 flex flex-col h-full">
      <div className="flex items-center justify-between py-4">
        <div>
          <h1 className="text-headline-lg">Deals Pipeline</h1>
          <p className="text-body-sm text-on-surface-variant mt-0.5">
            {deals.length} deals · {money(openValue)} open · {money(wonValue)} won
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="h-8 text-body-md border border-surface-dim rounded px-2 bg-white"
            value={activePipelineId || ''}
            onChange={e => setPipelineId(e.target.value)}
            aria-label="Pipeline"
          >
            {pipelines.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <button
            className={`h-8 px-3 text-body-md font-semibold rounded border flex items-center gap-1 ${showStages ? 'bg-primary text-white border-primary' : 'border-surface-dim hover:bg-surface-container-low'}`}
            onClick={() => setShowStages(v => !v)}
          >
            <span className="material-symbols-outlined text-[16px]">view_column</span>Stages
          </button>
          <button
            className="h-8 px-3 text-body-md font-semibold rounded border border-surface-dim hover:bg-surface-container-low flex items-center gap-1"
            onClick={() => setShowPipelineModal(true)}
          >
            <span className="material-symbols-outlined text-[16px]">add</span>Pipeline
          </button>
          <button
            className="h-8 px-3 bg-primary text-white text-body-md font-semibold rounded hover:bg-primary-container flex items-center gap-1 disabled:opacity-40"
            onClick={() => setShowCreate(true)}
            disabled={stages.length === 0}
          >
            <span className="material-symbols-outlined text-[16px]">add</span>New deal
          </button>
        </div>
      </div>

      {showStages && activePipelineId && (
        <div className="border border-outline-variant rounded-lg p-4 mb-3 bg-white">
          <StageManager
            pipelineId={activePipelineId}
            pipelineName={pipelines.find(p => p.id === activePipelineId)?.name}
            onToast={onToast}
            onChanged={refreshStages}
          />
        </div>
      )}

      {showPipelineModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowPipelineModal(false)}>
          <div className="bg-white rounded-xl shadow-xl w-[420px] max-w-[92vw] p-5" onClick={e => e.stopPropagation()}>
            <h3 className="text-title-lg font-semibold">New pipeline</h3>
            <p className="text-body-sm text-on-surface-variant mt-1">Creates the pipeline with the six standard stages: New 10%, Qualified 25%, Proposal 50%, Negotiation 75%, Won 100%, Lost 0%.</p>
            <label className="text-[11px] uppercase tracking-wider text-on-surface-variant block mt-4">Name</label>
            <input className="field-input w-full" placeholder="e.g. Enterprise sales" value={newPipelineName} onChange={e => setNewPipelineName(e.target.value)} autoFocus />
            <div className="flex justify-end gap-2 mt-5">
              <button className="h-9 px-3 rounded text-body-md hover:bg-surface-container" onClick={() => setShowPipelineModal(false)}>Cancel</button>
              <button
                className="h-9 px-4 rounded bg-primary text-white text-body-md font-semibold disabled:opacity-50"
                disabled={creatingPipeline || !newPipelineName.trim()}
                onClick={async () => {
                  setCreatingPipeline(true);
                  try {
                    const r = await fetch('/api/crm/pipelines', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newPipelineName.trim(), currency: 'USD' }) });
                    const j = await r.json();
                    if (!r.ok) { onToast(`Create failed: ${j?.error?.message || r.status}`); return; }
                    const pid = j.data.id as string;
                    const seed: [string, string, number][] = [
                      ['New', 'open', 10], ['Qualified', 'open', 25], ['Proposal', 'open', 50],
                      ['Negotiation', 'open', 75], ['Won', 'won', 100], ['Lost', 'lost', 0],
                    ];
                    for (let i = 0; i < seed.length; i++) {
                      const [name, kind, prob] = seed[i];
                      await fetch('/api/crm/pipeline-stages', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ pipeline_id: pid, name, stage_kind: kind, probability: prob, sort_order: (i + 1) * 10 }) });
                    }
                    onToast(`Pipeline "${newPipelineName.trim()}" created with 6 stages`);
                    setNewPipelineName('');
                    setShowPipelineModal(false);
                    refreshPipelines();
                    setPipelineId(pid);
                  } finally {
                    setCreatingPipeline(false);
                  }
                }}
              >
                {creatingPipeline ? 'Creating…' : 'Create pipeline'}
              </button>
            </div>
          </div>
        </div>
      )}

      {summary.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-3">
          {summary.filter(r => r.stage_id).map(r => (
            <span key={r.stage_id} className="text-[11px] bg-white border border-surface-dim rounded-full px-2.5 py-1">
              {r.stage}: <strong>{r.deals ?? 0}</strong> · {money(r.amount)}
            </span>
          ))}
        </div>
      )}

      {moveNote && (
        <div className="mb-3 rounded-lg border border-secondary bg-secondary-container/40 px-3 py-2 text-body-sm flex items-center justify-between">
          <span>{moveNote}</span>
          <button className="text-on-surface-variant hover:text-error" onClick={() => setMoveNote(null)} aria-label="Dismiss">
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>
      )}

      {stages.length === 0 ? (
        <div className="flex items-center justify-center h-64 text-on-surface-variant/60 text-body-sm">
          No pipeline stages yet. Create a pipeline and its stages to board deals here.
        </div>
      ) : (
        <div className="flex gap-2 flex-1 min-h-0">
          {stages.map(stage => {
            const stageDeals = deals.filter(d => d.stage_id === stage.id);
            return (
              <div
                key={stage.id}
                className="flex-1 min-w-0 bg-surface-container-low rounded-lg flex flex-col"
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); if (draggingId) { handleMove(draggingId, stage.id); setDraggingId(null); } }}
              >
                <div className="px-2 py-1.5 border-b border-surface-dim flex items-center justify-between">
                  <span className="text-label-md font-semibold truncate">{stage.name}</span>
                  <span className="text-label-sm text-on-surface-variant">{stageDeals.length}</span>
                </div>
                <div className="flex-1 overflow-y-auto p-1.5 space-y-1.5">
                  {stageDeals.map(deal => (
                    <div
                      key={deal.id}
                      draggable
                      onDragStart={e => { setDraggingId(deal.id); e.dataTransfer.effectAllowed = 'move'; }}
                      onClick={() => setSelectedDeal(deal)}
                      className="bg-white rounded border border-surface-dim p-1.5 cursor-move hover:shadow-sm text-body-sm"
                    >
                      <div className="font-medium text-[11px] truncate">{deal.name}</div>
                      <div className="flex items-center justify-between mt-0.5">
                        <span className="text-[11px] font-semibold tabular-nums">{money(deal.amount)}</span>
                        <span className="text-[10px] text-on-surface-variant">{deal.probability}%</span>
                      </div>
                      <div className="text-[10px] text-on-surface-variant truncate">{deal.deal_number} · {deal.status}</div>
                    </div>
                  ))}
                  {stageDeals.length === 0 && (
                    <div className="text-center text-[10px] text-on-surface-variant py-3">Drop deals here</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selectedDeal && (
        <DealHistoryDrawer
          deal={selectedDeal}
          stageName={stageName}
          onMove={(stageId) => handleMove(selectedDeal.id, stageId)}
          stages={stages}
          onClose={() => setSelectedDeal(null)}
        />
      )}
      {showCreate && activePipelineId && stages.length > 0 && (
        <CreateDealModal
          onToast={onToast}
          pipelineId={activePipelineId}
          stageId={stages[0].id}
          createDeal={createDeal}
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); refetchDeals(); }}
        />
      )}
    </main>
  );
}

function DealHistoryDrawer({
  deal,
  stageName,
  stages,
  onMove,
  onClose,
}: {
  deal: CrmDealRow;
  stageName: (id: string | null) => string;
  stages: { id: string; name: string }[];
  onMove: (stageId: string) => void;
  onClose: () => void;
}) {
  const { data: history } = useDealStageHistory(deal.id);
  return (
    <div className="modal-scrim open" onClick={onClose}>
      <div className="bg-white shadow-2xl h-full ml-auto p-5 overflow-y-auto" style={{ width: 420 }} onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between mb-1">
          <h3 className="text-headline-sm">{deal.name}</h3>
          <button className="text-on-surface-variant hover:text-error" onClick={onClose} aria-label="Close">
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>
        <p className="text-body-sm text-on-surface-variant mb-4">
          {deal.deal_number} · {money(deal.amount)} · {deal.probability}% · status {deal.status}
        </p>
        <label className="field-label">Move to stage</label>
        <select
          className="field-input mb-4"
          value={deal.stage_id || ''}
          onChange={e => { if (e.target.value) onMove(e.target.value); }}
        >
          {stages.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select>
        <h4 className="text-label-md font-semibold uppercase tracking-wide mb-2">Stage history</h4>
        {history.length === 0 && (
          <p className="text-body-sm text-on-surface-variant">No stage changes recorded yet. Moving this deal records who, when, from and to.</p>
        )}
        <div className="space-y-2">
          {history.map(h => (
            <div key={h.id} className="border border-surface-dim rounded-lg px-3 py-2 text-body-sm">
              <div className="font-medium">{stageName(h.from_stage_id)} → {stageName(h.to_stage_id)}</div>
              <div className="text-[11px] text-on-surface-variant">
                {new Date(h.changed_at).toLocaleString()}
                {h.days_in_from != null && <> · {h.days_in_from}d in previous stage</>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function CreateDealModal({
  onToast,
  pipelineId,
  stageId,
  createDeal,
  onClose,
  onCreated,
}: {
  onToast: (m: string) => void;
  pipelineId: string;
  stageId: string;
  createDeal: (input: Partial<CrmDealRow> & { name: string }) => Promise<any>;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    setSaving(true);
    const res = await createDeal({ name, amount: Number(amount) || 0, pipeline_id: pipelineId, stage_id: stageId });
    setSaving(false);
    if (res.ok) onCreated();
    else onToast(`Create failed: ${res.error}`);
  }

  return (
    <div className="modal-scrim open" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
        <h3 className="text-headline-sm mb-1">New deal</h3>
        <p className="text-body-sm text-on-surface-variant mb-4">Opens in the pipeline's first stage.</p>
        <div className="space-y-3">
          <div><label className="field-label">Deal name</label><input className="field-input" value={name} onChange={e => setName(e.target.value)} autoFocus /></div>
          <div><label className="field-label">Amount</label><input className="field-input" type="number" min="0" value={amount} onChange={e => setAmount(e.target.value)} /></div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={onClose}>Cancel</button>
          <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container disabled:opacity-40" onClick={handleCreate} disabled={!name || saving}>
            {saving ? 'Creating…' : 'Create deal'}
          </button>
        </div>
      </div>
    </div>
  );
}

function CreateLeadModal({ onToast, onClose, onCreated }: { onToast: (m: string) => void; onClose: () => void; onCreated: () => void }) {
  const { createLead } = useCrmMutations(onToast);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [source, setSource] = useState('manual');
  const [saving, setSaving] = useState(false);

  async function handleCreate() {
    setSaving(true);
    try {
      await createLead({ contact_name: name, email, phone, lead_source: source, lead_type: 'retail', status: 'new' });
      onCreated();
    } catch (e: any) {
      onToast(`Error: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-scrim open" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5" onClick={e => e.stopPropagation()}>
        <h3 className="text-headline-sm mb-1">Add lead</h3>
        <p className="text-body-sm text-on-surface-variant mb-4">Creates a record in Supabase crm_leads.</p>
        <div className="space-y-3">
          <div><label className="field-label">Contact name</label><input className="field-input" value={name} onChange={e => setName(e.target.value)} autoFocus /></div>
          <div><label className="field-label">Email</label><input className="field-input" type="email" value={email} onChange={e => setEmail(e.target.value)} /></div>
          <div><label className="field-label">Phone</label><input className="field-input" value={phone} onChange={e => setPhone(e.target.value)} /></div>
          <div>
            <label className="field-label">Lead source</label>
            <select className="field-input" value={source} onChange={e => setSource(e.target.value)}>
              <option value="manual">Manual</option>
              <option value="website">Website</option>
              <option value="referral">Referral</option>
              <option value="social_media">Social media</option>
              <option value="google">Google</option>
              <option value="campaign">Campaign</option>
            </select>
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={onClose}>Cancel</button>
          <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container disabled:opacity-40" onClick={handleCreate} disabled={!name || saving}>
            {saving ? 'Creating…' : 'Create lead'}
          </button>
        </div>
      </div>
    </div>
  );
}
