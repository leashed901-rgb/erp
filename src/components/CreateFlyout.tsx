'use client';

import { useEffect, useRef, useState, useMemo } from 'react';
import { useTenantActions } from '@/hooks/useTenant';
import { CREATE_REGISTRY } from '@/data/shellData';
import styles from './CreateFlyout.module.css';

interface CreateFlyoutProps {
  open: boolean;
  onClose: () => void;
  onSelectCreate: (label: string) => void;
}

/**
 * Domain map — the system has 9 domains. Each tenant action's `module`
 * field maps to one of these domains. The Create flyout shows create actions
 * grouped by domain, NOT by the 49 arbitrary `area` values the API returns.
 */
const MODULE_TO_DOMAIN: Record<string, { label: string; icon: string }> = {
  crm:          { label: 'Contacts',      icon: 'groups' },
  finance:      { label: 'Finance',        icon: 'account_balance' },
  catalog:      { label: 'Catalog',        icon: 'inventory_2' },
  orders:       { label: 'Orders',         icon: 'local_shipping' },
  inventory:    { label: 'Orders',         icon: 'local_shipping' },
  marketing:    { label: 'Marketing',      icon: 'campaign' },
  advertising:  { label: 'Marketing',      icon: 'campaign' },
  social:       { label: 'Marketing',      icon: 'campaign' },
  studio:       { label: 'Design Studio',  icon: 'palette' },
  support:      { label: 'Support',        icon: 'support_agent' },
  payroll:      { label: 'Finance',        icon: 'payments' },
  business_tax: { label: 'Finance',        icon: 'receipt_long' },
  sales_tax:    { label: 'Finance',        icon: 'receipt_long' },
  cap_table:    { label: 'Finance',        icon: 'trending_up' },
  tasks:        { label: 'Dashboard',      icon: 'dashboard' },
  time:         { label: 'Dashboard',      icon: 'schedule' },
  learning:     { label: 'Dashboard',      icon: 'school' },
  reports:      { label: 'Dashboard',      icon: 'bar_chart' },
  settings:     { label: 'Settings',       icon: 'settings' },
  platform:     { label: 'Settings',       icon: 'settings' },
};

/** Domain display order — matches the rail order. */
const DOMAIN_ORDER = [
  'Dashboard',
  'Contacts',
  'Catalog',
  'Design Studio',
  'Orders',
  'Finance',
  'Marketing',
  'Support',
  'Settings',
];

/** Map a CREATE_REGISTRY category title to a domain (fallback when tenant
 *  actions aren't loaded). */
const REGISTRY_TO_DOMAIN: Record<string, string> = {
  'Customers': 'Contacts',
  'Vendors': 'Contacts',
  'Team': 'Finance',
  'Other': 'Finance',
  'Journal': 'Finance',
  'Catalog': 'Catalog',
  'Appointments': 'Contacts',
};

function iconForAction(action: { object_type?: string; area?: string }): string {
  const t = action.object_type || '';
  if (t === 'invoice') return 'receipt_long';
  if (t === 'estimate') return 'request_quote';
  if (t === 'bill') return 'description';
  if (t === 'customer' || t === 'vendor' || t === 'party') return 'person_add';
  if (t === 'product') return 'inventory_2';
  if (t === 'order') return 'shopping_cart';
  if (t === 'rma' || t === 'return') return 'assignment_return';
  if (t === 'campaign') return 'campaign';
  if (t === 'post' || t === 'social') return 'share';
  if (t === 'appointment') return 'event_available';
  if (t === 'task') return 'task_alt';
  if (t === 'ticket') return 'support_agent';
  if (t === 'lead') return 'person_search';
  if (t === 'deal') return 'trending_up';
  if (t === 'journal') return 'book';
  if (t === 'design') return 'palette';
  return 'add_circle';
}

