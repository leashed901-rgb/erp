'use client';
/* SupportWorkspaceScreen — Zendesk-style 3-panel agent workspace, wired
   to the real ticket family: tabs and properties come from
   /api/v1/tickets, the conversation is the immutable
   support_ticket_events timeline (/api/v1/tickets/[id]/messages),
   replies and internal notes append real events, property edits PATCH
   the ticket, macros apply through the macro route, and the context
   panel reads /api/v1/tickets/[id]/context (CRM customer card, ticket
   history, linked order) + live KB suggestions from support_kb_articles. */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useStaff } from '@/hooks/useQueueApi';
import { useTickets, useTicketThread, useTicketContext, useMacros, ticketMutations } from '@/hooks/useSupportApi';
import { toTicketEvent } from '@/lib/supportTypes';
import type { Ticket } from '@/lib/supportTypes';

interface SupportScreenProps {
  onToast: (msg: string) => void;
  onNavigate?: (domain: import('@/data/shellData').DomainKey, screenId: string) => void;
}

interface Msg {
  kind: 'customer' | 'agent' | 'internal';
  author: string;
  initials: string;
  avatarBg: string;
  via: string | null;
  time: string;
  text: string;
}

const AVATAR_BGS = ['bg-qb-blue', 'bg-qb-teal', 'bg-qb-green', 'bg-qb-maroon', 'bg-qb-navy'];
function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return parts.slice(0, 2).map((p) => p[0]).join('').toUpperCase();
}
function avatarFor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_BGS[h % AVATAR_BGS.length];
}
function channelIcon(channel: string | null): { icon: string; color: string } {
  if (channel === 'email') return { icon: 'mail', color: 'text-qb-blue' };
  if (channel === 'chat' || channel === 'live_chat') return { icon: 'chat', color: 'text-qb-teal' };
  return { icon: 'forum', color: 'text-qb-green' };
}
function fmtTime(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}
function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
function statusLabel(status: string): string {
  if (status === 'resolved') return 'Solved';
  return cap(status.replace(/_/g, ' '));
}

type ContextTab = 'user' | 'apps' | 'knowledge' | 'history';

