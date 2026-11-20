'use client';
/**
 * MailboxInbox — a serious inbox, not a flyout.
 *
 * Pixel-perfect 1:1 port of /upload/global icon mailbox.html. This is a
 * full-page inbox that lives behind the mail icon on the main rail. It shows:
 *   - KPI strip: connected mailboxes, unread threads, linked to parties, failed sends
 *   - 4 sub-tabs: All threads · Unread · Party-linked · Mailboxes
 *   - Threads table with bulk bar (mark read, link to party, archive)
 *   - Connect mailbox drawer (Gmail / Outlook / SMTP)
 *   - Compose modal (New message)
 *   - Row menu: open thread, open party, reply, forward, add note, create
 *     deal/task/ticket, pin, tag, archive
 *
 * Wired to the main rail mail icon via GlobalShell → openOrActivateTab.
 */
import { useMemo, useState } from 'react';

interface MailboxInboxProps {
  onToast: (m: string) => void;
  onNavigate?: (d: string, s: string) => void;
}

type Tab = 'All' | 'Unread' | 'Party-linked' | 'Mailboxes';

interface Mailbox {
  id: string;
  provider: 'gmail' | 'outlook' | 'smtp';
  display: string;
  email: string;
  isDefault: boolean;
  status: string;
  threads: number;
  lastSync: string;
}

interface Thread {
  id: string;
  mailbox: string;
  party: string | null;
  partyId: string | null;
  subject: string;
  snippet: string;
  unread: boolean;
  linked: boolean;
  last: string;
  direction: 'inbound' | 'outbound';
}

/* ── Demo data (same as HTML) ── */
const INITIAL_MAILBOXES: Mailbox[] = [
  { id: 'mb-1', provider: 'gmail',   display: 'Sales team', email: 'sales@managekube.io',    isDefault: true,  status: 'Connected', threads: 42, lastSync: '2 min ago' },
  { id: 'mb-2', provider: 'outlook', display: 'Support',     email: 'support@managekube.io',  isDefault: false, status: 'Connected', threads: 18, lastSync: '11 min ago' },
];

const INITIAL_THREADS: Thread[] = [
  { id: 'th-1', mailbox: 'mb-1', party: 'Acme Corp',       partyId: 'p-1047', subject: 'Re: Q4 wholesale pricing',         snippet: 'Thanks — we can lock 500 units at $18…',   unread: true,  linked: true,  last: '12 min ago', direction: 'inbound' },
  { id: 'th-2', mailbox: 'mb-1', party: 'Blue Ridge Co.',  partyId: 'p-1046', subject: 'Order #1046 — tracking',            snippet: 'Your order ships tomorrow via USPS…',        unread: false, linked: true,  last: '2h ago',     direction: 'outbound' },
  { id: 'th-3', mailbox: 'mb-2', party: 'Northwind Labs',   partyId: 'p-1045', subject: 'Question about the Soy candle line', snippet: 'Do you offer a fragrance-free version?',     unread: true,  linked: true,  last: '4h ago',     direction: 'inbound' },
  { id: 'th-4', mailbox: 'mb-2', party: null,               partyId: null,     subject: 'Wholesale inquiry from website',    snippet: 'We are interested in stocking your mugs…',   unread: true,  linked: false, last: '1d ago',     direction: 'inbound' },
  { id: 'th-5', mailbox: 'mb-1', party: 'Lakeside Design',  partyId: 'p-1042', subject: 'Re: design approval',               snippet: 'Approved — go ahead with the print run.',    unread: false, linked: true,  last: '1d ago',     direction: 'inbound' },
];

const ROW_MENU_ITEMS = [
  { header: 'Open' },
  { action: 'open',         label: 'Open thread',       icon: 'open_in_new' },
  { action: 'open-party',   label: 'Open party profile', icon: 'person' },
  { header: 'Communicate' },
  { action: 'reply',        label: 'Reply',             icon: 'reply' },
  { action: 'forward',      label: 'Forward',           icon: 'forward' },
  { action: 'add-note',     label: 'Add note to timeline', icon: 'note_add' },
  { header: 'Create from this' },
  { action: 'create-deal',  label: 'New deal',          icon: 'trending_up' },
  { action: 'create-task',  label: 'New task',          icon: 'task_alt' },
  { action: 'create-ticket', label: 'Support ticket',  icon: 'support_agent' },
  { header: 'Organize' },
  { action: 'pin',          label: 'Pin',               icon: 'push_pin' },
  { action: 'tag',          label: 'Tag',                icon: 'label' },
  { sep: true },
  { action: 'archive',      label: 'Archive',           icon: 'archive', danger: true },
];

