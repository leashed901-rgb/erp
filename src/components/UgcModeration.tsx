'use client';

import { useCallback, useEffect, useState } from 'react';
import styles from './UgcModeration.module.css';

type UgcStatus = 'pending' | 'approved' | 'rejected' | 'flagged';
interface Submission {
  id: string; source: 'review' | 'social'; status: UgcStatus;
  product: { name: string; sku: string | null; id: string | null };
  customer: { name: string; id: string | null };
  network: string; media_kind: string; media_url: string | null;
  caption: string; rating: number | null; verified_purchase: boolean | null;
  checks: Record<string, boolean> | null; submitted_at: string;
}
interface UgcData { submissions: Submission[]; counts: Record<UgcStatus, number> }

async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' });
  const json = (await res.json().catch(() => null)) as { data?: T; error?: { message?: string } } | null;
  if (!res.ok || !json?.data) throw new Error(json?.error?.message || `Request failed (${res.status})`);
  return json.data;
}
async function apiPost<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = (await res.json().catch(() => null)) as { data?: T; error?: { message?: string } } | null;
  if (!res.ok || json?.data === undefined) throw new Error(json?.error?.message || `Request failed (${res.status})`);
  return json.data as T;
}

function relTime(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return '1 day ago';
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function statusPill(s: UgcStatus): string {
  if (s === 'pending') return styles.pillPending;
  if (s === 'approved') return styles.pillApproved;
  if (s === 'rejected') return styles.pillRejected;
  return styles.pillFlagged;
}
const CHECK_LABELS: Record<string, string> = {
  brand_safe: 'Brand-safe content', no_pii: 'No PII visible',
  image_quality: 'Image quality sufficient', matches_product: 'Matches purchased product',
};

export default function UgcModeration({ onToast }: { onToast?: (msg: string) => void }) {
  const [data, setData] = useState<UgcData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<UgcStatus>('pending');
  const [open, setOpen] = useState<Submission | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    apiGet<UgcData>('/api/ugc/submissions').then(setData).catch((e) => setError(e.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function moderate(sub: Submission, action: 'approve' | 'reject' | 'flag') {
    setBusy(true);
    try {
      await apiPost('/api/ugc/submissions/moderate', { source: sub.source, id: sub.id, action });
      onToast?.(action === 'approve' ? `Approved — ${sub.customer.name}` : action === 'reject' ? `Rejected — ${sub.customer.name}` : `Flagged — ${sub.customer.name}`);
      setOpen(null);
      load();
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : 'Moderation failed');
    } finally { setBusy(false); }
  }

  async function approveAll() {
    if (!data) return;
    const pending = data.submissions.filter((s) => s.status === 'pending');
    if (!pending.length) return;
    setBusy(true);
    try {
      for (const sub of pending) {
        await apiPost('/api/ugc/submissions/moderate', { source: sub.source, id: sub.id, action: 'approve' });
      }
      onToast?.(`Approved ${pending.length} submission${pending.length === 1 ? '' : 's'}`);
      load();
    } catch (e) {
      onToast?.(e instanceof Error ? e.message : 'Approve all failed');
    } finally { setBusy(false); }
  }

  function exportQueue() {
    if (!data) return;
    const rows = [['source', 'status', 'product', 'customer', 'network', 'submitted', 'caption'],
      ...data.submissions.map((s) => [s.source, s.status, s.product.name, s.customer.name, s.network, s.submitted_at, s.caption.replace(/[\r\n]+/g, ' ')])];
    const csv = rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url; a.download = 'ugc-moderation-queue.csv'; a.click();
    URL.revokeObjectURL(url);
  }

  if (error) {
    return <div className={styles.wrap}><div className={styles.pageHeader}><div><h1>UGC Moderation</h1><p>Could not load the queue: {error}</p></div></div></div>;
  }
  if (!data) {
    return <div className={styles.wrap}><div className={styles.pageHeader}><div><h1>UGC Moderation</h1><p>Loading…</p></div></div></div>;
  }

  const c = data.counts;
  const rows = data.submissions.filter((s) => s.status === tab);

  return (
    <div className={styles.wrap}>
      <div className={styles.pageHeader}>
        <div>
          <h1>UGC Moderation</h1>
          <p>Customer photos, reviews, and social posts awaiting approval for publication</p>
        </div>
        <div className={styles.headerActions}>
          <button className={`${styles.btn} ${styles.btnOutline}`} onClick={exportQueue}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>download</span>Export
          </button>
          <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={approveAll} disabled={busy || c.pending === 0}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>check_circle</span>Approve all
          </button>
        </div>
      </div>

      <div className={styles.kpis}>
        <div className={styles.kpi}><div className={styles.kpiLabel}>Pending review</div><div className={`${styles.kpiValue} ${styles.kpiValueWarn}`}>{c.pending}</div><div className={styles.kpiSub}>Awaiting moderation</div></div>
        <div className={styles.kpi}><div className={styles.kpiLabel}>Approved</div><div className={`${styles.kpiValue} ${styles.kpiValueGreen}`}>{c.approved}</div><div className={styles.kpiSub}>Published to PDPs</div></div>
        <div className={styles.kpi}><div className={styles.kpiLabel}>Rejected</div><div className={`${styles.kpiValue} ${styles.kpiValueDanger}`}>{c.rejected}</div><div className={styles.kpiSub}>Policy violations</div></div>
        <div className={styles.kpi}><div className={styles.kpiLabel}>Flagged</div><div className={styles.kpiValue}>{c.flagged}</div><div className={styles.kpiSub}>Needs second look</div></div>
      </div>

      <div className={styles.tabs}>
        {(Object.keys(c) as UgcStatus[]).map((s) => (
          <button key={s} className={`${styles.tab} ${tab === s ? styles.tabActive : ''}`} onClick={() => setTab(s)}>
            {s.charAt(0).toUpperCase() + s.slice(1)} <span className={styles.tabCount}>{c[s]}</span>
          </button>
        ))}
      </div>

      <div className={styles.card}>
        {rows.length === 0 ? (
          <div className={styles.emptyState}>
            <span className="material-symbols-outlined" style={{ fontSize: 40, color: 'var(--line)', display: 'block', marginBottom: 8 }}>photo_library</span>
            <div className="t">No submissions</div>
            <div style={{ fontSize: 12 }}>Nothing in {tab} right now</div>
          </div>
        ) : (
          <table className={styles.table}>
            <thead><tr><th style={{ width: 60 }}>Media</th><th>Product / customer</th><th>Network</th><th>Submitted</th><th>Status</th><th style={{ width: 120 }}></th></tr></thead>
            <tbody>
              {rows.map((s) => (
                <tr key={`${s.source}-${s.id}`} onClick={() => setOpen(s)}>
                  <td>
                    <div className={styles.thumb}>
                      {s.media_url ? <img src={s.media_url} alt="UGC" /> : <span className="material-symbols-outlined">{s.media_kind === 'video' ? 'play_circle' : s.media_kind === 'text' ? 'reviews' : 'image'}</span>}
                    </div>
                  </td>
                  <td>
                    <div className={styles.productName}>{s.product.name}</div>
                    <div className={styles.productSku}>{s.customer.name}{s.product.sku ? ` · ${s.product.sku}` : ''}{s.rating ? ` · ${'★'.repeat(s.rating)}` : ''}</div>
                  </td>
                  <td><span className={styles.pill}>{s.network}</span></td>
                  <td className={styles.mutedCell}>{relTime(s.submitted_at)}</td>
                  <td><span className={`${styles.pill} ${statusPill(s.status)}`}>{s.status}</span></td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <div className={styles.rowActions}>
                      <button className={styles.iconBtn} title="Approve" disabled={busy} onClick={() => moderate(s, 'approve')}><span className="material-symbols-outlined" style={{ fontSize: 18 }}>check_circle</span></button>
                      <button className={styles.iconBtn} title="Reject" disabled={busy} onClick={() => moderate(s, 'reject')}><span className="material-symbols-outlined" style={{ fontSize: 18 }}>cancel</span></button>
                      <button className={styles.iconBtn} title="Flag for review" disabled={busy} onClick={() => moderate(s, 'flag')}><span className="material-symbols-outlined" style={{ fontSize: 18 }}>flag</span></button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {open && (
        <>
          <div className={styles.drawerScrim} onClick={() => setOpen(null)} />
          <div className={styles.drawer}>
            <div className={styles.drawerHeader}>
              <div className={styles.drawerTitle}>Review — {open.customer.name}</div>
              <button className={styles.btn} onClick={() => setOpen(null)}><span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span></button>
            </div>
            <div className={styles.drawerBody}>
              <div className={styles.detail}>
                <div className={styles.media}>
                  {open.media_url ? <img src={open.media_url} alt="UGC" /> : <span className="material-symbols-outlined" style={{ fontSize: 64 }}>{open.media_kind === 'video' ? 'play_circle' : open.media_kind === 'text' ? 'reviews' : 'image'}</span>}
                </div>
                <div className={styles.author}>
                  <div className={styles.authorAvatar}>{open.customer.name.charAt(0)}</div>
                  <div style={{ flex: 1 }}>
                    <div className={styles.authorName}>{open.customer.name}</div>
                    <div className={styles.authorMeta}>{open.source === 'review' ? 'Product review' : 'Social post'} · {relTime(open.submitted_at)}</div>
                  </div>
                  <span className={styles.pill}>{open.network}</span>
                </div>
                {open.caption && (
                  <div>
                    <span className={styles.fieldLabel}>{open.source === 'review' ? 'Review' : 'Caption'}</span>
                    <div className={styles.caption}>&ldquo;{open.caption}&rdquo;</div>
                  </div>
                )}
                <div>
                  <span className={styles.fieldLabel}>Product</span>
                  <div className={styles.productBox}>
                    <div style={{ fontWeight: 600 }}>{open.product.name}</div>
                    {open.product.sku && <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'var(--muted)', marginTop: 2 }}>{open.product.sku}</div>}
                  </div>
                </div>
                {open.source === 'review' && (
                  <div>
                    <span className={styles.fieldLabel}>Submission facts</span>
                    <ul className={styles.checkList}>
                      <li className={open.verified_purchase ? styles.checkPass : ''}>
                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{open.verified_purchase ? 'check_circle' : 'help'}</span>
                        {open.verified_purchase ? 'Verified purchase' : 'Purchase not verified'}
                      </li>
                      <li className={open.rating ? styles.checkPass : ''}>
                        <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{open.rating ? 'star' : 'help'}</span>
                        {open.rating ? `Rated ${open.rating} of 5` : 'No rating given'}
                      </li>
                    </ul>
                  </div>
                )}
                {open.checks && (
                  <div>
                    <span className={styles.fieldLabel}>Moderation checks</span>
                    <ul className={styles.checkList}>
                      {Object.entries(open.checks).map(([key, pass]) => (
                        <li key={key} className={pass ? styles.checkPass : styles.checkFail}>
                          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{pass ? 'check_circle' : 'cancel'}</span>
                          {CHECK_LABELS[key] || key.replace(/_/g, ' ')}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
            <div className={styles.drawerFooter}>
              <button className={`${styles.btn} ${styles.btnOutline}`} onClick={() => setOpen(null)}>Cancel</button>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className={`${styles.btn} ${styles.btnOutline}`} disabled={busy} onClick={() => moderate(open, 'reject')}><span className="material-symbols-outlined" style={{ fontSize: 16 }}>cancel</span>Reject</button>
                <button className={`${styles.btn} ${styles.btnPrimary}`} disabled={busy} onClick={() => moderate(open, 'approve')}><span className="material-symbols-outlined" style={{ fontSize: 16 }}>check_circle</span>Approve</button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
