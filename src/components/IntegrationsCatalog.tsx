'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import styles from './IntegrationsCatalog.module.css';

/**
 * Settings → Integrations: logo and name, nothing else (Kim,
 * 2026-11-16 — everything else was cognitive overload). A card is
 * the app; clicking it opens the two-column authentication flyout
 * where the connecting happens. State lives in the flyout: a
 * Connect button means it isn't connected, a Disconnect button
 * means it is. Tiers are an internal ranking and never surface.
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
  appModules: string[];
  loginType: string | null;
  setupInstructions: string[];
  setupLink: string | null;
  whatItDoes: string | null;
  canCreate: string | null;
  canRead: string | null;
  canDelete: string | null;
  eventsInstant: string | null;
  eventsPolled: string | null;
  actionsCount: number | null;
  triggersCount: number | null;
  integrationPoints: IntegrationPoint[];
  activepiecesMatch: string | null;
  importsData: string[];
}

interface CatalogData {
  providers: CatalogProvider[];
  total: number;
  connectable: number;
  connected: number;
}

const isOAuth = (mode: string | null) =>
  mode === 'OAUTH2' || mode === 'OAUTH1' || mode === 'MCP_OAUTH2' || mode === 'OAUTH2_CC';

interface IntegrationPoint {
  kind: string;
  name: string;
  direction: string;
  dataType: string;
  module: string;
  description: string;
  fields: string;
}

// A module path from the connector master list ("CRM & Contacts >
// Parties / Customers / Leads") is a chain of places, and the sidebar
// is built the way the app's own sidebar is built: a tree of parents
// with chevron accordions, each place its own child entry nested
// under its parent. Raw data labels never surface — spreadsheet
// notes like "(works on input you give it)" or "(data check)" are
// data, not navigation, and no label carries a path separator.
function cleanSegment(seg: string): string {
  const s = seg.trim().replace(/\s*\((receivables|shipping|pinned)\)\s*$/, '').trim();
  if (s === 'Parties (data check)') return 'Data enrichment';
  return s;
}

function segmentsOf(path: string): string[] | null {
  if (path.startsWith('No matching module')) return null;
  if (path.startsWith('None (') || path.startsWith('Any screen')) return ['Utilities'];
  if (path.startsWith('System & Personal >')) {
    const sub = path.split('>').slice(1).join('>').trim();
    if (sub.startsWith('Integrations')) return ['Developer & infrastructure'];
    if (sub.startsWith('Audit')) return ['Security & audit'];
    if (sub.startsWith('Notifications')) return ['Notifications'];
    return ['System & Personal'];
  }
  const segs: string[] = [];
  for (const part of path.split('>')) {
    for (const s of part.split('/')) {
      const c = cleanSegment(s);
      if (c) segs.push(c);
    }
  }
  return segs.length > 0 ? segs : null;
}

interface ModuleNode {
  label: string;
  key: string;
  apps: Map<string, CatalogProvider>;
  children: Map<string, ModuleNode>;
}

function TreeNodeRow({
  node,
  depth,
  filter,
  expandedSet,
  onToggle,
  onSelect,
}: {
  node: ModuleNode;
  depth: number;
  filter: string;
  expandedSet: Set<string>;
  onToggle: (key: string) => void;
  onSelect: (key: string) => void;
}) {
  const kids = [...node.children.values()].sort((a, b) => b.apps.size - a.apps.size);
  const hasKids = kids.length > 0;
  const open = hasKids && expandedSet.has(node.key);
  const active = filter === `node:${node.key}`;
  return (
    <div>
      <div
        className={`${styles.treeRow} ${active ? styles.sideItemActive : ''}`}
        style={{ paddingLeft: 10 + depth * 14 }}
      >
        {hasKids ? (
          <button type="button" className={styles.chevBtn} onClick={() => onToggle(node.key)} aria-label={open ? 'Collapse' : 'Expand'}>
            <span className={`material-symbols-outlined ${styles.chev} ${open ? styles.chevOpen : ''}`}>expand_more</span>
          </button>
        ) : (
          <span className={styles.chevSpacer} />
        )}
        <button type="button" className={styles.treeLabel} onClick={() => onSelect(node.key)}>
          <span>{node.label}</span>
          <span className={styles.sideCount}>{node.apps.size}</span>
        </button>
      </div>
      {open &&
        kids.map((kid) => (
          <TreeNodeRow
            key={kid.key}
            node={kid}
            depth={depth + 1}
            filter={filter}
            expandedSet={expandedSet}
            onToggle={onToggle}
            onSelect={onSelect}
          />
        ))}
    </div>
  );
}

function directionTag(direction: string): string {
  const d = direction.replace(/\s+/g, ' ').trim();
  if (d.includes('event push') || d.startsWith('Service ->')) return 'event';
  if (d.includes('app ->')) return 'push';
  return 'pull';
}

// Capability and event data arrives as semicolon-joined text; it is
// presented as discrete items, never as a run-on string.
function splitList(s: string | null): string[] {
  return s ? s.split(';').map((x) => x.trim()).filter(Boolean) : [];
}

function TagGroup({ label, items }: { label: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <div className={styles.tagGroup}>
      <div className={styles.groupLabel}>{label}</div>
      <div className={styles.tagWrap}>
        {items.map((item) => (
          <span key={item} className={styles.tag}>
            {item}
          </span>
        ))}
      </div>
    </div>
  );
}

// An app's role in the platform: it imports data into the modules.
// The placement is where that data lands, and the imported data
// types come from the connector's inbound points (pulls, syncs and
// event pushes) — never presented as the app doing the module's work.
function ImportsBlock({ provider }: { provider: CatalogProvider }) {
  if (!provider.appModules || provider.appModules.length === 0) return null;
  const inboundTypes = provider.importsData || [];
  const imports =
    inboundTypes.length > 0 ||
    splitList(provider.eventsInstant).length > 0 ||
    splitList(provider.eventsPolled).length > 0;
  return (
    <div className={styles.authGuide}>
      <div className={styles.authGuideTitle}>{imports ? 'Imports into' : 'App modules'}</div>
      {provider.appModules.map((path) => {
        const segs = segmentsOf(path);
        if (!segs) return null;
        return (
          <div key={path} className={styles.placeRow}>
            <span className={styles.placeDomain}>{segs[0]}</span>
            {segs.length > 1 && <span className={styles.placeModule}>{segs[segs.length - 1]}</span>}
          </div>
        );
      })}
      <TagGroup label="Data imported" items={inboundTypes} />
    </div>
  );
}

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

  // The module tree: every place in a connector's placement chain is
  // a node, children nested under their parent — the same accordion
  // construction as the app's sidebar. A connector is housed at every
  // node its chain passes through.
  const moduleTree = useMemo(() => {
    const roots = new Map<string, ModuleNode>();
    for (const p of connectable) {
      for (const path of p.appModules || []) {
        const chain = segmentsOf(path);
        if (!chain) continue;
        let level = roots;
        let key = '';
        for (const seg of chain) {
          key = key ? `${key}\u001f${seg}` : seg;
          if (!level.has(seg)) level.set(seg, { label: seg, key, apps: new Map(), children: new Map() });
          const node = level.get(seg)!;
          node.apps.set(p.code, p);
          level = node.children;
        }
      }
    }
    return [...roots.values()].sort((a, b) => b.apps.size - a.apps.size);
  }, [connectable]);

  const unplaced = useMemo(
    () => connectable.filter((p) => !p.appModules || p.appModules.length === 0),
    [connectable],
  );

  // The branch containing the current selection stays open, the way
  // the app's sidebar auto-expands around the active screen.
  const expandedSet = useMemo(() => {
    const s = new Set(expanded);
    if (filter.startsWith('node:')) {
      const parts = filter.slice(5).split('\u001f');
      let key = '';
      for (const part of parts.slice(0, -1)) {
        key = key ? `${key}\u001f${part}` : part;
        s.add(key);
      }
    }
    return s;
  }, [expanded, filter]);

  const toggleNode = useCallback((key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const selectNode = useCallback((key: string) => {
    setFilter(`node:${key}`);
    setExpanded((prev) => {
      const next = new Set(prev);
      const parts = key.split('\u001f');
      let k = '';
      for (const part of parts) {
        k = k ? `${k}\u001f${part}` : part;
        next.add(k);
      }
      return next;
    });
  }, []);

  const visible = useMemo(() => {
    let list = connectable;
    if (filter === 'connected') list = list.filter((p) => p.status === 'active');
    else if (filter === 'apmatch') list = list.filter((p) => p.activepiecesMatch);
    else if (filter === 'unplaced') list = unplaced;
    else if (filter.startsWith('node:')) {
      const chain = filter.slice(5).split('\u001f');
      list = list.filter((p) =>
        (p.appModules || []).some((path) => {
          const segs = segmentsOf(path);
          return segs !== null && chain.every((s, i) => segs[i] === s);
        }),
      );
    }
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q) || p.code.includes(q));
    }
    return list;
  }, [connectable, filter, query, unplaced]);

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

  const submitDisconnect = async () => {
    if (!modal) return;
    setSubmitting(true);
    setModalError(null);
    try {
      const res = await fetch('/api/integrations/disconnect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: modal.code }),
      });
      const json = await res.json();
      if (!res.ok || json.error) throw new Error(json.error?.message || 'Disconnect failed');
      setModal(null);
      onToast(`${modal.name} disconnected.`);
      load();
    } catch (e) {
      setModalError(e instanceof Error ? e.message : 'Disconnect failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (error) return <div className={styles.empty}>{error}</div>;
  if (!data) return <div className={styles.empty}>Loading integrations…</div>;

  const connectedCount = connectable.filter((p) => p.status === 'active').length;
  const apMatchCount = connectable.filter((p) => p.activepiecesMatch).length;

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
        <button
          type="button"
          className={`${styles.sideItem} ${filter === 'apmatch' ? styles.sideItemActive : ''}`}
          onClick={() => setFilter('apmatch')}
        >
          <span>Has an Activepieces match</span>
          <span className={styles.sideCount}>{apMatchCount}</span>
        </button>

        <div className={styles.sideTitle}>Modules</div>
        {moduleTree.map((node) => (
          <TreeNodeRow
            key={node.key}
            node={node}
            depth={0}
            filter={filter}
            expandedSet={expandedSet}
            onToggle={toggleNode}
            onSelect={selectNode}
          />
        ))}
      </aside>

      <section className={styles.main}>
        <div className={styles.head}>
          <span className={styles.title}>Integrations</span>
          <span className={styles.sub}>{connectable.length} apps</span>
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
              <button key={p.code} type="button" className={styles.card} onClick={() => openModal(p)}>
                <Icon provider={p} />
                <span className={styles.name}>{p.name}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      {modal && (
        <div className={styles.modalBackdrop} onClick={() => !submitting && setModal(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.authGrid}>
              {/* Left column: what this is, where the key lives. */}
              <div className={styles.authSide}>
                <Icon provider={modal} />
                <div className={styles.authName}>{modal.name}</div>
                <div className={styles.meta}>{modal.capability}</div>
                <div className={styles.authStatus}>
                  {modal.status === 'active'
                    ? 'Connected'
                    : modal.status === 'error'
                      ? 'Needs attention — the saved credentials were rejected. Reconnect below.'
                      : 'Not connected'}
                </div>
                {modal.whatItDoes && <p className={styles.authAbout}>{modal.whatItDoes}</p>}
                <ImportsBlock provider={modal} />
                {(modal.canCreate ||
                  modal.canRead ||
                  modal.canDelete ||
                  modal.eventsInstant ||
                  modal.eventsPolled ||
                  modal.loginType ||
                  modal.activepiecesMatch) && (
                  <div className={styles.authGuide}>
                    <div className={styles.authGuideTitle}>How it integrates</div>
                    <TagGroup label="Creates" items={splitList(modal.canCreate)} />
                    <TagGroup label="Reads" items={splitList(modal.canRead)} />
                    <TagGroup label="Deletes" items={splitList(modal.canDelete)} />
                    <TagGroup label="Instant events" items={splitList(modal.eventsInstant)} />
                    <TagGroup label="Polled events" items={splitList(modal.eventsPolled)} />
                    {modal.loginType && (
                      <div className={styles.tagGroup}>
                        <div className={styles.groupLabel}>Connects by</div>
                        <div className={styles.connectLine}>{modal.loginType}</div>
                      </div>
                    )}
                    {modal.activepiecesMatch && (
                      <div className={styles.tagGroup}>
                        <div className={styles.groupLabel}>Also in Activepieces</div>
                        <div className={styles.connectLine}>{modal.activepiecesMatch}</div>
                      </div>
                    )}
                  </div>
                )}
                {modal.integrationPoints.length > 0 && (
                  <div className={styles.authGuide}>
                    <div className={styles.authGuideTitle}>
                      Actions &amp; triggers ({modal.integrationPoints.length})
                    </div>
                    {[
                      {
                        title: 'Imports',
                        points: modal.integrationPoints.filter((pt) => directionTag(pt.direction) !== 'push'),
                      },
                      {
                        title: `Actions in ${modal.name}`,
                        points: modal.integrationPoints.filter((pt) => directionTag(pt.direction) === 'push'),
                      },
                    ]
                      .filter((g) => g.points.length > 0)
                      .map((g) => (
                        <div key={g.title} className={styles.tagGroup}>
                          <div className={styles.groupLabel}>{g.title}</div>
                          <div className={styles.pointsList}>
                            {g.points.map((pt, i) => (
                              <div key={i} className={styles.pointRow}>
                                <div className={styles.pointHead}>
                                  <span className={styles.pointName}>
                                    {pt.kind === 'Trigger' ? 'Trigger · ' : ''}
                                    {pt.name}
                                  </span>
                                  <span className={styles.pointMeta}>{pt.dataType}</span>
                                </div>
                                {pt.description && <div className={styles.pointDesc}>{pt.description}</div>}
                              </div>
                            ))}
                          </div>
                        </div>
                      ))}
                  </div>
                )}
                {modal.status !== 'active' && !isOAuth(modal.authMode) && modal.credentialFields.length > 0 && (
                  <div className={styles.authGuide}>
                    <div className={styles.authGuideTitle}>Where to find it</div>
                    {modal.setupInstructions.length > 0
                      ? modal.setupInstructions.map((line, i) => <p key={i}>{line}</p>)
                      : [
                          ...modal.credentialFields.map((f) => (
                            <p key={f.name}>{f.description || f.title}</p>
                          )),
                          ...modal.connectionFields.map((f) => (
                            <p key={f.name}>{f.description || f.title}</p>
                          )),
                        ]}
                  </div>
                )}
                {modal.status !== 'active' && isOAuth(modal.authMode) && (
                  <div className={styles.authGuide}>
                    <div className={styles.authGuideTitle}>How this works</div>
                    <p>
                      You sign in with {modal.name} in their own window. Unleashe never sees your
                      password. Leave the app fields blank to use the platform app, or paste your
                      own registered app to use yours.
                    </p>
                  </div>
                )}
                {modal.docsUrl && (
                  <a className={styles.authDocs} href={modal.docsUrl} target="_blank" rel="noreferrer">
                    {modal.name} developer docs ↗
                  </a>
                )}
                {modal.setupLink && (
                  <a className={styles.authDocs} href={modal.setupLink} target="_blank" rel="noreferrer">
                    Setup guide ↗
                  </a>
                )}
                <p className={styles.authNote}>
                  Credentials are checked against {modal.name}&rsquo;s API before anything is
                  saved, and stored encrypted in your vault.
                </p>
              </div>

              {/* Right column: the form — or the disconnect. */}
              <div className={styles.authMain}>
                {modal.status === 'active' ? (
                  <>
                    <p className={styles.meta}>
                      This integration is connected and working. Disconnecting stops Unleashe
                      from using it; your saved key stays in your vault.
                    </p>
                    {modalError && <div className={styles.modalError}>{modalError}</div>}
                    <div className={styles.modalFoot}>
                      <button type="button" className={styles.cancelBtn} onClick={() => setModal(null)} disabled={submitting}>
                        Close
                      </button>
                      <button type="button" className={styles.disconnectBtn} onClick={submitDisconnect} disabled={submitting}>
                        {submitting ? 'Working…' : 'Disconnect'}
                      </button>
                    </div>
                  </>
                ) : modal.connectVia === 'channels' ? (
                  <>
                    <p className={styles.meta}>
                      {modal.name} connects through Channels — connect it from the Channels
                      screen, and it will show as connected here.
                    </p>
                    <div className={styles.modalFoot}>
                      <button type="button" className={styles.cancelBtn} onClick={() => setModal(null)}>
                        Close
                      </button>
                    </div>
                  </>
                ) : (
                  <>
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
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