export default function SupportWorkspaceScreen({ onToast, onNavigate }: SupportScreenProps) {
  const { tickets, setTickets, refresh: refreshTickets } = useTickets();
  const { data: staff } = useStaff();
  const { macros } = useMacros();

  const [openIds, setOpenIds] = useState<string[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [replyMode, setReplyMode] = useState<'public' | 'internal'>('public');
  const [replyText, setReplyText] = useState('');
  const [contextTab, setContextTab] = useState<ContextTab>('user');
  const [search, setSearch] = useState('');
  const [macroOpen, setMacroOpen] = useState(false);
  const [submitMode, setSubmitMode] = useState<'stay' | 'next' | 'close'>('stay');
  const [sending, setSending] = useState(false);

  const messageAreaRef = useRef<HTMLDivElement | null>(null);

  /* Open the first tickets as tabs once the list lands */
  useEffect(() => {
    if (tickets.length && openIds.length === 0) {
      const initial = tickets.filter((t) => t.status !== 'closed').slice(0, 4);
      const ids = (initial.length ? initial : tickets.slice(0, 1)).map((t) => t.id);
      setOpenIds(ids);
      setActiveId(ids[0] ?? null);
    }
  }, [tickets, openIds.length]);

  const active: Ticket | null = tickets.find((t) => t.id === activeId) || tickets.find((t) => openIds.includes(t.id)) || null;
  const { events, setEvents, refresh: refreshThread } = useTicketThread(active?.id ?? null);
  const context = useTicketContext(active?.id ?? null);

  const staffName = useMemo(() => {
    const map = new Map(staff.map((s) => [s.id, s.display_name]));
    return (id: string | null) => (id ? map.get(id) || 'Staff' : 'Unassigned');
  }, [staff]);
  const operator = staff[0] || null;

  const thread: Msg[] = useMemo(() => events.map((e) => {
    const isInternal = e.visibility === 'internal' || e.eventType === 'note';
    const isSystem = !['message', 'note'].includes(e.eventType);
    const author = e.actorLabel || (e.actorType === 'requester' ? (active?.requesterName || 'Customer') : e.actorStaffId ? staffName(e.actorStaffId) : 'Agent');
    return {
      kind: isInternal || isSystem ? 'internal' : e.actorType === 'requester' ? 'customer' : 'agent',
      author: isSystem ? 'System' : author,
      initials: initialsOf(author),
      avatarBg: avatarFor(author),
      via: !isInternal && !isSystem ? `via ${active?.sourceChannel || 'web'}` : null,
      time: fmtTime(e.createdAt),
      text: e.detail,
    };
  }), [events, active, staffName]);

  useEffect(() => {
    const el = messageAreaRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [thread.length, active?.id]);

  function patchLocal(id: string, partial: Partial<Ticket>) {
    setTickets(tickets.map((t) => (t.id === id ? { ...t, ...partial } : t)));
  }

  function openTicket(id: string) {
    if (!openIds.includes(id)) setOpenIds([...openIds, id]);
    setActiveId(id);
    setSearch('');
  }

  function closeTab(id: string) {
    const next = openIds.filter((x) => x !== id);
    setOpenIds(next);
    if (activeId === id) setActiveId(next[0] ?? null);
  }

  function addTab() {
    const nextTicket = tickets.find((t) => !openIds.includes(t.id) && t.status !== 'closed') || tickets.find((t) => !openIds.includes(t.id));
    if (nextTicket) openTicket(nextTicket.id);
    else onToast('Every ticket is already open in a tab');
  }

  async function sendReply() {
    const val = replyText.trim();
    if (!val || !active || sending) return;
    setSending(true);
    const res = await ticketMutations.addMessage(active.id, {
      content: val,
      is_internal: replyMode === 'internal',
      author_name: operator?.display_name || 'Agent',
      author_staff_id: operator?.id,
    });
    setSending(false);
    if (!res.ok) { onToast(`Send failed: ${res.error}`); return; }
    if (res.data) setEvents([...events, toTicketEvent(res.data as Record<string, unknown>)]);
    setReplyText('');
    onToast(replyMode === 'public' ? 'Public reply sent' : 'Internal note added');
    refreshThread();
  }

  async function handleAssign(staffId: string) {
    if (!active) return;
    const next = staffId || null;
    patchLocal(active.id, { assignedStaffId: next });
    const res = await ticketMutations.assign(active.id, next);
    if (!res.ok) { onToast(`Assign failed: ${res.error}`); refreshTickets(); }
    else onToast(next ? `Assigned to ${staffName(next)}` : 'Unassigned');
  }

  async function handlePriority(priority: string) {
    if (!active) return;
    const value = priority.toLowerCase();
    patchLocal(active.id, { priority: value });
    const res = await ticketMutations.patch(active.id, { priority: value });
    if (!res.ok) { onToast(`Priority failed: ${res.error}`); refreshTickets(); }
  }

  async function handleType(type: string) {
    if (!active) return;
    const value = type.toLowerCase();
    patchLocal(active.id, { ticketType: value });
    const res = await ticketMutations.patch(active.id, { ticket_type: value });
    if (!res.ok) { onToast(`Type failed: ${res.error}`); refreshTickets(); }
  }

  async function removeTag(tag: string) {
    if (!active) return;
    const next = active.tags.filter((t) => t !== tag);
    patchLocal(active.id, { tags: next });
    const res = await ticketMutations.patch(active.id, { tags: next });
    if (!res.ok) { onToast(`Tag failed: ${res.error}`); refreshTickets(); }
  }

  async function addFollower(staffId: string) {
    if (!active || !staffId) return;
    const name = staffName(staffId);
    const res = await ticketMutations.addMessage(active.id, {
      content: `Follower added: ${name}`,
      event_type: 'follower_added',
      is_internal: true,
      author_name: operator?.display_name || 'Agent',
      author_staff_id: operator?.id,
    });
    if (!res.ok) { onToast(`Follower failed: ${res.error}`); return; }
    onToast(`${name} is following this ticket`);
    refreshThread();
  }

  async function applyMacro(macroId: string) {
    if (!active) return;
    setMacroOpen(false);
    const res = await ticketMutations.applyMacro(active.id, macroId);
    if (!res.ok) { onToast(`Macro failed: ${res.error}`); return; }
    onToast('Macro applied');
    refreshTickets();
    refreshThread();
  }

  async function submit() {
    if (!active) return;
    if (submitMode === 'close') {
      const res = await ticketMutations.setStatus(active.id, 'closed');
      if (!res.ok) { onToast(`Close failed: ${res.error}`); return; }
      patchLocal(active.id, { status: 'closed' });
      onToast(`Ticket ${active.ticketRef} closed`);
      closeTab(active.id);
      refreshTickets();
      return;
    }
    onToast(`Ticket ${active.ticketRef} saved as ${statusLabel(active.status)}`);
    if (submitMode === 'next') {
      const idx = openIds.indexOf(active.id);
      const nextId = openIds[idx + 1] || openIds[0];
      if (nextId && nextId !== active.id) setActiveId(nextId);
    }
    refreshTickets();
  }

  const searchMatches = search.trim()
    ? tickets.filter((t) => `${t.ticketRef} ${t.subject} ${t.requesterName || ''} ${t.requesterEmail || ''}`.toLowerCase().includes(search.trim().toLowerCase())).slice(0, 6)
    : [];

  const modeBtnActive = 'h-6 px-2 rounded text-[11px] font-semibold bg-white shadow-sm text-on-surface';
  const modeBtnIdle = 'h-6 px-2 rounded text-[11px] font-semibold text-on-surface-variant hover:bg-white';

  const customerName = active?.requesterName || context?.customer?.name || active?.requesterEmail || 'Unknown requester';
  const detailRows: Array<{ label: string; value: string; maroon?: boolean }> = [
    { label: 'Customer since', value: context?.customer?.customerSince ? new Date(context.customer.customerSince).toLocaleDateString([], { month: 'short', year: 'numeric' }) : '—' },
    { label: 'Lifetime value', value: context?.customer?.lifetimeValue != null ? `$${context.customer.lifetimeValue.toLocaleString()}` : '—' },
    { label: 'Open tickets', value: String(context?.openTickets ?? 0) },
    { label: 'Lifecycle stage', value: context?.customer?.lifecycleStage || '—' },
  ];

  return (
    <main className="px-6 pb-4 flex flex-col" style={{ height: 'calc(100vh - 124px)', minHeight: 640 }}>

      {/* ─── CONTEXT HEADER ─── */}
      <div className="h-[52px] flex items-center justify-between bg-white border-b border-surface-dim shrink-0">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[20px] text-on-surface-variant">support_agent</span>
          <span className="text-label-md font-semibold">Support</span>
          <span className="text-outline">/</span>
          <span className="text-label-md text-primary font-semibold">Agent Workspace</span>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative flex items-center">
            <span className="material-symbols-outlined absolute left-2 text-[15px] text-outline">search</span>
            <input className="w-64 h-7 pl-7 pr-2 bg-surface-container-low border border-surface-dim rounded text-body-sm focus:outline-none focus:border-primary" placeholder="Search tickets..." value={search} onChange={(e) => setSearch(e.target.value)} />
            {searchMatches.length > 0 && (
              <div className="absolute top-9 left-0 w-80 bg-white border border-surface-dim rounded-lg shadow-lg z-50 overflow-hidden">
                {searchMatches.map((t) => (
                  <button key={t.id} className="w-full text-left px-3 py-2 hover:bg-surface-container-low border-b border-surface-dim last:border-0" onClick={() => openTicket(t.id)}>
                    <div className="text-[12px] font-medium truncate">{t.subject}</div>
                    <div className="text-[10px] text-on-surface-variant font-mono">{t.ticketRef} · {t.requesterName || t.requesterEmail || '—'} · {statusLabel(t.status)}</div>
                  </button>
                ))}
              </div>
            )}
          </div>
          <button className="w-8 h-8 rounded-full bg-primary text-white flex items-center justify-center text-[12px] font-bold">{operator ? initialsOf(operator.display_name) : 'SA'}</button>
        </div>
      </div>

      {/* ─── TICKET TABS (Zendesk Style) ─── */}
      <div className="ticket-tabs">
        {openIds.map((id) => {
          const t = tickets.find((x) => x.id === id);
          if (!t) return null;
          const ch = channelIcon(t.sourceChannel);
          return (
            <div key={t.id} className={`ticket-tab ${t.id === active?.id ? 'active' : ''}`} onClick={() => setActiveId(t.id)}>
              <span className={`material-symbols-outlined ${ch.color}`}>{ch.icon}</span>
              <span>{t.requesterName || t.requesterEmail || 'Requester'} — {t.subject}</span>
              <span className="px-1.5 py-0.5 rounded bg-surface-container text-[9px] font-mono">{t.ticketRef}</span>
              <span className="material-symbols-outlined" onClick={(e) => { e.stopPropagation(); closeTab(t.id); }}>close</span>
            </div>
          );
        })}
        <div className="ticket-tab" style={{ background: 'transparent', border: 'none', color: '#5a6355' }} onClick={addTab}>
          <span className="material-symbols-outlined">add</span> Add
        </div>
      </div>

      {/* ─── SUB-NAVIGATION ─── */}
      <div className="pt-2 border-b border-surface-dim bg-white shrink-0">
        <div className="flex items-center gap-1 overflow-x-auto">
          <button className="px-3 py-2 text-label-md tab-underline text-on-surface-variant" onClick={() => onNavigate?.('support', 'support-overview')}>Overview</button>
          <button className="px-3 py-2 text-label-md tab-underline active">Omnichannel Inbox</button>
          <button className="px-3 py-2 text-label-md tab-underline text-on-surface-variant" onClick={() => onNavigate?.('support', 'tickets')}>Tickets</button>
          <button className="px-3 py-2 text-label-md tab-underline text-on-surface-variant" onClick={() => onNavigate?.('support', 'messages')}>Conversations</button>
        </div>
      </div>

      {!active ? (
        <div className="flex-1 flex items-center justify-center text-body-sm text-on-surface-variant">
          {tickets.length === 0 ? 'No tickets yet — new tickets from every channel land here.' : 'Open a ticket from the Tickets list to work it here.'}
        </div>
      ) : (
        /* ─── 3-PANEL WORKSPACE ─── */
        <div className="workspace flex-1 min-h-0">

          {/* LEFT: Ticket Properties (Zendesk Left Rail) */}
          <div className="panel-properties">

            {/* Organization / Requester */}
            <div className="prop-section">
              <div className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-2">Organization (create)</div>
              <div className="flex items-center justify-between mb-3">
                <div className="font-medium text-sm">{customerName}</div>
                <button className="text-[10px] text-primary font-semibold hover:underline" onClick={() => operator && handleAssign(operator.id)}>take it</button>
              </div>

              <label className="prop-label">Brand</label>
              <select className="prop-input mb-3"><option>Unsaid</option></select>

              <label className="prop-label">Requester</label>
              <select className="prop-input mb-3" key={active.id}><option>{customerName}</option></select>

              <label className="prop-label">Assignee</label>
              <select className="prop-input mb-3" value={active.assignedStaffId || ''} onChange={(e) => handleAssign(e.target.value)}>
                <option value="">Unassigned</option>
                {staff.map((s) => (<option key={s.id} value={s.id}>Support/{s.display_name}</option>))}
              </select>

              <label className="prop-label">Followers</label>
              <select className="prop-input mb-3" value="" onChange={(e) => addFollower(e.target.value)}>
                <option value="">search agents</option>
                {staff.map((s) => (<option key={s.id} value={s.id}>{s.display_name}</option>))}
              </select>
            </div>

            {/* Form & Tags */}
            <div className="prop-section">
              <label className="prop-label">Form</label>
              <select className="prop-input mb-3"><option>Default Ticket Form</option></select>

              <label className="prop-label">Tags</label>
              <div className="border border-surface-dim rounded p-1.5 bg-white mb-3">
                {active.tags.length === 0 && <span className="text-[11px] text-on-surface-variant">No tags</span>}
                {active.tags.map((tag) => (
                  <span key={tag} className="prop-tag">{tag} <span className="material-symbols-outlined text-[12px] cursor-pointer" onClick={() => removeTag(tag)}>close</span></span>
                ))}
              </div>
            </div>

            {/* Type & Priority */}
            <div className="prop-section">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="prop-label">Type</label>
                  <select className="prop-input" value={cap(active.ticketType || 'question')} onChange={(e) => handleType(e.target.value)}>
                    <option>Question</option><option>Incident</option><option>Problem</option>
                  </select>
                </div>
                <div>
                  <label className="prop-label">Priority</label>
                  <select className="prop-input" value={cap(active.priority)} onChange={(e) => handlePriority(e.target.value)}>
                    <option>Low</option><option>Normal</option><option>High</option><option>Urgent</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Macro */}
            <div className="prop-section mt-auto border-b-0 border-t relative">
              <button className="w-full h-8 border border-surface-dim rounded text-sm font-semibold hover:bg-surface-container-low flex items-center justify-center gap-1" onClick={() => setMacroOpen(!macroOpen)}>
                <span className="material-symbols-outlined text-[16px]">bolt</span>Apply macro
              </button>
              {macroOpen && (
                <div className="absolute bottom-10 left-0 right-0 bg-white border border-surface-dim rounded-lg shadow-lg z-50 overflow-hidden">
                  {macros.length === 0 && <div className="px-3 py-2 text-[12px] text-on-surface-variant">No macros defined yet</div>}
                  {macros.filter((m) => m.isActive).map((m) => (
                    <button key={m.id} className="w-full text-left px-3 py-2 hover:bg-surface-container-low border-b border-surface-dim last:border-0" onClick={() => applyMacro(m.id)}>
                      <div className="text-[12px] font-medium">{m.name}</div>
                      {m.description && <div className="text-[10px] text-on-surface-variant truncate">{m.description}</div>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* MIDDLE: Conversation */}
          <div className="panel-conversation">

            {/* Conversation Header */}
            <div className="conversation-header">
              <div className="flex items-center gap-3">
                <span className="font-bold text-sm">Conversation with {customerName}</span>
                <span className="text-[11px] text-on-surface-variant">Via {active.sourceChannel || 'web'}</span>
                {active.firstResponseDueAt && (
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${active.firstResponseBreachedAt ? 'bg-qb-maroon/10 text-qb-maroon' : 'bg-surface-container text-on-surface-variant'}`}>
                    SLA {active.firstResponseBreachedAt ? 'breached' : `first response by ${fmtTime(active.firstResponseDueAt)}`}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button className="w-7 h-7 rounded hover:bg-surface-container flex items-center justify-center text-on-surface-variant" title="Filter events" onClick={() => onToast('Timeline shows messages, notes and system events')}><span className="material-symbols-outlined text-[16px]">filter_list</span></button>
                <button className="w-7 h-7 rounded hover:bg-surface-container flex items-center justify-center text-on-surface-variant" title="Ticket options" onClick={() => onNavigate?.('support', 'tickets')}><span className="material-symbols-outlined text-[16px]">more_horiz</span></button>
              </div>
            </div>

            {/* Messages */}
            <div className="message-area" ref={messageAreaRef}>
              {thread.length === 0 ? (
                <div className="m-auto text-center">
                  <span className="material-symbols-outlined text-[28px] text-outline">forum</span>
                  <div className="text-body-sm text-on-surface-variant mt-1">No messages on this ticket yet — start with a reply below.</div>
                </div>
              ) : thread.map((m, i) => (
                <div key={i} className={`bubble ${m.kind}`}>
                  <div className="bubble-header">
                    <div className={`w-5 h-5 rounded-full ${m.avatarBg} text-white flex items-center justify-center text-[9px] font-bold`}>{m.initials}</div>
                    <strong>{m.author}</strong>
                    {m.via ? <span>{m.via}</span> : <span className="px-1 py-0.5 rounded bg-qb-maroon/10 text-qb-maroon text-[9px] font-bold uppercase">Internal</span>}
                    <span className="bubble-time">{m.time}</span>
                  </div>
                  <div>{m.text}</div>
                </div>
              ))}
            </div>

            {/* Composer (Zendesk Bottom) */}
            <div className="border-t border-surface-dim bg-white shrink-0">

              {/* Reply Mode Toggle */}
              <div className="flex items-center gap-2 px-4 pt-2 pb-1 border-b border-surface-dim bg-surface-container-low">
                <button className={replyMode === 'public' ? modeBtnActive : modeBtnIdle} onClick={() => setReplyMode('public')}>Public Reply</button>
                <button className={replyMode === 'internal' ? modeBtnActive : modeBtnIdle} onClick={() => setReplyMode('internal')}>Internal Note</button>
              </div>

              {/* Text Area */}
              <div className="p-3">
                <div className="border border-surface-dim rounded-lg focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/20 transition-all bg-white">
                  <textarea className="w-full h-20 p-3 text-sm bg-transparent border-none resize-none focus:outline-none" placeholder="Write a reply... (⌘ + Enter to send)" value={replyText} onChange={(e) => setReplyText(e.target.value)} onKeyDown={(e) => { if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') sendReply(); }} />
                  <div className="flex items-center justify-between px-2 py-1 border-t border-surface-dim bg-surface-container-low rounded-b-lg">
                    <div className="flex items-center gap-1">
                      <button className="w-7 h-7 rounded hover:bg-white flex items-center justify-center text-on-surface-variant" title="Attach file" onClick={() => onToast('Attachments land on the ticket timeline with the next reply')}><span className="material-symbols-outlined text-[16px]">attach_file</span></button>
                      <button className="w-7 h-7 rounded hover:bg-white flex items-center justify-center text-on-surface-variant" title="Knowledge" onClick={() => setContextTab('knowledge')}><span className="material-symbols-outlined text-[16px]">menu_book</span></button>
                      <button className="w-7 h-7 rounded hover:bg-white flex items-center justify-center text-on-surface-variant" title="Emoji" onClick={() => onToast('Emoji picker is part of the composer design')}><span className="material-symbols-outlined text-[16px]">sentiment_satisfied</span></button>
                    </div>
                    <div className="flex items-center gap-2">
                      <button className="h-7 px-3 bg-primary text-white rounded text-[11px] font-semibold hover:bg-primary-container flex items-center gap-1 disabled:opacity-50" onClick={sendReply} disabled={sending || !replyText.trim()}>
                        <span className="material-symbols-outlined text-[14px]">send</span>{sending ? 'Sending…' : 'Send'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Submit as (Zendesk Bottom Bar) */}
              <div className="h-14 px-4 border-t border-surface-dim bg-white flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-on-surface-variant">Stay on ticket</span>
                  <select className="h-7 px-2 border border-surface-dim rounded text-[11px] bg-white text-on-surface focus:outline-none" value={submitMode} onChange={(e) => setSubmitMode(e.target.value as typeof submitMode)}>
                    <option value="stay">Stay on ticket</option>
                    <option value="next">Next ticket in view</option>
                    <option value="close">Close ticket</option>
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <button className="h-8 px-4 bg-primary text-white rounded text-sm font-semibold hover:bg-primary-container flex items-center gap-2" onClick={submit}>
                    Submit as {submitMode === 'close' ? 'Closed' : statusLabel(active.status)}
                    <span className="material-symbols-outlined text-[16px]">expand_more</span>
                  </button>
                </div>
              </div>

            </div>
          </div>

          {/* RIGHT: Context Panel (Zendesk Apps/User/Knowledge/Interaction) */}
          <div className="panel-context">

            {/* Context Tabs */}
            <div className="context-tabs">
              <div className={`context-tab ${contextTab === 'user' ? 'active' : ''}`} onClick={() => setContextTab('user')}><span className="material-symbols-outlined">person</span></div>
              <div className={`context-tab ${contextTab === 'apps' ? 'active' : ''}`} onClick={() => setContextTab('apps')}><span className="material-symbols-outlined">apps</span></div>
              <div className={`context-tab ${contextTab === 'knowledge' ? 'active' : ''}`} onClick={() => setContextTab('knowledge')}><span className="material-symbols-outlined">menu_book</span></div>
              <div className={`context-tab ${contextTab === 'history' ? 'active' : ''}`} onClick={() => setContextTab('history')}><span className="material-symbols-outlined">history</span></div>
            </div>

            {/* User Context */}
            {contextTab === 'user' && (
              <div className="context-body">
                <div className="text-center mb-4">
                  <div className={`w-12 h-12 rounded-full ${avatarFor(customerName)} text-white flex items-center justify-center font-bold text-lg mx-auto mb-2`}>{initialsOf(customerName)}</div>
                  <div className="font-bold text-lg">{customerName}</div>
                  {active.requesterEmail && <div className="text-sm text-on-surface-variant">{active.requesterEmail}</div>}
                </div>
                <div className="border-t border-surface-dim pt-3">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-2">Customer Details</div>
                  {detailRows.map((d) => (
                    <div key={d.label} className="flex justify-between py-1.5 text-xs">
                      <span className="text-on-surface-variant">{d.label}</span>
                      <span className="font-medium">{d.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Apps Context — the ticket's linked records */}
            {contextTab === 'apps' && (
              <div className="context-body">
                <div className="p-3 border border-surface-dim rounded-lg bg-white mb-2">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="material-symbols-outlined text-qb-green">local_shipping</span>
                    <span className="font-semibold text-sm">Linked order</span>
                  </div>
                  {context?.order ? (
                    <>
                      <div className="text-xs text-on-surface-variant mb-2">
                        Order {context.order.number || context.order.id.slice(0, 8)} · {context.order.status || '—'}
                        {context.order.total != null ? ` · $${context.order.total.toFixed(2)}` : ''}
                      </div>
                      <button className="w-full h-7 border border-surface-dim rounded text-[11px] font-semibold hover:bg-surface-container-low" onClick={() => onNavigate?.('orders', 'orders')}>Open the order</button>
                    </>
                  ) : (
                    <div className="text-xs text-on-surface-variant">No order is linked to this ticket.</div>
                  )}
                </div>
                <div className="p-3 border border-surface-dim rounded-lg bg-white">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="material-symbols-outlined text-qb-blue">forum</span>
                    <span className="font-semibold text-sm">Conversation</span>
                  </div>
                  <div className="text-xs text-on-surface-variant mb-2">
                    {active.messageCount} message{active.messageCount === 1 ? '' : 's'} · channel {active.sourceChannel || 'web'} · {active.conversationId.slice(0, 8)}…
                  </div>
                  <button className="w-full h-7 border border-surface-dim rounded text-[11px] font-semibold hover:bg-surface-container-low" onClick={() => onNavigate?.('support', 'messages')}>Open in Omnichannel Inbox</button>
                </div>
              </div>
            )}

            {/* Knowledge Context */}
            {contextTab === 'knowledge' && (
              <div className="context-body">
                <div className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-3">Suggested Articles</div>
                <KnowledgeList subject={active.subject} />
              </div>
            )}

            {/* Interaction History */}
            {contextTab === 'history' && (
              <div className="context-body">
                <div className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant mb-3">Interaction History</div>
                <div className="space-y-2">
                  {(context?.previousTickets || []).length === 0 && (
                    <div className="text-xs text-on-surface-variant">No earlier tickets from this requester.</div>
                  )}
                  {(context?.previousTickets || []).map((h) => (
                    <div key={h.id} className="p-2 border border-surface-dim rounded text-xs cursor-pointer hover:bg-surface-container-low" onClick={() => openTicket(h.id)}>
                      <div className="font-medium text-qb-blue hover:underline">#{h.ticketRef}</div>
                      <div className="text-on-surface-variant">{h.subject} · {statusLabel(h.status)}</div>
                      <div className="text-[10px] text-on-surface-variant mt-1">{fmtTime(h.createdAt)}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        </div>
      )}

    </main>
  );
}

function KnowledgeList({ subject }: { subject: string }) {
  const words = subject.toLowerCase().split(/\W+/).filter((w) => w.length > 3);
  const [articles, setArticles] = useState<Array<{ id: string; title: string; collection: string; usageCount: number }>>([]);
  useEffect(() => {
    let cancelled = false;
    fetch('/api/support/kb')
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        const rows = (json.data || []) as Array<{ id: string; title: string; summary: string | null; collection: string; usageCount: number; status: string }>;
        const scored = rows
          .map((a) => ({ a, score: words.filter((w) => `${a.title} ${a.summary || ''}`.toLowerCase().includes(w)).length }))
          .sort((x, y) => y.score - x.score)
          .slice(0, 5)
          .map((x) => x.a);
        setArticles(scored);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [subject]); // eslint-disable-line react-hooks/exhaustive-deps
  if (articles.length === 0) {
    return <div className="text-xs text-on-surface-variant">No knowledge base articles yet — published articles are suggested here by subject match.</div>;
  }
  return (
    <div className="space-y-3">
      {articles.map((a) => (
        <div key={a.id} className="border-b border-surface-dim pb-2 cursor-pointer">
          <div className="text-sm font-medium text-qb-blue hover:underline">{a.title}</div>
          <div className="text-[11px] text-on-surface-variant mt-1">{a.collection} · used {a.usageCount}×</div>
        </div>
      ))}
    </div>
  );
}
