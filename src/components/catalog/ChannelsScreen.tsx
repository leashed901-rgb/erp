'use client';

/**
 * ChannelsScreen — the Catalog → Channels pages (pack 3).
 * Marketplace variant (shopify/etsy/tiktok/amazon/…): the channel's
 * connection (integration_connections via /api/channels), its webhook
 * registration, published channel products and channel orders, with
 * Connect / Disconnect wired to /api/channels/connect|disconnect.
 * Ecommerce variant: the kpis-3 stat bar (each tile computed from its
 * named source by /api/channels/overview) + carts + checkout sessions.
 */
import { useCallback, useEffect, useState } from 'react';

interface ChannelData {
  id: string;
  code: string;
  name: string;
  channelType: string;
  active: boolean;
  connection: {
    id: string;
    status: string;
    displayName: string | null;
    externalAccountId: string | null;
    connectedAt: string | null;
    lastSuccessAt: string | null;
    lastError: string | null;
  } | null;
  webhook: { id: string; url: string; events: string[]; active: boolean } | null;
  products: { id: string; name: string; sku: string | null; externalUrl: string | null; published: boolean; syncStatus: string | null; lastSyncedAt: string | null }[];
  orders: { id: string; number: string; status: string; total: number; email: string | null; createdAt: string }[];
}

interface ChannelsResponse {
  channels: ChannelData[];
  available: { code: string; label: string; channelType: string }[];
}

async function api<T>(url: string, init?: RequestInit): Promise<{ data: T | null; error: string | null }> {
  try {
    const r = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init });
    const j = await r.json();
    if (!r.ok) return { data: null, error: j?.error?.message || `HTTP ${r.status}` };
    return { data: j.data as T, error: null };
  } catch (e: any) {
    return { data: null, error: e.message };
  }
}

