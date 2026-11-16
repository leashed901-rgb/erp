'use client';

/**
 * Connected Channels — social account management, wired to the real
 * social_accounts rows (doc 23: Channels).
 *
 * Honest status, derived by GET /api/social/accounts: an account only
 * reads "Connected" when an OAuth token is actually held for it. The
 * seeded Instagram row says 'connected' in the table but holds no token
 * anywhere, so the API reports it as needs_reconnect and this screen
 * shows it that way. Creating a channel records the row (status
 * 'disconnected'); publishing stays off until OAuth is connected, and
 * no provider app is configured yet — the screen says so instead of
 * pretending the connect worked.
 */
import { useMemo, useState } from 'react';
import styles from './SocialChannels.module.css';
import { useSocialAccounts, socialMutations } from '@/hooks/useSocialApi';
import type { SocialAccount } from '@/lib/socialTypes';

interface SocialChannelsScreenProps {
  onToast: (msg: string) => void;
  onNavigate?: (domain: import('@/data/shellData').DomainKey, screenId: string) => void;
}

interface Channel {
  accountId: string | null;
  name: string;
  handle: string;
  icon: string;
  color: string;
  status: 'connected' | 'needs_reconnect' | 'disconnected' | 'not_connected';
  createdAt: string | null;
}

const PROVIDERS = [
  { id: 'Instagram', network: 'instagram', icon: 'photo_camera', color: '#c13584' },
  { id: 'Facebook', network: 'facebook', icon: 'group', color: '#1877f2' },
  { id: 'LinkedIn', network: 'linkedin', icon: 'business_center', color: '#0a66c2' },
  { id: 'TikTok', network: 'tiktok', icon: 'music_note', color: '#010101' },
  { id: 'YouTube', network: 'youtube', icon: 'smart_display', color: '#ff0000' },
  { id: 'Pinterest', network: 'pinterest', icon: 'push_pin', color: '#bd081c' },
];

function statusLabel(s: Channel['status']): string {
  if (s === 'connected') return 'Connected';
  if (s === 'needs_reconnect') return 'Needs reconnect';
  if (s === 'disconnected') return 'Disconnected';
  return 'Not connected';
}

