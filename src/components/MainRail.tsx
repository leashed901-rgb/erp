import { DOMAINS, DomainKey, PINNED } from '@/data/shellData';
import styles from './MainRail.module.css';

export type PinMode = 'bookmarks' | 'favorites';

interface MainRailProps {
  activeDomain: DomainKey;
  onSelectDomain: (domain: DomainKey) => void;
  onOpenCreateFlyout: () => void;
  onRailAction: (id: string) => void;
  onUtilAction: (id: string) => void;
  favoritesCount?: number;
  /** Which side of the dual pin (bookmark | favorite) the user chose. */
  pinMode: PinMode;
  bookmarksCount?: number;
  favoritesOpen?: boolean;
  onToggleFavorites?: () => void;
}

// Pinned utility items (bottom section). These are the persistent quick-access
// tools that live below the domain rail. Favorites/Bookmarks, Reports, and
// Inbox/Mail have been MOVED to the top bar (Header). Tasks moved up to
// replace the Create button. LMS (learning) and Hours (staff) are new.
const PINNED_UTIL: { id: string; icon: string; label: string; badge?: number }[] = [
  { id: 'lms', icon: 'school', label: 'Learning (LMS)' },
  { id: 'hours', icon: 'schedule', label: 'Staff hours' },
];

export default function MainRail({
  activeDomain,
  onSelectDomain,
  onOpenCreateFlyout,
  onRailAction,
  favoritesCount = 0,
  pinMode = 'bookmarks',
  bookmarksCount = 0,
  favoritesOpen = false,
  onToggleFavorites,
}: MainRailProps) {
  return (
    <aside className={styles.rail}>
      <div className={styles.topSection}>
        {/* Tasks — moved up from the pinned area to replace the Create button.
            Create is now only in the top bar (Header) and the hamburger flyout. */}
        <button
          id="rail-tasks"
          type="button"
          className={styles.createBtn}
          title="Tasks / calendar"
          onClick={() => onRailAction('tasks')}
        >
          <span className={`material-symbols-outlined ${styles.icon20}`}>calendar_month</span>
        </button>

        {/* Grouping divider — separates Create from the domain rail */}
        <div className={styles.divider} />

        {/* Domain rail — the 7 primary domains, in PINNED order */}
        <div id="rail-domains" className={styles.pinnedList}>
          {PINNED.map((key) => {
            const domain = DOMAINS[key];
            const active = key === activeDomain;
            return (
              <button
                key={key}
                type="button"
                data-pinned={key}
                className={`${styles.pinnedBtn} ${active ? styles.pinnedBtnActive : ''}`}
                title={domain.label}
                onClick={() => onSelectDomain(key)}
              >
                <span className={`material-symbols-outlined ${styles.icon19}`}>{domain.icon}</span>
              </button>
            );
          })}
        </div>

        {/* Grouping divider — separates domain rail from the pinned utilities */}
        <div className={styles.divider} />

        {/* Pinned utility section */}
        <span className={styles.pinnedLabel}>Pinned</span>
        <div id="rail-pinned" className={styles.pinnedList}>
          {PINNED_UTIL.map((item) => (
            <button
              key={item.id}
              type="button"
              data-rail={item.id}
              className={styles.railBtn}
              title={item.label}
              onClick={() => onRailAction(item.id)}
              aria-label={item.label}
            >
              <span className={`material-symbols-outlined ${styles.icon19}`}>
                {item.icon}
              </span>
              {item.badge != null && item.badge > 0 && (
                <span className={styles.inboxBadge}>{item.badge}</span>
              )}
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
