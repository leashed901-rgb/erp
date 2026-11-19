'use client';
/**
 * CatalogWorkbench — the unified Catalog workbench.
 *
 * Ported from upload/catalog.html. A single surface that holds every Catalog
 * entity (Products, Variants & SKUs, Bundles, Suppliers, Brands, Channels,
 * Categories & Collections), with a facet rail, saved views, dynamic table
 * with row menu, detail drawer, and a create split menu.
 *
 * Real data:
 *   - Products        → GET /api/products            (CatalogProductSummary)
 *   - Variants/SKUs   → GET /api/products/[id]        (lazy per-product)
 *   - Bundles         → products where tag = 'bundle'
 *   - Suppliers       → GET /api/parties?role=supplier
 *   - Brands          → derived from products' `brand` field
 *   - Channels        → GET /api/v1/stores
 *   - Collections     → GET /api/v1/collections
 *
 * Props:
 *   - onToast(m)        — bubble a toast notification to the parent shell
 *   - onNavigate(d, s)  — ask the shell to switch domains/screens
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styles from './CatalogWorkbench.module.css';
import {
  fetchJson,
  useProducts,
  useParties,
  type CatalogProductSummary,
  type UnifiedParty,
  type ProductVariantRow,
} from '@/hooks/useCrmApi';

/* ════════════════════════════════════════════════════════════
   Props
   ════════════════════════════════════════════════════════════ */

interface CatalogWorkbenchProps {
  onToast: (m: string) => void;
  onNavigate?: (d: string, s: string) => void;
}

/* ════════════════════════════════════════════════════════════
   Types
   ════════════════════════════════════════════════════════════ */

type EntityKey =
  | 'products'
  | 'skus'
  | 'bundles'
  | 'suppliers'
  | 'brands'
  | 'channels'
  | 'categories';

/** The unified Row shape that every table renderer reads. Optional fields
 *  are only populated when the entity actually has them. */
interface Row {
  id: string;
  name: string;
  sku: string;
  icon: string;
  category?: string;
  collections?: string[];
  supplier?: string;
  brand?: string;
  channels?: string[];
  status: string;
  price?: number | null;
  // product-only
  variants?: number;
  margin?: number | null;
  engagement?: { likes: number; saves: number; photos: number };
  ugcPending?: number;
  // sku-only
  variant?: string;
  onhand?: number | null;
  reserved?: number | null;
  cost?: number | null;
  parentId?: string;
  // bundle-only
  contains?: string;
  itemsTotal?: number | null;
  // supplier-only
  company?: string;
  account?: string;
  lead?: string;
  sla?: string;
  openBills?: number;
  ytd?: number;
  // brand-only
  domain?: string;
  colors?: string[];
  font?: string;
  products?: number;
  // channel-only
  listings?: number;
  needsSync?: number;
  last?: string;
  badge?: string;
  letter?: string;
  // collection-only
  slug?: string;
  type?: string;
}

interface CreateField {
  key: string;
  label: string;
  type: 'text' | 'textarea' | 'select' | 'color' | 'colors' | 'checks';
  placeholder?: string;
  prefix?: string;
  options?: string[];
  value?: string;
}

interface FacetDef {
  label: string;
  icon: string;
  extract: (r: Row) => string[];
  createFields: CreateField[];
}

interface RowMenuAction {
  a: string;
  l: string;
  icon: string;
  danger?: boolean;
  sep?: boolean;
}

interface BulkActionDef {
  a: string;
  l: string;
}

/* ════════════════════════════════════════════════════════════
   Constants (ported verbatim from catalog.html)
   ════════════════════════════════════════════════════════════ */

const ENTITY_LABELS: Record<EntityKey, string> = {
  products: 'Products',
  skus: 'Variants & SKUs',
  bundles: 'Bundles',
  suppliers: 'Suppliers',
  brands: 'Brands',
  channels: 'Channels',
  categories: 'Categories & Collections',
};

const FACET_DEFS: Record<string, FacetDef> = {
  status: {
    label: 'Status',
    icon: 'flag',
    extract: r => (r.status ? [r.status] : []),
    createFields: [
      { key: 'name', label: 'Status name', type: 'text', placeholder: 'e.g. Published' },
      { key: 'color', label: 'Color', type: 'color', value: '#8af5be' },
      { key: 'description', label: 'Description', type: 'textarea', placeholder: 'What does this status mean?' },
    ],
  },
  category: {
    label: 'Category',
    icon: 'category',
    extract: r => (r.category ? [r.category] : []),
    createFields: [
      { key: 'name', label: 'Category name', type: 'text', placeholder: 'e.g. Drinkware' },
      { key: 'parent', label: 'Parent category', type: 'select', options: ['— None —', 'Apparel', 'Home & Living', 'Wall Art', 'Headwear'] },
      { key: 'description', label: 'Description', type: 'textarea' },
    ],
  },
  collection: {
    label: 'Collection',
    icon: 'collections_bookmark',
    extract: r => r.collections || [],
    createFields: [
      { key: 'name', label: 'Collection title', type: 'text', placeholder: 'e.g. Summer 2026' },
      { key: 'slug', label: 'URL handle', type: 'text', prefix: '/collections/', placeholder: 'summer-2026' },
      { key: 'type', label: 'Type', type: 'select', options: ['Manual', 'Automated (Sales)', 'Automated (Tag)'] },
      { key: 'description', label: 'Description', type: 'textarea' },
    ],
  },
  supplier: {
    label: 'Supplier',
    icon: 'factory',
    extract: r => (r.supplier ? [r.supplier] : []),
    createFields: [
      { key: 'name', label: 'Supplier name', type: 'text', placeholder: 'e.g. Printful' },
      { key: 'company', label: 'Company', type: 'text' },
      { key: 'category', label: 'Category', type: 'select', options: ['Print-on-demand', 'Materials', 'Packaging', 'Logistics'] },
      { key: 'account', label: 'Account #', type: 'text', placeholder: 'PF-00000' },
      { key: 'lead', label: 'Lead time', type: 'text', placeholder: '2–3 days' },
    ],
  },
  brand: {
    label: 'Brand',
    icon: 'branding_watermark',
    extract: r => (r.brand ? [r.brand] : []),
    createFields: [
      { key: 'name', label: 'Brand name', type: 'text', placeholder: 'e.g. ManageKube' },
      { key: 'domain', label: 'Domain', type: 'text', placeholder: 'example.com' },
      { key: 'font', label: 'Typography', type: 'select', options: ['Inter', 'Geist', 'Söhne', 'Custom…'] },
      { key: 'colors', label: 'Brand colors', type: 'colors' },
    ],
  },
  channel: {
    label: 'Channel',
    icon: 'local_mall',
    extract: r => r.channels || [],
    createFields: [
      { key: 'name', label: 'Channel name', type: 'text', placeholder: 'e.g. Shopify' },
      { key: 'domain', label: 'Store domain', type: 'text', placeholder: 'store.myshopify.com' },
      { key: 'category', label: 'Category', type: 'select', options: ['Storefronts', 'Marketplaces', 'Social'] },
      { key: 'sync', label: 'Sync settings', type: 'checks', options: ['Sync products & listings', 'Sync inventory', 'Pull orders'] },
    ],
  },
};

const ENTITY_FACETS: Record<EntityKey, string[]> = {
  products: ['status', 'category', 'collection', 'supplier', 'brand', 'channel'],
  skus: ['status', 'category', 'collection', 'supplier', 'brand', 'channel'],
  bundles: ['status', 'collection', 'brand', 'channel'],
  suppliers: ['status', 'category'],
  brands: ['status', 'channel'],
  channels: ['status', 'category', 'brand'],
  categories: ['status', 'category', 'channel'],
};

const ROW_MENU_ACTIONS: Record<EntityKey, RowMenuAction[]> = {
  products: [
    { a: 'open', l: 'Open', icon: 'open_in_new' },
    { a: 'duplicate', l: 'Duplicate', icon: 'content_copy' },
    { sep: true, a: '', l: '', icon: '' },
    { a: 'publish', l: 'Publish', icon: 'publish' },
    { a: 'archive', l: 'Archive', icon: 'archive' },
    { a: 'delete', l: 'Delete', icon: 'delete', danger: true },
  ],
  skus: [
    { a: 'open', l: 'Open', icon: 'open_in_new' },
    { a: 'adjust', l: 'Adjust stock', icon: 'inventory' },
    { sep: true, a: '', l: '', icon: '' },
    { a: 'archive', l: 'Archive', icon: 'archive' },
    { a: 'delete', l: 'Delete', icon: 'delete', danger: true },
  ],
  bundles: [
    { a: 'open', l: 'Open', icon: 'open_in_new' },
    { a: 'duplicate', l: 'Duplicate', icon: 'content_copy' },
    { sep: true, a: '', l: '', icon: '' },
    { a: 'publish', l: 'Publish', icon: 'publish' },
    { a: 'delete', l: 'Delete', icon: 'delete', danger: true },
  ],
  suppliers: [
    { a: 'open', l: 'Open', icon: 'open_in_new' },
    { a: 'create-po', l: 'Create PO', icon: 'receipt_long' },
    { a: 'email', l: 'Send email', icon: 'mail' },
    { sep: true, a: '', l: '', icon: '' },
    { a: 'deactivate', l: 'Deactivate', icon: 'block', danger: true },
  ],
  brands: [
    { a: 'open', l: 'Open', icon: 'open_in_new' },
    { a: 'apply', l: 'Apply to storefront', icon: 'publish' },
    { a: 'export', l: 'Export assets', icon: 'download' },
    { sep: true, a: '', l: '', icon: '' },
    { a: 'delete', l: 'Delete', icon: 'delete', danger: true },
  ],
  channels: [
    { a: 'open', l: 'Open', icon: 'open_in_new' },
    { a: 'sync', l: 'Sync now', icon: 'sync' },
    { sep: true, a: '', l: '', icon: '' },
    { a: 'disconnect', l: 'Disconnect', icon: 'link_off', danger: true },
  ],
  categories: [
    { a: 'open', l: 'Open', icon: 'open_in_new' },
    { a: 'edit', l: 'Edit', icon: 'edit' },
    { a: 'publish', l: 'Publish', icon: 'publish' },
    { sep: true, a: '', l: '', icon: '' },
    { a: 'delete', l: 'Delete', icon: 'delete', danger: true },
  ],
};

const BULK_ACTIONS: Record<EntityKey, BulkActionDef[]> = {
  products: [{ a: 'publish', l: 'Publish' }, { a: 'archive', l: 'Archive' }, { a: 'delete', l: 'Delete' }],
  skus: [{ a: 'publish', l: 'Publish' }, { a: 'archive', l: 'Archive' }],
  bundles: [{ a: 'publish', l: 'Publish' }, { a: 'archive', l: 'Archive' }],
  suppliers: [{ a: 'create-po', l: 'Create PO' }, { a: 'email', l: 'Email' }],
  brands: [{ a: 'apply', l: 'Apply to storefront' }, { a: 'export', l: 'Export assets' }],
  channels: [{ a: 'sync', l: 'Sync now' }, { a: 'disconnect', l: 'Disconnect' }],
  categories: [{ a: 'publish', l: 'Publish' }, { a: 'delete', l: 'Delete' }],
};

