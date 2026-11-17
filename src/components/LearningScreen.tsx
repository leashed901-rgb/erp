'use client';

import { useEffect, useState } from 'react';
import styles from './LearningScreen.module.css';

interface Lesson { id: string; seq: number | null; title: string; unit_type: string | null; duration_minutes: number | null }
interface Course { id: string; code: string | null; title: string; kind: string | null; description: string | null; status: string; duration_minutes: number | null; lessons_total: number; lessons: Lesson[]; enrolled: number; completed: number; avg_progress: number }
interface Learner { enrollment_id: string; learner: string; course: string | null; cohort: string | null; enrolled_at: string | null; progress: number; status: string; due_at: string | null }
interface Cert { name: string | null; holder: string; number: string; issued_at: string | null; expires_at: string | null; status: string }
interface LmsData { kpis: { published_courses: number; active_learners: number; completion_rate: number; overdue: number | null }; courses: Course[]; learners: Learner[]; certifications: Cert[] }

async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' });
  const json = (await res.json().catch(() => null)) as { data?: T; error?: { message?: string } } | null;
  if (!res.ok || !json?.data) throw new Error(json?.error?.message || `Request failed (${res.status})`);
  return json.data;
}

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
function initials(name: string): string {
  return name.split(/\s+/).map((p) => p[0]).filter(Boolean).slice(0, 2).join('').toUpperCase() || '—';
}
function statusPill(status: string): string {
  const s = status.toLowerCase();
  if (s === 'completed') return styles.pillCompleted;
  if (s === 'in_progress' || s === 'in-progress' || s === 'active' || s === 'enrolled') return styles.pillInProgress;
  if (s === 'overdue') return styles.pillOverdue;
  return '';
}
function coverIcon(kind: string | null): string {
  const k = (kind || '').toLowerCase();
  if (k.includes('design')) return 'palette';
  if (k.includes('pod') || k.includes('print')) return 'print';
  if (k.includes('procure')) return 'request_quote';
  if (k.includes('complian')) return 'gavel';
  return 'school';
}

