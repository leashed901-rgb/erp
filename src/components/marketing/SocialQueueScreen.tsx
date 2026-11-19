'use client';

/**
 * Publishing Queue — scheduled/published/draft/failed posts, wired to the
 * real social_posts rows (doc 23). Tabs and actions map to the statuses
 * the API actually accepts (draft|scheduled|publishing|published|failed|
 * cancelled) — there is no paused/archived state, so Pause/Archive are
 * gone; cancelling a schedule and retrying a failure are the real moves.
 */
import { useMemo, useState } from 'react';
import styles from './SocialQueue.module.css';
import { exportToCsv } from '@/lib/csvExport';
import { useSocialPosts, socialMutations } from '@/hooks/useSocialApi';
import type { SocialPost } from '@/lib/socialTypes';

interface SocialQueueScreenProps {
  onToast: (msg: string) => void;
  onNavigate?: (domain: import('@/data/shellData').DomainKey, screenId: string) => void;
}

type TabId = 'all' | 'scheduled' | 'published' | 'draft' | 'failed' | 'cancelled';

const TABS: { id: TabId; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'scheduled', label: 'Scheduled' },
  { id: 'published', label: 'Published' },
  { id: 'draft', label: 'Drafts' },
  { id: 'failed', label: 'Failed' },
  { id: 'cancelled', label: 'Cancelled' },
];

const CHANNEL_COLOR: Record<string, string> = {
  instagram: '#c13584',
  tiktok: '#010101',
  facebook: '#1877f2',
  linkedin: '#0a66c2',
  pinterest: '#bd081c',
  youtube: '#ff0000',
  threads: '#000000',
  x: '#000000',
};