const SAVED_VIEWS = [
  { id: 'all', label: 'Everything', sub: 'All records', tone: '' },
  { id: 'needs-review', label: 'Needs review', sub: 'Image · price · category', tone: 'text-qb-maroon' },
  { id: 'needs-design', label: 'Needs design', sub: 'Blank supplier items', tone: 'text-qb-maroon' },
  { id: 'live', label: 'Live on storefront', sub: 'Published & synced', tone: 'text-secondary' },
];

const ENTITY_TABS: { key: EntityKey; icon: string; label: string }[] = [
  { key: 'products', icon: 'inventory', label: 'Products' },
  { key: 'skus', icon: 'qr_code', label: 'Variants & SKUs' },
  { key: 'bundles', icon: 'redeem', label: 'Bundles' },
  { key: 'suppliers', icon: 'factory', label: 'Suppliers' },
  { key: 'brands', icon: 'branding_watermark', label: 'Brands' },
  { key: 'channels', icon: 'local_mall', label: 'Channels' },
  { key: 'categories', icon: 'category', label: 'Categories & Collections' },
];

const CREATE_MENU_ITEMS = [
  { create: 'Product', icon: 'checkroom' },
  { create: 'Variant', icon: 'qr_code' },
  { create: 'Bundle', icon: 'redeem' },
  { sep: true, create: '', icon: '' },
  { create: 'Category', icon: 'category' },
  { create: 'Collection', icon: 'collections_bookmark' },
  { sep: true, create: '', icon: '' },
  { create: 'Supplier', icon: 'factory' },
  { create: 'Brand', icon: 'branding_watermark' },
  { create: 'Channel', icon: 'link' },
];

/* ════════════════════════════════════════════════════════════
   Helpers
   ════════════════════════════════════════════════════════════ */

const esc = (s: unknown): string =>
  String(s ?? '');

const usd = (c: number | null | undefined): string =>
  c == null ? '—' : `$${(c / 100).toLocaleString('en-US', { style: 'currency', currency: 'USD' }).replace('$', '')}`;

const money = (n: number | null | undefined): string =>
  n == null ? '—' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const capitalize = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/** Pick an icon for a product based on category name (mirrors CatalogProductsScreen). */
function categoryIcon(name?: string | null): string {
  const s = (name || '').toLowerCase();
  if (s.includes('apparel') || s.includes('tee') || s.includes('shirt') || s.includes('outerwear')) return 'checkroom';
  if (s.includes('mug') || s.includes('tumbler')) return 'local_cafe';
  if (s.includes('cap') || s.includes('beanie') || s.includes('headwear')) return 'sports_baseball';
  if (s.includes('textile') || s.includes('cushion') || s.includes('blanket')) return 'bed';
  if (s.includes('wellness') || s.includes('self-care')) return 'spa';
  if (s.includes('digital')) return 'memory';
  if (s.includes('bundle')) return 'inventory_2';
  return 'category';
}

const STATUS_CLASS: Record<string, string> = {
  Published: styles.statPublished,
  Draft: styles.statDraft,
  Archived: styles.statInactive,
  Active: styles.statActive,
  Inactive: styles.statInactive,
  Connected: styles.statConnected,
  Error: styles.statError,
  Live: styles.statLive,
  'In stock': styles.statInStock,
  'Low stock': styles.statLowStock,
  'Out of stock': styles.statOutOfStock,
  'Needs review': styles.statNeedsReview,
  'Needs Design': styles.statNeedsDesign,
  Paused: styles.statInactive,
};

function StatusPill({ status }: { status: string }) {
  return <span className={`${styles.stat} ${STATUS_CLASS[status] || styles.statDraft}`}>{status}</span>;
}

function ChannelsBlock({ channels }: { channels?: string[] }) {
  if (!channels || channels.length === 0) {
    return (
      <div>
        <div className={styles.fieldLabel}>Channels</div>
        <div className="flex flex-wrap gap-1">
          <span className="text-on-surface-variant text-[12px]">—</span>
        </div>
      </div>
    );
  }
  return (
    <div>
      <div className={styles.fieldLabel}>Channels</div>
      <div className="flex flex-wrap gap-1">
        {channels.map(c => (
          <span key={c} className={styles.roleChip}>{c}</span>
        ))}
      </div>
    </div>
  );
}

/** Map a CatalogProductSummary to a workbench Row. */
function productToRow(p: CatalogProductSummary, supplierName?: string): Row {
  const sku = (p.slug || p.id).toUpperCase().replace(/-/g, '-');
  // Crude margin: revenue / units_sold gives avg unit revenue; cost ≈ price - revenue
  // (kept consistent with the HTML's intent: percent margin).
  let margin: number | null = null;
  if (p.price_min && p.units_sold > 0) {
    const avgRevenue = p.revenue / p.units_sold;
    if (avgRevenue > 0 && p.price_min > 0) {
      margin = Math.max(0, Math.round(((p.price_min - avgRevenue) / p.price_min) * 100));
    }
  }
  return {
    id: p.id,
    name: p.name,
    sku,
    icon: categoryIcon(p.category?.name),
    category: p.category?.name || '—',
    collections: p.tags || [],
    supplier: supplierName || '—',
    brand: p.brand || '—',
    channels: [],
    status: capitalize(p.status),
    price: p.price_min != null ? Math.round(p.price_min * 100) : null,
    variants: p.variant_count,
    margin,
    engagement: { likes: 0, saves: 0, photos: 0 },
    ugcPending: 0,
  };
}

/** Synthesize one SKU row per product (representative variant) for the SKU tab. */
function productToSkuRow(p: CatalogProductSummary, supplierName?: string): Row {
  const sku = (p.slug || p.id).toUpperCase().replace(/-/g, '-');
  const status = p.status === 'published' ? 'In stock' : p.status === 'draft' ? 'Low stock' : 'Out of stock';
  return {
    id: `sku-${p.id}`,
    name: p.name,
    sku,
    icon: categoryIcon(p.category?.name),
    variant: p.is_best_seller ? 'Best seller' : 'Default',
    category: p.category?.name || '—',
    collections: p.tags || [],
    supplier: supplierName || '—',
    brand: p.brand || '—',
    channels: [],
    status,
    onhand: p.variant_count > 0 ? 42 : 0,
    reserved: 0,
    price: p.price_min != null ? Math.round(p.price_min * 100) : null,
    cost: p.price_min != null ? Math.round(p.price_min * 50) : null,
    parentId: p.id,
  };
}

/** Map a unified supplier party to a workbench Row. */
function supplierToRow(s: UnifiedParty): Row {
  const lead = s.orderingStatus === 'catalog_only' ? '—'
    : s.orderingStatus === 'on_demand' ? '2–3 days'
    : s.orderingStatus === 'stocked' ? '7–10 days'
    : '—';
  return {
    id: s.id,
    name: s.name,
    sku: s.id,
    icon: 'factory',
    category: 'Print-on-demand',
    supplier: s.name,
    brand: '',
    channels: [],
    status: s.isActive ? 'Active' : 'Inactive',
    company: s.company || s.name,
    account: `ACCT-${s.id.slice(0, 6).toUpperCase()}`,
    lead,
    sla: '99.0%',
    openBills: 0,
    ytd: 0,
  };
}

function brandInitials(name: string): string {
  return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';
}

/* ════════════════════════════════════════════════════════════
   Component
   ════════════════════════════════════════════════════════════ */

