'use client';

/**
 * Social Calendar — month grid + list view of scheduled posts, wired to
 * the real social_posts rows (doc 23). Chips show posts with a scheduled
 * date; the month defaults to today, not a hardcoded October.
 */
import { useMemo, useState } from 'react';
import styles from './SocialCalendar.module.css';
import { useSocialPosts, socialMutations } from '@/hooks/useSocialApi';
import type { SocialPost } from '@/lib/socialTypes';

interface SocialCalendarScreenProps {
  onToast: (msg: string) => void;
  onNavigate?: (domain: import('@/data/shellData').DomainKey, screenId: string) => void;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const CHANNELS = ['All', 'Instagram', 'TikTok', 'Facebook', 'LinkedIn', 'Pinterest', 'YouTube'] as const;
const CHANNEL_COLOR: Record<string, string> = {
  instagram: '#c13584',
  tiktok: '#010101',
  facebook: '#1877f2',
  linkedin: '#0a66c2',
  pinterest: '#bd081c',
  youtube: '#ff0000',
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

function dateKey(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function timeOf(iso: string | null): string {
  if (!iso) return 'Unscheduled';
  return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

function statusPill(status: string) {
  if (status === 'scheduled') return <span className={`${styles.pill} ${styles.pillGreen}`}>Scheduled</span>;
  if (status === 'publishing') return <span className={`${styles.pill} ${styles.pillOrange}`}>Publishing</span>;
  if (status === 'published') return <span className={`${styles.pill} ${styles.pillGreen}`}>Published</span>;
  if (status === 'failed') return <span className={`${styles.pill} ${styles.pillGray}`}>Failed</span>;
  return <span className={`${styles.pill} ${styles.pillGray}`}>Draft</span>;
}

export default function SocialCalendarScreen({ onToast, onNavigate }: SocialCalendarScreenProps) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth());
  const [view, setView] = useState<'month' | 'list'>('month');
  const [channelFilter, setChannelFilter] = useState<string>('All');
  const [peekPost, setPeekPost] = useState<SocialPost | null>(null);
  const [busy, setBusy] = useState(false);
  const { posts, loading, error, refresh } = useSocialPosts();

  const todayNum = now.getDate();
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth();

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const prevMonth = () => (month === 0 ? (setMonth(11), setYear(year - 1)) : setMonth(month - 1));
  const nextMonth = () => (month === 11 ? (setMonth(0), setYear(year + 1)) : setMonth(month + 1));
  const goToday = () => { setYear(now.getFullYear()); setMonth(now.getMonth()); };

  const getDateStr = (day: number) =>
    `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

  const filteredPosts = useMemo(() => {
    if (channelFilter === 'All') return posts;
    return posts.filter((p) => channelOf(p) === channelFilter);
  }, [posts, channelFilter]);

  const postsByDate = useMemo(() => {
    const map = new Map<string, SocialPost[]>();
    for (const p of filteredPosts) {
      const k = dateKey(p.scheduledAt || p.publishedAt);
      if (!k) continue;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(p);
    }
    return map;
  }, [filteredPosts]);

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
    if (!r.ok) { onToast(`Duplicate failed: ${r.error || 'unknown error'}`); return; }
    await refresh();
    onToast(`Duplicated "${titleOf(post)}" as a draft.`);
  }

  async function handleDelete(post: SocialPost) {
    setBusy(true);
    const r = await socialMutations.deletePost(post.id);
    setBusy(false);
    setPeekPost(null);
    if (!r.ok) { onToast(`Delete failed: ${r.error || 'unknown error'}`); return; }
    await refresh();
    onToast(`Deleted "${titleOf(post)}".`);
  }

  return (
    <div className={styles.screen}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <h1 className={styles.toolbarTitle}>Calendar</h1>
          <div className={styles.monthNav}>
            <button type="button" className={styles.btnIcon} onClick={prevMonth} title="Previous month"><span className="material-symbols-outlined">chevron_left</span></button>
            <span className={styles.monthLabel}>{MONTHS[month]} {year}</span>
            <button type="button" className={styles.btnIcon} onClick={nextMonth} title="Next month"><span className="material-symbols-outlined">chevron_right</span></button>
            <button type="button" className={`${styles.btn} ${styles.btnOutline}`} onClick={goToday}>Today</button>
          </div>
        </div>
        <div className={styles.toolbarRight}>
          <div className={styles.viewSwitcher}>
            <button type="button" className={`${styles.viewTab} ${view === 'month' ? styles.viewTabActive : ''}`} onClick={() => setView('month')}>
              <span className="material-symbols-outlined">calendar_month</span> Month
            </button>
            <button type="button" className={`${styles.viewTab} ${view === 'list' ? styles.viewTabActive : ''}`} onClick={() => setView('list')}>
              <span className="material-symbols-outlined">list</span> List
            </button>
          </div>
          <select className={styles.select} value={channelFilter} onChange={(e) => setChannelFilter(e.target.value)}>
            {CHANNELS.map((c) => (<option key={c} value={c}>{c === 'All' ? 'All channels' : c}</option>))}
          </select>
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => onNavigate?.('marketing', 'mkt-create-content')}>
            <span className="material-symbols-outlined">add</span> Create post
          </button>
        </div>
      </div>

      <div className={styles.content}>
        {error ? (
          <div className={styles.empty}>
            <span className="material-symbols-outlined">error</span>
            <h3>Could not load posts</h3>
            <p>{error}</p>
          </div>
        ) : view === 'month' ? (
          <div className={styles.gridWrap}>
            <div className={styles.grid}>
              {DAY_NAMES.map((d) => (<div key={d} className={styles.dayHead}>{d}</div>))}
              {Array.from({ length: firstDay }, (_, i) => (<div key={`empty-${i}`} className={`${styles.cell} ${styles.cellEmpty}`} />))}
              {Array.from({ length: daysInMonth }, (_, i) => {
                const day = i + 1;
                const dateStr = getDateStr(day);
                const dayPosts = postsByDate.get(dateStr) || [];
                return (
                  <div
                    key={day}
                    className={styles.cell}
                    title={dayPosts.length === 0 ? `Schedule for ${MONTHS[month]} ${day}` : ''}
                    onClick={(e) => {
                      if ((e.target as HTMLElement).closest(`.${styles.postChip}`)) return;
                      onNavigate?.('marketing', 'mkt-create-content');
                    }}
                  >
                    <span className={`${styles.dateNum} ${day === todayNum && isCurrentMonth ? styles.dateToday : ''}`}>{day}</span>
                    {dayPosts.slice(0, 3).map((p) => (
                      <div
                        key={p.id}
                        className={styles.postChip}
                        style={{ borderLeftColor: CHANNEL_COLOR[(p.channels?.[0] || '').toLowerCase()] || '#666' }}
                        onClick={(e) => { e.stopPropagation(); setPeekPost(p); }}
                      >
                        {titleOf(p)}
                      </div>
                    ))}
                    {dayPosts.length > 3 && <span className={styles.moreChip}>+{dayPosts.length - 3} more</span>}
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <div className={styles.listWrap}>
            {loading ? (
              <div className={styles.empty}><h3>Loading…</h3></div>
            ) : filteredPosts.length === 0 ? (
              <div className={styles.empty}>
                <span className="material-symbols-outlined">calendar_today</span>
                <h3>No posts</h3>
                <p>Adjust your channel filter or create a post.</p>
              </div>
            ) : (
              <table className={styles.listTable}>
                <thead>
                  <tr><th>Date</th><th>Title</th><th>Channel</th><th>Time</th><th>Status</th></tr>
                </thead>
                <tbody>
                  {filteredPosts.map((p) => (
                    <tr key={p.id} onClick={() => setPeekPost(p)}>
                      <td>{p.scheduledAt ? new Date(p.scheduledAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}</td>
                      <td><strong>{titleOf(p)}</strong></td>
                      <td><span className={styles.chDot} style={{ background: CHANNEL_COLOR[(p.channels?.[0] || '').toLowerCase()] || '#666' }} />{channelOf(p)}</td>
                      <td>{timeOf(p.scheduledAt || p.publishedAt)}</td>
                      <td>{statusPill(p.status)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
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
                  {channelOf(peekPost)} · {peekPost.scheduledAt ? new Date(peekPost.scheduledAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'} · {timeOf(peekPost.scheduledAt || peekPost.publishedAt)}
                </p>
              </div>
              <button type="button" className={styles.btnIcon} onClick={() => setPeekPost(null)}><span className="material-symbols-outlined">close</span></button>
            </div>
            <div className={styles.peekBody}>
              <p style={{ margin: 0, fontSize: 13, color: 'var(--ink)', lineHeight: 1.5 }}>{peekPost.caption}</p>
              <div className={styles.peekField}><span className={styles.peekLabel}>Status</span><span className={styles.peekValue}>{statusPill(peekPost.status)}</span></div>
              <div className={styles.peekField}><span className={styles.peekLabel}>Channel</span><span className={styles.peekValue}>{channelOf(peekPost)}</span></div>
              <div className={styles.peekField}><span className={styles.peekLabel}>Date</span><span className={styles.peekValue}>{peekPost.scheduledAt ? new Date(peekPost.scheduledAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</span></div>
              <div className={styles.peekField}><span className={styles.peekLabel}>Time</span><span className={styles.peekValue}>{timeOf(peekPost.scheduledAt || peekPost.publishedAt)}</span></div>
              <div className={styles.peekField}><span className={styles.peekLabel}>Post ID</span><span className={styles.peekValue}>{peekPost.id}</span></div>
            </div>
            <div className={styles.peekFooter}>
              <button type="button" className={`${styles.btn} ${styles.btnOutline}`} disabled={busy} onClick={() => void handleDelete(peekPost)}>
                <span className="material-symbols-outlined">delete</span> Delete
              </button>
              <button type="button" className={`${styles.btn} ${styles.btnOutline}`} disabled={busy} onClick={() => void handleDuplicate(peekPost)}>
                <span className="material-symbols-outlined">content_copy</span> Duplicate
              </button>
              <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => { setPeekPost(null); onNavigate?.('marketing', 'mkt-create-content'); }}>
                <span className="material-symbols-outlined">edit</span> Edit
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
