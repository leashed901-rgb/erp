'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import styles from './PlatformAdmin.module.css';
import { apiGet, relTime, type AdminTenant } from './shared';

interface OverviewData {
  tenants: AdminTenant[];
  counts: {
    active: number; suspended: number; provisioning_failed: number;
    pending_owner_invitations: number; past_due: number; billing_unknown: number; total: number;
  };
  pending_support_requests: number | null;
  provisioning_failures: { id: string; job_type: string; last_error: string | null; tenant_id: string | null }[];
}

export default function AdminOverview() {
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<OverviewData>('/api/platform-admin/overview').then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) return <div className={styles.card}><div className={styles.emptyState}><div className={styles.t}>Could not load the overview</div><div className={styles.hint}>{error}</div></div></div>;
  if (!data) return <div className={styles.pageHeader}><h1>Platform overview</h1><p>Loading…</p></div>;

  const c = data.counts;
  const provFailedTenants = data.tenants.filter((t) => t.lifecycle === 'provisioning_failed');
  const pastDueTenants = data.tenants.filter((t) => t.billing_status === 'past_due');
  const recent = data.tenants.slice(0, 3);

  return (
    <>
      <div className={styles.pageHeader}>
        <h1>Platform overview</h1>
        <p>Tenant health, provisioning status, and support queues across unleashe</p>
      </div>

      <div className={styles.metricGrid}>
        <Link className={styles.metric} href="/platform-admin/tenants?lifecycle=active">
          <div className={styles.metricLabel}><span className="material-symbols-outlined" style={{ fontSize: 14 }}>domain</span>Active tenants</div>
          <div className={styles.metricValue}>{c.active}</div>
          <div className={styles.metricSub}>{c.suspended} suspended · {c.provisioning_failed} provisioning-failed</div>
        </Link>
        <Link className={styles.metric} href="/platform-admin/tenants?attention=pending_owner_invitation">
          <div className={styles.metricLabel}><span className="material-symbols-outlined" style={{ fontSize: 14 }}>mail</span>Pending owner invitations</div>
          <div className={`${styles.metricValue} ${c.pending_owner_invitations > 0 ? styles.metricValueWarn : ''}`}>{c.pending_owner_invitations}</div>
          <div className={styles.metricSub}>{c.pending_owner_invitations > 0 ? 'Tenants without an accepted owner' : 'All owners accepted'}</div>
        </Link>
        <Link className={styles.metric} href="/platform-admin/support">
          <div className={styles.metricLabel}><span className="material-symbols-outlined" style={{ fontSize: 14 }}>support_agent</span>Pending support requests</div>
          <div className={styles.metricValue}>{data.pending_support_requests ?? '—'}</div>
          <div className={styles.metricSub}>Support endpoint not yet wired</div>
        </Link>
        <Link className={styles.metric} href="/platform-admin/tenants?billing=past_due">
          <div className={styles.metricLabel}><span className="material-symbols-outlined" style={{ fontSize: 14 }}>receipt_long</span>Past-due subscriptions</div>
          <div className={`${styles.metricValue} ${c.past_due > 0 ? styles.metricValueDanger : ''}`}>{c.past_due}</div>
          <div className={styles.metricSub}>{c.billing_unknown > 0 ? <><span className={styles.stale}>{c.billing_unknown} unknown</span> · </> : null}From tenant billing state</div>
        </Link>
      </div>

      {provFailedTenants.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}><span>Provisioning failures</span><Link className="link" href="/platform-admin/tenants?lifecycle=provisioning_failed">View all</Link></div>
          <div className={styles.attentionList}>
            {provFailedTenants.map((t) => (
              <Link key={t.id} href="/platform-admin/tenants" className={styles.attentionItem} style={{ textDecoration: 'none' }}>
                <div className={`${styles.attentionIcon} ${styles.attentionIconDanger}`}><span className="material-symbols-outlined">error</span></div>
                <div className={styles.attentionInfo}><div className="t">{t.name}</div><div className="m">{t.slug} · provisioning failed</div></div>
                <div className={styles.attentionCount}>!</div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {pastDueTenants.length > 0 && (
        <div className={styles.section}>
          <div className={styles.sectionTitle}><span>Billing attention</span><Link className="link" href="/platform-admin/tenants?billing=past_due">View all</Link></div>
          <div className={styles.attentionList}>
            {pastDueTenants.map((t) => (
              <Link key={t.id} href="/platform-admin/tenants" className={styles.attentionItem} style={{ textDecoration: 'none' }}>
                <div className={`${styles.attentionIcon} ${styles.attentionIconWarn}`}><span className="material-symbols-outlined">credit_card_off</span></div>
                <div className={styles.attentionInfo}><div className="t">{t.name}</div><div className="m">{t.slug} · {t.plan_label || '—'} · past due</div></div>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className={styles.section}>
        <div className={styles.sectionTitle}><span>Recently created</span><Link className="link" href="/platform-admin/tenants">View directory</Link></div>
        <div className={styles.attentionList}>
          {recent.length === 0 && <div className={styles.emptyState}><div className={styles.t}>No tenants yet</div></div>}
          {recent.map((t) => (
            <Link key={t.id} href="/platform-admin/tenants" className={styles.attentionItem} style={{ textDecoration: 'none' }}>
              <div className={`${styles.attentionIcon} ${styles.attentionIconInfo}`}><span className="material-symbols-outlined">domain</span></div>
              <div className={styles.attentionInfo}>
                <div className="t">{t.name}</div>
                <div className="m">{t.slug} · {t.lifecycle.replace(/_/g, ' ')} · {t.member_count ?? '—'} members · active {relTime(t.last_activity_at).toLowerCase()}</div>
              </div>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--muted)' }}>chevron_right</span>
            </Link>
          ))}
        </div>
      </div>
    </>
  );
}
