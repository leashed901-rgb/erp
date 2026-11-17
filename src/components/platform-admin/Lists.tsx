'use client';

import { useEffect, useState } from 'react';
import styles from './PlatformAdmin.module.css';
import { apiGet, apiPost, fmtDate, relTime, type AdminTenant } from './shared';

function Header({ title, sub }: { title: string; sub: string }) {
  return <div className={styles.pageHeader}><h1>{title}</h1><p>{sub}</p></div>;
}

function NotBuilt({ title, sub, body }: { title: string; sub: string; body: string }) {
  // Per the design's §15 DoD: no fabricated metrics or nonfunctional buttons —
  // an unbuilt screen says so, plainly.
  return (
    <>
      <Header title={title} sub={sub} />
      <div className={styles.card} style={{ padding: 48, textAlign: 'center' }}>
        <span className="material-symbols-outlined" style={{ fontSize: 48, color: 'var(--line)', display: 'block', marginBottom: 12 }}>construction</span>
        <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 6 }}>Not yet built</div>
        <div style={{ fontSize: 13, color: 'var(--muted)', maxWidth: 480, margin: '0 auto' }}>{body}</div>
      </div>
    </>
  );
}

/* ── Users (identity directory, from the auth provider) ─────────────── */
interface Identity { id: string; email: string | null; name: string | null; created_at: string; last_sign_in_at: string | null; confirmed: boolean }
export function AdminUsers() {
  const [users, setUsers] = useState<Identity[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { apiGet<{ users: Identity[] }>('/api/platform-admin/users').then((d) => setUsers(d.users)).catch((e) => setError(e.message)); }, []);
  return (
    <>
      <Header title="Users" sub="Every identity that can sign in to unleashe, across all tenants" />
      <div className={styles.card}>
        {error && <div className={styles.emptyState}><div className={styles.t}>Could not load users</div><div className={styles.hint}>{error}</div></div>}
        {users && users.length === 0 && <div className={styles.emptyState}><div className={styles.t}>No identities</div></div>}
        {users && users.length > 0 && (
          <table className={styles.table}>
            <thead><tr><th>Identity</th><th>Created</th><th>Last sign-in</th><th>Status</th></tr></thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td><div className={styles.tenantCell}><div className="name">{u.name || u.email || '—'}</div><div className="id">{u.email ? `${u.email} · ` : ''}{u.id}</div></div></td>
                  <td className={styles.mutedCell}>{fmtDate(u.created_at)}</td>
                  <td className={styles.mutedCell}>{u.last_sign_in_at ? relTime(u.last_sign_in_at) : <span className={styles.unknown}>Never</span>}</td>
                  <td><span className={`${styles.pill} ${u.confirmed ? styles.pillActive : styles.pillSuspended}`}>{u.confirmed ? 'confirmed' : 'unconfirmed'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

/* ── Provisioning jobs ──────────────────────────────────────────────── */
interface Job { id: string; tenant_id: string | null; queue: string; job_type: string; status: string; attempts: number; max_attempts: number; last_error: string | null; created_at: string; finished_at: string | null }
export function AdminProvisioning() {
  const [jobs, setJobs] = useState<Job[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { apiGet<{ jobs: Job[] }>('/api/platform-admin/jobs').then((d) => setJobs(d.jobs)).catch((e) => setError(e.message)); }, []);
  return (
    <>
      <Header title="Provisioning" sub="Platform jobs — tenant provisioning and background work" />
      <div className={styles.card}>
        {error && <div className={styles.emptyState}><div className={styles.t}>Could not load jobs</div><div className={styles.hint}>{error}</div></div>}
        {jobs && jobs.length === 0 && (
          <div className={styles.emptyState}>
            <span className={`material-symbols-outlined ${styles.msym}`}>schedule</span>
            <div className={styles.t}>No provisioning jobs</div>
            <div className={styles.hint}>The platform job queue is empty. Jobs appear here when tenants are provisioned or platform work is enqueued.</div>
          </div>
        )}
        {jobs && jobs.length > 0 && (
          <table className={styles.table}>
            <thead><tr><th>Job</th><th>Queue</th><th>Tenant</th><th>Status</th><th>Attempts</th><th>Created</th></tr></thead>
            <tbody>
              {jobs.map((j) => (
                <tr key={j.id}>
                  <td><div className={styles.tenantCell}><div className="name">{j.job_type}</div><div className="id">{j.id}</div></div>{j.last_error && <div style={{ color: 'var(--danger)', fontSize: 11 }}>{j.last_error}</div>}</td>
                  <td className={styles.mutedCell}>{j.queue}</td>
                  <td className={styles.mutedCell}>{j.tenant_id ? `${j.tenant_id.slice(0, 8)}…` : '—'}</td>
                  <td><span className={`${styles.pill} ${j.status === 'failed' ? styles.pillFailed : j.status === 'completed' ? styles.pillActive : styles.pillProvisioning}`}>{j.status}</span></td>
                  <td className={styles.mutedCell}>{j.attempts} / {j.max_attempts}</td>
                  <td className={styles.mutedCell}>{relTime(j.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

/* ── Entitlements (module assignment per tenant) ────────────────────── */
interface EntModule { code: string; name: string; depends_on: string[]; enabled: boolean; assigned: boolean }
export function AdminEntitlements() {
  const [tenants, setTenants] = useState<AdminTenant[]>([]);
  const [tenantId, setTenantId] = useState<string>('');
  const [modules, setModules] = useState<EntModule[] | null>(null);
  const [packs, setPacks] = useState<{ pack_code: string; enabled: boolean }[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ tenants: AdminTenant[] }>('/api/platform-admin/tenants').then((d) => {
      setTenants(d.tenants);
      if (d.tenants.length) setTenantId(d.tenants[0].id);
    }).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    if (!tenantId) return;
    setModules(null);
    apiGet<{ modules: EntModule[]; packs: { pack_code: string; enabled: boolean }[] }>(`/api/platform-admin/entitlements?tenant_id=${tenantId}`)
      .then((d) => { setModules(d.modules); setPacks(d.packs); })
      .catch((e) => setError(e.message));
  }, [tenantId]);

  async function toggle(m: EntModule) {
    setBusy(m.code); setError(null);
    try {
      await apiPost('/api/platform-admin/entitlements', { tenant_id: tenantId, module_code: m.code, enabled: !m.enabled });
      const d = await apiGet<{ modules: EntModule[]; packs: { pack_code: string; enabled: boolean }[] }>(`/api/platform-admin/entitlements?tenant_id=${tenantId}`);
      setModules(d.modules); setPacks(d.packs);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Change failed');
    } finally { setBusy(null); }
  }

  return (
    <>
      <Header title="Entitlements" sub="Module and pack assignment per tenant — changes apply to that tenant only" />
      <div className={styles.toolbar}>
        <select className={styles.select} value={tenantId} onChange={(e) => setTenantId(e.target.value)} aria-label="Tenant">
          {tenants.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        {packs.length > 0 && <span className={styles.mutedCell}>Packs: {packs.map((p) => `${p.pack_code} (${p.enabled ? 'on' : 'off'})`).join(' · ')}</span>}
      </div>
      {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error}</div>}
      <div className={styles.card}>
        {modules === null && <div className={styles.emptyState}><div className={styles.t}>Loading modules…</div></div>}
        {modules && (
          <table className={styles.table}>
            <thead><tr><th>Module</th><th>Depends on</th><th>Assigned</th><th style={{ width: 80 }}>Enabled</th></tr></thead>
            <tbody>
              {modules.map((m) => (
                <tr key={m.code}>
                  <td><div className={styles.tenantCell}><div className="name">{m.name}</div><div className="id">{m.code}</div></div></td>
                  <td className={styles.mutedCell}>{m.depends_on.length ? m.depends_on.join(', ') : '—'}</td>
                  <td className={styles.mutedCell}>{m.assigned ? 'Yes' : 'No'}</td>
                  <td><button className={`${styles.toggle} ${m.enabled ? styles.toggleOn : ''}`} disabled={busy === m.code} onClick={() => toggle(m)} aria-label={`Toggle ${m.name}`} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

/* ── Billing projection ─────────────────────────────────────────────── */
interface Sub { id: string; tenant_id: string; account_email: string | null; user_type: string | null; status: string; stripe_customer_id: string | null; current_period_end: string | null }
export function AdminBilling() {
  const [subs, setSubs] = useState<Sub[] | null>(null);
  const [tenants, setTenants] = useState<AdminTenant[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    apiGet<{ subscriptions: Sub[]; tenants: AdminTenant[] }>('/api/platform-admin/billing')
      .then((d) => { setSubs(d.subscriptions); setTenants(d.tenants); })
      .catch((e) => setError(e.message));
  }, []);
  return (
    <>
      <Header title="Billing" sub="Subscription projection — platform billing state per tenant" />
      {error && <div style={{ color: 'var(--danger)', fontSize: 13, marginBottom: 12 }}>{error}</div>}
      <div className={styles.card}>
        <table className={styles.table}>
          <thead><tr><th>Tenant</th><th>Plan</th><th>Billing status</th><th>Subscription record</th><th>Period ends</th></tr></thead>
          <tbody>
            {tenants.map((t) => {
              const sub = (subs || []).find((s) => s.tenant_id === t.id);
              return (
                <tr key={t.id}>
                  <td><div className={styles.tenantCell}><div className="name">{t.name}</div><div className="id">{t.slug}</div></div></td>
                  <td className={styles.mutedCell}>{t.plan_label || '—'}</td>
                  <td><span className={`${styles.pill} ${t.billing_status === 'past_due' ? styles.pillBillingPastDue : t.billing_status === 'trialing' ? styles.pillBillingTrialing : t.billing_status === 'active' ? styles.pillBillingActive : ''}`}>{t.billing_status.replace(/_/g, ' ')}</span></td>
                  <td className={styles.mutedCell}>{sub ? `${sub.status}${sub.stripe_customer_id ? ` · ${sub.stripe_customer_id}` : ''}` : <span className={styles.unknown}>None recorded</span>}</td>
                  <td className={styles.mutedCell}>{sub?.current_period_end ? fmtDate(sub.current_period_end) : '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {subs !== null && subs.length === 0 && (
          <div className={styles.pagination}>No platform subscription records exist yet — billing state above is each tenant&apos;s own subscription status.</div>
        )}
      </div>
    </>
  );
}

/* ── Support (not yet wired, per the design's own §9 note) ──────────── */
export function AdminSupport() {
  return (
    <NotBuilt
      title="Support"
      sub="Platform support requests and sessions"
      body="The support endpoint is not yet wired — there is no platform-level support request store behind this screen, so no queue is shown rather than a fabricated one. Tenant support queues live in each tenant's workspace."
    />
  );
}

/* ── Audit log ──────────────────────────────────────────────────────── */
interface AuditEvent { id: string; occurred_at: string; tenant_id: string | null; actor_label: string | null; action: string; object_table: string | null; summary: string | null }
export function AdminAudit() {
  const [events, setEvents] = useState<AuditEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState('');
  useEffect(() => { apiGet<{ events: AuditEvent[] }>('/api/platform-admin/audit?limit=150').then((d) => setEvents(d.events)).catch((e) => setError(e.message)); }, []);
  const rows = (events || []).filter((e) => !q || `${e.action} ${e.actor_label || ''} ${e.summary || ''} ${e.object_table || ''}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <>
      <Header title="Audit log" sub="Administrative and platform activity, newest first" />
      <div className={styles.toolbar}>
        <div className={styles.searchBox}>
          <span className={`material-symbols-outlined ${styles.msym}`}>search</span>
          <input type="search" placeholder="Filter by action, actor, object, or summary" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
      </div>
      <div className={styles.card}>
        {error && <div className={styles.emptyState}><div className={styles.t}>Could not load the audit log</div><div className={styles.hint}>{error}</div></div>}
        {events && rows.length === 0 && <div className={styles.emptyState}><div className={styles.t}>No events match</div></div>}
        {rows.length > 0 && (
          <table className={styles.table}>
            <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Object</th><th>Summary</th></tr></thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id}>
                  <td className={styles.mutedCell} style={{ whiteSpace: 'nowrap' }}>{relTime(e.occurred_at)}</td>
                  <td className={styles.mutedCell}>{e.actor_label || '—'}</td>
                  <td style={{ fontWeight: 500 }}>{e.action}</td>
                  <td className={styles.mutedCell}>{e.object_table || '—'}</td>
                  <td className={styles.mutedCell}>{e.summary || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}

/* ── Staff grants ───────────────────────────────────────────────────── */
interface Grant { user_id: string; granted_by: string | null; granted_at: string; expires_at: string | null; reason: string | null; tenant_id: string | null }
export function AdminStaff() {
  const [grants, setGrants] = useState<Grant[] | null>(null);
  const [operator, setOperator] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    apiGet<{ grants: Grant[]; current_operator_id: string | null }>('/api/platform-admin/staff')
      .then((d) => { setGrants(d.grants); setOperator(d.current_operator_id); })
      .catch((e) => setError(e.message));
  }, []);
  return (
    <>
      <Header title="Staff grants" sub="Who holds platform-admin access, granted by whom, and until when" />
      {operator && <div style={{ fontSize: 13, color: 'var(--muted)', marginBottom: 12 }}>Current session operator: <strong style={{ color: 'var(--ink)' }}>{operator}</strong></div>}
      <div className={styles.card}>
        {error && <div className={styles.emptyState}><div className={styles.t}>Could not load staff grants</div><div className={styles.hint}>{error}</div></div>}
        {grants && grants.length === 0 && (
          <div className={styles.emptyState}>
            <span className={`material-symbols-outlined ${styles.msym}`}>admin_panel_settings</span>
            <div className={styles.t}>No staff grants recorded</div>
            <div className={styles.hint}>The platform_admins table is empty — no operator grants have been recorded yet. Access currently runs on the workspace operator identity.</div>
          </div>
        )}
        {grants && grants.length > 0 && (
          <table className={styles.table}>
            <thead><tr><th>User</th><th>Scope</th><th>Granted by</th><th>Granted</th><th>Expires</th><th>Reason</th></tr></thead>
            <tbody>
              {grants.map((g, i) => (
                <tr key={`${g.user_id}-${i}`}>
                  <td className={styles.mutedCell}>{g.user_id}</td>
                  <td className={styles.mutedCell}>{g.tenant_id ? `Tenant ${g.tenant_id.slice(0, 8)}…` : 'Platform'}</td>
                  <td className={styles.mutedCell}>{g.granted_by || '—'}</td>
                  <td className={styles.mutedCell}>{fmtDate(g.granted_at)}</td>
                  <td className={styles.mutedCell}>{g.expires_at ? fmtDate(g.expires_at) : 'No expiry'}</td>
                  <td className={styles.mutedCell}>{g.reason || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
