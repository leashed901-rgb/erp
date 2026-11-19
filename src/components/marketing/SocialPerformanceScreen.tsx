'use client';

/**
 * Social Performance — delivery analytics for published content, wired
 * to the real /api/social/performance aggregates (doc 23).
 *
 * The platform records delivery (published / failed / scheduled / draft
 * per network), not reach, engagement, or clicks — those numbers are not
 * stored anywhere, so this screen shows delivery counts and recent posts
 * instead of inventing them.
 */
import { useMemo, useState } from 'react';
import styles from './SocialPerformance.module.css';
import { exportToCsv } from '@/lib/csvExport';
import { useSocialPerformance, useSocialPosts } from '@/hooks/useSocialApi';
import type { SocialPost } from '@/lib/socialTypes';

interface SocialPerformanceScreenProps {
  onToast: (msg: string) => void;
  onNavigate?: (domain: import('@/data/shellData').DomainKey, screenId: string) => void;
}

const NETWORK_COLOR: Record<string, string> = {
  instagram: '#c13584',
  tiktok: '#010101',
  linkedin: '#0a66c2',
  facebook: '#1877f2',
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

export default function SocialPerformanceScreen({ onToast, onNavigate }: SocialPerformanceScreenProps) {
  const [range, setRange] = useState('Last 30 days');
  const [peekPost, setPeekPost] = useState<SocialPost | null>(null);
  const { performance, loading, error } = useSocialPerformance();
  const { posts } = useSocialPosts();

  const byNetwork = performance?.byNetwork ?? [];
  const postCounts = performance?.posts ?? {};
  const total = Object.values(postCounts).reduce((a, b) => a + b, 0);
  const published = postCounts.published ?? 0;
  const scheduled = postCounts.scheduled ?? 0;
  const failed = postCounts.failed ?? 0;
  const maxPublished = Math.max(1, ...byNetwork.map((n) => n.published));

  const recent = useMemo(
    () => [...posts].sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)).slice(0, 5),
    [posts],
  );

  const STATS = [
    { label: 'Total posts', value: String(total), delta: 'All statuses' },
    { label: 'Published', value: String(published), delta: 'Delivered to networks' },
    { label: 'Scheduled', value: String(scheduled), delta: 'Waiting to publish' },
    { label: 'Failed', value: String(failed), delta: 'Needs a retry' },
  ];

  const handleExport = () => {
    exportToCsv(byNetwork.map((n) => ({ name: cap(n.network), published: n.published, failed: n.failed, scheduled: n.scheduled, draft: n.draft })), [
      { key: 'name', label: 'Channel' },
      { key: 'published', label: 'Published' },
      { key: 'failed', label: 'Failed' },
      { key: 'scheduled', label: 'Scheduled' },
      { key: 'draft', label: 'Draft' },
    ], 'social-performance');
    onToast('Exported performance data to CSV.');
  };

  return (
    <div className={styles.screen}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <h1 className={styles.toolbarTitle}>Performance</h1>
          <p className={styles.toolbarSub}>How your published content is performing across channels.</p>
        </div>
        <div className={styles.toolbarRight}>
          <select className={styles.select} value={range} onChange={(e) => setRange(e.target.value)}>
            <option>Last 30 days</option>
            <option>Last 7 days</option>
            <option>This quarter</option>
          </select>
          <button type="button" className={`${styles.btn} ${styles.btnOutline}`} onClick={handleExport}>
            <span className="material-symbols-outlined">download</span> Export
          </button>
        </div>
      </div>

      <div className={styles.content}>
        {error ? (
          <div className={styles.card}>
            <p style={{ margin: 0, padding: 16, fontSize: 13, color: '#b3261e' }}>Could not load performance: {error}</p>
          </div>
        ) : (
          <>
            <div className={styles.stats}>
              {STATS.map((s) => (
                <div key={s.label} className={styles.stat}>
                  <span className={styles.statLabel}>{s.label}</span>
                  <span className={styles.statValue}>{loading ? '…' : s.value}</span>
                  <span className={styles.statDelta}>{s.delta}</span>
                </div>
              ))}
            </div>

            <div className={styles.split}>
              <div className={styles.card}>
                <div className={styles.cardHead}>
                  <div className={styles.cardHeadLeft}>
                    <h2 className={styles.cardTitle}>Channel performance</h2>
                    <p className={styles.cardSub}>Delivery counts by platform — reach and engagement are not recorded by the platform</p>
                  </div>
                </div>
                <div className={styles.cardBody}>
                  {byNetwork.length === 0 ? (
                    <p style={{ margin: 0, fontSize: 13, color: 'var(--mut)' }}>{loading ? 'Loading…' : 'No posts yet — delivery counts appear once posts exist.'}</p>
                  ) : (
                    byNetwork.map((ch) => (
                      <div key={ch.network} className={styles.chBar}>
                        <div className={styles.chBarHead}>
                          <span className={styles.chBarName}><span className={styles.chBarDot} style={{ background: NETWORK_COLOR[ch.network.toLowerCase()] || '#666' }} />{cap(ch.network)}</span>
                          <span className={styles.chBarVal}>{ch.published} published</span>
                        </div>
                        <div className={styles.chBarTrack}>
                          <div className={styles.chBarFill} style={{ width: `${Math.round((ch.published / maxPublished) * 100)}%`, background: NETWORK_COLOR[ch.network.toLowerCase()] || '#666' }} />
                        </div>
                        <div className={styles.chBarMeta}>
                          <span>Failed: {ch.failed}</span>
                          <span>Scheduled: {ch.scheduled}</span>
                          <span>Draft: {ch.draft}</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className={styles.card}>
                <div className={styles.cardHead}>
                  <div className={styles.cardHeadLeft}>
                    <h2 className={styles.cardTitle}>Recent posts</h2>
                    <p className={styles.cardSub}>Newest first · click to view</p>
                  </div>
                </div>
                <div className={styles.cardBody} style={{ padding: '4px 16px' }}>
                  {recent.length === 0 ? (
                    <p style={{ margin: 0, padding: '12px 0', fontSize: 13, color: 'var(--mut)' }}>{loading ? 'Loading…' : 'No posts yet.'}</p>
                  ) : (
                    <div className={styles.topList}>
                      {recent.map((p, i) => (
                        <div key={p.id} className={styles.topRow} onClick={() => setPeekPost(p)}>
                          <span className={styles.topRank}>{String(i + 1).padStart(2, '0')}</span>
                          <div className={styles.topMain}>
                            <div className={styles.topTitle}>{titleOf(p)}</div>
                            <div className={styles.topMeta}>{channelOf(p)} · {new Date(p.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} · {p.status}</div>
                          </div>
                          <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--mut)' }}>chevron_right</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {peekPost && (
        <>
          <div className={`${styles.scrim} ${styles.scrimOpen}`} onClick={() => setPeekPost(null)} />
          <div className={`${styles.peek} ${styles.peekOpen}`}>
            <div className={styles.peekHead}>
              <div>
                <h3 className={styles.peekHeadTitle}>{titleOf(peekPost)}</h3>
                <p className={styles.peekHeadSub}>{channelOf(peekPost)} · {new Date(peekPost.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</p>
              </div>
              <button type="button" className={styles.btnIcon} onClick={() => setPeekPost(null)}><span className="material-symbols-outlined">close</span></button>
            </div>
            <div className={styles.peekBody}>
              <div className={styles.peekField}><span className={styles.peekLabel}>Status</span><span className={styles.peekValue}>{peekPost.status}</span></div>
              <div className={styles.peekField}><span className={styles.peekLabel}>Channel</span><span className={styles.peekValue}>{channelOf(peekPost)}</span></div>
              {peekPost.scheduledAt && <div className={styles.peekField}><span className={styles.peekLabel}>Scheduled</span><span className={styles.peekValue}>{new Date(peekPost.scheduledAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span></div>}
              {peekPost.error && <div className={styles.peekField}><span className={styles.peekLabel}>Error</span><span className={styles.peekValue}>{peekPost.error}</span></div>}
              <div className={styles.peekField}><span className={styles.peekLabel}>Source</span><span className={styles.peekValue}>{peekPost.sourceType}</span></div>
            </div>
            <div className={styles.peekFooter}>
              <button type="button" className={`${styles.btn} ${styles.btnOutline}`} onClick={() => { setPeekPost(null); onNavigate?.('marketing', 'mkt-queue'); }}>
                <span className="material-symbols-outlined">outbox</span> View in queue
              </button>
              <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => { setPeekPost(null); onNavigate?.('marketing', 'mkt-create-content'); }}>
                <span className="material-symbols-outlined">content_copy</span> Replicate
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
