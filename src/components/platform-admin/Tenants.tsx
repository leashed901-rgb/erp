'use client';

import { useEffect, useMemo, useState } from 'react';
import styles from './PlatformAdmin.module.css';
import { apiGet, fmtDate, relTime, type AdminTenant } from './shared';

const LIFECYCLES = ['requested', 'provisioning', 'provisioning_failed', 'active', 'suspended', 'closing', 'archived'];
const BILLING = ['none', 'trialing', 'active', 'past_due', 'unpaid', 'canceled', 'unknown'];
const ATTENTION = ['provisioning_failed', 'past_due', 'pending_owner_invitation', 'suspended'];

function lifecyclePill(l: string) {
  if (l === 'active') return styles.pillActive;
  if (l === 'provisioning') return styles.pillProvisioning;
  if (l === 'provisioning_failed') return styles.pillFailed;
  if (l === 'suspended') return styles.pillSuspended;
  return '';
}
function billingPill(b: string) {
  if (b === 'active') return styles.pillBillingActive;
  if (b === 'past_due') return styles.pillBillingPastDue;
  if (b === 'trialing') return styles.pillBillingTrialing;
  return '';
}

export default function AdminTenants() {
  const [tenants, setTenants] = useState<AdminTenant[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [lifecycle, setLifecycle] = useState('all');
  const [billing, setBilling] = useState('all');
  const [attention, setAttention] = useState('all');
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('lifecycle')) setLifecycle(params.get('lifecycle') as string);
    if (params.get('billing')) setBilling(params.get('billing') as string);
    if (params.get('attention')) setAttention(params.get('attention') as string);
    apiGet<{ tenants: AdminTenant[] }>('/api/platform-admin/tenants').then((d) => setTenants(d.tenants)).catch((e) => setError(e.message));
  }, []);

  const filtered = useMemo(() => {
    if (!tenants) return [];
    const needle = q.toLowerCase().trim();
    return tenants.filter((t) => {
      if (lifecycle !== 'all' && t.lifecycle !== lifecycle) return false;
      if (billing !== 'all' && t.billing_status !== billing) return false;
      if (attention !== 'all' && !t.attention_flags.includes(attention)) return false;
      if (needle) {
        const exactId = t.id.toLowerCase() === needle;
        const hit = exactId || t.name.toLowerCase().includes(needle) || (t.slug || '').toLowerCase().includes(needle) || (t.owner?.email || '').toLowerCase().includes(needle);
        if (!hit) return false;
      }
      return true;
    });
  }, [tenants, q, lifecycle, billing, attention]);

  const businessTypes = useMemo(() => Array.from(new Set((tenants || []).map((t) => t.business_type).filter(Boolean))) as string[], [tenants]);
  const [businessType, setBusinessType] = useState('all');
  const rows = businessType === 'all' ? filtered : filtered.filter((t) => t.business_type === businessType);
  const anyFilter = lifecycle !== 'all' || billing !== 'all' || attention !== 'all' || businessType !== 'all';

  return (
    <>
      <div className={styles.pageHeader}>
        <h1>Tenants</h1>
        <p>{tenants ? `${tenants.length} organizations across all lifecycle states` : 'Loading…'}</p>
      </div>

      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <span className={`material-symbols-outlined ${styles.msym}`}>search</span>
          <input type="search" placeholder="Search by name, slug, exact tenant ID, or owner email" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className={styles.select} value={lifecycle} onChange={(e) => setLifecycle(e.target.value)} aria-label="Lifecycle">
          <option value="all">Lifecycle: all</option>
          {LIFECYCLES.map((l) => <option key={l} value={l}>{l.replace(/_/g, ' ')}</option>)}
        </select>
        <select className={styles.select} value={businessType} onChange={(e) => setBusinessType(e.target.value)} aria-label="Business type">
          <option value="all">Business type: all</option>
          {businessTypes.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
        <select className={styles.select} value={billing} onChange={(e) => setBilling(e.target.value)} aria-label="Billing">
          <option value="all">Billing: all</option>
          {BILLING.map((b) => <option key={b} value={b}>{b.replace(/_/g, ' ')}</option>)}
        </select>
        <select className={styles.select} value={attention} onChange={(e) => setAttention(e.target.value)} aria-label="Attention">
          <option value="all">Attention: all</option>
          {ATTENTION.map((a) => <option key={a} value={a}>{a.replace(/_/g, ' ')}</option>)}
        </select>
        {anyFilter && (
          <button className={styles.filterChip} onClick={() => { setLifecycle('all'); setBilling('all'); setAttention('all'); setBusinessType('all'); }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>close</span>Clear
          </button>
        )}
      </div>

      <div className={styles.card}>
        {error && <div className={styles.emptyState}><div className={styles.t}>Could not load tenants</div><div className={styles.hint}>{error}</div></div>}
        {!error && tenants && rows.length === 0 && (
          <div className={styles.emptyState}>
            <span className={`material-symbols-outlined ${styles.msym}`}>domain_disabled</span>
            <div className={styles.t}>No tenants match</div>
            <div className={styles.hint}>Try adjusting filters or searching by a different term.</div>
          </div>
        )}
        {!error && rows.length > 0 && (
          <>
            <table className={styles.table}>
              <thead>
                <tr><th>Name</th><th>Created</th><th>Primary owner</th><th>Business type</th><th>Lifecycle</th><th>Plan</th><th>Billing</th><th style={{ textAlign: 'right' }}>Members</th><th>Last activity</th><th style={{ width: 40 }}></th></tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id}>
                    <td><div className={styles.tenantCell}><div className="name">{t.name}</div><div className="id">{t.slug} · {t.id}</div></div></td>
                    <td className={styles.mutedCell}>{fmtDate(t.created_at)}</td>
                    <td>
                      {t.owner ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                          <div style={{ fontWeight: 500 }}>{t.owner.display || <span className={styles.unknown}>{t.owner.email}</span>}</div>
                          <div style={{ fontSize: 11, color: 'var(--muted)' }}>{t.owner.display ? t.owner.email : 'Invitation pending'}</div>
                        </div>
                      ) : <span className={styles.unknown}>Not available</span>}
                    </td>
                    <td className={styles.mutedCell}>{t.business_type || '—'}</td>
                    <td><span className={`${styles.pill} ${lifecyclePill(t.lifecycle)}`}>{t.lifecycle.replace(/_/g, ' ')}</span></td>
                    <td className={styles.mutedCell}>{t.plan_label || '—'}</td>
                    <td><span className={`${styles.pill} ${billingPill(t.billing_status)}`}>{t.billing_status.replace(/_/g, ' ')}</span></td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 600 }}>{t.member_count ?? '—'}</td>
                    <td className={styles.mutedCell}>{t.last_activity_at ? relTime(t.last_activity_at) : <span className={styles.unknown}>Not available</span>}</td>
                    <td>
                      <button className={styles.btn} title="Copy tenant ID" onClick={() => { navigator.clipboard?.writeText(t.id); setCopied(t.id); setTimeout(() => setCopied(null), 1500); }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--muted)' }}>{copied === t.id ? 'check' : 'content_copy'}</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className={styles.pagination}>Showing <strong>{rows.length}</strong> of {tenants?.length ?? 0} tenants</div>
          </>
        )}
      </div>
    </>
  );
}