function cap(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

function titleOf(p: SocialPost): string {
  if (p.title) return p.title;
  const first = (p.caption || '').split('\n')[0].trim();
  return first ? (first.length > 60 ? `${first.slice(0, 60)}…` : first) : 'Untitled post';
}

function channelOf(p: SocialPost): string {
  const n = p.channels?.[0] || p.networks?.[0]?.network || '';
  return n ? cap(n) : '—';
}

function dateOf(p: SocialPost): string {
  const iso = p.scheduledAt || p.publishedAt;
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) +
    ' · ' + new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function pill(status: string) {
  switch (status) {
    case 'scheduled': return <span className={`${styles.pill} ${styles.pillGreen}`}>Scheduled</span>;
    case 'publishing': return <span className={`${styles.pill} ${styles.pillBlue}`}>Publishing</span>;
    case 'published': return <span className={`${styles.pill} ${styles.pillBlue}`}>Published</span>;
    case 'draft': return <span className={`${styles.pill} ${styles.pillGray}`}>Draft</span>;
    case 'failed': return <span className={`${styles.pill} ${styles.pillRed}`}>Failed</span>;
    case 'cancelled': return <span className={`${styles.pill} ${styles.pillGray}`}>Cancelled</span>;
    default: return <span className={`${styles.pill} ${styles.pillGray}`}>{status}</span>;
  }
}

export default function SocialQueueScreen({ onToast, onNavigate }: SocialQueueScreenProps) {
  const { posts, loading, error, refresh } = useSocialPosts();
  const [activeTab, setActiveTab] = useState<TabId>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [peekPost, setPeekPost] = useState<SocialPost | null>(null);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return posts.filter((p) => {
      const tabMatch = activeTab === 'all' || p.status === activeTab;
      const searchMatch = !s || titleOf(p).toLowerCase().includes(s) || channelOf(p).toLowerCase().includes(s);
      return tabMatch && searchMatch;
    });
  }, [posts, activeTab, search]);

  const tabCount = (tabId: TabId): number =>
    tabId === 'all' ? posts.length : posts.filter((p) => p.status === tabId).length;

  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (filtered.every((p) => selected.has(p.id))) {
      setSelected((prev) => {
        const next = new Set(prev);
        filtered.forEach((p) => next.delete(p.id));
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        filtered.forEach((p) => next.add(p.id));
        return next;
      });
    }
  };

  async function setStatus(post: SocialPost, status: string, verb: string) {
    setBusy(true);
    const r = await socialMutations.updatePost(post.id, { status });
    setBusy(false);
    setMenuOpenId(null);
    if (!r.ok) { onToast(`Could not ${verb.toLowerCase()}: ${r.error || 'unknown error'}`); return; }
    await refresh();
    onToast(`"${titleOf(post)}" ${verb.toLowerCase()}.`);
  }

  async function handleDuplicate(post: SocialPost) {
    setBusy(true);
    const r = await socialMutations.createPost({
      caption: post.caption,
      title: post.title ? `${post.title} (copy)` : undefined,
      channels: post.channels || [],
      mediaUrls: post.mediaUrls || [],
    });
    setBusy(false);
    setPeekPost(null);
    setMenuOpenId(null);
    if (!r.ok) { onToast(`Duplicate failed: ${r.error || 'unknown error'}`); return; }
    await refresh();
    onToast(`Duplicated "${titleOf(post)}" as a draft.`);
  }

  async function handleDelete(post: SocialPost) {
    setBusy(true);
    const r = await socialMutations.deletePost(post.id);
    setBusy(false);
    setPeekPost(null);
    setMenuOpenId(null);
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(post.id);
      return next;
    });
    if (!r.ok) { onToast(`Delete failed: ${r.error || 'unknown error'}`); return; }
    await refresh();
    onToast(`Deleted "${titleOf(post)}".`);
  }

  async function handleRetry(post: SocialPost) {
    setBusy(true);
    const r = await socialMutations.retryPost(post.id);
    setBusy(false);
    setMenuOpenId(null);
    if (!r.ok) { onToast(`Retry failed: ${r.error || 'unknown error'}`); return; }
    await refresh();
    onToast(`Retrying "${titleOf(post)}" (${r.data?.targetsRetried ?? 0} targets).`);
  }

  async function bulkDelete() {
    setBusy(true);
    let n = 0;
    for (const id of selected) {
      const r = await socialMutations.deletePost(id);
      if (r.ok) n++;
    }
    setBusy(false);
    setSelected(new Set());
    await refresh();
    onToast(`Deleted ${n} post${n === 1 ? '' : 's'}.`);
  }

  const handleExport = () => {
    exportToCsv(filtered.map((p) => ({ title: titleOf(p), channel: channelOf(p), date: dateOf(p), status: p.status, source: p.sourceType })), [
      { key: 'title', label: 'Content' },
      { key: 'channel', label: 'Channel' },
      { key: 'date', label: 'Publish date' },
      { key: 'status', label: 'Status' },
      { key: 'source', label: 'Source' },
    ], 'publishing-queue');
    onToast(`Exported ${filtered.length} posts to CSV.`);
  };

  const hasSelection = selected.size > 0;

  return (
    <div className={styles.screen}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <h1 className={styles.toolbarTitle}>Publishing queue</h1>
          <p className={styles.toolbarSub}>{loading ? 'Loading posts…' : 'Track scheduled posts, drafts, and outcomes.'}</p>
        </div>
        <div className={styles.toolbarRight}>
          <button type="button" className={`${styles.btn} ${styles.btnOutline}`} onClick={handleExport}>
            <span className="material-symbols-outlined">download</span> Export
          </button>
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => onNavigate?.('marketing', 'mkt-create-content')}>
            <span className="material-symbols-outlined">add</span> Create post
          </button>
        </div>
      </div>

      <div className={styles.card}>
        <div className={styles.tabs}>
          {TABS.map((t) => (
            <button key={t.id} type="button" className={`${styles.tab} ${activeTab === t.id ? styles.tabActive : ''}`} onClick={() => { setActiveTab(t.id); setSelected(new Set()); }}>
              {t.label}
              <span className={styles.tabCount}>{tabCount(t.id)}</span>
            </button>
          ))}
        </div>

        <div className={styles.filterBar}>
          <input className={styles.search} type="text" placeholder="Search by title or channel…" value={search} onChange={(e) => setSearch(e.target.value)} />
        </div>

        {hasSelection && (
          <div className={styles.bulkBar}>
            <span className={styles.bulkCount}>{selected.size} selected</span>
            <button type="button" className={`${styles.bulkAction} ${styles.bulkActionDanger}`} disabled={busy} onClick={() => void bulkDelete()}><span className="material-symbols-outlined">delete</span> Delete</button>
            <button type="button" className={styles.bulkAction} onClick={() => setSelected(new Set())} style={{ marginLeft: 'auto' }}>Clear</button>
          </div>
        )}

        <div className={styles.tableWrap}>
          {error ? (
            <div className={styles.empty}>
              <span className="material-symbols-outlined">error</span>
              <h3>Could not load posts</h3>
              <p>{error}</p>
            </div>
          ) : loading ? (
            <div className={styles.empty}>
              <h3>Loading…</h3>
            </div>
          ) : filtered.length === 0 ? (
            <div className={styles.empty}>
              <span className="material-symbols-outlined">outbox</span>
              <h3>No posts</h3>
              <p>{posts.length === 0 ? 'Nothing scheduled yet — create your first post.' : 'Adjust your filters or create a new post.'}</p>
            </div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th className={styles.checkCell}>
                    <input type="checkbox" checked={filtered.length > 0 && filtered.every((p) => selected.has(p.id))} onChange={toggleSelectAll} />
                  </th>
                  <th>Content</th>
                  <th>Channel</th>
                  <th>Publish date</th>
                  <th>Status</th>
                  <th className={styles.menuCell} />
                </tr>
              </thead>
              <tbody>
                {filtered.map((post) => {
                  const ch = channelOf(post);
                  return (
                    <tr key={post.id} onClick={() => setPeekPost(post)}>
                      <td className={styles.checkCell} onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={selected.has(post.id)} onChange={() => toggleSelect(post.id)} />
                      </td>
                      <td>
                        <div className={styles.contentCell}>
                          <span className={styles.contentTitle}>{titleOf(post)}</span>
                          <span className={styles.contentMeta}>{post.sourceType}</span>
                        </div>
                      </td>
                      <td><span className={styles.chDot} style={{ background: CHANNEL_COLOR[(post.channels?.[0] || '').toLowerCase()] || '#666' }} />{ch}</td>
                      <td style={{ color: 'var(--mut)' }}>{dateOf(post)}</td>
                      <td>{pill(post.status)}</td>
                      <td className={styles.menuCell} onClick={(e) => e.stopPropagation()} style={{ position: 'relative' }}>
                        <button type="button" className={styles.btnIcon} onClick={() => setMenuOpenId(menuOpenId === post.id ? null : post.id)}>
                          <span className="material-symbols-outlined">more_horiz</span>
                        </button>
                        {menuOpenId === post.id && (
                          <div className={styles.rowMenu} style={{ right: 8, top: 36 }}>
                            <button type="button" className={styles.rowMenuItem} onClick={() => { setPeekPost(post); setMenuOpenId(null); }}>
                              <span className="material-symbols-outlined">visibility</span> View details
                            </button>
                            <button type="button" className={styles.rowMenuItem} onClick={() => { setPeekPost(null); onNavigate?.('marketing', 'mkt-create-content'); setMenuOpenId(null); }}>
                              <span className="material-symbols-outlined">edit</span> Edit
                            </button>
                            <button type="button" className={styles.rowMenuItem} disabled={busy} onClick={() => void handleDuplicate(post)}>
                              <span className="material-symbols-outlined">content_copy</span> Duplicate
                            </button>
                            {post.status === 'failed' && (
                              <button type="button" className={styles.rowMenuItem} disabled={busy} onClick={() => void handleRetry(post)}><span className="material-symbols-outlined">refresh</span> Retry publish</button>
                            )}
                            {post.status === 'scheduled' && (
                              <button type="button" className={styles.rowMenuItem} disabled={busy} onClick={() => void setStatus(post, 'cancelled', 'Schedule cancelled')}><span className="material-symbols-outlined">cancel</span> Cancel schedule</button>
                            )}
                            {post.status !== 'draft' && post.status !== 'published' && (
                              <button type="button" className={styles.rowMenuItem} disabled={busy} onClick={() => void setStatus(post, 'draft', 'Sent back to drafts')}><span className="material-symbols-outlined">edit_note</span> To draft</button>
                            )}
                            <button type="button" className={`${styles.rowMenuItem} ${styles.rowMenuItemDanger}`} disabled={busy} onClick={() => void handleDelete(post)}><span className="material-symbols-outlined">delete</span> Delete</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {peekPost && (
        <>
          <div className={`${styles.scrim} ${styles.scrimOpen}`} onClick={() => setPeekPost(null)} />
          <div className={`${styles.peek} ${styles.peekOpen}`}>
            <div className={styles.peekHead}>
              <div>
                <h3 className={styles.peekHeadTitle}>{titleOf(peekPost)}</h3>
                <p className={styles.peekHeadSub}>
                  <span className={styles.chDot} style={{ background: CHANNEL_COLOR[(peekPost.channels?.[0] || '').toLowerCase()] || '#666' }} />
                  {channelOf(peekPost)} · {dateOf(peekPost)}
                </p>
              </div>
              <button type="button" className={styles.btnIcon} onClick={() => setPeekPost(null)}><span className="material-symbols-outlined">close</span></button>
            </div>
            <div className={styles.peekBody}>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--ink)', lineHeight: 1.5 }}>{peekPost.caption}</p>
              <div className={styles.peekField}><span className={styles.peekLabel}>Status</span><span className={styles.peekValue}>{pill(peekPost.status)}</span></div>
              <div className={styles.peekField}><span className={styles.peekLabel}>Channel</span><span className={styles.peekValue}>{channelOf(peekPost)}</span></div>
              <div className={styles.peekField}><span className={styles.peekLabel}>Publish date</span><span className={styles.peekValue}>{dateOf(peekPost)}</span></div>
              <div className={styles.peekField}><span className={styles.peekLabel}>Source</span><span className={styles.peekValue}>{peekPost.sourceType}</span></div>
              {peekPost.error && <div className={styles.peekField}><span className={styles.peekLabel}>Error</span><span className={styles.peekValue}>{peekPost.error}</span></div>}
              <div className={styles.peekField}><span className={styles.peekLabel}>Post ID</span><span className={styles.peekValue}>{peekPost.id}</span></div>
            </div>
            <div className={styles.peekFooter}>
              <button type="button" className={`${styles.btn} ${styles.btnDanger}`} disabled={busy} onClick={() => void handleDelete(peekPost)}><span className="material-symbols-outlined">delete</span> Delete</button>
              <button type="button" className={`${styles.btn} ${styles.btnOutline}`} disabled={busy} onClick={() => void handleDuplicate(peekPost)}><span className="material-symbols-outlined">content_copy</span> Duplicate</button>
              {peekPost.status === 'failed' && (
                <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} disabled={busy} onClick={() => void handleRetry(peekPost)}><span className="material-symbols-outlined">refresh</span> Retry</button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
