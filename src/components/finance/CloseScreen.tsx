'use client';

import { useState, useEffect, useCallback } from 'react';
import { fetchJson } from '@/hooks/useCrmApi';
import type {
  Period, FiscalYear, CloseSummary, CloseDetail, CloseTemplate, CloseTemplateTask,
  CloseChecklistItem, FluxRow, ReviewRun, ReviewFinding, AutoReversal, JournalBatch,
} from '@/lib/closeTypes';
import styles from './CloseScreen.module.css';

interface CloseScreenProps {
  onToast: (msg: string) => void;
}

type Tab = 'periods' | 'closes' | 'templates' | 'flux' | 'review' | 'reversals' | 'batches';
const TABS: { id: Tab; label: string }[] = [
  { id: 'periods', label: 'Periods' },
  { id: 'closes', label: 'Month-end closes' },
  { id: 'templates', label: 'Templates' },
  { id: 'flux', label: 'Flux analysis' },
  { id: 'review', label: 'File review' },
  { id: 'reversals', label: 'Auto-reversals' },
  { id: 'batches', label: 'Journal batches' },
];

const money = (n: number | null | undefined) =>
  n == null ? '—' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const pct = (n: number | null | undefined) =>
  n == null ? '—' : `${(n * 100).toFixed(1)}%`;

