'use client';

import { useState, useEffect } from 'react';
import { DomainKey } from '@/data/shellData';
import { RETURN_TABS, ReturnRow } from '@/data/ordersData';
import RowMenu, { RowMenuItem, BulkBar } from '@/components/ListPrimitives';
import { exportToCsv } from '@/lib/csvExport';
import styles from './OrdersPages.module.css';

interface OrdersScreenProps {
  onNavigate: (domain: DomainKey, screenId: string) => void;
  onToast: (msg: string) => void;
  onCreate?: (label: string) => void;
  onOpenCreateFlyout?: () => void;
  onOpenPeek?: (title: string, details: Record<string, string | number>) => void;
}

const AVATAR_COLORS: Record<string, string> = {
  A: styles.avatarBlue, B: styles.avatarGreen, N: styles.avatarTeal,
  M: styles.avatarNavy, L: styles.avatarMaroon, P: styles.avatarBlue,
};

export function ReturnsClaims({ onToast, onCreate, onOpenPeek }: OrdersScreenProps) {
  const [allReturns, setAllReturns] = useState<ReturnRow[]>([]);
  const [activeTab, setActiveTab] = useState<string>('All');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // REAL data from crm_documents (return requests)
  useEffect(() => {
    let cancelled = false;
    fetch('/api/crm/documents')
      .then(r => r.json())
      .then(json => {
        if (cancelled) return;
        const rows: ReturnRow[] = (json.data || []).map((d: Record<string, unknown>) => ({
          docId: String(d.id),
          id: String(d.name || d.id).substring(0, 12),
          customer: '—',
          order: '—',
          reason: String(d.status || 'Return'),
          refund: '$0.00',
          status: 'Requested' as ReturnRow['status'],
          type: 'Customer return',
        }));
        setAllReturns(rows);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const filtered = allReturns.filter((row) => {
    if (activeTab !== 'All' && row.status !== activeTab) return false;
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return row.id.toLowerCase().includes(q) || row.customer.toLowerCase().includes(q);
  });

  const tabCounts: Record<string, number> = { All: allReturns.length };
  RETURN_TABS.forEach((tab) => {
    if (tab !== 'All') tabCounts[tab] = allReturns.filter((r) => r.status === tab).length;
  });

  const toggleSelect = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });

  const selectedArray = Array.from(selected);

  const getRowActions = (row: ReturnRow): RowMenuItem[] => {
    const items: RowMenuItem[] = [
      { label: 'Open RMA', icon: 'open_in_new', onClick: () => onOpenPeek?.(`RMA ${row.id}`, { Customer: row.customer, Reason: row.reason }) },
      { label: 'Edit', icon: 'edit', onClick: () => onToast(`Editing ${row.id}`) },
    ];
    if (row.status === 'Requested') {
      items.push({ label: 'Approve return', icon: 'check_circle', onClick: () => {
        fetch(`/api/v1/documents/${row.docId}/void?type=RMA`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: 'Approved' }) }).catch(() => {});
        onToast(`RMA ${row.id} approved`);
      } });
      items.push({ label: 'Decline return', icon: 'cancel', onClick: () => {
        fetch(`/api/v1/documents/${row.docId}/void?type=RMA`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reason: 'Declined' }) }).catch(() => {});
        onToast(`RMA ${row.id} declined`);
      } });
    }
    if (row.status === 'Approved' || row.status === 'In transit') {
      items.push({ label: 'Mark received', icon: 'inventory_2', onClick: () => {
        fetch(`/api/v1/documents/${row.docId}/send?type=RMA`, { method: 'POST' }).catch(() => {});
        onToast(`RMA ${row.id} marked received`);
      } });
    }
    if (row.status === 'Received') {
      items.push({ label: 'Issue refund…', icon: 'payments', onClick: () => {
        fetch(`/api/v1/documents/${row.docId}/pay?type=RMA`, { method: 'POST' }).catch(() => {});
        onToast(`RMA ${row.id} refunded`);
      } });
    }
    items.push({ label: 'Delete', icon: 'delete', danger: true, dividerBefore: true, onClick: () => {
      fetch(`/api/v1/documents/${row.docId}?type=RMA`, { method: 'DELETE' }).catch(() => {});
      onToast(`RMA ${row.id} deleted`);
    } });
    return items;
  };

  return (
    <div className={styles.container}>
      <div className={styles.contextHeader}>
        <div className={styles.contextLeft}>
          <span className="material-symbols-outlined">assignment_return</span>
          <div>
            <h1 className={styles.title}>Returns & Claims</h1>
            <p className={styles.subtitle}>Track return authorizations, refunds, and exchanges across all channels.</p>
          </div>
        </div>
        <div className={styles.contextRight}>
          <button className={styles.createBtn} onClick={() => onCreate?.('Return/RMA')}>
            <span className="material-symbols-outlined text-[18px]">add</span>New RMA
          </button>
        </div>
      </div>

      <div className={styles.tabsBar}>
        {RETURN_TABS.map(tab => (
          <button key={tab} className={`${styles.tab} ${activeTab === tab ? styles.tabActive : ''}`} onClick={() => setActiveTab(tab)}>
            {tab} {tabCounts[tab] ? <span className={styles.tabCount}>{tabCounts[tab]}</span> : null}
          </button>
        ))}
      </div>

      <div className={styles.tableWrap}>
        <div className={styles.toolbar}>
          <input className={styles.searchInput} placeholder="Search returns…" value={search} onChange={e => setSearch(e.target.value)} />
          <button className={styles.toolbarBtn} onClick={() => exportToCsv(filtered, [
            { key: 'id', label: 'RMA #' }, { key: 'customer', label: 'Customer' }, { key: 'reason', label: 'Reason' },
            { key: 'refund', label: 'Refund' }, { key: 'status', label: 'Status' },
          ], 'returns')}>Export</button>
        </div>

        {selectedArray.length > 0 && (
          <BulkBar count={selectedArray.length} onClear={() => setSelected(new Set())}>
            <button onClick={() => { selectedArray.forEach(id => onToast(`Approving ${id}`)); setSelected(new Set()); }}>Approve all</button>
            <button onClick={() => { selectedArray.forEach(id => onToast(`Declining ${id}`)); setSelected(new Set()); }}>Decline all</button>
          </BulkBar>
        )}

        <table className={styles.table}>
          <thead>
            <tr>
              <th className={styles.colCheck}><input type="checkbox" checked={filtered.length > 0 && selected.size === filtered.length} onChange={e => { if (e.target.checked) setSelected(new Set(filtered.map(r => r.id))); else setSelected(new Set()); }} /></th>
              <th className={styles.colId}>RMA #</th>
              <th>Customer</th>
              <th>Order</th>
              <th>Reason</th>
              <th className={styles.colNum}>Refund</th>
              <th className={styles.colStatus}>Status</th>
              <th className={styles.colAction}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={8} className={styles.emptyState}>No returns found.</td></tr>
            )}
            {filtered.map(row => {
              const avatarColor = AVATAR_COLORS[row.customer[0]?.toUpperCase() || 'A'] || styles.avatarBlue;
              return (
                <tr key={row.docId} className={styles.row}>
                  <td className={styles.colCheck}><input type="checkbox" checked={selected.has(row.id)} onChange={() => toggleSelect(row.id)} /></td>
                  <td className={styles.colId}>{row.id}</td>
                  <td>
                    <div className={styles.customerCell}>
                      <span className={`${styles.avatar} ${avatarColor}`}>{row.customer[0]?.toUpperCase() || '?'}</span>
                      {row.customer}
                    </div>
                  </td>
                  <td>{row.order}</td>
                  <td>{row.reason}</td>
                  <td className={styles.colNum}>{row.refund}</td>
                  <td className={styles.colStatus}>
                    <span className={`${styles.statusPill} ${styles[`status${row.status.replace(/\s/g, '')}`] || styles.statusRequested}`}>{row.status}</span>
                  </td>
                  <td className={styles.colAction}>
                    <RowMenu items={getRowActions(row)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
