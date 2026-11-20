'use client';

import { useEffect, useState } from 'react';
import { DomainKey } from '@/data/shellData';
import RowMenu, { RowMenuItem, BulkBar } from '@/components/ListPrimitives';
import { useCarriers, orderMutations } from '@/hooks/useOrdersApi';
import { fetchJson } from '@/hooks/useCrmApi';
import styles from './OrdersPages.module.css';

const SHIPPING_TABS = ['Carriers', 'Packaging', 'Rules', 'Printer settings'] as const;

interface CarrierRow {
  id: string;
  carrier: string;
  badge: string;
  account: string;
  services: string;
  avgRate: string;
  status: 'Connected' | 'Disabled' | 'Needs auth';
}

interface OrdersScreenProps {
  onNavigate: (domain: DomainKey, screenId: string) => void;
  onToast: (msg: string) => void;
  onCreate?: (label: string) => void;
  onOpenCreateFlyout?: () => void;
}

interface PrinterSettings {
  receiptPaper: string;
  receiptAutoPrint: boolean;
  labelPaper: string;
  labelAutoPrint: boolean;
  documentPaper: string;
  documentAutoPrint: boolean;
  configured: boolean;
}

export function ShippingSettings({ onNavigate, onToast }: OrdersScreenProps) {
  const [activeTab, setActiveTab] = useState<string>('Carriers');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const { data: bundle, refresh } = useCarriers();
  const [rateCarrierId, setRateCarrierId] = useState<string | null>(null);
  const [printer, setPrinter] = useState<PrinterSettings | null>(null);
  const [savingPrinter, setSavingPrinter] = useState(false);

  useEffect(() => {
    if (activeTab !== 'Printer settings' || printer) return;
    fetchJson<{ data: PrinterSettings }>('/api/v1/shipping/printer-settings')
      .then((r) => { if (r.ok) setPrinter(r.data.data); })
      .catch(() => setPrinter(null));
  }, [activeTab, printer]);

  // Carriers + services from erp_carriers / erp_shipping_methods.
  const carriers: CarrierRow[] = (bundle?.carriers || []).map((c) => {
    const services = (bundle?.methods || []).filter((m) => m.carrierId === c.id);
    return {
      id: c.id,
      carrier: c.name,
      badge: (c.code || c.name).slice(0, 4).toUpperCase(),
      account: c.code || '—',
      services: services.length ? services.map((s) => s.name).join(' · ') : 'No services configured',
      avgRate: '—',
      status: c.isActive ? 'Connected' : 'Disabled',
    } as CarrierRow;
  });

  const filtered = carriers.filter(c => !search.trim() || c.carrier.toLowerCase().includes(search.toLowerCase()));
  const rateCarrier = rateCarrierId ? carriers.find((c) => c.id === rateCarrierId) : null;
  const rateServices = rateCarrierId ? (bundle?.methods || []).filter((m) => m.carrierId === rateCarrierId) : [];
  const profiles = bundle?.profiles || [];

  const toggleSelect = (id: string) =>
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const setActive = async (row: CarrierRow, active: boolean) => {
    try { await orderMutations.setCarrierActive(row.id, active); onToast(`${row.carrier} ${active ? 'enabled' : 'disabled'}`); refresh(); }
    catch { onToast(`Could not update ${row.carrier}`); }
  };

  const rowMenuItems = (row: CarrierRow): RowMenuItem[] => [
    { label: 'Test rates', icon: 'calculate', onClick: () => setRateCarrierId(row.id) },
    { label: 'Manage services', icon: 'list', onClick: () => setRateCarrierId(row.id) },
    row.status === 'Connected'
      ? { label: 'Disable carrier', icon: 'block', dividerBefore: true, onClick: () => setActive(row, false) }
      : { label: 'Enable carrier', icon: 'check_circle', dividerBefore: true, onClick: () => setActive(row, true) },
  ];

  const carrierBadgeClass = (carrier: string) => {
    if (carrier.includes('USPS')) return styles.carrierUSPS;
    if (carrier.includes('UPS')) return styles.carrierUPS;
    if (carrier.includes('FedEx')) return styles.carrierFedEx;
    if (carrier.includes('DHL')) return styles.carrierDHL;
    return styles.carrierUSPS;
  };

  const savePrinter = async () => {
    if (!printer) return;
    setSavingPrinter(true);
    try {
      const r = await fetchJson<{ data: PrinterSettings }>('/api/v1/shipping/printer-settings', {
        method: 'POST',
        body: JSON.stringify(printer),
      });
      if (!r.ok) throw new Error(r.error);
      setPrinter(r.data.data);
      onToast('Printer settings saved');
    } catch {
      onToast('Could not save printer settings');
    } finally {
      setSavingPrinter(false);
    }
  };

  const money = (n: number | null | undefined) => (n == null ? '—' : `$${n.toFixed(2)}`);

  return (
    <div className={styles.container}>
      <div className={styles.contextHeader}>
        <div className={styles.contextLeft}>
          <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#5a6355' }}>local_shipping</span>
          <span className={styles.contextLabel}>Orders</span>
          <span className={styles.contextSep}>/</span>
          <span className={styles.contextActive}>Shipping settings</span>
        </div>
      </div>

      <div className={styles.pageBody}>
        <div className={styles.pageHeader}>
          <div>
            <h1 className={styles.pageTitle}>Shipping settings</h1>
            <p className={styles.pageSubtitle}>Carrier accounts, packaging, delivery rules, and printers</p>
          </div>
        </div>

        {/* KPI tiles — all computed from live data */}
        <div className={styles.kpiGrid}>
          <div className={styles.kpiTile}>
            <div className={styles.kpiValue}>{carriers.filter((c) => c.status === 'Connected').length}</div>
            <div className={styles.kpiLabel}>Active carriers</div>
            <div className={styles.kpiDelta}>{carriers.filter((c) => c.status === 'Connected').map((c) => c.carrier).join(' · ') || 'None connected'}</div>
          </div>
          <button className={styles.kpiTile} onClick={() => onNavigate('orders', 'batch-slips-&-labels')}>
            <div className={styles.kpiValue}>{bundle?.avgLabelCost != null ? `$${bundle.avgLabelCost.toFixed(2)}` : '—'}</div>
            <div className={styles.kpiLabel}>Avg. label cost</div>
            <div className={styles.kpiDelta}>From purchased labels</div>
          </button>
          <button className={styles.kpiTile} onClick={() => setActiveTab('Carriers')}>
            <div className={styles.kpiValue}>{profiles.length}</div>
            <div className={styles.kpiLabel}>Rate profiles</div>
            <div className={styles.kpiDelta}>{profiles.length ? profiles.map((p) => p.methodName).join(' · ') : 'No rate profiles configured'}</div>
          </button>
          <button className={styles.kpiTile} onClick={() => onNavigate('orders', 'fulfillment-queue')}>
            <div className={styles.kpiValue} style={{ color: '#1e5a38' }}>{bundle?.onTimeRate != null ? `${Math.round(bundle.onTimeRate * 100)}%` : '—'}</div>
            <div className={styles.kpiLabel}>On-time delivery</div>
            <div className={styles.kpiDelta}>Delivered shipments vs SLA</div>
          </button>
        </div>

        <div className={styles.tableCard}>
          {/* View tabs */}
          <div className={styles.viewTabsBar}>
            {SHIPPING_TABS.map((tab) => (
              <button key={tab} className={`${styles.viewTab} ${activeTab === tab ? styles.viewTabActive : ''}`} onClick={() => setActiveTab(tab)}>
                {tab}
              </button>
            ))}
          </div>

          {activeTab === 'Carriers' && (
            <>
              <div className={styles.filterBar}>
                <div className={styles.filterInputWrap}>
                  <span className={`material-symbols-outlined ${styles.filterInputIcon}`}>search</span>
                  <input className={styles.filterInput} placeholder="Filter by carrier…" type="text" value={search} onChange={e => setSearch(e.target.value)} />
                </div>
                <span className={styles.filterCount}>{selected.size > 0 ? `${selected.size} selected` : `${filtered.length} of ${carriers.length}`}</span>
              </div>

              {selected.size > 0 && (
                <BulkBar
                  selectedIds={Array.from(selected)}
                  onClear={() => setSelected(new Set())}
                  actions={[
                    { label: 'Enable', icon: 'check_circle', onClick: async () => { const rows = carriers.filter((c) => selected.has(c.id)); await Promise.all(rows.map((r) => orderMutations.setCarrierActive(r.id, true).catch(() => {}))); onToast(`Enabled ${rows.length} carriers`); setSelected(new Set()); refresh(); } },
                    { label: 'Disable', icon: 'block', onClick: async () => { const rows = carriers.filter((c) => selected.has(c.id)); await Promise.all(rows.map((r) => orderMutations.setCarrierActive(r.id, false).catch(() => {}))); onToast(`Disabled ${rows.length} carriers`); setSelected(new Set()); refresh(); } },
                  ]}
                />
              )}

              <table className={styles.table}>
                <thead>
                  <tr>
                    <th className={styles.checkCell}><input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={() => setSelected(prev => prev.size === filtered.length ? new Set() : new Set(filtered.map(r => r.id)))} /></th>
                    <th>Carrier</th>
                    <th>Account</th>
                    <th>Services</th>
                    <th style={{ textAlign: 'right' }}>Avg. rate</th>
                    <th>Status</th>
                    <th className={styles.actionCell}></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(row => (
                    <tr key={row.id} className={`${styles.tableRow} ${selected.has(row.id) ? styles.tableRowSelected : ''}`}>
                      <td className={styles.checkCell}><input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleSelect(row.id)} /></td>
                      <td>
                        <div className={styles.cellName}>
                          <span className={`${styles.carrierBadge} ${carrierBadgeClass(row.carrier)}`}>{row.badge}</span>
                          <div>
                            <div style={{ fontWeight: 600 }}>{row.carrier}</div>
                          </div>
                        </div>
                      </td>
                      <td>{row.account}</td>
                      <td style={{ fontSize: 12 }}>{row.services}</td>
                      <td style={{ textAlign: 'right' }}>{row.avgRate}</td>
                      <td>
                        <span className={styles.statusPill} data-status={row.status}>
                          {row.status === 'Connected' && <span className="material-symbols-outlined" style={{ fontSize: 10, marginRight: 2 }}>check_circle</span>}
                          {row.status === 'Needs auth' && <span className="material-symbols-outlined" style={{ fontSize: 10, marginRight: 2 }}>error</span>}
                          {row.status}
                        </span>
                      </td>
                      <td className={styles.actionCell}><RowMenu items={rowMenuItems(row)} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {rateCarrier && (
                <div style={{ padding: 16, borderTop: '1px solid #e5e7eb' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <h2 className={styles.panelTitle}>Rates &amp; services — {rateCarrier.carrier}</h2>
                    <button className={styles.btnSecondary} onClick={() => setRateCarrierId(null)}>Close</button>
                  </div>
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>Services</div>
                  {rateServices.length === 0 ? (
                    <div style={{ color: '#6b7280', fontSize: 13, marginBottom: 12 }}>No services configured for this carrier.</div>
                  ) : (
                    <div style={{ marginBottom: 12 }}>
                      {rateServices.map((s) => (
                        <div key={s.id} className={styles.listItem}>
                          <div className={styles.listItemInfo}>
                            <div className={styles.listItemTitle}>{s.name}</div>
                            <div className={styles.listItemSub}>{s.code || 'No service code'}{s.isActive ? '' : ' · Disabled'}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div style={{ fontWeight: 600, marginBottom: 6 }}>Rate profiles</div>
                  {profiles.length === 0 ? (
                    <div style={{ color: '#6b7280', fontSize: 13 }}>No rate profiles configured. Profiles are defined per shipping method in shipping profiles.</div>
                  ) : (
                    profiles.map((p) => (
                      <div key={p.id} className={styles.listItem}>
                        <div className={styles.listItemInfo}>
                          <div className={styles.listItemTitle}>{p.methodName}</div>
                          <div className={styles.listItemSub}>
                            First item {money(p.firstItemCost)} · Additional {money(p.additionalItemCost)}
                            {p.minDays != null || p.maxDays != null ? ` · ${p.minDays ?? '?'}–${p.maxDays ?? '?'} days` : ''}
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
          )}

          {activeTab === 'Packaging' && (
            <div style={{ padding: 16 }}>
              <h2 className={styles.panelTitle}>Boxes &amp; envelopes</h2>
              <p style={{ color: '#6b7280', fontSize: 13 }}>No packaging configured. Packaging is not stored in Unleashe yet — boxes and envelopes are defined with the supplier shipping profiles, and none are configured for this tenant.</p>
            </div>
          )}

          {activeTab === 'Rules' && (
            <div style={{ padding: 16 }}>
              <h2 className={styles.panelTitle}>Shipping rules</h2>
              <p style={{ color: '#6b7280', fontSize: 13 }}>No shipping rules configured. Rules such as free-shipping thresholds and default international methods are not stored in Unleashe yet.</p>
            </div>
          )}

          {activeTab === 'Printer settings' && (
            <div style={{ padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <h2 className={styles.panelTitle}>Printer settings</h2>
                <button className={styles.btnPrimary} onClick={savePrinter} disabled={savingPrinter || !printer}>
                  {savingPrinter ? 'Saving…' : 'Save'}
                </button>
              </div>
              {!printer ? (
                <p style={{ color: '#6b7280', fontSize: 13 }}>Loading printer settings…</p>
              ) : (
                <>
                  {!printer.configured && (
                    <p style={{ color: '#6b7280', fontSize: 13 }}>No printer settings saved yet — showing defaults. Save to store them for this tenant.</p>
                  )}
                  {([
                    { label: 'Receipts', paperKey: 'receiptPaper' as const, autoKey: 'receiptAutoPrint' as const, options: ['58mm', '80mm'] },
                    { label: 'Shipping labels', paperKey: 'labelPaper' as const, autoKey: 'labelAutoPrint' as const, options: ['4x6', '6x4', 'A6'] },
                    { label: 'Documents', paperKey: 'documentPaper' as const, autoKey: 'documentAutoPrint' as const, options: ['letter', 'A4'] },
                  ]).map((row) => (
                    <div key={row.label} className={styles.listItem}>
                      <div className={styles.listItemInfo}>
                        <div className={styles.listItemTitle}>{row.label}</div>
                        <div className={styles.listItemSub}>Paper size and auto-print</div>
                      </div>
                      <select
                        className={styles.filterInput}
                        style={{ width: 120 }}
                        value={printer[row.paperKey]}
                        onChange={(e) => setPrinter({ ...printer, [row.paperKey]: e.target.value })}
                      >
                        {row.options.map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, marginLeft: 12 }}>
                        <input
                          type="checkbox"
                          checked={printer[row.autoKey]}
                          onChange={(e) => setPrinter({ ...printer, [row.autoKey]: e.target.checked })}
                        />
                        Auto-print
                      </label>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default ShippingSettings;
