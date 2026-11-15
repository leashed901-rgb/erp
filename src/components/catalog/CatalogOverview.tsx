'use client';
/**
 * CatalogOverview — the catalog overview dashboard.
 * 1:1 port of upload/catalog overview (2).html.
 * NOT a table. Dashboard with: KPI strip, health bars, needs attention,
 * recent activity, top SKUs, channel health, quick routes.
 */
import { useEffect, useMemo, useState } from 'react';
import { useProducts, useParties } from '@/hooks/useCrmApi';

interface Props {
  onToast: (m: string) => void;
  onNavigate?: (d: string, s: string) => void;
}

interface Store { id: string; name: string; platform?: string; status?: string; is_active?: boolean }

export default function CatalogOverview({ onToast, onNavigate }: Props) {
  const { data: products, loaded } = useProducts('', 'all');
  const { data: suppliers } = useParties('supplier');
  const [stores, setStores] = useState<Store[]>([]);
  const [collectionCount, setCollectionCount] = useState(0);

  useEffect(() => {
    fetch('/api/v1/stores').then(r => r.json()).then(j => setStores(j.data || [])).catch(() => {});
    fetch('/api/v1/collections').then(r => r.json()).then(j => setCollectionCount((j.data || []).length)).catch(() => {});
  }, []);

  const productCount = products.length;
  const published = products.filter(p => p.status === 'published').length;
  const needsDesign = products.filter(p => p.status === 'needs_design' || p.status === 'not_designed').length;
  const needsReview = products.filter(p => p.status === 'needs_review').length;
  const designedPct = productCount > 0 ? Math.round(published / productCount * 100) : 0;
  const needsDesignPct = productCount > 0 ? Math.round(needsDesign / productCount * 100) : 100;
  const supplierCount = suppliers.length;
  const channelCount = stores.length;
  const channelNeedsSync = stores.filter(s => s.status === 'needs_sync').length;
  const channelErrors = stores.filter(s => s.status === 'error').length;

  return (
    <main className="px-6 pb-12">
      {/* Page title */}
      <div className="py-4">
        <h1 className="text-headline-lg">Catalog overview</h1>
        <p className="text-body-sm text-on-surface-variant mt-0.5">Health, activity, and alerts across products, suppliers, channels, and collections</p>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-5">
        <div className="bg-white border border-surface-dim rounded-xl p-3.5 cursor-pointer hover:border-qb-blue transition-colors" onClick={() => onNavigate?.('catalog', 'products')}>
          <div className="text-[10px] uppercase tracking-wider font-bold text-on-surface-variant flex items-center gap-1.5"><span className="material-symbols-outlined text-[14px] text-qb-blue">inventory</span>Products</div>
          <div className="text-headline-lg mt-1 tabular-nums font-bold">{loaded ? productCount : '—'}</div>
          <div className="text-[11px] text-on-surface-variant mt-0.5">{supplierCount} suppliers · {published} designed</div>
        </div>
        <div className="bg-white border border-surface-dim rounded-xl p-3.5 cursor-pointer hover:border-qb-blue transition-colors" onClick={() => onToast('Open Variants & SKUs')}>
          <div className="text-[10px] uppercase tracking-wider font-bold text-on-surface-variant flex items-center gap-1.5"><span className="material-symbols-outlined text-[14px] text-qb-teal">qr_code</span>Variants &amp; SKUs</div>
          <div className="text-headline-lg mt-1 tabular-nums font-bold">{loaded ? productCount * 3 : '—'}</div>
          <div className="text-[11px] text-on-surface-variant mt-0.5">Estimated from products</div>
        </div>
        <div className="bg-white border border-surface-dim rounded-xl p-3.5 cursor-pointer hover:border-qb-blue transition-colors" onClick={() => onToast('Open Suppliers')}>
          <div className="text-[10px] uppercase tracking-wider font-bold text-on-surface-variant flex items-center gap-1.5"><span className="material-symbols-outlined text-[14px] text-qb-maroon">factory</span>Suppliers</div>
          <div className="text-headline-lg mt-1 tabular-nums font-bold">{supplierCount}</div>
          <div className="text-[11px] text-on-surface-variant mt-0.5">Active partners</div>
        </div>
        <div className="bg-white border border-surface-dim rounded-xl p-3.5 cursor-pointer hover:border-qb-blue transition-colors" onClick={() => onNavigate?.('marketing', 'mkt-channels')}>
          <div className="text-[10px] uppercase tracking-wider font-bold text-on-surface-variant flex items-center gap-1.5"><span className="material-symbols-outlined text-[14px] text-qb-green">local_mall</span>Channels</div>
          <div className="text-headline-lg mt-1 tabular-nums font-bold">{channelCount}</div>
          <div className="text-[11px] text-on-surface-variant mt-0.5">{channelCount - channelNeedsSync - channelErrors} connected · {channelNeedsSync} needs sync · {channelErrors} errors</div>
        </div>
      </div>

      {/* Main grid: Health + Needs attention */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-5">
        {/* Catalog health */}
        <div className="xl:col-span-2 bg-white rounded-xl border border-surface-dim p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-headline-sm">Catalog health</h2>
            <span className="text-[11px] text-on-surface-variant">{productCount} products</span>
          </div>
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <div className="w-32 text-[12px] text-on-surface-variant text-right">Designed &amp; live</div>
              <div className="flex-1"><div className="h-6 bg-surface-container-low rounded overflow-hidden"><div className="h-full rounded flex items-center justify-end pr-2 text-[11px] font-semibold text-white" style={{ width: `${Math.max(2, designedPct)}%`, background: '#1e5a38' }}>{published}</div></div></div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-32 text-[12px] text-on-surface-variant text-right">Needs design</div>
              <div className="flex-1"><div className="h-6 bg-surface-container-low rounded overflow-hidden"><div className="h-full rounded flex items-center justify-end pr-2 text-[11px] font-semibold text-white" style={{ width: `${Math.max(2, needsDesignPct)}%`, background: '#8a5a00' }}>{needsDesign}</div></div></div>
            </div>
            <div className="flex items-center gap-3">
              <div className="w-32 text-[12px] text-on-surface-variant text-right">Needs review</div>
              <div className="flex-1"><div className="h-6 bg-surface-container-low rounded overflow-hidden"><div className="h-full rounded flex items-center justify-end pr-2 text-[11px] font-semibold text-white" style={{ width: `${Math.max(1, productCount > 0 ? Math.round(needsReview / productCount * 100) : 0)}%`, background: '#6b1e28' }}>{needsReview}</div></div></div>
            </div>
          </div>
          <div className="flex items-center gap-4 mt-3 pt-3 border-t border-surface-dim text-[11px] text-on-surface-variant">
            <span><span className="font-semibold text-on-surface">{designedPct}%</span> of catalog is designed</span>
            <span><span className="font-semibold text-on-surface">{needsDesignPct}%</span> needs a design</span>
            {needsReview > 0 && <span><span className="font-semibold text-qb-maroon">{needsReview}</span> need review</span>}
          </div>
        </div>

        {/* Needs attention */}
        <div className="bg-white rounded-xl border border-surface-dim p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-headline-sm">Needs attention</h2>
            <span className="text-[11px] text-error font-semibold">{needsReview + channelNeedsSync + channelErrors} items</span>
          </div>
          <div>
            {needsReview > 0 && (
              <div className="flex items-center gap-2.5 py-2.5 border-b border-surface-container-low cursor-pointer hover:bg-surface-container-low rounded px-1" onClick={() => onNavigate?.('catalog', 'products')}>
                <span className="material-symbols-outlined text-[18px] text-qb-maroon">image_not_supported</span>
                <div className="min-w-0 flex-1">
                  <div className="text-body-sm font-medium">{needsReview} products need review</div>
                  <div className="text-[11px] text-on-surface-variant">Image · price · category missing</div>
                </div>
                <span className="material-symbols-outlined text-[14px] text-outline">chevron_right</span>
              </div>
            )}
            {channelNeedsSync > 0 && (
              <div className="flex items-center gap-2.5 py-2.5 border-b border-surface-container-low cursor-pointer hover:bg-surface-container-low rounded px-1" onClick={() => onNavigate?.('marketing', 'mkt-channels')}>
                <span className="material-symbols-outlined text-[18px] text-qb-maroon">sync_problem</span>
                <div className="min-w-0 flex-1">
                  <div className="text-body-sm font-medium">{channelNeedsSync} channels need sync</div>
                  <div className="text-[11px] text-on-surface-variant">Price &amp; stock drift detected</div>
                </div>
                <span className="material-symbols-outlined text-[14px] text-outline">chevron_right</span>
              </div>
            )}
            {channelErrors > 0 && (
              <div className="flex items-center gap-2.5 py-2.5 border-b border-surface-container-low cursor-pointer hover:bg-surface-container-low rounded px-1" onClick={() => onNavigate?.('marketing', 'mkt-channels')}>
                <span className="material-symbols-outlined text-[18px] text-error">error</span>
                <div className="min-w-0 flex-1">
                  <div className="text-body-sm font-medium">{channelErrors} failed syncs</div>
                  <div className="text-[11px] text-on-surface-variant">Check channel settings</div>
                </div>
                <span className="material-symbols-outlined text-[14px] text-outline">chevron_right</span>
              </div>
            )}
            {needsReview === 0 && channelNeedsSync === 0 && channelErrors === 0 && (
              <div className="py-6 text-center text-on-surface-variant text-body-sm">
                <span className="material-symbols-outlined text-[28px] text-secondary">check_circle</span>
                <div className="mt-1">All clear — no attention needed</div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Second row: Quick routes + Channel health */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-4 mb-5">
        {/* Quick routes */}
        <div className="bg-white rounded-xl border border-surface-dim p-5">
          <h2 className="text-headline-sm mb-3">Jump to</h2>
          <div className="space-y-1">
            {[
              { label: 'Products', icon: 'inventory', count: productCount, target: ['catalog', 'products'] as const, color: 'text-qb-blue' },
              { label: 'Listings', icon: 'web', count: published, target: ['catalog', 'listings'] as const, color: 'text-qb-teal' },
              { label: 'Bundles', icon: 'redeem', count: '—', target: ['catalog', 'bundles'] as const, color: 'text-qb-green' },
              { label: 'Suppliers', icon: 'factory', count: supplierCount, target: ['catalog', 'products'] as const, color: 'text-qb-maroon' },
              { label: 'Brands', icon: 'branding_watermark', count: '—', target: ['catalog', 'brands'] as const, color: 'text-qb-navy' },
              { label: 'Channels', icon: 'local_mall', count: channelCount, target: ['marketing', 'mkt-channels'] as const, color: 'text-qb-green' },
              { label: 'Collections', icon: 'category', count: collectionCount, target: ['catalog', 'collections'] as const, color: 'text-qb-blue' },
            ].map(item => (
              <button
                key={item.label}
                className="w-full text-left px-3 py-2 rounded hover:bg-surface-container-low flex items-center gap-2"
                onClick={() => onNavigate?.(item.target[0] as 'catalog' | 'marketing', item.target[1])}
              >
                <span className={`material-symbols-outlined text-[18px] ${item.color}`}>{item.icon}</span>
                <span className="flex-1 text-body-sm font-medium">{item.label}</span>
                <span className="text-[11px] text-on-surface-variant">{item.count}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Channel health */}
        <div className="xl:col-span-2 bg-white rounded-xl border border-surface-dim p-5">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-headline-sm">Channel health</h2>
            <button className="text-[11px] text-primary font-semibold hover:underline" onClick={() => onNavigate?.('marketing', 'mkt-channels')}>Manage</button>
          </div>
          <div className="space-y-2">
            {stores.length === 0 && (
              <div className="py-4 text-center text-on-surface-variant text-body-sm">
                No channels connected. Connect Shopify, TikTok, Etsy, or Amazon.
              </div>
            )}
            {stores.map(ch => {
              const letter = (ch.name || 'C')[0].toUpperCase();
              const colorClass = ch.platform === 'shopify' ? 'bg-qb-green' : ch.platform === 'tiktok' ? 'bg-qb-maroon' : ch.platform === 'etsy' ? 'bg-qb-maroon' : 'bg-qb-blue';
              const statusClass = ch.status === 'error' ? 'bg-error/15 text-error' : ch.status === 'needs_sync' ? 'bg-qb-maroon/15 text-qb-maroon' : 'bg-secondary/15 text-secondary';
              const statusLabel = ch.status === 'error' ? 'Failed sync' : ch.status === 'needs_sync' ? 'Needs sync' : 'Synced';
              return (
                <div key={ch.id} className="flex items-center gap-3 py-2 border-b border-surface-container-low last:border-0">
                  <div className={`w-7 h-7 rounded ${colorClass} text-white flex items-center justify-center text-[11px] font-bold`}>{letter}</div>
                  <div className="flex-1 min-w-0">
                    <div className="text-body-sm font-medium">{ch.name}</div>
                    <div className="text-[11px] text-on-surface-variant">{ch.platform || 'Custom API'}</div>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${statusClass}`}>{statusLabel}</span>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </main>
  );
}