export default function CreateFlyout({
  open,
  onClose,
  onSelectCreate,
}: CreateFlyoutProps) {
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement | null>(null);

  const { grouped: tenantActions, loaded: actionsLoaded } = useTenantActions();

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => searchRef.current?.focus(), 60);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  const query = search.toLowerCase().trim();
  const useTenant = actionsLoaded && Object.keys(tenantActions).length > 0;

  /** Group all actions by domain (not by the 49 arbitrary areas). */
  const domainGroups = useMemo(() => {
    const groups: Record<string, { label: string; icon: string }[]> = {};

    if (useTenant) {
      // Flatten all tenant actions across all areas, then group by domain.
      const allActions = Object.values(tenantActions).flat();
      for (const a of allActions) {
        const domain = MODULE_TO_DOMAIN[a.module]?.label ?? 'Settings';
        if (!groups[domain]) groups[domain] = [];
        groups[domain].push({
          label: a.display_name,
          icon: iconForAction(a),
        });
      }
    } else {
      // Fallback: use CREATE_REGISTRY, map categories to domains.
      for (const cat of CREATE_REGISTRY) {
        const domain = REGISTRY_TO_DOMAIN[cat.title] ?? 'Finance';
        if (!groups[domain]) groups[domain] = [];
        for (const item of cat.items) {
          groups[domain].push({ label: item.label, icon: item.icon });
        }
      }
    }

    // Filter by search query.
    if (query) {
      for (const domain of Object.keys(groups)) {
        groups[domain] = groups[domain].filter((item) =>
          item.label.toLowerCase().includes(query)
        );
        if (groups[domain].length === 0) delete groups[domain];
      }
    }

    return groups;
  }, [useTenant, tenantActions, query]);

  const totalActions = Object.values(domainGroups).reduce((s, items) => s + items.length, 0);

  return (
    <div
      id="flyout-create"
      className={`${styles.scrim} ${open ? styles.open : ''}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.dialog}>
        <div className={styles.gradientBar} />
        <div className={styles.header}>
          <div className={styles.headerTop}>
            <div className={styles.headerBrand}>
              <div className={styles.brandIcon}>
                <span className={`material-symbols-outlined ${styles.icon24}`}>
                  add_box
                </span>
              </div>
              <div>
                <div className={styles.titleRow}>
                  <span className={styles.title}>Create</span>
                </div>
                <p className={styles.subtitle}>
                  {totalActions} actions across {Object.keys(domainGroups).length} domains
                </p>
              </div>
            </div>
            <button type="button" className={styles.closeBtn} onClick={onClose}>
              <span className={`material-symbols-outlined ${styles.icon18}`}>close</span>
            </button>
          </div>
          <div className={styles.searchWrap}>
            <span className={`material-symbols-outlined ${styles.icon20Search}`}>
              search
            </span>
            <input
              ref={searchRef}
              id="create-search"
              className={styles.searchInput}
              placeholder="Search actions…"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <kbd className={styles.escKbd}>ESC</kbd>
          </div>
        </div>

        <div id="create-grid" className={styles.grid}>
          {DOMAIN_ORDER.filter((d) => domainGroups[d]?.length).map((domain) => {
            const items = domainGroups[domain];
            const domainMeta = Object.values(MODULE_TO_DOMAIN).find((m) => m.label === domain);
            return (
              <div key={domain} className={styles.categoryCard}>
                <div className={styles.categoryHeader}>
                  <div className={styles.categoryHeaderLeft}>
                    <span className={`material-symbols-outlined ${styles.icon16}`}>
                      {domainMeta?.icon || 'add_circle'}
                    </span>
                    <span className={styles.categoryTitle}>{domain}</span>
                  </div>
                  <span className={styles.categoryCount}>{items.length}</span>
                </div>
                <nav className={styles.itemsNav}>
                  {items.map((item, i) => (
                    <button
                      key={`${item.label}-${i}`}
                      type="button"
                      data-create-item={item.label}
                      className={styles.createItem}
                      onClick={() => onSelectCreate(item.label)}
                    >
                      <span className={styles.itemLabel}>
                        <span className={`material-symbols-outlined ${styles.itemIcon}`}>
                          {item.icon}
                        </span>
                        {item.label}
                      </span>
                    </button>
                  ))}
                </nav>
              </div>
            );
          })}
          {totalActions === 0 && (
            <div className={styles.categoryCard}>
              <div className={styles.categoryHeader}>
                <span className={styles.categoryTitle}>No matches</span>
              </div>
              <p style={{ padding: '12px', fontSize: '12px', color: '#5a6355' }}>
                No create actions match &quot;{search}&quot;. Try a different search term.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