function statClass(kind: 'success' | 'warn' | 'error' | 'info' | 'neutral'): string {
  return `stat ${kind}`;
}

export default function MailboxInbox({ onToast, onNavigate }: MailboxInboxProps) {
  const [tab, setTab] = useState<Tab>('All');
  const [query, setQuery] = useState('');
  const [mailboxes, setMailboxes] = useState<Mailbox[]>(INITIAL_MAILBOXES);
  const [threads, setThreads] = useState<Thread[]>(INITIAL_THREADS);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rowMenuForId, setRowMenuForId] = useState<string | null>(null);
  const [mailboxMenuForId, setMailboxMenuForId] = useState<string | null>(null);
  const [connectDrawerOpen, setConnectDrawerOpen] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composePrefill, setComposePrefill] = useState<{ to?: string; subject?: string }>({});
  const [provider, setProvider] = useState<'gmail' | 'outlook' | 'smtp'>('gmail');
  const [fDisplay, setFDisplay] = useState('');
  const [fEmail, setFEmail] = useState('');
  const [fReplyTo, setFReplyTo] = useState('');
  const [fDefaultSender, setFDefaultSender] = useState(true);
  const [fTrack, setFTrack] = useState(true);
  const [fAutoLink, setFAutoLink] = useState(false);
  const [fSignature, setFSignature] = useState('');
  const [composeFrom, setComposeFrom] = useState('sales@yourcompany.com');
  const [composeTo, setComposeTo] = useState('');
  const [composeSubject, setComposeSubject] = useState('');
  const [composeBody, setComposeBody] = useState('');
  const [composeLink, setComposeLink] = useState(true);

  /* ── KPIs ── */
  const unreadCount = threads.filter(t => t.unread).length;
  const linkedCount = threads.filter(t => t.linked).length;

  /* ── filtered threads ── */
  const filteredThreads = useMemo(() => {
    return threads.filter(t => {
      if (tab === 'Unread' && !t.unread) return false;
      if (tab === 'Party-linked' && !t.linked) return false;
      if (tab === 'Mailboxes') return false;
      if (query) {
        const hay = `${t.subject} ${t.snippet} ${t.party ?? ''}`.toLowerCase();
        if (!hay.includes(query.toLowerCase())) return false;
      }
      return true;
    });
  }, [threads, tab, query]);

  /* ── bulk actions ── */
  function toggleThreadSelected(id: string) {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function checkAllThreads(check: boolean) {
    if (check) setSelected(new Set(filteredThreads.map(t => t.id)));
    else setSelected(new Set());
  }
  function bulkAction(act: string) {
    if (act === 'close') { setSelected(new Set()); return; }
    if (act === 'mark-read') {
      setThreads(prev => prev.map(t => selected.has(t.id) ? { ...t, unread: false } : t));
    }
    if (act === 'archive') {
      setThreads(prev => prev.filter(t => !selected.has(t.id)));
    }
    if (act === 'link') {
      onToast('Open party picker to link selected threads');
    }
    onToast(`${act} on ${selected.size} thread${selected.size === 1 ? '' : 's'}`);
    setSelected(new Set());
  }

  /* ── thread actions ── */
  function openThread(id: string) {
    setThreads(prev => prev.map(t => t.id === id ? { ...t, unread: false } : t));
    const t = threads.find(x => x.id === id);
    if (t) onToast(`Opening thread — ${t.subject}`);
  }

  function handleThreadAction(act: string, thread: Thread) {
    setRowMenuForId(null);
    switch (act) {
      case 'open': openThread(thread.id); break;
      case 'open-party':
        if (thread.partyId) onToast(`Navigate → /crm/parties/${thread.partyId}`);
        else onToast('No party linked — use Link to party');
        break;
      case 'reply':
        setComposePrefill({ to: thread.party ?? '', subject: `Re: ${thread.subject}` });
        setComposeOpen(true);
        break;
      case 'forward':
        setComposePrefill({ subject: `Fwd: ${thread.subject}` });
        setComposeOpen(true);
        break;
      case 'add-note': onToast(`Note queued for ${thread.party || 'unlinked thread'}`); break;
      case 'create-deal': onToast(`Create deal from "${thread.subject}" — prefilled customer`); break;
      case 'create-task': onToast(`Create task from "${thread.subject}"`); break;
      case 'create-ticket': onToast(`Create support ticket from "${thread.subject}"`); break;
      case 'pin': onToast('Pinned thread'); break;
      case 'tag': onToast('Open tag picker'); break;
      case 'archive':
        setThreads(prev => prev.filter(t => t.id !== thread.id));
        onToast('Archived');
        break;
    }
  }

  /* ── mailbox actions ── */
  function handleMailboxAction(act: string, mb: Mailbox) {
    setMailboxMenuForId(null);
    switch (act) {
      case 'edit': openConnectDrawer(mb.provider); break;
      case 'sync': onToast('Mailbox synced'); break;
      case 'test': onToast('Test email sent — check your inbox'); break;
      case 'default':
        setMailboxes(prev => prev.map(m => ({ ...m, isDefault: m.id === mb.id })));
        break;
      case 'disconnect':
        setMailboxes(prev => prev.filter(m => m.id !== mb.id));
        onToast('Mailbox disconnected');
        break;
    }
  }

  /* ── connect drawer ── */
  function openConnectDrawer(p: 'gmail' | 'outlook' | 'smtp' = 'gmail') {
    setProvider(p);
    setFDisplay(''); setFEmail(''); setFReplyTo('');
    setFDefaultSender(true); setFTrack(true); setFAutoLink(false); setFSignature('');
    setConnectDrawerOpen(true);
  }
  function saveMailbox() {
    if (!fEmail.trim()) { onToast('Email required'); return; }
    const newMb: Mailbox = {
      id: `mb-${Date.now()}`,
      provider,
      display: fDisplay.trim() || fEmail.split('@')[0],
      email: fEmail.trim(),
      isDefault: fDefaultSender,
      status: 'Connected',
      threads: 0,
      lastSync: 'just now',
    };
    setMailboxes(prev => {
      const next = fDefaultSender ? prev.map(m => ({ ...m, isDefault: false })) : prev;
      return [...next, newMb];
    });
    setConnectDrawerOpen(false);
    onToast(`Mailbox ${fEmail.trim()} connected`);
  }

  /* ── compose ── */
  function openCompose(prefill: { to?: string; subject?: string } = {}) {
    setComposeTo(prefill.to ?? '');
    setComposeSubject(prefill.subject ?? '');
    setComposeBody('');
    setComposeOpen(true);
  }
  function sendEmail() {
    if (!composeTo.trim() || !composeSubject.trim()) { onToast('To and subject required'); return; }
    setComposeOpen(false);
    onToast(`Email sent to ${composeTo.trim()}`);
    // Optimistic: add a thread
    const newThread: Thread = {
      id: `th-${Date.now()}`,
      mailbox: 'mb-1',
      party: null,
      partyId: null,
      subject: composeSubject.trim(),
      snippet: composeBody.slice(0, 60) + (composeBody.length > 60 ? '…' : ''),
      unread: false,
      linked: false,
      last: 'just now',
      direction: 'outbound',
    };
    setThreads(prev => [newThread, ...prev]);
  }

  /* ═════════════════════════════════════════════════════════════════
   *  RENDER
   * ═════════════════════════════════════════════════════════════════ */
  return (
    <main className="px-6 pb-12">
      {/* Context header */}
      <div className="h-[52px] -mx-6 px-6 flex items-center justify-between bg-white border-b border-surface-dim sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <span className="material-symbols-outlined text-[20px] text-on-surface-variant">mail</span>
          <span className="text-label-md font-semibold">Contacts / CRM</span>
          <span className="text-outline">/</span>
          <span className="text-label-md text-primary font-semibold">Inbox</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1"
            onClick={() => openCompose()}
          >
            <span className="material-symbols-outlined text-[16px]">edit</span>Compose
          </button>
          <button
            className="h-8 px-3 bg-primary text-white text-body-md font-semibold hover:bg-primary-container flex items-center gap-1 rounded"
            onClick={() => openConnectDrawer('gmail')}
          >
            <span className="material-symbols-outlined text-[16px]">add</span>Connect mailbox
          </button>
        </div>
      </div>

      {/* Page header */}
      <div className="py-4">
        <h1 className="text-headline-lg">Inbox</h1>
        <p className="text-body-sm text-on-surface-variant mt-0.5">Connected mailboxes and threaded conversations with your parties</p>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-5">
        <div className="bg-white border border-surface-dim rounded-xl p-3">
          <div className="text-[10px] uppercase tracking-wider font-bold text-on-surface-variant">Connected mailboxes</div>
          <div className="text-headline-md mt-1 tabular-nums">{mailboxes.length}</div>
          <div className="text-[11px] text-on-surface-variant mt-0.5">Gmail · Outlook</div>
        </div>
        <div className="bg-white border border-surface-dim rounded-xl p-3">
          <div className="text-[10px] uppercase tracking-wider font-bold text-on-surface-variant">Unread threads</div>
          <div className="text-headline-md mt-1 tabular-nums text-qb-maroon">{unreadCount}</div>
          <div className="text-[11px] text-on-surface-variant mt-0.5">Across both inboxes</div>
        </div>
        <div className="bg-white border border-surface-dim rounded-xl p-3">
          <div className="text-[10px] uppercase tracking-wider font-bold text-on-surface-variant">Linked to parties</div>
          <div className="text-headline-md mt-1 tabular-nums text-secondary">{linkedCount}</div>
          <div className="text-[11px] text-on-surface-variant mt-0.5">Threads on party timelines</div>
        </div>
        <div className="bg-white border border-surface-dim rounded-xl p-3">
          <div className="text-[10px] uppercase tracking-wider font-bold text-on-surface-variant">Failed sends</div>
          <div className="text-headline-md mt-1 tabular-nums text-error">0</div>
          <div className="text-[11px] text-on-surface-variant mt-0.5">Last 24h</div>
        </div>
      </div>

      {/* Table card */}
      <div className="bg-white rounded-xl shadow-sm border border-surface-dim overflow-hidden">
        {/* Sub-tabs */}
        <div className="flex items-center gap-1 px-4 h-11 border-b border-surface-dim overflow-x-auto">
          {([
            ['All', 'All threads'],
            ['Unread', 'Unread'],
            ['Party-linked', 'Party-linked'],
            ['Mailboxes', 'Mailboxes'],
          ] as [Tab, string][]).map(([id, label]) => (
            <button
              key={id}
              className={`h-full px-3 text-label-md tab-underline ${tab === id ? 'active' : 'text-on-surface-variant'}`}
              onClick={() => { setTab(id); setSelected(new Set()); }}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Filter bar */}
        <div className="px-4 py-2 flex items-center gap-2 border-b border-surface-dim flex-wrap">
          <div className="relative flex items-center flex-1 max-w-sm min-w-[180px]">
            <span className="material-symbols-outlined absolute left-2 text-[15px] text-outline">search</span>
            <input
              className="w-full h-7 pl-7 pr-2 bg-surface-container-low border border-surface-dim rounded text-body-sm focus:outline-none focus:border-primary"
              placeholder="Search subjects, senders, party names…"
              value={query}
              onChange={e => setQuery(e.target.value)}
            />
          </div>
          <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1">
            <span className="material-symbols-outlined text-[14px]">filter_list</span>Filter
          </button>
          <span className="ml-auto text-[11px] text-on-surface-variant">
            {tab === 'Mailboxes' ? `${mailboxes.length} connected` : `${filteredThreads.length} of ${threads.length} threads`}
          </span>
        </div>

        {/* Bulk bar */}
        {selected.size > 0 && tab !== 'Mailboxes' && (
          <div className="bg-qb-blue text-white px-4 py-2 flex items-center gap-3 flex-wrap">
            <span className="text-[12px] font-semibold">{selected.size} selected</span>
            <span className="w-px h-4 bg-white/30" />
            <button className="text-[12px] font-semibold hover:bg-white/15 px-2 py-0.5 rounded" onClick={() => bulkAction('mark-read')}>Mark read</button>
            <button className="text-[12px] font-semibold hover:bg-white/15 px-2 py-0.5 rounded" onClick={() => bulkAction('link')}>Link to party</button>
            <button className="text-[12px] font-semibold hover:bg-white/15 px-2 py-0.5 rounded" onClick={() => bulkAction('archive')}>Archive</button>
            <button className="ml-auto text-[12px] font-semibold hover:bg-white/15 px-2 py-0.5 rounded" onClick={() => bulkAction('close')}>
              <span className="material-symbols-outlined text-[16px]">close</span>
            </button>
          </div>
        )}

        {/* Content */}
        {tab === 'Mailboxes' ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-body-sm">
              <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider">
                <tr>
                  <th className="px-3 py-2">Mailbox</th>
                  <th className="px-3 py-2">Address</th>
                  <th className="px-3 py-2 text-right">Threads</th>
                  <th className="px-3 py-2">Last sync</th>
                  <th className="px-3 py-2">Status</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-dim">
                {mailboxes.map(m => (
                  <tr key={m.id} className="hover:bg-surface-container-low cursor-pointer">
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded bg-qb-blue text-white flex items-center justify-center text-[10px] font-bold">
                          {m.provider === 'gmail' ? 'G' : m.provider === 'outlook' ? 'O' : 'S'}
                        </div>
                        <div>
                          <div className="font-medium">{m.display}</div>
                          {m.isDefault && <div className="text-[10px] text-secondary font-semibold">DEFAULT</div>}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-on-surface-variant font-mono text-[11px]">{m.email}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{m.threads}</td>
                    <td className="px-3 py-2 text-on-surface-variant">{m.lastSync}</td>
                    <td className="px-3 py-2"><span className={statClass('success')}>{m.status}</span></td>
                    <td className="px-2 py-2 text-right">
                      <button
                        className="w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center"
                        onClick={e => { e.stopPropagation(); setMailboxMenuForId(mailboxMenuForId === m.id ? null : m.id); }}
                      >
                        <span className="material-symbols-outlined text-[16px] text-on-surface-variant">more_horiz</span>
                      </button>
                      {mailboxMenuForId === m.id && (
                        <>
                          <div className="fixed inset-0 z-30" onClick={() => setMailboxMenuForId(null)} />
                          <div className="row-menu open absolute right-0 mt-1 z-40" style={{ minWidth: 250 }}>
                            <div className="menu-header">This mailbox</div>
                            <button onClick={() => handleMailboxAction('edit', m)}><span className="material-symbols-outlined">edit</span>Edit settings</button>
                            <button onClick={() => handleMailboxAction('sync', m)}><span className="material-symbols-outlined">sync</span>Sync now</button>
                            <button onClick={() => handleMailboxAction('test', m)}><span className="material-symbols-outlined">send</span>Send test email</button>
                            <div className="sep" />
                            <button onClick={() => handleMailboxAction('default', m)}><span className="material-symbols-outlined">star</span>Make default</button>
                            <div className="sep" />
                            <button className="danger" onClick={() => handleMailboxAction('disconnect', m)}><span className="material-symbols-outlined">link_off</span>Disconnect</button>
                          </div>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : filteredThreads.length === 0 ? (
          <div className="p-12 text-center text-on-surface-variant">
            <span className="material-symbols-outlined text-[40px] mb-2 block">mail</span>
            <div className="font-medium mb-1">No threads match</div>
            <div className="text-[12px]">Try clearing the filter or connecting another mailbox.</div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-body-sm">
              <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider">
                <tr>
                  <th className="w-8 px-3 py-2">
                    <input
                      type="checkbox"
                      className="row-check"
                      checked={filteredThreads.length > 0 && filteredThreads.every(t => selected.has(t.id))}
                      onChange={e => checkAllThreads(e.target.checked)}
                    />
                  </th>
                  <th className="px-3 py-2">Subject</th>
                  <th className="px-3 py-2">Party</th>
                  <th className="px-3 py-2">Mailbox</th>
                  <th className="px-3 py-2">Direction</th>
                  <th className="px-3 py-2 text-right">Last activity</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-dim">
                {filteredThreads.map(t => {
                  const mb = mailboxes.find(m => m.id === t.mailbox);
                  return (
                    <tr
                      key={t.id}
                      className="hover:bg-surface-container-low cursor-pointer"
                      onClick={() => openThread(t.id)}
                    >
                      <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          className="row-check"
                          checked={selected.has(t.id)}
                          onChange={() => toggleThreadSelected(t.id)}
                        />
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-start gap-2">
                          <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${t.unread ? 'bg-qb-blue' : 'bg-transparent'}`} />
                          <div className="min-w-0">
                            <div className={`font-medium truncate ${t.unread ? 'text-on-surface' : 'text-on-surface-variant'}`}>{t.subject}</div>
                            <div className="text-[11px] text-on-surface-variant truncate">{t.snippet}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        {t.party ? <div className="text-body-sm">{t.party}</div> : <span className={statClass('warn')}>Unlinked</span>}
                      </td>
                      <td className="px-3 py-2 text-on-surface-variant text-[12px]">{mb?.display ?? '—'}</td>
                      <td className="px-3 py-2">
                        <span className={statClass(t.direction === 'inbound' ? 'info' : 'neutral')}>{t.direction}</span>
                      </td>
                      <td className="px-3 py-2 text-right text-on-surface-variant text-[12px]">{t.last}</td>
                      <td className="px-2 py-2 text-right" onClick={e => e.stopPropagation()}>
                        <button
                          className="w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center"
                          onClick={e => { e.stopPropagation(); setRowMenuForId(rowMenuForId === t.id ? null : t.id); }}
                        >
                          <span className="material-symbols-outlined text-[16px] text-on-surface-variant">more_horiz</span>
                        </button>
                        {rowMenuForId === t.id && (
                          <>
                            <div className="fixed inset-0 z-30" onClick={() => setRowMenuForId(null)} />
                            <div className="row-menu open absolute right-0 mt-1 z-40" style={{ minWidth: 250 }}>
                              {ROW_MENU_ITEMS.map((item, i) => {
                                if ('sep' in item) return <div key={i} className="sep" />;
                                if ('header' in item) return <div key={i} className="menu-header">{item.header}</div>;
                                return (
                                  <button
                                    key={i}
                                    className={item.danger ? 'danger' : ''}
                                    onClick={() => handleThreadAction(item.action, t)}
                                  >
                                    <span className="material-symbols-outlined">{item.icon}</span>
                                    {item.label}
                                  </button>
                                );
                              })}
                            </div>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ════ CONNECT MAILBOX DRAWER ════ */}
      {connectDrawerOpen && (
        <>
          <div className="drawer-scrim open" onClick={() => setConnectDrawerOpen(false)} />
          <div className="drawer open" role="dialog" aria-label="Connect mailbox">
            <div className="flex items-center justify-between px-5 h-14 border-b border-surface-dim shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="material-symbols-outlined text-[20px] text-primary">mail</span>
                <div className="min-w-0">
                  <div className="text-headline-sm truncate">
                    Connect {provider.charAt(0).toUpperCase() + provider.slice(1)} mailbox
                  </div>
                  <div className="text-[11px] text-on-surface-variant">Writes to platform_mailboxes · uses platform_send_email RPC</div>
                </div>
              </div>
              <button
                className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center"
                onClick={() => setConnectDrawerOpen(false)}
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div>
                <div className="section-h">Provider</div>
                <div className="grid grid-cols-3 gap-2">
                  {(['gmail', 'outlook', 'smtp'] as const).map(p => (
                    <button
                      key={p}
                      className={`border rounded-lg p-3 text-left ${provider === p ? 'border-qb-blue bg-qb-blue/5' : 'border-surface-dim hover:bg-surface-container-low'}`}
                      onClick={() => setProvider(p)}
                    >
                      <div className={`text-body-sm font-semibold ${provider === p ? 'text-qb-blue' : ''}`}>
                        {p === 'gmail' ? 'Gmail' : p === 'outlook' ? 'Outlook' : 'SMTP / IMAP'}
                      </div>
                      <div className="text-[11px] text-on-surface-variant">
                        {p === 'gmail' ? 'Google Workspace' : p === 'outlook' ? 'Microsoft 365' : 'Custom server'}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div className="section-h">Identity</div>
                <div className="space-y-3">
                  <div>
                    <label className="field-label">Display name</label>
                    <input className="field-input" placeholder="e.g. Sales team" value={fDisplay} onChange={e => setFDisplay(e.target.value)} />
                  </div>
                  <div>
                    <label className="field-label">Email address</label>
                    <input className="field-input" type="email" placeholder="sales@yourcompany.com" value={fEmail} onChange={e => setFEmail(e.target.value)} />
                  </div>
                  <div>
                    <label className="field-label">Reply-to (optional)</label>
                    <input className="field-input" type="email" placeholder="falls back to primary" value={fReplyTo} onChange={e => setFReplyTo(e.target.value)} />
                  </div>
                </div>
              </div>
              <div>
                <div className="section-h">Sending</div>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-body-sm cursor-pointer">
                    <input type="checkbox" className="row-check" checked={fDefaultSender} onChange={e => setFDefaultSender(e.target.checked)} />
                    Use as default sender
                  </label>
                  <label className="flex items-center gap-2 text-body-sm cursor-pointer">
                    <input type="checkbox" className="row-check" checked={fTrack} onChange={e => setFTrack(e.target.checked)} />
                    Track opens and clicks
                  </label>
                  <label className="flex items-center gap-2 text-body-sm cursor-pointer">
                    <input type="checkbox" className="row-check" checked={fAutoLink} onChange={e => setFAutoLink(e.target.checked)} />
                    Auto-link incoming mail to party by email match
                  </label>
                </div>
              </div>
              <div>
                <div className="section-h">Signature</div>
                <textarea
                  className="field-input"
                  style={{ height: 80, padding: '8px 10px', fontFamily: 'inherit' }}
                  placeholder="Appended to every outbound email"
                  value={fSignature}
                  onChange={e => setFSignature(e.target.value)}
                />
              </div>
            </div>
            <div className="h-14 border-t border-surface-dim px-4 flex items-center justify-between shrink-0">
              <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={() => setConnectDrawerOpen(false)}>Cancel</button>
              <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container flex items-center gap-1" onClick={saveMailbox}>
                <span className="material-symbols-outlined text-[16px]">check</span>Connect mailbox
              </button>
            </div>
          </div>
        </>
      )}

      {/* ════ COMPOSE MODAL ════ */}
      {composeOpen && (
        <div className="fixed inset-0 bg-black/40 z-110 flex items-center justify-center p-6" onClick={() => setComposeOpen(false)}>
          <div className="w-full max-w-2xl bg-white rounded-xl shadow-2xl overflow-hidden flex flex-col" style={{ maxHeight: '85vh' }} onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between px-5 h-14 border-b border-surface-dim">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[20px] text-primary">edit</span>
                <h2 className="text-headline-sm">New message</h2>
              </div>
              <button className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center" onClick={() => setComposeOpen(false)}>
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              <div>
                <label className="field-label">From</label>
                <select className="field-input" value={composeFrom} onChange={e => setComposeFrom(e.target.value)}>
                  <option>sales@yourcompany.com</option>
                  <option>support@yourcompany.com</option>
                </select>
              </div>
              <div>
                <label className="field-label">To</label>
                <input className="field-input" placeholder="name@company.com, party@company.com" value={composeTo} onChange={e => setComposeTo(e.target.value)} />
              </div>
              <div>
                <label className="field-label">Subject</label>
                <input className="field-input" placeholder="Subject line" value={composeSubject} onChange={e => setComposeSubject(e.target.value)} />
              </div>
              <div>
                <label className="field-label">Body</label>
                <textarea className="field-input" style={{ height: 200, padding: 10, fontFamily: 'inherit' }} placeholder="Write your message…" value={composeBody} onChange={e => setComposeBody(e.target.value)} />
              </div>
              <div className="flex items-center gap-2 text-[12px] text-on-surface-variant">
                <input type="checkbox" className="row-check" checked={composeLink} onChange={e => setComposeLink(e.target.checked)} />
                <span>Link to party timeline (uses <code className="font-mono">email_enqueue</code> with related_type/related_id)</span>
              </div>
            </div>
            <div className="h-14 border-t border-surface-dim px-5 flex items-center justify-between">
              <button className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low" onClick={() => setComposeOpen(false)}>Cancel</button>
              <div className="flex items-center gap-2">
                <button className="h-8 px-3 border border-surface-dim rounded text-body-md font-semibold hover:bg-surface-container-low" onClick={() => { onToast('Draft saved'); setComposeOpen(false); }}>Save draft</button>
                <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container flex items-center gap-1" onClick={sendEmail}>
                  <span className="material-symbols-outlined text-[16px]">send</span>Send
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