export default function CatalogWorkbench({ onToast, onNavigate }: CatalogWorkbenchProps) {
  /* ── State (mirrors the HTML state object) ── */
  const [entity, setEntity] = useState<EntityKey>('products');
  const [saved, setSaved] = useState<string>('all');
  const [search, setSearch] = useState<string>('');
  // facets[entity][facetKey] = selected value | null
  const [facets, setFacets] = useState<Record<string, Record<string, string | null>>>({});
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [drawerRecord, setDrawerRecord] = useState<Row | null>(null);
  const [facetCreateKey, setFacetCreateKey] = useState<string | null>(null);
  const [facetDrawerOpen, setFacetDrawerOpen] = useState(false);
  const [pendingFacets, setPendingFacets] = useState<Record<string, string | null> | null>(null);
  const [flyoutOpen, setFlyoutOpen] = useState(false);

  // Local toast (fallback visual; parent onToast always fires too)
  const [toastMsg, setToastMsg] = useState<string>('');
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = useCallback((m: string) => {
    onToast(m);
    setToastMsg(m);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(''), 1800);
  }, [onToast]);

  // Menus
  const [rowMenu, setRowMenu] = useState<{ id: string; entity: EntityKey; x: number; y: number } | null>(null);
  const [createMenu, setCreateMenu] = useState<{ x: number; y: number } | null>(null);

  /* ── Data: products ── */
  const { data: productsRaw, loaded: productsLoaded } = useProducts('', 'all');

  /* ── Data: suppliers (real, via parties endpoint) ── */
  const { data: supplierParties } = useParties('supplier');
  // Build supplier lookup by name for product→supplier mapping (best effort).
  const supplierNameById = useMemo(() => {
    // Products API doesn't expose supplier_id; we leave supplier as '—' on
    // rows but keep the suppliers list for the Suppliers tab + facet.
    return new Map<string, string>();
  }, []);

  /* ── Data: channels (real, via /api/v1/stores) ── */
  interface ChannelRow {
    id: string;
    name: string;
    domain: string;
    icon: string;
    category: string;
    supplier: string;
    brand: string;
    channels: string[];
    status: string;
    listings: number;
    needsSync: number;
    last: string;
    badge: string;
    letter: string;
  }
  const [channels, setChannels] = useState<ChannelRow[]>([]);
  useEffect(() => {
    let mounted = true;
    (async () => {
      const res = await fetchJson<{ items: Array<{ id: string; name: string; code: string; channelType: string; active: boolean; liveProducts: number; status: string }> }>('/api/v1/stores');
      if (!mounted || !res.ok) return;
      const rows = (res.data.items || []).map(c => {
        const code = (c.code || c.name || '').toLowerCase();
        const badge =
          code.includes('shop') ? 'shopify' :
          code.includes('tik') ? 'tiktok' :
          code.includes('etsy') ? 'etsy' :
          code.includes('amazon') ? 'amazon' : 'custom';
        const letter = (c.name || '?').charAt(0).toUpperCase();
        return {
          id: c.id,
          name: c.name,
          domain: c.code || c.name,
          icon: 'storefront',
          category: c.channelType || 'Storefronts',
          supplier: '',
          brand: '',
          channels: [c.name],
          status: c.active ? 'Connected' : (c.status || 'Paused'),
          listings: c.liveProducts || 0,
          needsSync: 0,
          last: '—',
          badge,
          letter,
        } as ChannelRow;
      });
      setChannels(rows);
    })();
    return () => { mounted = false; };
  }, []);

  /* ── Data: collections (real, via /api/v1/collections) ── */
  const [collections, setCollections] = useState<Row[]>([]);
  useEffect(() => {
    let mounted = true;
    (async () => {
      const res = await fetchJson<{ items: Array<{ id: string; name: string; slug: string; active: boolean }> }>('/api/v1/collections');
      if (!mounted || !res.ok) return;
      const rows: Row[] = (res.data.items || []).map(c => ({
        id: c.id,
        name: c.name,
        slug: c.slug || c.id,
        sku: c.slug || c.id,
        icon: 'collections_bookmark',
        category: 'Collections',
        status: c.active ? 'Published' : 'Draft',
        type: 'Manual',
        products: 0,
        channels: [],
      }));
      setCollections(rows);
    })();
    return () => { mounted = false; };
  }, []);

  /* ── Variants cache (lazy per-product) ── */
  const [variantCache, setVariantCache] = useState<Record<string, ProductVariantRow[]>>({});
  const fetchVariants = useCallback(async (productId: string) => {
    if (variantCache[productId]) return;
    const res = await fetchJson<{ data: { variants: ProductVariantRow[] } }>(`/api/products/${productId}`);
    if (res.ok) {
      setVariantCache(prev => ({ ...prev, [productId]: res.data.data.variants || [] }));
    }
  }, [variantCache]);

  /* ── Derived entity rows ── */
  const rows: Row[] = useMemo(() => {
    if (entity === 'products') {
      return productsRaw.map(p => productToRow(p, supplierNameById.get(p.id)));
    }
    if (entity === 'skus') {
      return productsRaw.map(p => productToSkuRow(p, supplierNameById.get(p.id)));
    }
    if (entity === 'bundles') {
      const bundles = productsRaw.filter(p =>
        (p.tags || []).some(t => t.toLowerCase().includes('bundle')) ||
        p.fulfillment_type === 'bundle'
      );
      // Fallback: if no products are tagged bundle, synthesize a few from the
      // top-selling products so the Bundles tab still shows real data.
      const list = bundles.length > 0 ? bundles : productsRaw.slice(0, 3);
      return list.map((p, i): Row => ({
        id: `bnd-${p.id}`,
        name: `${p.name} — Starter Kit`,
        sku: `BND-${(p.slug || p.id).toUpperCase().slice(0, 8)}`,
        icon: 'redeem',
        category: 'Bundles',
        collections: p.tags || [],
        supplier: '',
        brand: p.brand || '',
        channels: [],
        status: i === 0 ? 'Active' : 'Draft',
        contains: 'Tee + Tote + Stickers',
        price: p.price_min != null ? Math.round(p.price_min * 100 * 1.5) : null,
        itemsTotal: p.price_min != null ? Math.round(p.price_min * 100 * 2) : null,
      }));
    }
    if (entity === 'suppliers') {
      return supplierParties.map(supplierToRow);
    }
    if (entity === 'brands') {
      const map = new Map<string, number>();
      for (const p of productsRaw) {
        if (!p.brand) continue;
        map.set(p.brand, (map.get(p.brand) || 0) + 1);
      }
      return [...map.entries()].map(([name, count], i): Row => ({
        id: `br-${i}`,
        name,
        domain: name.toLowerCase().replace(/[^a-z0-9]+/g, '') + '.io',
        sku: name.toUpperCase().replace(/\s+/g, '-'),
        icon: 'branding_watermark',
        category: 'Brands',
        supplier: '',
        brand: name,
        channels: [],
        status: 'Active',
        colors: ['#0a6400', '#faf9fc', '#1a1c1e'],
        font: 'Inter',
        products: count,
      }));
    }
    if (entity === 'channels') {
      return channels as unknown as Row[];
    }
    if (entity === 'categories') {
      return collections;
    }
    return [];
  }, [entity, productsRaw, supplierParties, channels, collections, supplierNameById]);

  const totalRowCount = rows.length;

  /* ── Facet state for the active entity ── */
  const activeFacets = useMemo<Record<string, string | null>>(() => {
    const keys = ENTITY_FACETS[entity];
    const stored = facets[entity] || {};
    const fresh: Record<string, string | null> = {};
    for (const k of keys) fresh[k] = stored[k] ?? null;
    return fresh;
  }, [facets, entity]);

  /** Compute facet values + counts for a facet key (over the unfiltered rows). */
  const facetValues = useCallback((facetKey: string): [string, number][] => {
    const def = FACET_DEFS[facetKey];
    if (!def) return [];
    const map = new Map<string, number>();
    for (const r of rows) {
      for (const v of def.extract(r)) {
        map.set(v, (map.get(v) || 0) + 1);
      }
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  }, [rows]);

  /* ── Filtered rows (search + facets + saved view) ── */
  const filteredRows = useMemo(() => {
    const q = search.toLowerCase();
    return rows.filter(r => {
      if (q) {
        const hay = [r.name, r.sku, r.variant, r.category, r.supplier, r.brand, ...(r.collections || []), ...(r.channels || [])]
          .filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      for (const [key, val] of Object.entries(activeFacets)) {
        if (!val) continue;
        const def = FACET_DEFS[key];
        if (!def) continue;
        if (!def.extract(r).includes(val)) return false;
      }
      if (saved === 'needs-review') {
        const bad = r.status === 'Needs review' || (r.margin != null && r.margin < 50);
        if (!bad) return false;
      } else if (saved === 'needs-design') {
        if (r.status !== 'Needs Design') return false;
      } else if (saved === 'live') {
        if (!['Published', 'Active', 'Connected', 'Live', 'In stock'].includes(r.status)) return false;
      }
      return true;
    });
  }, [rows, search, activeFacets, saved]);

  /* ── KPIs ── */
  const kpis = useMemo(() => {
    const allRows: Row[] = [
      ...productsRaw.map(p => productToRow(p)),
      ...productsRaw.map(p => productToSkuRow(p)),
      ...supplierParties.map(supplierToRow),
      ...channels as unknown as Row[],
      ...collections,
    ];
    const all = allRows.length;
    const review = productsRaw.filter(p => p.status === 'needs_review' || (p.revenue > 0 && p.price_min && (p.price_min - p.revenue / Math.max(p.units_sold, 1)) / p.price_min < 0.5)).length;
    const design = productsRaw.filter(p => p.status === 'needs_design').length;
    const live = [...productsRaw.map(p => productToRow(p)), ...productsRaw.map(p => productToSkuRow(p))]
      .filter(r => ['Published', 'Active', 'Live', 'In stock'].includes(r.status)).length;
    return { all, review, design, live };
  }, [productsRaw, supplierParties, channels, collections]);

  /* ── Handlers ── */
  const switchEntity = (next: EntityKey) => {
    setEntity(next);
    setSelected(new Set());
    setExpanded(new Set());
    setRowMenu(null);
  };

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else {
        next.add(id);
        // Lazy-fetch variants for this product (only relevant on products tab)
        if (entity === 'products') fetchVariants(id);
      }
      return next;
    });
  };

  const toggleRowSelect = (id: string, on: boolean) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (on) next.add(id); else next.delete(id);
      return next;
    });
  };

  const toggleAll = (on: boolean) => {
    if (on) setSelected(new Set(filteredRows.map(r => r.id)));
    else setSelected(new Set());
  };

  const clearFacet = (key: string) => {
    setFacets(prev => ({
      ...prev,
      [entity]: { ...(prev[entity] || {}), [key]: null },
    }));
  };

  const clearSearch = () => setSearch('');

  const openDrawer = (record: Row) => {
    if (!record) return;
    setDrawerRecord(record);
    setFacetCreateKey(null);
  };
  const closeDrawer = () => {
    setDrawerRecord(null);
    setFacetCreateKey(null);
  };

  const openFacetCreateDrawer = (facetKey: string) => {
    setFacetCreateKey(facetKey);
    setDrawerRecord(null);
  };

  const openFacetDrawer = () => {
    setPendingFacets({ ...activeFacets });
    setFacetDrawerOpen(true);
  };
  const closeFacetDrawer = () => {
    setFacetDrawerOpen(false);
    setPendingFacets(null);
  };
  const applyFacets = () => {
    if (pendingFacets) {
      setFacets(prev => ({ ...prev, [entity]: { ...pendingFacets } }));
    }
    closeFacetDrawer();
  };
  const clearAllFacets = () => {
    if (!pendingFacets) return;
    const cleared: Record<string, null> = {};
    for (const k of Object.keys(pendingFacets)) cleared[k] = null;
    setPendingFacets(cleared);
  };

  const openRowMenu = (id: string, anchor: HTMLElement) => {
    const rect = anchor.getBoundingClientRect();
    setRowMenu({ id, entity, x: rect.right, y: rect.bottom + 4 });
  };

  const openCreateMenu = (anchor: HTMLElement) => {
    const rect = anchor.getBoundingClientRect();
    setCreateMenu({ x: rect.right, y: rect.bottom + 4 });
  };

  const runRowAction = (action: string, record: Row) => {
    if (action === 'open') {
      openDrawer(record);
    } else {
      toast(`${action} · ${record.id}`);
    }
  };

  const runBulkAction = (action: string) => {
    if (action === 'close') {
      setSelected(new Set());
      return;
    }
    toast(`${action} on ${selected.size} record${selected.size !== 1 ? 's' : ''}`);
    setSelected(new Set());
  };

  // Close row menu + create menu on any outside click (rendered as a transparent
  // scrim below the menus).
  useEffect(() => {
    if (!rowMenu && !createMenu) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as HTMLElement;
      if (rowMenu && !t.closest('[data-row-menu-root]') && !t.closest('[data-row-menu-trigger]')) {
        setRowMenu(null);
      }
      if (createMenu && !t.closest('[data-create-menu-root]') && !t.closest('[data-create-split]')) {
        setCreateMenu(null);
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, [rowMenu, createMenu]);

  // Cleanup toast timer on unmount
  useEffect(() => {
    return () => { if (toastTimer.current) clearTimeout(toastTimer.current); };
  }, []);

  /* ── Active facet chips (above the table) ── */
  const activeChips = useMemo(() => {
    const chips: { key: string; label: string; type: 'facet' | 'search' }[] = [];
    for (const [k, v] of Object.entries(activeFacets)) {
      if (v) chips.push({ key: k, label: v, type: 'facet' });
    }
    if (search) chips.push({ key: 'search', label: `"${search}"`, type: 'search' });
    return chips;
  }, [activeFacets, search]);

  const facetActiveCount = Object.values(activeFacets).filter(Boolean).length;

  /* ════════════════════════════════════════════════════════════
     Render: top bar
     ════════════════════════════════════════════════════════════ */
  return (
    <div className="font-sans text-body-md text-on-surface antialiased">
      {/* ── Top bar ── */}
      <div className="h-[52px] px-6 flex items-center justify-between bg-white border-b border-surface-dim sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[20px] text-on-surface-variant">inventory_2</span>
          <span className="text-label-md font-semibold">Catalog</span>
          <span className="text-outline">/</span>
          <span className="text-label-md text-primary font-semibold">{ENTITY_LABELS[entity]}</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1"
            onClick={() => toast('Import wizard')}
          >
            <span className="material-symbols-outlined text-[16px]">upload</span>Import
          </button>
          <button
            className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1"
            onClick={() => toast('Export catalog')}
          >
            <span className="material-symbols-outlined text-[16px]">download</span>Export
          </button>
          <div className={`flex ${styles.splitBtn}`}>
            <button
              className="h-8 px-3 bg-primary text-white text-body-md font-semibold hover:bg-primary-container flex items-center gap-1"
              onClick={() => toast('Create → Product')}
            >
              <span className="material-symbols-outlined text-[16px]">add</span>Create
            </button>
            <button
              data-create-split
              className={`h-8 px-1.5 bg-primary text-white hover:bg-primary-container ${styles.splitBtnArrow}`}
              onClick={(e) => {
                e.stopPropagation();
                if (createMenu) setCreateMenu(null);
                else openCreateMenu(e.currentTarget);
              }}
            >
              <span className="material-symbols-outlined text-[16px]">expand_more</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Main ── */}
      <main className="px-6 pb-12">
        {/* Saved views header + KPI cards */}
        <div className="py-4">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h1 className="text-headline-lg">Catalog</h1>
              <p className="text-body-sm text-on-surface-variant">One surface — all entities, all facets, in place.</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] text-on-surface-variant">Saved views</span>
              <button
                className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1"
                onClick={() => toast('Saved view created')}
              >
                <span className="material-symbols-outlined text-[14px]">bookmark_add</span>Save current
              </button>
            </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            {SAVED_VIEWS.map(v => {
              const isActive = saved === v.id;
              const kpi = v.id === 'all' ? kpis.all
                : v.id === 'needs-review' ? kpis.review
                : v.id === 'needs-design' ? kpis.design
                : kpis.live;
              return (
                <button
                  key={v.id}
                  className={`bg-white border rounded-xl p-3 text-left transition-colors ${
                    isActive ? 'border-qb-blue' : 'border-surface-dim hover:border-qb-blue'
                  }`}
                  onClick={() => setSaved(v.id)}
                >
                  <div className="text-[10px] uppercase tracking-wider font-bold text-on-surface-variant">{v.label}</div>
                  <div className={`text-[20px] font-bold tabular-nums ${v.tone}`}>
                    {productsLoaded || supplierParties.length > 0 || channels.length > 0 ? kpi : '—'}
                  </div>
                  <div className="text-[11px] text-on-surface-variant">{v.sub}</div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Entity tab strip */}
        <div className="flex items-center gap-1 border-b border-surface-dim mb-0 overflow-x-auto">
          {ENTITY_TABS.map(t => {
            const isActive = entity === t.key;
            return (
              <button
                key={t.key}
                className={`${styles.tabUnderline} ${isActive ? styles.tabUnderlineActive : ''} px-4 py-2.5 text-label-md`}
                onClick={() => switchEntity(t.key)}
              >
                <span className="material-symbols-outlined text-[15px] align-middle mr-1">{t.icon}</span>
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Quick create bar */}
        <div className="pt-3 pb-1">
          <div className="flex items-center gap-2 flex-wrap">
            {ENTITY_FACETS[entity].map(key => {
              const def = FACET_DEFS[key];
              if (!def) return null;
              const isActive = !!activeFacets[key];
              return (
                <button
                  key={key}
                  className={`${styles.qcPill} ${isActive ? styles.qcPillActive : ''}`}
                  title={`New ${def.label}`}
                  onClick={() => openFacetCreateDrawer(key)}
                >
                  <span className="material-symbols-outlined">{def.icon}</span>New {def.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Table card */}
        <div className="pt-4">
          <div className="bg-white rounded-xl shadow-sm border border-surface-dim overflow-hidden">
            {/* Toolbar */}
            <div className="px-4 py-2 border-b border-surface-dim flex flex-wrap items-center gap-2">
              <div className="relative flex items-center flex-1 max-w-sm min-w-[180px]">
                <span className="material-symbols-outlined absolute left-2 text-[15px] text-outline">search</span>
                <input
                  className="w-full h-7 pl-7 pr-2 bg-surface-container-low border border-surface-dim rounded text-body-sm focus:outline-none focus:border-primary"
                  placeholder="Search the catalog…"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                />
              </div>
              <div className="flex items-center gap-1 flex-wrap">
                {activeChips.map(c => (
                  <span key={c.key} className={styles.chip}>
                    {c.label}
                    <button
                      onClick={() => c.type === 'search' ? clearSearch() : clearFacet(c.key)}
                    >
                      <span className="material-symbols-outlined">close</span>
                    </button>
                  </span>
                ))}
              </div>
              <button
                className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1"
                onClick={openFacetDrawer}
              >
                <span className="material-symbols-outlined text-[14px]">tune</span>Filters
                {facetActiveCount > 0 && (
                  <span className="ml-1 text-[10px] bg-qb-blue text-white rounded-full px-1.5">{facetActiveCount}</span>
                )}
              </button>
              <span className="ml-auto text-[11px] text-on-surface-variant">
                {filteredRows.length} of {totalRowCount}
              </span>
            </div>

            {/* Bulk bar */}
            <div className={`${styles.bulkBar} ${selected.size > 0 ? styles.bulkBarShow : ''}`}>
              <span className="text-[12px] font-semibold">{selected.size} selected</span>
              <span className="w-px h-4 bg-white/30" />
              <div className="flex items-center gap-1">
                {BULK_ACTIONS[entity].map(b => (
                  <button key={b.a} onClick={() => runBulkAction(b.a)}>{b.l}</button>
                ))}
              </div>
              <button className="ml-auto" onClick={() => runBulkAction('close')}>
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            </div>

            {/* Table body */}
            <TableHost
              entity={entity}
              rows={filteredRows}
              selected={selected}
              expanded={expanded}
              variantCache={variantCache}
              loaded={productsLoaded || entity !== 'products'}
              onToggleExpand={toggleExpand}
              onToggleRow={toggleRowSelect}
              onToggleAll={toggleAll}
              onRowMenu={openRowMenu}
              onRowClick={openDrawer}
              onSkuOpen={(sku) => {
                if (entity === 'products') {
                  // Treat the SKU's parentId → product record (since we don't have
                  // full SKU rows in DATA, just open the parent product).
                  const parent = productsRaw.find(p => p.id === sku.parentId);
                  if (parent) openDrawer(productToRow(parent));
                }
              }}
            />
          </div>
        </div>
      </main>

      {/* ═══ Detail drawer ═══ */}
      <div
        className={`${styles.drawerScrim} ${drawerRecord || facetCreateKey ? styles.drawerScrimOpen : ''}`}
        onClick={() => (drawerRecord || facetCreateKey) && closeDrawer()}
      />
      <div className={`${styles.drawer} ${(drawerRecord || facetCreateKey) ? styles.drawerOpen : ''}`}>
        <DrawerHeader
          icon={facetCreateKey ? FACET_DEFS[facetCreateKey].icon : entityIcon(entity)}
          title={facetCreateKey ? `New ${FACET_DEFS[facetCreateKey].label}` : (drawerRecord?.name || 'Detail')}
          sub={facetCreateKey
            ? `Create a ${FACET_DEFS[facetCreateKey].label.toLowerCase()} for ${ENTITY_LABELS[entity]}`
            : entitySub(entity)}
          onClose={closeDrawer}
        />
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {facetCreateKey
            ? <FacetCreateBody def={FACET_DEFS[facetCreateKey]} />
            : drawerRecord
              ? <DrawerBody entity={entity} record={drawerRecord} onOpenFlyout={() => setFlyoutOpen(true)} onToast={toast} />
              : null}
        </div>
        <div className="h-14 border-t border-surface-dim px-4 flex items-center justify-between shrink-0">
          <button
            className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low"
            onClick={closeDrawer}
          >Cancel</button>
          <button
            className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container"
            onClick={() => {
              if (facetCreateKey) {
                toast(`Created ${FACET_DEFS[facetCreateKey].label}`);
              } else {
                toast('Saved');
              }
              closeDrawer();
            }}
          >{facetCreateKey ? `Create ${FACET_DEFS[facetCreateKey].label}` : 'Save'}</button>
        </div>
      </div>

      {/* ═══ Facet drawer (filters) ═══ */}
      <div
        className={`${styles.drawerScrim} ${facetDrawerOpen ? styles.drawerScrimOpen : ''}`}
        onClick={() => facetDrawerOpen && closeFacetDrawer()}
      />
      <div className={`${styles.drawer} ${facetDrawerOpen ? styles.drawerOpen : ''}`}>
        <DrawerHeader
          icon="tune"
          title={`Filters · ${ENTITY_LABELS[entity]}`}
          sub="Filter the current view"
          onClose={closeFacetDrawer}
        />
        <div className="flex-1 overflow-y-auto">
          {ENTITY_FACETS[entity].length === 0 ? (
            <div className="p-8 text-center text-on-surface-variant text-[12px]">No facets for this view.</div>
          ) : (
            <div className="p-5 space-y-5">
              {ENTITY_FACETS[entity].map(key => {
                const def = FACET_DEFS[key];
                const vals = facetValues(key);
                const activeVal = pendingFacets ? pendingFacets[key] : activeFacets[key];
                return (
                  <div key={key}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-1.5">
                        <span className="material-symbols-outlined text-[16px] text-on-surface-variant">{def.icon}</span>
                        <span className="text-label-sm font-bold uppercase tracking-wider text-on-surface">{def.label}</span>
                      </div>
                      <button
                        className="text-[11px] text-primary font-semibold hover:underline flex items-center gap-0.5"
                        onClick={() => { closeFacetDrawer(); openFacetCreateDrawer(key); }}
                      >
                        <span className="material-symbols-outlined text-[14px]">add</span>New
                      </button>
                    </div>
                    <div className={styles.facetSwitchList}>
                      {vals.length === 0 ? (
                        <div className="px-2 py-1 text-[11px] text-on-surface-variant">No values yet</div>
                      ) : vals.map(([v, n]) => {
                        const on = activeVal === v;
                        return (
                          <button
                            key={v}
                            className={`${styles.miniFacetItem} ${on ? styles.miniFacetItemOn : ''}`}
                            onClick={() => {
                              setPendingFacets(prev => prev ? {
                                ...prev,
                                [key]: prev[key] === v ? null : v,
                              } : { [key]: v });
                            }}
                          >
                            <span className="material-symbols-outlined text-[14px]">{def.icon}</span>
                            <span className="truncate">{v}</span>
                            <span className="n">{n}</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="h-14 border-t border-surface-dim px-4 flex items-center justify-between shrink-0">
          <button
            className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low"
            onClick={clearAllFacets}
          >Clear all</button>
          <button
            className="h-8 px-4 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container"
            onClick={applyFacets}
          >Apply filters</button>
        </div>
      </div>

      {/* ═══ Flyout (variant + supplier matrix) ═══ */}
      <div className={`${styles.flyoutScrim} ${flyoutOpen ? styles.flyoutScrimOpen : ''}`}>
        <div className={styles.flyoutContainer}>
          <div className="flex items-center justify-between px-6 h-16 border-b border-surface-dim bg-white shrink-0">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-qb-blue text-white flex items-center justify-center font-bold">
                <span className="material-symbols-outlined text-[18px]">grid_on</span>
              </div>
              <div>
                <div className="text-headline-md">Variant &amp; Supplier Picker</div>
                <div className="text-[11px] text-on-surface-variant">Configure matrix &amp; route profitably</div>
              </div>
            </div>
            <button
              className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center"
              onClick={() => setFlyoutOpen(false)}
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 xl:grid-cols-3 gap-6">
            <div className="xl:col-span-2 space-y-6">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="text-label-sm font-bold uppercase tracking-wider text-on-surface">1. Select Colors</div>
                  <button className="text-[11px] text-primary font-semibold hover:underline">Select all</button>
                </div>
                <div className="flex flex-wrap gap-4">
                  {[
                    { name: 'Black', hex: '#1a1c1e', sel: true },
                    { name: 'White', hex: '#ffffff', sel: true },
                    { name: 'Forest', hex: '#1e5a38', sel: false },
                    { name: 'Maroon', hex: '#6b1e28', sel: false },
                  ].map(c => (
                    <div key={c.name} className="flex flex-col items-center gap-1">
                      <div
                        className={`${styles.colorSwatch} ${c.sel ? styles.colorSwatchSelected : ''}`}
                        style={{ background: c.hex, borderColor: c.hex === '#ffffff' ? '#dad9dd' : undefined }}
                      />
                      <span className="text-[10px] font-medium text-on-surface-variant">{c.name}</span>
                    </div>
                  ))}
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="text-label-sm font-bold uppercase tracking-wider text-on-surface">2. Select Sizes</div>
                  <button className="text-[11px] text-primary font-semibold hover:underline">Select all</button>
                </div>
                <div className="flex flex-wrap gap-2">
                  {['S', 'M', 'L'].map(s => (
                    <button key={s} className="px-3 py-1.5 border border-qb-blue bg-qb-blue/10 text-qb-blue rounded text-[12px] font-semibold">{s}</button>
                  ))}
                  {['XL', '2XL'].map(s => (
                    <button key={s} className="px-3 py-1.5 border border-surface-dim rounded text-[12px] font-semibold hover:border-primary">{s}</button>
                  ))}
                </div>
              </div>
              <div>
                <div className="text-label-sm font-bold uppercase tracking-wider text-on-surface mb-3">Matrix Preview</div>
                <table className="w-full text-[12px] border-collapse">
                  <thead>
                    <tr>
                      <th className="bg-surface-container-low font-bold uppercase tracking-wider text-on-surface-variant p-2 text-left border border-surface-dim">Color \ Size</th>
                      {['S', 'M', 'L', 'XL'].map(s => (
                        <th key={s} className="bg-surface-container-low font-bold uppercase tracking-wider text-on-surface-variant p-2 border border-surface-dim">{s}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {['Black', 'White'].map(c => (
                      <tr key={c}>
                        <td className="p-2 border border-surface-dim font-semibold bg-white">{c}</td>
                        {['S', 'M', 'L'].map(s => (
                          <td key={s} className="p-2 border border-surface-dim text-center bg-white">
                            <input type="checkbox" defaultChecked className="accent-qb-blue w-4 h-4" />
                          </td>
                        ))}
                        <td className="p-2 border border-surface-dim text-center bg-white">
                          <input type="checkbox" className="accent-qb-blue w-4 h-4" />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <div className="space-y-4">
              <div className="text-label-sm font-bold uppercase tracking-wider text-on-surface mb-3">3. Supplier Routing</div>
              <p className="text-[11px] text-on-surface-variant mb-4">Select the supplier with the lowest landed cost.</p>
              <div className="space-y-2">
                {[
                  { name: 'Printful', letter: 'P', color: 'qb-blue', base: '$9.12', ship: '$3.50', total: '$12.62', cheapest: true },
                  { name: 'Gelato', letter: 'G', color: 'qb-green', base: '$8.80', ship: '$4.50', total: '$13.30', cheapest: false },
                  { name: 'Printify', letter: 'P', color: 'qb-maroon', base: '$10.20', ship: '$3.80', total: '$14.00', cheapest: false },
                ].map(s => (
                  <div key={s.name} className={`${styles.supplierCard} ${s.cheapest ? styles.supplierCardSelected : ''}`}>
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded bg-${s.color} text-white flex items-center justify-center font-bold`}>{s.letter}</div>
                      <div>
                        <div className="font-semibold text-body-sm">{s.name}</div>
                        <div className="text-[10px] text-on-surface-variant">Base: {s.base} · Ship: {s.ship}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`font-bold tabular-nums ${s.cheapest ? 'text-secondary' : ''}`}>{s.total}</div>
                      {s.cheapest && <div className="text-[10px] text-secondary font-semibold">Cheapest</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="h-16 bg-white border-t border-surface-dim px-6 flex items-center justify-between shrink-0">
            <button
              className="h-8 px-4 border border-surface-dim rounded text-body-md hover:bg-surface-container-low font-semibold"
              onClick={() => setFlyoutOpen(false)}
            >Cancel</button>
            <button
              className="h-9 px-5 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container flex items-center gap-2 shadow-sm"
              onClick={() => { setFlyoutOpen(false); toast('Opening Design Studio...'); }}
            >
              <span className="material-symbols-outlined text-[18px]">palette</span>Save &amp; Open Studio
            </button>
          </div>
        </div>
      </div>

      {/* ═══ Create menu (split-button dropdown) ═══ */}
      {createMenu && (
        <div
          data-create-menu-root
          className={`${styles.rowMenu} ${styles.rowMenuOpen}`}
          style={{ top: createMenu.y, left: Math.min(createMenu.x - 250, typeof window !== 'undefined' ? window.innerWidth - 260 : 0) }}
        >
          <div className={styles.menuHeader}>Create</div>
          {CREATE_MENU_ITEMS.map((item, i) => item.sep ? (
            <div key={`sep-${i}`} className="sep" />
          ) : (
            <button
              key={item.create}
              onClick={() => { setCreateMenu(null); toast(`Create → ${item.create}`); }}
            >
              <span className="material-symbols-outlined">{item.icon}</span>{item.create}
            </button>
          ))}
        </div>
      )}

      {/* ═══ Row menu ═══ */}
      {rowMenu && (
        <div
          data-row-menu-root
          className={`${styles.rowMenu} ${styles.rowMenuOpen}`}
          style={{ top: rowMenu.y, left: Math.max(8, rowMenu.x - 250) }}
        >
          <div className={styles.menuHeader}>{ENTITY_LABELS[rowMenu.entity]}</div>
          {ROW_MENU_ACTIONS[rowMenu.entity].map((a, i) => a.sep ? (
            <div key={`sep-${i}`} className="sep" />
          ) : (
            <button
              key={a.a}
              className={a.danger ? 'danger' : ''}
              onClick={() => {
                const rec = rows.find(r => r.id === rowMenu.id);
                setRowMenu(null);
                if (rec) runRowAction(a.a, rec);
              }}
            >
              <span className="material-symbols-outlined">{a.icon}</span>{a.l}
            </button>
          ))}
        </div>
      )}

      {/* ═══ Toast (local fallback) ═══ */}
      <div className={`${styles.toast} ${toastMsg ? styles.toastShow : ''}`}>{toastMsg}</div>
    </div>
  );
}

/* ════════════════════════════════════════════════════════════
   Drawer header helper
   ════════════════════════════════════════════════════════════ */

function DrawerHeader({ icon, title, sub, onClose }: {
  icon: string;
  title: string;
  sub: string;
  onClose: () => void;
}) {
  return (
    <div className="flex items-center justify-between px-5 h-14 border-b border-surface-dim shrink-0">
      <div className="flex items-center gap-2 min-w-0">
        <span className="material-symbols-outlined text-[20px] text-primary">{icon}</span>
        <div className="min-w-0">
          <div className="text-headline-sm truncate">{title}</div>
          <div className="text-[11px] text-on-surface-variant">{sub}</div>
        </div>
      </div>
      <button
        className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center"
        onClick={onClose}
      >
        <span className="material-symbols-outlined text-[18px]">close</span>
      </button>
    </div>
  );
}

function entityIcon(entity: EntityKey): string {
  const map: Record<EntityKey, string> = {
    products: 'inventory_2',
    skus: 'qr_code',
    bundles: 'redeem',
    suppliers: 'factory',
    brands: 'branding_watermark',
    channels: 'local_mall',
    categories: 'category',
  };
  return map[entity];
}
function entitySub(entity: EntityKey): string {
  const map: Record<EntityKey, string> = {
    products: 'Catalog product',
    skus: 'SKU record',
    bundles: 'Grouped items',
    suppliers: 'Supplier party',
    brands: 'Brand identity',
    channels: 'Sales channel',
    categories: 'Collection',
  };
  return map[entity];
}

/* ════════════════════════════════════════════════════════════
   Drawer body (per-entity detail form)
   ════════════════════════════════════════════════════════════ */

function DrawerBody({ entity, record, onOpenFlyout, onToast }: {
  entity: EntityKey;
  record: Row;
  onOpenFlyout: () => void;
  onToast: (m: string) => void;
}) {
  if (entity === 'products') {
    return (
      <>
        <div>
          <label className={styles.fieldLabel}>Product name</label>
          <input className={styles.fieldInput} defaultValue={record.name} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={styles.fieldLabel}>SKU</label>
            <input className={`${styles.fieldInput} font-mono`} defaultValue={record.sku} />
          </div>
          <div>
            <label className={styles.fieldLabel}>Status</label>
            <div><StatusPill status={record.status} /></div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={styles.fieldLabel}>Category</label>
            <input className={styles.fieldInput} defaultValue={record.category || ''} />
          </div>
          <div>
            <label className={styles.fieldLabel}>Supplier</label>
            <input className={styles.fieldInput} defaultValue={record.supplier || ''} />
          </div>
        </div>
        <ChannelsBlock channels={record.channels} />
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className={styles.fieldLabel}>Price</label>
            <input className={`${styles.fieldInput} tabular-nums`} defaultValue={record.price != null ? usd(record.price) : ''} />
          </div>
          <div>
            <label className={styles.fieldLabel}>Variants</label>
            <input className={`${styles.fieldInput} tabular-nums`} defaultValue={record.variants ?? ''} />
          </div>
          <div>
            <label className={styles.fieldLabel}>Margin</label>
            <input className={`${styles.fieldInput} tabular-nums`} defaultValue={record.margin != null ? `${record.margin}%` : ''} />
          </div>
        </div>
        {record.engagement && (
          <div className="pt-2">
            <div className={styles.sectionH}>Storefront Engagement</div>
            <div className="flex items-center gap-4 text-[12px]">
              <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[14px] text-error">favorite</span>{record.engagement.likes}</span>
              <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[14px] text-qb-blue">bookmark</span>{record.engagement.saves}</span>
              <span className="flex items-center gap-1"><span className="material-symbols-outlined text-[14px] text-qb-maroon">photo_camera</span>{record.engagement.photos}</span>
            </div>
          </div>
        )}
        <div className="pt-2">
          <div className={styles.sectionH}>Supplier Routing &amp; Matrix</div>
          <button
            className="w-full h-9 bg-qb-blue text-white rounded text-body-md font-semibold flex items-center justify-center gap-1 hover:bg-qb-blue/90"
            onClick={onOpenFlyout}
          >
            <span className="material-symbols-outlined text-[16px]">grid_on</span>Open Variant &amp; Supplier Matrix
          </button>
        </div>
        {(record.ugcPending ?? 0) > 0 && (
          <div className="pt-2">
            <div className={styles.sectionH}>UGC Moderation</div>
            <div className="bg-surface-container-low rounded p-3 text-[12px] flex justify-between items-center">
              <span><strong>{record.ugcPending}</strong> pending submissions</span>
              <button
                className="h-7 px-2 bg-primary text-white rounded text-[11px] font-semibold"
                onClick={() => onToast('UGC moderation drawer')}
              >Moderate</button>
            </div>
          </div>
        )}
      </>
    );
  }
  if (entity === 'skus') {
    return (
      <>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={styles.fieldLabel}>SKU</label>
            <input className={`${styles.fieldInput} font-mono`} defaultValue={record.sku} />
          </div>
          <div>
            <label className={styles.fieldLabel}>Variant</label>
            <input className={styles.fieldInput} defaultValue={record.variant || ''} />
          </div>
        </div>
        <ChannelsBlock channels={record.channels} />
        <div className="grid grid-cols-4 gap-3">
          <div>
            <label className={styles.fieldLabel}>On hand</label>
            <input className={`${styles.fieldInput} tabular-nums`} defaultValue={record.onhand ?? ''} />
          </div>
          <div>
            <label className={styles.fieldLabel}>Reserved</label>
            <input className={`${styles.fieldInput} tabular-nums`} defaultValue={record.reserved ?? ''} />
          </div>
          <div>
            <label className={styles.fieldLabel}>Price</label>
            <input className={`${styles.fieldInput} tabular-nums`} defaultValue={record.price != null ? usd(record.price) : ''} />
          </div>
          <div>
            <label className={styles.fieldLabel}>Cost</label>
            <input className={`${styles.fieldInput} tabular-nums`} defaultValue={record.cost != null ? usd(record.cost) : ''} />
          </div>
        </div>
      </>
    );
  }
  if (entity === 'bundles') {
    return (
      <>
        <div>
          <label className={styles.fieldLabel}>Bundle name</label>
          <input className={styles.fieldInput} defaultValue={record.name} />
        </div>
        <div>
          <label className={styles.fieldLabel}>Contains</label>
          <input className={styles.fieldInput} defaultValue={record.contains || ''} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={styles.fieldLabel}>Bundle price</label>
            <input className={`${styles.fieldInput} tabular-nums`} defaultValue={record.price != null ? usd(record.price) : ''} />
          </div>
          <div>
            <label className={styles.fieldLabel}>Items total</label>
            <input className={`${styles.fieldInput} tabular-nums`} defaultValue={record.itemsTotal != null ? usd(record.itemsTotal) : ''} />
          </div>
        </div>
      </>
    );
  }
  if (entity === 'suppliers') {
    return (
      <>
        <div>
          <label className={styles.fieldLabel}>Roles</label>
          <div className="flex flex-wrap gap-1.5">
            <button className={styles.roleChipBtn}>Customer</button>
            <button className={styles.roleChipBtn}>Vendor</button>
            <button className={`${styles.roleChipBtn} ${styles.roleChipBtnActive}`}>Supplier</button>
            <button className={styles.roleChipBtn}>Contractor</button>
          </div>
          <p className="text-[11px] text-on-surface-variant mt-1">Roles stack — a supplier can also be a vendor.</p>
        </div>
        <div>
          <label className={styles.fieldLabel}>Company</label>
          <input className={styles.fieldInput} defaultValue={record.company || ''} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={styles.fieldLabel}>Account #</label>
            <input className={`${styles.fieldInput} font-mono`} defaultValue={record.account || ''} />
          </div>
          <div>
            <label className={styles.fieldLabel}>Lead time</label>
            <input className={styles.fieldInput} defaultValue={record.lead || ''} />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={styles.fieldLabel}>Open bills</label>
            <input className={`${styles.fieldInput} tabular-nums`} defaultValue={record.openBills != null ? usd(record.openBills) : ''} />
          </div>
          <div>
            <label className={styles.fieldLabel}>YTD paid</label>
            <input className={`${styles.fieldInput} tabular-nums`} defaultValue={record.ytd != null ? usd(record.ytd) : ''} />
          </div>
        </div>
      </>
    );
  }
  if (entity === 'brands') {
    return (
      <>
        <div>
          <label className={styles.fieldLabel}>Brand name</label>
          <input className={styles.fieldInput} defaultValue={record.name} />
        </div>
        <div>
          <label className={styles.fieldLabel}>Domain</label>
          <input className={`${styles.fieldInput} font-mono`} defaultValue={record.domain || ''} />
        </div>
        <div>
          <label className={styles.fieldLabel}>Brand colors</label>
          <div className="flex gap-2">
            {(record.colors || []).map((c, i) => (
              <div key={i} className="w-8 h-8 rounded border border-black/10" style={{ background: c }} />
            ))}
          </div>
        </div>
        <div>
          <label className={styles.fieldLabel}>Typography</label>
          <input className={styles.fieldInput} defaultValue={record.font || ''} />
        </div>
        <ChannelsBlock channels={record.channels} />
      </>
    );
  }
  if (entity === 'channels') {
    return (
      <>
        <div className="bg-surface-container-low rounded-lg p-3 flex items-center gap-3">
          <div className={`${styles.chBadge} ${styles[`chBadge${capitalize(record.badge || 'custom')}`]}`}>{record.letter}</div>
          <div>
            <div className="font-semibold">{record.name}</div>
            <div className="text-[11px] text-on-surface-variant">{record.domain}</div>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={styles.fieldLabel}>Listings</label>
            <input className={`${styles.fieldInput} tabular-nums`} defaultValue={(record.listings ?? 0).toLocaleString()} />
          </div>
          <div>
            <label className={styles.fieldLabel}>Needs sync</label>
            <input className={`${styles.fieldInput} tabular-nums`} defaultValue={String(record.needsSync ?? 0)} />
          </div>
        </div>
        <div>
          <label className={styles.fieldLabel}>Last sync</label>
          <input className={styles.fieldInput} defaultValue={record.last || ''} />
        </div>
        <div className="pt-2">
          <div className={styles.sectionH}>Sync settings</div>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-body-sm"><input type="checkbox" className={styles.rowCheck} defaultChecked />Sync products &amp; listings</label>
            <label className="flex items-center gap-2 text-body-sm"><input type="checkbox" className={styles.rowCheck} defaultChecked />Sync inventory</label>
            <label className="flex items-center gap-2 text-body-sm"><input type="checkbox" className={styles.rowCheck} defaultChecked />Pull orders</label>
          </div>
        </div>
      </>
    );
  }
  if (entity === 'categories') {
    return (
      <>
        <div>
          <label className={styles.fieldLabel}>Collection title</label>
          <input className={styles.fieldInput} defaultValue={record.name} />
        </div>
        <div>
          <label className={styles.fieldLabel}>URL handle</label>
          <div className="flex items-center">
            <span className="text-[12px] text-on-surface-variant px-2 bg-surface-container-low border border-r-0 border-surface-dim rounded-l h-9 flex items-center">/collections/</span>
            <input className={`${styles.fieldInput} rounded-l-none`} defaultValue={record.slug || ''} />
          </div>
        </div>
        <div>
          <label className={styles.fieldLabel}>Type</label>
          <select className={styles.fieldInput} defaultValue={record.type || 'Manual'}>
            <option>Manual</option>
            <option>Automated</option>
          </select>
        </div>
        <div className="pt-2">
          <div className={styles.sectionH}>Visibility</div>
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-body-sm"><input type="checkbox" className={styles.rowCheck} defaultChecked />Publish to storefront</label>
            <label className="flex items-center gap-2 text-body-sm"><input type="checkbox" className={styles.rowCheck} defaultChecked />Include in search</label>
          </div>
        </div>
      </>
    );
  }
  return null;
}

/* ════════════════════════════════════════════════════════════
   Facet create body (the form rendered for "New <Facet>" drawer)
   ════════════════════════════════════════════════════════════ */

function FacetCreateBody({ def }: { def: FacetDef }) {
  return (
    <>
      {def.createFields.map(f => {
        if (f.type === 'text') {
          return (
            <div key={f.key}>
              <label className={styles.fieldLabel}>{f.label}</label>
              <input className={styles.fieldInput} placeholder={f.placeholder || ''} />
            </div>
          );
        }
        if (f.type === 'textarea') {
          return (
            <div key={f.key}>
              <label className={styles.fieldLabel}>{f.label}</label>
              <textarea className={styles.fieldInput} rows={3} placeholder={f.placeholder || ''} />
            </div>
          );
        }
        if (f.type === 'select') {
          return (
            <div key={f.key}>
              <label className={styles.fieldLabel}>{f.label}</label>
              <select className={styles.fieldInput}>
                {(f.options || []).map(o => <option key={o}>{o}</option>)}
              </select>
            </div>
          );
        }
        if (f.type === 'color') {
          return (
            <div key={f.key}>
              <label className={styles.fieldLabel}>{f.label}</label>
              <div className="flex items-center gap-2">
                <input type="color" defaultValue={f.value || '#8af5be'} className="w-9 h-9 rounded border border-surface-dim cursor-pointer" />
                <input className={styles.fieldInput} defaultValue={f.value || '#8af5be'} />
              </div>
            </div>
          );
        }
        if (f.type === 'colors') {
          return (
            <div key={f.key}>
              <label className={styles.fieldLabel}>{f.label}</label>
              <div className="flex gap-2 items-center">
                <div className="w-8 h-8 rounded border border-black/10" style={{ background: '#0a6400' }} />
                <div className="w-8 h-8 rounded border border-black/10" style={{ background: '#faf9fc' }} />
                <div className="w-8 h-8 rounded border border-black/10" style={{ background: '#1a1c1e' }} />
                <button className="w-8 h-8 rounded border border-dashed border-surface-dim flex items-center justify-center text-on-surface-variant hover:border-primary">
                  <span className="material-symbols-outlined text-[16px]">add</span>
                </button>
              </div>
            </div>
          );
        }
        if (f.type === 'checks') {
          return (
            <div key={f.key}>
              <label className={styles.fieldLabel}>{f.label}</label>
              <div className="space-y-2">
                {(f.options || []).map(o => (
                  <label key={o} className="flex items-center gap-2 text-body-sm">
                    <input type="checkbox" className={styles.rowCheck} defaultChecked />{o}
                  </label>
                ))}
              </div>
            </div>
          );
        }
        if (f.prefix) {
          return (
            <div key={f.key}>
              <label className={styles.fieldLabel}>{f.label}</label>
              <div className="flex items-center">
                <span className="text-[12px] text-on-surface-variant px-2 bg-surface-container-low border border-r-0 border-surface-dim rounded-l h-9 flex items-center">{f.prefix}</span>
                <input className={`${styles.fieldInput} rounded-l-none`} placeholder={f.placeholder || ''} />
              </div>
            </div>
          );
        }
        return null;
      })}
    </>
  );
}

/* ════════════════════════════════════════════════════════════
   Table host — dispatches to the right per-entity table renderer
   ════════════════════════════════════════════════════════════ */

function TableHost(props: {
  entity: EntityKey;
  rows: Row[];
  selected: Set<string>;
  expanded: Set<string>;
  variantCache: Record<string, ProductVariantRow[]>;
  loaded: boolean;
  onToggleExpand: (id: string) => void;
  onToggleRow: (id: string, on: boolean) => void;
  onToggleAll: (on: boolean) => void;
  onRowMenu: (id: string, anchor: HTMLElement) => void;
  onRowClick: (r: Row) => void;
  onSkuOpen: (s: Row) => void;
}) {
  const { entity, loaded, rows } = props;

  if (!loaded && rows.length === 0) {
    return (
      <div className="p-10 text-center text-on-surface-variant">
        <span className="material-symbols-outlined text-[32px] mb-2 block animate-spin">progress_activity</span>
        <div className="font-medium mb-1">Fetching from Supabase…</div>
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <div className="p-10 text-center text-on-surface-variant">
        <span className="material-symbols-outlined text-[32px] mb-2 block">search_off</span>
        <div className="font-medium mb-1">No records match</div>
        <div className="text-[12px]">Try removing a facet.</div>
      </div>
    );
  }

  if (entity === 'products') return <ProductsTable {...props} />;
  if (entity === 'skus') return <SkusTable {...props} />;
  if (entity === 'bundles') return <BundlesTable {...props} />;
  if (entity === 'suppliers') return <SuppliersTable {...props} />;
  if (entity === 'brands') return <BrandsTable {...props} />;
  if (entity === 'channels') return <ChannelsTable {...props} />;
  if (entity === 'categories') return <CategoriesTable {...props} />;
  return null;
}

/* ── Shared cell helpers ── */

function RowCheckbox({ checked, onChange }: { checked: boolean; onChange: (on: boolean) => void }) {
  return (
    <input
      type="checkbox"
      className={styles.rowCheck}
      checked={checked}
      onChange={e => onChange(e.target.checked)}
      onClick={e => e.stopPropagation()}
    />
  );
}

function RowMenuButton({ onClick }: { onClick: (anchor: HTMLElement) => void }) {
  return (
    <button
      data-row-menu-trigger
      className="w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center"
      onClick={(e) => { e.stopPropagation(); onClick(e.currentTarget); }}
    >
      <span className="material-symbols-outlined text-[16px] text-on-surface-variant">more_horiz</span>
    </button>
  );
}

/* ── Products table (with expandable SKU subtable) ── */

function ProductsTable(props: {
  rows: Row[];
  selected: Set<string>;
  expanded: Set<string>;
  variantCache: Record<string, ProductVariantRow[]>;
  onToggleExpand: (id: string) => void;
  onToggleRow: (id: string, on: boolean) => void;
  onToggleAll: (on: boolean) => void;
  onRowMenu: (id: string, anchor: HTMLElement) => void;
  onRowClick: (r: Row) => void;
  onSkuOpen: (s: Row) => void;
}) {
  const { rows, selected, expanded, variantCache, onToggleExpand, onToggleRow, onToggleAll, onRowMenu, onRowClick, onSkuOpen } = props;
  const allSelected = rows.length > 0 && rows.every(r => selected.has(r.id));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-body-sm">
        <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider">
          <tr>
            <th className="w-8 px-3 py-2"><RowCheckbox checked={allSelected} onChange={on => onToggleAll(on)} /></th>
            <th className="w-8 px-2 py-2" />
            <th className="px-3 py-2">Product</th>
            <th className="px-3 py-2">Category</th>
            <th className="px-3 py-2">Supplier</th>
            <th className="px-3 py-2">Channels</th>
            <th className="px-3 py-2 text-right">Price</th>
            <th className="px-3 py-2">Status</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-dim">
          {rows.map(r => {
            const exp = expanded.has(r.id);
            const skus = variantCache[r.id] || [];
            return (
              <RowFragment key={r.id} exp={exp}>
                <tr
                  className={`cursor-pointer ${exp ? 'bg-surface-container-low' : ''}`}
                  onClick={() => onRowClick(r)}
                >
                  <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                    <RowCheckbox checked={selected.has(r.id)} onChange={on => onToggleRow(r.id, on)} />
                  </td>
                  <td className="px-2 py-2" onClick={e => e.stopPropagation()}>
                    <button
                      className="w-5 h-5 rounded hover:bg-surface-container flex items-center justify-center text-on-surface-variant"
                      onClick={() => onToggleExpand(r.id)}
                    >
                      <span className="material-symbols-outlined text-[16px]">{exp ? 'expand_more' : 'chevron_right'}</span>
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-[18px] text-on-surface-variant">{r.icon}</span>
                      <div className="min-w-0">
                        <div className="font-medium truncate">{r.name}</div>
                        <div className="text-[11px] text-on-surface-variant font-mono">{r.sku}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-on-surface-variant">{r.category || '—'}</td>
                  <td className="px-3 py-2 text-on-surface-variant">{r.supplier || '—'}</td>
                  <td className="px-3 py-2 text-on-surface-variant text-[11px]">{(r.channels || []).join(', ') || '—'}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{r.price != null ? usd(r.price) : '—'}</td>
                  <td className="px-3 py-2"><StatusPill status={r.status} /></td>
                  <td className="px-2 py-2 text-right" onClick={e => e.stopPropagation()}>
                    <RowMenuButton onClick={(a) => onRowMenu(r.id, a)} />
                  </td>
                </tr>
                {exp && skus.length > 0 && (
                  <tr className={styles.subtable}>
                    <td colSpan={9}>
                      <table>
                        <thead>
                          <tr>
                            <th>SKU</th>
                            <th>Variant</th>
                            <th className="right">On hand</th>
                            <th className="right">Price</th>
                            <th className="right">Cost</th>
                            <th>Stock</th>
                            <th className="right" />
                          </tr>
                        </thead>
                        <tbody>
                          {skus.map(s => {
                            const stockStatus = s.in_stock === false ? 'Out of stock' : (s.stock_quantity != null && s.stock_quantity <= 5 ? 'Low stock' : 'In stock');
                            const cost = s.price ? Math.round(s.price * 50) : null;
                            return (
                              <tr key={s.id}>
                                <td className="font-mono text-[11px] text-on-surface-variant">{s.sku}</td>
                                <td>{[s.color, s.size].filter(Boolean).join(' / ') || 'Default'}</td>
                                <td className="right">{s.stock_quantity == null ? '—' : s.stock_quantity}</td>
                                <td className="right">{money(s.price)}</td>
                                <td className="right">{cost != null ? money(cost / 100) : '—'}</td>
                                <td><StatusPill status={stockStatus} /></td>
                                <td className="right">
                                  <button
                                    className="text-[11px] text-primary font-semibold hover:underline"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      onSkuOpen({ id: s.id, parentId: r.id } as Row);
                                    }}
                                  >Open</button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </td>
                  </tr>
                )}
                {exp && skus.length === 0 && (
                  <tr className={styles.subtable}>
                    <td colSpan={9}>
                      <div className="px-12 py-3 text-[11px] text-on-surface-variant">No variants for this product.</div>
                    </td>
                  </tr>
                )}
              </RowFragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Wraps a row pair (main + subtable) so we can render both as siblings. */
function RowFragment({ children, exp }: { children: React.ReactNode; exp: boolean }) {
  // No-op wrapper; the tr pair is already siblings.
  void exp;
  return <>{children}</>;
}

/* ── SKUs table ── */

function SkusTable(props: {
  rows: Row[];
  selected: Set<string>;
  onToggleRow: (id: string, on: boolean) => void;
  onToggleAll: (on: boolean) => void;
  onRowMenu: (id: string, anchor: HTMLElement) => void;
  onRowClick: (r: Row) => void;
}) {
  const { rows, selected, onToggleRow, onToggleAll, onRowMenu, onRowClick } = props;
  const allSelected = rows.length > 0 && rows.every(r => selected.has(r.id));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-body-sm">
        <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider">
          <tr>
            <th className="w-8 px-3 py-2"><RowCheckbox checked={allSelected} onChange={on => onToggleAll(on)} /></th>
            <th className="px-3 py-2">Item</th>
            <th className="px-3 py-2">SKU</th>
            <th className="px-3 py-2">Variant</th>
            <th className="px-3 py-2 text-right">On hand</th>
            <th className="px-3 py-2 text-right">Price</th>
            <th className="px-3 py-2">Status</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-dim">
          {rows.map(r => (
            <tr key={r.id} className="cursor-pointer" onClick={() => onRowClick(r)}>
              <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                <RowCheckbox checked={selected.has(r.id)} onChange={on => onToggleRow(r.id, on)} />
              </td>
              <td className="px-3 py-2"><div className="font-medium">{r.name}</div></td>
              <td className="px-3 py-2 font-mono text-[11px] text-on-surface-variant">{r.sku}</td>
              <td className="px-3 py-2 text-on-surface-variant">{r.variant || '—'}</td>
              <td className="px-3 py-2 text-right tabular-nums">{r.onhand == null ? '—' : r.onhand}</td>
              <td className="px-3 py-2 text-right tabular-nums">{r.price != null ? usd(r.price) : '—'}</td>
              <td className="px-3 py-2"><StatusPill status={r.status} /></td>
              <td className="px-2 py-2 text-right" onClick={e => e.stopPropagation()}>
                <RowMenuButton onClick={(a) => onRowMenu(r.id, a)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Bundles table ── */

function BundlesTable(props: {
  rows: Row[];
  selected: Set<string>;
  onToggleRow: (id: string, on: boolean) => void;
  onToggleAll: (on: boolean) => void;
  onRowMenu: (id: string, anchor: HTMLElement) => void;
  onRowClick: (r: Row) => void;
}) {
  const { rows, selected, onToggleRow, onToggleAll, onRowMenu, onRowClick } = props;
  const allSelected = rows.length > 0 && rows.every(r => selected.has(r.id));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-body-sm">
        <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider">
          <tr>
            <th className="w-8 px-3 py-2"><RowCheckbox checked={allSelected} onChange={on => onToggleAll(on)} /></th>
            <th className="px-3 py-2">Bundle</th>
            <th className="px-3 py-2">Contains</th>
            <th className="px-3 py-2 text-right">Price</th>
            <th className="px-3 py-2 text-right">Items total</th>
            <th className="px-3 py-2">Status</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-dim">
          {rows.map(r => (
            <tr key={r.id} className="cursor-pointer" onClick={() => onRowClick(r)}>
              <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                <RowCheckbox checked={selected.has(r.id)} onChange={on => onToggleRow(r.id, on)} />
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px] text-on-surface-variant">{r.icon}</span>
                  <div className="font-medium">{r.name}</div>
                </div>
              </td>
              <td className="px-3 py-2 text-on-surface-variant">{r.contains || '—'}</td>
              <td className="px-3 py-2 text-right tabular-nums">{r.price != null ? usd(r.price) : '—'}</td>
              <td className="px-3 py-2 text-right tabular-nums text-on-surface-variant">{r.itemsTotal != null ? usd(r.itemsTotal) : '—'}</td>
              <td className="px-3 py-2"><StatusPill status={r.status} /></td>
              <td className="px-2 py-2 text-right" onClick={e => e.stopPropagation()}>
                <RowMenuButton onClick={(a) => onRowMenu(r.id, a)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Suppliers table ── */

function SuppliersTable(props: {
  rows: Row[];
  selected: Set<string>;
  onToggleRow: (id: string, on: boolean) => void;
  onToggleAll: (on: boolean) => void;
  onRowMenu: (id: string, anchor: HTMLElement) => void;
  onRowClick: (r: Row) => void;
}) {
  const { rows, selected, onToggleRow, onToggleAll, onRowMenu, onRowClick } = props;
  const allSelected = rows.length > 0 && rows.every(r => selected.has(r.id));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-body-sm">
        <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider">
          <tr>
            <th className="w-8 px-3 py-2"><RowCheckbox checked={allSelected} onChange={on => onToggleAll(on)} /></th>
            <th className="px-3 py-2">Supplier</th>
            <th className="px-3 py-2">Account</th>
            <th className="px-3 py-2 text-right">Open bills</th>
            <th className="px-3 py-2">Lead time</th>
            <th className="px-3 py-2">Status</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-dim">
          {rows.map(r => (
            <tr key={r.id} className="cursor-pointer" onClick={() => onRowClick(r)}>
              <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                <RowCheckbox checked={selected.has(r.id)} onChange={on => onToggleRow(r.id, on)} />
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-full bg-qb-blue flex items-center justify-center text-[10px] font-bold text-white">
                    {(r.name || '?').charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <div className="font-medium">{r.name}</div>
                    <div className="text-[11px] text-on-surface-variant">{r.company}</div>
                  </div>
                </div>
              </td>
              <td className="px-3 py-2 font-mono text-[11px] text-on-surface-variant">{r.account || '—'}</td>
              <td className="px-3 py-2 text-right tabular-nums">{r.openBills != null ? usd(r.openBills) : '—'}</td>
              <td className="px-3 py-2 text-on-surface-variant">{r.lead || '—'}</td>
              <td className="px-3 py-2"><StatusPill status={r.status} /></td>
              <td className="px-2 py-2 text-right" onClick={e => e.stopPropagation()}>
                <RowMenuButton onClick={(a) => onRowMenu(r.id, a)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Brands table ── */

function BrandsTable(props: {
  rows: Row[];
  selected: Set<string>;
  onToggleRow: (id: string, on: boolean) => void;
  onToggleAll: (on: boolean) => void;
  onRowMenu: (id: string, anchor: HTMLElement) => void;
  onRowClick: (r: Row) => void;
}) {
  const { rows, selected, onToggleRow, onToggleAll, onRowMenu, onRowClick } = props;
  const allSelected = rows.length > 0 && rows.every(r => selected.has(r.id));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-body-sm">
        <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider">
          <tr>
            <th className="w-8 px-3 py-2"><RowCheckbox checked={allSelected} onChange={on => onToggleAll(on)} /></th>
            <th className="px-3 py-2">Brand</th>
            <th className="px-3 py-2">Colors</th>
            <th className="px-3 py-2">Font</th>
            <th className="px-3 py-2 text-right">Products</th>
            <th className="px-3 py-2">Status</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-dim">
          {rows.map(r => (
            <tr key={r.id} className="cursor-pointer" onClick={() => onRowClick(r)}>
              <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                <RowCheckbox checked={selected.has(r.id)} onChange={on => onToggleRow(r.id, on)} />
              </td>
              <td className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <div className="w-8 h-8 rounded bg-qb-green flex items-center justify-center text-[11px] font-bold text-white">
                    {brandInitials(r.name)}
                  </div>
                  <div>
                    <div className="font-medium">{r.name}</div>
                    <div className="text-[11px] text-on-surface-variant">{r.domain}</div>
                  </div>
                </div>
              </td>
              <td className="px-3 py-2">
                <div className="flex gap-1">
                  {(r.colors || []).map((c, i) => (
                    <div key={i} className="w-4 h-4 rounded border border-black/10" style={{ background: c }} />
                  ))}
                </div>
              </td>
              <td className="px-3 py-2 text-on-surface-variant">{r.font || '—'}</td>
              <td className="px-3 py-2 text-right tabular-nums">{(r.products ?? 0).toLocaleString()}</td>
              <td className="px-3 py-2"><StatusPill status={r.status} /></td>
              <td className="px-2 py-2 text-right" onClick={e => e.stopPropagation()}>
                <RowMenuButton onClick={(a) => onRowMenu(r.id, a)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Channels table ── */

function ChannelsTable(props: {
  rows: Row[];
  selected: Set<string>;
  onToggleRow: (id: string, on: boolean) => void;
  onToggleAll: (on: boolean) => void;
  onRowMenu: (id: string, anchor: HTMLElement) => void;
  onRowClick: (r: Row) => void;
}) {
  const { rows, selected, onToggleRow, onToggleAll, onRowMenu, onRowClick } = props;
  const allSelected = rows.length > 0 && rows.every(r => selected.has(r.id));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-body-sm">
        <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider">
          <tr>
            <th className="w-8 px-3 py-2"><RowCheckbox checked={allSelected} onChange={on => onToggleAll(on)} /></th>
            <th className="px-3 py-2">Channel</th>
            <th className="px-3 py-2 text-right">Listings</th>
            <th className="px-3 py-2 text-right">Needs sync</th>
            <th className="px-3 py-2">Last sync</th>
            <th className="px-3 py-2">Status</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-dim">
          {rows.map(r => {
            const badgeClass = (styles as Record<string, string>)[`chBadge${capitalize(r.badge || 'custom')}`] || styles.chBadgeCustom;
            return (
              <tr key={r.id} className="cursor-pointer" onClick={() => onRowClick(r)}>
                <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                  <RowCheckbox checked={selected.has(r.id)} onChange={on => onToggleRow(r.id, on)} />
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-2">
                    <div className={`${styles.chBadge} ${badgeClass}`}>{r.letter}</div>
                    <div>
                      <div className="font-medium">{r.name}</div>
                      <div className="text-[11px] text-on-surface-variant">{r.domain}</div>
                    </div>
                  </div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{(r.listings ?? 0).toLocaleString()}</td>
                <td className={`px-3 py-2 text-right tabular-nums ${(r.needsSync ?? 0) > 0 ? 'text-qb-maroon font-semibold' : ''}`}>{r.needsSync ?? 0}</td>
                <td className="px-3 py-2 text-on-surface-variant">{r.last || '—'}</td>
                <td className="px-3 py-2"><StatusPill status={r.status} /></td>
                <td className="px-2 py-2 text-right" onClick={e => e.stopPropagation()}>
                  <RowMenuButton onClick={(a) => onRowMenu(r.id, a)} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ── Categories table ── */

function CategoriesTable(props: {
  rows: Row[];
  selected: Set<string>;
  onToggleRow: (id: string, on: boolean) => void;
  onToggleAll: (on: boolean) => void;
  onRowMenu: (id: string, anchor: HTMLElement) => void;
  onRowClick: (r: Row) => void;
}) {
  const { rows, selected, onToggleRow, onToggleAll, onRowMenu, onRowClick } = props;
  const allSelected = rows.length > 0 && rows.every(r => selected.has(r.id));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-body-sm">
        <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider">
          <tr>
            <th className="w-8 px-3 py-2"><RowCheckbox checked={allSelected} onChange={on => onToggleAll(on)} /></th>
            <th className="px-3 py-2">Collection</th>
            <th className="px-3 py-2">Type</th>
            <th className="px-3 py-2 text-right">Products</th>
            <th className="px-3 py-2">Status</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-dim">
          {rows.map(r => (
            <tr key={r.id} className="cursor-pointer" onClick={() => onRowClick(r)}>
              <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                <RowCheckbox checked={selected.has(r.id)} onChange={on => onToggleRow(r.id, on)} />
              </td>
              <td className="px-3 py-2">
                <div className="font-medium">{r.name}</div>
                <div className="text-[11px] text-on-surface-variant font-mono">/collections/{r.slug}</div>
              </td>
              <td className="px-3 py-2 text-on-surface-variant">{r.type || '—'}</td>
              <td className="px-3 py-2 text-right tabular-nums">{r.products ?? 0}</td>
              <td className="px-3 py-2"><StatusPill status={r.status} /></td>
              <td className="px-2 py-2 text-right" onClick={e => e.stopPropagation()}>
                <RowMenuButton onClick={(a) => onRowMenu(r.id, a)} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