export default function SocialChannelsScreen({ onToast }: SocialChannelsScreenProps) {
  const { accounts, loading, error, refresh } = useSocialAccounts();
  const [peekChannel, setPeekChannel] = useState<Channel | null>(null);
  const [connectOpen, setConnectOpen] = useState(false);
  const [connectProvider, setConnectProvider] = useState('Instagram');
  const [connectAccount, setConnectAccount] = useState('');
  const [busy, setBusy] = useState(false);

  const channels: Channel[] = useMemo(() => {
    const byNetwork = new Map<string, SocialAccount>();
    for (const a of accounts) byNetwork.set(a.network.toLowerCase(), a);
    return PROVIDERS.map((p) => {
      const row = byNetwork.get(p.network);
      if (!row) {
        return { accountId: null, name: p.id, handle: 'Not connected', icon: p.icon, color: p.color, status: 'not_connected' as const, createdAt: null };
      }
      const status =
        row.status === 'connected' ? ('connected' as const)
        : row.status === 'needs_reconnect' ? ('needs_reconnect' as const)
        : ('disconnected' as const);
      return { accountId: row.id, name: p.id, handle: row.handle || row.displayName || '—', icon: p.icon, color: p.color, status, createdAt: row.createdAt };
    });
  }, [accounts]);

  const connectedCount = channels.filter((c) => c.status === 'connected').length;

  const handleDisconnect = async (ch: Channel) => {
    if (!ch.accountId) return;
    setBusy(true);
    const r = await socialMutations.updateAccount(ch.accountId, { status: 'disconnected' });
    setBusy(false);
    if (!r.ok) { onToast(`Disconnect failed: ${r.error || 'unknown error'}`); return; }
    await refresh();
    setPeekChannel(null);
    onToast(`${ch.name} disconnected.`);
  };

  const handleConnect = async () => {
    const prov = PROVIDERS.find((p) => p.id === connectProvider)!;
    const handle = connectAccount.trim();
    if (!handle) { onToast('Enter the account handle first.'); return; }
    setBusy(true);
    const r = await socialMutations.createAccount({ network: prov.network, handle });
    setBusy(false);
    if (!r.ok) { onToast(`Could not add channel: ${r.error || 'unknown error'}`); return; }
    await refresh();
    onToast(`${connectProvider} ${handle} recorded — OAuth is still pending, so publishing stays off until a provider app is connected.`);
    setConnectAccount('');
    setConnectOpen(false);
  };

  const openConnectFor = (ch: Channel) => {
    setConnectProvider(ch.name);
    setConnectOpen(true);
  };

  return (
    <div className={styles.screen}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <h1 className={styles.toolbarTitle}>Connected channels</h1>
          <p className={styles.toolbarSub}>
            {loading ? 'Loading channels…' : `${connectedCount} of ${channels.length} accounts connected`}
          </p>
        </div>
        <div className={styles.toolbarRight}>
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => { setConnectProvider('Instagram'); setConnectOpen(true); }}>
            <span className="material-symbols-outlined">add_link</span> Connect channel
          </button>
        </div>
      </div>

      <div className={styles.content}>
        {error && (
          <div className={styles.card}>
            <p style={{ margin: 0, fontSize: 13, color: '#b3261e' }}>Could not load channels: {error}</p>
          </div>
        )}
        <div className={styles.card}>
          <div className={styles.cardHead}>
            <div className={styles.cardHeadLeft}>
              <h2 className={styles.cardTitle}>Your social accounts</h2>
              <p className={styles.cardSub}>Manage provider connections and token status.</p>
            </div>
            <span className={styles.badge}>{connectedCount} connected</span>
          </div>
          {loading ? (
            <p style={{ margin: 0, padding: '16px 0', fontSize: 13, color: 'var(--mut)' }}>Loading…</p>
          ) : (
            channels.map((ch) => (
              <div key={ch.name} className={styles.channelRow}>
                <div className={styles.channelLogo} style={{ background: ch.color }}><span className="material-symbols-outlined">{ch.icon}</span></div>
                <div className={styles.channelMain}>
                  <div className={styles.channelName}>{ch.name}</div>
                  <div className={styles.channelHandle}>{ch.accountId ? ch.handle : 'Not connected'}</div>
                </div>
                {ch.status === 'connected' ? (
                  <>
                    <span className={styles.channelStatus}><span className={styles.dot} />Connected</span>
                    <div className={styles.channelActions}>
                      <button type="button" className={`${styles.btn} ${styles.btnOutline}`} onClick={() => setPeekChannel(ch)}>Manage</button>
                      <button type="button" className={`${styles.btn} ${styles.btnDanger}`} disabled={busy} onClick={() => void handleDisconnect(ch)}>Disconnect</button>
                    </div>
                  </>
                ) : ch.status === 'needs_reconnect' ? (
                  <>
                    <span className={`${styles.channelStatus} ${styles.channelStatusOffline}`}><span className={`${styles.dot} ${styles.dotOff}`} />Needs reconnect</span>
                    <div className={styles.channelActions}>
                      <button type="button" className={`${styles.btn} ${styles.btnOutline}`} onClick={() => setPeekChannel(ch)}>Manage</button>
                      <button type="button" className={`${styles.btn} ${styles.btnDanger}`} disabled={busy} onClick={() => void handleDisconnect(ch)}>Disconnect</button>
                    </div>
                  </>
                ) : (
                  <>
                    <span className={`${styles.channelStatus} ${styles.channelStatusOffline}`}><span className={`${styles.dot} ${styles.dotOff}`} />Not connected</span>
                    <div className={styles.channelActions}>
                      <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => openConnectFor(ch)}>
                        <span className="material-symbols-outlined">link</span> Connect
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))
          )}
        </div>

        <div className={styles.card}>
          <div className={styles.cardHead}>
            <div className={styles.cardHeadLeft}>
              <h2 className={styles.cardTitle}>Provider integration requirements</h2>
              <p className={styles.cardSub}>Each provider adapter handles its own scopes, media rules, and token lifecycle.</p>
            </div>
          </div>
          <div className={styles.infoGrid}>
            <div className={styles.infoItem}><p className={styles.infoItemTitle}>OAuth &amp; permissions</p><p className={styles.infoItemText}>Account authorization, scopes, refresh tokens, expiration, and revocation. No provider app is configured yet, so OAuth cannot complete — channels record here first.</p></div>
            <div className={styles.infoItem}><p className={styles.infoItemTitle}>Publishing capabilities</p><p className={styles.infoItemText}>Supported post types, media constraints, scheduled publishing, API limits. Posts only leave the queue for accounts with a live token.</p></div>
            <div className={styles.infoItem}><p className={styles.infoItemTitle}>Delivery status</p><p className={styles.infoItemText}>Provider post IDs, status polling, webhooks, errors, retries.</p></div>
            <div className={styles.infoItem}><p className={styles.infoItemTitle}>Account mapping</p><p className={styles.infoItemText}>Workspace, organization, social profile, and provider identity.</p></div>
          </div>
        </div>
      </div>

      {/* Peek drawer */}
      {peekChannel && (
        <>
          <div className={`${styles.scrim} ${styles.scrimOpen}`} onClick={() => setPeekChannel(null)} />
          <div className={`${styles.peek} ${styles.peekOpen}`}>
            <div className={styles.peekHead}>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div className={styles.channelLogo} style={{ background: peekChannel.color, width: 32, height: 32 }}><span className="material-symbols-outlined" style={{ fontSize: 18 }}>{peekChannel.icon}</span></div>
                <div>
                  <h3 className={styles.peekHeadTitle}>{peekChannel.name}</h3>
                  <p className={styles.peekHeadSub}>{peekChannel.handle}</p>
                </div>
              </div>
              <button type="button" className={styles.btnIcon} onClick={() => setPeekChannel(null)}><span className="material-symbols-outlined">close</span></button>
            </div>
            <div className={styles.peekBody}>
              <div className={styles.peekField}><span className={styles.peekLabel}>Status</span><span className={styles.peekValue}>{statusLabel(peekChannel.status)}</span></div>
              <div className={styles.peekField}><span className={styles.peekLabel}>Handle</span><span className={styles.peekValue}>{peekChannel.handle}</span></div>
              {peekChannel.status === 'needs_reconnect' && (
                <div className={styles.peekField}><span className={styles.peekLabel}>Token</span><span className={styles.peekValue}>No OAuth token held — reconnect needs a configured provider app.</span></div>
              )}
              <div className={styles.peekField}><span className={styles.peekLabel}>Added</span><span className={styles.peekValue}>{peekChannel.createdAt ? new Date(peekChannel.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</span></div>
              <div className={styles.peekField}><span className={styles.peekLabel}>Account ID</span><span className={styles.peekValue}>{peekChannel.accountId || '—'}</span></div>
            </div>
            <div className={styles.peekFooter}>
              <button type="button" className={`${styles.btn} ${styles.btnDanger}`} disabled={busy} onClick={() => void handleDisconnect(peekChannel)}><span className="material-symbols-outlined">link_off</span> Disconnect</button>
            </div>
          </div>
        </>
      )}

      {/* Connect modal */}
      {connectOpen && (
        <div className={styles.modalScrim} onClick={() => setConnectOpen(false)}>
          <div className={styles.modalBox} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHead}>
              <h2>Connect a social channel</h2>
              <button type="button" className={styles.btnIcon} onClick={() => setConnectOpen(false)}><span className="material-symbols-outlined">close</span></button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.field}>
                <label className={styles.label}>Provider</label>
                <select className={styles.select} value={connectProvider} onChange={(e) => setConnectProvider(e.target.value)}>
                  {PROVIDERS.map((p) => (<option key={p.id}>{p.id}</option>))}
                </select>
              </div>
              <div className={styles.field}>
                <label className={styles.label}>Account handle</label>
                <input className={styles.input} type="text" placeholder="@yourbrand" value={connectAccount} onChange={(e) => setConnectAccount(e.target.value)} autoFocus />
              </div>
              <p style={{ margin: '12px 0 0', fontSize: 12, lineHeight: 1.5, color: 'var(--mut)' }}>
                This records the channel. It does not connect OAuth — no provider app is configured yet, so publishing stays off until one is.
              </p>
            </div>
            <div className={styles.modalFoot}>
              <button type="button" className={`${styles.btn} ${styles.btnOutline}`} onClick={() => setConnectOpen(false)}>Cancel</button>
              <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} disabled={busy} onClick={() => void handleConnect()}>
                <span className="material-symbols-outlined">link</span> Record channel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
