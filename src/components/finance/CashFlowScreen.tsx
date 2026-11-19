'use client';

import { useMemo, useState } from 'react';
import { DomainKey } from '@/data/shellData';
import { useCashflowForecast } from '@/hooks/useAccountingApi';
import styles from './CashFlowScreen.module.css';

export interface CashFlowScreenProps {
  onNavigate: (domain: DomainKey, screenId: string) => void;
  onToast?: (msg: string) => void;
}

/* Read-only forecast built live from bank balances, open invoices and
   open bills (/api/accounting/cashflow-forecast). */

const fmt = (n: number) =>
  n.toLocaleString('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2 });

const DAY = 86400000;
const fmtDate = (d: Date) =>
  d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
const fmtFull = (isoDate: string) =>
  new Date(`${isoDate}T12:00:00`).toLocaleDateString('en-US', {
    month: 'numeric',
    day: 'numeric',
    year: 'numeric',
  });

interface FlowWindow {
  id: 'w30' | 'w60' | 'w90';
  label: string;
  range: string;
  moneyIn: number;
  moneyOut: number;
}

export default function CashFlowScreen({ onToast }: CashFlowScreenProps) {
  const { data } = useCashflowForecast();
  const [lateInvoice, setLateInvoice] = useState<boolean>(false);

  const cashOnHand = data?.cashOnHand ?? 0;
  const asOf = data ? new Date(`${data.asOf}T12:00:00`) : new Date();

  /* The what-if target: the largest open invoice. */
  const lateTarget = useMemo(() => {
    const invoices = data?.invoices ?? [];
    if (invoices.length === 0) return null;
    const top = [...invoices].sort((a, b) => b.amount - a.amount)[0];
    const late = new Date(new Date(`${top.dueDate}T12:00:00`).getTime() + 18 * DAY);
    return { ...top, paysAt: late.toISOString().slice(0, 10) };
  }, [data]);

  const windows = useMemo<FlowWindow[]>(() => {
    const start = asOf.getTime();
    const mk = (id: FlowWindow['id'], label: string, fromDays: number, toDays: number): FlowWindow => ({
      id,
      label,
      range: `${fmtDate(new Date(start + fromDays * DAY))} – ${fmtDate(new Date(start + toDays * DAY))}`,
      moneyIn: 0,
      moneyOut: 0,
    });
    const ws = [mk('w30', 'Next 30 days', 0, 29), mk('w60', 'Days 31 – 60', 30, 59), mk('w90', 'Days 61 – 90', 60, 89)];
    const bucket = (isoDate: string) => {
      const days = Math.floor((new Date(`${isoDate}T12:00:00`).getTime() - start) / DAY);
      if (days < 30) return ws[0]; // overdue lands in the first window
      if (days < 60) return ws[1];
      if (days < 90) return ws[2];
      return null;
    };
    for (const inv of data?.invoices ?? []) {
      if (!inv.dueDate) continue;
      const due = lateInvoice && lateTarget && inv.id === lateTarget.id ? lateTarget.paysAt : inv.dueDate;
      const w = bucket(due);
      if (w) w.moneyIn += inv.amount;
    }
    for (const bill of data?.bills ?? []) {
      if (!bill.dueDate) continue;
      const w = bucket(bill.dueDate);
      if (w) w.moneyOut += bill.amount;
    }
    return ws;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, lateInvoice, lateTarget]);

  const cumulative = useMemo(() => {
    const rows: (FlowWindow & { cumIn: number; cumOut: number; balance: number })[] = [];
    let inSum = 0;
    let outSum = 0;
    for (const w of windows) {
      inSum += w.moneyIn;
      outSum += w.moneyOut;
      rows.push({ ...w, cumIn: inSum, cumOut: outSum, balance: cashOnHand + inSum - outSum });
    }
    return rows;
  }, [windows, cashOnHand]);

  const maxFlow = Math.max(1, ...windows.map((w) => Math.max(w.moneyIn, w.moneyOut)));
  const next30 = cumulative[0];
  const totalIn = cumulative[2].cumIn;
  const totalOut = cumulative[2].cumOut;
  const endBalance = cumulative[2].balance;

  const sources = useMemo(() => {
    const invoices = data?.invoices ?? [];
    const bills = data?.bills ?? [];
    const invTotal = invoices.reduce((s, i) => s + i.amount, 0);
    const billTotal = bills.reduce((s, b) => s + b.amount, 0);
    const overdueCount =
      invoices.filter((i) => i.dueDate && i.dueDate < data!.asOf).length +
      bills.filter((b) => b.dueDate && b.dueDate < data!.asOf).length;
    const overdueTotal =
      invoices.filter((i) => i.dueDate && i.dueDate < data!.asOf).reduce((s, i) => s + i.amount, 0) +
      bills.filter((b) => b.dueDate && b.dueDate < data!.asOf).reduce((s, b) => s + b.amount, 0);
    return [
      { icon: 'receipt_long', label: 'Open invoices', detail: `${invoices.length} invoices · ${fmt(invTotal)} expected`, tone: 'in' },
      { icon: 'description', label: 'Open bills', detail: `${bills.length} bills · ${fmt(billTotal)} due`, tone: 'out' },
      { icon: 'account_balance', label: 'Bank accounts', detail: `${data?.accounts.length ?? 0} accounts · ${fmt(cashOnHand)} on hand`, tone: 'in' },
      { icon: 'warning', label: 'Overdue today', detail: `${overdueCount} documents · ${fmt(overdueTotal)} past due`, tone: 'out' },
    ] as const;
  }, [data, cashOnHand]);

  const accountMeta = (data?.accounts ?? [])
    .map((a) => `${a.name}${a.mask ? ` •${a.mask}` : ''}`)
    .join(' · ');

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
          <span className={styles.breadcrumbActive}>Cash flow</span>
        </div>
        <div className={styles.readonlyBadge}>
          <span className="material-symbols-outlined" style={{ fontSize: 14 }}>
            lock
          </span>
          Read-only
        </div>
      </div>

      <main className={styles.main}>
        {/* Page Header */}
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.pageTitle}>Cash flow</h1>
            <p className={styles.pageSubtitle}>
              Money in, money out, and projected balance for the next 30, 60, and 90 days.
            </p>
          </div>
          {/* What-if toggle */}
          {lateTarget && (
            <button
              type="button"
              className={`${styles.whatIfToggle} ${lateInvoice ? styles.whatIfToggleOn : ''}`}
              data-whatif={lateInvoice ? 'on' : 'off'}
              aria-pressed={lateInvoice}
              onClick={() => {
                const next = !lateInvoice;
                setLateInvoice(next);
                if (onToast)
                  onToast(
                    next
                      ? `What-if: ${lateTarget.no} now assumed to pay ${fmtFull(lateTarget.paysAt)}`
                      : `What-if cleared — ${lateTarget.no} back on ${fmtFull(lateTarget.dueDate!)}`
                  );
              }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                {lateInvoice ? 'toggle_on' : 'toggle_off'}
              </span>
              <span className={styles.whatIfText}>
                What if this invoice pays late
                <span className={styles.whatIfMeta}>
                  {lateTarget.no} · {fmt(lateTarget.amount)} · due {fmtFull(lateTarget.dueDate!)}
                </span>
              </span>
            </button>
          )}
        </div>

        {/* KPI row */}
        <div className={styles.kpiRow}>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Cash on hand today</span>
            <span className={styles.kpiValue}>{fmt(cashOnHand)}</span>
            <span className={styles.kpiMeta}>{accountMeta || 'No bank accounts'}</span>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Money in · next 30 days</span>
            <span className={`${styles.kpiValue} ${styles.kpiIn}`}>{fmt(next30.moneyIn)}</span>
            <span className={styles.kpiMeta}>
              {lateInvoice && lateTarget
                ? `Excludes ${lateTarget.no} (${fmt(lateTarget.amount)})`
                : 'Includes all open invoices'}
            </span>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Money out · next 30 days</span>
            <span className={`${styles.kpiValue} ${styles.kpiOut}`}>{fmt(next30.moneyOut)}</span>
            <span className={styles.kpiMeta}>Open bills by due date</span>
          </div>
          <div className={styles.kpiCard}>
            <span className={styles.kpiLabel}>Projected balance · 30 days</span>
            <span className={styles.kpiValue}>{fmt(next30.balance)}</span>
            <span className={styles.kpiMeta}>
              60d {fmt(cumulative[1].balance)} · 90d {fmt(cumulative[2].balance)}
            </span>
          </div>
        </div>

        {/* Projection windows */}
        <section className={styles.panel} aria-label="Projected cash flow windows">
          <div className={styles.panelHead}>
            <h2 className={styles.panelTitle}>Projected cash flow</h2>
            <div className={styles.legend}>
              <span className={styles.legendItem}>
                <span className={`${styles.legendDot} ${styles.legendIn}`} /> Money in
              </span>
              <span className={styles.legendItem}>
                <span className={`${styles.legendDot} ${styles.legendOut}`} /> Money out
              </span>
            </div>
          </div>
          <div className={styles.windowGrid}>
            {cumulative.map((w, idx) => (
              <div key={w.id} className={styles.windowCard} data-window={w.id}>
                <div className={styles.windowHead}>
                  <span className={styles.windowLabel}>{w.label}</span>
                  <span className={styles.windowRange}>{w.range}</span>
                </div>
                <div className={styles.barRow}>
                  <span className={styles.barLabel}>In</span>
                  <div className={styles.barTrack}>
                    <div
                      className={`${styles.bar} ${styles.barIn}`}
                      style={{ width: `${Math.max((w.moneyIn / maxFlow) * 100, w.moneyIn > 0 ? 2 : 0)}%` }}
                    />
                  </div>
                  <span className={styles.barValue}>{fmt(w.moneyIn)}</span>
                </div>
                <div className={styles.barRow}>
                  <span className={styles.barLabel}>Out</span>
                  <div className={styles.barTrack}>
                    <div
                      className={`${styles.bar} ${styles.barOut}`}
                      style={{ width: `${Math.max((w.moneyOut / maxFlow) * 100, w.moneyOut > 0 ? 2 : 0)}%` }}
                    />
                  </div>
                  <span className={styles.barValue}>{fmt(w.moneyOut)}</span>
                </div>
                <div className={styles.windowBalance}>
                  <span className={styles.windowBalanceLabel}>
                    Projected balance{idx > 0 ? ` · ${idx === 1 ? '60' : '90'}d` : ''}
                  </span>
                  <span className={styles.windowBalanceValue}>{fmt(w.balance)}</span>
                </div>
                {lateInvoice && lateTarget && windows[idx].id !== 'w30' && idx === 1 && (
                  <div className={styles.windowFlag}>
                    <span className="material-symbols-outlined" style={{ fontSize: 13 }}>
                      bolt
                    </span>
                    {lateTarget.no} may land in this window
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className={styles.windowFootnote}>
            90-day totals — money in {fmt(totalIn)} · money out {fmt(totalOut)} · ending balance{' '}
            {fmt(endBalance)}
          </div>
        </section>

        {/* Sources */}
        <section className={styles.panel} aria-label="Cash flow sources">
          <div className={styles.panelHead}>
            <h2 className={styles.panelTitle}>Built from</h2>
          </div>
          <div className={styles.sourceGrid}>
            {sources.map((s) => (
              <div key={s.label} className={styles.sourceCard} data-tone={s.tone}>
                <span className={`material-symbols-outlined ${styles.sourceIcon}`}>{s.icon}</span>
                <div>
                  <div className={styles.sourceLabel}>{s.label}</div>
                  <div className={styles.sourceDetail}>{s.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