export default function LearningScreen({ onToast }: { onToast?: (msg: string) => void }) {
  const [data, setData] = useState<LmsData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<'courses' | 'learners' | 'certifications'>('courses');
  const [openCourse, setOpenCourse] = useState<Course | null>(null);

  useEffect(() => {
    apiGet<LmsData>('/api/lms/overview').then(setData).catch((e) => setError(e.message));
  }, []);

  if (error) {
    return (
      <div className={styles.wrap}>
        <div className={styles.pageHeader}><h1>Learning & Onboarding</h1><p>Could not load learning data: {error}</p></div>
      </div>
    );
  }
  if (!data) {
    return <div className={styles.wrap}><div className={styles.pageHeader}><h1>Learning & Onboarding</h1><p>Loading…</p></div></div>;
  }

  const k = data.kpis;

  return (
    <div className={styles.wrap}>
      <div className={styles.pageHeader}>
        <h1>Learning & Onboarding</h1>
        <p>Courses, lesson progress, and team certification — powered by the LMS data layer</p>
      </div>

      <div className={styles.kpis}>
        <div className={styles.kpi}>
          <div className={styles.kpiLabel}>Published courses</div>
          <div className={`${styles.kpiValue} ${styles.kpiValueGreen}`}>{k.published_courses}</div>
          <div className={styles.kpiSub}>Live for learners</div>
        </div>
        <div className={styles.kpi}>
          <div className={styles.kpiLabel}>Active learners</div>
          <div className={styles.kpiValue}>{k.active_learners}</div>
          <div className={styles.kpiSub}>Enrolled across courses</div>
        </div>
        <div className={styles.kpi}>
          <div className={styles.kpiLabel}>Completion rate</div>
          <div className={`${styles.kpiValue} ${styles.kpiValueGreen}`}>{k.completion_rate}%</div>
          <div className={styles.kpiSub}>Completed of enrolled</div>
        </div>
        <div className={styles.kpi}>
          <div className={styles.kpiLabel}>Overdue</div>
          <div className={`${styles.kpiValue} ${styles.kpiValueWarn}`}>{k.overdue ?? '—'}</div>
          <div className={styles.kpiSub}>{k.overdue === null ? 'No due dates set' : 'Past due date'}</div>
        </div>
      </div>

      <div className={styles.tabs}>
        <button className={`${styles.tab} ${tab === 'courses' ? styles.tabActive : ''}`} onClick={() => setTab('courses')}>Courses <span className={styles.tabCount}>{data.courses.length}</span></button>
        <button className={`${styles.tab} ${tab === 'learners' ? styles.tabActive : ''}`} onClick={() => setTab('learners')}>Learners <span className={styles.tabCount}>{data.learners.length}</span></button>
        <button className={`${styles.tab} ${tab === 'certifications' ? styles.tabActive : ''}`} onClick={() => setTab('certifications')}>Certifications <span className={styles.tabCount}>{data.certifications.length}</span></button>
      </div>

      {tab === 'courses' && (
        data.courses.length === 0 ? (
          <div className={styles.card}><div className={styles.emptyState}><div className="t">No courses yet</div><div>Courses created in Learning appear here.</div></div></div>
        ) : (
          <div className={styles.courseGrid}>
            {data.courses.map((c) => (
              <button key={c.id} className={styles.courseCard} onClick={() => setOpenCourse(c)}>
                <div className={styles.courseCover}>
                  <span className="material-symbols-outlined" style={{ fontSize: 48, opacity: 0.5 }}>{coverIcon(c.kind)}</span>
                  <span className={`${styles.statusBadge} ${c.status === 'published' ? styles.statusPublished : c.status === 'draft' ? styles.statusDraft : ''}`}>{c.status}</span>
                </div>
                <div className={styles.courseBody}>
                  <div className={styles.courseTitle}>{c.title}</div>
                  <div className={styles.courseDesc}>{c.description || ''}</div>
                  <div className={styles.progressBar}><div className={styles.progressFill} style={{ width: `${c.avg_progress}%` }} /></div>
                  <div className={styles.courseMeta}>
                    <div className="stat"><span className="material-symbols-outlined" style={{ fontSize: 14 }}>menu_book</span>{c.lessons_total} lessons</div>
                    {c.duration_minutes ? <div className="stat"><span className="material-symbols-outlined" style={{ fontSize: 14 }}>schedule</span>{c.duration_minutes}min</div> : null}
                    <div className="stat" style={{ marginLeft: 'auto' }}><span className="material-symbols-outlined" style={{ fontSize: 14 }}>group</span>{c.enrolled}</div>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )
      )}

      {tab === 'learners' && (
        <div className={styles.card}>
          {data.learners.length === 0 ? (
            <div className={styles.emptyState}><div className="t">No learners enrolled</div></div>
          ) : (
            <table className={styles.table}>
              <thead><tr><th>Learner</th><th>Course</th><th>Enrolled</th><th>Progress</th><th>Due</th><th>Status</th></tr></thead>
              <tbody>
                {data.learners.map((l) => (
                  <tr key={l.enrollment_id}>
                    <td>
                      <div className={styles.learnerCell}>
                        <div className={styles.avatar}>{initials(l.learner)}</div>
                        <div><div className={styles.learnerName}>{l.learner}</div><div className={styles.learnerRole}>{l.cohort || ''}</div></div>
                      </div>
                    </td>
                    <td>{l.course || '—'}</td>
                    <td className={styles.mutedCell}>{fmtDate(l.enrolled_at)}</td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div className={styles.progressBar} style={{ flex: 1, margin: 0 }}><div className={styles.progressFill} style={{ width: `${l.progress}%` }} /></div>
                        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--muted)', minWidth: 32 }}>{Math.round(l.progress)}%</span>
                      </div>
                    </td>
                    <td className={styles.mutedCell}>{fmtDate(l.due_at)}</td>
                    <td><span className={`${styles.pill} ${statusPill(l.status)}`}>{l.status.replace(/_/g, ' ')}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {tab === 'certifications' && (
        <div className={styles.card}>
          {data.certifications.length === 0 ? (
            <div className={styles.emptyState}><div className="t">No certifications issued</div><div>Certificates appear when a learner completes a certified course.</div></div>
          ) : (
            <table className={styles.table}>
              <thead><tr><th>Certification</th><th>Holder</th><th>Number</th><th>Issued</th><th>Expires</th><th>Status</th></tr></thead>
              <tbody>
                {data.certifications.map((c) => (
                  <tr key={c.number}>
                    <td><strong>{c.name || '—'}</strong></td>
                    <td>{c.holder}</td>
                    <td className={styles.mutedCell}>{c.number}</td>
                    <td className={styles.mutedCell}>{fmtDate(c.issued_at)}</td>
                    <td className={styles.mutedCell}>{fmtDate(c.expires_at)}</td>
                    <td><span className={`${styles.pill} ${c.status === 'active' ? styles.pillCompleted : styles.pillOverdue}`}>{c.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {openCourse && (
        <>
          <div className={styles.drawerScrim} onClick={() => setOpenCourse(null)} />
          <div className={styles.drawer}>
            <div className={styles.drawerHeader}>
              <div className={styles.drawerTitle}>{openCourse.title}</div>
              <button className={styles.btn} onClick={() => setOpenCourse(null)}><span className="material-symbols-outlined" style={{ fontSize: 18 }}>close</span></button>
            </div>
            <div className={styles.drawerBody}>
              <div className={styles.detailCover}><span className="material-symbols-outlined" style={{ fontSize: 64, opacity: 0.5 }}>{coverIcon(openCourse.kind)}</span></div>
              <div className={styles.detailTitle}>{openCourse.title}</div>
              <div className={styles.detailMeta}>
                <span className="item"><span className="material-symbols-outlined" style={{ fontSize: 14 }}>menu_book</span>{openCourse.lessons_total} lessons</span>
                {openCourse.duration_minutes ? <span className="item"><span className="material-symbols-outlined" style={{ fontSize: 14 }}>schedule</span>{openCourse.duration_minutes} min</span> : null}
                <span className="item"><span className="material-symbols-outlined" style={{ fontSize: 14 }}>group</span>{openCourse.enrolled} enrolled</span>
                <span className={`${styles.pill} ${openCourse.status === 'published' ? styles.pillCompleted : styles.pillInProgress}`} style={{ marginLeft: 'auto' }}>{openCourse.status}</span>
              </div>
              {openCourse.description && <div className={styles.detailDesc}>{openCourse.description}</div>}
              <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 10 }}>Lessons</div>
              {openCourse.lessons.length === 0 ? (
                <div style={{ color: 'var(--muted)', fontSize: 13 }}>No lessons defined for this course yet.</div>
              ) : (
                <div className={styles.lessonList}>
                  {openCourse.lessons.map((l, i) => (
                    <div key={l.id} className={styles.lessonItem}>
                      <div className={styles.lessonNum}>{l.seq ?? i + 1}</div>
                      <div className={styles.lessonDetail}>
                        <div className={styles.lessonName}>{l.title}</div>
                        <div className={styles.lessonMeta}>{[l.unit_type, l.duration_minutes ? `${l.duration_minutes} min` : null].filter(Boolean).join(' · ')}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className={styles.drawerFooter}>
              <button className={`${styles.btn} ${styles.btnOutline}`} onClick={() => setOpenCourse(null)}>Close</button>
              <button className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => onToast?.('Assign opens the cohort enrollment flow')}>Assign</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
