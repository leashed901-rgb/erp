'use client';
import { useState, useEffect, useCallback } from 'react';
import type { ConsolidationGroup, ConsolidationMember, ConsolidationRun, IntercompanyPartner, IntercompanyTxn, FxRun } from '@/lib/batchITypes';
import { fmtMoney, fmtDate, cap } from '@/lib/batchITypes';

/**
 * Consolidation screen (doc 28 Batch I) — consolidation groups,
 * runs, intercompany partners/transactions, and FX revaluation.
 * The FX engine (acct_fx_revalue) revalues open foreign-currency
 * AR/AP, posts the gain/loss journal and schedules its next-day
 * reversal; the run route records the run row the engine does not
 * write itself. Consolidation runs execute through
 * POST /api/consolidation-runs/[id]/run, which aggregates the
 * members' trial balances and posts the delta as one adjusting
 * journal; the fx and elimination figures on the run stay as the
 * user recorded them (judgment inputs, not engine-computed lines).
 */

const TXN_STATUSES = ['draft', 'pending', 'matched', 'posted', 'eliminated', 'disputed', 'cancelled'];

interface Props {
  onToast: (msg: string) => void;
}

interface Entity {
  id: string;
  name: string;
}

interface Period {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
}

interface Book {
  id: string;
  name: string;
}

