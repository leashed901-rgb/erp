'use client';
/**
 * LeadsPipelineSupabase — Leads pipeline screen wired to Supabase.
 * Reads from crm_leads table via /api/crm/leads.
 * Kanban-style pipeline board + list view. Lead→Customer conversion.
 *
 * Scoring rules live INLINE on this surface (not a separate sidebar item):
 * a "Scoring rules" flyout opens from the header, and each lead card shows
 * its score badge + a rescore button.
 */
import { useState } from 'react';
import { useCrmLeads, useCrmMutations, useScoringRules, type CrmLead, type ScoringRule } from '@/hooks/useCrmApi';

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

/** Score badge color by band (hot/warm/cold). */
function scoreBadgeClass(score: number | undefined | null): string {
  if (score == null) return 'bg-surface-container-high text-on-surface-variant';
  if (score >= 70) return 'bg-error/15 text-error';
  if (score >= 40) return 'bg-qb-maroon/15 text-qb-maroon';
  return 'bg-surface-container-high text-on-surface-variant';
}

export default function LeadsPipelineSupabase({ onToast }: LeadsPipelineProps) {
  const { data: leads, loaded, refresh: refetch } = useCrmLeads();
  const { updateLead, deleteLead, createLead, convertLead, rescoreLead, createScoringRule, deleteScoringRule } = useCrmMutations(onToast);
  // Scoring rules live inline now — fetched on this surface, not a separate screen.
  const { data: scoringRules, refresh: refetchRules } = useScoringRules();
  const [view, setView] = useState<'board' | 'list'>('board');
  const [showCreate, setShowCreate] = useState(false);
  const [showScoringPanel, setShowScoringPanel] = useState(false);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [rescoringId, setRescoringId] = useState<string | null>(null);

  // New-rule form state (inline on the scoring flyout)
  const [ruleField, setRuleField] = useState('has_email');
  const [ruleOperator, setRuleOperator] = useState('is_set');
  const [rulePoints, setRulePoints] = useState('10');
  const [ruleValue, setRuleValue] = useState('');
  const [savingRule, setSavingRule] = useState(false);

  const leadsByStage = (stageId: string) => leads.filter(l => l.status === stageId);

  async function handleStageChange(id: string, newStatus: string) {
    try {
      const result = await updateLead(id, { status: newStatus });
      if (newStatus === 'converted' && (result as any).converted_customer) {
        onToast(`Lead converted → customer "${(result as any).converted_customer.first_name || (result as any).converted_customer.company_name}" created`);
      } else {
        onToast(`Lead moved to ${newStatus}`);
      }
      refetch();
    } catch (e: any) {
      onToast(`Error: ${e.message}`);
    }
  }

  async function handleConvert(id: string) {
    setConvertingId(id);
    try {
      const res = await convertLead(id);
      if (res.ok) refetch();
    } finally {
      setConvertingId(null);
    }
  }

  async function handleRescore(id: string) {
    setRescoringId(id);
    try {
      const res = await rescoreLead(id);
      if (res.ok) {
        const score = (res as any).data?.score;
        if (typeof score === 'number') onToast(`Lead rescored → ${score}/100`);
        refetch();
      }
    } finally {
      setRescoringId(null);
    }
  }

  async function handleAddRule() {
    setSavingRule(true);
    const res = await createScoringRule({
      field: ruleField,
      operator: ruleOperator,
      value: ruleValue || null,
      points: Number(rulePoints) || 0,
    });
    setSavingRule(false);
    if (res.ok) {
      setRuleValue('');
      setRulePoints('10');
      refetchRules();
    }
  }

  async function handleDeleteRule(id: string) {
    const res = await deleteScoringRule(id);
    if (res.ok) refetchRules();
  }

  async function handleDelete(id: string) {
    try {
      await deleteLead(id);
      onToast('Lead deleted');
      refetch();
    } catch (e: any) { onToast(`Error: ${e.message}`); }
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

  return (
    <main className="px-6 pb-12 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between py-4">
        <div>
          <h1 className="text-headline-lg">Leads</h1>
          <p className="text-body-sm text-on-surface-variant mt-0.5">From Supabase crm_leads · {totalLeads} leads · {conversionRate}% conversion · {scoringRules.length} scoring rules</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Scoring rules — INLINE flyout (not a separate sidebar item) */}
          <button
            className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1"
            onClick={() => setShowScoringPanel(v => !v)}
            title="Configure lead scoring rules"
          >
            <span className="material-symbols-outlined text-[16px]">analytics</span>Scoring
          </button>
          <div className="flex border border-surface-dim rounded overflow-hidden">
            <button className={`h-8 px-3 text-body-md ${view === 'board' ? 'bg-primary text-white' : 'hover:bg-surface-container-low'}`} onClick={() => setView('board')}>Board</button>
            <button className={`h-8 px-3 text-body-md ${view === 'list' ? 'bg-primary text-white' : 'hover:bg-surface-container-low'}`} onClick={() => setView('list')}>List</button>
          </div>
          <button className="h-8 px-3 bg-primary text-white text-body-md font-semibold rounded hover:bg-primary-container flex items-center gap-1" onClick={() => setShowCreate(true)}>
            <span className="material-symbols-outlined text-[16px]">add</span>New lead
          </button>
        </div>
      </div>

      {/* INLINE Scoring rules flyout — opens on this surface */}
      {showScoringPanel && (
        <div className="bg-white rounded-xl border border-surface-dim overflow-hidden mb-4">
          <div className="px-4 py-3 border-b border-surface-dim flex items-center justify-between bg-surface-container-low">
            <div>
              <h2 className="text-headline-sm">Lead scoring rules</h2>
              <p className="text-[11px] text-on-surface-variant">Each rule adds or subtracts points from a lead&apos;s score. {scoringRules.length} rule{scoringRules.length === 1 ? '' : 's'} active.</p>
            </div>
            <button className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center" onClick={() => setShowScoringPanel(false)}>
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
          <div className="p-4">
            {/* Add-rule form */}
            <div className="flex items-end gap-2 flex-wrap mb-4 p-3 border border-dashed border-surface-dim rounded-lg">
              <div className="flex-1 min-w-[140px]">
                <label className="field-label">Field</label>
                <select className="field-input" value={ruleField} onChange={(e) => setRuleField(e.target.value)}>
                  <option value="has_email">Has email</option>
                  <option value="has_phone">Has phone</option>
                  <option value="inbound">Inbound lead</option>
                  <option value="engaged_7d">Engaged in 7 days</option>
                  <option value="stale">Stale (no activity 30d)</option>
                  <option value="source_equals">Source equals</option>
                  <option value="lead_type">Lead type equals</option>
                </select>
              </div>
              <div className="w-28">
                <label className="field-label">Operator</label>
                <select className="field-input" value={ruleOperator} onChange={(e) => setRuleOperator(e.target.value)}>
                  <option value="is_set">is set</option>
                  <option value="is_not_set">is not set</option>
                  <option value="eq">=</option>
                  <option value="ne">≠</option>
                  <option value="gt">&gt;</option>
                  <option value="lt">&lt;</option>
                  <option value="contains">contains</option>
                </select>
              </div>
              <div className="flex-1 min-w-[120px]">
                <label className="field-label">Value</label>
                <input className="field-input" value={ruleValue} onChange={(e) => setRuleValue(e.target.value)} placeholder="(blank for is_set)" disabled={ruleOperator === 'is_set' || ruleOperator === 'is_not_set'} />
              </div>
              <div className="w-20">
                <label className="field-label">Points</label>
                <input className="field-input" type="number" value={rulePoints} onChange={(e) => setRulePoints(e.target.value)} />
              </div>
              <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container disabled:opacity-40 flex items-center gap-1" onClick={handleAddRule} disabled={savingRule}>
                <span className="material-symbols-outlined text-[16px]">add</span>{savingRule ? '…' : 'Add rule'}
              </button>
            </div>
            {/* Rules list */}
            <table className="w-full text-left text-body-sm">
              <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider">
                <tr>
                  <th className="px-3 py-2">Active</th>
                  <th className="px-3 py-2">Field</th>
                  <th className="px-3 py-2">Op</th>
                  <th className="px-3 py-2">Value</th>
                  <th className="px-3 py-2 text-right">Points</th>
                  <th className="w-8 px-2 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-dim">
                {scoringRules.map((r: ScoringRule) => (
                  <tr key={r.id} className="hover:bg-surface-container-low">
                    <td className="px-3 py-2">
                      <span className={`w-9 h-5 rounded-full relative inline-block ${r.is_active ? 'bg-primary' : 'bg-surface-dim'}`}>
                        <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${r.is_active ? 'left-[18px]' : 'left-0.5'}`} />
                      </span>
                    </td>
                    <td className="px-3 py-2 font-medium">{r.field}</td>
                    <td className="px-3 py-2 text-on-surface-variant">{r.operator}</td>
                    <td className="px-3 py-2 text-on-surface-variant">{r.value || '—'}</td>
                    <td className={`px-3 py-2 text-right tabular-nums font-semibold ${r.points >= 0 ? 'text-secondary' : 'text-error'}`}>{r.points >= 0 ? '+' : ''}{r.points}</td>
                    <td className="px-2 py-2">
                      <button className="text-on-surface-variant hover:text-error" onClick={() => handleDeleteRule(r.id)} title="Delete rule">
                        <span className="material-symbols-outlined text-[16px]">delete</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* KPI strip */}
      <div className="grid grid-cols-4 gap-3 mb-4">
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

      {!loaded && leads.length === 0 ? (
        <div className="flex items-center justify-center h-64 text-on-surface-variant/60 text-body-sm">
          Fetching leads from Supabase…
        </div>
      ) : view === 'board' ? (
        /* KANBAN BOARD — fit-to-screen: columns share viewport width, cards shrink */
        <div className="flex gap-2 flex-1 pb-3 min-h-0 overflow-hidden">
          {PIPELINE_STAGES.map(stage => {
            const stageLeads = leadsByStage(stage.id);
            return (
              <div
                key={stage.id}
                className="flex-1 min-w-[140px] max-w-[280px] bg-surface-container-low rounded-lg flex flex-col"
                onDragOver={e => e.preventDefault()}
                onDrop={e => onDrop(e, stage.id)}
              >
                <div className="px-3 py-2 border-b border-surface-dim flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${stage.color}`}></span>
                    <span className="text-label-md font-semibold">{stage.label}</span>
                  </div>
                  <span className="text-label-sm text-on-surface-variant">{stageLeads.length}</span>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {stageLeads.map(lead => (
                    <div
                      key={lead.id}
                      draggable
                      onDragStart={e => onDragStart(e, lead.id)}
                      className="bg-white rounded border border-surface-dim p-2 cursor-move hover:shadow-sm text-body-sm"
                    >
                      <div className="flex items-start justify-between mb-1">
                        <div className="flex items-center gap-1.5">
                          <div className="avatar w-6 h-6 rounded-full bg-surface-container flex items-center justify-center text-[10px] font-bold">{initials(lead.contact_name)}</div>
                          <div className="font-medium text-[12px] truncate">{lead.contact_name || 'Unnamed'}</div>
                        </div>
                        <button className="text-on-surface-variant hover:text-error" onClick={() => handleDelete(lead.id)} title="Delete lead">
                          <span className="material-symbols-outlined text-[14px]">close</span>
                        </button>
                      </div>
                      <div className="text-[11px] text-on-surface-variant truncate">{lead.email || '—'}</div>
                      {lead.lead_source && (
                        <div className="mt-1">
                          <span className="pill info" style={{ fontSize: 9, padding: '1px 5px' }}>{lead.lead_source}</span>
                        </div>
                      )}
                      {lead.status === 'converted' && lead.customer_id && (
                        <button className="mt-1 text-[10px] text-primary hover:underline" onClick={() => onToast(`Converted to customer ${String(lead.customer_id).slice(0, 8)}`)}>
                          View customer →
                        </button>
                      )}
                      {lead.status !== 'converted' && (
                        <div className="mt-1.5 flex items-center gap-1">
                          <button
                            className="flex-1 h-6 px-2 rounded bg-primary text-white text-[10px] font-bold hover:bg-primary-container disabled:opacity-40 flex items-center justify-center gap-0.5"
                            onClick={(e) => { e.stopPropagation(); handleConvert(lead.id); }}
                            disabled={convertingId === lead.id}
                            title="Convert this lead to a customer"
                          >
                            <span className="material-symbols-outlined text-[12px]">person_add</span>
                            {convertingId === lead.id ? '…' : 'Convert to customer'}
                          </button>
                          <button
                            className="h-6 w-6 rounded bg-surface-container-high text-on-surface-variant hover:bg-surface-dim disabled:opacity-40 flex items-center justify-center"
                            onClick={(e) => { e.stopPropagation(); handleRescore(lead.id); }}
                            disabled={rescoringId === lead.id}
                            title="Recalculate lead score"
                          >
                            <span className="material-symbols-outlined text-[12px]">analytics</span>
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                  {stageLeads.length === 0 && (
                    <div className="text-center text-[11px] text-on-surface-variant py-4">Drop leads here</div>
                  )}
                </div>
                {stage.id !== 'converted' && stage.id !== 'lost' && (
                  <div className="px-2 py-1 border-t border-surface-dim">
                    <select
                      className="w-full h-6 text-[11px] border-0 bg-transparent text-on-surface-variant focus:outline-none cursor-pointer"
                      value=""
                      onChange={e => { if (e.target.value) handleStageChange('', e.target.value); }}
                    >
                      <option value="">+ Move lead here…</option>
                      {leads.filter(l => l.status !== stage.id).map(l => (
                        <option key={l.id} value={stage.id} onClick={() => handleStageChange(l.id, stage.id)}>{l.contact_name || l.email}</option>
                      ))}
                    </select>
                  </div>
                )}
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
                <th className="px-3 py-2">First contact</th>
                <th className="px-3 py-2">Last activity</th>
                <th className="px-3 py-2">Actions</th>
                <th className="px-2 py-2 w-8"></th>
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
                  <td className="px-3 py-2 text-[11px]">{lead.first_contact_at?.slice(0, 10) || '—'}</td>
                  <td className="px-3 py-2 text-[11px]">{lead.last_activity_at?.slice(0, 10) || '—'}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                      {lead.status !== 'converted' ? (
                        <>
                          <button
                            className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary hover:bg-primary/20 disabled:opacity-40 flex items-center gap-0.5"
                            onClick={() => handleConvert(lead.id)}
                            disabled={convertingId === lead.id}
                            title="Convert to customer"
                          >
                            <span className="material-symbols-outlined text-[10px]">person_add</span>{convertingId === lead.id ? '…' : 'Convert'}
                          </button>
                          <button
                            className="text-[10px] px-1.5 py-0.5 rounded bg-surface-container-high text-on-surface-variant hover:bg-surface-dim disabled:opacity-40 flex items-center gap-0.5"
                            onClick={() => handleRescore(lead.id)}
                            disabled={rescoringId === lead.id}
                            title="Recalculate score"
                          >
                            <span className="material-symbols-outlined text-[10px]">analytics</span>{rescoringId === lead.id ? '…' : 'Score'}
                          </button>
                        </>
                      ) : (
                        <span className="text-[10px] text-secondary">converted</span>
                      )}
                    </div>
                  </td>
                  <td className="px-2 py-2">
                    <button className="text-on-surface-variant hover:text-error" onClick={() => handleDelete(lead.id)}>
                      <span className="material-symbols-outlined text-[16px]">delete</span>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create lead modal */}
      {showCreate && <CreateLeadModal onToast={onToast} onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); refetch(); }} />}
    </main>
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
      onToast(`Lead "${name}" created in Supabase`);
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
