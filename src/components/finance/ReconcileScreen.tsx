'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import { DomainKey } from '@/data/shellData';
import { useBankAccounts, useReconcileWorkspace, reconcileMutations, type ReconcileSummaryDto } from '@/hooks/useAccountingApi';
import type { BankStatement } from '@/lib/bankDetailTypes';
import styles from './ReconcileScreen.module.css';

const fmtDate = (iso: string) => {
  if (!iso) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[2]}/${m[3]}/${m[1]}` : iso;
};
const todayISO = () => new Date().toISOString().slice(0, 10);
const monthEndISO = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0).toISOString().slice(0, 10);
};

interface ReconcileTxn {
  id: string;
  date: string;
  desc: string;
  payee: string;
  amount: number;
  cleared: boolean;
  type: 'payment' | 'deposit';
}

export interface ReconcileScreenProps {
  onNavigate: (domain: DomainKey, screenId: string) => void;
  onToast?: (msg: string) => void;
}

export default function ReconcileScreen({ onNavigate, onToast }: ReconcileScreenProps) {
  const { bankAccounts } = useBankAccounts();
  const [accountId, setAccountId] = useState<string | null>(null);
  useEffect(() => {
    if (!accountId && bankAccounts.length) setAccountId(bankAccounts[0].id);
  }, [bankAccounts, accountId]);
  const { workspace, refresh: refreshWorkspace } = useReconcileWorkspace(accountId);

  const [statementEndingBalance, setStatementEndingBalance] = useState('');
  const [statementEndingDate, setStatementEndingDate] = useState(monthEndISO());
  const [summary, setSummary] = useState<ReconcileSummaryDto | null>(null);

  // ── Batch D: bank statements. The reconcile workspace takes the
  //    statement ending balance as manual input and never saved it —
  //    acct_bank_statements had no route and no screen. This panel lists
  //    the recorded statements and lets the current one be saved. ──
  const [statements, setStatements] = useState<BankStatement[] | null>(null);
  const [statementError, setStatementError] = useState<string | null>(null);
  const [showStatementForm, setShowStatementForm] = useState(false);

  const loadStatements = async () => {
    const j = await fetch('/api/bank-statements').then((r) => r.json()).catch(() => null);
    if (j?.error) { setStatementError(j.error.message || 'Statements load failed'); return; }
    setStatements((j?.data || []) as BankStatement[]);
  };

  useEffect(() => {
    void loadStatements();
  }, []);

  /* When a reconciliation is already in progress for the account,
     resume it: statement fields + beginning balance come from it */
  useEffect(() => {
    if (workspace?.active) {
      setStatementEndingBalance(
        workspace.active.statementEndingBalance != null ? String(workspace.active.statementEndingBalance) : '',
      );
      if (workspace.active.statementEndDate) setStatementEndingDate(workspace.active.statementEndDate);
    }
  }, [workspace?.active?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  const activeId = workspace?.active?.id || null;
  useEffect(() => {
    if (!activeId) {
      setSummary(null);
      return;
    }
    let alive = true;
    void reconcileMutations.summary(activeId).then((res) => {
      if (alive && res.ok && res.data) setSummary(res.data);
    });
    return () => {
      alive = false;
    };
  }, [activeId, workspace]);

  const beginningBalance = summary?.beginningBalance ?? workspace?.beginningBalance ?? 0;

  /* Lines visible in the workspace: posted on or before the statement
     date. Payments are negative lines, deposits positive. */
  const txns: ReconcileTxn[] = useMemo(
    () =>
      (workspace?.lines || [])
        .filter((l) => !statementEndingDate || l.date <= statementEndingDate)
        .map((l) => ({
          id: l.id,
          date: fmtDate(l.date),
          desc: l.description,
          payee: l.description,
          amount: Math.abs(l.amount),
          cleared: l.cleared,
          type: l.amount < 0 ? 'payment' : 'deposit',
        })),
    [workspace, statementEndingDate],
  );

  // Toast
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  const showToast = (msg: string) => {
    if (onToast) onToast(msg);
    setToastMsg(msg);
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setToastMsg(null), 2200);
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Payments and Deposits calculations
  const payments = useMemo(() => txns.filter((t) => t.type === 'payment'), [txns]);
  const deposits = useMemo(() => txns.filter((t) => t.type === 'deposit'), [txns]);

  const clearedPaymentsTotal = useMemo(() => {
    return payments.filter((p) => p.cleared).reduce((sum, p) => sum + p.amount, 0);
  }, [payments]);

  const clearedDepositsTotal = useMemo(() => {
    return deposits.filter((d) => d.cleared).reduce((sum, d) => sum + d.amount, 0);
  }, [deposits]);

  // Cleared Balance = Beginning Balance - Cleared Payments + Cleared
  // Deposits. With an active reconciliation the platform summary is
  // authoritative; before start, the same math runs over local toggles
  const targetEnding = parseFloat(statementEndingBalance) || 0;
  const clearedBalance = summary ? summary.clearedBalance : beginningBalance - clearedPaymentsTotal + clearedDepositsTotal;
  const difference = clearedBalance - targetEnding;
  const isBalanced = Math.abs(difference) < 0.01;

  /* Marking requires a reconciliation row — start one on first use
     with the statement values currently in the form */
  const ensureStarted = async (): Promise<string | null> => {
    if (activeId) return activeId;
    if (!accountId) return null;
    if (!statementEndingBalance || Number.isNaN(parseFloat(statementEndingBalance))) {
      showToast('Enter the statement ending balance first');
      return null;
    }
    const res = await reconcileMutations.start({
      bankAccountId: accountId,
      statementEndDate: statementEndingDate,
      statementEndingBalance: parseFloat(statementEndingBalance),
    });
    if (!res.ok || !res.data) {
      showToast(res.error || 'Reconciliation could not be started');
      return null;
    }
    await refreshWorkspace();
    return res.data.id;
  };

  const handleToggleTxn = async (id: string) => {
    const recId = await ensureStarted();
    if (!recId) return;
    const line = txns.find((t) => t.id === id);
    if (!line) return;
    const res = await reconcileMutations.mark(recId, [id], !line.cleared);
    if (res.ok) await refreshWorkspace();
    else showToast(res.error || 'Mark failed');
  };

  const handleToggleAll = async (type: 'payment' | 'deposit', nextVal: boolean) => {
    const recId = await ensureStarted();
    if (!recId) return;
    const ids = txns.filter((t) => t.type === type && t.cleared !== nextVal).map((t) => t.id);
    if (!ids.length) return;
    const res = await reconcileMutations.mark(recId, ids, nextVal);
    if (res.ok) await refreshWorkspace();
    else showToast(res.error || 'Mark failed');
  };

  const handleToggleAllPayments = (e: React.ChangeEvent<HTMLInputElement>) => {
    void handleToggleAll('payment', e.target.checked);
  };

  const handleToggleAllDeposits = (e: React.ChangeEvent<HTMLInputElement>) => {
    void handleToggleAll('deposit', e.target.checked);
  };

  const handleFinishNow = async () => {
    if (!isBalanced) {
      showToast(`Cannot close: Difference is $${Math.abs(difference).toFixed(2)}. Adjust items or save for later.`);
      return;
    }
    const recId = await ensureStarted();
    if (!recId) return;
    const res = await reconcileMutations.finish(recId);
    if (res.ok) {
      showToast('Reconciliation complete — period closed.');
      await refreshWorkspace();
      setTimeout(() => onNavigate('finance', 'accounting'), 1200);
    } else showToast(res.error || 'Finish failed');
  };

  const handleSaveForLater = () => {
    showToast(
      activeId
        ? 'Reconciliation progress is saved on the server. Returning to overview.'
        : 'Nothing started yet — enter a statement balance and check a line to begin.',
    );
    if (activeId) onNavigate('finance', 'accounting');
  };

  return (
    <div className={styles.container}>
      {/* Context Header */}
      <div className={styles.contextHeader}>
        <div className={styles.breadcrumbsGroup}>
          <span className={`material-symbols-outlined ${styles.breadcrumbDomainIcon}`}>
            account_balance
          </span>
          <span className={styles.breadcrumbDomain}>Finance</span>
          <span className={styles.breadcrumbSep}>/</span>
          <span className={styles.breadcrumbSection}>Accounting</span>
          <span className={styles.breadcrumbSep}>/</span>
          <span className={styles.breadcrumbActive}>Reconcile</span>
        </div>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#5a6355' }}>
          {workspace?.active
            ? `In progress — statement ending ${workspace.active.statementEndDate ? fmtDate(workspace.active.statementEndDate) : ''}`
            : workspace && workspace.pastCount > 0
              ? `${workspace.pastCount} past reconciliation${workspace.pastCount === 1 ? '' : 's'}`
              : 'No reconciliations yet'}
        </div>
      </div>

      <main className={styles.main}>
        {/* Page Header */}
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.pageTitle}>Reconcile account</h1>
            <p className={styles.pageSubtitle}>
              Match bank statement transactions to your books until difference is $0.00.
            </p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={() => onNavigate('finance', 'accounting')}
            >
              Back to overview
            </button>
          </div>
        </div>

        {/* Setup Parameters */}
        <div className={styles.setupCard}>
          <div>
            <label className={styles.fieldLabel}>Account</label>
            <select
              className={styles.fieldInput}
              value={accountId || ''}
              onChange={(e) => setAccountId(e.target.value)}
            >
              {bankAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}{a.maskedNumber ? ` •${a.maskedNumber}` : ''} ({a.accountType})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={styles.fieldLabel}>Beginning balance</label>
            <input
              className={styles.fieldInput}
              readOnly
              value={`$${beginningBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}`}
              style={{ backgroundColor: '#f4f3f7', fontVariantNumeric: 'tabular-nums' }}
            />
          </div>

          <div>
            <label className={styles.fieldLabel}>Statement ending balance</label>
            <input
              className={styles.fieldInput}
              value={statementEndingBalance}
              onChange={(e) => setStatementEndingBalance(e.target.value)}
              style={{ fontVariantNumeric: 'tabular-nums' }}
            />
          </div>

          <div>
            <label className={styles.fieldLabel}>Statement ending date</label>
            <input
              type="date"
              className={styles.fieldInput}
              value={statementEndingDate}
              onChange={(e) => setStatementEndingDate(e.target.value)}
            />
          </div>
        </div>

        {/* Tie-Out Calculator Banner */}
        <div className={styles.tieOutBanner}>
          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Statement Ending Balance</span>
            <span className={styles.summaryVal}>
              ${targetEnding.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </div>

          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Cleared Balance</span>
            <span className={styles.summaryVal}>
              ${clearedBalance.toLocaleString(undefined, { minimumFractionDigits: 2 })}
            </span>
          </div>

          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>
              Cleared Activity ({payments.filter((p) => p.cleared).length} debits,{' '}
              {deposits.filter((d) => d.cleared).length} credits)
            </span>
            <span style={{ fontSize: 13, color: '#5a6355', marginTop: 4 }}>
              −${clearedPaymentsTotal.toFixed(2)} / +${clearedDepositsTotal.toFixed(2)}
            </span>
          </div>

          <div className={styles.summaryItem}>
            <span className={styles.summaryLabel}>Difference</span>
            <span
              className={`${styles.summaryVal} ${
                isBalanced ? styles.diffBalanced : styles.diffUnbalanced
              }`}
            >
              {isBalanced ? '$0.00' : `${difference < 0 ? '−' : '+'}$${Math.abs(difference).toFixed(2)}`}
            </span>
          </div>
        </div>

        {/* Side-by-side Tables */}
        <div className={styles.clearingGrid}>
          {/* Payments */}
          <div className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <h3 className={styles.sectionTitle}>
                Payments &amp; Charges ({payments.filter((p) => p.cleared).length} of{' '}
                {payments.length} cleared)
              </h3>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={payments.length > 0 && payments.every((p) => p.cleared)}
                  onChange={handleToggleAllPayments}
                  style={{ accentColor: '#0a6400' }}
                />
                Select all
              </label>
            </div>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th style={{ width: 36 }}></th>
                  <th>Date</th>
                  <th>Payee</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((p) => (
                  <tr key={p.id} onClick={() => void handleToggleTxn(p.id)} style={{ cursor: 'pointer' }}>
                    <td onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={p.cleared}
                        onChange={() => void handleToggleTxn(p.id)}
                        style={{ accentColor: '#0a6400' }}
                      />
                    </td>
                    <td>{p.date}</td>
                    <td style={{ fontWeight: 500 }}>{p.payee}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: '#ba1a1a', fontVariantNumeric: 'tabular-nums' }}>
                      −${p.amount.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Deposits */}
          <div className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <h3 className={styles.sectionTitle}>
                Deposits &amp; Credits ({deposits.filter((d) => d.cleared).length} of{' '}
                {deposits.length} cleared)
              </h3>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={deposits.length > 0 && deposits.every((d) => d.cleared)}
                  onChange={handleToggleAllDeposits}
                  style={{ accentColor: '#0a6400' }}
                />
                Select all
              </label>
            </div>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th style={{ width: 36 }}></th>
                  <th>Date</th>
                  <th>Payee</th>
                  <th style={{ textAlign: 'right' }}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {deposits.map((d) => (
                  <tr key={d.id} onClick={() => void handleToggleTxn(d.id)} style={{ cursor: 'pointer' }}>
                    <td onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={d.cleared}
                        onChange={() => void handleToggleTxn(d.id)}
                        style={{ accentColor: '#0a6400' }}
                      />
                    </td>
                    <td>{d.date}</td>
                    <td style={{ fontWeight: 500 }}>{d.payee}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: '#006c47', fontVariantNumeric: 'tabular-nums' }}>
                      +${d.amount.toFixed(2)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Bottom Actions Bar */}
        <div className={styles.bottomBar}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {isBalanced ? (
              <span style={{ color: '#0a6400', fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                  check_circle
                </span>
                Balanced! Ready to finish.
              </span>
            ) : (
              <span style={{ color: '#ba1a1a', fontWeight: 500, fontSize: 13, display: 'flex', alignItems: 'center', gap: 4 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>
                  error_outline
                </span>
                Difference is not $0.00 yet.
              </span>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className={styles.btnSecondary}
              onClick={handleSaveForLater}
            >
              Save for later
            </button>
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={() => void handleFinishNow()}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                fact_check
              </span>
              Finish now
            </button>
          </div>
        </div>

        {/* Bank statements — the record behind the ending balance above */}
        <div className={styles.sectionCard} style={{ marginTop: 16 }}>
          <div className={styles.sectionHeader}>
            <h3 className={styles.sectionTitle}>Bank statements ({(statements || []).length})</h3>
            <button type="button" className={styles.btnSecondary} onClick={() => { setStatementError(null); setShowStatementForm(!showStatementForm); }}>
              {showStatementForm ? 'Cancel' : 'Record statement'}
            </button>
          </div>
          {statementError && <div style={{ padding: '0 16px 12px', color: '#b3261e', fontSize: 13 }}>{statementError}</div>}
          {showStatementForm && (
            <form
              style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, padding: '0 16px 16px' }}
              onSubmit={async (e) => {
                e.preventDefault();
                const fd = new FormData(e.currentTarget);
                const res = await fetch('/api/bank-statements', {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    bankAccountId: String(fd.get('bankAccountId') || ''),
                    statementStart: String(fd.get('statementStart') || ''),
                    statementEnd: String(fd.get('statementEnd') || ''),
                    openingBalance: Number(fd.get('openingBalance') || 0),
                    closingBalance: Number(fd.get('closingBalance') || 0),
                  }),
                });
                const j = await res.json().catch(() => null);
                if (!res.ok || j?.error) { setStatementError(j?.error?.message || 'Statement save failed'); return; }
                setShowStatementForm(false);
                await loadStatements();
                showToast('Statement recorded');
              }}
            >
              <select name="bankAccountId" required defaultValue={accountId || ''} style={{ height: 36, border: '1px solid #dad9dd', borderRadius: 6, padding: '0 8px', fontSize: 13 }}>
                <option value="">— Bank account —</option>
                {bankAccounts.map((a) => (<option key={a.id} value={a.id}>{a.name}</option>))}
              </select>
              <input name="statementStart" type="date" required defaultValue={statementEndingDate ? statementEndingDate.slice(0, 8) + '01' : ''} style={{ height: 36, border: '1px solid #dad9dd', borderRadius: 6, padding: '0 8px', fontSize: 13 }} />
              <input name="statementEnd" type="date" required defaultValue={statementEndingDate} style={{ height: 36, border: '1px solid #dad9dd', borderRadius: 6, padding: '0 8px', fontSize: 13 }} />
              <input name="openingBalance" type="number" step="0.01" required defaultValue={beginningBalance} placeholder="Opening balance $" style={{ height: 36, border: '1px solid #dad9dd', borderRadius: 6, padding: '0 8px', fontSize: 13 }} />
              <input name="closingBalance" type="number" step="0.01" required defaultValue={statementEndingBalance} placeholder="Closing balance $" style={{ height: 36, border: '1px solid #dad9dd', borderRadius: 6, padding: '0 8px', fontSize: 13 }} />
              <button type="submit" className={styles.btnPrimary} style={{ gridColumn: '1 / -1', justifyContent: 'center' }}>Record statement</button>
            </form>
          )}
          {statements === null ? (
            <div style={{ padding: '0 16px 16px', fontSize: 13, color: '#5a6355' }}>Loading…</div>
          ) : statements.length === 0 ? (
            <div style={{ padding: '0 16px 16px', fontSize: 13, color: '#5a6355' }}>No statements recorded yet. The ending balance you type above is only saved when you record it here.</div>
          ) : (
            <div style={{ padding: '0 16px 16px' }}>
              {statements.map((s) => (
                <div key={s.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, padding: '8px 0', borderTop: '1px solid #f2f2f2', fontSize: 13 }}>
                  <span>
                    <span style={{ fontWeight: 600 }}>{s.bankAccountName || '—'}</span>
                    <span style={{ display: 'block', fontSize: 11, color: '#5a6355' }}>{s.statementStart} → {s.statementEnd} · ${s.openingBalance.toFixed(2)} → ${s.closingBalance.toFixed(2)}</span>
                  </span>
                  <button
                    type="button"
                    className={styles.btnSecondary}
                    onClick={async () => {
                      const res = await fetch(`/api/bank-statements/${s.id}`, { method: 'DELETE' });
                      if (!res.ok) { showToast('Delete failed'); return; }
                      await loadStatements();
                      showToast('Statement deleted');
                    }}
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Toast */}
      {toastMsg && (
        <div className={styles.toast}>
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
            check_circle
          </span>
          {toastMsg}
        </div>
      )}
    </div>
  );
}