export function CloseScreen({ onToast }: CloseScreenProps) {
  const [tab, setTab] = useState<Tab>('periods');
  const [years, setYears] = useState<FiscalYear[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [closes, setCloses] = useState<CloseSummary[]>([]);
  const [templates, setTemplates] = useState<CloseTemplate[]>([]);
  const [flux, setFlux] = useState<FluxRow[]>([]);
  const [runs, setRuns] = useState<ReviewRun[]>([]);
  const [reversals, setReversals] = useState<AutoReversal[]>([]);
  const [batches, setBatches] = useState<JournalBatch[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);

  // Close detail drawer
  const [detail, setDetail] = useState<CloseDetail | null>(null);
  const [overrideNote, setOverrideNote] = useState('');
  const [commentText, setCommentText] = useState<Record<string, string>>({});
  const [finalizeStatus, setFinalizeStatus] = useState('soft_closed');
  const [forceNote, setForceNote] = useState('');

  // Period checklists
  const [checklistPeriod, setChecklistPeriod] = useState<string | null>(null);
  const [checklist, setChecklist] = useState<CloseChecklistItem[]>([]);
  const [chkName, setChkName] = useState('');

  // Templates
  const [tplDetail, setTplDetail] = useState<{ id: string; name: string; tasks: CloseTemplateTask[] } | null>(null);
  const [tplName, setTplName] = useState('');
  const [tplFreq, setTplFreq] = useState('monthly');
  const [tplTaskSection, setTplTaskSection] = useState('');
  const [tplTaskTitle, setTplTaskTitle] = useState('');

  // Flux
  const [fluxFrom, setFluxFrom] = useState('2026-11-01');
  const [fluxTo, setFluxTo] = useState('2026-11-30');
  const [explainFor, setExplainFor] = useState<string | null>(null);
  const [explainText, setExplainText] = useState('');

  // Review
  const [revFrom, setRevFrom] = useState('2026-11-01');
  const [revTo, setRevTo] = useState('2026-11-30');
  const [runDetail, setRunDetail] = useState<{ id: string; findings: ReviewFinding[] } | null>(null);
  const [ignoreCheck, setIgnoreCheck] = useState('');
  const [ignoreReason, setIgnoreReason] = useState('');
  const [ignoreRules, setIgnoreRules] = useState<{ id: string; check_code: string | null; title_contains: string | null; reason: string }[]>([]);

  // Reversals
  const [revEntryNo, setRevEntryNo] = useState('');
  const [revDate, setRevDate] = useState('');
  const [batchDetail, setBatchDetail] = useState<{ id: string; batchNo: string; entries: { id: string; entry_no: string; entry_date: string; memo: string | null; total_debit: number; total_credit: number; status: string }[] } | null>(null);

  const loadPeriods = useCallback(async () => {
    const res = await fetchJson<{ data: { fiscalYears: FiscalYear[]; periods: Period[] } }>('/api/close/periods');
    if (res.ok && res.data) { setYears(res.data.data.fiscalYears); setPeriods(res.data.data.periods); }
  }, []);
  const loadCloses = useCallback(async () => {
    const res = await fetchJson<{ data: CloseSummary[] }>('/api/close/closes');
    if (res.ok && res.data) setCloses(res.data.data);
  }, []);
  const loadTemplates = useCallback(async () => {
    const res = await fetchJson<{ data: CloseTemplate[] }>('/api/close/templates');
    if (res.ok && res.data) setTemplates(res.data.data);
  }, []);
  const loadRuns = useCallback(async () => {
    const res = await fetchJson<{ data: ReviewRun[] }>('/api/review-runs');
    if (res.ok && res.data) setRuns(res.data.data);
  }, []);
  const loadReversals = useCallback(async () => {
    const res = await fetchJson<{ data: AutoReversal[] }>('/api/auto-reversals');
    if (res.ok && res.data) setReversals(res.data.data);
  }, []);
  const loadBatches = useCallback(async () => {
    const res = await fetchJson<{ data: JournalBatch[] }>('/api/journal-batches');
    if (res.ok && res.data) setBatches(res.data.data);
  }, []);
  const loadIgnoreRules = useCallback(async () => {
    const res = await fetchJson<{ data: { id: string; check_code: string | null; title_contains: string | null; reason: string }[] }>('/api/review-ignore-rules');
    if (res.ok && res.data) setIgnoreRules(res.data.data);
  }, []);

  useEffect(() => { loadPeriods(); loadCloses(); setLoaded(true); }, [loadPeriods, loadCloses]);
  useEffect(() => { if (tab === 'templates') loadTemplates(); }, [tab, loadTemplates]);
  useEffect(() => { if (tab === 'review') { loadRuns(); loadIgnoreRules(); } }, [tab, loadRuns, loadIgnoreRules]);
  useEffect(() => { if (tab === 'reversals') loadReversals(); }, [tab, loadReversals]);
  useEffect(() => { if (tab === 'batches') loadBatches(); }, [tab, loadBatches]);

  async function openClose(id: string) {
    const res = await fetchJson<{ data: CloseDetail }>(`/api/close/closes/${id}`);
    if (!res.ok) { onToast(`Could not open close: ${res.error}`); return; }
    setDetail(res.data.data);
    setOverrideNote(''); setForceNote('');
  }

  async function startClose(periodEnd: string) {
    setBusy(true);
    const res = await fetchJson<{ data: CloseSummary }>('/api/close/closes', {
      method: 'POST', body: JSON.stringify({ periodEnd }),
    });
    setBusy(false);
    if (!res.ok) { onToast(`Start close failed: ${res.error}`); return; }
    onToast(`Close started for ${res.data?.data.periodName ?? periodEnd} — ${res.data?.data.tasksTotal} tasks`);
    loadPeriods(); loadCloses();
    if (res.data?.data.id) openClose(res.data.data.id);
  }

  async function setPeriodStatus(id: string, status: string) {
    const res = await fetchJson(`/api/close/periods/${id}/status`, {
      method: 'POST', body: JSON.stringify({ status }),
    });
    if (!res.ok) { onToast(`Period status failed: ${res.error}`); return; }
    onToast(`Period ${status}`);
    loadPeriods();
  }

  async function completeTask(taskId: string) {
    if (!detail) return;
    const res = await fetchJson<{ data: { task_id: string; status: string } }>(`/api/close/tasks/${taskId}/complete`, {
      method: 'POST', body: JSON.stringify({ overrideNote: overrideNote.trim() || undefined }),
    });
    if (!res.ok) { onToast(`Complete failed: ${res.error}`); return; }
    onToast(res.data?.data.status === 'ready_for_review' ? 'Task completed — waiting for signoff' : 'Task done');
    setOverrideNote('');
    openClose(detail.id); loadCloses();
  }

  async function signoffTask(taskId: string, approve: boolean) {
    if (!detail) return;
    const res = await fetchJson(`/api/close/tasks/${taskId}/signoff`, {
      method: 'POST', body: JSON.stringify({ approve }),
    });
    if (!res.ok) { onToast(`Signoff failed: ${res.error}`); return; }
    onToast(approve ? 'Task signed off' : 'Task sent back for changes');
    openClose(detail.id); loadCloses();
  }

  async function addComment(taskId: string) {
    const text = (commentText[taskId] || '').trim();
    if (!text || !detail) return;
    const res = await fetchJson(`/api/close/tasks/${taskId}/comments`, {
      method: 'POST', body: JSON.stringify({ body: text }),
    });
    if (!res.ok) { onToast(`Comment failed: ${res.error}`); return; }
    setCommentText(prev => ({ ...prev, [taskId]: '' }));
    openClose(detail.id);
  }

  async function finalizeClose() {
    if (!detail) return;
    const res = await fetchJson(`/api/close/closes/${detail.id}/finalize`, {
      method: 'POST', body: JSON.stringify({ periodStatus: finalizeStatus, forceNote: forceNote.trim() || undefined }),
    });
    if (!res.ok) { onToast(`Finalize failed: ${res.error}`); return; }
    onToast(`Close finalized — period ${finalizeStatus}`);
    setDetail(null); loadPeriods(); loadCloses();
  }

  async function openChecklist(periodId: string) {
    setChecklistPeriod(periodId);
    const res = await fetchJson<{ data: CloseChecklistItem[] }>(`/api/close/checklists?periodId=${periodId}`);
    if (res.ok && res.data) setChecklist(res.data.data);
  }

  async function addChecklist() {
    if (!checklistPeriod || !chkName.trim()) return;
    const res = await fetchJson('/api/close/checklists', {
      method: 'POST', body: JSON.stringify({ periodId: checklistPeriod, taskName: chkName.trim() }),
    });
    if (!res.ok) { onToast(`Checklist failed: ${res.error}`); return; }
    setChkName('');
    openChecklist(checklistPeriod);
  }

  async function completeChecklist(id: string, status: string) {
    const res = await fetchJson(`/api/close/checklists/${id}/complete`, {
      method: 'POST', body: JSON.stringify({ status }),
    });
    if (!res.ok) { onToast(`Checklist update failed: ${res.error}`); return; }
    if (checklistPeriod) openChecklist(checklistPeriod);
  }

  async function submitTemplate() {
    if (!tplName.trim()) { onToast('Template name is required'); return; }
    const res = await fetchJson('/api/close/templates', {
      method: 'POST', body: JSON.stringify({ name: tplName.trim(), frequency: tplFreq }),
    });
    if (!res.ok) { onToast(`Template failed: ${res.error}`); return; }
    setTplName(''); loadTemplates();
  }

  async function openTemplate(id: string) {
    const res = await fetchJson<{ data: { id: string; name: string; tasks: CloseTemplateTask[] } }>(`/api/close/templates/${id}`);
    if (!res.ok) { onToast(`Could not open template: ${res.error}`); return; }
    setTplDetail(res.data.data);
    setTplTaskSection(''); setTplTaskTitle('');
  }

  async function addTemplateTask() {
    if (!tplDetail || !tplTaskSection.trim() || !tplTaskTitle.trim()) { onToast('Section and title are required'); return; }
    const res = await fetchJson(`/api/close/templates/${tplDetail.id}/tasks`, {
      method: 'POST', body: JSON.stringify({ section: tplTaskSection.trim(), title: tplTaskTitle.trim() }),
    });
    if (!res.ok) { onToast(`Task failed: ${res.error}`); return; }
    openTemplate(tplDetail.id); loadTemplates();
  }

  async function runFlux() {
    const res = await fetchJson<{ data: FluxRow[] }>(`/api/flux?from=${fluxFrom}&to=${fluxTo}`);
    if (!res.ok) { onToast(`Flux failed: ${res.error}`); return; }
    setFlux(res.data.data);
  }

  async function submitExplanation(accountId: string) {
    if (!explainText.trim()) { onToast('Write the explanation first'); return; }
    const res = await fetchJson('/api/flux/explain', {
      method: 'POST', body: JSON.stringify({ accountId, from: fluxFrom, to: fluxTo, explanation: explainText.trim() }),
    });
    if (!res.ok) { onToast(`Explanation failed: ${res.error}`); return; }
    onToast('Explanation saved');
    setExplainFor(null); setExplainText('');
    runFlux();
  }

  async function runReview() {
    setBusy(true);
    const res = await fetchJson('/api/review-runs', {
      method: 'POST', body: JSON.stringify({ from: revFrom, to: revTo }),
    });
    setBusy(false);
    if (!res.ok) { onToast(`Review failed: ${res.error}`); return; }
    onToast(`Review run complete — ${(res.data as { finding_count?: number })?.finding_count ?? 0} findings`);
    loadRuns();
  }

  async function openRun(id: string) {
    const res = await fetchJson<{ data: { id: string; findings: ReviewFinding[] } }>(`/api/review-runs/${id}`);
    if (!res.ok) { onToast(`Could not open run: ${res.error}`); return; }
    setRunDetail(res.data.data);
  }

  async function setFindingStatus(id: string, status: string, note?: string) {
    const res = await fetchJson(`/api/review-findings/${id}`, {
      method: 'PATCH', body: JSON.stringify({ status, resolutionNote: note }),
    });
    if (!res.ok) { onToast(`Finding update failed: ${res.error}`); return; }
    onToast(`Finding ${status}`);
    if (runDetail) openRun(runDetail.id);
  }

  async function addIgnoreRule() {
    if (!ignoreReason.trim()) { onToast('A reason is required to ignore a check'); return; }
    const res = await fetchJson('/api/review-ignore-rules', {
      method: 'POST', body: JSON.stringify({ checkCode: ignoreCheck.trim() || null, reason: ignoreReason.trim() }),
    });
    if (!res.ok) { onToast(`Ignore rule failed: ${res.error}`); return; }
    setIgnoreCheck(''); setIgnoreReason('');
    loadIgnoreRules();
  }

  async function scheduleReversal() {
    if (!revEntryNo.trim()) { onToast('Journal entry number is required'); return; }
    const res = await fetchJson('/api/auto-reversals', {
      method: 'POST', body: JSON.stringify({ entryNo: revEntryNo.trim(), reverseOn: revDate || undefined }),
    });
    if (!res.ok) { onToast(`Schedule failed: ${res.error}`); return; }
    onToast(`Reversal scheduled for ${(res.data as { reverse_on?: string })?.reverse_on ?? revDate}`);
    setRevEntryNo(''); setRevDate('');
    loadReversals();
  }

  async function runReversals() {
    const res = await fetchJson<{ data: { reversed: number } }>('/api/auto-reversals/run', { method: 'POST', body: JSON.stringify({}) });
    if (!res.ok) { onToast(`Run failed: ${res.error}`); return; }
    onToast(`Reversed ${res.data?.data.reversed ?? 0} journal(s)`);
    loadReversals();
  }

  async function openBatch(id: string) {
    const res = await fetchJson<{ data: { id: string; batchNo: string; entries: { id: string; entry_no: string; entry_date: string; memo: string | null; total_debit: number; total_credit: number; status: string }[] } }>(`/api/journal-batches/${id}`);
    if (!res.ok) { onToast(`Could not open batch: ${res.error}`); return; }
    setBatchDetail(res.data.data);
  }

  const groupedTasks = detail ? detail.tasks.reduce<Record<string, typeof detail.tasks>>((acc, t) => {
    (acc[t.section] = acc[t.section] || []).push(t);
    return acc;
  }, {}) : {};

  return (
    <div className={styles.container}>
      <div className={styles.pageBody}>
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.pageTitle}>Month-end close</h1>
            <p className={styles.pageSubtitle}>Periods, close checklists, flux, file review and reversals — the books, closed on time</p>
          </div>
        </div>

        <div className={styles.viewTabsBar} style={{ marginBottom: 12 }}>
          {TABS.map(t => (
            <button key={t.id} className={`${styles.viewTab} ${tab === t.id ? styles.viewTabActive : ''}`} onClick={() => setTab(t.id)}>
              {t.label}
              {t.id === 'closes' && closes.filter(c => c.status === 'open').length > 0 && ` (${closes.filter(c => c.status === 'open').length})`}
            </button>
          ))}
        </div>

        {tab === 'periods' && (
          <>
            {years.map(y => (
              <div key={y.id} className={styles.tableCard} style={{ marginBottom: 12 }}>
                <div className={styles.filterBar}><span className={styles.filterCount}>Fiscal year {y.fiscalYear} · {y.startDate.slice(0, 10)} → {y.endDate.slice(0, 10)}</span></div>
                <table className={styles.table}>
                  <thead><tr><th>Period</th><th>Dates</th><th>Status</th><th>Close</th><th></th></tr></thead>
                  <tbody>
                    {periods.filter(p => p.fiscalYearId === y.id).map(p => (
                      <tr key={p.id} className={styles.tableRow}>
                        <td><strong>{p.name} {y.fiscalYear}</strong></td>
                        <td>{p.startDate.slice(0, 10)} → {p.endDate.slice(0, 10)}</td>
                        <td><span className={styles.statusPill} data-status={p.status === 'open' ? 'In stock' : 'Out of stock'}>{p.status}</span></td>
                        <td>{p.closeId ? <span className={styles.statusPill} data-status="In stock">{p.closeStatus}</span> : '—'}</td>
                        <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {!p.closeId && p.status === 'open' && (
                            <button className={styles.btnSecondary} disabled={busy} onClick={() => startClose(p.endDate)}>Start close</button>
                          )}
                          {p.closeId && (
                            <button className={styles.btnSecondary} onClick={() => openClose(p.closeId!)}>Open close</button>
                          )}
                          {p.status === 'soft_closed' && (
                            <button className={styles.btnSecondary} onClick={() => setPeriodStatus(p.id, 'open')}>Reopen</button>
                          )}
                          {' '}
                          <button className={styles.btnSecondary} onClick={() => openChecklist(p.id)}>Checklist</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
            {!loaded && <div className={styles.emptyState}>Loading periods…</div>}
            {checklistPeriod && (
              <div className={styles.tableCard} style={{ padding: 16 }}>
                <h3 style={{ fontWeight: 600, marginBottom: 8 }}>Checklist — {periods.find(p => p.id === checklistPeriod)?.name ?? ''}</h3>
                {checklist.map(c => (
                  <div key={c.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #eee' }}>
                    <span style={{ flex: 1 }}>{c.taskName} {c.required && <span style={{ color: '#ba1a1a' }}>*</span>}</span>
                    <span className={styles.statusPill} data-status={c.status === 'completed' ? 'In stock' : 'Out of stock'}>{c.status}</span>
                    {c.status !== 'completed' && <button className={styles.btnSecondary} onClick={() => completeChecklist(c.id, 'completed')}>Done</button>}
                    {c.status === 'completed' && <button className={styles.btnSecondary} onClick={() => completeChecklist(c.id, 'reopened')}>Reopen</button>}
                  </div>
                ))}
                {checklist.length === 0 && <div style={{ fontSize: 12, color: '#5a6355', marginBottom: 8 }}>No checklist items for this period yet.</div>}
                <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                  <input className={styles.filterInput} placeholder="New checklist item" value={chkName} onChange={e => setChkName(e.target.value)} style={{ maxWidth: 320 }} />
                  <button className={styles.btnSecondary} onClick={addChecklist}>Add item</button>
                </div>
              </div>
            )}
          </>
        )}

        {tab === 'closes' && (
          <div className={styles.tableCard}>
            <table className={styles.table}>
              <thead><tr><th>Period</th><th>Status</th><th style={{ textAlign: 'right' }}>Tasks done</th><th style={{ textAlign: 'right' }}>Overdue</th><th style={{ textAlign: 'right' }}>Open errors</th><th>Finalized</th><th></th></tr></thead>
              <tbody>
                {closes.map(c => (
                  <tr key={c.id} className={styles.tableRow}>
                    <td><strong>{c.periodName ?? c.periodEnd.slice(0, 7)}</strong><div style={{ fontSize: 11, color: '#5a6355' }}>{c.periodStart.slice(0, 10)} → {c.periodEnd.slice(0, 10)}</div></td>
                    <td><span className={styles.statusPill} data-status={c.status === 'closed' || c.status === 'soft_closed' ? 'In stock' : 'Out of stock'}>{c.status}</span></td>
                    <td style={{ textAlign: 'right' }}>{c.tasksDone}/{c.tasksTotal}</td>
                    <td style={{ textAlign: 'right', color: c.tasksOverdue > 0 ? '#ba1a1a' : undefined }}>{c.tasksOverdue}</td>
                    <td style={{ textAlign: 'right', color: c.openErrorFindings > 0 ? '#ba1a1a' : undefined }}>{c.openErrorFindings}</td>
                    <td>{c.finalizedAt ? c.finalizedAt.slice(0, 10) : '—'}</td>
                    <td style={{ textAlign: 'right' }}><button className={styles.btnSecondary} onClick={() => openClose(c.id)}>Open</button></td>
                  </tr>
                ))}
                {closes.length === 0 && <tr><td colSpan={7} className={styles.emptyState}>No closes yet — start one from the Periods tab. The default template builds the 20-task month-end checklist for you.</td></tr>}
              </tbody>
            </table>
          </div>
        )}

        {tab === 'templates' && (
          <>
            <div className={styles.tableCard}>
              <table className={styles.table}>
                <thead><tr><th>Template</th><th>Frequency</th><th style={{ textAlign: 'right' }}>Tasks</th><th>Default</th><th></th></tr></thead>
                <tbody>
                  {templates.map(t => (
                    <tr key={t.id} className={styles.tableRow}>
                      <td><strong>{t.name}</strong></td>
                      <td>{t.frequency}</td>
                      <td style={{ textAlign: 'right' }}>{t.taskCount}</td>
                      <td>{t.isDefault ? 'Yes' : '—'}</td>
                      <td style={{ textAlign: 'right' }}><button className={styles.btnSecondary} onClick={() => openTemplate(t.id)}>Open</button></td>
                    </tr>
                  ))}
                  {templates.length === 0 && <tr><td colSpan={5} className={styles.emptyState}>No templates yet — the default "Month-end close" template is created automatically the first time a close is generated.</td></tr>}
                </tbody>
              </table>
            </div>
            <div className={styles.tableCard} style={{ marginTop: 12, padding: 16 }}>
              <h3 style={{ fontWeight: 600, marginBottom: 8 }}>New template</h3>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <input className={styles.filterInput} placeholder="Name (e.g. Quarter-end close)" value={tplName} onChange={e => setTplName(e.target.value)} style={{ maxWidth: 260 }} />
                <select className={styles.filterSelect} value={tplFreq} onChange={e => setTplFreq(e.target.value)}>
                  <option value="monthly">monthly</option>
                  <option value="quarterly">quarterly</option>
                  <option value="yearly">yearly</option>
                </select>
                <button className={styles.btnSecondary} onClick={submitTemplate}>Create template</button>
              </div>
            </div>
            {tplDetail && (
              <div className={styles.tableCard} style={{ marginTop: 12, padding: 16 }}>
                <h3 style={{ fontWeight: 600, marginBottom: 8 }}>{tplDetail.name} — {tplDetail.tasks.length} task(s)</h3>
                {tplDetail.tasks.map(t => (
                  <div key={t.id} style={{ display: 'flex', gap: 8, padding: '4px 0', borderBottom: '1px solid #eee', fontSize: 13 }}>
                    <span style={{ width: 140, color: '#5a6355' }}>{t.section}</span>
                    <span style={{ flex: 1 }}>{t.title}</span>
                    <span style={{ color: '#5a6355' }}>{t.appliesTo} · due +{t.dueOffsetDays}d {t.checkCode ? `· check ${t.checkCode}` : ''}</span>
                  </div>
                ))}
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
                  <input className={styles.filterInput} placeholder="Section (e.g. 8. Close)" value={tplTaskSection} onChange={e => setTplTaskSection(e.target.value)} style={{ maxWidth: 180 }} />
                  <input className={styles.filterInput} placeholder="Task title" value={tplTaskTitle} onChange={e => setTplTaskTitle(e.target.value)} style={{ maxWidth: 320 }} />
                  <button className={styles.btnSecondary} onClick={addTemplateTask}>Add task</button>
                </div>
              </div>
            )}
          </>
        )}

        {tab === 'flux' && (
          <>
            <div className={styles.tableCard} style={{ padding: 16, marginBottom: 12 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <label style={{ fontSize: 13 }}>From</label>
                <input className={styles.filterInput} type="date" value={fluxFrom} onChange={e => setFluxFrom(e.target.value)} style={{ maxWidth: 160 }} />
                <label style={{ fontSize: 13 }}>To</label>
                <input className={styles.filterInput} type="date" value={fluxTo} onChange={e => setFluxTo(e.target.value)} style={{ maxWidth: 160 }} />
                <button className={styles.btnSecondary} onClick={runFlux}>Run flux analysis</button>
                <span style={{ fontSize: 12, color: '#5a6355' }}>Flagged when the change clears $500 and 10% vs the prior window.</span>
              </div>
            </div>
            <div className={styles.tableCard}>
              <table className={styles.table}>
                <thead><tr><th>Account</th><th style={{ textAlign: 'right' }}>Current</th><th style={{ textAlign: 'right' }}>Prior</th><th style={{ textAlign: 'right' }}>Change</th><th style={{ textAlign: 'right' }}>%</th><th>Flagged</th><th>Explanation</th><th></th></tr></thead>
                <tbody>
                  {flux.map(f => (
                    <tr key={f.accountId} className={styles.tableRow}>
                      <td><div style={{ fontWeight: 600 }}>{f.name}</div><div style={{ fontSize: 11, color: '#5a6355', fontFamily: 'monospace' }}>{f.code} · {f.basis}</div></td>
                      <td style={{ textAlign: 'right' }}>{money(f.currentAmount)}</td>
                      <td style={{ textAlign: 'right' }}>{money(f.priorAmount)}</td>
                      <td style={{ textAlign: 'right', color: f.change !== 0 ? '#ba1a1a' : undefined }}>{money(f.change)}</td>
                      <td style={{ textAlign: 'right' }}>{pct(f.changePct)}</td>
                      <td>{f.flagged ? <span className={styles.statusPill} data-status="Low stock">Flagged</span> : '—'}</td>
                      <td style={{ maxWidth: 220, fontSize: 12 }}>{f.explanation ?? '—'}</td>
                      <td style={{ textAlign: 'right' }}>
                        {f.flagged && <button className={styles.btnSecondary} onClick={() => { setExplainFor(f.accountId); setExplainText(f.explanation ?? ''); }}>Explain</button>}
                      </td>
                    </tr>
                  ))}
                  {flux.length === 0 && <tr><td colSpan={8} className={styles.emptyState}>Run the analysis to compare the window against the prior one.</td></tr>}
                </tbody>
              </table>
              {explainFor && (
                <div style={{ padding: 16, borderTop: '1px solid #eee' }}>
                  <label style={{ fontSize: 13, fontWeight: 600 }}>Explanation for {flux.find(f => f.accountId === explainFor)?.name}</label>
                  <textarea className={styles.filterInput} rows={2} value={explainText} onChange={e => setExplainText(e.target.value)} style={{ width: '100%', marginTop: 6 }} placeholder="Why did this account move?" />
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <button className={styles.btnSecondary} onClick={() => submitExplanation(explainFor)}>Save explanation</button>
                    <button className={styles.btnSecondary} onClick={() => setExplainFor(null)}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {tab === 'review' && (
          <>
            <div className={styles.tableCard} style={{ padding: 16, marginBottom: 12 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <label style={{ fontSize: 13 }}>From</label>
                <input className={styles.filterInput} type="date" value={revFrom} onChange={e => setRevFrom(e.target.value)} style={{ maxWidth: 160 }} />
                <label style={{ fontSize: 13 }}>To</label>
                <input className={styles.filterInput} type="date" value={revTo} onChange={e => setRevTo(e.target.value)} style={{ maxWidth: 160 }} />
                <button className={styles.btnSecondary} disabled={busy} onClick={runReview}>{busy ? 'Running…' : 'Run file review'}</button>
                <span style={{ fontSize: 12, color: '#5a6355' }}>Findings are deduped by fingerprint — re-running does not duplicate them.</span>
              </div>
            </div>
            <div className={styles.tableCard}>
              <table className={styles.table}>
                <thead><tr><th>Run</th><th>Window</th><th style={{ textAlign: 'right' }}>Findings</th><th style={{ textAlign: 'right' }}>New</th><th></th></tr></thead>
                <tbody>
                  {runs.map(r => (
                    <tr key={r.id} className={styles.tableRow}>
                      <td><strong>{r.runAt.slice(0, 10)}</strong></td>
                      <td>{r.periodFrom.slice(0, 10)} → {r.periodTo.slice(0, 10)}</td>
                      <td style={{ textAlign: 'right' }}>{r.findingCount}</td>
                      <td style={{ textAlign: 'right' }}>{r.newCount}</td>
                      <td style={{ textAlign: 'right' }}><button className={styles.btnSecondary} onClick={() => openRun(r.id)}>Open</button></td>
                    </tr>
                  ))}
                  {runs.length === 0 && <tr><td colSpan={5} className={styles.emptyState}>No review runs yet — run the file review for a window above.</td></tr>}
                </tbody>
              </table>
              {runDetail && (
                <div style={{ padding: 16, borderTop: '1px solid #eee' }}>
                  <h3 style={{ fontWeight: 600, marginBottom: 8 }}>Findings — {runDetail.findings.length}</h3>
                  {runDetail.findings.map(f => (
                    <div key={f.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '6px 0', borderBottom: '1px solid #eee', fontSize: 13 }}>
                      <span className={styles.statusPill} data-status={f.severity === 'error' ? 'Low stock' : 'In stock'}>{f.severity}</span>
                      <span style={{ flex: 1 }}><strong>{f.title}</strong>{f.detail ? ` — ${f.detail}` : ''}<span style={{ color: '#5a6355' }}> · {f.checkCode}{f.amount != null ? ` · ${money(f.amount)}` : ''}</span></span>
                      <span className={styles.statusPill} data-status="In stock">{f.status}</span>
                      {f.status !== 'resolved' && <button className={styles.btnSecondary} onClick={() => setFindingStatus(f.id, 'resolved', 'Resolved from the file review')}>Resolve</button>}
                      {f.status !== 'ignored' && <button className={styles.btnSecondary} onClick={() => setFindingStatus(f.id, 'ignored')}>Ignore</button>}
                    </div>
                  ))}
                  {runDetail.findings.length === 0 && <div style={{ fontSize: 12, color: '#5a6355' }}>No findings in this run — the books are clean for the window.</div>}
                </div>
              )}
            </div>
            <div className={styles.tableCard} style={{ marginTop: 12, padding: 16 }}>
              <h3 style={{ fontWeight: 600, marginBottom: 8 }}>Standing ignore rules</h3>
              {ignoreRules.map(r => (
                <div key={r.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 0', fontSize: 13 }}>
                  <span style={{ fontFamily: 'monospace' }}>{r.check_code ?? r.title_contains ?? '—'}</span>
                  <span style={{ flex: 1 }}>{r.reason}</span>
                  <button className={styles.btnSecondary} onClick={async () => { await fetchJson(`/api/review-ignore-rules/${r.id}`, { method: 'DELETE' }); loadIgnoreRules(); }}>Delete</button>
                </div>
              ))}
              {ignoreRules.length === 0 && <div style={{ fontSize: 12, color: '#5a6355', marginBottom: 8 }}>No ignore rules — a rule suppresses a check across future runs.</div>}
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
                <input className={styles.filterInput} placeholder="Check code to ignore" value={ignoreCheck} onChange={e => setIgnoreCheck(e.target.value)} style={{ maxWidth: 200 }} />
                <input className={styles.filterInput} placeholder="Reason (required)" value={ignoreReason} onChange={e => setIgnoreReason(e.target.value)} style={{ maxWidth: 320 }} />
                <button className={styles.btnSecondary} onClick={addIgnoreRule}>Add rule</button>
              </div>
            </div>
          </>
        )}

        {tab === 'reversals' && (
          <>
            <div className={styles.tableCard} style={{ padding: 16, marginBottom: 12 }}>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                <input className={styles.filterInput} placeholder="Journal entry no. (e.g. JE-0001)" value={revEntryNo} onChange={e => setRevEntryNo(e.target.value)} style={{ maxWidth: 220 }} />
                <input className={styles.filterInput} type="date" value={revDate} onChange={e => setRevDate(e.target.value)} style={{ maxWidth: 160 }} />
                <button className={styles.btnSecondary} onClick={scheduleReversal}>Schedule reversal</button>
                <button className={styles.btnSecondary} onClick={runReversals}>Run due reversals</button>
                <span style={{ fontSize: 12, color: '#5a6355' }}>No date = the day after the entry's period ends.</span>
              </div>
            </div>
            <div className={styles.tableCard}>
              <table className={styles.table}>
                <thead><tr><th>Entry</th><th>Reverse on</th><th>Status</th><th>Reversal journal</th><th>Error</th></tr></thead>
                <tbody>
                  {reversals.map(r => (
                    <tr key={r.id} className={styles.tableRow}>
                      <td><strong>{r.entryNo ?? r.journalEntryId.slice(0, 8)}</strong></td>
                      <td>{r.reverseOn.slice(0, 10)}</td>
                      <td><span className={styles.statusPill} data-status={r.status === 'reversed' ? 'In stock' : 'Out of stock'}>{r.status}</span></td>
                      <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{r.reversalJournalId ? r.reversalJournalId.slice(0, 8) : '—'}</td>
                      <td style={{ fontSize: 12, color: '#ba1a1a' }}>{r.error ?? '—'}</td>
                    </tr>
                  ))}
                  {reversals.length === 0 && <tr><td colSpan={5} className={styles.emptyState}>No scheduled reversals — schedule one from a journal entry number above.</td></tr>}
                </tbody>
              </table>
            </div>
          </>
        )}

        {tab === 'batches' && (
          <div className={styles.tableCard}>
            <table className={styles.table}>
              <thead><tr><th>Batch</th><th>Source</th><th>Status</th><th style={{ textAlign: 'right' }}>Entries</th><th>Created</th><th></th></tr></thead>
              <tbody>
                {batches.map(b => (
                  <tr key={b.id} className={styles.tableRow}>
                    <td><strong>{b.batchNo}</strong></td>
                    <td>{b.source}</td>
                    <td><span className={styles.statusPill} data-status="In stock">{b.status}</span></td>
                    <td style={{ textAlign: 'right' }}>{b.entryCount}</td>
                    <td>{b.createdAt.slice(0, 10)}</td>
                    <td style={{ textAlign: 'right' }}><button className={styles.btnSecondary} onClick={() => openBatch(b.id)}>Open</button></td>
                  </tr>
                ))}
                {batches.length === 0 && <tr><td colSpan={6} className={styles.emptyState}>No journal batches yet.</td></tr>}
              </tbody>
            </table>
            {batchDetail && (
              <div style={{ padding: 16, borderTop: '1px solid #eee' }}>
                <h3 style={{ fontWeight: 600, marginBottom: 8 }}>Batch {batchDetail.batchNo} — {batchDetail.entries.length} entries</h3>
                {batchDetail.entries.map(e => (
                  <div key={e.id} style={{ display: 'flex', gap: 8, padding: '4px 0', borderBottom: '1px solid #eee', fontSize: 13 }}>
                    <span style={{ fontFamily: 'monospace' }}>{e.entry_no}</span>
                    <span>{e.entry_date.slice(0, 10)}</span>
                    <span style={{ flex: 1 }}>{e.memo ?? '—'}</span>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>{money(e.total_debit)}</span>
                    <span className={styles.statusPill} data-status="In stock">{e.status}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Close detail drawer */}
      {detail && (
        <div className="modal-scrim open" onClick={() => setDetail(null)}>
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-1">
              <div>
                <h3 className="text-headline-sm">Close — {detail.periodName ?? detail.periodEnd.slice(0, 7)}</h3>
                <div className="text-[12px] text-on-surface-variant">{detail.periodStart.slice(0, 10)} → {detail.periodEnd.slice(0, 10)} · {detail.status} · {detail.tasksDone}/{detail.tasksTotal} tasks · {detail.tasksOverdue} overdue · {detail.openErrorFindings} open error findings</div>
              </div>
              <button className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center" onClick={() => setDetail(null)} aria-label="Close">
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <div className="max-h-[55vh] overflow-y-auto mt-3">
              {Object.entries(groupedTasks).map(([section, tasks]) => (
                <div key={section} className="mb-3">
                  <h4 className="font-semibold text-body-sm mb-1">{section}</h4>
                  {tasks.map(t => (
                    <div key={t.id} className="px-3 py-2 border border-surface-dim rounded-lg mb-2">
                      <div className="flex items-center gap-2">
                        <span className="flex-1 font-medium text-body-sm">{t.title}</span>
                        <span className={styles.statusPill} data-status={t.status === 'done' ? 'In stock' : 'Out of stock'}>{t.status}</span>
                        {t.overdue && <span style={{ color: '#ba1a1a', fontSize: 11 }}>overdue</span>}
                      </div>
                      <div className="text-[11px] text-on-surface-variant">Due {t.due ? t.due.slice(0, 10) : '—'} · priority {t.priority}</div>
                      {t.check && (
                        <div className="text-[12px] mt-1" style={{ color: (t.check as { passed?: boolean }).passed ? '#1e5a38' : '#ba1a1a' }}>
                          Check: {(t.check as { passed?: boolean }).passed ? 'passed' : 'not passed'}{(t.check as { detail?: string }).detail ? ` — ${(t.check as { detail?: string }).detail}` : ''}
                        </div>
                      )}
                      {(t as { comments?: { id: string; body: string; createdAt: string }[] }).comments?.map(c => (
                        <div key={c.id} className="text-[12px] text-on-surface-variant mt-1">• {c.body}</div>
                      ))}
                      <div className="flex gap-2 mt-2 flex-wrap items-center">
                        {t.status !== 'done' && t.status !== 'skipped' && t.status !== 'ready_for_review' && (
                          <>
                            <input className="h-8 px-2 border border-surface-dim rounded text-[12px]" style={{ width: 220 }} placeholder="Override note (only if the check fails)" value={overrideNote} onChange={e => setOverrideNote(e.target.value)} />
                            <button className="h-8 px-3 border border-surface-dim rounded text-[12px]" onClick={() => completeTask(t.id)}>Complete</button>
                          </>
                        )}
                        {t.status === 'ready_for_review' && (
                          <>
                            <button className="h-8 px-3 bg-primary text-white rounded font-semibold text-[12px]" onClick={() => signoffTask(t.id, true)}>Sign off</button>
                            <button className="h-8 px-3 border border-surface-dim rounded text-[12px]" onClick={() => signoffTask(t.id, false)}>Send back</button>
                          </>
                        )}
                        <input
                          className="h-8 px-2 border border-surface-dim rounded text-[12px] flex-1"
                          style={{ minWidth: 160 }}
                          placeholder="Add a comment…"
                          value={commentText[t.id] || ''}
                          onChange={e => setCommentText(prev => ({ ...prev, [t.id]: e.target.value }))}
                          onKeyDown={e => { if (e.key === 'Enter') addComment(t.id); }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
            {detail.status !== 'closed' && detail.status !== 'soft_closed' && (
              <div className="flex gap-2 mt-4 flex-wrap items-center">
                <select className={styles.filterSelect} value={finalizeStatus} onChange={e => setFinalizeStatus(e.target.value)}>
                  <option value="soft_closed">Finalize to soft_closed</option>
                  <option value="closed">Finalize to closed</option>
                </select>
                <input className="h-9 px-3 border border-surface-dim rounded text-[12px] flex-1" style={{ minWidth: 200 }} placeholder="Force note (only needed if tasks/findings are still open)" value={forceNote} onChange={e => setForceNote(e.target.value)} />
                <button className="h-9 px-4 bg-primary text-white rounded font-semibold" onClick={finalizeClose}>Finalize close</button>
              </div>
            )}
            {detail.status !== 'open' && detail.status !== 'in_review' && (
              <div className="text-[12px] text-on-surface-variant mt-4">Finalized {detail.finalizedAt ? detail.finalizedAt.slice(0, 10) : ''} — period is {detail.periodStatus}.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default CloseScreen;