const money = (n: number | null | undefined) => (n == null ? '—' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const when = (s: string | null) => (s ? new Date(s).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : '—');

export default function ChannelsScreen({ provider, label, onToast }: { provider: string; label: string; onToast: (m: string) => void }) {
  if (provider === 'ecommerce') return <EcommerceOverview onToast={onToast} />;
  return <MarketplaceChannel provider={provider} label={label} onToast={onToast} />;
}

function MarketplaceChannel({ provider, label, onToast }: { provider: string; label: string; onToast: (m: string) => void }) {
  const [channel, setChannel] = useState<ChannelData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [displayName, setDisplayName] = useState(label);
  const [accountId, setAccountId] = useState('');
  const [webhookUrl, setWebhookUrl] = useState(`https://unleashe.app/api/channels/webhook/${provider}`);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = await api<ChannelsResponse>('/api/channels');
    setChannel(data?.channels.find(c => c.code === provider) || null);
    setLoaded(true);
  }, [provider]);
  useEffect(() => { void load(); }, [load]);

  const connected = channel?.connection?.status === 'active' && channel?.active;

  async function connect() {
    setBusy(true);
    const { error } = await api('/api/channels/connect', {
      method: 'POST',
      body: JSON.stringify({ provider, display_name: displayName.trim() || label, external_account_id: accountId.trim() || undefined, webhook_url: webhookUrl.trim() || undefined }),
    });
    setBusy(false);
    if (error) { onToast(`Connect failed: ${error}`); return; }
    onToast(`${label} connected — connection + webhook registration saved`);
    await load();
  }

  async function disconnect() {
    setBusy(true);
    const { error } = await api('/api/channels/disconnect', { method: 'POST', body: JSON.stringify({ provider }) });
    setBusy(false);
    if (error) { onToast(`Disconnect failed: ${error}`); return; }
    onToast(`${label} disconnected`);
    await load();
  }

  return (
    <main className="px-6 pb-12 flex flex-col h-full overflow-y-auto">
      <div className="flex items-center justify-between py-4">
        <div>
          <h1 className="text-headline-lg">{label}</h1>
          <p className="text-body-sm text-on-surface-variant mt-0.5">
            {!loaded ? 'Loading…' : connected ? `Connected · ${channel?.orders.length || 0} orders · ${channel?.products.length || 0} products` : 'Not connected'}
          </p>
        </div>
        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full uppercase ${connected ? 'bg-emerald-100 text-emerald-800' : 'bg-surface-container text-on-surface-variant'}`}>
          {connected ? 'Connected' : channel ? 'Paused' : 'Not connected'}
        </span>
      </div>

      {!loaded ? null : !connected ? (
        <div className="border border-outline-variant rounded-lg p-4 bg-white max-w-[560px]">
          <h3 className="text-title-md font-semibold">Connect {label}</h3>
          <p className="text-body-sm text-on-surface-variant mt-1">
            Records the connection in the integrations domain and registers the order webhook.
            Provider authorization (OAuth) completes against the connection record.
          </p>
          <div className="space-y-3 mt-4">
            <div>
              <label className="text-[11px] uppercase tracking-wider text-on-surface-variant">Store / display name</label>
              <input className="field-input w-full" value={displayName} onChange={e => setDisplayName(e.target.value)} />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-wider text-on-surface-variant">External account ID</label>
              <input className="field-input w-full" placeholder="e.g. your-store.myshopify.com" value={accountId} onChange={e => setAccountId(e.target.value)} />
            </div>
            <div>
              <label className="text-[11px] uppercase tracking-wider text-on-surface-variant">Webhook URL</label>
              <input className="field-input w-full" value={webhookUrl} onChange={e => setWebhookUrl(e.target.value)} />
            </div>
            <button className="h-9 px-4 rounded bg-primary text-white text-body-md font-semibold disabled:opacity-50" disabled={busy} onClick={() => void connect()}>
              {busy ? 'Connecting…' : `Connect ${label}`}
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="border border-outline-variant rounded-lg p-4 bg-white">
            <div className="flex items-start gap-3 flex-wrap">
              <div className="flex-1 min-w-[240px]">
                <div className="text-title-md font-semibold">{channel?.connection?.displayName || label}</div>
                <div className="text-body-sm text-on-surface-variant">
                  Account: {channel?.connection?.externalAccountId || '—'} · Connected {when(channel?.connection?.connectedAt || null)} · Last sync {when(channel?.connection?.lastSuccessAt || null)}
                </div>
                {channel?.connection?.lastError && <div className="text-body-sm text-error mt-1">Last error: {channel.connection.lastError}</div>}
                <div className="text-body-sm text-on-surface-variant mt-2">
                  Webhook: {channel?.webhook ? <span className="font-mono text-[12px]">{channel.webhook.url}</span> : 'not registered'}
                  {channel?.webhook ? ` · ${channel.webhook.active ? 'active' : 'paused'} · events: ${(channel.webhook.events || []).join(', ')}` : ''}
                </div>
              </div>
              <button className="h-8 px-3 rounded border border-outline text-body-sm" disabled={busy} onClick={() => void disconnect()}>Disconnect</button>
            </div>
          </div>

          <h3 className="text-title-md font-semibold mt-6 mb-2">Published products ({channel?.products.length || 0})</h3>
          {(channel?.products.length || 0) === 0 ? (
            <p className="text-body-sm text-on-surface-variant">No products published to {label} yet. Publishing a listing with this channel writes the link here.</p>
          ) : (
            <div className="border border-outline-variant rounded-lg overflow-hidden">
              {channel!.products.map(p => (
                <div key={p.id} className="flex items-center gap-3 px-3 py-2.5 border-t first:border-t-0 border-outline-variant bg-white">
                  <span className="flex-1 text-body-md font-medium">{p.name}</span>
                  <span className="text-body-sm text-on-surface-variant">{p.sku || ''}</span>
                  <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${p.published ? 'bg-emerald-100 text-emerald-800' : 'bg-surface-container text-on-surface-variant'}`}>{p.published ? 'Published' : 'Unpublished'}</span>
                  <span className="text-body-sm text-on-surface-variant">{p.syncStatus || ''}</span>
                  <span className="text-body-sm text-on-surface-variant">{when(p.lastSyncedAt)}</span>
                </div>
              ))}
            </div>
          )}

          <h3 className="text-title-md font-semibold mt-6 mb-2">Orders from {label} ({channel?.orders.length || 0})</h3>
          {(channel?.orders.length || 0) === 0 ? (
            <p className="text-body-sm text-on-surface-variant">No orders synced from {label} yet. Channel order webhooks land here as orders.</p>
          ) : (
            <div className="border border-outline-variant rounded-lg overflow-hidden">
              {channel!.orders.map(o => (
                <div key={o.id} className="flex items-center gap-3 px-3 py-2.5 border-t first:border-t-0 border-outline-variant bg-white">
                  <span className="flex-1 text-body-md font-medium">{o.number}</span>
                  <span className="text-body-sm text-on-surface-variant">{o.email || ''}</span>
                  <span className="text-body-sm capitalize">{o.status}</span>
                  <span className="text-body-md tabular-nums">{money(o.total)}</span>
                  <span className="text-body-sm text-on-surface-variant">{when(o.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </main>
  );
}

interface OverviewData {
  tiles: {
    carts24h: number;
    checkoutConversion: number | null;
    checkoutsStarted: number;
    checkoutsCompleted: number;
    activePromotions: number;
    giftCardsOutstanding: number;
    channelsConnected: number;
    webhookEvents24h: number;
  };
  carts: { id: string; status: string; total: number; subtotal: number; currency: string; updated_at: string }[];
  sessions: { id: string; status: string; amount_due: number; amount_received: number; started_at: string; completed_at: string | null }[];
}

function EcommerceOverview({ onToast }: { onToast: (m: string) => void }) {
  const [data, setData] = useState<OverviewData | null>(null);
  useEffect(() => {
    void (async () => {
      const { data: d, error } = await api<OverviewData>('/api/channels/overview');
      if (error) onToast(`Overview failed: ${error}`);
      setData(d);
    })();
  }, [onToast]);

  const t = data?.tiles;
  const tiles: { label: string; value: string; sub: string }[] = [
    { label: 'Carts (24h)', value: t ? String(t.carts24h) : '—', sub: 'updated in the last 24 hours' },
    { label: 'Checkout conversion', value: t ? (t.checkoutConversion == null ? '—' : `${t.checkoutConversion}%`) : '—', sub: t ? `${t.checkoutsCompleted} of ${t.checkoutsStarted} completed this month` : '' },
    { label: 'Active promotions', value: t ? String(t.activePromotions) : '—', sub: 'live in commerce_promotions' },
    { label: 'Gift cards outstanding', value: t ? money(t.giftCardsOutstanding) : '—', sub: 'unredeemed balance' },
    { label: 'Channels connected', value: t ? String(t.channelsConnected) : '—', sub: 'integration connections' },
    { label: 'Webhook events (24h)', value: t ? String(t.webhookEvents24h) : '—', sub: 'channel events + inbox' },
  ];

  return (
    <main className="px-6 pb-12 flex flex-col h-full overflow-y-auto">
      <div className="py-4">
        <h1 className="text-headline-lg">Ecommerce</h1>
        <p className="text-body-sm text-on-surface-variant mt-0.5">Carts, checkout sessions and channel activity — live from the commerce tables.</p>
      </div>
      <div className="grid grid-cols-3 gap-3 max-lg:grid-cols-2">
        {tiles.map(tile => (
          <div key={tile.label} className="bg-white rounded-xl border border-surface-dim p-3">
            <div className="text-[10px] text-on-surface-variant uppercase font-bold">{tile.label}</div>
            <div className="text-headline-sm tabular-nums">{tile.value}</div>
            <div className="text-[11px] text-on-surface-variant">{tile.sub}</div>
          </div>
        ))}
      </div>

      <h3 className="text-title-md font-semibold mt-6 mb-2">Carts ({data?.carts.length || 0})</h3>
      {!data ? <p className="text-body-sm text-on-surface-variant">Loading…</p> : data.carts.length === 0 ? (
        <p className="text-body-sm text-on-surface-variant">No carts yet. Storefront checkouts create carts here.</p>
      ) : (
        <div className="border border-outline-variant rounded-lg overflow-hidden">
          {data.carts.map(c => (
            <div key={c.id} className="flex items-center gap-3 px-3 py-2.5 border-t first:border-t-0 border-outline-variant bg-white">
              <span className="flex-1 text-body-md font-mono text-[12px]">{c.id.slice(0, 8)}…</span>
              <span className="text-body-sm capitalize">{c.status}</span>
              <span className="text-body-md tabular-nums">{money(c.total)}</span>
              <span className="text-body-sm text-on-surface-variant">{when(c.updated_at)}</span>
            </div>
          ))}
        </div>
      )}

      <h3 className="text-title-md font-semibold mt-6 mb-2">Checkout sessions ({data?.sessions.length || 0})</h3>
      {!data ? null : data.sessions.length === 0 ? (
        <p className="text-body-sm text-on-surface-variant">No checkout sessions yet.</p>
      ) : (
        <div className="border border-outline-variant rounded-lg overflow-hidden">
          {data.sessions.map(s => (
            <div key={s.id} className="flex items-center gap-3 px-3 py-2.5 border-t first:border-t-0 border-outline-variant bg-white">
              <span className="flex-1 text-body-md font-mono text-[12px]">{s.id.slice(0, 8)}…</span>
              <span className="text-body-sm capitalize">{s.status}</span>
              <span className="text-body-md tabular-nums">{money(s.amount_received)} / {money(s.amount_due)}</span>
              <span className="text-body-sm text-on-surface-variant">{when(s.completed_at || s.started_at)}</span>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
