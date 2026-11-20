'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import styles from './IntegrationsCatalog.module.css';

/**
 * Settings → Integrations: the apps this workspace can actually
 * connect, with our own connection layer — no middleman. Every app
 * listed carries a connect config (auth recipe from the provider
 * library): API-key and basic-auth apps connect through a credential
 * form and are verified against the provider's real API before they
 * turn active; OAuth apps go through the provider's own sign-in with
 * a registered app. The wider piece library (754 apps) stays in the
 * catalog behind this page and surfaces here as configs land.
 */

interface ConnectField {
  name: string;
  title: string;
  secret?: boolean;
  required?: boolean;
  description?: string | null;
}

interface CatalogProvider {
  code: string;
  name: string;
  capability: string;
  tier: number;
  authMode: string | null;
  icon: string | null;
  source: string;
  docsUrl: string | null;
  status: string;
  connectVia: string;
  connectable: boolean;
  credentialFields: ConnectField[];
  connectionFields: ConnectField[];
}

interface CatalogData {
  providers: CatalogProvider[];
  total: number;
  connectable: number;
  connected: number;
}

const AUTH_LABEL: Record<string, string> = {
  OAUTH2: 'OAuth', OAUTH2_CC: 'OAuth', OAUTH1: 'OAuth', MCP_OAUTH2: 'OAuth',
  API_KEY: 'API key', BASIC: 'Basic auth', TWO_STEP: 'API key', JWT: 'Token',
  NONE: 'No auth', CUSTOM: 'Custom',
};
const isOAuth = (mode: string | null) =>
  mode === 'OAUTH2' || mode === 'OAUTH1' || mode === 'MCP_OAUTH2' || mode === 'OAUTH2_CC';

function Icon({ provider }: { provider: CatalogProvider }) {
  const [failed, setFailed] = useState(false);
  if (!provider.icon || failed) {
    return <div className={styles.iconFallback}>{provider.name.slice(0, 1).toUpperCase()}</div>;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img className={styles.icon} src={provider.icon} alt="" loading="lazy" onError={() => setFailed(true)} />
  );
}