export default function ConsolidationScreen({ onToast }: Props) {
  type Tab = 'groups' | 'runs' | 'intercompany' | 'fx';
  const [tab, setTab] = useState<Tab>('groups');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<ConsolidationGroup[] | null>(null);
  const [runs, setRuns] = useState<ConsolidationRun[] | null>(null);
  const [partners, setPartners] = useState<IntercompanyPartner[] | null>(null);
  const [txns, setTxns] = useState<IntercompanyTxn[] | null>(null);
  const [fxRuns, setFxRuns] = useState<FxRun[] | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<ConsolidationGroup | null>(null);
  const [groupDetail, setGroupDetail] = useState<{ members: ConsolidationMember[]; runs: ConsolidationRun[] } | null>(null);
  const [showGroup, setShowGroup] = useState(false);
  const [showRun, setShowRun] = useState(false);
  const [showPartner, setShowPartner] = useState(false);
  const [showTxn, setShowTxn] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [fxAsOf, setFxAsOf] = useState(new Date().toISOString().slice(0, 10));
  const [fxResult, setFxResult] = useState<{ documents: number; netGain: number | null; journalId: string | null; reversalId: string | null } | null>(null);

  const loadTab = useCallback(async (t: Tab, force = false) => {
    setError(null);
    setLoading(true);
    try {
      if (t === 'groups' && (force || !groups)) {
        const j = await fetch('/api/consolidation-groups').then((r) => r.json()).catch(() => null);
        if (j?.error) throw new Error(j.error.message || 'Groups load failed');
        setGroups((j?.data || []) as ConsolidationGroup[]);
      } else if (t === 'runs' && (force || !runs)) {
        const j = await fetch('/api/consolidation-runs').then((r) => r.json()).catch(() => null);
        if (j?.error) throw new Error(j.error.message || 'Runs load failed');
        setRuns((j?.data || []) as ConsolidationRun[]);
      } else if (t === 'intercompany' && (force || !partners || !txns)) {
        const [pj, tj] = await Promise.all([
          fetch('/api/intercompany-partners').then((r) => r.json()).catch(() => null),
          fetch('/api/intercompany-transactions').then((r) => r.json()).catch(() => null),
        ]);
        if (pj?.error) throw new Error(pj.error.message || 'Partners load failed');
        if (tj?.error) throw new Error(tj.error.message || 'Transactions load failed');
        setPartners((pj?.data || []) as IntercompanyPartner[]);
        setTxns((tj?.data || []) as IntercompanyTxn[]);
      } else if (t === 'fx' && (force || !fxRuns)) {
        const j = await fetch('/api/fx-revaluation-runs').then((r) => r.json()).catch(() => null);
        if (j?.error) throw new Error(j.error.message || 'FX runs load failed');
        setFxRuns((j?.data || []) as FxRun[]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [groups, runs, partners, txns, fxRuns]);

  useEffect(() => { loadTab('groups'); }, [loadTab]);

  const openGroup = async (g: ConsolidationGroup) => {
    setSelectedGroup(g);
    const j = await fetch(`/api/consolidation-groups/${g.id}`).then((r) => r.json()).catch(() => null);
    setGroupDetail(j?.data ? { members: (j.data.members || []) as ConsolidationMember[], runs: (j.data.runs || []) as ConsolidationRun[] } : null);
  };

  const post = async (url: string, body: Record<string, unknown>, method = 'POST') => {
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j?.error) throw new Error(j?.error?.message || `Request failed (${r.status})`);
    return j;
  };

  const runConsolidation = async (runId: string) => {
    setBusy(true); setError(null);
    try {
      const j = await post(`/api/consolidation-runs/${runId}/run`, {});
      onToast(`Consolidation posted — ${Number(j?.data?.accounts ?? 0)} accounts, ${fmtMoney(j?.data?.totalDebit ?? 0)} debits`);
      await loadTab('runs', true);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  const runFx = async () => {
    setBusy(true); setError(null); setFxResult(null);
    try {
      const j = await post('/api/fx-revaluation-runs', { asOf: fxAsOf });
      setFxResult({ documents: Number(j?.data?.documents ?? 0), netGain: j?.data?.netGain ?? null, journalId: j?.data?.journalId ?? null, reversalId: j?.data?.reversalId ?? null });
      onToast(`FX revaluation posted — ${Number(j?.data?.documents ?? 0)} document(s), net gain ${fmtMoney(j?.data?.netGain ?? 0)}`);
      await loadTab('fx', true);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Consolidation</h1>
        <div className="flex gap-2">
          {tab === 'groups' && <button className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white" onClick={() => { setShowGroup(true); setFormError(null); }}>New group</button>}
          {tab === 'runs' && <button className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white" onClick={() => { setShowRun(true); setFormError(null); }}>Record run</button>}
          {tab === 'intercompany' && <><button className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white" onClick={() => { setShowPartner(true); setFormError(null); }}>New partner</button><button className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white" onClick={() => { setShowTxn(true); setFormError(null); }}>New transaction</button></>}
        </div>
      </div>

      <div className="mt-4 flex gap-2 border-b pb-2">
        {([['groups', 'Groups'], ['runs', 'Runs'], ['intercompany', 'Intercompany'], ['fx', 'FX revaluation']] as [Tab, string][]).map(([k, label]) => (
          <button key={k} className={tab === k ? 'rounded bg-gray-900 px-3 py-1 text-sm text-white' : 'rounded px-3 py-1 text-sm text-gray-600 hover:bg-gray-100'} onClick={() => { setTab(k); loadTab(k); }}>{label}</button>
        ))}
      </div>

      {error && <div className="mt-4 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      {loading && <div className="mt-4 text-sm text-gray-500">Loading…</div>}

      {!loading && tab === 'groups' && (
        <div className="mt-4 overflow-x-auto">
          {(groups?.length ?? 0) === 0 ? (
            <p className="text-sm text-gray-500">No consolidation groups yet. A group rolls several entities into one reporting currency.</p>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="text-left text-gray-500"><th className="py-2 pr-3">Code</th><th className="py-2 pr-3">Name</th><th className="py-2 pr-3">Reporting currency</th><th className="py-2 pr-3">Method</th><th className="py-2 text-right">Members</th><th className="py-2 text-right">Runs</th></tr></thead>
              <tbody>
                {groups!.map((g) => (
                  <tr key={g.id} className="cursor-pointer border-t hover:bg-gray-50" onClick={() => openGroup(g)}>
                    <td className="py-2 pr-3 font-mono text-xs">{g.code}</td>
                    <td className="py-2 pr-3">{g.name}</td>
                    <td className="py-2 pr-3">{g.reportingCurrency}</td>
                    <td className="py-2 pr-3">{g.consolidationMethod ?? '—'}</td>
                    <td className="py-2 text-right">{g.memberCount}</td>
                    <td className="py-2 text-right">{g.runCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {!loading && tab === 'runs' && (
        <div className="mt-4 overflow-x-auto">
          <p className="text-sm text-gray-600">A draft run aggregates the members&apos; trial balances and posts the delta as one adjusting journal — run it from the table. FX and elimination figures stay as recorded; they are judgment inputs, not engine-computed lines.</p>
          {(runs?.length ?? 0) === 0 ? (
            <p className="mt-2 text-sm text-gray-500">No runs recorded yet.</p>
          ) : (
            <table className="mt-2 w-full text-sm">
              <thead><tr className="text-left text-gray-500"><th className="py-2 pr-3">Group</th><th className="py-2 pr-3">Period</th><th className="py-2 pr-3">Status</th><th className="py-2 pr-3">Currency</th><th className="py-2 text-right">FX adjustment</th><th className="py-2 text-right">Elimination</th><th className="py-2 text-right">Run</th></tr></thead>
              <tbody>
                {runs!.map((r) => (
                  <tr key={r.id} className="border-t">
                    <td className="py-2 pr-3">{r.group}</td>
                    <td className="py-2 pr-3">{r.period}</td>
                    <td className="py-2 pr-3">{cap(r.status)}</td>
                    <td className="py-2 pr-3">{r.reportingCurrency}</td>
                    <td className="py-2 text-right">{r.fxAdjustment == null ? '—' : fmtMoney(r.fxAdjustment)}</td>
                    <td className="py-2 text-right">{r.eliminationAmount == null ? '—' : fmtMoney(r.eliminationAmount)}</td>
                    <td className="py-2 text-right">{r.status === 'draft' ? <button className="rounded bg-gray-900 px-3 py-1 text-xs text-white disabled:opacity-50" disabled={busy} onClick={() => runConsolidation(r.id)}>Run</button> : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {!loading && tab === 'intercompany' && (
        <div className="mt-4 space-y-6">
          <div>
            <h3 className="font-medium">Partners</h3>
            {(partners?.length ?? 0) === 0 ? (
              <p className="mt-1 text-sm text-gray-500">No intercompany partners yet. A partner is a pair of entities that trade with each other, with the due from/to accounts and an optional markup.</p>
            ) : (
              <table className="mt-2 w-full text-sm">
                <thead><tr className="text-left text-gray-500"><th className="py-2 pr-3">From</th><th className="py-2 pr-3">To</th><th className="py-2 pr-3">Markup %</th><th className="py-2 pr-3">Active</th></tr></thead>
                <tbody>
                  {partners!.map((p) => (
                    <tr key={p.id} className="border-t"><td className="py-2 pr-3">{p.fromEntity}</td><td className="py-2 pr-3">{p.toEntity}</td><td className="py-2 pr-3">{p.markupPercent == null ? '—' : `${p.markupPercent}%`}</td><td className="py-2 pr-3">{p.isActive ? 'Yes' : 'No'}</td></tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
          <div>
            <h3 className="font-medium">Transactions</h3>
            {(txns?.length ?? 0) === 0 ? (
              <p className="mt-1 text-sm text-gray-500">No intercompany transactions yet.</p>
            ) : (
              <table className="mt-2 w-full text-sm">
                <thead><tr className="text-left text-gray-500"><th className="py-2 pr-3">Date</th><th className="py-2 pr-3">From</th><th className="py-2 pr-3">To</th><th className="py-2 pr-3">Currency</th><th className="py-2 text-right">Amount</th><th className="py-2 pr-3">Status</th><th className="py-2 pr-3">Elimination</th><th className="py-2" /></tr></thead>
                <tbody>
                  {txns!.map((t) => (
                    <tr key={t.id} className="border-t">
                      <td className="py-2 pr-3">{fmtDate(t.transactionDate)}</td>
                      <td className="py-2 pr-3">{t.fromEntity}</td>
                      <td className="py-2 pr-3">{t.toEntity}</td>
                      <td className="py-2 pr-3">{t.currency}</td>
                      <td className="py-2 text-right">{fmtMoney(t.amount)}</td>
                      <td className="py-2 pr-3">{cap(t.status)}</td>
                      <td className="py-2 pr-3">{t.eliminationRequired ? 'Required' : 'No'}</td>
                      <td className="py-2"><select className="rounded border px-1 py-0.5 text-xs" value={t.status} onChange={async (e) => {
                        setBusy(true); setError(null);
                        try {
                          await post(`/api/intercompany-transactions?id=${t.id}`, { status: e.target.value }, 'PATCH');
                          onToast(`Transaction ${e.target.value}`);
                          await loadTab('intercompany', true);
                        } catch (err) { setError(err instanceof Error ? err.message : String(err)); }
                        finally { setBusy(false); }
                      }}>{TXN_STATUSES.map((s) => <option key={s} value={s}>{cap(s)}</option>)}</select></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {!loading && tab === 'fx' && (
        <div className="mt-4">
          <div className="flex flex-wrap items-end gap-2">
            <label className="block text-sm"><span className="text-gray-600">Revalue as of</span><div className="mt-1"><input className="w-full rounded border px-2 py-1.5 text-sm" type="date" value={fxAsOf} onChange={(e) => setFxAsOf(e.target.value)} /></div></label>
            <button className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50" disabled={busy} onClick={runFx}>Run FX revaluation</button>
            <span className="text-sm text-gray-500">Revalues open foreign-currency AR/AP at the latest rates, posts the gain/loss journal, and schedules its next-day reversal.</span>
          </div>
          {fxResult && (
            <div className="mt-3 rounded bg-green-50 px-3 py-2 text-sm text-green-800">
              {fxResult.documents} document(s) revalued · net gain {fmtMoney(fxResult.netGain ?? 0)} · journal {fxResult.journalId ? fxResult.journalId.slice(0, 8) + '…' : '—'} · reversal {fxResult.reversalId ? fxResult.reversalId.slice(0, 8) + '…' : '—'}
            </div>
          )}
          {(fxRuns?.length ?? 0) === 0 ? (
            <p className="mt-4 text-sm text-gray-500">No FX revaluation runs yet.</p>
          ) : (
            <table className="mt-4 w-full text-sm">
              <thead><tr className="text-left text-gray-500"><th className="py-2 pr-3">Date</th><th className="py-2 pr-3">Status</th><th className="py-2 pr-3">Journal</th></tr></thead>
              <tbody>
                {fxRuns!.map((r) => (
                  <tr key={r.id} className="border-t"><td className="py-2 pr-3">{fmtDate(r.revaluationDate)}</td><td className="py-2 pr-3">{cap(r.status)}</td><td className="py-2 pr-3 font-mono text-xs">{r.journalId ? r.journalId.slice(0, 8) + '…' : '—'}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {showGroup && (
        <GroupCreateForm
          error={formError}
          busy={busy}
          onCancel={() => setShowGroup(false)}
          onSubmit={async (body) => {
            setBusy(true); setFormError(null);
            try {
              await post('/api/consolidation-groups', body);
              setShowGroup(false);
              onToast('Consolidation group created');
              await loadTab('groups', true);
            } catch (e) { setFormError(e instanceof Error ? e.message : String(e)); }
            finally { setBusy(false); }
          }}
        />
      )}

      {showRun && (
        <RunCreateForm
          groups={groups ?? []}
          error={formError}
          busy={busy}
          onCancel={() => setShowRun(false)}
          onSubmit={async (body) => {
            setBusy(true); setFormError(null);
            try {
              await post('/api/consolidation-runs', body);
              setShowRun(false);
              onToast('Consolidation run recorded');
              await loadTab('runs', true);
            } catch (e) { setFormError(e instanceof Error ? e.message : String(e)); }
            finally { setBusy(false); }
          }}
        />
      )}

      {showPartner && (
        <PartnerCreateForm
          error={formError}
          busy={busy}
          onCancel={() => setShowPartner(false)}
          onSubmit={async (body) => {
            setBusy(true); setFormError(null);
            try {
              await post('/api/intercompany-partners', body);
              setShowPartner(false);
              onToast('Intercompany partner created');
              await loadTab('intercompany', true);
            } catch (e) { setFormError(e instanceof Error ? e.message : String(e)); }
            finally { setBusy(false); }
          }}
        />
      )}

      {showTxn && (
        <TxnCreateForm
          error={formError}
          busy={busy}
          onCancel={() => setShowTxn(false)}
          onSubmit={async (body) => {
            setBusy(true); setFormError(null);
            try {
              await post('/api/intercompany-transactions', body);
              setShowTxn(false);
              onToast('Intercompany transaction recorded');
              await loadTab('intercompany', true);
            } catch (e) { setFormError(e instanceof Error ? e.message : String(e)); }
            finally { setBusy(false); }
          }}
        />
      )}

      {selectedGroup && (
        <GroupDrawer
          group={selectedGroup}
          members={groupDetail?.members ?? null}
          runs={groupDetail?.runs ?? null}
          onClose={() => { setSelectedGroup(null); setGroupDetail(null); }}
          onToast={onToast}
          onReload={async () => { await loadTab('groups', true); if (selectedGroup) openGroup(selectedGroup); }}
        />
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="text-gray-600">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

const inputCls = 'w-full rounded border px-2 py-1.5 text-sm';

function useEntities() {
  const [entities, setEntities] = useState<Entity[] | null>(null);
  const load = useCallback(async () => {
    if (!entities) {
      const j = await fetch('/api/entities').then((r) => r.json()).catch(() => null);
      setEntities((j?.data || []) as Entity[]);
    }
  }, [entities]);
  return { entities, load };
}

function GroupCreateForm({ error, busy, onCancel, onSubmit }: {
  error: string | null; busy: boolean;
  onCancel: () => void; onSubmit: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [reportingCurrency, setReportingCurrency] = useState('USD');
  const [consolidationMethod, setConsolidationMethod] = useState('');
  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-md overflow-y-auto bg-white p-6 shadow-xl">
      <h2 className="text-lg font-semibold">New consolidation group</h2>
      {error && <div className="mt-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <div className="mt-4 space-y-3">
        <Field label="Code"><input className={inputCls} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. GROUP" /></Field>
        <Field label="Name"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Reporting currency"><input className={inputCls} value={reportingCurrency} onChange={(e) => setReportingCurrency(e.target.value.toUpperCase())} maxLength={3} /></Field>
        <Field label="Consolidation method"><input className={inputCls} value={consolidationMethod} onChange={(e) => setConsolidationMethod(e.target.value)} placeholder="e.g. full, proportional" /></Field>
      </div>
      <div className="mt-5 flex gap-2">
        <button className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50" disabled={busy || !code || !name} onClick={() => onSubmit({ code, name, reportingCurrency, consolidationMethod: consolidationMethod || null })}>Create group</button>
        <button className="rounded px-3 py-1.5 text-sm text-gray-600" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function RunCreateForm({ groups, error, busy, onCancel, onSubmit }: {
  groups: ConsolidationGroup[]; error: string | null; busy: boolean;
  onCancel: () => void; onSubmit: (body: Record<string, unknown>) => Promise<void>;
}) {
  const [groupId, setGroupId] = useState('');
  const [periodId, setPeriodId] = useState('');
  const [reportingCurrency, setReportingCurrency] = useState('USD');
  const [fxAdjustment, setFxAdjustment] = useState('');
  const [eliminationAmount, setEliminationAmount] = useState('');
  const [periods, setPeriods] = useState<Period[] | null>(null);
  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-md overflow-y-auto bg-white p-6 shadow-xl">
      <h2 className="text-lg font-semibold">Record consolidation run</h2>
      <p className="mt-1 text-sm text-gray-600">Record the run, then run it from the table — the runner aggregates the members&apos; trial balances and posts the delta as one adjusting journal. FX and elimination are judgment inputs you record here.</p>
      {error && <div className="mt-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <div className="mt-4 space-y-3">
        <Field label="Group"><select className={inputCls} value={groupId} onChange={(e) => setGroupId(e.target.value)}><option value="">—</option>{groups.map((g) => <option key={g.id} value={g.id}>{g.code} — {g.name}</option>)}</select></Field>
        <Field label="Period"><select className={inputCls} value={periodId} onChange={(e) => setPeriodId(e.target.value)} onFocus={async () => { if (!periods) { const j = await fetch('/api/close/periods').then((r) => r.json()).catch(() => null); setPeriods((j?.data?.periods || []) as Period[]); } }}><option value="">—</option>{(periods ?? []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label="Reporting currency"><input className={inputCls} value={reportingCurrency} onChange={(e) => setReportingCurrency(e.target.value.toUpperCase())} maxLength={3} /></Field>
        <Field label="FX adjustment"><input className={inputCls} type="number" step="0.01" value={fxAdjustment} onChange={(e) => setFxAdjustment(e.target.value)} /></Field>
        <Field label="Elimination amount"><input className={inputCls} type="number" step="0.01" value={eliminationAmount} onChange={(e) => setEliminationAmount(e.target.value)} /></Field>
      </div>
      <div className="mt-5 flex gap-2">
        <button className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50" disabled={busy || !groupId || !periodId} onClick={() => onSubmit({ groupId, periodId, reportingCurrency, fxAdjustment: fxAdjustment ? Number(fxAdjustment) : null, eliminationAmount: eliminationAmount ? Number(eliminationAmount) : null })}>Record run</button>
        <button className="rounded px-3 py-1.5 text-sm text-gray-600" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function PartnerCreateForm({ error, busy, onCancel, onSubmit }: {
  error: string | null; busy: boolean;
  onCancel: () => void; onSubmit: (body: Record<string, unknown>) => Promise<void>;
}) {
  const { entities, load } = useEntities();
  const [fromEntityId, setFromEntityId] = useState('');
  const [toEntityId, setToEntityId] = useState('');
  const [dueFromAccountId, setDueFromAccountId] = useState('');
  const [dueToAccountId, setDueToAccountId] = useState('');
  const [accounts, setAccounts] = useState<{ id: string; code: string; name: string }[]>([]);
  const [markupPercent, setMarkupPercent] = useState('');
  useEffect(() => {
    fetch('/api/accounts').then((r) => r.json()).then((j) => setAccounts(((j?.data || []) as { id: string; code: string; name: string }[]))).catch(() => null);
  }, []);
  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-md overflow-y-auto bg-white p-6 shadow-xl">
      <h2 className="text-lg font-semibold">New intercompany partner</h2>
      {error && <div className="mt-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <div className="mt-4 space-y-3">
        <Field label="From entity"><select className={inputCls} value={fromEntityId} onChange={(e) => setFromEntityId(e.target.value)} onFocus={load}><option value="">—</option>{(entities ?? []).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></Field>
        <Field label="To entity"><select className={inputCls} value={toEntityId} onChange={(e) => setToEntityId(e.target.value)} onFocus={load}><option value="">—</option>{(entities ?? []).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></Field>
        <Field label="Due-from account"><select className={inputCls} value={dueFromAccountId} onChange={(e) => setDueFromAccountId(e.target.value)}><option value="">—</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></Field>
        <Field label="Due-to account"><select className={inputCls} value={dueToAccountId} onChange={(e) => setDueToAccountId(e.target.value)}><option value="">—</option>{accounts.map((a) => <option key={a.id} value={a.id}>{a.code} · {a.name}</option>)}</select></Field>
        <Field label="Markup %"><input className={inputCls} type="number" step="0.01" value={markupPercent} onChange={(e) => setMarkupPercent(e.target.value)} /></Field>
      </div>
      <div className="mt-5 flex gap-2">
        <button className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50" disabled={busy || !fromEntityId || !toEntityId || fromEntityId === toEntityId || !dueFromAccountId || !dueToAccountId} onClick={() => onSubmit({ fromEntityId, toEntityId, dueFromAccountId, dueToAccountId, markupPercent: markupPercent ? Number(markupPercent) : null })}>Create partner</button>
        <button className="rounded px-3 py-1.5 text-sm text-gray-600" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function TxnCreateForm({ error, busy, onCancel, onSubmit }: {
  error: string | null; busy: boolean;
  onCancel: () => void; onSubmit: (body: Record<string, unknown>) => Promise<void>;
}) {
  const { entities, load } = useEntities();
  const [fromEntityId, setFromEntityId] = useState('');
  const [toEntityId, setToEntityId] = useState('');
  const [transactionDate, setTransactionDate] = useState(new Date().toISOString().slice(0, 10));
  const [currency, setCurrency] = useState('USD');
  const [amount, setAmount] = useState('');
  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-md overflow-y-auto bg-white p-6 shadow-xl">
      <h2 className="text-lg font-semibold">New intercompany transaction</h2>
      {error && <div className="mt-2 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
      <div className="mt-4 space-y-3">
        <Field label="From entity"><select className={inputCls} value={fromEntityId} onChange={(e) => setFromEntityId(e.target.value)} onFocus={load}><option value="">—</option>{(entities ?? []).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></Field>
        <Field label="To entity"><select className={inputCls} value={toEntityId} onChange={(e) => setToEntityId(e.target.value)} onFocus={load}><option value="">—</option>{(entities ?? []).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></Field>
        <Field label="Transaction date"><input className={inputCls} type="date" value={transactionDate} onChange={(e) => setTransactionDate(e.target.value)} /></Field>
        <Field label="Currency"><input className={inputCls} value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())} maxLength={3} /></Field>
        <Field label="Amount"><input className={inputCls} type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
      </div>
      <div className="mt-5 flex gap-2">
        <button className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50" disabled={busy || !fromEntityId || !toEntityId || fromEntityId === toEntityId || !amount} onClick={() => onSubmit({ fromEntityId, toEntityId, transactionDate, currency, amount: Number(amount) })}>Record transaction</button>
        <button className="rounded px-3 py-1.5 text-sm text-gray-600" onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}

function GroupDrawer({ group, members, runs, onClose, onToast, onReload }: {
  group: ConsolidationGroup;
  members: ConsolidationMember[] | null;
  runs: ConsolidationRun[] | null;
  onClose: () => void; onToast: (msg: string) => void; onReload: () => Promise<void>;
}) {
  const { entities, load } = useEntities();
  const [entityId, setEntityId] = useState('');
  const [ownershipPercent, setOwnershipPercent] = useState('');
  const [consolidationPercent, setConsolidationPercent] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const post = async (url: string, body: Record<string, unknown>, method = 'POST') => {
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || j?.error) throw new Error(j?.error?.message || `Request failed (${r.status})`);
    return j;
  };

  return (
    <div className="fixed inset-y-0 right-0 w-full max-w-lg overflow-y-auto bg-white p-6 shadow-xl">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">{group.code} — {group.name}</h2>
        <button className="text-sm text-gray-500" onClick={onClose}>Close</button>
      </div>
      <p className="mt-1 text-sm text-gray-600">Reporting {group.reportingCurrency} · method {group.consolidationMethod ?? '—'}</p>
      {err && <div className="mt-3 rounded bg-red-50 px-3 py-2 text-sm text-red-700">{err}</div>}

      <h3 className="mt-5 font-medium">Members</h3>
      {(members?.length ?? 0) === 0 ? (
        <p className="mt-1 text-sm text-gray-500">No members yet.</p>
      ) : (
        <table className="mt-2 w-full text-sm">
          <thead><tr className="text-left text-gray-500"><th className="py-1 pr-3">Entity</th><th className="py-1 pr-3">Ownership %</th><th className="py-1 pr-3">Consolidation %</th><th className="py-1" /></tr></thead>
          <tbody>
            {members!.map((m) => (
              <tr key={m.id} className="border-t">
                <td className="py-1 pr-3">{m.entity}</td>
                <td className="py-1 pr-3">{m.ownershipPercent == null ? '—' : `${m.ownershipPercent}%`}</td>
                <td className="py-1 pr-3">{m.consolidationPercent == null ? '—' : `${m.consolidationPercent}%`}</td>
                <td className="py-1"><button className="text-xs text-red-600" onClick={async () => {
                  setBusy(true); setErr(null);
                  try {
                    const r = await fetch(`/api/consolidation-members?id=${m.id}`, { method: 'DELETE' });
                    const j = await r.json().catch(() => ({}));
                    if (!r.ok || j?.error) throw new Error(j?.error?.message || 'Delete failed');
                    await onReload();
                  } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
                  finally { setBusy(false); }
                }}>Remove</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <div className="mt-4 rounded border p-3">
        <h3 className="font-medium">Add member</h3>
        <div className="mt-3 space-y-3">
          <Field label="Entity"><select className={inputCls} value={entityId} onChange={(e) => setEntityId(e.target.value)} onFocus={load}><option value="">—</option>{(entities ?? []).map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}</select></Field>
          <Field label="Ownership %"><input className={inputCls} type="number" step="0.01" min="0" max="100" value={ownershipPercent} onChange={(e) => setOwnershipPercent(e.target.value)} /></Field>
          <Field label="Consolidation %"><input className={inputCls} type="number" step="0.01" min="0" max="100" value={consolidationPercent} onChange={(e) => setConsolidationPercent(e.target.value)} /></Field>
          <button className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white disabled:opacity-50" disabled={busy || !entityId} onClick={async () => {
            setBusy(true); setErr(null);
            try {
              await post('/api/consolidation-members', { groupId: group.id, entityId, ownershipPercent: ownershipPercent ? Number(ownershipPercent) : null, consolidationPercent: consolidationPercent ? Number(consolidationPercent) : null });
              setEntityId(''); setOwnershipPercent(''); setConsolidationPercent('');
              onToast('Member added');
              await onReload();
            } catch (e) { setErr(e instanceof Error ? e.message : String(e)); }
            finally { setBusy(false); }
          }}>Add member</button>
        </div>
      </div>

      <h3 className="mt-6 font-medium">Runs</h3>
      {(runs?.length ?? 0) === 0 ? (
        <p className="mt-1 text-sm text-gray-500">No runs for this group yet.</p>
      ) : (
        <table className="mt-2 w-full text-sm">
          <thead><tr className="text-left text-gray-500"><th className="py-1 pr-3">Period</th><th className="py-1 pr-3">Status</th><th className="py-1 text-right">FX adj.</th><th className="py-1 text-right">Elimination</th></tr></thead>
          <tbody>
            {runs!.map((r) => (
              <tr key={r.id} className="border-t"><td className="py-1 pr-3">{r.period}</td><td className="py-1 pr-3">{cap(r.status)}</td><td className="py-1 text-right">{r.fxAdjustment == null ? '—' : fmtMoney(r.fxAdjustment)}</td><td className="py-1 text-right">{r.eliminationAmount == null ? '—' : fmtMoney(r.eliminationAmount)}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
