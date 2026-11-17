import { TOP_NAV } from '@/lib/designCanvasStore';

export type ScreenType = 'overview' | 'list' | 'wizard' | 'drawer';

/**
 * Slugify a TOP_NAV category/subcategory label into a stable screen id segment.
 * "Home & Living" → "home-living", "Sweatshirts" → "sweatshirts".
 */
function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/**
 * Screen id for a REAL catalog-tree path: ['Apparel','Women','T-Shirts'] →
 * 'studio-apparel--women--t-shirts'. A DOUBLE dash separates path segments
 * so single dashes inside names ('T-Shirts', 'Cards & stationery' →
 * 'cards-and-stationery') stay unambiguous when routing splits the id.
 */
export function catalogScreenIdForPath(path: string[]): string {
  return 'studio-' + path.map(slugify).join('--');
}

/**
 * Routable real-tree catalog paths, keyed by screen id (e.g.
 * 'studio-cards-and-stationery' → ['Cards & stationery']). Registered by
 * the UI when the real /api/v1/categories tree loads (SideRail walks the
 * whole tree). Keyed by the EXACT names the ids were generated from — no
 * slug re-matching, which breaks when a DB slug ('cards-stationery')
 * differs from the name's slugify ('cards-and-stationery').
 */
const catalogPaths = new Map<string, string[]>();
export function registerCatalogPaths(entries: Record<string, string[]>): void {
  for (const [id, names] of Object.entries(entries)) catalogPaths.set(id, names);
}
export function catalogPathFor(id: string): string[] | null {
  return catalogPaths.get(id) ?? null;
}
/** Prettified fallback while the real tree loads: 'women-t-shirts' → 'Women T Shirts'. */
function prettifySlugSlug(id: string): string {
  return id
    .split('--')
    .pop()!
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Build the Design Studio sidebar "Catalog" group screens by mirroring the
 * in-Studio top bar (TOP_NAV) parent-child hierarchy. Each TOP_NAV category
 * is a parent screen; its subcategories are children (collapsed by default,
 * expand on click in the SideRail — NOT stuck open).
 */
function buildDesignCatalogScreens(): ScreenItem[] {
  return Object.entries(TOP_NAV).map(([category, subs]) => ({
    id: `studio-${slugify(category)}`,
    label: category,
    type: 'list' as ScreenType,
    children: subs.map((sub) => ({
      id: `studio-${slugify(category)}-${slugify(sub)}`,
      label: sub,
      type: 'list' as ScreenType,
    })),
  }));
}

export type GroupBgToken =
  | 'bg-qb-navy'
  | 'bg-qb-teal'
  | 'bg-qb-maroon'
  | 'bg-qb-green'
  | 'bg-qb-purple'
  | 'bg-qb-orange'
  | 'bg-error'
  | 'bg-primary';

export interface ScreenItem {
  id: string;
  label: string;
  type: ScreenType;
  badge?: number;
  /**
   * Routable but not shown in the sidebar — opened by an icon or an
   * action instead (the create wizard, Preview, View product page,
   * My orders). findScreen/screensOf still resolve hidden items, so
   * tabs and navigation keep working; the sidebar filters them out.
   */
  hidden?: boolean;
  /** Nested sub-screens rendered indented beneath this item. */
  children?: ScreenItem[];
  /** Backing table for DB-registered screens (platform_feature_tree_
   *  coverage), carried through the nav merge so list screens without a
   *  hand-written config can serve their table's rows generically. */
  backingTable?: string | null;
  /** The screen's full id in /api/v1/nav (e.g. settings-system--integrations).
   *  The merge may rename `id` to the short slug; generic list screens must
   *  still ask /api/list-rows for the full nav id, which is the key the
   *  generic fallback resolves against the feature tree. */
  dbId?: string;
}

export interface ScreenWithGroup extends ScreenItem {
  group: string;
}

export interface DomainGroup {
  name: string;
  icon: string;
  bg: GroupBgToken;
  screens: ScreenItem[];
  /** Alert-styled count badge (e.g. My orders = 1 awaiting). */
  badge?: number;
}

export interface DomainConfig {
  label: string;
  icon: string;
  groups: DomainGroup[];
}

export type DomainKey =
  | 'dashboard'
  | 'marketing'
  | 'catalog'
  | 'design'
  | 'orders'
  | 'inventory'
  | 'finance'
  | 'contacts'
  | 'support'
  | 'settings'
  | 'reports'
  | 'staff'
  | 'connected-suppliers'
  // DB-driven modules (platform_feature_tree_coverage) — one domain
  // carries one module. crm merges into 'contacts', studio into
  // 'design' (see DOMAIN_ALIASES in useTenantNav); every other DB
  // domain gets its own key so mergeDbDomains never drops it.
  | 'advertising'
  | 'business_tax'
  | 'cap_table'
  | 'community'
  | 'learning'
  | 'marketplace'
  | 'payroll'
  | 'platform'
  | 'sales_tax'
  | 'social'
  | 'tasks'
  | 'time';

export const DOMAINS: Record<DomainKey, DomainConfig> = {
  dashboard: {
    label: 'Dashboard',
    icon: 'dashboard',
    groups: [
      {
        name: 'Overview',
        icon: 'play_circle',
        bg: 'bg-qb-navy',
        screens: [
          { id: 'ops', label: 'Dashboard', type: 'overview' },
          { id: 'tasks', label: 'Tasks & Projects', type: 'wizard' },
        ],
      },
    ],
  },
  marketing: {
    label: 'Marketing',
    icon: 'campaign',
    groups: [
      {
        name: 'Social Publishing',
        icon: 'play_circle',
        bg: 'bg-qb-navy',
        screens: [
          { id: 'mkt-publishing-overview', label: 'Publishing Overview', type: 'overview' },
          { id: 'mkt-create-content', label: 'Create Content', type: 'wizard' },
          { id: 'mkt-oversight', label: 'Oversight', type: 'list' },
          { id: 'mkt-social-channels', label: 'Social Channels', type: 'list' },
          { id: 'mkt-social-queue', label: 'Publishing Queue', type: 'list' },
          { id: 'mkt-social-calendar', label: 'Social Calendar', type: 'list' },
          { id: 'mkt-social-library', label: 'Content Library', type: 'list' },
          { id: 'mkt-social-performance', label: 'Social Performance', type: 'list' },
        ],
      },
      {
        name: 'Promotions',
        icon: 'sell',
        bg: 'bg-qb-teal',
        screens: [
          { id: 'mkt-promotions', label: 'Promotions & Discounts', type: 'list' },
        ],
      },
      {
        name: 'Newsletter',
        icon: 'mail',
        bg: 'bg-qb-maroon',
        screens: [
          { id: 'mkt-newsletter', label: 'Newsletter Campaigns', type: 'list' },
        ],
      },
      {
        name: 'Automation',
        icon: 'bolt',
        bg: 'bg-qb-green',
        screens: [
          { id: 'mkt-automation', label: 'Automation', type: 'list' },
          { id: 'mkt-sequences', label: 'Sequences', type: 'list' },
        ],
      },
      {
        name: 'Webforms',
        icon: 'dynamic_form',
        bg: 'bg-qb-navy',
        screens: [
          { id: 'mkt-webforms', label: 'Webforms', type: 'list' },
        ],
      },
      {
        name: 'Advertising',
        icon: 'campaign',
        bg: 'bg-primary',
        screens: [
          { id: 'mkt-adcenter', label: 'Ad Center', type: 'overview' },
          { id: 'mkt-campaigns', label: 'Campaigns', type: 'list' },
          { id: 'mkt-adsets', label: 'Ad Sets', type: 'list' },
          { id: 'mkt-creatives', label: 'Creatives', type: 'list' },
          { id: 'mkt-audiences', label: 'Audiences', type: 'list' },
          { id: 'mkt-pixels', label: 'Pixels', type: 'list' },
          { id: 'mkt-adspend', label: 'Ad Spend & Finance', type: 'list' },
          { id: 'mkt-advertisers', label: 'Advertisers', type: 'list' },
        ],
      },
      // CMS & Banners moved to Settings > Website / CMS
    ],
  },
  catalog: {
    label: 'Catalog',
    icon: 'inventory_2',
    groups: [
      {
        name: 'Catalog Overview',
        icon: 'play_circle',
        bg: 'bg-qb-navy',
        screens: [{ id: 'catalog-overview', label: 'Overview', type: 'overview' }],
      },
      {
        name: 'Products & Variants',
        icon: 'checkroom',
        bg: 'bg-qb-green',
        screens: [
          { id: 'products', label: 'Products', type: 'list' },
          { id: 'blanks', label: 'Blanks', type: 'list' },
          { id: 'listings', label: 'Listings', type: 'list' },
          { id: 'published-skus', label: 'Published Items & SKUs', type: 'list' },
          { id: 'bundles', label: 'Bundles', type: 'list' },
          { id: 'categories', label: 'Categories', type: 'list' },
          { id: 'catalog-parties', label: 'Suppliers / Vendors / Sellers', type: 'list' },
          // Blanks is its own screen (SHIP-IT__250): the staff-side list
          // over /api/v1/blanks. Catalog items is a view on the same
          // table. The DB nav merge drops their DB rows too
          // (see CATALOG_DROP_SLUGS in useTenantNav).
        ],
      },
      {
        name: 'Channels',
        icon: 'hub',
        bg: 'bg-qb-teal',
        screens: [
          {
            id: 'ecommerce',
            label: 'Ecommerce',
            type: 'list',
            children: [
              { id: 'shopify', label: 'Shopify', type: 'list' },
              { id: 'tiktok', label: 'TikTok', type: 'list' },
              { id: 'amazon', label: 'Amazon', type: 'list' },
              { id: 'facebook-marketplace', label: 'Facebook Marketplace', type: 'list' },
              { id: 'whatnot', label: 'What Not', type: 'list' },
              { id: 'etsy', label: 'Etsy', type: 'list' },
              { id: 'ebay', label: 'Ebay', type: 'list' },
            ],
          },
        ],
      },
    ],
  },
  // ── DESIGN STUDIO (executive decision: promoted out of Catalog as its own domain) ──
  // Sidebar spec (upload/canvas.html + pasted_image_1793940317924.png):
  //   New design (canvas) is the first child of Studio — when clicked it opens
  //   the canvas screen with toolbar buttons (Upload/AI/Add text/…).
  //   Studio tools open the right-rail inspector inside the canvas screen;
  //   no visible "drawer" tag. Collection & Published are folded under
  //   My library as child screens. Catalog children = studio-eligible
  //   products from the global catalog, by department.
  design: {
    label: 'Design Studio',
    icon: 'apparel',
    groups: [
      // ── STUDIO (the only studio group) ──
      // New design (canvas) is the parent. Its children are the studio
      // dock tools — Upload, Images, Graphics, Add text, AI, Product
      // details, Layouts, Files, Themes, Settings. Each opens its own
      // dock panel on the canvas. No separate "Design" group — these
      // ARE the studio's children.
      {
        name: 'Studio',
        icon: 'palette',
        bg: 'bg-qb-purple',
        screens: [
          {
            id: 'new-design',
            label: 'New design',
            type: 'wizard',
            children: [
              { id: 'studio-upload', label: 'Upload', type: 'drawer' },
              { id: 'studio-images', label: 'Images', type: 'drawer' },
              {
                id: 'studio-graphics',
                label: 'Graphics',
                type: 'drawer',
                children: [
                  { id: 'studio-templates', label: 'Templates', type: 'drawer' },
                  { id: 'studio-shapes', label: 'Shapes', type: 'drawer' },
                ],
              },
              { id: 'studio-add-text', label: 'Add text', type: 'drawer' },
              { id: 'studio-ai', label: 'AI', type: 'drawer' },
              {
                id: 'studio-product-details',
                label: 'Product details',
                type: 'drawer',
                children: [
                  { id: 'studio-layers', label: 'Layers', type: 'drawer' },
                ],
              },
              { id: 'studio-layouts', label: 'Layouts', type: 'drawer' },
              {
                id: 'studio-files',
                label: 'Files',
                type: 'drawer',
                children: [
                  { id: 'studio-shutterstock', label: 'Shutterstock', type: 'drawer' },
                ],
              },
              { id: 'studio-themes', label: 'Themes', type: 'drawer' },
              {
                id: 'studio-settings',
                label: 'Settings',
                type: 'drawer',
                children: [
                  { id: 'studio-show-grid', label: 'Show grid', type: 'drawer' },
                  { id: 'studio-show-guides', label: 'Show guides', type: 'drawer' },
                  { id: 'studio-show-bleeds', label: 'Show bleeds', type: 'drawer' },
                  { id: 'studio-show-rulers', label: 'Show rulers', type: 'drawer' },
                  { id: 'studio-units', label: 'Units', type: 'drawer' },
                  {
                    id: 'studio-background-color',
                    label: 'Background color',
                    type: 'drawer',
                    children: [
                      { id: 'studio-bg-none', label: 'No background', type: 'drawer' },
                      { id: 'studio-bg-palette', label: 'Pick from palette', type: 'drawer' },
                      { id: 'studio-bg-custom', label: 'Create custom color', type: 'drawer' },
                    ],
                  },
                  { id: 'studio-reset-settings', label: 'Reset settings to default', type: 'drawer' },
                ],
              },
            ],
          },
          // Preview + product page are NOT in the sidebar UI — they're only
          // reachable via create-actions (canvas Preview button, card click).
          // Marked hidden so SideRail skips them, but findScreen() still
          // resolves them (the navigation needs that to open the tab).
          { id: 'design-preview', label: 'Preview', type: 'wizard', hidden: true },
          { id: 'product-page', label: 'Product page', type: 'wizard', hidden: true },
          // Tech packs + RFQs — the free-hand design studio's production
          // documents (tech_pack_editor.html, tech_pack_preview.html,
          // design_studio_rfq_board.html). Lists are visible; the editor,
          // preview and board open from row actions.
          { id: 'freehand-designer', label: 'Freehand designer', type: 'wizard' },
          { id: 'tech-packs', label: 'Tech packs', type: 'list' },
          { id: 'rfqs', label: 'RFQs', type: 'list' },
          { id: 'tech-pack-editor', label: 'Tech pack editor', type: 'wizard', hidden: true },
          { id: 'tech-pack-preview', label: 'Tech pack preview', type: 'wizard', hidden: true },
          // Studio design preview (design_preview.html) — the design's
          // mockup pipeline + tech pack document + downstream chain in one
          // screen. Hidden; opens from the designer's Preview drawer and
          // the tech pack editor.
          { id: 'studio-design-preview', label: 'Design preview', type: 'wizard', hidden: true },
          { id: 'rfq-board', label: 'RFQ board', type: 'wizard', hidden: true },
          // The Product Catalog (upload/product cards.html) — the one shared
          // catalog page. Hidden from the sidebar (the Catalog group's tree
          // entries land on it); routable so tabs/back-navigation work.
          { id: 'product-catalog', label: 'Product Catalog', type: 'list', hidden: true },
        ],
      },
      // My library = ITS OWN GROUP (own icon, own chevron, own dropdown of
      // tools). NOT under Studio. Children: My collections, My templates.
      {
        name: 'My library',
        icon: 'folder_special',
        bg: 'bg-qb-orange',
        screens: [
          {
            id: 'studio-my-library',
            label: 'My library',
            type: 'drawer',
            children: [
              { id: 'studio-my-collections', label: 'My collections', type: 'list' },
              { id: 'studio-my-templates', label: 'My templates', type: 'drawer' },
            ],
          },
        ],
      },
      // (4) Catalog = parent-child accordion mirroring TOP_NAV top-level
      //     categories. Each category has its subcategories as children.
      {
        name: 'Catalog',
        icon: 'grid_view',
        bg: 'bg-qb-teal',
        screens: [
          ...buildDesignCatalogScreens(),
        ],
      },
      // (5) My products = Published table + My Stores + My orders.
      {
        name: 'My products',
        icon: 'layers',
        bg: 'bg-qb-green',
        screens: [
          { id: 'studio-published', label: 'Published', type: 'list' },
          { id: 'studio-hidden', label: 'Hidden', type: 'list' },
          { id: 'studio-my-stores', label: 'My Stores', type: 'list' },
          { id: 'studio-my-orders', label: 'My orders', type: 'list' },
        ],
      },
    ],
  },
  orders: {
    label: 'Orders',
    icon: 'local_shipping',
    groups: [
      {
        name: 'Overview',
        icon: 'play_circle',
        bg: 'bg-qb-navy',
        screens: [{ id: 'orders-overview', label: 'Overview', type: 'overview' }],
      },
      {
        name: 'Order Management',
        icon: 'assignment',
        bg: 'bg-qb-teal',
        screens: [
          { id: 'orders', label: 'Orders', type: 'list' },
          { id: 'order-detail', label: 'Order detail', type: 'list' },
          { id: 'packing-slip', label: 'Packing slip', type: 'list' },
          { id: 'order-issues', label: 'Order Issues (Manual Push / Needs Attention)', type: 'list' },
          { id: 'shipping-settings', label: 'Shipping settings', type: 'list' },
        ],
      },
      {
        name: 'Purchasing',
        icon: 'shopping_bag',
        bg: 'bg-qb-maroon',
        screens: [
          { id: 'purchase-orders', label: 'Purchase orders', type: 'list' },
          { id: 'inventory', label: 'Inventory', type: 'list' },
          { id: 'fulfillment-queue', label: 'Fulfillment Queue', type: 'list' },
          { id: 'batch-slips', label: 'Batch slips & labels', type: 'list' },
        ],
      },
      {
        name: 'Returns',
        icon: 'assignment_return',
        bg: 'bg-error',
        screens: [{ id: 'returns', label: 'Returns & Claims', type: 'list' }],
      },
    ],
  },
  // ── INVENTORY (module 3 spec: Purchasing & Inventory) ──
  // The DB nav (platform_feature_tree_coverage) registers 11 inventory
  // screens; mergeDbDomains drops DB domains whose key is not a DomainKey,
  // so without this static entry the whole inventory domain never rendered
  // in the sidebar — only the orders-domain 'inventory' screen (InventoryView)
  // was reachable. Static ids match the DB ids so the merge dedupes by raw
  // id; the Purchasing-group screen keeps the slug 'inventory' (its DB id is
  // inventory-purchasing--inventory). The orders-domain 'inventory' screen
  // stays as-is — same component, different domain.
  inventory: {
    label: 'Inventory',
    icon: 'inventory_2',
    groups: [
      {
        name: 'Inventory',
        icon: 'inventory_2',
        bg: 'bg-qb-teal',
        screens: [
          { id: 'inventory-stock-on-hand', label: 'Stock on hand', type: 'list' },
          { id: 'inventory-cost-layers', label: 'Cost layers', type: 'list' },
          { id: 'inventory-cycle-counts', label: 'Cycle counts', type: 'list' },
          { id: 'inventory-lots', label: 'Lots', type: 'list' },
          { id: 'inventory-movements', label: 'Movements', type: 'list' },
          { id: 'inventory-reservations', label: 'Reservations', type: 'list' },
          { id: 'inventory-serial-numbers', label: 'Serial numbers', type: 'list' },
          { id: 'inventory-transfers', label: 'Transfers', type: 'list' },
          { id: 'inventory-warehouse-locations', label: 'Warehouse locations', type: 'list' },
          { id: 'inventory-warehouses', label: 'Warehouses', type: 'list' },
        ],
      },
      {
        name: 'Purchasing',
        icon: 'shopping_bag',
        bg: 'bg-qb-maroon',
        screens: [{ id: 'inventory', label: 'Inventory', type: 'list' }],
      },
    ],
  },
  // ── FINANCE (spec: unsaid-component-functionality-spec.md §2–§6) ──
  // Five groups: Accounting, Expenses & Bills, Sales, Business Tax, Cap Table.
  // Cap Table lives INSIDE Finance (executive decision — equity is finance).
  // Receipts is ONE page with two entry points (Accounting = bank-feed
  // companion; Expenses & Bills = capture queue). Add bill [D] and other
  // document containers are reached from their list pages / Create flyout.
  finance: {
    label: 'Finance',
    icon: 'account_balance',
    groups: [
      {
        name: 'Accounting',
        icon: 'play_arrow',
        bg: 'bg-qb-navy',
        screens: [
          { id: 'accounting', label: 'Overview', type: 'overview' },
          { id: 'bank', label: 'Bank transactions', type: 'list' },
          { id: 'receipts', label: 'Receipts', type: 'list' },
          { id: 'reconcile', label: 'Reconcile', type: 'wizard' },
          { id: 'coa', label: 'Chart of accounts', type: 'list' },
          { id: 'cash-flow', label: 'Cash flow', type: 'overview' },
          { id: 'rules', label: 'Rules', type: 'list' },
          { id: 'entities', label: 'Entities', type: 'list' },
          { id: 'liabilities-credit', label: 'Liabilities and credit', type: 'list' },
          { id: 'quick-view', label: 'Quick view', type: 'list' },
        ],
      },
      {
        name: 'Expenses & Bills',
        icon: 'receipt',
        bg: 'bg-qb-green',
        screens: [
          { id: 'bills-overview', label: 'Overview', type: 'overview' },
          { id: 'expenses', label: 'Expense transactions', type: 'list' },
          { id: 'vendors', label: 'Vendors', type: 'list' },
          { id: 'bills', label: 'Bills', type: 'list' },
          { id: 'bill-payments', label: 'Pay bills', type: 'wizard' },
          { id: 'bill-approval-setup', label: 'Bill and payment approval setup', type: 'list' },
          { id: 'contractors', label: 'Contractors', type: 'list' },
          { id: '1099s', label: '1099s', type: 'list' },
          // Same page as Accounting > Receipts — second entry point.
          { id: 'receipts', label: 'Receipts', type: 'list' },
          { id: 'purchase-orders', label: 'Purchase orders', type: 'wizard' },
          { id: 'payroll', label: 'Payroll', type: 'list' },
        ],
      },
      {
        name: 'Sales',
        icon: 'attach_money',
        bg: 'bg-qb-teal',
        screens: [
          { id: 'sales-overview', label: 'Overview', type: 'overview' },
          { id: 'sales-transactions', label: 'Revenue transactions', type: 'list' },
          { id: 'invoices', label: 'Invoices', type: 'list' },
          { id: 'payment-links', label: 'Payment links', type: 'list' },
          { id: 'sales-channels', label: 'Sales channels', type: 'list' },
          { id: 'payouts', label: 'Payouts', type: 'list' },
          { id: 'gift-cards', label: 'Gift cards', type: 'list' },
          { id: 'products', label: 'Products and services', type: 'list' },
          { id: 'subscriptions', label: 'Subscriptions', type: 'list' },
          { id: 'estimates', label: 'Estimates', type: 'list' },
          { id: 'statements', label: 'Statements', type: 'list' },
          { id: 'refunds', label: 'Refunds', type: 'list' },
          { id: 'disputes', label: 'Disputes', type: 'list' },
        ],
      },
      {
        name: 'Business Tax',
        icon: 'description',
        bg: 'bg-qb-maroon',
        screens: [
          { id: 'tax-overview', label: 'Business tax at a glance', type: 'overview' },
          { id: 'tax-return', label: 'Create tax return', type: 'wizard' },
          { id: 'download-tax-summary', label: 'Download tax summary', type: 'list' },
          { id: 'tax-summary', label: 'Tax summary', type: 'list' },
          { id: 'tax-income', label: 'Income from your transactions', type: 'list' },
          { id: 'tax-assets', label: 'Depreciable business assets', type: 'list' },
          { id: 'tax-1099k', label: '1099-K detail', type: 'list' },
          { id: 'payroll-tax', label: 'Payroll tax', type: 'list' },
          { id: 'tax-filing', label: 'Year-end tax filing', type: 'wizard' },
        ],
      },
      {
        name: 'Cap Table',
        icon: 'pie_chart',
        bg: 'bg-primary',
        screens: [
          { id: 'cap-overview', label: 'Overview', type: 'overview' },
          { id: 'cap-table', label: 'Cap table', type: 'list' },
          { id: 'cap-holders', label: 'Stakeholders', type: 'list' },
          { id: 'cap-rounds', label: 'Funding rounds', type: 'list' },
          { id: 'cap-options', label: 'Option pool', type: 'list' },
          { id: 'cap-safes', label: 'SAFEs and convertibles', type: 'list' },
          { id: 'cap-equity-events', label: 'Equity events', type: 'list' },
          { id: 'cap-documents', label: 'Documents', type: 'list' },
          { id: 'cap-dilution', label: 'Dilution modeler', type: 'wizard' },
          { id: 'cap-waterfall', label: 'Liquidation waterfall', type: 'wizard' },
          { id: 'cap-409a', label: '409A and valuations', type: 'list' },
          { id: 'cap-controls', label: 'Controls', type: 'list' },
        ],
      },
    ],
  },
  contacts: {
    label: 'Contacts',
    icon: 'groups',
    groups: [
      {
        name: 'CRM Overview',
        icon: 'play_circle',
        bg: 'bg-qb-navy',
        screens: [{ id: 'crm-overview', label: 'Overview', type: 'overview' }],
      },
      {
        name: 'Parties',
        icon: 'people',
        bg: 'bg-qb-teal',
        screens: [
          { id: 'parties', label: 'Parties', type: 'list' },
          { id: 'customers', label: 'Customer', type: 'list' },
          { id: 'vendors', label: 'Vendors', type: 'list' },
          { id: 'suppliers', label: 'Suppliers', type: 'list' },
        ],
      },
      {
        name: 'CRM Tools',
        icon: 'hub',
        bg: 'bg-qb-green',
        screens: [
          { id: 'leads', label: 'Leads', type: 'list' },
          { id: 'deals', label: 'Deals', type: 'list' },
          { id: 'appointments', label: 'Appointments', type: 'list' },
          { id: 'templates', label: 'Templates', type: 'list' },
        ],
      },
      {
        name: 'Seller relationships',
        icon: 'storefront',
        bg: 'bg-qb-maroon',
        screens: [
          { id: 'sellers', label: 'Sellers', type: 'list' },
          { id: 'seller-detail', label: 'Seller detail', type: 'list' },
          { id: 'seller-profile', label: 'Seller profile', type: 'list' },
          { id: 'seller-feed', label: 'Seller feed', type: 'list' },
          { id: 'seller-onboarding', label: 'Onboarding Queue', type: 'list' },
        ],
      },
    ],
  },
  // Staff (Kim, 2026-11-16): staff are contact parties with an
  // employee role and a different profile view — hours, wages and
  // employee type are associations on the person, never separate
  // pages. One rail icon, one list, one profile.
  staff: {
    label: 'Staff',
    icon: 'badge',
    groups: [
      {
        name: 'Staff',
        icon: 'badge',
        bg: 'bg-qb-navy',
        screens: [
          { id: 'staff', label: 'Staff', type: 'list' },
        ],
      },
    ],
  },
  support: {
    label: 'Support',
    icon: 'support_agent',
    groups: [
      {
        name: 'Support Overview',
        icon: 'play_circle',
        bg: 'bg-qb-navy',
        screens: [{ id: 'support-overview', label: 'Overview', type: 'overview' }],
      },
      {
        name: 'Inbox & Tickets',
        icon: 'inbox',
        bg: 'bg-qb-teal',
        screens: [
          { id: 'tickets', label: 'Tickets', type: 'list' },
          { id: 'agent-workspace', label: 'Agent Workspace', type: 'list' },
          { id: 'messages', label: 'Omnichannel Inbox', type: 'list' },
        ],
      },
      {
        name: 'Queues',
        icon: 'notifications',
        bg: 'bg-qb-maroon',
        screens: [
          { id: 'attention', label: 'Attention Queue', type: 'list', badge: 8 },
          { id: 'customer-queue', label: 'Customer Queue', type: 'list', badge: 8 },
          { id: 'seller-queue', label: 'Seller Queue', type: 'list', badge: 7 },
        ],
      },
      {
        name: 'SLA & Routing',
        icon: 'route',
        bg: 'bg-qb-green',
        screens: [
          { id: 'queues', label: 'Queues', type: 'list' },
          { id: 'sla', label: 'SLA rules', type: 'list' },
          { id: 'automations', label: 'Automations', type: 'list' },
        ],
      },
      {
        name: 'Trust & Safety',
        icon: 'shield',
        bg: 'bg-error',
        screens: [
          { id: 'trust', label: 'Knowledge base', type: 'list' },
          { id: 'help-center', label: 'Help center', type: 'list' },
          { id: 'docs', label: 'Docs', type: 'list' },
          { id: 'policies', label: 'Policies', type: 'list' },
        ],
      },
    ],
  },
  settings: {
    label: 'Settings',
    icon: 'settings',
    groups: [
      // ── Workspace (HTML: unsaid-settings-access.html NAV — opens with cards) ──
      {
        name: 'Workspace',
        icon: 'workspaces',
        bg: 'bg-qb-teal',
        screens: [
          { id: 'ws-home', label: 'Home', type: 'overview' },
          { id: 'ws-general', label: 'General', type: 'list' },
          { id: 'ws-teammates', label: 'Teammates', type: 'list' },
          { id: 'ws-roles', label: 'Roles and permissions', type: 'list' },
          { id: 'ws-external', label: 'External access', type: 'list' },
          { id: 'ws-approvals', label: 'Approvals and limits', type: 'list' },
          { id: 'ws-owners', label: 'Workspace owners', type: 'list' },
          { id: 'ws-hours', label: 'Office hours', type: 'list' },
          { id: 'ws-brands', label: 'Brands', type: 'list' },
          { id: 'ws-security', label: 'Security', type: 'list' },
          { id: 'ws-activity', label: 'Activity log', type: 'list' },
          { id: 'ws-multilingual', label: 'Multilingual', type: 'list' },
          { id: 'ws-mailboxes', label: 'Mailboxes', type: 'list' },
        ],
      },
      // ── Accounting & Finance (HTML) ──
      {
        name: 'Accounting & Finance',
        icon: 'account_balance',
        bg: 'bg-qb-green',
        screens: [
          { id: 'set-coa', label: 'Chart of Accounts', type: 'list' },
          { id: 'set-bank-rules', label: 'Bank Rules', type: 'list' },
          { id: 'set-recurring-templates', label: 'Recurring Templates', type: 'list' },
          { id: 'set-business-tax', label: 'Business Tax', type: 'list' },
          { id: 'set-reports-budgets', label: 'Reports & Budgets', type: 'list' },
          { id: 'set-financial', label: 'Financial Settings', type: 'list' },
        ],
      },
      // ── CRM & Contacts (HTML) ──
      {
        name: 'CRM & Contacts',
        icon: 'groups',
        bg: 'bg-qb-maroon',
        screens: [
          { id: 'set-customer-hub', label: 'Customer Hub', type: 'list' },
          { id: 'set-vendors-suppliers', label: 'Vendors & Suppliers', type: 'list' },
          { id: 'set-segments-lists', label: 'Segments & Lists', type: 'list' },
          { id: 'set-lead-capture', label: 'Lead Capture Forms', type: 'list' },
        ],
      },
      // ── Catalog & Design (HTML) ──
      {
        name: 'Catalog & Design',
        icon: 'palette',
        bg: 'bg-primary',
        screens: [
          { id: 'set-design-studio', label: 'Design Studio', type: 'list' },
          { id: 'set-products-bundles', label: 'Products & Bundles', type: 'list' },
          { id: 'set-pricing-discounts', label: 'Pricing & Discounts', type: 'list' },
          { id: 'set-categories-tags', label: 'Categories & Tags', type: 'list' },
        ],
      },
      // ── Marketing & Social (HTML) ──
      {
        name: 'Marketing & Social',
        icon: 'campaign',
        bg: 'bg-qb-teal',
        screens: [
          { id: 'set-social-channels', label: 'Social Channels', type: 'list' },
          { id: 'set-publishing-queue', label: 'Publishing Queue', type: 'list' },
          { id: 'set-newsletter-email', label: 'Newsletter & Email', type: 'list' },
          { id: 'set-ad-center', label: 'Ad Center', type: 'list' },
          { id: 'set-gmb', label: 'Google My Business', type: 'list' },
        ],
      },
      // ── Website / CMS (moved from Catalog > Channels) ──
      {
        name: 'Website / CMS',
        icon: 'web',
        bg: 'bg-qb-purple',
        screens: [
          { id: 'website-overview', label: 'Overview', type: 'overview' },
          { id: 'website-cms', label: 'Website / CMS', type: 'list' },
          { id: 'banners', label: 'Banners', type: 'list' },
          { id: 'popups', label: 'Popups', type: 'list' },
          { id: 'cms-pages', label: 'CMS pages', type: 'list' },
          { id: 'content-blocks', label: 'Content blocks', type: 'list' },
          { id: 'navigation', label: 'Navigation', type: 'list' },
          { id: 'media', label: 'Media', type: 'list' },
          // CMS editors — hidden; open from list rows and New buttons.
          { id: 'cms-page-editor', label: 'Page editor', type: 'wizard', hidden: true },
          { id: 'cms-banner-editor', label: 'Banner editor', type: 'wizard', hidden: true },
          { id: 'cms-popup-editor', label: 'Popup editor', type: 'wizard', hidden: true },
          { id: 'cms-navigation-editor', label: 'Navigation editor', type: 'wizard', hidden: true },
          { id: 'cms-block-editor', label: 'Block editor', type: 'wizard', hidden: true },
          { id: 'cms-media-library', label: 'Media library', type: 'wizard', hidden: true },
          { id: 'cms-settings', label: 'Website settings', type: 'wizard' },
        ],
      },
      // ── Operations & Orders (HTML) ──
      {
        name: 'Operations & Orders',
        icon: 'local_shipping',
        bg: 'bg-qb-green',
        screens: [
          { id: 'set-fulfillment-shipping', label: 'Fulfillment & Shipping', type: 'list' },
          { id: 'set-inventory-warehouses', label: 'Inventory & Warehouses', type: 'list' },
          { id: 'set-support-channels', label: 'Support Channels', type: 'list' },
          { id: 'set-help-center', label: 'Help Center', type: 'list' },
          { id: 'set-outbound', label: 'Outbound', type: 'list' },
        ],
      },
      // ── EXTENSION: Dashboard & Analytics (not in HTML, gives Dashboard a home) ──
      {
        name: 'Dashboard & Analytics',
        icon: 'dashboard',
        bg: 'bg-qb-navy',
        screens: [
          { id: 'set-dashboards', label: 'Dashboards & widgets', type: 'list' },
          { id: 'set-kpi-targets', label: 'KPI targets', type: 'list' },
          { id: 'set-analytics-config', label: 'Analytics configuration', type: 'list' },
        ],
      },
      // ── EXTENSION: Support (not in HTML, gives Support domain a home) ──
      {
        name: 'Support',
        icon: 'support_agent',
        bg: 'bg-qb-maroon',
        screens: [
          { id: 'set-ticket-channels', label: 'Ticket channels', type: 'list' },
          { id: 'set-sla-policies', label: 'SLA policies', type: 'list' },
          { id: 'set-automation-rules', label: 'Automation rules', type: 'list' },
          { id: 'set-kb-config', label: 'Knowledge base', type: 'list' },
        ],
      },
      // ── EXTENSION: Connected Suppliers (not in HTML, gives pillar #8 a home) ──
      {
        name: 'Connected Suppliers',
        icon: 'hub',
        bg: 'bg-qb-teal',
        screens: [
          { id: 'set-supplier-portal', label: 'Supplier portal', type: 'list' },
          { id: 'set-integration-feeds', label: 'Integration feeds', type: 'list' },
          { id: 'set-contracts-config', label: 'Contracts & pricing', type: 'list' },
          { id: 'set-compliance-config', label: 'Compliance & 1099', type: 'list' },
        ],
      },
      // ── EXTENSION: Reports (not in HTML, gives Reports domain a home) ──
      {
        name: 'Reports',
        icon: 'assessment',
        bg: 'bg-primary',
        screens: [
          { id: 'set-report-templates', label: 'Report templates', type: 'list' },
          { id: 'set-scheduled-reports', label: 'Scheduled reports', type: 'list' },
          { id: 'set-report-dashboards', label: 'Report dashboards', type: 'list' },
        ],
      },
      // ── System & Personal (HTML) ──
      {
        name: 'System & Personal',
        icon: 'dns',
        bg: 'bg-error',
        screens: [
          { id: 'set-integrations', label: 'Integrations', type: 'list' },
          { id: 'set-data-privacy', label: 'Data & Privacy', type: 'list' },
          { id: 'set-notifications', label: 'Notifications', type: 'list' },
          { id: 'set-api-tokens', label: 'API Tokens', type: 'list' },
          { id: 'set-audit', label: 'Audit log', type: 'list' },
        ],
      },
    ],
  },
  // Reports — a standalone, cross-module view (NOT tied to accounting/finance).
  // Accessed only via the pinned Reports button in the icon rail. Broken down
  // by every module so each domain's reports live in their own group.
  reports: {
    label: 'Reports',
    icon: 'assessment',
    groups: [
      {
        name: 'Overview',
        icon: 'play_circle',
        bg: 'bg-qb-navy',
        screens: [{ id: 'reports-overview', label: 'Overview', type: 'overview' }],
      },
      {
        name: 'Analytics',
        icon: 'bar_chart',
        bg: 'bg-qb-teal',
        screens: [
          { id: 'analytics', label: 'Analytics', type: 'overview' },
          { id: 'explorer', label: 'Explorer', type: 'list' },
        ],
      },
      {
        name: 'Dashboard reports',
        icon: 'dashboard',
        bg: 'bg-qb-teal',
        screens: [
          { id: 'report-ops-vitals', label: 'Operations Vitals report', type: 'list' },
          { id: 'report-exec-gmv', label: 'Executive GMV & Margins report', type: 'list' },
          { id: 'report-analytics', label: 'Analytics report', type: 'list' },
        ],
      },
      {
        name: 'Contacts reports',
        icon: 'groups',
        bg: 'bg-qb-green',
        screens: [
          { id: 'report-customers', label: 'Customers report', type: 'list' },
          { id: 'report-vendors', label: 'Vendors report', type: 'list' },
          { id: 'report-suppliers', label: 'Suppliers report', type: 'list' },
          { id: 'report-leads', label: 'Leads & pipeline report', type: 'list' },
        ],
      },
      {
        name: 'Catalog reports',
        icon: 'inventory_2',
        bg: 'bg-qb-maroon',
        screens: [
          { id: 'report-products', label: 'Products & SKUs report', type: 'list' },
          { id: 'report-bundles', label: 'Bundles report', type: 'list' },
          { id: 'report-channels', label: 'Channel performance report', type: 'list' },
          { id: 'report-designs', label: 'Designs & collections report', type: 'list' },
        ],
      },
      {
        name: 'Orders reports',
        icon: 'local_shipping',
        bg: 'bg-primary',
        screens: [
          { id: 'report-orders', label: 'Orders report', type: 'list' },
          { id: 'report-fulfillment', label: 'Fulfillment report', type: 'list' },
          { id: 'report-inventory', label: 'Inventory report', type: 'list' },
          { id: 'report-returns', label: 'Returns & claims report', type: 'list' },
        ],
      },
      {
        name: 'Finance reports',
        icon: 'account_balance',
        bg: 'bg-qb-navy',
        screens: [
          { id: 'report-invoices', label: 'Invoices report', type: 'list' },
          { id: 'report-bills', label: 'Bills & expenses report', type: 'list' },
          { id: 'report-tax', label: 'Tax summary report', type: 'list' },
          { id: 'report-reconcile', label: 'Reconciliation report', type: 'list' },
        ],
      },
      {
        name: 'Marketing reports',
        icon: 'campaign',
        bg: 'bg-qb-teal',
        screens: [
          { id: 'report-social', label: 'Social performance report', type: 'list' },
          { id: 'report-promotions', label: 'Promotions report', type: 'list' },
          { id: 'report-newsletter', label: 'Newsletter report', type: 'list' },
          { id: 'report-cms', label: 'CMS & editorial report', type: 'list' },
        ],
      },
      {
        name: 'Support reports',
        icon: 'support_agent',
        bg: 'bg-qb-green',
        screens: [
          { id: 'report-tickets', label: 'Tickets report', type: 'list' },
          { id: 'report-sla', label: 'SLA report', type: 'list' },
          { id: 'report-trust', label: 'Trust & safety report', type: 'list' },
        ],
      },
    ],
  },
  // Connected Suppliers — standalone pillar #8 in the Navigation Hub flyout.
  // NOT in the PINNED icon rail; accessed only via the flyout. Unified view
  // of the supply-chain partner network: directory, integration feeds,
  // onboarding, contracts, and compliance.
  learning: {
    label: 'Learning',
    icon: 'school',
    groups: [
      {
        name: 'Training',
        icon: 'school',
        bg: 'bg-qb-navy',
        screens: [
          { id: 'lms-courses', label: 'Courses', type: 'overview' },
        ],
      },
    ],
  },
  'connected-suppliers': {
    label: 'Connected Suppliers',
    icon: 'hub',
    groups: [
      {
        name: 'Overview',
        icon: 'play_circle',
        bg: 'bg-qb-navy',
        screens: [{ id: 'suppliers-overview', label: 'Overview', type: 'overview' }],
      },
      {
        name: 'Supplier Directory',
        icon: 'groups',
        bg: 'bg-qb-teal',
        screens: [
          { id: 'suppliers-directory', label: 'All suppliers', type: 'list' },
          { id: 'suppliers-vendors', label: 'Vendors', type: 'list' },
          { id: 'suppliers-sellers', label: 'Sellers', type: 'list' },
        ],
      },
      {
        name: 'Integration Feeds',
        icon: 'extension',
        bg: 'bg-qb-green',
        screens: [
          { id: 'feed-printful', label: 'Printful API', type: 'list' },
          { id: 'feed-printify', label: 'Printify Network', type: 'list' },
          { id: 'feed-gelato', label: 'Gelato Global', type: 'list' },
          { id: 'feed-stripe', label: 'Stripe Connect & Clearing', type: 'list' },
          { id: 'feed-receipts', label: 'Receipts Intake (OCR)', type: 'list' },
        ],
      },
      {
        name: 'Onboarding',
        icon: 'how_to_reg',
        bg: 'bg-qb-maroon',
        screens: [
          { id: 'onboarding-vendor-portal', label: 'Vendor portal', type: 'list' },
          { id: 'onboarding-requests', label: 'Onboarding requests', type: 'list' },
          { id: 'onboarding-approvals', label: 'Approvals', type: 'list' },
        ],
      },
      {
        name: 'Contracts & Pricing',
        icon: 'handshake',
        bg: 'bg-primary',
        screens: [
          { id: 'contracts', label: 'Contracts', type: 'list' },
          { id: 'pricing-tiers', label: 'Pricing tiers', type: 'list' },
          { id: 'terms', label: 'Terms & SLAs', type: 'list' },
        ],
      },
      {
        name: 'Compliance',
        icon: 'verified',
        bg: 'bg-error',
        screens: [
          { id: 'compliance-certifications', label: 'Certifications', type: 'list' },
          { id: 'compliance-1099', label: '1099 / Tax', type: 'list' },
          { id: 'compliance-audit', label: 'Audit trail', type: 'list' },
        ],
      },
    ],
  },
  // ── DB-driven modules: one domain carries one module. Groups are
  // filled from /api/v1/nav by mergeDbDomains; the empty groups array
  // below is only the static seed so the key exists in the type.
  advertising: { label: 'Advertising', icon: 'campaign', groups: [] },
  business_tax: { label: 'Business Tax', icon: 'receipt_long', groups: [] },
  cap_table: { label: 'Cap Table', icon: 'pie_chart', groups: [] },
  community: {
    label: 'Community',
    icon: 'forum',
    groups: [
      // Per SHIP-IT — Community, Reviews & UGC: the moderation queue is a
      // Community-module workspace (approve/remove), alongside the DB
      // screens for Posts · Comments · Media · Trust & safety.
      {
        name: 'Moderation',
        icon: 'fact_check',
        bg: 'bg-qb-purple',
        screens: [
          { id: 'ugc-moderation', label: 'UGC Moderation', type: 'list' },
        ],
      },
    ],
  },
  // (the full Learning entry with the LMS Courses screen lives above,
  //  beside connected-suppliers — this stub line intentionally removed)
  marketplace: { label: 'Marketplace', icon: 'storefront', groups: [] },
  payroll: { label: 'Payroll', icon: 'payments', groups: [] },
  platform: { label: 'Platform', icon: 'hub', groups: [] },
  sales_tax: { label: 'Sales Tax', icon: 'calculate', groups: [] },
  social: { label: 'Social', icon: 'share', groups: [] },
  tasks: { label: 'Tasks', icon: 'task', groups: [] },
  time: { label: 'Time', icon: 'schedule', groups: [] },
};

export const PINNED: DomainKey[] = [
  'dashboard',
  'contacts',
  'staff',
  'catalog',
  'design',
  'orders',
  'finance',
  'marketing',
  'support',
];

export function screensOf(domain: DomainConfig): ScreenWithGroup[] {
  return domain.groups.flatMap((g) =>
    g.screens.flatMap((s) => [
      { ...s, group: g.name },
      ...(s.children ?? []).map((c) => ({ ...c, group: g.name })),
    ])
  );
}

/** Total screens in a group — nested children included, hidden excluded. */
export function groupScreenCount(group: DomainGroup): number {
  return group.screens.reduce(
    (n, s) => n + (s.hidden ? 0 : 1 + (s.children ?? []).filter((c) => !c.hidden).length),
    0,
  );
}

export function findScreen(domainId: DomainKey, screenId: string): ScreenWithGroup {
  const all = screensOf(DOMAINS[domainId]);
  const found = all.find((s) => s.id === screenId);
  if (found) return found;
  // Real-tree catalog path screens (studio-apparel--women--t-shirts) are not
  // in the static tree — resolve from the registry the UI fills when the
  // live /api/v1/categories tree loads, with a prettified fallback.
  if (domainId === 'design' && screenId.startsWith('studio-') && screenId.includes('--')) {
    const names = catalogPaths.get(screenId);
    return {
      id: screenId,
      label: names ? names[names.length - 1] : prettifySlugSlug(screenId),
      type: 'list',
      group: 'Catalog',
    };
  }
  // DB-driven domains seed with empty groups — never return undefined.
  if (all.length === 0) {
    return { id: screenId, label: prettifySlugSlug(screenId), type: 'list', group: '' };
  }
  return all[0];
}

export const SCREEN_HEADERS: Record<
  string,
  { title: string; subtitle: string; family: string; newLabel: string }
> = {
  invoices: { title: 'Invoices', subtitle: 'All invoices across customers.', family: 'sales', newLabel: 'Invoice' },
  expenses: { title: 'Expense transactions', subtitle: 'Bills, expenses, checks, credits.', family: 'expense', newLabel: 'Expense' },
  bills: { title: 'Bills', subtitle: 'Vendor bills — For review / Unpaid / Paid.', family: 'expense', newLabel: 'Bill' },
  customers: { title: 'Customers', subtitle: 'Party list — role=Customer.', family: 'party', newLabel: 'Customer' },
  vendors: { title: 'Vendors', subtitle: 'Party list — role=Vendor.', family: 'party', newLabel: 'Vendor' },
  products: { title: 'Products and services', subtitle: 'Catalog — same list as Catalog > Products.', family: 'catalog', newLabel: 'Product' },
  sales_transactions: { title: 'Revenue transactions', subtitle: 'Every sale and payment received.', family: 'sales', newLabel: 'Sale' },
  bank: { title: 'Bank transactions', subtitle: 'For review feed + Rules.', family: 'banking', newLabel: 'Deposit' },
  coa: { title: 'Chart of accounts', subtitle: 'Number, Name, Type, Balance.', family: 'accounting', newLabel: 'Account' },
  reports: { title: 'Reports', subtitle: 'Standard + custom reports.', family: 'reports', newLabel: 'Report' },
  products_services: { title: 'Products and services', subtitle: 'Same list as Finance.', family: 'catalog', newLabel: 'Product' },
  payment_links: { title: 'Payment links', subtitle: 'Share link or QR.', family: 'sales', newLabel: 'Payment link' },
  estimates: { title: 'Estimates', subtitle: 'Convert to Invoice.', family: 'sales', newLabel: 'Estimate' },
  statements: { title: 'Statements', subtitle: 'Batch billing summary.', family: 'sales', newLabel: 'Statement' },
  receipts: { title: 'Receipts', subtitle: 'Intake inbox — forward, drop, snap.', family: 'intake', newLabel: 'Receipt' },
  reconcile: { title: 'Reconcile', subtitle: 'Setup, then tie-out workspace.', family: 'wizard', newLabel: 'Reconcile' },
  rules: { title: 'Rules', subtitle: 'Bank rules.', family: 'accounting', newLabel: 'Rule' },
  tax_summary: { title: 'Tax summary', subtitle: 'Income / deductions / assets.', family: 'tax', newLabel: 'Tax summary' },
  tax_filing: { title: 'Year-end tax filing', subtitle: 'Feature-gated page.', family: 'tax', newLabel: 'File' },
  bill_payments: { title: 'Pay bills', subtitle: 'Pay bills workspace.', family: 'expense', newLabel: 'Payment' },
  trust: { title: 'Trust & Safety', subtitle: 'Inspection and enforcement.', family: 'support', newLabel: 'Case' },
  entities: { title: 'Entities', subtitle: 'Legal businesses under the workspace.', family: 'accounting', newLabel: 'Entity' },
  liabilities_credit: { title: 'Liabilities and credit', subtitle: 'Credit cards, lines of credit, loans.', family: 'banking', newLabel: 'Liability' },
  quick_view: { title: 'Quick view', subtitle: 'Report shortcuts with customize + Save view.', family: 'reports', newLabel: 'Report' },
  cash_flow: { title: 'Cash flow', subtitle: 'Money in, money out, projected balance.', family: 'accounting', newLabel: 'Cash flow' },
  bill_approval_setup: { title: 'Bill and payment approval setup', subtitle: 'Who approves bills and payments.', family: 'expense', newLabel: 'Approval rule' },
  contractors: { title: 'Contractors', subtitle: 'Invites, W-9s, 1099 tracking.', family: 'party', newLabel: 'Contractor' },
  '1099s': { title: '1099s', subtitle: 'Contractors over the threshold.', family: 'tax', newLabel: '1099' },
  payroll: { title: 'Payroll', subtitle: 'Pay periods, runs, forms.', family: 'expense', newLabel: 'Payroll run' },
  sales_channels: { title: 'Sales channels', subtitle: 'Connected channels and their sync.', family: 'sales', newLabel: 'Channel' },
  payouts: { title: 'Payouts', subtitle: 'Processor payouts and clearing.', family: 'sales', newLabel: 'Payout' },
  gift_cards: { title: 'Gift cards', subtitle: 'Issue, balance, redemption.', family: 'sales', newLabel: 'Gift card' },
  subscriptions: { title: 'Subscriptions', subtitle: 'Plans, subscribers, next charges.', family: 'sales', newLabel: 'Subscription' },
  refunds: { title: 'Refunds', subtitle: 'Against orders and invoices.', family: 'sales', newLabel: 'Refund' },
  disputes: { title: 'Disputes', subtitle: 'Chargebacks from the processor.', family: 'sales', newLabel: 'Dispute' },
  tax_return: { title: 'Create tax return', subtitle: 'From the year\u2019s books.', family: 'tax', newLabel: 'Return' },
  download_tax_summary: { title: 'Download tax summary', subtitle: 'PDF for the accountant.', family: 'tax', newLabel: 'Summary' },
  tax_income: { title: 'Income from your transactions', subtitle: 'Income grouped by tax category.', family: 'tax', newLabel: 'Category' },
  tax_assets: { title: 'Depreciable business assets', subtitle: 'Cost, class, depreciation to date.', family: 'tax', newLabel: 'Asset' },
  tax_1099k: { title: '1099-K detail', subtitle: 'Seller payment totals by processor.', family: 'tax', newLabel: '1099-K' },
  payroll_tax: { title: 'Payroll tax', subtitle: 'Quarterly liabilities and forms.', family: 'tax', newLabel: 'Quarter' },
};

export type DemoRow = Record<string, string | number>;

// DEMO_ROWS is intentionally EMPTY. It used to hold ~1,000 lines of
// invented rows (Acme Corp invoices, Gildan/SanMar catalog products,
// fake orders, fake tax rows) that the generic list screens rendered as
// if they were real records. A screen with no wired component now shows
// its honest empty state instead of fake data. Do not re-seed this.
export const DEMO_ROWS: Record<string, DemoRow[]> = {}

export interface ColumnDef {
  key: string;
  label: string;
  right?: boolean;
}

export interface ListScreenConfig {
  mode: 'list';
  key: string;
  title: string;
  subtitle: string;
  family: string;
  newLabel: string;
  tabs?: string[];
  cols: ColumnDef[];
  createActionsRow?: [string, string][];
  emptyTitle?: string;
  emptySteps?: string;
}

export interface OverviewKpi {
  label: string;
  value: string;
  delta?: string;
  /** Nav screen the tile opens (click-through to the backing list). */
  screen?: string;
}

export interface OverviewScreenConfig {
  mode: 'overview';
  title: string;
  subtitle: string;
  kpis?: OverviewKpi[];
  actions?: [string, string][];
  panelTitle?: string;
  panelText?: string;
  /** GET endpoint returning { data: { kpis: [{ label, value, delta?, screen? }] } }
   *  — live values replace the static kpis above once it resolves. */
  kpiEndpoint?: string;
}

export type ScreenDefinition = ListScreenConfig | OverviewScreenConfig;

export const SCREEN_DEFS: Record<string, ScreenDefinition> = {
  queues: {
    mode: 'list',
    key: 'queues',
    title: 'Queues',
    subtitle: 'Named ticket queues and their filters.',
    family: 'support',
    newLabel: 'Queue',
    tabs: ['All', 'Shared'],
    cols: [
      { key: 'name', label: 'Queue' },
      { key: 'owner', label: 'Owner' },
      { key: 'shared', label: 'Shared' },
    ],
    emptyTitle: 'No queues yet',
    emptySteps: 'Queues group tickets by filter — customer, seller, attention, disputes.',
  },
  sla: {
    mode: 'list',
    key: 'sla',
    title: 'SLA rules',
    subtitle: 'First response, next reply and resolution targets.',
    family: 'support',
    newLabel: 'SLA policy',
    tabs: ['All', 'Active'],
    cols: [
      { key: 'name', label: 'Policy' },
      { key: 'first', label: 'First response' },
      { key: 'reply', label: 'Next reply' },
      { key: 'resolution', label: 'Resolution' },
      { key: 'status', label: 'Status' },
    ],
    emptyTitle: 'No SLA policies yet',
    emptySteps: 'SLA policies set the clocks that run on every ticket.',
  },
  automations: {
    mode: 'list',
    key: 'automations',
    title: 'Automations',
    subtitle: 'Trigger-driven ticket automations.',
    family: 'support',
    newLabel: 'Automation',
    tabs: ['All', 'Active'],
    cols: [
      { key: 'name', label: 'Automation' },
      { key: 'trigger', label: 'Trigger' },
      { key: 'status', label: 'Status' },
    ],
    emptyTitle: 'No automations yet',
    emptySteps: 'Automations run actions when ticket events fire.',
  },
  trust: {
    mode: 'list',
    key: 'trust',
    title: 'Knowledge base',
    subtitle: 'Every help article, draft and published.',
    family: 'support',
    newLabel: 'Article',
    tabs: ['All', 'Published', 'Draft'],
    cols: [
      { key: 'title', label: 'Article' },
      { key: 'collection', label: 'Collection' },
      { key: 'audience', label: 'Audience' },
      { key: 'status', label: 'Status' },
      { key: 'usage', label: 'Used', right: true },
    ],
    emptyTitle: 'No articles yet',
    emptySteps: 'Knowledge base articles power agent suggestions and the help center.',
  },
  help_center: {
    mode: 'list',
    key: 'help-center',
    title: 'Help center',
    subtitle: 'The published, customer-facing articles.',
    family: 'support',
    newLabel: 'Article',
    tabs: ['All', 'Published'],
    cols: [
      { key: 'title', label: 'Article' },
      { key: 'collection', label: 'Collection' },
      { key: 'audience', label: 'Audience' },
      { key: 'status', label: 'Status' },
      { key: 'usage', label: 'Used', right: true },
    ],
    emptyTitle: 'Nothing published yet',
    emptySteps: 'Publish a knowledge base article and it appears in the help center.',
  },
  docs: {
    mode: 'list',
    key: 'docs',
    title: 'Docs',
    subtitle: 'Documentation pages from the CMS.',
    family: 'support',
    newLabel: 'Page',
    tabs: ['All', 'Published', 'Draft'],
    cols: [
      { key: 'title', label: 'Title' },
      { key: 'slug', label: 'Slug' },
      { key: 'status', label: 'Status' },
      { key: 'updated', label: 'Updated' },
    ],
    emptyTitle: 'No doc pages yet',
    emptySteps: 'Docs are CMS pages — create them under Website / CMS.',
  },
  policies: {
    mode: 'list',
    key: 'policies',
    title: 'Policies',
    subtitle: 'Tenant policy settings.',
    family: 'support',
    newLabel: 'Policy',
    tabs: ['All'],
    cols: [
      { key: 'key', label: 'Policy' },
      { key: 'value', label: 'Value' },
      { key: 'updated', label: 'Updated' },
    ],
    emptyTitle: 'No policy settings yet',
    emptySteps: 'Policy settings appear here as they are configured.',
  },
  banners: {
    mode: 'list',
    key: 'banners',
    title: 'Banners',
    subtitle: 'Site-wide announcements and hero banners.',
    family: 'content',
    newLabel: 'Banner',
    tabs: ['All', 'Active', 'Off'],
    cols: [
      { key: 'name', label: 'Name' },
      { key: 'placement', label: 'Placement' },
      { key: 'headline', label: 'Headline' },
      { key: 'status', label: 'Status' },
      { key: 'window', label: 'Window' },
    ],
    emptyTitle: 'No banners yet',
    emptySteps: 'Create a banner to announce a drop or sale across the storefront.',
  },
  popups: {
    mode: 'list',
    key: 'popups',
    title: 'Popups',
    subtitle: 'Exit-intent, timed, and scroll-triggered popups.',
    family: 'content',
    newLabel: 'Popup',
    tabs: ['All', 'Active', 'Off'],
    cols: [
      { key: 'name', label: 'Name' },
      { key: 'trigger', label: 'Trigger' },
      { key: 'status', label: 'Status' },
      { key: 'impressions', label: 'Impressions', right: true },
      { key: 'conversions', label: 'Conversions', right: true },
    ],
    emptyTitle: 'No popups yet',
    emptySteps: 'Create a popup to capture emails or promote an offer.',
  },
  cms_pages: {
    mode: 'list',
    key: 'cms-pages',
    title: 'CMS pages',
    subtitle: 'Storefront pages, landing pages, and posts.',
    family: 'content',
    newLabel: 'Page',
    tabs: ['All', 'Published', 'Draft', 'Archived'],
    cols: [
      { key: 'title', label: 'Title' },
      { key: 'slug', label: 'Slug' },
      { key: 'type', label: 'Type' },
      { key: 'status', label: 'Status' },
      { key: 'updated', label: 'Updated' },
    ],
    emptyTitle: 'No pages yet',
    emptySteps: 'Create a page — it saves as a draft until you publish it.',
  },
  content_blocks: {
    mode: 'list',
    key: 'content-blocks',
    title: 'Content blocks',
    subtitle: 'Reusable blocks placed into page slots.',
    family: 'content',
    newLabel: 'Block',
    tabs: ['All', 'Published', 'Draft'],
    cols: [
      { key: 'block', label: 'Block' },
      { key: 'component', label: 'Component' },
      { key: 'slot', label: 'Slot' },
      { key: 'status', label: 'Status' },
    ],
    emptyTitle: 'No content blocks yet',
    emptySteps: 'Create a block to reuse content across pages.',
  },
  navigation: {
    mode: 'list',
    key: 'navigation',
    title: 'Navigation',
    subtitle: 'Storefront menus — header, footer, and mobile nav.',
    family: 'content',
    newLabel: 'Menu',
    tabs: ['All', 'Active', 'Draft'],
    cols: [
      { key: 'name', label: 'Menu' },
      { key: 'location', label: 'Location' },
      { key: 'status', label: 'Status' },
    ],
    emptyTitle: 'No menus yet',
    emptySteps: 'Create a menu to control what the storefront navigation shows.',
  },
  media: {
    mode: 'list',
    key: 'media',
    title: 'Media',
    subtitle: 'Images and files the CMS pages and banners use.',
    family: 'content',
    newLabel: 'Asset',
    tabs: ['All', 'Published', 'Draft'],
    cols: [
      { key: 'title', label: 'Title' },
      { key: 'type', label: 'Type' },
      { key: 'size', label: 'Size', right: true },
      { key: 'status', label: 'Status' },
    ],
    emptyTitle: 'No media yet',
    emptySteps: 'Upload an image or add one by URL to use it in pages and banners.',
  },
  website_overview: {
    mode: 'overview',
    title: 'Website / CMS — Overview',
    subtitle: 'Pages, banners, popups and navigation — the content layer storefronts render.',
    kpis: [
      { label: 'Pages live', value: '—', screen: 'cms-pages' },
      { label: 'Drafts', value: '—', screen: 'cms-pages' },
      { label: 'Banners active', value: '—', screen: 'banners' },
      { label: 'Form submissions (7d)', value: '—', screen: 'set-lead-capture' },
    ],
    kpiEndpoint: '/api/cms/stats',
    actions: [
      ['Page', 'description'],
      ['Banner', 'view_carousel'],
      ['Popup', 'open_in_new'],
      ['Menu', 'menu'],
    ],
    panelTitle: 'Website health',
    panelText: 'Published pages, live banners and the render mode — the tiles above are live from the cms tables.',
  },
  website_cms: {
    mode: 'list',
    key: 'website-cms',
    title: 'Website / CMS',
    subtitle: 'Every page on the storefront, from the CMS.',
    family: 'content',
    newLabel: 'Page',
    tabs: ['All', 'Published', 'Draft', 'Archived'],
    cols: [
      { key: 'title', label: 'Title' },
      { key: 'slug', label: 'Slug' },
      { key: 'type', label: 'Type' },
      { key: 'status', label: 'Status' },
      { key: 'updated', label: 'Updated' },
    ],
    emptyTitle: 'No pages yet',
    emptySteps: 'Pages you create in the CMS appear here.',
  },
  invoices: {
    mode: 'list',
    key: 'invoices',
    title: 'Invoices',
    subtitle: 'All invoices across customers.',
    family: 'document',
    newLabel: 'Invoice',
    tabs: ['All', 'Open', 'Overdue', 'Paid'],
    cols: [
      { key: 'no', label: 'No.' },
      { key: 'date', label: 'Date' },
      { key: 'party', label: 'Customer' },
      { key: 'due', label: 'Due' },
      { key: 'amount', label: 'Amount', right: true },
      { key: 'balance', label: 'Balance', right: true },
      { key: 'status', label: 'Status' },
    ],
    createActionsRow: [
      ['Invoice', 'receipt_long'],
      ['Receive payment', 'price_check'],
      ['Estimate', 'request_quote'],
      ['Customer', 'person_add'],
    ],
  },
  bills: {
    mode: 'list',
    key: 'bills',
    title: 'Bills',
    subtitle: 'Vendor bills — For review / Unpaid / Paid.',
    family: 'document',
    newLabel: 'Bill',
    tabs: ['For review', 'Unpaid', 'Paid', 'All'],
    cols: [
      { key: 'vendor', label: 'Vendor' },
      { key: 'billno', label: 'Bill no.' },
      { key: 'due', label: 'Due' },
      { key: 'amount', label: 'Amount', right: true },
      { key: 'status', label: 'Status' },
    ],
  },
  expenses: {
    mode: 'list',
    key: 'expenses',
    title: 'Expense transactions',
    subtitle: 'Bills, expenses, checks, credits.',
    family: 'document',
    newLabel: 'Expense',
    tabs: ['All', 'Bills', 'Expenses', 'Checks', 'Credits'],
    cols: [
      { key: 'date', label: 'Date' },
      { key: 'payee', label: 'Payee' },
      { key: 'category', label: 'Category' },
      { key: 'paid', label: 'Paid from' },
      { key: 'amount', label: 'Amount', right: true },
      { key: 'receipt', label: 'Receipt' },
      { key: 'status', label: 'Status' },
    ],
  },
  customers: {
    mode: 'list',
    key: 'customers',
    title: 'Customers',
    subtitle: 'Party list — role=Customer.',
    family: 'party',
    newLabel: 'Customer',
    tabs: ['All', 'Active', 'New', 'Recurring', 'Inactive', 'Needs follow-up'],
    cols: [
      { key: 'name', label: 'Name' },
      { key: 'email', label: 'Email' },
      { key: 'orders', label: 'Orders', right: true },
      { key: 'ltv', label: 'LTV', right: true },
      { key: 'balance', label: 'Balance', right: true },
      { key: 'last', label: 'Last order' },
      { key: 'consent', label: 'Marketing consent' },
    ],
    createActionsRow: [
      ['Customer', 'person_add'],
      ['Vendor', 'domain_add'],
      ['Supplier', 'local_shipping'],
      ['Contractor', 'engineering'],
    ],
  },
  vendors: {
    mode: 'list',
    key: 'vendors',
    title: 'Vendors',
    subtitle: 'Party list — role=Vendor.',
    family: 'party',
    newLabel: 'Vendor',
    tabs: ['All', 'Suppliers', 'Contractors', '1099'],
    cols: [
      { key: 'name', label: 'Name' },
      { key: 'role', label: 'Role' },
      { key: 'open', label: 'Open bills', right: true },
      { key: 'ytd', label: 'YTD paid', right: true },
      { key: 'tax', label: '1099' },
      { key: 'sla', label: 'SLA', right: true },
    ],
  },
  products: {
    mode: 'list',
    key: 'products',
    title: 'Products and services',
    subtitle: 'Same list as Catalog > Products.',
    family: 'catalog',
    newLabel: 'Product',
    tabs: ['All', 'Published', 'Draft', 'Archived'],
    cols: [
      { key: 'name', label: 'Name' },
      { key: 'sku', label: 'SKU' },
      { key: 'supplier', label: 'Supplier' },
      { key: 'price', label: 'Price', right: true },
      { key: 'margin', label: 'Margin', right: true },
      { key: 'status', label: 'Status' },
    ],
  },
  // ── Catalog — every screen in the Catalog domain renders through
  // SCREEN_DEFS + /api/list-rows (the same mechanism as the finance
  // lists). Rows come from the module's real tables; a screen with no
  // rows renders its honest empty state. ──
  'catalog-overview': {
    mode: 'overview',
    title: 'Catalog — Overview',
    subtitle: 'Products, variants, listings and the blanks catalog at a glance.',
    kpis: [
      { label: 'Products', value: '—', screen: 'products' },
      { label: 'Published', value: '—', screen: 'products' },
      { label: 'Low stock', value: '—', screen: 'variants' },
      { label: 'Avg margin %', value: '—', screen: 'variants' },
      { label: 'Listings syncing', value: '—', screen: 'listings' },
      { label: 'Blanks available', value: '—', screen: 'catalog-sources--products' },
    ],
    kpiEndpoint: '/api/catalog/overview',
    actions: [
      ['Product', 'inventory_2'],
      ['Category', 'category'],
      ['Collection', 'collections_bookmark'],
      ['Variant', 'qr_code'],
    ],
    panelTitle: 'Catalog health',
    panelText: 'Published products, sync state and stock — the tiles above are live from the catalog tables.',
  },
  listings: {
    mode: 'list',
    key: 'listings',
    title: 'Listings',
    subtitle: 'Products listed on sales channels, with sync state.',
    family: 'catalog',
    newLabel: 'Listing',
    tabs: ['All', 'Synced', 'Syncing', 'Failed', 'Pending'],
    cols: [
      { key: 'product', label: 'Product' },
      { key: 'sku', label: 'SKU' },
      { key: 'channel', label: 'Channel' },
      { key: 'status', label: 'Sync' },
      { key: 'published', label: 'Published' },
      { key: 'lastSynced', label: 'Last synced' },
    ],
    emptyTitle: 'No listings yet',
    emptySteps: 'No channel is connected — connect a channel, then publish a product to it from the product profile.',
  },
  amazon: {
    mode: 'list',
    key: 'amazon',
    title: 'Amazon listings',
    subtitle: 'Products listed on Amazon, with sync state.',
    family: 'catalog',
    newLabel: 'Listing',
    tabs: ['All', 'Synced', 'Syncing', 'Failed', 'Pending'],
    cols: [
      { key: 'product', label: 'Product' },
      { key: 'sku', label: 'SKU' },
      { key: 'status', label: 'Sync' },
      { key: 'published', label: 'Published' },
      { key: 'lastSynced', label: 'Last synced' },
    ],
    emptyTitle: 'No Amazon listings yet',
    emptySteps: 'No Amazon channel is connected — connect it, then publish a product to it from the product profile.',
  },
  tiktok: {
    mode: 'list',
    key: 'tiktok',
    title: 'TikTok listings',
    subtitle: 'Products listed on TikTok, with sync state.',
    family: 'catalog',
    newLabel: 'Listing',
    tabs: ['All', 'Synced', 'Syncing', 'Failed', 'Pending'],
    cols: [
      { key: 'product', label: 'Product' },
      { key: 'sku', label: 'SKU' },
      { key: 'status', label: 'Sync' },
      { key: 'published', label: 'Published' },
      { key: 'lastSynced', label: 'Last synced' },
    ],
    emptyTitle: 'No TikTok listings yet',
    emptySteps: 'No TikTok channel is connected — connect it, then publish a product to it from the product profile.',
  },
  'facebook-marketplace': {
    mode: 'list',
    key: 'facebook-marketplace',
    title: 'Facebook Marketplace listings',
    subtitle: 'Products listed on Facebook Marketplace, with sync state.',
    family: 'catalog',
    newLabel: 'Listing',
    tabs: ['All', 'Synced', 'Syncing', 'Failed', 'Pending'],
    cols: [
      { key: 'product', label: 'Product' },
      { key: 'sku', label: 'SKU' },
      { key: 'status', label: 'Sync' },
      { key: 'published', label: 'Published' },
      { key: 'lastSynced', label: 'Last synced' },
    ],
    emptyTitle: 'No Facebook Marketplace listings yet',
    emptySteps: 'No Facebook Marketplace channel is connected — connect it, then publish a product to it from the product profile.',
  },
  whatnot: {
    mode: 'list',
    key: 'whatnot',
    title: 'Whatnot listings',
    subtitle: 'Products listed on Whatnot, with sync state.',
    family: 'catalog',
    newLabel: 'Listing',
    tabs: ['All', 'Synced', 'Syncing', 'Failed', 'Pending'],
    cols: [
      { key: 'product', label: 'Product' },
      { key: 'sku', label: 'SKU' },
      { key: 'status', label: 'Sync' },
      { key: 'published', label: 'Published' },
      { key: 'lastSynced', label: 'Last synced' },
    ],
    emptyTitle: 'No Whatnot listings yet',
    emptySteps: 'No Whatnot channel is connected — connect it, then publish a product to it from the product profile.',
  },
  etsy: {
    mode: 'list',
    key: 'etsy',
    title: 'Etsy listings',
    subtitle: 'Products listed on Etsy, with sync state.',
    family: 'catalog',
    newLabel: 'Listing',
    tabs: ['All', 'Synced', 'Syncing', 'Failed', 'Pending'],
    cols: [
      { key: 'product', label: 'Product' },
      { key: 'sku', label: 'SKU' },
      { key: 'status', label: 'Sync' },
      { key: 'published', label: 'Published' },
      { key: 'lastSynced', label: 'Last synced' },
    ],
    emptyTitle: 'No Etsy listings yet',
    emptySteps: 'No Etsy channel is connected — connect it, then publish a product to it from the product profile.',
  },
  ebay: {
    mode: 'list',
    key: 'ebay',
    title: 'eBay listings',
    subtitle: 'Products listed on eBay, with sync state.',
    family: 'catalog',
    newLabel: 'Listing',
    tabs: ['All', 'Synced', 'Syncing', 'Failed', 'Pending'],
    cols: [
      { key: 'product', label: 'Product' },
      { key: 'sku', label: 'SKU' },
      { key: 'status', label: 'Sync' },
      { key: 'published', label: 'Published' },
      { key: 'lastSynced', label: 'Last synced' },
    ],
    emptyTitle: 'No eBay listings yet',
    emptySteps: 'No eBay channel is connected — connect it, then publish a product to it from the product profile.',
  },
  bundles: {
    mode: 'list',
    key: 'bundles',
    title: 'Bundles',
    subtitle: 'Product bundles from catalog_bundles.',
    family: 'catalog',
    newLabel: 'Bundle',
    cols: [
      { key: 'name', label: 'Bundle' },
      { key: 'slug', label: 'Slug' },
      { key: 'items', label: 'Items', right: true },
      { key: 'status', label: 'Status' },
      { key: 'updated', label: 'Updated' },
    ],
    emptyTitle: 'No bundles yet',
    emptySteps: 'Bundles group catalog items into one sellable set — create one from the catalog.',
  },
  categories: {
    mode: 'list',
    key: 'categories',
    title: 'Categories',
    subtitle: 'Storefront product categories.',
    family: 'catalog',
    newLabel: 'Category',
    tabs: ['All', 'Active', 'Inactive'],
    cols: [
      { key: 'name', label: 'Category' },
      { key: 'slug', label: 'Slug' },
      { key: 'parent', label: 'Parent' },
      { key: 'products', label: 'Products', right: true },
      { key: 'status', label: 'Status' },
    ],
    emptyTitle: 'No categories yet',
    emptySteps: 'Categories organize the catalog — create one to start grouping products.',
  },
  variants: {
    mode: 'list',
    key: 'variants',
    title: 'Variants',
    subtitle: 'Every product variant and SKU, across the catalog.',
    family: 'catalog',
    newLabel: 'Variant',
    tabs: ['All', 'Active', 'Inactive'],
    cols: [
      { key: 'sku', label: 'SKU' },
      { key: 'product', label: 'Product' },
      { key: 'size', label: 'Size' },
      { key: 'color', label: 'Color' },
      { key: 'price', label: 'Price', right: true },
      { key: 'cost', label: 'Cost', right: true },
      { key: 'margin', label: 'Margin', right: true },
      { key: 'stock', label: 'Stock', right: true },
      { key: 'status', label: 'Status' },
    ],
    emptyTitle: 'No variants yet',
    emptySteps: 'Variants are created from a product — open a product and add a variant.',
  },
  availability: {
    mode: 'list',
    key: 'availability',
    title: 'Availability',
    subtitle: 'What a listing can actually sell right now.',
    family: 'catalog',
    newLabel: 'Availability',
    tabs: ['All', 'Sellable', 'Blocked'],
    cols: [
      { key: 'product', label: 'Product' },
      { key: 'sku', label: 'SKU' },
      { key: 'node', label: 'Category' },
      { key: 'source', label: 'Source' },
      { key: 'qty', label: 'Available', right: true },
      { key: 'status', label: 'Status' },
    ],
    emptyTitle: 'Nothing listed yet',
    emptySteps: 'Availability is computed from published products — publish a product to a listing category first.',
  },
  'catalog-listing--categories': {
    mode: 'list',
    key: 'catalog-listing--categories',
    title: 'Listing categories',
    subtitle: 'Channel taxonomy nodes that listings map to.',
    family: 'catalog',
    newLabel: 'Listing category',
    cols: [
      { key: 'name', label: 'Category' },
      { key: 'type', label: 'Type' },
      { key: 'path', label: 'Path' },
      { key: 'products', label: 'Products', right: true },
      { key: 'status', label: 'Status' },
    ],
    emptyTitle: 'No listing categories yet',
    emptySteps: 'Listing categories are the channel taxonomy — create one to map catalog categories to.',
  },
  'category-map': {
    mode: 'list',
    key: 'category-map',
    title: 'Category map',
    subtitle: 'Catalog categories mapped to listing categories.',
    family: 'catalog',
    newLabel: 'Category map',
    cols: [
      { key: 'node', label: 'Listing category' },
      { key: 'source', label: 'Source category' },
      { key: 'match', label: 'Match' },
      { key: 'effect', label: 'Effect' },
      { key: 'priority', label: 'Priority', right: true },
      { key: 'status', label: 'Status' },
    ],
    emptyTitle: 'No mappings yet',
    emptySteps: 'Map a catalog category to a listing category to publish products on a channel.',
  },
  'published-products': {
    mode: 'list',
    key: 'published-products',
    title: 'Published products',
    subtitle: 'Products published to listing categories.',
    family: 'catalog',
    newLabel: 'Published product',
    cols: [
      { key: 'product', label: 'Product' },
      { key: 'path', label: 'Category path' },
      { key: 'primary', label: 'Primary' },
      { key: 'created', label: 'Published' },
    ],
    emptyTitle: 'No published products yet',
    emptySteps: 'Publish a product to a listing category to see it here.',
  },
  'catalog-sources--products': {
    mode: 'list',
    key: 'catalog-sources--products',
    title: 'Source products',
    subtitle: 'Supplier catalog products — the blanks and source items inventory is built from.',
    family: 'catalog',
    newLabel: 'Source product',
    tabs: ['All', 'Available', 'Hidden'],
    cols: [
      { key: 'name', label: 'Product' },
      { key: 'brand', label: 'Brand' },
      { key: 'external', label: 'External ID' },
      { key: 'variants', label: 'Variants', right: true },
      { key: 'category', label: 'Category' },
      { key: 'status', label: 'Status' },
    ],
    emptyTitle: 'No source products yet',
    emptySteps: 'Source products arrive from supplier catalogs — ingest a supplier feed to populate them.',
  },
  'source-categories': {
    mode: 'list',
    key: 'source-categories',
    title: 'Source categories',
    subtitle: 'Supplier-side categories for source products.',
    family: 'catalog',
    newLabel: 'Source category',
    tabs: ['All', 'Active'],
    cols: [
      { key: 'name', label: 'Category' },
      { key: 'path', label: 'Path' },
      { key: 'depth', label: 'Depth', right: true },
      { key: 'products', label: 'Products', right: true },
      { key: 'status', label: 'Status' },
    ],
    emptyTitle: 'No source categories yet',
    emptySteps: 'Source categories arrive with the supplier catalog.',
  },

  // ── Orders & Fulfillment (spec-2): the 9 nav screens that had no
  // SCREEN_DEF rendered the generic empty list. Each def below is backed
  // by a list-rows loader of the same key (see list-rows/route.ts). ──
  'holds-&-needs-attention': {
    mode: 'list',
    key: 'holds-&-needs-attention',
    title: 'Holds & needs attention',
    subtitle: 'Orders on hold or flagged as needing attention.',
    family: 'orders',
    newLabel: 'Order',
    tabs: ['All', 'On hold', 'Needs attention'],
    cols: [
      { key: 'order', label: 'Order' },
      { key: 'customer', label: 'Customer' },
      { key: 'channel', label: 'Channel' },
      { key: 'date', label: 'Date' },
      { key: 'total', label: 'Total', right: true },
      { key: 'status', label: 'Status' },
      { key: 'issue', label: 'Issue' },
    ],
    emptyTitle: 'Nothing on hold or needing attention',
    emptySteps: 'Orders flagged by a problem report or put on hold show up here.',
  },
  'order-issues': {
    mode: 'list',
    key: 'order-issues',
    title: 'Order issues',
    subtitle: 'Orders flagged as needing attention (manual push).',
    family: 'orders',
    newLabel: 'Order',
    tabs: ['All'],
    cols: [
      { key: 'order', label: 'Order' },
      { key: 'customer', label: 'Customer' },
      { key: 'channel', label: 'Channel' },
      { key: 'date', label: 'Date' },
      { key: 'total', label: 'Total', right: true },
      { key: 'status', label: 'Status' },
      { key: 'issue', label: 'Issue' },
    ],
    emptyTitle: 'No order issues',
    emptySteps: 'Orders flagged by a problem report show up here.',
  },
  'order-issues-(needs-attention)': {
    mode: 'list',
    key: 'order-issues-(needs-attention)',
    title: 'Order issues (needs attention)',
    subtitle: 'Orders flagged as needing attention.',
    family: 'orders',
    newLabel: 'Order',
    tabs: ['All'],
    cols: [
      { key: 'order', label: 'Order' },
      { key: 'customer', label: 'Customer' },
      { key: 'channel', label: 'Channel' },
      { key: 'date', label: 'Date' },
      { key: 'total', label: 'Total', right: true },
      { key: 'status', label: 'Status' },
      { key: 'issue', label: 'Issue' },
    ],
    emptyTitle: 'No order issues',
    emptySteps: 'Orders flagged by a problem report show up here.',
  },
  'packing-slip': {
    mode: 'list',
    key: 'packing-slip',
    title: 'Packing slip',
    subtitle: 'Packing slip batches created for orders.',
    family: 'orders',
    newLabel: 'Batch',
    tabs: ['All', 'Open'],
    cols: [
      { key: 'batch', label: 'Batch' },
      { key: 'warehouse', label: 'Warehouse' },
      { key: 'status', label: 'Status' },
      { key: 'document', label: 'Document' },
      { key: 'created', label: 'Created' },
      { key: 'printed', label: 'Printed' },
    ],
    emptyTitle: 'No packing slips yet',
    emptySteps: 'Select orders on the Orders list and print slips to create a batch.',
  },
  fulfillment: {
    mode: 'list',
    key: 'fulfillment',
    title: 'Fulfillment',
    subtitle: 'Warehouse fulfillment orders (pick / pack / ship).',
    family: 'orders',
    newLabel: 'Fulfillment order',
    tabs: ['All', 'Open', 'Shipped', 'Cancelled'],
    cols: [
      { key: 'fulfillment', label: 'Fulfillment' },
      { key: 'order', label: 'Order' },
      { key: 'method', label: 'Method' },
      { key: 'status', label: 'Status' },
      { key: 'priority', label: 'Priority', right: true },
      { key: 'dispatched', label: 'Dispatched' },
      { key: 'completed', label: 'Completed' },
    ],
    emptyTitle: 'No fulfillment orders yet',
    emptySteps: 'Marking an order shipped creates its fulfillment order here.',
  },
  'batch-slips-&-labels': {
    mode: 'list',
    key: 'batch-slips-&-labels',
    title: 'Batch slips & labels',
    subtitle: 'Shipping labels created for shipments.',
    family: 'orders',
    newLabel: 'Label',
    tabs: ['All'],
    cols: [
      { key: 'label', label: 'Label' },
      { key: 'shipment', label: 'Shipment' },
      { key: 'carrier', label: 'Carrier' },
      { key: 'tracking', label: 'Tracking' },
      { key: 'postage', label: 'Postage', right: true },
      { key: 'printed', label: 'Printed' },
    ],
    emptyTitle: 'No shipping labels yet',
    emptySteps: 'Print a shipping label from an order to create one.',
  },
  'customer-return-requests': {
    mode: 'list',
    key: 'customer-return-requests',
    title: 'Customer return requests',
    subtitle: 'Return requests submitted by customers.',
    family: 'orders',
    newLabel: 'Return request',
    tabs: ['All', 'Pending', 'Approved', 'Declined'],
    cols: [
      { key: 'request', label: 'Request' },
      { key: 'order', label: 'Order' },
      { key: 'customer', label: 'Customer' },
      { key: 'item', label: 'Item' },
      { key: 'type', label: 'Type' },
      { key: 'reason', label: 'Reason' },
      { key: 'status', label: 'Status' },
    ],
    emptyTitle: 'No customer return requests',
    emptySteps: 'Customer-submitted return requests show up here.',
  },
  'returns-&-claims': {
    mode: 'list',
    key: 'returns-&-claims',
    title: 'Returns & claims',
    subtitle: 'Return authorizations (RMAs) and their decisions.',
    family: 'orders',
    newLabel: 'RMA',
    tabs: ['All', 'Requested', 'Approved', 'Received', 'Completed', 'Declined', 'Refunded'],
    cols: [
      { key: 'rma', label: 'RMA' },
      { key: 'order', label: 'Order' },
      { key: 'customer', label: 'Customer' },
      { key: 'reason', label: 'Reason' },
      { key: 'status', label: 'Status' },
      { key: 'requested', label: 'Requested' },
    ],
    emptyTitle: 'No returns or claims yet',
    emptySteps: 'Open a return from an order to create an RMA.',
  },
  'order-detail': {
    mode: 'list',
    key: 'order-detail',
    title: 'Order detail',
    subtitle: 'Order lines across all orders — open an order from the Orders list for its full document page.',
    family: 'orders',
    newLabel: 'Order',
    tabs: ['All', 'Shipped', 'Pending', 'Cancelled'],
    cols: [
      { key: 'order', label: 'Order' },
      { key: 'item', label: 'Item' },
      { key: 'sku', label: 'SKU' },
      { key: 'qty', label: 'Qty', right: true },
      { key: 'price', label: 'Price', right: true },
      { key: 'total', label: 'Line total', right: true },
      { key: 'shipped', label: 'Shipped', right: true },
      { key: 'status', label: 'Status' },
    ],
    emptyTitle: 'No order lines yet',
    emptySteps: 'Order lines appear once orders exist.',
  },

  // ── Purchasing & Inventory (spec-3): the 5 inventory sub-pages with no
  // component of their own. Each def is backed by a list-rows loader of the
  // same key (see list-rows/route.ts). Stock on hand, transfers, cycle
  // counts and warehouses render the rich InventoryView instead. ──
  'inventory-cost-layers': {
    mode: 'list',
    key: 'inventory-cost-layers',
    title: 'Cost layers',
    subtitle: 'FIFO cost layers per SKU — what each unit on hand cost.',
    family: 'inventory',
    newLabel: 'Layer',
    tabs: ['All'],
    cols: [
      { key: 'sku', label: 'SKU' },
      { key: 'warehouse', label: 'Warehouse' },
      { key: 'method', label: 'Method' },
      { key: 'remaining', label: 'Qty remaining', right: true },
      { key: 'unitCost', label: 'Unit cost', right: true },
      { key: 'created', label: 'Created' },
    ],
    emptyTitle: 'No cost layers yet',
    emptySteps: 'No ERP cost layers recorded — the live layers are the finance ledger (acct_inventory_layers), shown per item on the Finance items tab.',
  },
  'inventory-lots': {
    mode: 'list',
    key: 'inventory-lots',
    title: 'Lots',
    subtitle: 'Received lots per SKU with manufacture and expiration dates.',
    family: 'inventory',
    newLabel: 'Lot',
    tabs: ['All'],
    cols: [
      { key: 'lot', label: 'Lot #' },
      { key: 'sku', label: 'SKU' },
      { key: 'manufactured', label: 'Manufactured' },
      { key: 'expires', label: 'Expires' },
      { key: 'received', label: 'Received' },
      { key: 'status', label: 'Status' },
    ],
    emptyTitle: 'No lots yet',
    emptySteps: 'Lots are created on receipt when a lot number is recorded.',
  },
  'inventory-movements': {
    mode: 'list',
    key: 'inventory-movements',
    title: 'Movements',
    subtitle: 'Every stock movement — receipts, adjustments, transfers, sales, counts.',
    family: 'inventory',
    newLabel: 'Movement',
    tabs: ['All'],
    cols: [
      { key: 'date', label: 'Date' },
      { key: 'type', label: 'Type' },
      { key: 'sku', label: 'SKU' },
      { key: 'warehouse', label: 'Warehouse' },
      { key: 'qty', label: 'Qty', right: true },
      { key: 'unitCost', label: 'Unit cost', right: true },
      { key: 'total', label: 'Total', right: true },
      { key: 'reference', label: 'Reference' },
    ],
    emptyTitle: 'No movements yet',
    emptySteps: 'Movements are written by every stock action — adjust, transfer, receive, ship, count.',
  },
  'inventory-reservations': {
    mode: 'list',
    key: 'inventory-reservations',
    title: 'Reservations',
    subtitle: 'Stock reserved for orders — released on ship or cancel.',
    family: 'inventory',
    newLabel: 'Reservation',
    tabs: ['All'],
    cols: [
      { key: 'sku', label: 'SKU' },
      { key: 'order', label: 'Order' },
      { key: 'qty', label: 'Qty', right: true },
      { key: 'status', label: 'Status' },
      { key: 'expires', label: 'Expires' },
      { key: 'created', label: 'Created' },
    ],
    emptyTitle: 'No reservations yet',
    emptySteps: 'Reservations are created when an order holds stock.',
  },
  'inventory-serial-numbers': {
    mode: 'list',
    key: 'inventory-serial-numbers',
    title: 'Serial numbers',
    subtitle: 'Serialized units tracked per SKU and location.',
    family: 'inventory',
    newLabel: 'Serial',
    tabs: ['All'],
    cols: [
      { key: 'serial', label: 'Serial #' },
      { key: 'sku', label: 'SKU' },
      { key: 'lot', label: 'Lot' },
      { key: 'status', label: 'Status' },
      { key: 'location', label: 'Location' },
      { key: 'created', label: 'Created' },
    ],
    emptyTitle: 'No serial numbers yet',
    emptySteps: 'Serials are recorded on receipt for serialized SKUs.',
  },

  // ── Sales Tax (spec-5): the 9 sales-tax sub-pages plus the overview.
  // Each list def is backed by a list-rows loader of the same key (see
  // list-rows/route.ts). Rates reads the canonical acct_tax_codes —
  // the engine never reads acct_tax_rates (see /api/tax/rates). ──
  'sales_tax-overview': {
    mode: 'overview',
    title: 'Sales Tax — Overview',
    subtitle: 'Liability, nexus, taxable sales and the next filing at a glance.',
    kpis: [
      { label: 'Sales tax payable', value: '—', screen: 'sales_tax-filings' },
      { label: 'Nexus states', value: '—', screen: 'sales_tax-nexus' },
      { label: 'Taxable sales MTD', value: '—', screen: 'sales_tax-tax-transactions' },
      { label: 'Next filing due', value: '—', screen: 'sales_tax-filings' },
    ],
    kpiEndpoint: '/api/tax/overview',
    actions: [
      ['Filing', 'description'],
      ['Jurisdiction', 'public'],
      ['Rate', 'percent'],
    ],
    panelTitle: 'Sales tax health',
    panelText: 'Collected tax not yet filed, the states where nexus requires collection, and the next filing deadline — all live from the tax engine tables.',
  },
  'sales_tax-exemptions': {
    mode: 'list',
    key: 'sales_tax-exemptions',
    title: 'Exemptions',
    subtitle: 'Customer exemption certificates — sales to these customers are not taxed.',
    family: 'sales_tax',
    newLabel: 'Exemption',
    tabs: ['All'],
    cols: [
      { key: 'customer', label: 'Customer' },
      { key: 'jurisdiction', label: 'Jurisdiction' },
      { key: 'reason', label: 'Reason' },
      { key: 'certificate', label: 'Certificate #' },
      { key: 'validFrom', label: 'Valid from' },
      { key: 'validTo', label: 'Valid to' },
      { key: 'status', label: 'Status' },
    ],
    emptyTitle: 'No exemptions yet',
    emptySteps: 'No exemption certificates on file — exempt customers are taxed at the standard rate until one is added.',
  },
  'sales_tax-filings': {
    mode: 'list',
    key: 'sales_tax-filings',
    title: 'Filings',
    subtitle: 'Sales tax filings per jurisdiction and period — what was collected, filed and paid.',
    family: 'sales_tax',
    newLabel: 'Filing',
    tabs: ['All'],
    cols: [
      { key: 'period', label: 'Period' },
      { key: 'jurisdiction', label: 'Jurisdiction' },
      { key: 'taxable', label: 'Taxable sales', right: true },
      { key: 'collected', label: 'Collected', right: true },
      { key: 'remitted', label: 'Remitted', right: true },
      { key: 'due', label: 'Amount due', right: true },
      { key: 'status', label: 'Status' },
      { key: 'dueDate', label: 'Due' },
      { key: 'confirmation', label: 'Confirmation' },
    ],
    emptyTitle: 'No filings yet',
    emptySteps: 'Filings are prepared from posted tax transactions — prepare one once taxable sales exist.',
  },
  'sales_tax-jurisdictions': {
    mode: 'list',
    key: 'sales_tax-jurisdictions',
    title: 'Jurisdictions',
    subtitle: 'Tax jurisdictions — states and localities where tax is collected.',
    family: 'sales_tax',
    newLabel: 'Jurisdiction',
    tabs: ['All'],
    cols: [
      { key: 'code', label: 'Code' },
      { key: 'name', label: 'Name' },
      { key: 'level', label: 'Level' },
      { key: 'state', label: 'State / Locality' },
      { key: 'registration', label: 'Registration #' },
      { key: 'frequency', label: 'Filing frequency' },
      { key: 'status', label: 'Status' },
    ],
    emptyTitle: 'No jurisdictions yet',
    emptySteps: 'Jurisdictions are seeded per state (TN, TX) — add one to start collecting there.',
  },
  'sales_tax-marketplace-remittance': {
    mode: 'list',
    key: 'sales_tax-marketplace-remittance',
    title: 'Marketplace remittance',
    subtitle: 'Tax collected and remitted by marketplaces on the tenant’s behalf.',
    family: 'sales_tax',
    newLabel: 'Remittance filing',
    tabs: ['All'],
    cols: [
      { key: 'jurisdiction', label: 'Jurisdiction' },
      { key: 'period', label: 'Period' },
      { key: 'collected', label: 'Collected', right: true },
      { key: 'remitted', label: 'Remitted', right: true },
      { key: 'filed', label: 'Filed' },
      { key: 'confirmation', label: 'Confirmation' },
      { key: 'status', label: 'Status' },
    ],
    emptyTitle: 'No marketplace remittance yet',
    emptySteps: 'Marketplace remittance filings appear when a marketplace reports tax it collected for the tenant.',
  },
  'sales_tax-nexus': {
    mode: 'list',
    key: 'sales_tax-nexus',
    title: 'Nexus',
    subtitle: 'States where the business has nexus and must collect tax.',
    family: 'sales_tax',
    newLabel: 'Nexus',
    tabs: ['All'],
    cols: [
      { key: 'jurisdiction', label: 'Jurisdiction' },
      { key: 'type', label: 'Type' },
      { key: 'collect', label: 'Collect tax' },
      { key: 'registration', label: 'Registration #' },
      { key: 'registered', label: 'Registered' },
      { key: 'frequency', label: 'Filing frequency' },
      { key: 'threshold', label: 'Sales threshold', right: true },
    ],
    emptyTitle: 'No nexus registrations yet',
    emptySteps: 'Nexus is registered per state — without it the engine reports “No nexus/registration in this state” and collects $0.',
  },
  'sales_tax-nexus-alerts': {
    mode: 'list',
    key: 'sales_tax-nexus-alerts',
    title: 'Nexus alerts',
    subtitle: 'States approaching the economic nexus threshold — act before collection becomes required.',
    family: 'sales_tax',
    newLabel: 'Alert',
    tabs: ['All'],
    cols: [
      { key: 'state', label: 'State' },
      { key: 'status', label: 'Status' },
      { key: 'window', label: 'Window' },
      { key: 'sales', label: 'Counted sales', right: true },
      { key: 'txns', label: 'Transactions', right: true },
      { key: 'pct', label: '% of threshold', right: true },
      { key: 'detected', label: 'First detected' },
      { key: 'resolution', label: 'Resolution' },
    ],
    emptyTitle: 'No nexus alerts',
    emptySteps: 'Alerts are raised by the nexus refresh when a state’s sales approach its economic threshold — none are near it today.',
  },
  'sales_tax-rates': {
    mode: 'list',
    key: 'sales_tax-rates',
    title: 'Rates',
    subtitle: 'Sales tax rates in force — the canonical acct_tax_codes the engine prices from.',
    family: 'sales_tax',
    newLabel: 'Rate',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Name' },
      { key: 'code', label: 'Code' },
      { key: 'jurisdiction', label: 'Jurisdiction' },
      { key: 'rate', label: 'Rate', right: true },
      { key: 'payable', label: 'Payable account' },
      { key: 'effective', label: 'Effective from' },
      { key: 'status', label: 'Status' },
    ],
    emptyTitle: 'No rates yet',
    emptySteps: 'Rates are the tax codes per jurisdiction — add one to price tax for that state.',
  },
  'sales_tax-tax-transactions': {
    mode: 'list',
    key: 'sales_tax-tax-transactions',
    title: 'Tax transactions',
    subtitle: 'Every posted taxable sale and its tax line — what filings sum.',
    family: 'sales_tax',
    newLabel: 'Transaction',
    tabs: ['All'],
    cols: [
      { key: 'date', label: 'Date' },
      { key: 'source', label: 'Source' },
      { key: 'jurisdiction', label: 'Jurisdiction' },
      { key: 'category', label: 'Category' },
      { key: 'gross', label: 'Gross', right: true },
      { key: 'taxable', label: 'Taxable', right: true },
      { key: 'tax', label: 'Tax', right: true },
      { key: 'rate', label: 'Rate', right: true },
      { key: 'reason', label: 'Reason' },
      { key: 'filed', label: 'Filed' },
    ],
    emptyTitle: 'No tax transactions yet',
    emptySteps: 'Tax transactions are written when a taxable invoice or order posts — none have posted yet.',
  },
  'sales_tax-taxability-rules': {
    mode: 'list',
    key: 'sales_tax-taxability-rules',
    title: 'Taxability rules',
    subtitle: 'Per-category, per-jurisdiction rules — exempt, reduced or standard treatment.',
    family: 'sales_tax',
    newLabel: 'Rule',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Name' },
      { key: 'jurisdiction', label: 'Jurisdiction' },
      { key: 'category', label: 'Category' },
      { key: 'treatment', label: 'Treatment' },
      { key: 'override', label: 'Rate override', right: true },
      { key: 'direction', label: 'Direction' },
      { key: 'effective', label: 'Effective from' },
      { key: 'priority', label: 'Priority', right: true },
      { key: 'status', label: 'Status' },
    ],
    emptyTitle: 'No taxability rules yet',
    emptySteps: 'Rules override the standard rate for a category in a jurisdiction — none are defined yet.',
  },

  // ── Community, Reviews & UGC (spec-7): the 5 nav pages plus a
  // Reviews list and an Overview (both added as nav rows — the
  // walkthrough demands a reviews list + moderation queue, and the
  // KPIs demand an overview; see /api/community/*). Each list def is
  // backed by a list-rows loader of the same key. Reviews are created
  // status 'pending' and published/rejected via /api/community/reviews.
  // No quick actions on the overview: the Create flyout has no
  // community registry actions, and the list screens' New buttons
  // are the real create path (GenericCreateDrawer via the registry
  // for ugc_* tables, via tablePostRoutes for reviews). ──
  'community-overview': {
    mode: 'overview',
    title: 'Community — Overview',
    subtitle: 'Reviews, ratings and the moderation queue at a glance.',
    kpis: [
      { label: 'Reviews (30d)', value: '—', screen: 'community-reviews' },
      { label: 'Avg rating', value: '—', screen: 'community-reviews' },
      { label: 'Pending moderation', value: '—', screen: 'community-trust-&-safety--reports' },
      { label: 'Posts (7d)', value: '—', screen: 'community-posts' },
    ],
    kpiEndpoint: '/api/community/overview',
    panelTitle: 'Community health',
    panelText: 'Published reviews drive the product rating counters; the moderation queue holds every reported post, review, comment and media item awaiting staff action.',
  },
  'community-reviews': {
    mode: 'list',
    key: 'community-reviews',
    title: 'Reviews',
    subtitle: 'Product reviews — new reviews arrive pending and are published or rejected from the moderation queue.',
    family: 'community',
    newLabel: 'Review',
    tabs: ['All'],
    cols: [
      { key: 'product', label: 'Product' },
      { key: 'author', label: 'Author' },
      { key: 'rating', label: 'Rating', right: true },
      { key: 'title', label: 'Title' },
      { key: 'verified', label: 'Verified purchase' },
      { key: 'status', label: 'Status' },
      { key: 'date', label: 'Date' },
    ],
    emptyTitle: 'No reviews yet',
    emptySteps: 'Reviews are written by shoppers on product pages — new ones arrive here pending moderation.',
  },
  'community-posts': {
    mode: 'list',
    key: 'community-posts',
    title: 'Posts',
    subtitle: 'Community posts — the UGC feed. New posts arrive pending and are published, rejected or removed by staff.',
    family: 'community',
    newLabel: 'Post',
    tabs: ['All'],
    cols: [
      { key: 'author', label: 'Author' },
      { key: 'title', label: 'Title' },
      { key: 'product', label: 'Product' },
      { key: 'rating', label: 'Rating', right: true },
      { key: 'status', label: 'Status' },
      { key: 'published', label: 'Published' },
      { key: 'date', label: 'Date' },
    ],
    emptyTitle: 'No posts yet',
    emptySteps: 'Posts are written by shoppers and creators — new ones arrive here pending moderation.',
  },
  'community-comments': {
    mode: 'list',
    key: 'community-comments',
    title: 'Comments',
    subtitle: 'Comments on posts, products and reviews — staff can hide or remove them with a reason.',
    family: 'community',
    newLabel: 'Comment',
    tabs: ['All'],
    cols: [
      { key: 'author', label: 'Author' },
      { key: 'on', label: 'On' },
      { key: 'kind', label: 'Kind' },
      { key: 'body', label: 'Comment' },
      { key: 'status', label: 'Status' },
      { key: 'date', label: 'Date' },
    ],
    emptyTitle: 'No comments yet',
    emptySteps: 'Comments attach to a post, product or review — none have been written yet.',
  },
  'community-media': {
    mode: 'list',
    key: 'community-media',
    title: 'Media',
    subtitle: 'Photos and video attached to posts and reviews.',
    family: 'community',
    newLabel: 'Media',
    tabs: ['All'],
    cols: [
      { key: 'kind', label: 'Kind' },
      { key: 'on', label: 'Attached to' },
      { key: 'storage', label: 'File' },
      { key: 'status', label: 'Status' },
      { key: 'date', label: 'Date' },
    ],
    emptyTitle: 'No media yet',
    emptySteps: 'Media is attached when shoppers post photos or video with a review or post.',
  },
  'community-trust-&-safety--policies': {
    mode: 'list',
    key: 'community-trust-&-safety--policies',
    title: 'Policies',
    subtitle: 'Trust & safety policies shared with the marketplace — the rules moderation enforces.',
    family: 'community',
    newLabel: 'Policy',
    tabs: ['All'],
    cols: [
      { key: 'code', label: 'Code' },
      { key: 'title', label: 'Title' },
      { key: 'version', label: 'Version', right: true },
      { key: 'status', label: 'Status' },
      { key: 'updated', label: 'Updated' },
    ],
    emptyTitle: 'No policies yet',
    emptySteps: 'Trust policies are shared with the marketplace T&S module — none are defined yet.',
  },
  'community-trust-&-safety--reports': {
    mode: 'list',
    key: 'community-trust-&-safety--reports',
    title: 'Reports',
    subtitle: 'The moderation queue — every reported post, review, comment and media item, awaiting staff action.',
    family: 'community',
    newLabel: 'Report',
    tabs: ['All'],
    cols: [
      { key: 'target', label: 'Reported content' },
      { key: 'reason', label: 'Reason' },
      { key: 'status', label: 'Status' },
      { key: 'reporter', label: 'Reporter' },
      { key: 'reviewed', label: 'Reviewed' },
      { key: 'date', label: 'Reported' },
    ],
    emptyTitle: 'Queue is clear',
    emptySteps: 'No reports are waiting — reported content lands here for staff review.',
  },
  entities: {
    mode: 'list',
    key: 'entities',
    title: 'Entities',
    subtitle: 'Each legal business under the workspace — books, base currency, fiscal year, members.',
    family: 'accounting',
    newLabel: 'Entity',
    cols: [
      { key: 'name', label: 'Entity' },
      { key: 'books', label: 'Books' },
      { key: 'currency', label: 'Base currency' },
      { key: 'fiscal', label: 'Fiscal year' },
      { key: 'members', label: 'Members', right: true },
      { key: 'status', label: 'Status' },
    ],
    emptyTitle: 'No entities yet',
    emptySteps: 'Entities mirror Brands in Settings — create a brand to open its books.',
  },
  liabilities_credit: {
    mode: 'list',
    key: 'liabilities_credit',
    title: 'Liabilities and credit',
    subtitle: 'Credit-card, loan and credit-line accounts.',
    family: 'banking',
    newLabel: 'Liability',
    cols: [
      { key: 'account', label: 'Account' },
      { key: 'institution', label: 'Institution' },
      { key: 'kind', label: 'Kind' },
      { key: 'limit', label: 'Credit limit', right: true },
      { key: 'balance', label: 'Balance', right: true },
      { key: 'due', label: 'Payment due' },
      { key: 'status', label: 'Status' },
    ],
    emptyTitle: 'No credit accounts',
    emptySteps: 'Add a credit-card, loan or credit-line bank account to track it here.',
  },
  bill_approval_setup: {
    mode: 'list',
    key: 'bill_approval_setup',
    title: 'Bill and payment approval setup',
    subtitle: 'Approval chain for bills and purchase orders.',
    family: 'expense',
    newLabel: 'Approval rule',
    cols: [
      { key: 'document', label: 'Document' },
      { key: 'approver', label: 'Approver' },
      { key: 'stage', label: 'Stage' },
      { key: 'sequence', label: 'Sequence', right: true },
      { key: 'status', label: 'Status' },
      { key: 'acted', label: 'Acted' },
    ],
  },
  contractors: {
    mode: 'list',
    key: 'contractors',
    title: 'Contractors',
    subtitle: 'Invite contractors to complete their profile and W-9 — they join the vendor list marked 1099.',
    family: 'party',
    newLabel: 'Contractor',
    tabs: ['All', 'Met', 'Not met'],
    cols: [
      { key: 'name', label: 'Name' },
      { key: 'invite', label: 'Invite status' },
      { key: 'w9', label: 'W-9 received' },
      { key: 'paid', label: 'Paid this year', right: true },
      { key: 'status', label: '1099 threshold' },
    ],
  },
  '1099s': {
    mode: 'list',
    key: '1099s',
    title: '1099s',
    subtitle: '1099 vendors — year-to-date paid against the filing threshold.',
    family: 'tax',
    newLabel: '1099',
    tabs: ['All', 'Meets threshold', 'Below threshold'],
    cols: [
      { key: 'vendor', label: 'Vendor' },
      { key: 'ytd', label: 'YTD paid', right: true },
      { key: 'threshold', label: 'Threshold', right: true },
      { key: 'w9', label: 'W-9 received' },
      { key: 'status', label: 'Threshold' },
    ],
  },
  payroll: {
    mode: 'list',
    key: 'payroll',
    title: 'Payroll',
    subtitle: 'Pay periods and runs — draft → approved → paid → posted. Posting creates the wage, tax, and liability entries.',
    family: 'expense',
    newLabel: 'Payroll run',
    tabs: ['All', 'Draft', 'Approved', 'Paid', 'Posted'],
    cols: [
      { key: 'period', label: 'Pay period' },
      { key: 'status', label: 'Run state' },
      { key: 'payDate', label: 'Pay date' },
      { key: 'gross', label: 'Gross', right: true },
      { key: 'taxes', label: 'Taxes', right: true },
      { key: 'net', label: 'Net', right: true },
    ],
  },
  sales_channels: {
    mode: 'list',
    key: 'sales_channels',
    title: 'Sales channels',
    subtitle: 'Connected storefront and marketplace channels.',
    family: 'sales',
    newLabel: 'Channel',
    cols: [
      { key: 'channel', label: 'Channel' },
      { key: 'type', label: 'Type' },
      { key: 'active', label: 'Status' },
      { key: 'code', label: 'Code' },
    ],
    emptyTitle: 'No sales channels connected',
    emptySteps: 'Connect a channel to start selling through it.',
  },
  payouts: {
    mode: 'list',
    key: 'payouts',
    title: 'Payouts',
    subtitle: 'Processor payouts — matching a payout to a bank deposit closes the clearing balance.',
    family: 'sales',
    newLabel: 'Payout',
    tabs: ['All', 'In clearing', 'Matched'],
    cols: [
      { key: 'date', label: 'Date' },
      { key: 'processor', label: 'Processor' },
      { key: 'gross', label: 'Gross', right: true },
      { key: 'fees', label: 'Fees', right: true },
      { key: 'refunds', label: 'Refunds', right: true },
      { key: 'net', label: 'Net', right: true },
      { key: 'status', label: 'Status' },
    ],
  },
  gift_cards: {
    mode: 'list',
    key: 'gift_cards',
    title: 'Gift cards',
    subtitle: 'Issued gift cards and live balances.',
    family: 'sales',
    newLabel: 'Gift card',
    tabs: ['All', 'Active', 'Fully redeemed'],
    cols: [
      { key: 'code', label: 'Code' },
      { key: 'kind', label: 'Kind' },
      { key: 'status', label: 'Status' },
      { key: 'initial', label: 'Initial', right: true },
      { key: 'balance', label: 'Balance', right: true },
      { key: 'customer', label: 'Customer' },
      { key: 'expires', label: 'Expires' },
    ],
  },
  subscriptions: {
    mode: 'list',
    key: 'subscriptions',
    title: 'Subscriptions',
    subtitle: 'Plans and subscribers — each cycle creates an invoice and a payment.',
    family: 'sales',
    newLabel: 'Subscription',
    tabs: ['All', 'Active', 'Paused'],
    cols: [
      { key: 'plan', label: 'Plan' },
      { key: 'subscribers', label: 'Subscribers', right: true },
      { key: 'cycle', label: 'Cycle' },
      { key: 'next', label: 'Next charge' },
      { key: 'failed', label: 'Failed payments', right: true },
      { key: 'status', label: 'Status' },
    ],
  },
  refunds: {
    mode: 'list',
    key: 'refunds',
    title: 'Refunds',
    subtitle: 'Against orders and invoices, full or partial — over the limit needs approval. Posts to refunds and returns and reverses tax.',
    family: 'sales',
    newLabel: 'Refund',
    tabs: ['All', 'Pending approval', 'Posted'],
    cols: [
      { key: 'date', label: 'Date' },
      { key: 'customer', label: 'Customer' },
      { key: 'source', label: 'Order / invoice' },
      { key: 'amount', label: 'Amount', right: true },
      { key: 'type', label: 'Type' },
      { key: 'reason', label: 'Reason' },
      { key: 'status', label: 'Status' },
    ],
  },
  disputes: {
    mode: 'list',
    key: 'disputes',
    title: 'Disputes',
    subtitle: 'Chargebacks from the processor — the evidence packet is built from the order, tracking, and messages.',
    family: 'sales',
    newLabel: 'Dispute',
    tabs: ['All', 'Action needed', 'Under review', 'Won', 'Lost'],
    cols: [
      { key: 'opened', label: 'Opened' },
      { key: 'processor', label: 'Processor' },
      { key: 'amount', label: 'Amount', right: true },
      { key: 'reason', label: 'Reason' },
      { key: 'due', label: 'Evidence due' },
      { key: 'status', label: 'Status' },
    ],
  },
  tax_return: {
    mode: 'list',
    key: 'tax_return',
    title: 'Create tax return',
    subtitle: 'Starts a return from the year\u2019s books — blocked if accounts are unmapped or periods are open.',
    family: 'tax',
    newLabel: 'Return',
    cols: [
      { key: 'ret', label: 'Return' },
      { key: 'year', label: 'Tax year' },
      { key: 'status', label: 'Status' },
      { key: 'blocked', label: 'Blocked by' },
    ],
  },
  download_tax_summary: {
    mode: 'list',
    key: 'download_tax_summary',
    title: 'Download tax summary',
    subtitle: 'Sales-tax filings on file — the Tax Summary screen exports the summary itself.',
    family: 'tax',
    newLabel: 'Summary',
    cols: [
      { key: 'period', label: 'Period' },
      { key: 'jurisdiction', label: 'Jurisdiction' },
      { key: 'collected', label: 'Collected', right: true },
      { key: 'paid', label: 'Paid', right: true },
      { key: 'status', label: 'Status' },
    ],
  },
  tax_income: {
    mode: 'list',
    key: 'tax_income',
    title: 'Income from your transactions',
    subtitle: 'Posted income lines for the current year.',
    family: 'tax',
    newLabel: 'Category',
    cols: [
      { key: 'date', label: 'Date' },
      { key: 'account', label: 'Account' },
      { key: 'description', label: 'Description' },
      { key: 'amount', label: 'Amount', right: true },
    ],
  },
  tax_assets: {
    mode: 'list',
    key: 'tax_assets',
    title: 'Depreciable business assets',
    subtitle: 'Fixed assets and their book value.',
    family: 'tax',
    newLabel: 'Asset',
    cols: [
      { key: 'asset', label: 'Asset' },
      { key: 'placed', label: 'Placed in service' },
      { key: 'cost', label: 'Cost', right: true },
      { key: 'depreciation', label: 'Depreciation', right: true },
      { key: 'book', label: 'Book value', right: true },
      { key: 'status', label: 'Status' },
    ],
  },
  tax_1099k: {
    mode: 'list',
    key: 'tax_1099k',
    title: '1099-K detail',
    subtitle: 'Generated 1099-K rows per seller.',
    family: 'tax',
    newLabel: '1099-K',
    cols: [
      { key: 'seller', label: 'Seller' },
      { key: 'year', label: 'Tax year', right: true },
      { key: 'gross', label: 'Gross amount', right: true },
      { key: 'transactions', label: 'Transactions', right: true },
      { key: 'basis', label: 'Basis' },
      { key: 'status', label: 'Filing status' },
    ],
  },
  payroll_tax: {
    mode: 'list',
    key: 'payroll_tax',
    title: 'Payroll tax',
    subtitle: 'Filed payroll tax forms.',
    family: 'tax',
    newLabel: 'Quarter',
    cols: [
      { key: 'form', label: 'Form' },
      { key: 'period', label: 'Period' },
      { key: 'year', label: 'Year', right: true },
      { key: 'status', label: 'Status' },
      { key: 'filed', label: 'Filed' },
      { key: 'confirmation', label: 'Confirmation' },
    ],
  },
  sales_overview: {
    mode: 'overview',
    title: 'Sales & Get Paid — Overview',
    subtitle: 'Payment-request funnel: Not paid / Paid / Deposited.',
    kpis: [
      { label: 'Not paid', value: '$8,420', delta: '+12%' },
      { label: 'Paid', value: '$24,180', delta: '+8%' },
      { label: 'Deposited', value: '$22,900', delta: '+6%' },
      { label: 'Avg. days to pay', value: '14.2', delta: '−1.3' },
    ],
    actions: [
      ['Invoice', 'receipt_long'],
      ['Receive payment', 'price_check'],
      ['Payment link', 'link'],
      ['Estimate', 'request_quote'],
    ],
    panelTitle: 'Payment funnel',
    panelText: 'Not paid → Paid → Deposited breakdown appears here as a funnel visualization.',
  },
  expenses_overview: {
    mode: 'overview',
    title: 'Expenses & Bills — Overview',
    subtitle: 'Bills, expense transactions, vendors, bill payments.',
    kpis: [
      { label: 'Bills due', value: '$4,080', delta: '3 bills' },
      { label: 'Expenses MTD', value: '$1,840', delta: '+4%' },
      { label: 'Vendors', value: '42', delta: '' },
      { label: '1099 pending', value: '6', delta: '' },
    ],
    actions: [
      ['Bill', 'description'],
      ['Expense', 'credit_card'],
      ['Pay bills', 'account_balance_wallet'],
      ['Vendor', 'domain_add'],
    ],
    panelTitle: 'Receipts inbox',
    panelText: 'Drop, upload, or snap a receipt. Forwarding address: receipts@unsaid.app.',
  },
  tax_overview: {
    mode: 'overview',
    title: 'Business Tax — Overview',
    subtitle: 'Tax deadlines, taxable profit estimate, create actions.',
    kpis: [
      { label: 'Est. taxable profit', value: '$18,240', delta: '' },
      { label: 'Next deadline', value: 'Jan 15, 2027', delta: 'Q4 estimated' },
      { label: 'Sales tax payable', value: '$1,880', delta: '' },
      { label: 'Mapped accounts', value: '31 / 34', delta: '' },
    ],
    actions: [
      ['Tax summary', 'description'],
      ['File', 'upload_file'],
    ],
    panelTitle: 'Map accounts task',
    panelText: 'Map income/expense accounts to tax categories before filing.',
  },
  customers_overview: {
    mode: 'overview',
    title: 'Contacts — Overview',
    subtitle: 'Customers by lifecycle, follow-ups due.',
    kpis: [
      { label: 'Total customers', value: '184', delta: '+9' },
      { label: 'Active', value: '142', delta: '' },
      { label: 'At risk', value: '11', delta: '' },
      { label: 'Outstanding balance', value: '$8,420', delta: '' },
    ],
    actions: [
      ['Customer', 'person_add'],
      ['Estimate', 'request_quote'],
      ['Statement', 'summarize'],
    ],
    panelTitle: 'Top customers by LTV',
    panelText: 'Ranked list of customers by lifetime value.',
  },
  crm_overview: {
    mode: 'overview',
    title: 'CRM — Overview',
    subtitle: 'Customers by lifecycle, new this month, at-risk, follow-ups due.',
    kpis: [
      { label: 'Total customers', value: '184', delta: '+9' },
      { label: 'New this month', value: '9', delta: '' },
      { label: 'At risk', value: '11', delta: '' },
      { label: 'Follow-ups due', value: '14', delta: '' },
    ],
    actions: [
      ['Customer', 'person_add'],
      ['Lead', 'person_search'],
      ['Segment', 'category'],
    ],
    panelTitle: 'Lifecycle stages',
    panelText: 'Lead → Trial → Repeat → VIP → At risk. Segments and follow-up queues feed from here.',
  },
  set_kpi_targets: {
    mode: 'list',
    key: 'set-kpi-targets',
    title: 'KPI targets',
    subtitle: 'Targets the Executive dashboard compares against in vs Plan mode.',
    family: 'settings',
    newLabel: 'Target',
    tabs: ['All'],
    cols: [
      { key: 'metric', label: 'Metric' },
      { key: 'period', label: 'Period' },
      { key: 'target', label: 'Target' },
      { key: 'notes', label: 'Notes' },
    ],
    emptyTitle: 'No KPI targets yet',
    emptySteps: 'Set a target and the Executive dashboard vs Plan compare uses it.',
  },
  set_dashboards: {
    mode: 'list',
    key: 'set-dashboards',
    title: 'Dashboards & widgets',
    subtitle: 'Saved dashboards and their widget counts.',
    family: 'settings',
    newLabel: 'Dashboard',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Dashboard' },
      { key: 'module', label: 'Module' },
      { key: 'widgets', label: 'Widgets' },
      { key: 'sharing', label: 'Sharing' },
      { key: 'status', label: 'Status' },
      { key: 'updated', label: 'Updated' },
    ],
    emptyTitle: 'No dashboards yet',
    emptySteps: 'Dashboards you save appear here.',
  },

  catalog_items: {
    mode: 'list',
    key: 'catalog-items',
    title: 'Catalog items',
    subtitle: 'Every item in the storefront catalog.',
    family: 'catalog',
    newLabel: 'Item',
    tabs: ['All', 'Published', 'Archived'],
    cols: [
      { key: 'name', label: 'Item' },
      { key: 'supplier', label: 'Supplier' },
      { key: 'category', label: 'Category' },
      { key: 'price', label: 'Price' },
      { key: 'status', label: 'Status' },
    ],
    emptyTitle: 'No catalog items yet',
    emptySteps: 'Items appear here as the catalog is imported.',
  },
  blanks: {
    mode: 'list',
    key: 'blanks',
    title: 'Blanks',
    subtitle: 'Canonical blank products available to the Design Studio.',
    family: 'catalog',
    newLabel: 'Blank',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Blank' },
      { key: 'sku', label: 'SKU' },
      { key: 'category', label: 'Category' },
      { key: 'status', label: 'Render state' },
    ],
    emptyTitle: 'No blanks yet',
    emptySteps: 'Blanks are ingested from supplier catalogs.',
  },
  catalog_review: {
    mode: 'list',
    key: 'catalog-review',
    title: 'Catalog review',
    subtitle: 'Canonical products that are not render-ready yet.',
    family: 'catalog',
    newLabel: 'Review item',
    tabs: ['All', 'Needs review'],
    cols: [
      { key: 'name', label: 'Product' },
      { key: 'sku', label: 'SKU' },
      { key: 'category', label: 'Category' },
      { key: 'issue', label: 'Issue' },
      { key: 'status', label: 'Status' },
    ],
    emptyTitle: 'Nothing to review',
    emptySteps: 'Products with missing assets or unverified renders queue here.',
  },

  report_orders: {
    mode: 'list',
    key: 'report-orders',
    title: 'Orders report',
    subtitle: 'Every order with totals.',
    family: 'reports',
    newLabel: 'Report',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Order' },
      { key: 'customer', label: 'Customer' },
      { key: 'status', label: 'Status' },
      { key: 'total', label: 'Total' },
      { key: 'date', label: 'Date' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'This report fills in as the underlying records are created.',
  },
  report_invoices: {
    mode: 'list',
    key: 'report-invoices',
    title: 'Invoices report',
    subtitle: 'Invoices with paid amounts.',
    family: 'reports',
    newLabel: 'Report',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Invoice' },
      { key: 'status', label: 'Status' },
      { key: 'total', label: 'Total' },
      { key: 'paid', label: 'Paid' },
      { key: 'due', label: 'Due' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'This report fills in as the underlying records are created.',
  },
  report_bills: {
    mode: 'list',
    key: 'report-bills',
    title: 'Bills report',
    subtitle: 'Vendor bills with paid amounts.',
    family: 'reports',
    newLabel: 'Report',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Bill' },
      { key: 'status', label: 'Status' },
      { key: 'total', label: 'Total' },
      { key: 'paid', label: 'Paid' },
      { key: 'due', label: 'Due' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'This report fills in as the underlying records are created.',
  },
  report_customers: {
    mode: 'list',
    key: 'report-customers',
    title: 'Customers report',
    subtitle: 'Customer directory.',
    family: 'reports',
    newLabel: 'Report',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Customer' },
      { key: 'company', label: 'Company' },
      { key: 'email', label: 'Email' },
      { key: 'status', label: 'Status' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'This report fills in as the underlying records are created.',
  },
  report_vendors: {
    mode: 'list',
    key: 'report-vendors',
    title: 'Vendors report',
    subtitle: 'Vendor directory.',
    family: 'reports',
    newLabel: 'Report',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Vendor' },
      { key: 'email', label: 'Email' },
      { key: 'status', label: 'Status' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'This report fills in as the underlying records are created.',
  },
  report_suppliers: {
    mode: 'list',
    key: 'report-suppliers',
    title: 'Suppliers report',
    subtitle: 'Supplier directory and ordering status.',
    family: 'reports',
    newLabel: 'Report',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Supplier' },
      { key: 'slug', label: 'Slug' },
      { key: 'status', label: 'Ordering' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'This report fills in as the underlying records are created.',
  },
  report_products: {
    mode: 'list',
    key: 'report-products',
    title: 'Products report',
    subtitle: 'Catalog products by supplier and category.',
    family: 'reports',
    newLabel: 'Report',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Product' },
      { key: 'supplier', label: 'Supplier' },
      { key: 'category', label: 'Category' },
      { key: 'status', label: 'Status' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'This report fills in as the underlying records are created.',
  },
  report_inventory: {
    mode: 'list',
    key: 'report-inventory',
    title: 'Inventory report',
    subtitle: 'Stock on hand by SKU.',
    family: 'reports',
    newLabel: 'Report',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'SKU' },
      { key: 'onHand', label: 'On hand' },
      { key: 'reserved', label: 'Reserved' },
      { key: 'available', label: 'Available' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'This report fills in as the underlying records are created.',
  },
  report_returns: {
    mode: 'list',
    key: 'report-returns',
    title: 'Returns report',
    subtitle: 'Return authorizations.',
    family: 'reports',
    newLabel: 'Report',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'RMA' },
      { key: 'status', label: 'Status' },
      { key: 'reason', label: 'Reason' },
      { key: 'requested', label: 'Requested' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'This report fills in as the underlying records are created.',
  },
  report_fulfillment: {
    mode: 'list',
    key: 'report-fulfillment',
    title: 'Fulfillment report',
    subtitle: 'Fulfillment orders.',
    family: 'reports',
    newLabel: 'Report',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Fulfillment' },
      { key: 'method', label: 'Method' },
      { key: 'status', label: 'Status' },
      { key: 'created', label: 'Created' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'This report fills in as the underlying records are created.',
  },
  report_reconcile: {
    mode: 'list',
    key: 'report-reconcile',
    title: 'Reconcile report',
    subtitle: 'Bank reconciliations.',
    family: 'reports',
    newLabel: 'Report',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Reconciliation' },
      { key: 'balance', label: 'Statement balance' },
      { key: 'difference', label: 'Difference' },
      { key: 'status', label: 'Status' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'This report fills in as the underlying records are created.',
  },
  report_tax: {
    mode: 'list',
    key: 'report-tax',
    title: 'Tax report',
    subtitle: 'Sales tax filings by period.',
    family: 'reports',
    newLabel: 'Report',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Period' },
      { key: 'sales', label: 'Taxable sales' },
      { key: 'collected', label: 'Collected' },
      { key: 'remitted', label: 'Remitted' },
      { key: 'status', label: 'Status' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'This report fills in as the underlying records are created.',
  },
  report_tickets: {
    mode: 'list',
    key: 'report-tickets',
    title: 'Tickets report',
    subtitle: 'Support tickets.',
    family: 'reports',
    newLabel: 'Report',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Ticket' },
      { key: 'subject', label: 'Subject' },
      { key: 'status', label: 'Status' },
      { key: 'priority', label: 'Priority' },
      { key: 'created', label: 'Created' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'This report fills in as the underlying records are created.',
  },
  report_sla: {
    mode: 'list',
    key: 'report-sla',
    title: 'SLA report',
    subtitle: 'Ticket volume and SLA breaches by priority.',
    family: 'reports',
    newLabel: 'Report',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Priority' },
      { key: 'tickets', label: 'Tickets' },
      { key: 'open', label: 'Open' },
      { key: 'breached', label: 'Breached' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'This report fills in as the underlying records are created.',
  },
  report_trust: {
    mode: 'list',
    key: 'report-trust',
    title: 'Trust & safety report',
    subtitle: 'Flagged records needing attention.',
    family: 'reports',
    newLabel: 'Report',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Issue' },
      { key: 'severity', label: 'Severity' },
      { key: 'status', label: 'Status' },
      { key: 'raised', label: 'Raised' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'This report fills in as the underlying records are created.',
  },
  report_leads: {
    mode: 'list',
    key: 'report-leads',
    title: 'Leads report',
    subtitle: 'Leads with scores.',
    family: 'reports',
    newLabel: 'Report',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Lead' },
      { key: 'email', label: 'Email' },
      { key: 'status', label: 'Status' },
      { key: 'score', label: 'Score' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'This report fills in as the underlying records are created.',
  },
  report_newsletter: {
    mode: 'list',
    key: 'report-newsletter',
    title: 'Newsletter report',
    subtitle: 'Email campaigns.',
    family: 'reports',
    newLabel: 'Report',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Campaign' },
      { key: 'type', label: 'Type' },
      { key: 'channel', label: 'Channel' },
      { key: 'status', label: 'Status' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'This report fills in as the underlying records are created.',
  },
  report_promotions: {
    mode: 'list',
    key: 'report-promotions',
    title: 'Promotions report',
    subtitle: 'Promotion codes and usage.',
    family: 'reports',
    newLabel: 'Report',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Code' },
      { key: 'title', label: 'Name' },
      { key: 'type', label: 'Type' },
      { key: 'value', label: 'Value' },
      { key: 'used', label: 'Used' },
      { key: 'status', label: 'Status' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'This report fills in as the underlying records are created.',
  },
  report_social: {
    mode: 'list',
    key: 'report-social',
    title: 'Social report',
    subtitle: 'Social posts.',
    family: 'reports',
    newLabel: 'Report',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Post' },
      { key: 'status', label: 'Status' },
      { key: 'scheduled', label: 'Scheduled' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'This report fills in as the underlying records are created.',
  },
  report_designs: {
    mode: 'list',
    key: 'report-designs',
    title: 'Designs report',
    subtitle: 'Designs and publish state.',
    family: 'reports',
    newLabel: 'Report',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Design' },
      { key: 'type', label: 'Product' },
      { key: 'status', label: 'Status' },
      { key: 'price', label: 'Price' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'This report fills in as the underlying records are created.',
  },
  report_cms: {
    mode: 'list',
    key: 'report-cms',
    title: 'CMS report',
    subtitle: 'Content pages.',
    family: 'reports',
    newLabel: 'Report',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Page' },
      { key: 'slug', label: 'Slug' },
      { key: 'type', label: 'Type' },
      { key: 'status', label: 'Status' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'This report fills in as the underlying records are created.',
  },
  report_channels: {
    mode: 'list',
    key: 'report-channels',
    title: 'Channels report',
    subtitle: 'Sales channels.',
    family: 'reports',
    newLabel: 'Report',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Channel' },
      { key: 'code', label: 'Code' },
      { key: 'status', label: 'Status' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'This report fills in as the underlying records are created.',
  },
  report_bundles: {
    mode: 'list',
    key: 'report-bundles',
    title: 'Bundles report',
    subtitle: 'Product bundles.',
    family: 'reports',
    newLabel: 'Report',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Bundle' },
      { key: 'slug', label: 'Slug' },
      { key: 'price', label: 'Price' },
      { key: 'status', label: 'Status' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'This report fills in as the underlying records are created.',
  },
  report_analytics: {
    mode: 'list',
    key: 'report-analytics',
    title: 'Analytics report',
    subtitle: 'Orders and GMV by channel.',
    family: 'reports',
    newLabel: 'Report',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Channel' },
      { key: 'orders', label: 'Orders' },
      { key: 'gmv', label: 'GMV' },
      { key: 'aov', label: 'AOV' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'This report fills in as the underlying records are created.',
  },
  report_exec_gmv: {
    mode: 'list',
    key: 'report-exec-gmv',
    title: 'Executive GMV & Margins report',
    subtitle: 'Monthly GMV, refunds, and net.',
    family: 'reports',
    newLabel: 'Report',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Month' },
      { key: 'orders', label: 'Orders' },
      { key: 'gmv', label: 'GMV' },
      { key: 'refunds', label: 'Refunds' },
      { key: 'net', label: 'Net' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'This report fills in as the underlying records are created.',
  },
  report_ops_vitals: {
    mode: 'list',
    key: 'report-ops-vitals',
    title: 'Operations Vitals report',
    subtitle: 'Orders and GMV by status.',
    family: 'reports',
    newLabel: 'Report',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Status' },
      { key: 'orders', label: 'Orders' },
      { key: 'gmv', label: 'GMV' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'This report fills in as the underlying records are created.',
  },

  contracts: {
    mode: 'list',
    key: 'contracts',
    title: 'Contracts',
    subtitle: 'Revenue contracts.',
    family: 'reports',
    newLabel: 'Create',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Contract' },
      { key: 'status', label: 'Status' },
      { key: 'value', label: 'Value' },
      { key: 'term', label: 'Term' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'Records appear here as they are created.',
  },
  terms: {
    mode: 'list',
    key: 'terms',
    title: 'Terms & SLAs',
    subtitle: 'Published policy pages.',
    family: 'reports',
    newLabel: 'Create',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Policy' },
      { key: 'slug', label: 'Slug' },
      { key: 'status', label: 'Status' },
      { key: 'effective', label: 'Effective' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'Records appear here as they are created.',
  },
  pricing_tiers: {
    mode: 'list',
    key: 'pricing-tiers',
    title: 'Pricing tiers',
    subtitle: 'Price lists and tiers.',
    family: 'reports',
    newLabel: 'Create',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Price list' },
      { key: 'code', label: 'Code' },
      { key: 'currency', label: 'Currency' },
      { key: 'type', label: 'Type' },
      { key: 'status', label: 'Status' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'Records appear here as they are created.',
  },
  compliance_1099: {
    mode: 'list',
    key: 'compliance-1099',
    title: '1099 / Tax compliance',
    subtitle: 'Filed and draft payroll tax forms.',
    family: 'reports',
    newLabel: 'Create',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Form' },
      { key: 'vendor', label: 'Vendor' },
      { key: 'amount', label: 'Amount' },
      { key: 'status', label: 'Status' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'Records appear here as they are created.',
  },
  compliance_audit: {
    mode: 'list',
    key: 'compliance-audit',
    title: 'Audit trail',
    subtitle: 'Every recorded change across the workspace.',
    family: 'reports',
    newLabel: 'Create',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Event' },
      { key: 'when', label: 'When' },
      { key: 'table', label: 'Record' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'Records appear here as they are created.',
  },
  compliance_certifications: {
    mode: 'list',
    key: 'compliance-certifications',
    title: 'Certifications',
    subtitle: 'Compliance certifications.',
    family: 'reports',
    newLabel: 'Create',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Certification' },
      { key: 'status', label: 'Status' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'Records appear here as they are created.',
  },
  onboarding_requests: {
    mode: 'list',
    key: 'onboarding-requests',
    title: 'Onboarding requests',
    subtitle: 'Seller onboarding requests.',
    family: 'reports',
    newLabel: 'Request',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Seller' },
      { key: 'email', label: 'Email' },
      { key: 'type', label: 'Type' },
      { key: 'status', label: 'Status' },
      { key: 'requested', label: 'Requested' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'Records appear here as they are created.',
  },
  onboarding_approvals: {
    mode: 'list',
    key: 'onboarding-approvals',
    title: 'Approvals',
    subtitle: 'Seller approvals.',
    family: 'reports',
    newLabel: 'Approval',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Seller' },
      { key: 'email', label: 'Email' },
      { key: 'status', label: 'Status' },
      { key: 'approved', label: 'Approved' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'Records appear here as they are created.',
  },
  onboarding_vendor_portal: {
    mode: 'list',
    key: 'onboarding-vendor-portal',
    title: 'Vendor portal',
    subtitle: 'Suppliers with portal access.',
    family: 'reports',
    newLabel: 'Vendor',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Supplier' },
      { key: 'slug', label: 'Slug' },
      { key: 'kind', label: 'Kind' },
      { key: 'status', label: 'Ordering' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'Records appear here as they are created.',
  },
  feed_printful: {
    mode: 'list',
    key: 'feed-printful',
    title: 'Printful API feed',
    subtitle: 'Printful catalog products synced to the platform.',
    family: 'reports',
    newLabel: 'Product',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Product' },
      { key: 'brand', label: 'Brand' },
      { key: 'category', label: 'Category' },
      { key: 'variants', label: 'Variants' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'Records appear here as they are created.',
  },
  feed_printify: {
    mode: 'list',
    key: 'feed-printify',
    title: 'Printify API feed',
    subtitle: 'Printify catalog products synced to the platform.',
    family: 'reports',
    newLabel: 'Product',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Product' },
      { key: 'brand', label: 'Brand' },
      { key: 'category', label: 'Category' },
      { key: 'variants', label: 'Variants' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'Records appear here as they are created.',
  },
  feed_gelato: {
    mode: 'list',
    key: 'feed-gelato',
    title: 'Gelato API feed',
    subtitle: 'Gelato catalog products synced to the platform.',
    family: 'reports',
    newLabel: 'Product',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Product' },
      { key: 'brand', label: 'Brand' },
      { key: 'category', label: 'Category' },
      { key: 'variants', label: 'Variants' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'Records appear here as they are created.',
  },
  feed_stripe: {
    mode: 'list',
    key: 'feed-stripe',
    title: 'Stripe Connect & Clearing',
    subtitle: 'Seller settlements through Stripe.',
    family: 'reports',
    newLabel: 'Settlement',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Seller' },
      { key: 'period', label: 'Settled' },
      { key: 'gross', label: 'Gross' },
      { key: 'net', label: 'Net' },
      { key: 'status', label: 'Status' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'Records appear here as they are created.',
  },
  feed_receipts: {
    mode: 'list',
    key: 'feed-receipts',
    title: 'Receipts feed',
    subtitle: 'Documents received into the inbox.',
    family: 'reports',
    newLabel: 'Receipt',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Kind' },
      { key: 'source', label: 'Source' },
      { key: 'status', label: 'Status' },
      { key: 'received', label: 'Received' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'Records appear here as they are created.',
  },
  suppliers_overview: {
    mode: 'list',
    key: 'suppliers-overview',
    title: 'Suppliers overview',
    subtitle: 'Supplier directory.',
    family: 'reports',
    newLabel: 'Supplier',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Supplier' },
      { key: 'kind', label: 'Kind' },
      { key: 'catalog', label: 'Catalog' },
      { key: 'status', label: 'Ordering' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'Records appear here as they are created.',
  },
  reports_overview: {
    mode: 'list',
    key: 'reports-overview',
    title: 'Reports overview',
    subtitle: 'Saved report packages and snapshots.',
    family: 'reports',
    newLabel: 'Report',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Package' },
      { key: 'snapshots', label: 'Snapshots' },
      { key: 'created', label: 'Created' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'Records appear here as they are created.',
  },
  catalog_overview: {
    mode: 'list',
    key: 'catalog-overview',
    title: 'Catalog overview',
    subtitle: 'Catalog totals by area.',
    family: 'catalog',
    newLabel: 'Item',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Area' },
      { key: 'count', label: 'Count' },
      { key: 'detail', label: 'Detail' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'Records appear here as they are created.',
  },
  order_detail: {
    mode: 'list',
    key: 'order-detail',
    title: 'Order detail',
    subtitle: 'Orders with balances.',
    family: 'orders',
    newLabel: 'Order',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Order' },
      { key: 'customer', label: 'Customer' },
      { key: 'method', label: 'Method' },
      { key: 'status', label: 'Status' },
      { key: 'total', label: 'Total' },
      { key: 'balance', label: 'Balance' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'Records appear here as they are created.',
  },
  order_issues: {
    mode: 'list',
    key: 'order-issues',
    title: 'Order issues',
    subtitle: 'Orders flagged as needing attention.',
    family: 'orders',
    newLabel: 'Order',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Order' },
      { key: 'issue', label: 'Issue' },
      { key: 'status', label: 'Status' },
      { key: 'total', label: 'Total' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'Records appear here as they are created.',
  },
  packing_slip: {
    mode: 'list',
    key: 'packing-slip',
    title: 'Packing slips',
    subtitle: 'Fulfillments awaiting packing.',
    family: 'orders',
    newLabel: 'Slip',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Fulfillment' },
      { key: 'method', label: 'Method' },
      { key: 'status', label: 'Status' },
      { key: 'created', label: 'Created' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'Records appear here as they are created.',
  },
  set_sla_policies: {
    mode: 'list',
    key: 'set-sla-policies',
    title: 'SLA policies',
    subtitle: 'Support SLA policies.',
    family: 'settings',
    newLabel: 'Policy',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Policy' },
      { key: 'firstResponse', label: 'First response' },
      { key: 'resolution', label: 'Resolution' },
      { key: 'status', label: 'Status' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'Records appear here as they are created.',
  },
  set_bank_rules: {
    mode: 'list',
    key: 'set-bank-rules',
    title: 'Bank rules',
    subtitle: 'Auto-categorization rules for the bank feed.',
    family: 'settings',
    newLabel: 'Rule',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Rule' },
      { key: 'applies', label: 'Applies to' },
      { key: 'type', label: 'Type' },
      { key: 'status', label: 'Status' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'Records appear here as they are created.',
  },
  set_coa: {
    mode: 'list',
    key: 'set-coa',
    title: 'Chart of accounts',
    subtitle: 'General ledger accounts.',
    family: 'settings',
    newLabel: 'Account',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Account' },
      { key: 'code', label: 'Code' },
      { key: 'type', label: 'Type' },
      { key: 'status', label: 'Status' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'Records appear here as they are created.',
  },
  set_business_tax: {
    mode: 'list',
    key: 'set-business-tax',
    title: 'Business tax',
    subtitle: 'Tax jurisdictions.',
    family: 'settings',
    newLabel: 'Jurisdiction',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Jurisdiction' },
      { key: 'code', label: 'Code' },
      { key: 'region', label: 'Region' },
      { key: 'status', label: 'Status' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'Records appear here as they are created.',
  },
  set_help_center: {
    mode: 'list',
    key: 'set-help-center',
    title: 'Help center',
    subtitle: 'Knowledge base articles.',
    family: 'settings',
    newLabel: 'Article',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Article' },
      { key: 'slug', label: 'Collection' },
      { key: 'status', label: 'Status' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'Records appear here as they are created.',
  },
  set_kb_config: {
    mode: 'list',
    key: 'set-kb-config',
    title: 'Knowledge base',
    subtitle: 'Knowledge base articles.',
    family: 'settings',
    newLabel: 'Article',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Article' },
      { key: 'slug', label: 'Collection' },
      { key: 'status', label: 'Status' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'Records appear here as they are created.',
  },
  set_automation_rules: {
    mode: 'list',
    key: 'set-automation-rules',
    title: 'Automation rules',
    subtitle: 'Marketing automation workflows.',
    family: 'settings',
    newLabel: 'Workflow',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Workflow' },
      { key: 'type', label: 'Type' },
      { key: 'status', label: 'Status' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'Records appear here as they are created.',
  },
  set_segments_lists: {
    mode: 'list',
    key: 'set-segments-lists',
    title: 'Segments & lists',
    subtitle: 'Customer segments.',
    family: 'settings',
    newLabel: 'Segment',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Segment' },
      { key: 'detail', label: 'Detail' },
      { key: 'status', label: 'Status' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'Records appear here as they are created.',
  },
  set_social_channels: {
    mode: 'list',
    key: 'set-social-channels',
    title: 'Social channels',
    subtitle: 'Connected social accounts.',
    family: 'settings',
    newLabel: 'Channel',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Network' },
      { key: 'handle', label: 'Handle' },
      { key: 'status', label: 'Status' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'Records appear here as they are created.',
  },
  set_integrations: {
    mode: 'list',
    key: 'set-integrations',
    title: 'Integrations',
    subtitle: 'Connected suppliers and services.',
    family: 'settings',
    newLabel: 'Integration',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Integration' },
      { key: 'kind', label: 'Kind' },
      { key: 'source', label: 'Source' },
      { key: 'status', label: 'Status' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'Records appear here as they are created.',
  },
  set_integration_feeds: {
    mode: 'list',
    key: 'set-integration-feeds',
    title: 'Integration feeds',
    subtitle: 'Catalog products synced per supplier.',
    family: 'settings',
    newLabel: 'Feed',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Supplier' },
      { key: 'products', label: 'Products' },
      { key: 'status', label: 'Status' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'Records appear here as they are created.',
  },
  set_vendors_suppliers: {
    mode: 'list',
    key: 'set-vendors-suppliers',
    title: 'Vendors & suppliers',
    subtitle: 'Vendor directory.',
    family: 'settings',
    newLabel: 'Vendor',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Vendor' },
      { key: 'email', label: 'Email' },
      { key: 'status', label: 'Status' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'Records appear here as they are created.',
  },
  set_supplier_portal: {
    mode: 'list',
    key: 'set-supplier-portal',
    title: 'Supplier portal',
    subtitle: 'Suppliers and ordering status.',
    family: 'settings',
    newLabel: 'Supplier',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Supplier' },
      { key: 'slug', label: 'Slug' },
      { key: 'status', label: 'Ordering' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'Records appear here as they are created.',
  },
  set_inventory_warehouses: {
    mode: 'list',
    key: 'set-inventory-warehouses',
    title: 'Inventory & warehouses',
    subtitle: 'Warehouses.',
    family: 'settings',
    newLabel: 'Warehouse',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Warehouse' },
      { key: 'code', label: 'Code' },
      { key: 'type', label: 'Type' },
      { key: 'location', label: 'Location' },
      { key: 'status', label: 'Status' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'Records appear here as they are created.',
  },
  set_financial: {
    mode: 'list',
    key: 'set-financial',
    title: 'Financial settings',
    subtitle: 'Legal entities, currency, and fiscal year.',
    family: 'settings',
    newLabel: 'Entity',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Entity' },
      { key: 'currency', label: 'Currency' },
      { key: 'fiscal', label: 'Fiscal year start' },
      { key: 'status', label: 'Status' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'Records appear here as they are created.',
  },
  set_lead_capture: {
    mode: 'list',
    key: 'set-lead-capture',
    title: 'Lead capture',
    subtitle: 'Webforms capturing leads.',
    family: 'settings',
    newLabel: 'Form',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Form' },
      { key: 'slug', label: 'Slug' },
      { key: 'status', label: 'Status' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'Records appear here as they are created.',
  },
  set_newsletter_email: {
    mode: 'list',
    key: 'set-newsletter-email',
    title: 'Newsletter & email',
    subtitle: 'Email campaigns.',
    family: 'settings',
    newLabel: 'Campaign',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Campaign' },
      { key: 'type', label: 'Type' },
      { key: 'status', label: 'Status' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'Records appear here as they are created.',
  },
  set_pricing_discounts: {
    mode: 'list',
    key: 'set-pricing-discounts',
    title: 'Pricing & discounts',
    subtitle: 'Promotion codes and discounts.',
    family: 'settings',
    newLabel: 'Promotion',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Code' },
      { key: 'title', label: 'Name' },
      { key: 'type', label: 'Type' },
      { key: 'value', label: 'Value' },
      { key: 'status', label: 'Status' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'Records appear here as they are created.',
  },
  set_products_bundles: {
    mode: 'list',
    key: 'set-products-bundles',
    title: 'Products & bundles',
    subtitle: 'Product bundles.',
    family: 'settings',
    newLabel: 'Bundle',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Bundle' },
      { key: 'slug', label: 'Slug' },
      { key: 'price', label: 'Price' },
      { key: 'status', label: 'Status' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'Records appear here as they are created.',
  },
  set_publishing_queue: {
    mode: 'list',
    key: 'set-publishing-queue',
    title: 'Publishing queue',
    subtitle: 'Social posts waiting to publish.',
    family: 'settings',
    newLabel: 'Post',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Post' },
      { key: 'status', label: 'Status' },
      { key: 'scheduled', label: 'Scheduled' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'Records appear here as they are created.',
  },
  set_ad_center: {
    mode: 'list',
    key: 'set-ad-center',
    title: 'Ad Center',
    subtitle: 'Advertising campaigns.',
    family: 'settings',
    newLabel: 'Campaign',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Campaign' },
      { key: 'network', label: 'Delivery' },
      { key: 'status', label: 'Status' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'Records appear here as they are created.',
  },
  set_audit: {
    mode: 'list',
    key: 'set-audit',
    title: 'Audit log',
    subtitle: 'Workspace change history.',
    family: 'settings',
    newLabel: 'Event',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Event' },
      { key: 'when', label: 'When' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'Records appear here as they are created.',
  },
  set_api_tokens: {
    mode: 'list',
    key: 'set-api-tokens',
    title: 'API tokens',
    subtitle: 'Storefront and partner API keys.',
    family: 'settings',
    newLabel: 'Key',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Key' },
      { key: 'prefix', label: 'Prefix' },
      { key: 'tier', label: 'Tier' },
      { key: 'status', label: 'Status' },
      { key: 'used', label: 'Last used' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'Records appear here as they are created.',
  },
  set_categories_tags: {
    mode: 'list',
    key: 'set-categories-tags',
    title: 'Categories & tags',
    subtitle: 'Catalog taxonomy.',
    family: 'settings',
    newLabel: 'Category',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Category' },
      { key: 'level', label: 'Level' },
      { key: 'slug', label: 'Slug' },
      { key: 'status', label: 'Status' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'Records appear here as they are created.',
  },
  set_design_studio: {
    mode: 'list',
    key: 'set-design-studio',
    title: 'Design Studio settings',
    subtitle: 'Stored Design Studio configuration.',
    family: 'settings',
    newLabel: 'Setting',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Setting' },
      { key: 'value', label: 'Value' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'Records appear here as they are created.',
  },
  set_report_dashboards: {
    mode: 'list',
    key: 'set-report-dashboards',
    title: 'Report dashboards',
    subtitle: 'Saved dashboards.',
    family: 'settings',
    newLabel: 'Dashboard',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Dashboard' },
      { key: 'module', label: 'Module' },
      { key: 'sharing', label: 'Sharing' },
      { key: 'status', label: 'Status' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'Records appear here as they are created.',
  },
  set_fulfillment_shipping: {
    mode: 'list',
    key: 'set-fulfillment-shipping',
    title: 'Fulfillment & shipping',
    subtitle: 'Shipping carriers.',
    family: 'settings',
    newLabel: 'Carrier',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Carrier' },
      { key: 'code', label: 'Code' },
      { key: 'status', label: 'Status' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'Records appear here as they are created.',
  },
  set_analytics_config: {
    mode: 'list',
    key: 'set-analytics-config',
    title: 'Analytics config',
    subtitle: 'Analytics config configuration.',
    family: 'settings',
    newLabel: 'Item',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Name' },
      { key: 'status', label: 'Status' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'Records appear here as they are created.',
  },
  set_compliance_config: {
    mode: 'list',
    key: 'set-compliance-config',
    title: 'Compliance config',
    subtitle: 'Compliance config configuration.',
    family: 'settings',
    newLabel: 'Item',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Name' },
      { key: 'status', label: 'Status' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'Records appear here as they are created.',
  },
  set_contracts_config: {
    mode: 'list',
    key: 'set-contracts-config',
    title: 'Contracts config',
    subtitle: 'Contracts config configuration.',
    family: 'settings',
    newLabel: 'Item',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Name' },
      { key: 'status', label: 'Status' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'Records appear here as they are created.',
  },
  set_customer_hub: {
    mode: 'list',
    key: 'set-customer-hub',
    title: 'Customer hub',
    subtitle: 'Customer hub configuration.',
    family: 'settings',
    newLabel: 'Item',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Name' },
      { key: 'status', label: 'Status' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'Records appear here as they are created.',
  },
  set_data_privacy: {
    mode: 'list',
    key: 'set-data-privacy',
    title: 'Data & privacy',
    subtitle: 'Data & privacy configuration.',
    family: 'settings',
    newLabel: 'Item',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Name' },
      { key: 'status', label: 'Status' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'Records appear here as they are created.',
  },
  set_gmb: {
    mode: 'list',
    key: 'set-gmb',
    title: 'Google Business',
    subtitle: 'Google Business configuration.',
    family: 'settings',
    newLabel: 'Item',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Name' },
      { key: 'status', label: 'Status' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'Records appear here as they are created.',
  },
  set_notifications: {
    mode: 'list',
    key: 'set-notifications',
    title: 'Notifications',
    subtitle: 'Notifications configuration.',
    family: 'settings',
    newLabel: 'Item',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Name' },
      { key: 'status', label: 'Status' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'Records appear here as they are created.',
  },
  set_outbound: {
    mode: 'list',
    key: 'set-outbound',
    title: 'Outbound',
    subtitle: 'Outbound configuration.',
    family: 'settings',
    newLabel: 'Item',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Name' },
      { key: 'status', label: 'Status' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'Records appear here as they are created.',
  },
  set_recurring_templates: {
    mode: 'list',
    key: 'set-recurring-templates',
    title: 'Recurring templates',
    subtitle: 'Recurring templates configuration.',
    family: 'settings',
    newLabel: 'Item',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Name' },
      { key: 'status', label: 'Status' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'Records appear here as they are created.',
  },
  set_report_templates: {
    mode: 'list',
    key: 'set-report-templates',
    title: 'Report templates',
    subtitle: 'Report templates configuration.',
    family: 'settings',
    newLabel: 'Item',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Name' },
      { key: 'status', label: 'Status' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'Records appear here as they are created.',
  },
  set_reports_budgets: {
    mode: 'list',
    key: 'set-reports-budgets',
    title: 'Reports & budgets',
    subtitle: 'Reports & budgets configuration.',
    family: 'settings',
    newLabel: 'Item',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Name' },
      { key: 'status', label: 'Status' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'Records appear here as they are created.',
  },
  set_scheduled_reports: {
    mode: 'list',
    key: 'set-scheduled-reports',
    title: 'Scheduled reports',
    subtitle: 'Scheduled reports configuration.',
    family: 'settings',
    newLabel: 'Item',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Name' },
      { key: 'status', label: 'Status' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'Records appear here as they are created.',
  },
  set_support_channels: {
    mode: 'list',
    key: 'set-support-channels',
    title: 'Support channels',
    subtitle: 'Support channels configuration.',
    family: 'settings',
    newLabel: 'Item',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Name' },
      { key: 'status', label: 'Status' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'Records appear here as they are created.',
  },
  set_ticket_channels: {
    mode: 'list',
    key: 'set-ticket-channels',
    title: 'Ticket channels',
    subtitle: 'Ticket channels configuration.',
    family: 'settings',
    newLabel: 'Item',
    tabs: ['All'],
    cols: [
      { key: 'name', label: 'Name' },
      { key: 'status', label: 'Status' },
    ],
    emptyTitle: 'No data yet',
    emptySteps: 'Records appear here as they are created.',
  },

};

export interface DrawerField {
  label: string;
  type: string;
  placeholder?: string;
  value?: string;
}

export const DRAWER_FIELDS: Record<string, DrawerField[]> = {
  Invoice: [
    { label: 'Customer', type: 'text', placeholder: 'Add customer' },
    { label: 'Invoice no.', type: 'text', value: '1003' },
    { label: 'Terms', type: 'text', value: 'Net 30' },
    { label: 'Invoice date', type: 'date', value: '2026-11-01' },
    { label: 'Due date', type: 'date', value: '2026-12-01' },
  ],
  Customer: [
    { label: 'Company name', type: 'text' },
    { label: 'Display name', type: 'text' },
    { label: 'First name', type: 'text' },
    { label: 'Last name', type: 'text' },
    { label: 'Email', type: 'email' },
    { label: 'Phone', type: 'tel' },
  ],
  Vendor: [
    { label: 'Company name', type: 'text' },
    { label: 'Email', type: 'email' },
    { label: 'Terms', type: 'text', value: 'Net 30' },
    { label: 'Default expense account', type: 'text' },
  ],
  Product: [
    { label: 'Name', type: 'text' },
    { label: 'Type', type: 'text', value: 'Product' },
    { label: 'SKU', type: 'text' },
    { label: 'Sales price', type: 'number' },
  ],
};

export type CreateDotToken =
  | 'bg-primary'
  | 'bg-secondary'
  | 'bg-tertiary'
  | 'bg-qb-navy'
  | 'bg-primary-container'
  | 'bg-error';

export interface CreateRegistryCategory {
  title: string;
  dot: CreateDotToken;
  items: { label: string; desc: string; icon: string }[];
}

export const CREATE_REGISTRY: CreateRegistryCategory[] = [
  {
    title: 'Customers',
    dot: 'bg-primary',
    items: [
      { label: 'Invoice', desc: 'Document engine — Edit/Email/Payor/PDF', icon: 'receipt_long' },
      { label: 'Payment link', desc: 'Amount, description, share link/QR', icon: 'link' },
      { label: 'Receive payment', desc: 'Apply to open invoices', icon: 'price_check' },
      { label: 'Statement', desc: 'Batch billing summary', icon: 'summarize' },
      { label: 'Estimate', desc: 'Convert to Invoice', icon: 'request_quote' },
      { label: 'Sales receipt', desc: 'Instant settlement', icon: 'point_of_sale' },
      { label: 'Credit memo', desc: 'RMA / reduction', icon: 'assignment_return' },
      { label: 'Add customer', desc: 'Party drawer, role=Customer', icon: 'person_add' },
      { label: 'Appointment', desc: 'Book customer, staff, service, time', icon: 'event_available' },
    ],
  },
  {
    title: 'Vendors & Suppliers',
    dot: 'bg-secondary',
    items: [
      { label: 'Expense', desc: 'Payee, date, paid-from, category', icon: 'credit_card' },
      { label: 'Check', desc: 'Print later option', icon: 'payments' },
      { label: 'Bill', desc: 'Capture panel, Tags toggle', icon: 'description' },
      { label: 'Pay bills', desc: 'Payment workspace', icon: 'account_balance_wallet' },
      { label: 'Purchase order', desc: 'Blank/SKU lines', icon: 'shopping_bag' },
      { label: 'Vendor credit', desc: 'Supplier refund', icon: 'savings' },
      { label: 'Add vendor', desc: 'Party drawer, role=Vendor', icon: 'domain_add' },
      { label: 'Add supplier', desc: 'Party drawer, role=Supplier', icon: 'factory' },
    ],
  },
  {
    title: 'Team',
    dot: 'bg-tertiary',
    items: [
      { label: 'Add contractor', desc: 'Name, email, W-9 invite', icon: 'engineering' },
      { label: 'Time entry', desc: 'Optional, later', icon: 'schedule' },
    ],
  },
  {
    title: 'Other (books)',
    dot: 'bg-qb-navy',
    items: [
      { label: 'Task', desc: 'Quick to-do', icon: 'task' },
      { label: 'Bank deposit', desc: 'Combine funds', icon: 'account_balance' },
      { label: 'Journal entry', desc: 'Double-entry debit/credit', icon: 'menu_book' },
      { label: 'Transfer', desc: 'Inter-account treasury', icon: 'swap_horiz' },
      { label: 'Reconcile', desc: 'Setup + tie-out', icon: 'fact_check' },
      { label: 'Settlement', desc: 'Stripe/Shopify split', icon: 'assured_workload' },
      { label: 'Add product/service', desc: 'Drawer w/ Sales/Purchasing/Accounting', icon: 'checkroom' },
      { label: 'Add account', desc: 'CoA drawer', icon: 'account_tree' },
    ],
  },
  {
    title: 'Catalog & Marketing',
    dot: 'bg-primary-container',
    items: [
      { label: 'Design', desc: 'Konva studio', icon: 'palette' },
      { label: 'Product', desc: 'Open Studio from drawer', icon: 'checkroom' },
      { label: 'Collection', desc: 'Canvas builder', icon: 'collections_bookmark' },
      { label: 'Category', desc: 'Record drawer', icon: 'category' },
      { label: 'Banner', desc: 'Storefront slot', icon: 'view_carousel' },
      { label: 'Popup', desc: 'Creative popup', icon: 'open_in_new' },
      { label: 'Discount code', desc: 'Type, value, window', icon: 'sell' },
      { label: 'Campaign', desc: 'Meta/TikTok/Google Ads', icon: 'campaign' },
      { label: 'Post', desc: 'Multi-channel content', icon: 'share' },
      { label: 'Newsletter', desc: 'Campaign builder', icon: 'mail' },
    ],
  },
  {
    title: 'Support & Orders',
    dot: 'bg-error',
    items: [
      { label: 'Sales order', desc: 'Order document', icon: 'shopping_cart_checkout' },
      { label: 'Return/RMA', desc: 'Return authorization', icon: 'assignment_return' },
      { label: 'Ticket', desc: 'Support ticket', icon: 'confirmation_number' },
      { label: 'Add note', desc: 'Quick note', icon: 'note_add' },
      { label: 'Void', desc: 'Void a transaction', icon: 'block' },
    ],
  },
];

// ── DESIGN STUDIO — Studio > Catalog & Create Wizard department lists ──
// Both areas list studio-eligible products from the global catalog, by
// department (Men / Women / Children / Home Living). They share one shape.
const STUDIO_DEPARTMENTS: [string, string][] = [
  ['men', 'Men'],
  ['women', 'Women'],
  ['children', 'Children'],
  ['home-living', 'Home Living'],
];


for (const [slug, label] of STUDIO_DEPARTMENTS) {
  for (const [prefix, subtitle] of [
    ['studio', 'Studio-eligible products from the global catalog.'],
    ['wizard', 'Create wizard — start from a department product.'],
  ] as [string, string][]) {
    const id = `${prefix}-${slug}`;
    SCREEN_DEFS[id] = {
      mode: 'list',
      key: id,
      title: label,
      subtitle,
      family: 'catalog',
      newLabel: 'Design',
      tabs: ['All', 'Eligible', 'Review', 'Discontinued'],
      cols: [
        { key: 'product', label: 'Product' },
        { key: 'blank', label: 'Blank' },
        { key: 'supplier', label: 'Supplier' },
        { key: 'eligibility', label: 'Studio eligibility' },
        { key: 'status', label: 'Status' },
      ],
      createActionsRow: [
        ['Design', 'palette'],
        ['Collection', 'collections_bookmark'],
        ['Product', 'checkroom'],
      ],
    };
  }
}

// ── DESIGN STUDIO — My products / My orders / wizard velocity lists ──
SCREEN_DEFS['studio-create-order'] = {
  mode: 'list',
  key: 'studio-create-order',
  title: 'Create Order',
  subtitle: 'Draft a production order from your designed products.',
  family: 'document',
  newLabel: 'Order draft',
  tabs: ['All', 'Draft', 'Submitted', 'Fulfilled'],
  cols: [
    { key: 'draft', label: 'Order draft' },
    { key: 'product', label: 'Product mix' },
    { key: 'store', label: 'Store' },
    { key: 'items', label: 'Items', right: true },
    { key: 'status', label: 'Status' },
  ],
  createActionsRow: [
    ['Order draft', 'post_add'],
    ['My stores', 'storefront'],
    ['Product', 'checkroom'],
  ],
};

SCREEN_DEFS['studio-my-stores'] = {
  mode: 'list',
  key: 'studio-my-stores',
  title: 'My Stores',
  subtitle: 'Storefronts your designed products publish to.',
  family: 'sales',
  newLabel: 'Store',
  tabs: ['All', 'Connected', 'Paused'],
  cols: [
    { key: 'store', label: 'Store' },
    { key: 'channel', label: 'Channel' },
    { key: 'live', label: 'Products live', right: true },
    { key: 'status', label: 'Status' },
  ],
  createActionsRow: [
    ['Store', 'storefront'],
    ['Order draft', 'post_add'],
    ['Product', 'checkroom'],
  ],
};

SCREEN_DEFS['studio-orders'] = {
  mode: 'list',
  key: 'studio-orders',
  title: 'My orders',
  subtitle: 'Production orders for your designed products.',
  family: 'document',
  newLabel: 'Order',
  tabs: ['All', 'In production', 'Shipped', 'Delivered'],
  cols: [
    { key: 'order', label: 'Order' },
    { key: 'placed', label: 'Placed' },
    { key: 'product', label: 'Product' },
    { key: 'store', label: 'Store' },
    { key: 'status', label: 'Status' },
  ],
  createActionsRow: [
    ['Order draft', 'post_add'],
    ['Product', 'checkroom'],
    ['Store', 'storefront'],
  ],
};

for (const [id, title, subtitle, metricKey, metricLabel] of [
  ['wizard-best-selling', 'Best Selling', 'Start a design from a proven top seller.', 'units', 'Units 30d'],
  ['wizard-fast-selling', 'Fast Selling', 'Fast-turn products with the quickest fulfillment.', 'speed', 'Fulfillment'],
] as [string, string, string, string, string][]) {
  SCREEN_DEFS[id] = {
    mode: 'list',
    key: id,
    title,
    subtitle,
    family: 'catalog',
    newLabel: 'Design',
    tabs: ['All', 'Apparel', 'Home', 'Accessories'],
    cols: [
      { key: 'product', label: 'Product' },
      { key: 'department', label: 'Department' },
      { key: metricKey, label: metricLabel, right: true },
      { key: 'trend', label: 'Trend' },
      { key: 'status', label: 'Status' },
    ],
    createActionsRow: [
      ['Design', 'palette'],
      ['Product', 'checkroom'],
      ['Collection', 'collections_bookmark'],
    ],
  };
}

// Published Items & SKUs — seeded with one demo row. Published designs from
// the Design Studio are dynamically prepended at render time (see
// ScreenContent.tsx TabScreenRenderer → published-skus branch).
SCREEN_DEFS['published-skus'] = {
  mode: 'list',
  key: 'published-skus',
  title: 'Published Items & SKUs',
  subtitle: 'Designs published from the Studio — live across all channels.',
  family: 'catalog',
  newLabel: 'Product',
  tabs: ['All', 'Published', 'Draft'],
  cols: [
    { key: 'product', label: 'Product' },
    { key: 'brand', label: 'Brand' },
    { key: 'color', label: 'Color' },
    { key: 'sizes', label: 'Sizes' },
    { key: 'supplier', label: 'Supplier' },
    { key: 'status', label: 'Status' },
  ],
  createActionsRow: [
    ['Product', 'checkroom'],
    ['Design', 'palette'],
    ['Collection', 'collections_bookmark'],
  ],
};