export default function IntegrationsCatalog({ onToast }: { onToast: (message: string) => void }) {
  const [data, setData] = useState<CatalogData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState('');
  const [modal, setModal] = useState<CatalogProvider | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const load = useCallback(() => {
    fetch('/api/integrations/catalog')
      .then(async (res) => {
        const json = await res.json();
        if (!res.ok || json.error) throw new Error(json.error?.message || 'Catalog failed to load');
        setData(json.data as CatalogData);
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Catalog failed to load'));
  }, []);

  useEffect(() => load(), [load]);

  const connectable = useMemo(() => (data ? data.providers.filter((p) => p.connectable) : []), [data]);

  const byCapability = useMemo(() => {
    const map = new Map<string, CatalogProvider[]>();
    for (const p of connectable) {
      const list = map.get(p.capability) || [];
      list.push(p);
      map.set(p.capability, list);
    }
    return [...map.entries()].sort((a, b) => b[1].length - a[1].length);
  }, [connectable]);

  const visible = useMemo(() => {
    let list = connectable;
    if (filter === 'connected') list = list.filter((p) => p.status === 'active');
    else if (filter.startsWith('cap:')) list = list.filter((p) => p.capability === filter.slice(4));
    else if (filter.startsWith('tier:')) list = list.filter((p) => p.tier === Number(filter.slice(5)));
    else if (filter.startsWith('app:')) list = list.filter((p) => p.code === filter.slice(4));
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q) || p.code.includes(q));
    }
    return list;
  }, [connectable, filter, query]);

  const toggleExpand = (cap: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(cap)) next.delete(cap);
      else next.add(cap);
      return next;
    });

  const openModal = (provider: CatalogProvider) => {
    setModal(provider);
    setForm({});
    setModalError(null);
  };

  const submitConnect = async () => {
    if (!modal) return;
    setSubmitting(true);
    setModalError(null);
    try {
      if (isOAuth(modal.authMode)) {
        const clientId = (form.__clientId || '').trim();
        const clientSecret = (form.__clientSecret || '').trim();
        if ((clientId && !clientSecret) || (!clientId && clientSecret)) {
          setModalError('Enter both the client ID and the client secret, or leave both blank to use the platform app.');
          return;
        }
        if (clientId) {
          const res = await fetch('/api/integrations/connect/oauth-app', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ provider: modal.code, clientId, clientSecret }),
          });
          const json = await res.json();
          if (!res.ok || json.error) throw new Error(json.error?.message || 'Could not save the app.');
        }
        // Probe the start route first so a missing app shows its
        // message here instead of stranding the user on a JSON page.
        const probe = await fetch(`/api/integrations/oauth/${modal.code}/start`, { redirect: 'manual' });
        if (probe.type === 'opaqueredirect' || probe.status >= 300) {
          window.location.href = `/api/integrations/oauth/${modal.code}/start`;
          return;
        }
        const json = await probe.json().catch(() => ({}));
        throw new Error(json.error?.message || 'OAuth could not start.');
      }
      const credentials: Record<string, string> = {};
      const connectionConfig: Record<string, string> = {};
      for (const f of modal.credentialFields) if (form[f.name]) credentials[f.name] = form[f.name];
      for (const f of modal.connectionFields) if (form[f.name]) connectionConfig[f.name] = form[f.name];
      const res = await fetch('/api/integrations/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: modal.code, credentials, connectionConfig }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error?.message || 'Connect failed');
      setModal(null);
      onToast(`${modal.name} connected — verified against ${modal.name}'s API.`);
      load();
    } catch (e) {
      setModalError(e instanceof Error ? e.message : 'Connect failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (error) return <div className={styles.empty}>{error}</div>;
  if (!data) return <div className={styles.empty}>Loading integrations…</div>;

  const connectedCount = connectable.filter((p) => p.status === 'active').length;

  return (
    <div className={styles.wrap}>
      <aside className={styles.sidebar}>
        <button
          type="button"
          className={`${styles.sideItem} ${filter === 'all' ? styles.sideItemActive : ''}`}
          onClick={() => setFilter('all')}
        >
          <span>All integrations</span>
          <span className={styles.sideCount}>{connectable.length}</span>
        </button>
        <button
          type="button"
          className={`${styles.sideItem} ${filter === 'connected' ? styles.sideItemActive : ''}`}
          onClick={() => setFilter('connected')}
        >
          <span>Connected</span>
          <span className={styles.sideCount}>{connectedCount}</span>
        </button>

        <div className={styles.sideTitle}>Capability</div>
        {byCapability.map(([cap, apps]) => (
          <div key={cap}>
            <div className={`${styles.sideItem} ${filter === `cap:${cap}` ? styles.sideItemActive : ''}`}>
              <button type="button" className={styles.chevron} onClick={() => toggleExpand(cap)} aria-label={expanded.has(cap) ? 'Collapse' : 'Expand'}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>
                  {expanded.has(cap) ? 'expand_more' : 'chevron_right'}
                </span>
              </button>
              <button type="button" className={styles.sideLabel} onClick={() => setFilter(`cap:${cap}`)}>
                {cap}
              </button>
              <span className={styles.sideCount}>{apps.length}</span>
            </div>
            {expanded.has(cap) && (
              <div className={styles.treeChildren}>
                {apps.map((p) => (
                  <button
                    key={p.code}
                    type="button"
                    className={`${styles.treeChild} ${filter === `app:${p.code}` ? styles.sideItemActive : ''}`}
                    onClick={() => setFilter(`app:${p.code}`)}
                  >
                    <span className={`${styles.dot} ${p.status === 'active' ? styles.dotActive : ''}`} />
                    <span className={styles.treeChildName}>{p.name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}

        <div className={styles.sideTitle}>Tier</div>
        {[1, 2, 3].map((tier) => (
          <button
            key={tier}
            type="button"
            className={`${styles.sideItem} ${filter === `tier:${tier}` ? styles.sideItemActive : ''}`}
            onClick={() => setFilter(`tier:${tier}`)}
          >
            <span>Tier {tier}</span>
            <span className={styles.sideCount}>{connectable.filter((p) => p.tier === tier).length}</span>
          </button>
        ))}
      </aside>

      <section className={styles.main}>
        <div className={styles.head}>
          <span className={styles.title}>Integrations</span>
          <span className={styles.sub}>
            {connectable.length} apps ready to connect · {connectedCount} connected · the full
            library holds {data.total} apps and grows as configs land. Connect with your own
            account — your keys, verified live, stored in your vault.
          </span>
        </div>
        <input
          className={styles.search}
          placeholder="Search integrations…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {visible.length === 0 ? (
          <div className={styles.empty}>Nothing here matches that filter yet.</div>
        ) : (
          <div className={styles.grid}>
            {visible.map((p) => (
              <div key={p.code} className={styles.card}>
                <div className={styles.cardTop}>
                  <Icon provider={p} />
                  <div>
                    <div className={styles.name}>{p.name}</div>
                    <div className={styles.meta}>
                      {p.capability} · Tier {p.tier}
                      {p.authMode ? ` · ${AUTH_LABEL[p.authMode] || p.authMode}` : ''}
                    </div>
                  </div>
                </div>
                <div className={styles.cardFoot}>
                  {p.status === 'active' ? (
                    <span className={`${styles.chip} ${styles.chipActive}`}>Connected</span>
                  ) : p.status === 'error' ? (
                    <span className={`${styles.chip} ${styles.chipError}`}>Needs attention</span>
                  ) : (
                    <span className={styles.chip}>Not connected</span>
                  )}
                  {p.status !== 'active' &&
                    (p.connectVia === 'channels' ? (
                      <span className={styles.catalogNote}>Connect in Channels</span>
                    ) : (
                      <button type="button" className={styles.connectBtn} onClick={() => openModal(p)}>
                        Connect
                      </button>
                    ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {modal && (
        <div className={styles.modalBackdrop} onClick={() => !submitting && setModal(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHead}>
              <Icon provider={modal} />
              <div>
                <div className={styles.name}>Connect {modal.name}</div>
                <div className={styles.meta}>
                  {isOAuth(modal.authMode)
                    ? 'Sign in with your own account. Unleashe never sees your password.'
                    : 'Your credentials are checked against ' + modal.name + "'s API before anything is saved."}
                </div>
              </div>
            </div>
            {isOAuth(modal.authMode) ? (
              <>
                <label className={styles.fieldLabel}>App client ID (optional)</label>
                <input
                  className={styles.field}
                  value={form.__clientId || ''}
                  onChange={(e) => setForm({ ...form, __clientId: e.target.value })}
                  placeholder="Leave blank to use the platform app"
                />
                <label className={styles.fieldLabel}>App client secret (optional)</label>
                <input
                  className={styles.field}
                  type="password"
                  value={form.__clientSecret || ''}
                  onChange={(e) => setForm({ ...form, __clientSecret: e.target.value })}
                  placeholder="From the app you registered with this provider"
                />
              </>
            ) : (
              <>
                {modal.credentialFields.map((f) => (
                  <div key={f.name}>
                    <label className={styles.fieldLabel}>{f.title}</label>
                    <input
                      className={styles.field}
                      type={f.secret ? 'password' : 'text'}
                      value={form[f.name] || ''}
                      onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}
                      placeholder={f.description || f.title}
                    />
                  </div>
                ))}
                {modal.connectionFields.map((f) => (
                  <div key={f.name}>
                    <label className={styles.fieldLabel}>{f.title}</label>
                    <input
                      className={styles.field}
                      value={form[f.name] || ''}
                      onChange={(e) => setForm({ ...form, [f.name]: e.target.value })}
                      placeholder={f.description || f.title}
                    />
                  </div>
                ))}
                {modal.credentialFields.length === 0 && modal.connectionFields.length === 0 && (
                  <div className={styles.meta}>This app connects without a key.</div>
                )}
              </>
            )}
            {modalError && <div className={styles.modalError}>{modalError}</div>}
            <div className={styles.modalFoot}>
              <button type="button" className={styles.cancelBtn} onClick={() => setModal(null)} disabled={submitting}>
                Cancel
              </button>
              <button type="button" className={styles.connectBtn} onClick={submitConnect} disabled={submitting}>
                {submitting ? 'Checking…' : isOAuth(modal.authMode) ? 'Continue to sign-in' : 'Connect'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
