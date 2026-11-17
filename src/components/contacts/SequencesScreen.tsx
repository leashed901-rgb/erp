'use client';
/**
 * SequencesScreen — Contacts / CRM / Sequences, built to Kim's
 * crm_sequences template. Automated follow-up flows over
 * crm_sequences + crm_sequence_steps + crm_sequence_enrollments:
 * KPIs, the sequence list with activate/pause/duplicate, a steps
 * editor, party enrollment (through the enrollment endpoint that
 * performs the platform RPC's checks), and the enrollments tab
 * with pause/resume/advance/remove.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';

interface SequenceRow {
  id: string; name: string; purpose: string; is_active: boolean;
  stop_on_reply: boolean; send_window_start: string; send_window_end: string;
  timezone: string; weekdays_only: boolean; created_at: string;
}
interface StepRow {
  id: string; sequence_id: string; step_no: number; delay_days: number;
  step_type: string; subject: string | null; body: string | null; task_title: string | null;
}
interface EnrollmentRow {
  id: string; sequence_id: string; sequence_name: string | null;
  party_name: string; party_kind: string | null; email: string | null;
  current_step: number; status: string; next_run_at: string | null; enrolled_at: string;
}
interface PartyOption { id: string; name: string; email: string | null; source: string }

async function api<T>(url: string, init?: RequestInit): Promise<T | null> {
  try {
    const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error?.message || `HTTP ${res.status}`);
    return json.data as T;
  } catch {
    return null;
  }
}
async function apiErr(url: string, init?: RequestInit): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init });
    const json = await res.json();
    if (!res.ok) return { ok: false, error: json?.error?.message || `HTTP ${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : 'Request failed' };
  }
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function SequencesScreen({ onToast, onNavigate }: { onToast: (m: string) => void; onNavigate?: (d: string, s: string) => void }) {
  const [tab, setTab] = useState<'sequences' | 'enrollments'>('sequences');
  const [sequences, setSequences] = useState<SequenceRow[]>([]);
  const [stepsBySeq, setStepsBySeq] = useState<Map<string, StepRow[]>>(new Map());
  const [enrollments, setEnrollments] = useState<EnrollmentRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  // Editor drawer
  const [editorOpen, setEditorOpen] = useState(false);
  const [editSeq, setEditSeq] = useState<SequenceRow | null>(null);
  const [editName, setEditName] = useState('');
  const [editPurpose, setEditPurpose] = useState('marketing');
  const [editStopOnReply, setEditStopOnReply] = useState(true);
  const [newStepType, setNewStepType] = useState('email');
  const [newStepDelay, setNewStepDelay] = useState('0');
  const [newStepSubject, setNewStepSubject] = useState('');

  // Enroll drawer
  const [enrollSeq, setEnrollSeq] = useState<SequenceRow | null>(null);
  const [partyOptions, setPartyOptions] = useState<PartyOption[]>([]);
  const [enrollPartyId, setEnrollPartyId] = useState('');

  const refresh = useCallback(async () => {
    const [seqs, enrolls] = await Promise.all([
      api<SequenceRow[]>('/api/crm/sequences'),
      api<EnrollmentRow[]>('/api/crm/sequence-enrollments'),
    ]);
    setSequences(seqs || []);
    setEnrollments(enrolls || []);
    if (seqs) {
      const map = new Map<string, StepRow[]>();
      await Promise.all(seqs.map(async s => {
        const steps = await api<StepRow[]>(`/api/crm/sequence-steps?sequence_id=${s.id}`);
        map.set(s.id, steps || []);
      }));
      setStepsBySeq(map);
    }
    setLoaded(true);
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  const activeCount = sequences.filter(s => s.is_active).length;
  const inFlight = enrollments.filter(e => e.status === 'active' || e.status === 'paused').length;
  const completed30 = enrollments.filter(e => e.status === 'completed').length;
  const replied = enrollments.filter(e => e.status === 'replied').length;
  const replyRate = enrollments.length > 0 ? Math.round((replied / enrollments.length) * 100) : 0;

  async function toggleActive(s: SequenceRow) {
    setBusy(`toggle-${s.id}`);
    const res = await apiErr(`/api/crm/sequences/${s.id}`, { method: 'PATCH', body: JSON.stringify({ is_active: !s.is_active }) });
    setBusy(null);
    if (!res.ok) { onToast(`Failed: ${res.error}`); return; }
    onToast(s.is_active ? `Sequence "${s.name}" paused` : `Sequence "${s.name}" activated`);
    void refresh();
  }

  async function duplicate(s: SequenceRow) {
    setBusy(`dup-${s.id}`);
    const created = await api<SequenceRow>('/api/crm/sequences', {
      method: 'POST',
      body: JSON.stringify({ name: `${s.name} (copy)`, purpose: s.purpose, stop_on_reply: s.stop_on_reply, send_window_start: s.send_window_start, send_window_end: s.send_window_end, timezone: s.timezone, weekdays_only: s.weekdays_only }),
    });
    if (created) {
      const steps = stepsBySeq.get(s.id) || [];
      for (const step of steps) {
        await api('/api/crm/sequence-steps', {
          method: 'POST',
          body: JSON.stringify({ sequence_id: created.id, step_no: step.step_no, step_type: step.step_type, delay_days: step.delay_days, subject: step.subject, body: step.body, task_title: step.task_title }),
        });
      }
      onToast(`Sequence duplicated as "${created.name}"`);
    } else {
      onToast('Duplicate failed');
    }
    setBusy(null);
    void refresh();
  }

  function openEditor(s: SequenceRow | null) {
    setEditorOpen(true);
    setEditSeq(s);
    setEditName(s?.name || '');
    setEditPurpose(s?.purpose || 'marketing');
    setEditStopOnReply(s?.stop_on_reply ?? true);
  }

  async function saveEditor() {
    if (!editName.trim()) { onToast('Name is required'); return; }
    setBusy('save-seq');
    if (editSeq) {
      const res = await apiErr(`/api/crm/sequences/${editSeq.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: editName.trim(), stop_on_reply: editStopOnReply }),
      });
      setBusy(null);
      if (!res.ok) { onToast(`Save failed: ${res.error}`); return; }
      onToast('Sequence saved');
    } else {
      const created = await api<SequenceRow>('/api/crm/sequences', {
        method: 'POST',
        body: JSON.stringify({ name: editName.trim(), purpose: editPurpose, stop_on_reply: editStopOnReply }),
      });
      setBusy(null);
      if (!created) { onToast('Create failed'); return; }
      onToast(`Sequence "${created.name}" created`);
      setEditSeq(created);
    }
    void refresh();
  }

  async function addStep() {
    if (!editSeq) { onToast('Save the sequence first, then add steps'); return; }
    const steps = stepsBySeq.get(editSeq.id) || [];
    setBusy('add-step');
    const res = await apiErr('/api/crm/sequence-steps', {
      method: 'POST',
      body: JSON.stringify({
        sequence_id: editSeq.id,
        step_no: steps.length + 1,
        step_type: newStepType,
        delay_days: Number(newStepDelay) || 0,
        subject: newStepType === 'email' ? newStepSubject || null : null,
        task_title: newStepType === 'task' ? newStepSubject || null : null,
      }),
    });
    setBusy(null);
    if (!res.ok) { onToast(`Add step failed: ${res.error}`); return; }
    setNewStepSubject('');
    void refresh();
  }

  async function deleteStep(step: StepRow) {
    setBusy(`step-${step.id}`);
    await apiErr(`/api/crm/sequence-steps/${step.id}`, { method: 'DELETE' });
    setBusy(null);
    void refresh();
  }

  async function openEnroll(s: SequenceRow) {
    setEnrollSeq(s);
    setEnrollPartyId('');
    const [customers, leads] = await Promise.all([
      api<{ id: string; name: string; email: string | null; source: string }[]>('/api/parties?role=customer'),
      api<{ id: string; contact_name: string | null; company_name: string | null; email: string | null }[]>('/api/crm/leads'),
    ]);
    const opts: PartyOption[] = [
      ...(customers || []).map(p => ({ ...p, source: 'crm_customers' })),
      ...(leads || []).filter(l => l.contact_name || l.email).map(l => ({
        id: l.id,
        name: l.contact_name || l.company_name || l.email || 'Lead',
        email: l.email,
        source: 'crm_leads',
      })),
    ];
    setPartyOptions(opts);
  }

  async function submitEnroll() {
    if (!enrollSeq || !enrollPartyId) { onToast('Pick a party to enroll'); return; }
    const party = partyOptions.find(p => p.id === enrollPartyId);
    if (!party) return;
    setBusy('enroll');
    const res = await apiErr(`/api/marketing/sequences/${enrollSeq.id}/enroll`, {
      method: 'POST',
      body: JSON.stringify(party.source === 'crm_leads' ? { leadId: party.id } : { customerId: party.id }),
    });
    setBusy(null);
    if (!res.ok) { onToast(`Enroll failed: ${res.error}`); return; }
    onToast(`${party.name} enrolled in "${enrollSeq.name}"`);
    setEnrollSeq(null);
    void refresh();
  }

  async function enrollmentAction(e: EnrollmentRow, action: 'pause' | 'resume' | 'advance' | 'remove') {
    setBusy(`enr-${e.id}`);
    const res = await apiErr(`/api/crm/sequence-enrollments/${e.id}`, { method: 'PATCH', body: JSON.stringify({ action }) });
    setBusy(null);
    if (!res.ok) { onToast(`Failed: ${res.error}`); return; }
    onToast(action === 'advance' ? 'Advanced to next step' : action === 'remove' ? 'Removed from sequence' : `Enrollment ${action}d`);
    void refresh();
  }

  const editSteps = editSeq ? (stepsBySeq.get(editSeq.id) || []) : [];

  return (
    <main className="px-6 pb-12 flex flex-col h-full overflow-y-auto">
      <div className="flex items-center gap-2 text-label-sm text-on-surface-variant mt-4 mb-2">
        <span>Contacts / CRM</span><span className="text-outline">/</span>
        <span className="text-on-surface font-semibold">Sequences</span>
      </div>
      <div className="flex items-start justify-between gap-4 py-3 mb-4 flex-wrap">
        <div>
          <h1 className="text-headline-lg flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">alt_route</span>Sequences
          </h1>
          <p className="text-body-sm text-on-surface-variant mt-0.5">Automated follow-up flows — trigger, wait, act, exit. Track every enrolled party.</p>
        </div>
        <div className="flex items-center gap-2">
          <button className="h-8 px-3 bg-white text-on-surface border border-surface-dim text-body-md font-semibold hover:bg-surface-container-low flex items-center gap-1" disabled={busy === 'process'} onClick={async () => {
            setBusy('process');
            try {
              const res = await fetch('/api/marketing/sequences/process', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ limit: 50 }) });
              const json = await res.json();
              if (!res.ok) { onToast(`Process failed: ${json?.error?.message || `HTTP ${res.status}`}`); return; }
              const d = json.data as { processed: { outcome: string }[]; enqueued: number; delivered: number; failed: number };
              const sent = (d.processed || []).filter((p) => p.outcome === 'email_sent').length;
              const tasks = (d.processed || []).filter((p) => p.outcome === 'task_created').length;
              onToast(d.processed.length === 0 ? 'Nothing due — no enrollment step was ready.' : `Processed ${d.processed.length} step${d.processed.length === 1 ? '' : 's'}: ${sent} email${sent === 1 ? '' : 's'} sent, ${tasks} task${tasks === 1 ? '' : 's'} created, ${d.delivered} delivered, ${d.failed} failed.`);
              await refresh();
            } catch (e) {
              onToast(`Process failed: ${e instanceof Error ? e.message : 'request failed'}`);
            } finally {
              setBusy(null);
            }
          }}>
            <span className="material-symbols-outlined text-[16px]">play_arrow</span>{busy === 'process' ? 'Processing…' : 'Process due steps'}
          </button>
          <button className="h-8 px-3 bg-primary text-white text-body-md font-semibold hover:bg-primary-container flex items-center gap-1" onClick={() => openEditor(null)}>
            <span className="material-symbols-outlined text-[16px]">add</span>New sequence
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
        {[
          { label: 'Active sequences', value: String(activeCount), sub: 'Running right now' },
          { label: 'Enrolled parties', value: String(inFlight), sub: 'In-flight' },
          { label: 'Completed', value: String(completed30), sub: 'Finished flow' },
          { label: 'Reply rate', value: `${replyRate}%`, sub: 'Sequenced emails with reply' },
        ].map(k => (
          <div key={k.label} className="bg-white rounded-xl border border-surface-dim p-3">
            <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">{k.label}</div>
            <div className="text-headline-sm mt-1 tabular-nums">{loaded ? k.value : '—'}</div>
            <div className="text-[11px] text-on-surface-variant mt-0.5">{k.sub}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-1 border-b border-surface-dim mb-4">
        <button className={`h-9 px-3 text-body-md border-b-2 -mb-px flex items-center gap-1.5 ${tab === 'sequences' ? 'border-primary text-primary font-semibold' : 'border-transparent text-on-surface-variant'}`} onClick={() => setTab('sequences')}>
          <span className="material-symbols-outlined text-[17px]">alt_route</span>Sequences
        </button>
        <button className={`h-9 px-3 text-body-md border-b-2 -mb-px flex items-center gap-1.5 ${tab === 'enrollments' ? 'border-primary text-primary font-semibold' : 'border-transparent text-on-surface-variant'}`} onClick={() => setTab('enrollments')}>
          <span className="material-symbols-outlined text-[17px]">group</span>Enrollments
        </button>
      </div>

      {tab === 'sequences' && (
        <div className="bg-white rounded-xl border border-surface-dim overflow-hidden">
          {sequences.length === 0 ? (
            <div className="py-12 text-center text-body-sm text-on-surface-variant">{loaded ? 'No sequences yet — create the first one.' : 'Loading…'}</div>
          ) : (
            <table className="w-full text-left text-body-sm">
              <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider">
                <tr><th className="px-3 py-2">Sequence</th><th className="px-3 py-2">Purpose</th><th className="px-3 py-2">State</th><th className="px-3 py-2">Steps</th><th className="px-3 py-2">Enrolled</th><th className="px-3 py-2"></th></tr>
              </thead>
              <tbody className="divide-y divide-surface-dim">
                {sequences.map(s => (
                  <tr key={s.id} className="hover:bg-surface-container-low">
                    <td className="px-3 py-2 font-medium">{s.name}</td>
                    <td className="px-3 py-2">{s.purpose}</td>
                    <td className="px-3 py-2"><span className={`pill ${s.is_active ? 'status role customer' : 'tag'}`}>{s.is_active ? 'active' : 'paused'}</span></td>
                    <td className="px-3 py-2 tabular-nums">{(stepsBySeq.get(s.id) || []).length}</td>
                    <td className="px-3 py-2 tabular-nums">{enrollments.filter(e => e.sequence_id === s.id && (e.status === 'active' || e.status === 'paused')).length}</td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1.5 justify-end flex-wrap">
                        <button className="h-7 px-2 border border-surface-dim rounded text-label-sm font-medium hover:bg-surface-container-low disabled:opacity-40" disabled={busy === `toggle-${s.id}`} onClick={() => void toggleActive(s)}>
                          {s.is_active ? 'Pause' : 'Activate'}
                        </button>
                        <button className="h-7 px-2 border border-surface-dim rounded text-label-sm font-medium hover:bg-surface-container-low" onClick={() => openEditor(s)}>Edit</button>
                        <button className="h-7 px-2 border border-surface-dim rounded text-label-sm font-medium hover:bg-surface-container-low" onClick={() => void openEnroll(s)}>Enroll parties</button>
                        <button className="h-7 px-2 border border-surface-dim rounded text-label-sm font-medium hover:bg-surface-container-low disabled:opacity-40" disabled={busy === `dup-${s.id}`} onClick={() => void duplicate(s)}>Duplicate</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'enrollments' && (
        <div className="bg-white rounded-xl border border-surface-dim overflow-hidden">
          {enrollments.length === 0 ? (
            <div className="py-12 text-center text-body-sm text-on-surface-variant">{loaded ? 'No enrollments yet.' : 'Loading…'}</div>
          ) : (
            <table className="w-full text-left text-body-sm">
              <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider">
                <tr><th className="px-3 py-2">Party</th><th className="px-3 py-2">Sequence</th><th className="px-3 py-2">Step</th><th className="px-3 py-2">Status</th><th className="px-3 py-2">Next run</th><th className="px-3 py-2">Enrolled</th><th className="px-3 py-2"></th></tr>
              </thead>
              <tbody className="divide-y divide-surface-dim">
                {enrollments.map(e => (
                  <tr key={e.id} className="hover:bg-surface-container-low">
                    <td className="px-3 py-2 font-medium">{e.party_name}<div className="text-[11px] text-on-surface-variant font-normal">{e.email || e.party_kind || ''}</div></td>
                    <td className="px-3 py-2">{e.sequence_name || '—'}</td>
                    <td className="px-3 py-2 tabular-nums">{e.current_step} of {(stepsBySeq.get(e.sequence_id) || []).length || '—'}</td>
                    <td className="px-3 py-2"><span className={`pill ${e.status === 'active' ? 'status role customer' : e.status === 'completed' ? 'info' : 'tag'}`}>{e.status}</span></td>
                    <td className="px-3 py-2 text-[12px]">{e.next_run_at ? fmtDate(e.next_run_at) : '—'}</td>
                    <td className="px-3 py-2 text-[12px]">{fmtDate(e.enrolled_at)}</td>
                    <td className="px-3 py-2">
                      {(e.status === 'active' || e.status === 'paused') && (
                        <div className="flex gap-1.5 justify-end flex-wrap">
                          {e.status === 'active' && <button className="h-7 px-2 border border-surface-dim rounded text-label-sm font-medium hover:bg-surface-container-low disabled:opacity-40" disabled={busy === `enr-${e.id}`} onClick={() => void enrollmentAction(e, 'pause')}>Pause</button>}
                          {e.status === 'paused' && <button className="h-7 px-2 border border-surface-dim rounded text-label-sm font-medium hover:bg-surface-container-low disabled:opacity-40" disabled={busy === `enr-${e.id}`} onClick={() => void enrollmentAction(e, 'resume')}>Resume</button>}
                          <button className="h-7 px-2 border border-surface-dim rounded text-label-sm font-medium hover:bg-surface-container-low disabled:opacity-40" disabled={busy === `enr-${e.id}`} onClick={() => void enrollmentAction(e, 'advance')}>Advance</button>
                          <button className="h-7 px-2 border border-error text-error rounded text-label-sm font-medium hover:bg-error/5 disabled:opacity-40" disabled={busy === `enr-${e.id}`} onClick={() => void enrollmentAction(e, 'remove')}>Remove</button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Editor drawer */}
      <SequenceEditor
        open={editorOpen}
        onClose={() => { setEditorOpen(false); setEditSeq(null); setEditName(''); }}
        name={editName} setName={setEditName}
        purpose={editPurpose} setPurpose={setEditPurpose}
        stopOnReply={editStopOnReply} setStopOnReply={setEditStopOnReply}
        isNew={!editSeq}
        steps={editSteps}
        newStepType={newStepType} setNewStepType={setNewStepType}
        newStepDelay={newStepDelay} setNewStepDelay={setNewStepDelay}
        newStepSubject={newStepSubject} setNewStepSubject={setNewStepSubject}
        onSave={() => void saveEditor()}
        onAddStep={() => void addStep()}
        onDeleteStep={(st) => void deleteStep(st)}
        busy={busy}
      />

      {/* Enroll drawer */}
      {enrollSeq && (
        <>
          <div className="drawer-scrim open" onClick={() => setEnrollSeq(null)} />
          <div className="drawer open" style={{ width: 420 }}>
            <div className="flex items-center justify-between px-6 h-14 border-b border-surface-dim shrink-0">
              <h3 className="text-[16px] font-semibold">Enroll parties — {enrollSeq.name}</h3>
              <button className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center" onClick={() => setEnrollSeq(null)}>
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div>
                <label className="field-label">Party (customer or lead)</label>
                <select className="field-input" value={enrollPartyId} onChange={e => setEnrollPartyId(e.target.value)}>
                  <option value="">Select a party…</option>
                  {partyOptions.map(p => (
                    <option key={`${p.source}-${p.id}`} value={p.id}>{p.name} · {p.source === 'crm_leads' ? 'lead' : 'customer'}{p.email ? ` · ${p.email}` : ''}</option>
                  ))}
                </select>
              </div>
              <p className="text-[12px] text-on-surface-variant">Enrollment checks run server-side: the sequence must be active, do-not-contact and marketing opt-in are respected, and suppressed addresses are refused.</p>
            </div>
            <div className="px-6 py-4 border-t border-surface-dim flex justify-end gap-2 shrink-0">
              <button className="h-9 px-4 border border-surface-dim rounded text-[13px] font-medium hover:bg-surface-container-low" onClick={() => setEnrollSeq(null)}>Cancel</button>
              <button className="h-9 px-4 bg-primary text-white rounded text-[13px] font-semibold hover:bg-primary-container disabled:opacity-40" disabled={!enrollPartyId || busy === 'enroll'} onClick={() => void submitEnroll()}>
                {busy === 'enroll' ? 'Enrolling…' : 'Enroll'}
              </button>
            </div>
          </div>
        </>
      )}
    </main>
  );
}


