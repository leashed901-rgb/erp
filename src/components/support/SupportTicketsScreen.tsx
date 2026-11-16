'use client';
/* SupportTicketsScreen — the ticket list over /api/v1/tickets
   (support_tickets). Every action is real: drawer field edits PATCH
   the ticket, bulk assign/priority/solve/delete hit the ticket
   family routes, New ticket creates through the API (with its linked
   conversation + counter ref), Export downloads the live rows. */
import { useMemo, useState } from 'react';
import { useStaff } from '@/hooks/useQueueApi';
import { useTickets, ticketMutations } from '@/hooks/useSupportApi';
import { exportToCsv } from '@/lib/csvExport';
import type { Ticket } from '@/lib/supportTypes';

interface SupportScreenProps {
  onToast: (msg: string) => void;
  onNavigate?: (domain: import('@/data/shellData').DomainKey, screenId: string) => void;
}

type ViewTab = 'All' | 'Unassigned' | 'Mine';
const VIEW_TABS: { id: ViewTab; label: string }[] = [
  { id: 'All', label: 'All tickets' },
  { id: 'Unassigned', label: 'Unassigned' },
  { id: 'Mine', label: 'My tickets' },
];

const PRIORITY_FILTERS = ['', 'Urgent', 'High', 'Normal', 'Low'];
const PRIORITY_LADDER = ['low', 'normal', 'high', 'urgent'];
const AVATAR_BGS = ['bg-qb-blue', 'bg-qb-teal', 'bg-qb-green', 'bg-qb-maroon', 'bg-qb-navy'];

function cap(s: string): string { return s ? s.charAt(0).toUpperCase() + s.slice(1) : s; }
function statusLabel(status: string): string {
  if (status === 'resolved') return 'Solved';
  return cap(status.replace(/_/g, ' '));
}
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts.length ? parts.slice(0, 2).map((p) => p[0]).join('').toUpperCase() : '?';
}
function avatarFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_BGS[h % AVATAR_BGS.length];
}

