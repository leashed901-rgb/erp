import { useEffect, useRef, useState } from 'react';
import { useTenantNav, groupActionsByArea, type DbAction } from '@/hooks/useTenantNav';
import { ALL_ACTION_GROUPS } from './QuickActionsDrawer';
import styles from './CreateFlyout.module.css';

interface CreateFlyoutProps {
  open: boolean;
  onClose: () => void;
  /** The full registry action (tenant items) or a label (fallback items). */
  onSelectCreate: (action: DbAction | string) => void;
}

export default function CreateFlyout({
  open,
  onClose,
  onSelectCreate,
}: CreateFlyoutProps) {
  const [search, setSearch] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  // REAL tenant actions from /api/v1/nav's 181-action registry
  // (platform_quick_action_registry). The flyout is for CREATING, so it
  // lists only kind='create' (72) — the 103 'option' actions (Archive,
  // Acknowledge page, …) are row/context actions, not creates, and the
  // 6 'standard' ones are navigation. Falls back to ALL_ACTION_GROUPS
  // when the fetch is in-flight or fails — the app never shows an
  // empty Create menu.
  // The Create menu lists CREATE actions only: the registry's other
  // entries (archive/delete/follow/…) are record actions that execute
  // on a record from its list/peek menus, not from Create.
  const { actions: tenantActions, loading: actionsLoading } = useTenantNav();
  // Filter by kind, not by action_code prefix: 4 kind='create' actions
  // (email.send, route.build, tenant.provision, learn.enroll) have codes
  // that don't start with 'create.' and a prefix filter drops them.
  const creates = tenantActions.filter((a) => (a.kind || 'create') === 'create');
  const grouped = groupActionsByArea(creates);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      searchRef.current?.focus();
    }, 60);
    return () => clearTimeout(timer);
  }, [open]);

  const query = search.toLowerCase().trim();

  // If tenant actions are loaded with content, use them; otherwise fall
  // back to ALL_ACTION_GROUPS (the hardcoded registry from
  // QuickActionsDrawer).
  const useTenant = !actionsLoading && Object.keys(grouped).length > 0;

  return (
    <div
      id="flyout-create"
      className={`${styles.scrim} ${open ? styles.open : ''}`}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
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
                  <span className={styles.title}>Create New</span>
                  <span className={styles.factoryBadge}>P1 Universal Factory</span>
                </div>
                <p className={styles.subtitle}>
                  Grouped by counterparty — CREATE_REGISTRY §B1.
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
              placeholder="Search creates… (invoice, bill, customer, vendor, product, banner)"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <kbd className={styles.escKbd}>ESC</kbd>
          </div>
        </div>

        <div id="create-grid" className={styles.grid}>
          {useTenant
            ? Object.entries(grouped).map(([area, actions]) => (
                <div key={area} className={styles.categoryCard}>
                  <div className={styles.categoryHeader}>
                    <div className={styles.categoryHeaderLeft}>
                      <span className={`${styles.dot} ${styles.dotPrimary}`} />
                      <span className={styles.categoryTitle}>
                        {area.charAt(0).toUpperCase() + area.slice(1)}
                      </span>
                    </div>
                    <span className={styles.categoryCount}>{actions.length}</span>
                  </div>
                  <nav className={styles.itemsNav}>
                    {actions
                      .filter((a) => !query || (a.display_name || '').toLowerCase().includes(query) || (a.action_code || '').toLowerCase().includes(query))
                      .map((action) => (
                        <button
                          key={action.action_code || action.display_name}
                          type="button"
                          data-create-item={action.display_name}
                          className={styles.createItem}
                          onClick={() => onSelectCreate(action)}
                        >
                          <span className={styles.itemLabel}>
                            <span className={`material-symbols-outlined ${styles.itemIcon}`}>
                              {action.object_type === 'invoice' ? 'receipt_long'
                                : action.object_type === 'estimate' ? 'request_quote'
                                : action.object_type === 'bill' ? 'description'
                                : action.area === 'vendors' ? 'credit_card'
                                : action.area === 'catalog' ? 'inventory_2'
                                : action.area === 'marketing' ? 'campaign'
                                : 'add_circle'}
                            </span>
                            {action.display_name}
                          </span>
                          <span className={styles.itemDesc}>
                            {action.object_type ? action.object_type.replace(/_/g, ' ') : action.area}
                          </span>
                        </button>
                      ))}
                  </nav>
                </div>
              ))
            : ALL_ACTION_GROUPS.map((cat) => (
            <div key={cat.id} className={styles.categoryCard}>
              <div className={styles.categoryHeader}>
                <div className={styles.categoryHeaderLeft}>
                  <span className={`${styles.dot} ${styles.dotPrimary}`} />
                  <span className={styles.categoryTitle}>{cat.name}</span>
                </div>
                <span className={styles.categoryCount}>{cat.actions.length}</span>
              </div>
              <nav className={styles.itemsNav}>
                {cat.actions.map((item) => {
                  const fullText = `${item.icon}${item.name}`.toLowerCase();
                  const visible = !query || fullText.includes(query);
                  if (!visible) return null;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      data-create-item={item.name}
                      className={styles.createItem}
                      onClick={() => onSelectCreate(item.name)}
                    >
                      <span className={styles.itemLabel}>
                        <span className={`material-symbols-outlined ${styles.itemIcon}`}>
                          {item.icon}
                        </span>
                        {item.name}
                      </span>
                      <span className={styles.itemDesc}>{item.group}</span>
                    </button>
                  );
                })}
              </nav>
            </div>
          ))}
        </div>

        <div className={styles.footer}>
          <div className={styles.footerLeft}>
            <span className={`material-symbols-outlined ${styles.icon16Primary}`}>
              verified
            </span>
            <span className={styles.footerGrammar}>
              Save grammar: <strong className={styles.strongPrimary}>Save</strong> •{' '}
              <strong className={styles.strongPrimary}>Save &amp; New</strong> •{' '}
              <strong className={styles.strongPrimary}>Save &amp; Close</strong>
            </span>
          </div>
          <span className={styles.footerRight}>
            Universal footer applies to every create
          </span>
        </div>
      </div>
    </div>
  );
}