function SequenceEditor(props: {
  open: boolean;
  onClose: () => void;
  name: string; setName: (v: string) => void;
  purpose: string; setPurpose: (v: string) => void;
  stopOnReply: boolean; setStopOnReply: (v: boolean) => void;
  isNew: boolean;
  steps: StepRow[];
  newStepType: string; setNewStepType: (v: string) => void;
  newStepDelay: string; setNewStepDelay: (v: string) => void;
  newStepSubject: string; setNewStepSubject: (v: string) => void;
  onSave: () => void;
  onAddStep: () => void;
  onDeleteStep: (s: StepRow) => void;
  busy: string | null;
}) {
  if (!props.open) return null;
  return (
    <>
      <div className="drawer-scrim open" onClick={props.onClose} />
      <div className="drawer open" style={{ width: 480 }}>
        <div className="flex items-center justify-between px-6 h-14 border-b border-surface-dim shrink-0">
          <h3 className="text-[16px] font-semibold flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">alt_route</span>
            {props.isNew ? 'New sequence' : 'Edit sequence'}
          </h3>
          <button className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center" onClick={props.onClose}>
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          <div>
            <div className="text-label-sm font-bold uppercase tracking-wider text-on-surface-variant mb-2">Sequence</div>
            <label className="field-label">Name</label>
            <input className="field-input" value={props.name} onChange={e => props.setName(e.target.value)} placeholder="e.g. New lead follow-up" />
            {props.isNew && (
              <div className="mt-3">
                <label className="field-label">Purpose</label>
                <select className="field-input" value={props.purpose} onChange={e => props.setPurpose(e.target.value)}>
                  <option value="marketing">Marketing</option>
                  <option value="sales">Sales</option>
                </select>
              </div>
            )}
            <label className="flex items-center gap-2 mt-3 text-body-sm">
              <input type="checkbox" checked={props.stopOnReply} onChange={e => props.setStopOnReply(e.target.checked)} />
              Exit when party replies to any step
            </label>
          </div>
          {!props.isNew && (
            <div>
              <div className="text-label-sm font-bold uppercase tracking-wider text-on-surface-variant mb-2">Steps</div>
              {props.steps.length === 0 ? (
                <p className="text-body-sm text-on-surface-variant">No steps yet — add the first step below.</p>
              ) : (
                <div className="space-y-2">
                  {props.steps.map(step => (
                    <div key={step.id} className="flex items-center gap-2 border border-surface-dim rounded-lg px-3 py-2">
                      <span className="material-symbols-outlined text-[18px] text-primary">{step.step_type === 'task' ? 'task_alt' : 'mail'}</span>
                      <div className="flex-1 min-w-0">
                        <div className="text-body-sm font-medium truncate">{step.step_type === 'task' ? (step.task_title || 'Task') : (step.subject || 'Email')}</div>
                        <div className="text-[11px] text-on-surface-variant">Step {step.step_no} · wait {step.delay_days}d before</div>
                      </div>
                      <button className="w-7 h-7 rounded hover:bg-error/10 text-error flex items-center justify-center" onClick={() => props.onDeleteStep(step)}>
                        <span className="material-symbols-outlined text-[16px]">delete</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-3 gap-2 mt-3">
                <select className="field-input" value={props.newStepType} onChange={e => props.setNewStepType(e.target.value)}>
                  <option value="email">Email</option>
                  <option value="task">Task</option>
                </select>
                <input className="field-input" type="number" min="0" value={props.newStepDelay} onChange={e => props.setNewStepDelay(e.target.value)} placeholder="Delay days" />
                <input className="field-input" value={props.newStepSubject} onChange={e => props.setNewStepSubject(e.target.value)} placeholder={props.newStepType === 'task' ? 'Task title' : 'Subject'} />
              </div>
              <div className="flex justify-end mt-2">
                <button className="h-8 px-3 border border-surface-dim rounded text-body-md font-medium hover:bg-surface-container-low disabled:opacity-40" disabled={props.busy === 'add-step'} onClick={props.onAddStep}>
                  Add step
                </button>
              </div>
            </div>
          )}
          {props.isNew && <p className="text-[12px] text-on-surface-variant">Save the sequence first — steps are added in the editor once it exists.</p>}
        </div>
        <div className="px-6 py-4 border-t border-surface-dim flex justify-end gap-2 shrink-0">
          <button className="h-9 px-4 border border-surface-dim rounded text-[13px] font-medium hover:bg-surface-container-low" onClick={props.onClose}>Cancel</button>
          <button className="h-9 px-4 bg-primary text-white rounded text-[13px] font-semibold hover:bg-primary-container disabled:opacity-40" disabled={!props.name.trim() || props.busy === 'save-seq'} onClick={props.onSave}>
            {props.busy === 'save-seq' ? 'Saving…' : props.isNew ? 'Create sequence' : 'Save'}
          </button>
        </div>
      </div>
    </>
  );
}