export default function SupportTicketsScreen({ onToast, onNavigate }: SupportScreenProps) {
  const { tickets, setTickets, refresh } = useTickets();
  const { data: staff } = useStaff();
  const operator = staff[0] || null;

  const [currentTab, setCurrentTab] = useState<ViewTab>('All');
  const [q, setQ] = useState('');
  const [priorityFilter, setPriorityFilter] = useState('');
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [drawerId, setDrawerId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [newForm, setNewForm] = useState({ subject: '', requesterName: '', requesterEmail: '', priority: 'Normal', message: '' });
  const [menu, setMenu] = useState<{ id: string; top: number; left: number } | null>(null);

  const staffName = useMemo(() => {
    const map = new Map(staff.map((s) => [s.id, s.display_name]));
    return (id: string | null) => (id ? map.get(id) || 'Staff' : 'Unassigned');
  }, [staff]);

  const rows = tickets.filter((t) => {
    const tabOk = currentTab === 'All'
      || (currentTab === 'Unassigned' ? !t.assignedStaffId : operator ? t.assignedStaffId === operator.id : false);
    const ql = q.toLowerCase();
    const qOk = !ql || `${t.ticketRef} ${t.subject} ${t.requesterName || ''} ${t.requesterEmail || ''} ${t.priority} ${t.status} ${staffName(t.assignedStaffId)}`.toLowerCase().includes(ql);
    const pOk = !priorityFilter || cap(t.priority) === priorityFilter;
    return tabOk && qOk && pOk;
  });

  const allChecked = rows.length > 0 && rows.every((t) => checked.has(t.id));
  const someChecked = rows.some((t) => checked.has(t.id));
  const drawerTicket = drawerId ? tickets.find((t) => t.id === drawerId) : null;

  function patchLocal(id: string, partial: Partial<Ticket>) {
    setTickets(tickets.map((t) => (t.id === id ? { ...t, ...partial } : t)));
  }

  function toggleRow(id: string) {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAll(on: boolean) {
    setChecked((prev) => {
      const next = new Set(prev);
      rows.forEach((t) => { if (on) next.add(t.id); else next.delete(t.id); });
      return next;
    });
  }

  function clearChecks() { setChecked(new Set()); }

  /* Bulk bar — every action lands on the API for each checked ticket */
  async function bulkAction(act: 'assign' | 'priority' | 'solve' | 'delete' | 'close') {
    if (act === 'close') { clearChecks(); return; }
    const ids = [...checked];
    if (!ids.length) return;
    let failed = 0;
    for (const id of ids) {
      const t = tickets.find((x) => x.id === id);
      if (!t) continue;
      let res: { ok: boolean } = { ok: true };
      if (act === 'assign') {
        if (!operator) { onToast('No staff available to assign to'); return; }
        res = await ticketMutations.assign(id, operator.id);
        if (res.ok) patchLocal(id, { assignedStaffId: operator.id });
      } else if (act === 'priority') {
        const idx = PRIORITY_LADDER.indexOf(t.priority);
        const next = PRIORITY_LADDER[Math.min(PRIORITY_LADDER.length - 1, idx + 1)];
        res = await ticketMutations.patch(id, { priority: next });
        if (res.ok) patchLocal(id, { priority: next });
      } else if (act === 'solve') {
        res = await ticketMutations.setStatus(id, 'resolved');
        if (res.ok) patchLocal(id, { status: 'resolved' });
      } else if (act === 'delete') {
        res = await ticketMutations.remove(id);
        if (res.ok) setTickets(tickets.filter((x) => !checked.has(x.id)));
      }
      if (!res.ok) failed++;
    }
    const label = act.charAt(0).toUpperCase() + act.slice(1);
    onToast(failed ? `${label}: ${ids.length - failed} of ${ids.length} tickets updated` : `${label} on ${ids.length} ticket${ids.length !== 1 ? 's' : ''}`);
    clearChecks();
    refresh();
  }

  function openRowMenu(e: React.MouseEvent<HTMLButtonElement>, id: string) {
    e.stopPropagation();
    const r = e.currentTarget.getBoundingClientRect();
    setMenu({
      id,
      top: r.bottom + 4,
      left: Math.min(r.right - 250, window.innerWidth - 270),
    });
  }

  function closeMenu() { setMenu(null); }

  async function action(act: string, id: string) {
    if (act === 'open-inbox') {
      onToast('Opening conversation in Omnichannel Inbox...');
      setDrawerId(null);
      closeMenu();
      onNavigate?.('support', 'agent-workspace');
    } else if (act === 'view-crm') {
      closeMenu();
      onNavigate?.('contacts', 'customers');
    } else if (act === 'delete') {
      const res = await ticketMutations.remove(id);
      if (res.ok) {
        setTickets(tickets.filter((t) => t.id !== id));
        setChecked((prev) => { const next = new Set(prev); next.delete(id); return next; });
        onToast('Ticket deleted');
      } else onToast(`Delete failed: ${res.error}`);
      closeMenu();
    } else if (act === 'email') {
      closeMenu();
      onNavigate?.('support', 'agent-workspace');
    } else if (act === 'view-details') {
      setDrawerId(id);
      closeMenu();
    }
  }

  function onRowClick(e: React.MouseEvent<HTMLTableRowElement>, id: string) {
    if ((e.target as HTMLElement).closest('input,button')) return;
    setDrawerId(id);
  }

  /* Drawer field edits — saved to the API on change */
  async function drawerPatch(field: 'status' | 'priority' | 'assigned', value: string) {
    if (!drawerTicket) return;
    const id = drawerTicket.id;
    if (field === 'status') {
      const status = value === 'Solved' ? 'resolved' : value.toLowerCase();
      patchLocal(id, { status });
      const res = await ticketMutations.patch(id, { status });
      if (!res.ok) { onToast(`Status failed: ${res.error}`); refresh(); }
    } else if (field === 'priority') {
      const priority = value.toLowerCase();
      patchLocal(id, { priority });
      const res = await ticketMutations.patch(id, { priority });
      if (!res.ok) { onToast(`Priority failed: ${res.error}`); refresh(); }
    } else {
      const staffId = value || null;
      patchLocal(id, { assignedStaffId: staffId });
      const res = await ticketMutations.assign(id, staffId);
      if (!res.ok) { onToast(`Assign failed: ${res.error}`); refresh(); }
    }
  }

  async function createTicket() {
    if (!newForm.subject.trim()) { onToast('Enter a subject for the ticket'); return; }
    const res = await ticketMutations.create({
      subject: newForm.subject.trim(),
      requester_name: newForm.requesterName.trim() || null,
      requester_email: newForm.requesterEmail.trim() || null,
      priority: newForm.priority.toLowerCase(),
      message: newForm.message.trim() || undefined,
      source_channel: 'web',
    });
    if (!res.ok) { onToast(`Create failed: ${res.error}`); return; }
    const ref = (res.data as { ticket_ref?: string })?.ticket_ref || '';
    onToast(`Ticket ${ref} created`);
    setCreating(false);
    setNewForm({ subject: '', requesterName: '', requesterEmail: '', priority: 'Normal', message: '' });
    refresh();
  }

  function exportCsv() {
    exportToCsv(
      rows.map((t) => ({
        ticket: t.ticketRef,
        subject: t.subject,
        requester: t.requesterName || t.requesterEmail || '',
        priority: cap(t.priority),
        status: statusLabel(t.status),
        assignee: staffName(t.assignedStaffId),
        updated: t.updatedAt,
      })),
      [
        { key: 'ticket', label: 'Ticket' },
        { key: 'subject', label: 'Subject' },
        { key: 'requester', label: 'Requester' },
        { key: 'priority', label: 'Priority' },
        { key: 'status', label: 'Status' },
        { key: 'assignee', label: 'Assignee' },
        { key: 'updated', label: 'Updated' },
      ],
      'tickets',
    );
    onToast(`Exported ${rows.length} tickets`);
  }

  return (
    <main className="px-6 pb-12">

      {/* ─── BREADCRUMB ─── */}
      <div className="flex items-center gap-2 text-label-sm text-on-surface-variant mt-4 mb-2">
        <span>Support</span><span className="text-outline">/</span>
        <span className="text-on-surface font-semibold">Tickets</span>
      </div>

      {/* ─── SUB-NAVIGATION ─── */}
      <div className="flex items-center gap-1 border-b border-surface-dim bg-white overflow-x-auto">
        <button className="px-3 py-2 text-label-md tab-underline text-on-surface-variant" onClick={() => onNavigate?.('support', 'support-overview')}>Overview</button>
        <button className="px-3 py-2 text-label-md tab-underline text-on-surface-variant" onClick={() => onNavigate?.('support', 'agent-workspace')}>Omnichannel Inbox</button>
        <button className="px-3 py-2 text-label-md tab-underline active">Tickets</button>
        <button className="px-3 py-2 text-label-md tab-underline text-on-surface-variant" onClick={() => onNavigate?.('support', 'trust')}>Knowledge Base</button>
      </div>

      {/* ─── PAGE HEADER ─── */}
      <div className="flex items-center justify-between gap-4 py-4 flex-wrap">
        <div>
          <h1 className="text-headline-lg">Tickets</h1>
          <p className="text-body-sm text-on-surface-variant mt-0.5">Manage, prioritize, and resolve customer requests.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex split-btn">
            <button className="h-8 px-3 bg-primary text-white text-body-md font-semibold hover:bg-primary-container flex items-center gap-1 split-btn-main" onClick={() => setCreating(true)}>
              <span className="material-symbols-outlined text-[16px]">add</span>New ticket
            </button>
            <button className="h-8 px-1.5 bg-primary text-white hover:bg-primary-container split-btn-arrow" onClick={() => setCreating(true)}>
              <span className="material-symbols-outlined text-[16px]">expand_more</span></button>
          </div>
          <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1" onClick={exportCsv}>
            <span className="material-symbols-outlined text-[16px]">download</span>Export</button>
        </div>
      </div>

      {/* ─── TABLE CARD ─── */}
      <div className="bg-white rounded-xl shadow-sm border border-surface-dim overflow-hidden">

        {/* View tabs */}
        <div className="flex items-center gap-1 px-4 h-11 border-b border-surface-dim overflow-x-auto">
          {VIEW_TABS.map((t) => (
            <button key={t.id} className={`h-full px-3 text-label-md tab-underline ${currentTab === t.id ? 'active' : 'text-on-surface-variant'}`} onClick={() => setCurrentTab(t.id)}>{t.label}</button>
          ))}
        </div>

        {/* Filter row */}
        <div className="px-4 py-2 flex items-center gap-2 border-b border-surface-dim flex-wrap">
          <div className="relative flex items-center flex-1 max-w-sm min-w-[180px]">
            <span className="material-symbols-outlined absolute left-2 text-[15px] text-outline">search</span>
            <input className="w-full h-7 pl-7 pr-2 bg-surface-container-low border border-surface-dim rounded text-body-sm focus:outline-none focus:border-primary" placeholder="Search tickets…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <label className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1 bg-white">
            <span className="material-symbols-outlined text-[14px] text-on-surface-variant">flag</span>
            <span className="text-on-surface-variant">Priority:</span>
            <select className="bg-transparent border-none text-label-sm text-on-surface focus:outline-none" value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)}>
              {PRIORITY_FILTERS.map((p) => <option key={p} value={p}>{p || 'All'}</option>)}
            </select>
          </label>
          <span className="ml-auto text-[11px] text-on-surface-variant">{rows.length} of {tickets.length}</span>
        </div>

        {/* Bulk bar */}
        {checked.size > 0 && (
          <div className="bulk-bar show">
            <span className="text-[12px] font-semibold">{checked.size} selected</span>
            <span className="w-px h-4 bg-white/30"></span>
            <button onClick={() => bulkAction('assign')}><span className="material-symbols-outlined text-[14px] align-middle mr-1">person_add</span>Assign</button>
            <button onClick={() => bulkAction('priority')}><span className="material-symbols-outlined text-[14px] align-middle mr-1">flag</span>Set priority</button>
            <button onClick={() => bulkAction('solve')}><span className="material-symbols-outlined text-[14px] align-middle mr-1">check_circle</span>Mark solved</button>
            <span className="w-px h-4 bg-white/30"></span>
            <button onClick={() => bulkAction('delete')}><span className="material-symbols-outlined text-[14px] align-middle mr-1">delete</span>Delete</button>
            <button className="ml-auto" onClick={() => bulkAction('close')}><span className="material-symbols-outlined text-[16px]">close</span></button>
          </div>
        )}

        {/* Table */}
        <table className="w-full text-left text-body-sm">
          <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider">
            <tr>
              <th className="w-8 px-3 py-2"><input type="checkbox" className="row-check" checked={allChecked} ref={(el) => { if (el) el.indeterminate = someChecked && !allChecked; }} onChange={(e) => toggleAll(e.target.checked)} /></th>
              <th className="px-3 py-2">Ticket ID</th>
              <th className="px-3 py-2">Subject</th>
              <th className="px-3 py-2">Customer</th>
              <th className="px-3 py-2">Priority</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Assignee</th>
              <th className="w-8"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-dim">
            {rows.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-10 text-center text-on-surface-variant">No tickets match — new tickets from every channel land here.</td></tr>
            )}
            {rows.map((t) => {
              const requester = t.requesterName || t.requesterEmail || 'Unknown';
              return (
                <tr key={t.id} className="hover:bg-surface-container-low cursor-pointer" onClick={(e) => onRowClick(e, t.id)}>
                  <td className="px-3 py-2"><input type="checkbox" className="row-check" checked={checked.has(t.id)} onClick={(e) => e.stopPropagation()} onChange={() => toggleRow(t.id)} /></td>
                  <td className="px-3 py-2 font-mono text-primary font-medium">{t.ticketRef}</td>
                  <td className="px-3 py-2 font-medium">{t.subject}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className={`w-6 h-6 rounded-full ${avatarFor(requester)} text-white flex items-center justify-center text-[10px] font-bold`}>{initialsOf(requester)}</div>
                      <div className="min-w-0">
                        <div className="font-medium truncate">{requester}</div>
                        <div className="text-[10px] text-on-surface-variant font-mono">{t.requesterCustomerId ? t.requesterCustomerId.slice(0, 8) : t.requesterEmail || ''}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2"><span className={`stat ${t.priority}`}>{cap(t.priority)}</span></td>
                  <td className="px-3 py-2"><span className={`stat ${t.status === 'resolved' ? 'solved' : t.status}`}>{statusLabel(t.status)}</span></td>
                  <td className="px-3 py-2 text-on-surface-variant">{staffName(t.assignedStaffId)}</td>
                  <td className="px-2 py-2 text-right">
                    <button className="w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center" onClick={(e) => openRowMenu(e, t.id)}>
                      <span className="material-symbols-outlined text-[16px] text-on-surface-variant">more_horiz</span>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ─── ROW ⋯ MENU ─── */}
      {menu && (
        <>
          <div className="row-menu open" style={{ top: menu.top, left: menu.left }} onClick={(e) => e.stopPropagation()}>
            <div className="menu-header">Ticket Actions</div>
            <button onClick={() => action('open-inbox', menu.id)}><span className="material-symbols-outlined">chat</span>Open ticket in Inbox</button>
            <button onClick={() => action('view-details', menu.id)}><span className="material-symbols-outlined">visibility</span>View ticket details</button>
            <div className="sep"></div>
            <div className="menu-header">Customer Record</div>
            <button onClick={() => action('view-crm', menu.id)}><span className="material-symbols-outlined">groups</span>View CRM record</button>
            <button onClick={() => action('email', menu.id)}><span className="material-symbols-outlined">mail</span>Email customer</button>
            <div className="sep"></div>
            <button className="danger" onClick={() => action('delete', menu.id)}><span className="material-symbols-outlined">delete</span>Delete ticket</button>
          </div>
          <div style={{ position: 'fixed', inset: 0, zIndex: 150 }} onClick={closeMenu} />
        </>
      )}

      {/* ─── TICKET DETAIL DRAWER ─── */}
      {drawerTicket && (
        <>
          <div className="drawer-scrim open" onClick={() => setDrawerId(null)} />
          <div className="drawer open" key={drawerTicket.id}>
            <div className="flex items-center justify-between px-5 h-14 border-b border-surface-dim shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="material-symbols-outlined text-[20px] text-primary">confirmation_number</span>
                <div className="min-w-0">
                  <div className="text-headline-sm truncate">Ticket {drawerTicket.ticketRef}</div>
                  <div className="text-[11px] text-on-surface-variant truncate">{drawerTicket.subject}</div>
                </div>
              </div>
              <button className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center" onClick={() => setDrawerId(null)}>
                <span className="material-symbols-outlined text-[18px]">close</span></button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div className="bg-surface-container-low rounded-lg p-3 mb-4 flex justify-between items-center">
                <div>
                  <div className="text-headline-sm mb-1">{drawerTicket.subject}</div>
                  <div className="text-[11px] text-on-surface-variant">Requested by {drawerTicket.requesterName || drawerTicket.requesterEmail || 'Unknown'} (<span className="font-mono text-primary">{drawerTicket.requesterCustomerId || 'no CRM record'}</span>)</div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label">Status</label>
                  <select className="field-input" value={statusLabel(drawerTicket.status)} onChange={(e) => drawerPatch('status', e.target.value)}>
                    <option>New</option><option>Open</option><option>Pending</option><option>Solved</option><option>Closed</option>
                  </select>
                </div>
                <div>
                  <label className="field-label">Priority</label>
                  <select className="field-input" value={cap(drawerTicket.priority)} onChange={(e) => drawerPatch('priority', e.target.value)}>
                    <option>Low</option><option>Normal</option><option>High</option><option>Urgent</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="field-label">Assignee</label>
                <select className="field-input" value={drawerTicket.assignedStaffId || ''} onChange={(e) => drawerPatch('assigned', e.target.value)}>
                  <option value="">Unassigned</option>
                  {staff.map((s) => (<option key={s.id} value={s.id}>{s.display_name}</option>))}
                </select>
              </div>
              <div className="text-[11px] text-on-surface-variant">Changes save immediately — status, priority and assignee write straight to the ticket.</div>
            </div>

            <div className="h-14 border-t border-surface-dim px-4 flex items-center justify-between shrink-0">
              <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={() => setDrawerId(null)}>Close</button>
              <div className="flex items-center gap-2">
                <button className="h-8 px-3 border border-surface-dim rounded text-body-md font-semibold hover:bg-surface-container-low flex items-center gap-1" onClick={() => action('view-crm', drawerTicket.id)}>
                  <span className="material-symbols-outlined text-[16px]">groups</span>View CRM
                </button>
                <button className="h-8 px-4 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container" onClick={() => action('open-inbox', drawerTicket.id)}>Open in Inbox</button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ─── NEW TICKET DRAWER ─── */}
      {creating && (
        <>
          <div className="drawer-scrim open" onClick={() => setCreating(false)} />
          <div className="drawer open">
            <div className="flex items-center justify-between px-5 h-14 border-b border-surface-dim shrink-0">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[20px] text-primary">confirmation_number</span>
                <div className="text-headline-sm">New ticket</div>
              </div>
              <button className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center" onClick={() => setCreating(false)}>
                <span className="material-symbols-outlined text-[18px]">close</span></button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div>
                <label className="field-label">Subject</label>
                <input className="field-input" value={newForm.subject} onChange={(e) => setNewForm({ ...newForm, subject: e.target.value })} placeholder="What does the customer need?" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="field-label">Requester name</label>
                  <input className="field-input" value={newForm.requesterName} onChange={(e) => setNewForm({ ...newForm, requesterName: e.target.value })} />
                </div>
                <div>
                  <label className="field-label">Requester email</label>
                  <input className="field-input" value={newForm.requesterEmail} onChange={(e) => setNewForm({ ...newForm, requesterEmail: e.target.value })} />
                </div>
              </div>
              <div>
                <label className="field-label">Priority</label>
                <select className="field-input" value={newForm.priority} onChange={(e) => setNewForm({ ...newForm, priority: e.target.value })}>
                  <option>Low</option><option>Normal</option><option>High</option><option>Urgent</option>
                </select>
              </div>
              <div>
                <label className="field-label">First message</label>
                <textarea className="field-textarea" rows={4} value={newForm.message} onChange={(e) => setNewForm({ ...newForm, message: e.target.value })} placeholder="The customer's message — saved as the first timeline event" />
              </div>
            </div>
            <div className="h-14 border-t border-surface-dim px-4 flex items-center justify-between shrink-0">
              <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={() => setCreating(false)}>Cancel</button>
              <button className="h-8 px-4 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container" onClick={createTicket}>Create ticket</button>
            </div>
          </div>
        </>
      )}

    </main>
  );
}
