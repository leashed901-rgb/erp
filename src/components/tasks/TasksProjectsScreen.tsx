'use client';

/**
 * Tasks & Projects screen — renders inside the global shell content area.
 * Uses the global SideRail for navigation (no custom sidebar).
 * The view switcher (Board/List/Calendar) + project selector live in a
 * toolbar at the top of the content area, same pattern as finance screens.
 *
 * Wired (doc 27): projects come from the projects table, the board /
 * list / calendar all render crm_tasks (create goes through the
 * platform_create_task RPC route, drag-and-drop PATCHes board_column),
 * members are the real crm_staff directory, and Invite adds a real
 * staff record. No local datasets remain.
 */
import { useMemo, useRef, useState, type DragEvent } from 'react';
import { useStaff } from '@/hooks/useQueueApi';
import { useTasks, useProjects, useCalendarEvents, taskMutations } from '@/hooks/useTasksApi';
import { importCsvFile } from '@/lib/csvImport';
import { VIEW_DEFS } from '@/lib/viewDefs';
import type { Task } from '@/lib/taskTypes';
import styles from './TasksProjects.module.css';

type ColumnId = 'todo' | 'progress' | 'review' | 'done';
type TagId = 'design' | 'dev' | 'marketing' | 'urgent';

const STATUS_LABELS: Record<ColumnId, string> = { todo: 'To Do', progress: 'In Progress', review: 'In Review', done: 'Done' };
const TAG_CLASSES: Record<string, string> = { design: styles.tagDesign, dev: styles.tagDev, marketing: styles.tagMarketing, urgent: styles.tagUrgent };
const COLUMNS: { id: ColumnId; label: string }[] = [
  { id: 'todo', label: 'To Do' },
  { id: 'progress', label: 'In Progress' },
  { id: 'review', label: 'In Review' },
  { id: 'done', label: 'Done' },
];
const PROJECT_COLORS = ['#6b1e28', '#0e5e6f', '#1e5a38', '#a85a00', '#1d2a44'];
const ALL_PROJECTS = 'all';

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts.slice(0, 2).map((p) => p[0]).join('').toUpperCase() : '?';
}
function colorFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return PROJECT_COLORS[h % PROJECT_COLORS.length];
}
function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  return new Date(dateStr).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
function columnOf(t: Task): ColumnId {
  if (t.boardColumn && (COLUMNS as { id: string }[]).some((c) => c.id === t.boardColumn)) return t.boardColumn as ColumnId;
  return t.status === 'done' ? 'done' : 'todo';
}
function tagOf(t: Task): TagId {
  const fromTags = t.tags.find((x) => x in TAG_CLASSES);
  if (fromTags) return fromTags as TagId;
  if (t.priority === 'urgent') return 'urgent';
  if (t.taskType in TAG_CLASSES) return t.taskType as TagId;
  return 'dev';
}
function dateKey(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

interface TasksProjectsScreenProps {
  onToast: (msg: string) => void;
}

export default function TasksProjectsScreen({ onToast }: TasksProjectsScreenProps) {
  const { tasks, setTasks, refresh: refreshTasks } = useTasks();
  const importRef = useRef<HTMLInputElement | null>(null);

  // Real CSV import (GAP-2): Title/Priority/Status/Due date map onto the
  // tasks API. Assignee names cannot resolve to staff ids from a CSV, so
  // imported tasks land unassigned — the toast says exactly that.
  async function handleImport(file: File) {
    const { ok, failed } = await importCsvFile(
      file,
      VIEW_DEFS.tasks.columns,
      VIEW_DEFS.tasks.apiPath,
      async (row) => {
        if (!row.title) return null;
        return {
          title: row.title,
          priority: row.priority || 'medium',
          status: row.status || 'open',
          due_at: row.dueDate || null,
          task_type: 'follow_up',
        };
      },
    );
    if (ok === 0 && failed === 0) { onToast('That CSV has no data rows'); return; }
    onToast(`Import finished — ${ok} created${failed ? `, ${failed} failed` : ''} (unassigned)`);
    if (ok > 0) refreshTasks();
  }
  const { projects, refresh: refreshProjects } = useProjects();
  const { events: calEvents } = useCalendarEvents();
  const { data: staff, refresh: refreshStaff } = useStaff();

  const [currentProject, setCurrentProject] = useState<string>(ALL_PROJECTS);
  const [currentView, setCurrentView] = useState<'board' | 'list' | 'calendar'>('board');
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [taskModalOpen, setTaskModalOpen] = useState(false);
  const [projectModalOpen, setProjectModalOpen] = useState(false);
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [filterOpen, setFilterOpen] = useState(false);
  const [taskForm, setTaskForm] = useState({ title: '', desc: '', assignee: '', date: '', tag: 'design' as TagId, status: 'todo' as ColumnId });
  const [projectName, setProjectName] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('Editor');
  const now = new Date();
  const [calCursor, setCalCursor] = useState({ y: now.getFullYear(), m: now.getMonth() });

  const members = useMemo(() => staff.map((s) => ({
    id: s.id,
    name: s.display_name,
    initials: initialsOf(s.display_name),
    role: s.role || 'Member',
    email: s.email || '',
    color: colorFor(s.id),
  })), [staff]);
  const memberName = useMemo(() => {
    const map = new Map(members.map((m) => [m.id, m]));
    return (id: string | null) => (id ? map.get(id) : undefined);
  }, [members]);

  const projectTasks = useMemo(() => tasks.filter((t) => {
    if (currentProject !== ALL_PROJECTS && !(t.relatedType === 'project' && t.relatedId === currentProject)) return false;
    if (search.trim() && !`${t.title} ${t.description || ''}`.toLowerCase().includes(search.trim().toLowerCase())) return false;
    if (priorityFilter === 'urgent' && t.priority !== 'urgent') return false;
    if (priorityFilter !== 'all' && priorityFilter !== 'urgent' && tagOf(t) !== priorityFilter) return false;
    return true;
  }), [tasks, currentProject, search, priorityFilter]);

  const checklistOf = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of tasks) {
      const kids = tasks.filter((k) => k.parentTaskId === t.id);
      if (kids.length) map.set(t.id, `${kids.filter((k) => k.status === 'done').length}/${kids.length}`);
    }
    return map;
  }, [tasks]);

  const handleDragStart = (e: DragEvent, taskId: string) => {
    setDraggedTaskId(taskId);
    e.dataTransfer.setData('taskId', taskId);
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleDrop = async (e: DragEvent, newStatus: ColumnId) => {
    e.preventDefault();
    const taskId = e.dataTransfer.getData('taskId') || draggedTaskId;
    if (!taskId) return;
    setDraggedTaskId(null);
    const task = tasks.find((t) => t.id === taskId);
    if (!task || columnOf(task) === newStatus) return;
    const nextStatus = newStatus === 'done' ? 'done' : 'open';
    setTasks(tasks.map((t) => (t.id === taskId ? { ...t, boardColumn: newStatus, status: nextStatus } : t)));
    const res = await taskMutations.patch(taskId, { board_column: newStatus, status: nextStatus });
    if (!res.ok) {
      onToast(`Move failed: ${res.error}`);
      refreshTasks();
      return;
    }
    onToast(`Task moved to ${STATUS_LABELS[newStatus]}.`);
  };
  const handleCreateTask = async () => {
    if (!taskForm.title.trim()) { onToast('Please enter a task title.'); return; }
    const res = await taskMutations.create({
      title: taskForm.title.trim(),
      description: taskForm.desc || undefined,
      dueAt: taskForm.date ? new Date(`${taskForm.date}T12:00:00`).toISOString() : null,
      priority: taskForm.tag === 'urgent' ? 'urgent' : 'medium',
      taskType: 'follow_up',
      boardColumn: taskForm.status,
      relatedType: currentProject !== ALL_PROJECTS ? 'project' : null,
      relatedId: currentProject !== ALL_PROJECTS ? currentProject : null,
      assignedTo: taskForm.assignee || null,
      tags: [taskForm.tag],
    });
    if (!res.ok) { onToast(`Task failed: ${res.error}`); return; }
    setTaskForm({ title: '', desc: '', assignee: '', date: '', tag: 'design', status: 'todo' });
    setTaskModalOpen(false);
    onToast('Task created successfully!');
    refreshTasks();
  };
  const handleCreateProject = async () => {
    if (!projectName.trim()) { onToast('Please enter a project name.'); return; }
    const res = await taskMutations.createProject(projectName.trim());
    if (!res.ok) { onToast(`Project failed: ${res.error}`); return; }
    setProjectName('');
    setProjectModalOpen(false);
    refreshProjects();
    if (res.data) setCurrentProject(res.data.id);
    onToast(`Project "${res.data?.name || ''}" created.`);
  };
  const handleSendInvite = async () => {
    if (!inviteEmail.trim()) { onToast('Please enter an email address.'); return; }
    const name = inviteEmail.split('@')[0].replace(/[._-]+/g, ' ').trim();
    const display = name ? name.replace(/\b\w/g, (c) => c.toUpperCase()) : inviteEmail;
    const res = await taskMutations.inviteMember({ display_name: display, email: inviteEmail.trim(), role: inviteRole });
    if (!res.ok) { onToast(`Invite failed: ${res.error}`); return; }
    setInviteEmail('');
    setInviteModalOpen(false);
    refreshStaff();
    onToast(`${display} added to the team as ${inviteRole}.`);
  };

  const year = calCursor.y, month = calCursor.m;
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const todayKey = dateKey(now.toISOString());
  const monthLabel = new Date(year, month, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });

  return (
    <div className={styles.screenContainer}>
      {/* Toolbar — view switcher + project selector + actions */}
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          {/* View switcher */}
          <div className={styles.viewSwitcher}>
            {(['board', 'list', 'calendar'] as const).map((v) => (
              <button key={v} type="button" className={`${styles.viewTab} ${currentView === v ? styles.viewTabActive : ''}`} onClick={() => setCurrentView(v)}>
                <span className="material-symbols-outlined">{v === 'board' ? 'dashboard' : v === 'list' ? 'list' : 'calendar_today'}</span>
                {v.charAt(0).toUpperCase() + v.slice(1)}
              </button>
            ))}
          </div>
          {/* Project selector */}
          <select className={styles.projectSelect} value={currentProject} onChange={(e) => setCurrentProject(e.target.value)}>
            <option value={ALL_PROJECTS}>All work</option>
            {projects.map((p) => (<option key={p.id} value={p.id}>{p.name}</option>))}
          </select>
          <button type="button" className={styles.projectAddBtn} title="New project" onClick={() => setProjectModalOpen(true)}>
            <span className="material-symbols-outlined">add</span>
          </button>
        </div>
        <div className={styles.toolbarRight}>
          {searchOpen && (
            <input
              className={styles.formInput}
              style={{ height: 32, width: 200 }}
              placeholder="Search tasks…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
            />
          )}
          <button type="button" className={styles.btnIcon} title="Search" onClick={() => { setSearchOpen(!searchOpen); if (searchOpen) setSearch(''); }}><span className="material-symbols-outlined">search</span></button>
          <div style={{ position: 'relative' }}>
            <button type="button" className={styles.btnIcon} title="Filter" onClick={() => setFilterOpen(!filterOpen)}><span className="material-symbols-outlined">filter_list</span></button>
            {filterOpen && (
              <div style={{ position: 'absolute', right: 0, top: 36, background: '#fff', border: '1px solid #e2e0e6', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', zIndex: 60, minWidth: 160, overflow: 'hidden' }}>
                {[
                  { id: 'all', label: 'All tasks' },
                  { id: 'urgent', label: 'Urgent only' },
                  { id: 'design', label: 'Design' },
                  { id: 'dev', label: 'Dev' },
                  { id: 'marketing', label: 'Marketing' },
                ].map((f) => (
                  <button key={f.id} type="button" style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', fontSize: 12, background: priorityFilter === f.id ? '#f1eef7' : '#fff' }}
                    onClick={() => { setPriorityFilter(f.id); setFilterOpen(false); }}>
                    {f.label}{priorityFilter === f.id ? ' ✓' : ''}
                  </button>
                ))}
              </div>
            )}
          </div>
          <input ref={importRef} type="file" accept=".csv,text/csv" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void handleImport(f); }} />
          <button type="button" className={styles.btn} onClick={() => importRef.current?.click()}>
            <span className="material-symbols-outlined">upload</span> Import
          </button>
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => { setTaskForm((p) => ({ ...p, assignee: p.assignee || members[0]?.id || '' })); setTaskModalOpen(true); }}>
            <span className="material-symbols-outlined">add</span> Add Task
          </button>
          <div className={styles.avatarGroup}>
            {members.slice(0, 5).map((m) => (<div key={m.id} className={styles.avatar} style={{ background: m.color }} title={m.name}>{m.initials}</div>))}
            <button type="button" className={styles.inviteBtn} onClick={() => setInviteModalOpen(true)}>
              <span className="material-symbols-outlined">person_add</span> Invite
            </button>
          </div>
        </div>
      </div>

      {/* Content area */}
      <div className={styles.contentArea}>
        {currentView === 'board' && (
          <div className={styles.kanbanBoard}>
            {COLUMNS.map((col) => {
              const colTasks = projectTasks.filter((t) => columnOf(t) === col.id);
              return (
                <div key={col.id} className={styles.kanbanColumn} onDragOver={(e) => e.preventDefault()} onDrop={(e) => handleDrop(e, col.id)}>
                  <div className={styles.columnHeader}>
                    <div className={styles.columnTitle}>{col.label} <span className={styles.columnCount}>{colTasks.length}</span></div>
                    <div className={styles.columnActions}>
                      <span className={`material-symbols-outlined ${styles.columnActionIcon}`} onClick={() => { setTaskForm((p) => ({ ...p, status: col.id, assignee: p.assignee || members[0]?.id || '' })); setTaskModalOpen(true); }}>add</span>
                      <span className={`material-symbols-outlined ${styles.columnActionIcon}`}>more_horiz</span>
                    </div>
                  </div>
                  <div className={styles.kanbanCards}>
                    {colTasks.map((t) => {
                      const tag = tagOf(t);
                      const assignee = memberName(t.assignedTo);
                      const checklist = checklistOf.get(t.id);
                      return (
                        <div key={t.id} className={styles.kanbanCard} draggable onDragStart={(e) => handleDragStart(e, t.id)}>
                          <div className={styles.cardTags}>
                            <span className={`${styles.tag} ${TAG_CLASSES[tag]}`}>{tag}</span>
                            {t.priority === 'urgent' && tag !== 'urgent' && <span className={`${styles.tag} ${styles.tagUrgent}`}>Urgent</span>}
                          </div>
                          <h4 className={styles.cardTitle}>{t.title}</h4>
                          <p className={styles.cardDesc}>{t.description || ''}</p>
                          <div className={styles.cardFooter}>
                            <div className={styles.cardMeta}>
                              {t.dueAt && (<span><span className={`material-symbols-outlined ${styles.cardMetaIcon}`}>calendar_today</span>{formatDate(t.dueAt)}</span>)}
                              {checklist && (<span><span className={`material-symbols-outlined ${styles.cardMetaIcon}`}>checklist</span>{checklist}</span>)}
                            </div>
                            <div className={styles.cardAssignee}>
                              {assignee
                                ? <div className={`${styles.avatar} ${styles.avatarSm}`} style={{ background: assignee.color }} title={assignee.name}>{assignee.initials}</div>
                                : <div className={`${styles.avatar} ${styles.avatarSm}`} style={{ background: '#999' }} title="Unassigned">?</div>}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {currentView === 'list' && (
          <div className={styles.listView}>
            <table className={styles.listTable}>
              <thead><tr><th>Task</th><th>Status</th><th>Assignee</th><th>Due Date</th><th>Priority</th></tr></thead>
              <tbody>
                {projectTasks.length === 0 && (
                  <tr><td colSpan={5} style={{ textAlign: 'center', padding: 24, color: '#777' }}>No tasks yet — add the first one above.</td></tr>
                )}
                {projectTasks.map((t) => {
                  const assignee = memberName(t.assignedTo);
                  const col = columnOf(t);
                  return (
                    <tr key={t.id}>
                      <td><b>{t.title}</b></td>
                      <td><span className={`${styles.tag} ${TAG_CLASSES[col === 'done' ? 'design' : col === 'progress' ? 'dev' : 'marketing']}`}>{STATUS_LABELS[col]}</span></td>
                      <td><div className={styles.listAssigneeCell}><div className={`${styles.avatar} ${styles.avatarSm}`} style={{ background: assignee?.color || '#999' }}>{assignee?.initials || '?'}</div>{assignee?.name || 'Unassigned'}</div></td>
                      <td>{t.dueAt ? formatDate(t.dueAt) : '—'}</td>
                      <td><span className={`${styles.tag} ${TAG_CLASSES[tagOf(t)]}`}>{tagOf(t)}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {currentView === 'calendar' && (
          <div className={styles.calendarView}>
            <div className={styles.calendarHeader}>
              <h2 className={styles.calendarTitle}>{monthLabel}</h2>
              <div className={styles.calendarNav}>
                <button type="button" className={styles.btnIcon} onClick={() => setCalCursor(({ y, m }) => (m === 0 ? { y: y - 1, m: 11 } : { y, m: m - 1 }))}><span className="material-symbols-outlined">chevron_left</span></button>
                <button type="button" className={styles.btnIcon} onClick={() => setCalCursor(({ y, m }) => (m === 11 ? { y: y + 1, m: 0 } : { y, m: m + 1 }))}><span className="material-symbols-outlined">chevron_right</span></button>
              </div>
            </div>
            <div className={styles.calendarGrid}>
              {dayNames.map((d) => (<div key={d} className={styles.calendarDayHeader}>{d}</div>))}
              {Array.from({ length: firstDay }, (_, i) => (<div key={`e${i}`} className={`${styles.calendarCell} ${styles.calendarCellEmpty}`} />))}
              {Array.from({ length: daysInMonth }, (_, i) => {
                const day = i + 1;
                const cellKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
                const dayTasks = projectTasks.filter((t) => dateKey(t.dueAt || t.startAt) === cellKey);
                const dayEvents = calEvents.filter((e) => dateKey(e.startsAt) === cellKey);
                return (
                  <div key={day} className={styles.calendarCell}>
                    <div className={`${styles.calendarDate} ${cellKey === todayKey ? styles.calendarDateToday : ''}`}>{day}</div>
                    {dayTasks.map((t) => (<div key={t.id} className={`${styles.calendarTask} ${styles[`calendarTask${tagOf(t).charAt(0).toUpperCase() + tagOf(t).slice(1)}`] || ''}`} title={t.title} onClick={() => onToast(`Task: ${t.title}`)}>{t.title}</div>))}
                    {dayEvents.map((e) => (<div key={`ev-${e.id}`} className={styles.calendarTask} title={e.title} onClick={() => onToast(`Event: ${e.title}`)}>{e.title}</div>))}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Task modal */}
      {taskModalOpen && (
        <div className={styles.overlay} onClick={() => setTaskModalOpen(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}><h2>Create New Task</h2><button type="button" className={styles.btnIconBorderless} onClick={() => setTaskModalOpen(false)}><span className="material-symbols-outlined">close</span></button></div>
            <div className={styles.modalBody}>
              <div className={styles.formGroup}><label className={styles.formLabel}>Task Title</label><input className={styles.formInput} type="text" placeholder="e.g., Update product info accordion content" value={taskForm.title} onChange={(e) => setTaskForm((p) => ({ ...p, title: e.target.value }))} /></div>
              <div className={styles.formGroup}><label className={styles.formLabel}>Description</label><textarea className={styles.formTextarea} placeholder="Add more details..." value={taskForm.desc} onChange={(e) => setTaskForm((p) => ({ ...p, desc: e.target.value }))} /></div>
              <div className={styles.formRow}>
                <div className={styles.formGroup}><label className={styles.formLabel}>Assignee</label><select className={styles.formSelect} value={taskForm.assignee} onChange={(e) => setTaskForm((p) => ({ ...p, assignee: e.target.value }))}><option value="">Unassigned</option>{members.map((m) => (<option key={m.id} value={m.id}>{m.name}</option>))}</select></div>
                <div className={styles.formGroup}><label className={styles.formLabel}>Due Date</label><input className={styles.formInput} type="date" value={taskForm.date} onChange={(e) => setTaskForm((p) => ({ ...p, date: e.target.value }))} /></div>
              </div>
              <div className={styles.formRow}>
                <div className={styles.formGroup}><label className={styles.formLabel}>Priority</label><select className={styles.formSelect} value={taskForm.tag} onChange={(e) => setTaskForm((p) => ({ ...p, tag: e.target.value as TagId }))}><option value="design">Design</option><option value="dev">Dev</option><option value="marketing">Marketing</option><option value="urgent">Urgent</option></select></div>
                <div className={styles.formGroup}><label className={styles.formLabel}>Status</label><select className={styles.formSelect} value={taskForm.status} onChange={(e) => setTaskForm((p) => ({ ...p, status: e.target.value as ColumnId }))}><option value="todo">To Do</option><option value="progress">In Progress</option><option value="review">In Review</option><option value="done">Done</option></select></div>
              </div>
            </div>
            <div className={styles.modalFooter}><button type="button" className={`${styles.btn} ${styles.btnOutline}`} onClick={() => setTaskModalOpen(false)}>Cancel</button><button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={handleCreateTask}>Create Task</button></div>
          </div>
        </div>
      )}

      {/* Project modal */}
      {projectModalOpen && (
        <div className={styles.overlay} onClick={() => setProjectModalOpen(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}><h2>Create New Project</h2><button type="button" className={styles.btnIconBorderless} onClick={() => setProjectModalOpen(false)}><span className="material-symbols-outlined">close</span></button></div>
            <div className={styles.modalBody}><div className={styles.formGroup}><label className={styles.formLabel}>Project Name</label><input className={styles.formInput} type="text" placeholder="e.g., Q1 Marketing Campaign" value={projectName} onChange={(e) => setProjectName(e.target.value)} /></div></div>
            <div className={styles.modalFooter}><button type="button" className={`${styles.btn} ${styles.btnOutline}`} onClick={() => setProjectModalOpen(false)}>Cancel</button><button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={handleCreateProject}>Create Project</button></div>
          </div>
        </div>
      )}

      {/* Invite modal */}
      {inviteModalOpen && (
        <div className={styles.overlay} onClick={() => setInviteModalOpen(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}><h2>Invite to Project</h2><button type="button" className={styles.btnIconBorderless} onClick={() => setInviteModalOpen(false)}><span className="material-symbols-outlined">close</span></button></div>
            <div className={styles.modalBody}>
              <div className={styles.formGroup}><label className={styles.formLabel}>Email Address</label><input className={styles.formInput} type="email" placeholder="colleague@company.com" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} /></div>
              <div className={styles.formGroup}><label className={styles.formLabel}>Role</label><select className={styles.formSelect} value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}><option value="Admin">Admin</option><option value="Editor">Editor</option><option value="Viewer">Viewer</option></select></div>
              <h4 className={styles.membersTitle}>Current Members</h4>
              <div className={styles.memberList}>
                {members.map((m) => (<div key={m.id} className={styles.memberRow}><div className={`${styles.avatar} ${styles.memberAvatar}`} style={{ background: m.color }}>{m.initials}</div><div className={styles.memberInfo}><span className={styles.memberName}>{m.name}</span><span className={styles.memberEmail}>{m.email}</span></div><div className={styles.memberRole}>{m.role}</div></div>))}
                {members.length === 0 && <div className={styles.memberRow}><div className={styles.memberInfo}><span className={styles.memberName}>No team members yet</span></div></div>}
              </div>
            </div>
            <div className={styles.modalFooter}><button type="button" className={`${styles.btn} ${styles.btnOutline}`} onClick={() => setInviteModalOpen(false)}>Cancel</button><button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={handleSendInvite}>Send Invite</button></div>
          </div>
        </div>
      )}
    </div>
  );
}
