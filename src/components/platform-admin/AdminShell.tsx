'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import styles from './PlatformAdmin.module.css';
import { apiGet } from './shared';

interface OverviewData {
  counts: { total: number; provisioning_failed: number };
}

const NAV: { section: string; items: { href: string; icon: string; label: string; countKey?: 'tenants' | 'provisioning' }[] }[] = [
  { section: 'Overview', items: [{ href: '/platform-admin', icon: 'dashboard', label: 'Overview' }] },
  {
    section: 'Directory',
    items: [
      { href: '/platform-admin/tenants', icon: 'domain', label: 'Tenants', countKey: 'tenants' },
      { href: '/platform-admin/users', icon: 'person', label: 'Users' },
    ],
  },
  {
    section: 'Operations',
    items: [
      { href: '/platform-admin/provisioning', icon: 'schedule', label: 'Provisioning', countKey: 'provisioning' },
      { href: '/platform-admin/entitlements', icon: 'apps', label: 'Entitlements' },
      { href: '/platform-admin/billing', icon: 'receipt_long', label: 'Billing' },
      { href: '/platform-admin/support', icon: 'support_agent', label: 'Support' },
    ],
  },
  {
    section: 'Compliance',
    items: [
      { href: '/platform-admin/audit', icon: 'history', label: 'Audit log' },
      { href: '/platform-admin/settings/staff', icon: 'admin_panel_settings', label: 'Staff grants' },
    ],
  },
];

const TITLES: Record<string, string> = {
  '/platform-admin': 'Overview',
  '/platform-admin/tenants': 'Tenants',
  '/platform-admin/users': 'Users',
  '/platform-admin/provisioning': 'Provisioning',
  '/platform-admin/entitlements': 'Entitlements',
  '/platform-admin/billing': 'Billing',
  '/platform-admin/support': 'Support',
  '/platform-admin/audit': 'Audit log',
  '/platform-admin/settings/staff': 'Staff grants',
};

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || '/platform-admin';
  const [counts, setCounts] = useState<{ tenants: number; provisioning: number } | null>(null);
  const [operator, setOperator] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    apiGet<OverviewData>('/api/platform-admin/overview')
      .then((d) => setCounts({ tenants: d.counts.total, provisioning: d.counts.provisioning_failed }))
      .catch(() => setCounts(null));
    apiGet<{ current_operator_id: string | null }>('/api/platform-admin/staff')
      .then((d) => setOperator(d.current_operator_id))
      .catch(() => setOperator(null));
  }, [pathname]);

  const title = TITLES[pathname] || 'Overview';

  return (
    <div className={styles.wrap}>
      <aside className={styles.nav}>
        <div className={styles.navHeader}>
          <div className={styles.logo}>un</div>
          <div className={styles.navTitle}>
            unleashe
            <div className={styles.navTitleSub}>Platform admin</div>
          </div>
        </div>
        {NAV.map((group) => (
          <div key={group.section} className={styles.navSection}>
            <div className={styles.navSectionTitle}>{group.section}</div>
            {group.items.map((item) => {
              const active = pathname === item.href;
              const count = item.countKey === 'tenants' ? counts?.tenants : item.countKey === 'provisioning' ? counts?.provisioning : undefined;
              return (
                <Link key={item.href} href={item.href} className={`${styles.navItem} ${active ? styles.navItemActive : ''}`}>
                  <span className={`material-symbols-outlined ${styles.msym}`} style={{ fontSize: 18 }}>{item.icon}</span>
                  <span>{item.label}</span>
                  {count !== undefined && count !== null && (item.countKey !== 'provisioning' || count > 0) && (
                    <span className={`${styles.navCount} ${item.countKey === 'provisioning' ? styles.navCountAlert : ''}`}>{count}</span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
        <div className={styles.navFooter}>
          <div className={styles.staffInfo}>
            <strong>Platform operator</strong>
            {operator ? `Session user ${operator.slice(0, 8)}…` : 'Session user unavailable'}
            <div className={styles.roleChips}>
              <span className={styles.roleChip}>operator scope</span>
            </div>
          </div>
        </div>
      </aside>
      <div className={styles.main}>
        <div className={styles.topbar}>
          <div className={styles.crumb}>
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--muted)' }}>shield</span>
            <span>Platform admin</span>
            <span className={styles.crumbSep}>/</span>
            <strong>{title}</strong>
          </div>
          <div>
            <Link href="/" className={`${styles.btn} ${styles.btnOutline}`} style={{ textDecoration: 'none' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_back</span>
              Tenant workspace
            </Link>
          </div>
        </div>
        <div className={styles.content}>{children}</div>
      </div>
      {toast && <div className={styles.toast}>{toast}</div>}
    </div>
  );
}
