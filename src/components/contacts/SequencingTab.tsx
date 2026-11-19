'use client';
/**
 * SequencingTab — combines three sources verbatim:
 *   1. /upload/crm sequences.html         — sequences list + builder drawer + enrollments list
 *   2. /upload/crm route& sequencing.html  — route builder (stops + map + summary)
 *   3. /upload/crm party profile view showing routes and sequences.html
 *                                             — the "Enrolled sequences" sidebar section.
 *
 * The tab is rendered inside PartyProfile. The `partyId` + `partyName` props
 * scope the enrolled-sequences view: rows where this party is currently
 * enrolled show up first, with progress + next-step + status.
 *
 * Layout:
 *   - KPI strip (4 cards: active / enrolled / completed / reply rate)
 *   - Sub-tabs: Sequences · Enrollments · Route · This party
 *   - Workbench (search + filter + bulk bar + content host)
 *   - Builder drawer (slides in when "New sequence" or a row is clicked)
 *   - Add-stop drawer (slides in when "Add stop" is clicked on Route sub-tab)
 */
import { useMemo, useState } from 'react';

interface SequencingTabProps {
  partyId: string;
  partyName?: string;
  onToast: (m: string) => void;
}

type SubTab = 'Sequences' | 'Enrollments' | 'Route' | 'Party';

/* ────────────────────────────────────────────────────────────────── *
 *  TYPES — mirror the HTML `state` objects verbatim.
 * ────────────────────────────────────────────────────────────────── */
type StepKind = 'email' | 'wait' | 'task' | 'branch';

interface Step { kind: StepKind; title: string; sub: string; }
interface Sequence {
  id: string;
  name: string;
  desc: string;
  status: 'active' | 'paused' | 'draft';
  trigger: string;
  steps: Step[];
  enrolled: number;
  completed: number;
  replyRate: string;
}
interface Enrollment {
  id: string;
  sequenceId: string;
  sequenceName: string;
  partyId: string;
  partyName: string;
  step: number;
  totalSteps: number;
  nextAt: string;
  status: 'active' | 'completed' | 'paused';
}
interface Stop {
  id: string;
  partyId: string;
  name: string;
  address: string;
  city: string;
  time: string;
  type: 'customer' | 'lead' | 'supplier';
  purpose: string;
  status: 'pending' | 'arrived';
  late: boolean;
  x: number;
  y: number;
}
interface Candidate {
  partyId: string;
  name: string;
  address: string;
  type: 'customer' | 'lead' | 'supplier';
}

/* ────────────────────────────────────────────────────────────────── *
 *  DEMO DATA — same values the HTML ships, scoped by partyId when
 *  relevant. Production: hydrate from /api/crm/sequences,
 *  /api/crm/sequences/enrollments, /api/crm/routes?date=today.
 * ────────────────────────────────────────────────────────────────── */
const SEQUENCES: Sequence[] = [
  {
    id: 'seq-1',
    name: 'New lead welcome',
    desc: 'Triggered when a party is created with role = Lead',
    status: 'active',
    trigger: 'Party created (role=Lead)',
    steps: [
      { kind: 'email', title: 'Welcome email', sub: 'Template: Welcome' },
      { kind: 'wait', title: 'Wait 2 days', sub: 'Until next step is due' },
      { kind: 'email', title: 'Follow-up #1', sub: 'Template: Value prop' },
      { kind: 'wait', title: 'Wait 3 days', sub: '' },
      { kind: 'email', title: 'Follow-up #2', sub: 'Template: Book a demo' },
    ],
    enrolled: 42,
    completed: 28,
    replyRate: '21.4%',
  },
  {
    id: 'seq-2',
    name: 'Post-appointment follow-up',
    desc: 'Triggered 1 day after an appointment completes',
    status: 'active',
    trigger: 'Appointment completed',
    steps: [
      { kind: 'wait', title: 'Wait 1 day', sub: '' },
      { kind: 'email', title: 'Thank you', sub: 'Template: Thanks after visit' },
      { kind: 'task', title: 'Review call recording', sub: 'Assigned to: sales-team' },
    ],
    enrolled: 18,
    completed: 14,
    replyRate: '32.1%',
  },
  {
    id: 'seq-3',
    name: 'Q4 reengagement',
    desc: 'Dormant customers — no activity 30d',
    status: 'draft',
    trigger: 'No activity 30d + status = inactive',
    steps: [
      { kind: 'email', title: 'We miss you', sub: 'Template: Reengage' },
      { kind: 'wait', title: 'Wait 5 days', sub: '' },
      { kind: 'email', title: 'Special offer', sub: 'Template: Offer 20%' },
    ],
    enrolled: 0,
    completed: 0,
    replyRate: '—',
  },
  {
    id: 'seq-4',
    name: 'Supplier onboarding',
    desc: 'Triggered when role = Supplier added',
    status: 'paused',
    trigger: 'Party role = Supplier added',
    steps: [
      { kind: 'email', title: 'Welcome supplier', sub: 'Template: Supplier welcome' },
      { kind: 'wait', title: 'Wait 3 days', sub: '' },
      { kind: 'task', title: 'Collect W-9 + bank info', sub: 'Assigned to: ops' },
    ],
    enrolled: 6,
    completed: 2,
    replyRate: '16.6%',
  },
];

const ENROLLMENTS: Enrollment[] = [
  { id: 'enr-1', sequenceId: 'seq-1', sequenceName: 'New lead welcome',           partyId: 'p-1039', partyName: 'Alder & Co.',         step: 2, totalSteps: 5, nextAt: 'tomorrow 9:00 AM', status: 'active' },
  { id: 'enr-2', sequenceId: 'seq-1', sequenceName: 'New lead welcome',           partyId: 'p-1041', partyName: 'Crescent Foods',     step: 1, totalSteps: 5, nextAt: 'in 2 hours',       status: 'active' },
  { id: 'enr-3', sequenceId: 'seq-2', sequenceName: 'Post-appointment follow-up',  partyId: 'p-1045', partyName: 'Northwind Labs',     step: 3, totalSteps: 3, nextAt: 'completed',         status: 'completed' },
  { id: 'enr-4', sequenceId: 'seq-4', sequenceName: 'Supplier onboarding',         partyId: 'p-1038', partyName: 'Toner & Ink Depot', step: 2, totalSteps: 3, nextAt: 'paused',            status: 'paused' },
];

const INITIAL_STOPS: Stop[] = [
  { id: 's1', partyId: 'p-1047', name: 'Acme Corp',       address: '22 Park Ave, Charlotte, NC',    city: 'Charlotte', time: '9:00 AM',  type: 'customer', purpose: 'Q4 contract review',  status: 'pending', late: false, x: 22, y: 28 },
  { id: 's2', partyId: 'p-1046', name: 'Blue Ridge Co.',  address: '500 River Rd, Charlotte, NC',   city: 'Charlotte', time: '10:15 AM', type: 'customer', purpose: 'Wholesale pickup',      status: 'pending', late: false, x: 44, y: 52 },
  { id: 's3', partyId: 'p-1045', name: 'Northwind Labs',  address: '801 Industrial Way, Charlotte', city: 'Charlotte', time: '11:30 AM', type: 'lead',     purpose: 'Demo — new equipment',  status: 'pending', late: true,  x: 62, y: 34 },
  { id: 's4', partyId: 'p-1044', name: 'Orion Apparel',   address: '310 Trade St, Charlotte, NC',   city: 'Charlotte', time: '1:15 PM',  type: 'customer', purpose: 'Contract signing',      status: 'pending', late: false, x: 38, y: 68 },
  { id: 's5', partyId: 'p-1043', name: 'Maple Supply',    address: '1409 Elm St, Charlotte, NC',    city: 'Charlotte', time: '2:45 PM',  type: 'customer', purpose: 'Site survey',           status: 'pending', late: false, x: 76, y: 58 },
  { id: 's6', partyId: 'p-1042', name: 'Lakeside Design', address: '2100 Lake Dr, Charlotte, NC',   city: 'Charlotte', time: '3:30 PM',  type: 'customer', purpose: 'Q4 follow-up',          status: 'pending', late: false, x: 58, y: 78 },
];

const CANDIDATES: Candidate[] = [
  { partyId: 'p-1041', name: 'Crescent Foods',     address: '120 S Tryon St, Charlotte',   type: 'customer' },
  { partyId: 'p-1040', name: 'Beacon Hardware',    address: '75 N College St, Charlotte',  type: 'customer' },
  { partyId: 'p-1039', name: 'Alder & Co.',        address: '412 E 7th St, Charlotte',      type: 'lead' },
];

const STEP_ICONS: Record<StepKind, string> = {
  email: 'mail',
  wait: 'hourglass_empty',
  task: 'task_alt',
  branch: 'call_split',
};

/* ── small helpers (mirror the HTML's stat classes) ── */
function statClass(kind: 'success' | 'warn' | 'error' | 'info' | 'neutral'): string {
  return `stat ${kind}`;
}
function seqStatusClass(status: Sequence['status']): 'success' | 'warn' | 'neutral' {
  return status === 'active' ? 'success' : status === 'paused' ? 'warn' : 'neutral';
}
function enrStatusClass(status: Enrollment['status']): 'info' | 'success' | 'warn' | 'neutral' {
  return status === 'active' ? 'info' : status === 'completed' ? 'success' : status === 'paused' ? 'warn' : 'neutral';
}
function stopTypeClass(type: Stop['type']): 'success' | 'warn' | 'neutral' {
  return type === 'customer' ? 'success' : type === 'lead' ? 'warn' : 'neutral';
}

/* ═════════════════════════════════════════════════════════════════ *
 *  MAIN COMPONENT
 * ═════════════════════════════════════════════════════════════════ */
export default function SequencingTab({ partyId, partyName, onToast }: SequencingTabProps) {
  const [subTab, setSubTab] = useState<SubTab>('Sequences');

  // Sequences state (mutable: status changes, duplicates, archive)
  const [sequences, setSequences] = useState<Sequence[]>(SEQUENCES);
  const [enrollments, setEnrollments] = useState<Enrollment[]>(ENROLLMENTS);
  const [seqQuery, setSeqQuery] = useState('');
  const [seqSelected, setSeqSelected] = useState<Set<string>>(new Set());

  // Route state
  const [stops, setStops] = useState<Stop[]>(INITIAL_STOPS);
  const [routeQuery, setRouteQuery] = useState('');
  const [routeType, setRouteType] = useState('');
  const [stopSelected, setStopSelected] = useState<Set<string>>(new Set());
  const [rowMenuForStopId, setRowMenuForStopId] = useState<string | null>(null);

  // Builder drawer state
  const [builderOpen, setBuilderOpen] = useState(false);
  const [builderSeq, setBuilderSeq] = useState<Sequence | null>(null);

  // Add-stop drawer state
  const [addStopOpen, setAddStopOpen] = useState(false);
  const [candidateQuery, setCandidateQuery] = useState('');

  /* ── KPIs ── */
  const activeCount = sequences.filter(s => s.status === 'active').length;
  const enrolledActive = enrollments.filter(e => e.status === 'active').length + 56; // demo: +56 in-flight elsewhere
  const completed30d = 96;
  const replyRate30d = '18.4%';

  /* ── filtered sequences ── */
  const filteredSeqs = useMemo(() => {
    const q = seqQuery.toLowerCase();
    if (!q) return sequences;
    return sequences.filter(s => `${s.name} ${s.desc}`.toLowerCase().includes(q));
  }, [sequences, seqQuery]);

  /* ── filtered enrollments ── */
  const filteredEnrs = useMemo(() => {
    const q = seqQuery.toLowerCase();
    if (!q) return enrollments;
    return enrollments.filter(e => `${e.partyName} ${e.sequenceName}`.toLowerCase().includes(q));
  }, [enrollments, seqQuery]);

  /* ── filtered stops ── */
  const filteredStops = useMemo(() => {
    return stops.filter(s => {
      if (routeType && s.type !== routeType) return false;
      if (routeQuery) {
        const hay = `${s.name} ${s.address} ${s.purpose}`.toLowerCase();
        if (!hay.includes(routeQuery.toLowerCase())) return false;
      }
      return true;
    });
  }, [stops, routeQuery, routeType]);

  /* ── this party's enrollments ── */
  const partyEnrollments = useMemo(
    () => enrollments.filter(e => e.partyId === partyId),
    [enrollments, partyId],
  );

  /* ── bulk bar ── */
  const sel = subTab === 'Route' ? stopSelected : seqSelected;
  function updateBulk() {
    // no-op — re-render reads sel.size
  }
  function clearSelection() {
    if (subTab === 'Route') setStopSelected(new Set());
    else setSeqSelected(new Set());
    updateBulk();
  }

  /* ── sequence actions ── */
  function toggleSeqSelected(id: string) {
    setSeqSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleStopSelected(id: string) {
    setStopSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function checkAllSeqs(check: boolean) {
    if (check) setSeqSelected(new Set(filteredSeqs.map(s => s.id)));
    else setSeqSelected(new Set());
  }
  function checkAllStops(check: boolean) {
    if (check) setStopSelected(new Set(filteredStops.map(s => s.id)));
    else setStopSelected(new Set());
  }

  function bulkAction(act: string) {
    if (act === 'close') { clearSelection(); return; }
    if (subTab === 'Sequences') {
      if (act === 'archive') setSequences(s => s.filter(x => !seqSelected.has(x.id)));
      if (act === 'activate') setSequences(s => s.map(x => seqSelected.has(x.id) ? { ...x, status: 'active' } : x));
      if (act === 'pause') setSequences(s => s.map(x => seqSelected.has(x.id) ? { ...x, status: 'paused' } : x));
      if (act === 'duplicate') {
        const copies = sequences.filter(s => seqSelected.has(s.id)).map(s => ({ ...s, id: `seq-${Date.now()}-${s.id}`, name: `${s.name} (copy)`, status: 'draft' as const }));
        setSequences(s => [...s, ...copies]);
      }
    } else if (subTab === 'Route') {
      if (act === 'remove') setStops(s => s.filter(x => !stopSelected.has(x.id)));
      // prioritize is a no-op visually
    }
    onToast(`${act} on ${sel.size} item${sel.size === 1 ? '' : 's'}`);
    clearSelection();
  }

  function openBuilder(seq: Sequence | null) {
    setBuilderSeq(seq ?? {
      id: `seq-${Date.now()}`,
      name: '',
      desc: '',
      status: 'draft',
      trigger: 'Party created (role=Lead)',
      steps: [],
      enrolled: 0,
      completed: 0,
      replyRate: '—',
    });
    setBuilderOpen(true);
  }

  function saveSequence(status: 'draft' | 'active') {
    if (!builderSeq) return;
    const name = builderSeq.name.trim();
    if (!name) { onToast('Name required'); return; }
    setSequences(prev => {
      const idx = prev.findIndex(s => s.id === builderSeq.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = { ...builderSeq, name, status };
        return copy;
      }
      return [...prev, { ...builderSeq, name, status }];
    });
    setBuilderOpen(false);
    onToast(status === 'active' ? 'Sequence activated' : 'Draft saved');
  }

  function addStep(kind: StepKind) {
    if (!builderSeq) return;
    const defaults: Record<StepKind, Step> = {
      email:  { kind: 'email',  title: 'Email step', sub: 'Template: choose' },
      wait:   { kind: 'wait',   title: 'Wait 1 day', sub: '' },
      task:   { kind: 'task',   title: 'Task step',  sub: 'Assigned to: sales-team' },
      branch: { kind: 'branch', title: 'Branch',     sub: 'If replied → exit, else → continue' },
    };
    setBuilderSeq(s => s ? { ...s, steps: [...s.steps, defaults[kind]] } : s);
  }

  function deleteStep(idx: number) {
    if (!builderSeq) return;
    setBuilderSeq(s => s ? { ...s, steps: s.steps.filter((_, i) => i !== idx) } : s);
  }

  function moveStep(from: number, to: number) {
    if (!builderSeq) return;
    if (from === to || to < 0 || to >= builderSeq.steps.length) return;
    setBuilderSeq(s => {
      if (!s) return s;
      const arr = [...s.steps];
      const [moved] = arr.splice(from, 1);
      arr.splice(to, 0, moved);
      return { ...s, steps: arr };
    });
  }

  /* ── stop actions ── */
  function moveStop(fromId: string, dir: 'up' | 'down') {
    setStops(prev => {
      const i = prev.findIndex(s => s.id === fromId);
      if (i < 0) return prev;
      const j = dir === 'up' ? i - 1 : i + 1;
      if (j < 0 || j >= prev.length) return prev;
      const copy = [...prev];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  }
  function markStopArrived(id: string) {
    setStops(prev => prev.map(s => s.id === id ? { ...s, status: 'arrived', late: false } : s));
    onToast(`Marked arrived`);
  }
  function removeStop(id: string) {
    setStops(prev => prev.filter(s => s.id !== id));
    onToast('Removed from route');
  }
  function optimizeRoute() {
    onToast('Re-optimizing for drive time…');
    setTimeout(() => {
      setStops(prev => [...prev].sort((a, b) => a.time.localeCompare(b.time)));
      onToast('Route optimized — drive time saved');
    }, 600);
  }
  function addStopFromCandidate(c: Candidate) {
    setStops(prev => [...prev, {
      id: `s${prev.length + 1}`,
      partyId: c.partyId,
      name: c.name,
      address: c.address,
      city: 'Charlotte',
      time: 'TBD',
      type: c.type,
      purpose: 'Added manually',
      status: 'pending',
      late: false,
      x: 30 + Math.random() * 50,
      y: 30 + Math.random() * 50,
    }]);
    setAddStopOpen(false);
    onToast(`${c.name} added to route`);
  }

  /* ── totals ── */
  const lateCount = stops.filter(s => s.late).length;
  const driveMinutes = 102;

  /* ═════════════════════════════════════════════════════════════════
   *  RENDER
   * ═════════════════════════════════════════════════════════════════ */
  return (
    <div>
      {/* KPI strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mb-4">
        <div className="bg-white border border-surface-dim rounded-xl p-3">
          <div className="text-[10px] uppercase tracking-wider font-bold text-on-surface-variant">Active sequences</div>
          <div className="text-headline-md mt-1 tabular-nums">{activeCount}</div>
          <div className="text-[11px] text-on-surface-variant mt-0.5">Running right now</div>
        </div>
        <div className="bg-white border border-surface-dim rounded-xl p-3">
          <div className="text-[10px] uppercase tracking-wider font-bold text-on-surface-variant">Enrolled parties</div>
          <div className="text-headline-md mt-1 tabular-nums text-qb-blue">{enrolledActive}</div>
          <div className="text-[11px] text-on-surface-variant mt-0.5">In-flight</div>
        </div>
        <div className="bg-white border border-surface-dim rounded-xl p-3">
          <div className="text-[10px] uppercase tracking-wider font-bold text-on-surface-variant">Completed (30d)</div>
          <div className="text-headline-md mt-1 tabular-nums text-secondary">{completed30d}</div>
          <div className="text-[11px] text-on-surface-variant mt-0.5">Finished flow</div>
        </div>
        <div className="bg-white border border-surface-dim rounded-xl p-3">
          <div className="text-[10px] uppercase tracking-wider font-bold text-on-surface-variant">Reply rate (30d)</div>
          <div className="text-headline-md mt-1 tabular-nums">{replyRate30d}</div>
          <div className="text-[11px] text-on-surface-variant mt-0.5">Sequenced emails with reply</div>
        </div>
      </div>

      {/* Sub-tabs */}
      <div className="flex items-center gap-1 border-b border-surface-dim mb-0 overflow-x-auto">
        {(['Sequences', 'Enrollments', 'Route', 'Party'] as SubTab[]).map(t => (
          <button
            key={t}
            className={`tab-underline px-4 py-2.5 text-label-md ${subTab === t ? 'active' : 'text-on-surface-variant'}`}
            onClick={() => { setSubTab(t); clearSelection(); }}
          >
            {t === 'Sequences' && <span className="material-symbols-outlined text-[15px] align-middle mr-1">alt_route</span>}
            {t === 'Enrollments' && <span className="material-symbols-outlined text-[15px] align-middle mr-1">group</span>}
            {t === 'Route' && <span className="material-symbols-outlined text-[15px] align-middle mr-1">route</span>}
            {t === 'Party' && <span className="material-symbols-outlined text-[15px] align-middle mr-1">person</span>}
            {t === 'Party' ? 'This party' : t}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2 pb-1">
          {subTab !== 'Party' && (
            <>
              <button
                className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1"
                onClick={() => onToast('Exported')}
              >
                <span className="material-symbols-outlined text-[16px]">download</span>Export
              </button>
              {subTab === 'Sequences' && (
                <button
                  className="h-8 px-3 bg-primary text-white text-body-md font-semibold hover:bg-primary-container flex items-center gap-1"
                  onClick={() => openBuilder(null)}
                >
                  <span className="material-symbols-outlined text-[16px]">add</span>New sequence
                </button>
              )}
              {subTab === 'Route' && (
                <>
                  <button
                    className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low flex items-center gap-1"
                    onClick={() => onToast('Starting navigation')}
                  >
                    <span className="material-symbols-outlined text-[16px]">navigation</span>Start navigation
                  </button>
                  <button
                    className="h-8 px-3 bg-primary text-white text-body-md font-semibold hover:bg-primary-container flex items-center gap-1"
                    onClick={optimizeRoute}
                  >
                    <span className="material-symbols-outlined text-[16px]">auto_fix_high</span>Optimize route
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* ════ CONTENT ════ */}
      {subTab === 'Party' ? (
        <PartyEnrollmentsView
          partyId={partyId}
          partyName={partyName}
          enrollments={partyEnrollments}
          onToast={onToast}
          onOpenBuilder={(seqId) => {
            const s = sequences.find(x => x.id === seqId);
            if (s) openBuilder(s);
          }}
        />
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-surface-dim overflow-hidden mt-4">
          {/* filter bar */}
          <div className="px-4 py-2 flex items-center gap-2 border-b border-surface-dim flex-wrap">
            <div className="relative flex items-center flex-1 max-w-sm min-w-[180px]">
              <span className="material-symbols-outlined absolute left-2 text-[15px] text-outline">search</span>
              <input
                className="w-full h-7 pl-7 pr-2 bg-surface-container-low border border-surface-dim rounded text-body-sm focus:outline-none focus:border-primary"
                placeholder={subTab === 'Route' ? 'Search parties, addresses…' : 'Search sequences, parties…'}
                value={subTab === 'Route' ? routeQuery : seqQuery}
                onChange={e => subTab === 'Route' ? setRouteQuery(e.target.value) : setSeqQuery(e.target.value)}
              />
            </div>
            {subTab === 'Route' && (
              <label className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1 bg-white">
                <span className="material-symbols-outlined text-[14px] text-on-surface-variant">filter_alt</span>
                <select
                  className="bg-transparent border-none text-label-sm text-on-surface focus:outline-none"
                  value={routeType}
                  onChange={e => setRouteType(e.target.value)}
                >
                  <option value="">All types</option>
                  <option value="customer">Customer</option>
                  <option value="lead">Lead</option>
                  <option value="supplier">Supplier</option>
                </select>
              </label>
            )}
            {subTab !== 'Route' && (
              <button className="h-7 px-2 border border-surface-dim rounded text-label-sm hover:bg-surface-container-low flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">filter_list</span>Filter
              </button>
            )}
            <span className="ml-auto text-[11px] text-on-surface-variant">
              {subTab === 'Route'
                ? `${filteredStops.length} of ${stops.length} shown`
                : subTab === 'Enrollments'
                  ? `${filteredEnrs.length} of ${enrollments.length}`
                  : `${filteredSeqs.length} of ${sequences.length}`}
            </span>
            {subTab === 'Route' && (
              <button
                className="h-7 px-2 border border-surface-dim rounded text-label-sm font-semibold hover:bg-surface-container-low flex items-center gap-1"
                onClick={() => setAddStopOpen(true)}
              >
                <span className="material-symbols-outlined text-[14px]">add</span>Add stop
              </button>
            )}
          </div>

          {/* bulk bar */}
          {sel.size > 0 && (
            <div className="bg-qb-blue text-white px-4 py-2 flex items-center gap-3 flex-wrap">
              <span className="text-[12px] font-semibold">{sel.size} selected</span>
              <span className="w-px h-4 bg-white/30" />
              {subTab === 'Sequences' && (
                <>
                  <button className="text-[12px] font-semibold hover:bg-white/15 px-2 py-0.5 rounded" onClick={() => bulkAction('activate')}>Activate</button>
                  <button className="text-[12px] font-semibold hover:bg-white/15 px-2 py-0.5 rounded" onClick={() => bulkAction('pause')}>Pause</button>
                  <button className="text-[12px] font-semibold hover:bg-white/15 px-2 py-0.5 rounded" onClick={() => bulkAction('duplicate')}>Duplicate</button>
                  <span className="w-px h-4 bg-white/30" />
                  <button className="text-[12px] font-semibold hover:bg-white/15 px-2 py-0.5 rounded" onClick={() => bulkAction('archive')}>Archive</button>
                </>
              )}
              {subTab === 'Route' && (
                <>
                  <button className="text-[12px] font-semibold hover:bg-white/15 px-2 py-0.5 rounded" onClick={() => bulkAction('remove')}>Remove</button>
                  <button className="text-[12px] font-semibold hover:bg-white/15 px-2 py-0.5 rounded" onClick={() => bulkAction('prioritize')}>Prioritize</button>
                </>
              )}
              <button className="ml-auto text-[12px] font-semibold hover:bg-white/15 px-2 py-0.5 rounded" onClick={() => bulkAction('close')}>
                <span className="material-symbols-outlined text-[16px]">close</span>
              </button>
            </div>
          )}

          {/* content */}
          {subTab === 'Sequences' && (
            <SequencesList
              sequences={filteredSeqs}
              selected={seqSelected}
              allChecked={filteredSeqs.length > 0 && filteredSeqs.every(s => seqSelected.has(s.id))}
              onCheckAll={checkAllSeqs}
              onToggle={toggleSeqSelected}
              onRowClick={(id) => {
                const s = sequences.find(x => x.id === id);
                if (s) openBuilder(s);
              }}
              onToast={onToast}
            />
          )}
          {subTab === 'Enrollments' && (
            <EnrollmentsList enrollments={filteredEnrs} onToast={onToast} />
          )}
          {subTab === 'Route' && (
            <RouteBuilder
              stops={filteredStops}
              allStops={stops}
              lateCount={lateCount}
              driveMinutes={driveMinutes}
              selected={stopSelected}
              allChecked={filteredStops.length > 0 && filteredStops.every(s => stopSelected.has(s.id))}
              onCheckAll={checkAllStops}
              onToggle={toggleStopSelected}
              rowMenuForId={rowMenuForStopId}
              onOpenRowMenu={(id) => setRowMenuForStopId(rowMenuForStopId === id ? null : id)}
              onCloseRowMenu={() => setRowMenuForStopId(null)}
              onMoveStop={moveStop}
              onMarkArrived={markStopArrived}
              onRemoveStop={removeStop}
              onOptimize={optimizeRoute}
              onToast={onToast}
            />
          )}
        </div>
      )}

      {/* ════ BUILDER DRAWER ════ */}
      {builderOpen && builderSeq && (
        <>
          <div className="drawer-scrim open" onClick={() => setBuilderOpen(false)} />
          <div className="drawer open" role="dialog" aria-label="Sequence builder" style={{ width: 720, maxWidth: '96vw' }}>
            <div className="flex items-center justify-between px-5 h-14 border-b border-surface-dim shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="material-symbols-outlined text-[20px] text-primary">alt_route</span>
                <div className="min-w-0">
                  <div className="text-headline-sm truncate">{builderSeq.name || 'New sequence'}</div>
                  <div className="text-[11px] text-on-surface-variant">{builderSeq.desc || 'Trigger → steps → exit'}</div>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <button
                  className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center"
                  title="Preview"
                  onClick={() => onToast('Preview')}
                >
                  <span className="material-symbols-outlined text-[18px] text-on-surface-variant">visibility</span>
                </button>
                <button
                  className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center"
                  onClick={() => setBuilderOpen(false)}
                  aria-label="Close"
                >
                  <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {/* Metadata */}
              <div>
                <div className="section-h">Sequence</div>
                <div className="space-y-3">
                  <div>
                    <label className="field-label">Name</label>
                    <input
                      className="field-input"
                      placeholder="e.g. New lead welcome"
                      value={builderSeq.name}
                      onChange={e => setBuilderSeq(s => s ? { ...s, name: e.target.value } : s)}
                    />
                  </div>
                  <div>
                    <label className="field-label">Description</label>
                    <textarea
                      className="field-input"
                      style={{ height: 56, padding: '8px 10px', fontFamily: 'inherit' }}
                      placeholder="Internal description"
                      value={builderSeq.desc}
                      onChange={e => setBuilderSeq(s => s ? { ...s, desc: e.target.value } : s)}
                    />
                  </div>
                </div>
              </div>

              {/* Trigger */}
              <div>
                <div className="section-h">Trigger</div>
                <div className="border border-surface-dim rounded-lg p-3 flex items-center gap-3 bg-surface-container-lowest">
                  <div style={{ width: 32, height: 32, borderRadius: 6, background: '#0077c5', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span className="material-symbols-outlined text-[18px]">bolt</span>
                  </div>
                  <div className="flex-1">
                    <div className="text-body-sm font-semibold">{builderSeq.trigger}</div>
                    <div className="text-[11px] text-on-surface-variant">Fires once per party — respects suppression list</div>
                  </div>
                  <button
                    className="h-7 px-2 border border-surface-dim rounded text-[11px] font-semibold hover:bg-surface-container-low"
                    onClick={() => onToast('Edit trigger')}
                  >
                    Edit
                  </button>
                </div>
              </div>

              {/* Steps */}
              <div>
                <div className="section-h flex items-center justify-between">
                  <span>Steps</span>
                  <span className="text-[10px] text-on-surface-variant normal-case tracking-normal font-normal">Drag to reorder</span>
                </div>
                <StepList steps={builderSeq.steps} onDelete={deleteStep} onMove={moveStep} onToast={onToast} />
                <div className="grid grid-cols-4 gap-2 mt-3">
                  {(['email', 'wait', 'task', 'branch'] as StepKind[]).map(k => (
                    <button
                      key={k}
                      className="h-9 border border-surface-dim rounded-lg text-[11px] font-semibold hover:border-qb-blue hover:bg-qb-blue/5 flex items-center justify-center gap-1"
                      onClick={() => addStep(k)}
                    >
                      <span className="material-symbols-outlined text-[14px]">{STEP_ICONS[k]}</span>
                      {k.charAt(0).toUpperCase() + k.slice(1)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Exit conditions */}
              <div>
                <div className="section-h">Exit conditions</div>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 text-body-sm cursor-pointer">
                    <input type="checkbox" defaultChecked className="row-check" />Exit when party replies to any step
                  </label>
                  <label className="flex items-center gap-2 text-body-sm cursor-pointer">
                    <input type="checkbox" defaultChecked className="row-check" />Exit when party books an appointment
                  </label>
                  <label className="flex items-center gap-2 text-body-sm cursor-pointer">
                    <input type="checkbox" className="row-check" />Exit when party becomes a Customer
                  </label>
                </div>
              </div>

              {/* Performance */}
              <div>
                <div className="section-h">Performance (30d)</div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="border border-surface-dim rounded-lg p-3">
                    <div className="text-[10px] uppercase tracking-wider font-bold text-on-surface-variant">Enrolled</div>
                    <div className="text-headline-sm mt-1 tabular-nums">{builderSeq.enrolled}</div>
                  </div>
                  <div className="border border-surface-dim rounded-lg p-3">
                    <div className="text-[10px] uppercase tracking-wider font-bold text-on-surface-variant">Completed</div>
                    <div className="text-headline-sm mt-1 tabular-nums text-secondary">{builderSeq.completed}</div>
                  </div>
                  <div className="border border-surface-dim rounded-lg p-3">
                    <div className="text-[10px] uppercase tracking-wider font-bold text-on-surface-variant">Reply rate</div>
                    <div className="text-headline-sm mt-1 tabular-nums">{builderSeq.replyRate}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="h-14 border-t border-surface-dim px-4 flex items-center justify-between shrink-0">
              <button
                className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low"
                onClick={() => setBuilderOpen(false)}
              >
                Cancel
              </button>
              <div className="flex items-center gap-2">
                <button
                  className="h-8 px-3 border border-surface-dim rounded text-body-md font-semibold hover:bg-surface-container-low"
                  onClick={() => saveSequence('draft')}
                >
                  Save draft
                </button>
                <button
                  className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container flex items-center gap-1"
                  onClick={() => saveSequence('active')}
                >
                  <span className="material-symbols-outlined text-[16px]">play_arrow</span>Save &amp; activate
                </button>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ════ ADD-STOP DRAWER ════ */}
      {addStopOpen && (
        <>
          <div className="drawer-scrim open" onClick={() => setAddStopOpen(false)} />
          <div className="drawer open" role="dialog" aria-label="Add stop to route">
            <div className="flex items-center justify-between px-5 h-14 border-b border-surface-dim shrink-0">
              <div className="flex items-center gap-2 min-w-0">
                <span className="material-symbols-outlined text-[20px] text-primary">add_location</span>
                <div className="min-w-0">
                  <div className="text-headline-sm truncate">Add stop to route</div>
                  <div className="text-[11px] text-on-surface-variant">Pick a party, appointment, or manual address</div>
                </div>
              </div>
              <button
                className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center"
                onClick={() => setAddStopOpen(false)}
                aria-label="Close"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              <div>
                <div className="section-h">Add from</div>
                <div className="grid grid-cols-3 gap-2">
                  <button className="border border-qb-blue bg-qb-blue/5 rounded-lg p-3 text-left">
                    <div className="text-body-sm font-semibold text-qb-blue">Party</div>
                    <div className="text-[11px] text-on-surface-variant">Search customers</div>
                  </button>
                  <button className="border border-surface-dim rounded-lg p-3 text-left hover:bg-surface-container-low">
                    <div className="text-body-sm font-semibold">Appointment</div>
                    <div className="text-[11px] text-on-surface-variant">Today's bookings</div>
                  </button>
                  <button className="border border-surface-dim rounded-lg p-3 text-left hover:bg-surface-container-low">
                    <div className="text-body-sm font-semibold">Manual</div>
                    <div className="text-[11px] text-on-surface-variant">Type an address</div>
                  </button>
                </div>
              </div>
              <div>
                <div className="section-h">Search parties</div>
                <div className="relative flex items-center mb-2">
                  <span className="material-symbols-outlined absolute left-2 text-[16px] text-outline">search</span>
                  <input
                    className="field-input pl-8"
                    placeholder="Name, address, phone…"
                    value={candidateQuery}
                    onChange={e => setCandidateQuery(e.target.value)}
                  />
                </div>
                <div className="border border-surface-dim rounded-lg divide-y divide-surface-dim">
                  {CANDIDATES
                    .filter(c => !candidateQuery || `${c.name} ${c.address}`.toLowerCase().includes(candidateQuery.toLowerCase()))
                    .map(c => (
                      <button
                        key={c.partyId}
                        className="w-full text-left p-2 hover:bg-surface-container-low flex items-center justify-between"
                        onClick={() => addStopFromCandidate(c)}
                      >
                        <div>
                          <div className="text-body-sm font-medium">{c.name}</div>
                          <div className="text-[11px] text-on-surface-variant">{c.address}</div>
                        </div>
                        <span className={statClass(stopTypeClass(c.type))}>{c.type}</span>
                      </button>
                    ))}
                </div>
              </div>
              <div>
                <div className="section-h">Stop notes</div>
                <textarea
                  className="field-input"
                  style={{ height: 60, padding: '8px 10px', fontFamily: 'inherit' }}
                  placeholder="Anything the driver should know"
                />
              </div>
            </div>

            <div className="h-14 border-t border-surface-dim px-4 flex items-center justify-between shrink-0">
              <button
                className="h-8 px-3 border border-surface-dim rounded text-body-md hover:bg-surface-container-low"
                onClick={() => setAddStopOpen(false)}
              >
                Cancel
              </button>
              <button
                className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container flex items-center gap-1"
                onClick={() => onToast('Select a party above')}
              >
                <span className="material-symbols-outlined text-[16px]">add</span>Add stop
              </button>
            </div>
          </div>
        </>
      )}

      {/* click-away for stop row menu */}
      {rowMenuForStopId && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 150 }} onClick={() => setRowMenuForStopId(null)} />
      )}
    </div>
  );
}

/* ═════════════════════════════════════════════════════════════════ *
 *  SUB-COMPONENTS
 * ═════════════════════════════════════════════════════════════════ */

function SequencesList({
  sequences,
  selected,
  allChecked,
  onCheckAll,
  onToggle,
  onRowClick,
  onToast,
}: {
  sequences: Sequence[];
  selected: Set<string>;
  allChecked: boolean;
  onCheckAll: (check: boolean) => void;
  onToggle: (id: string) => void;
  onRowClick: (id: string) => void;
  onToast: (m: string) => void;
}) {
  if (sequences.length === 0) {
    return (
      <div className="p-12 text-center text-on-surface-variant">
        <span className="material-symbols-outlined text-[40px] mb-2 block">alt_route</span>
        <div className="font-medium mb-1">No sequences yet</div>
        <div className="text-[12px]">Click <b>New sequence</b> to start your first automation.</div>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-body-sm">
        <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider">
          <tr>
            <th className="w-8 px-3 py-2"><input type="checkbox" className="row-check" checked={allChecked} onChange={e => onCheckAll(e.target.checked)} /></th>
            <th className="px-3 py-2">Sequence</th>
            <th className="px-3 py-2">Trigger</th>
            <th className="px-3 py-2 text-right">Steps</th>
            <th className="px-3 py-2 text-right">Enrolled</th>
            <th className="px-3 py-2 text-right">Reply rate</th>
            <th className="px-3 py-2">Status</th>
            <th className="w-8"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-dim">
          {sequences.map(s => (
            <tr key={s.id} className="hover:bg-surface-container-low cursor-pointer" onClick={() => onRowClick(s.id)}>
              <td className="px-3 py-2" onClick={e => { e.stopPropagation(); onToggle(s.id); }}>
                <input type="checkbox" className="row-check" checked={selected.has(s.id)} onChange={() => onToggle(s.id)} />
              </td>
              <td className="px-3 py-2">
                <div className="font-medium">{s.name}</div>
                <div className="text-[11px] text-on-surface-variant truncate">{s.desc}</div>
              </td>
              <td className="px-3 py-2 text-on-surface-variant text-[12px]">{s.trigger}</td>
              <td className="px-3 py-2 text-right tabular-nums">{s.steps.length}</td>
              <td className="px-3 py-2 text-right tabular-nums">{s.enrolled}</td>
              <td className={`px-3 py-2 text-right tabular-nums ${s.replyRate !== '—' ? 'text-secondary font-medium' : 'text-on-surface-variant'}`}>{s.replyRate}</td>
              <td className="px-3 py-2"><span className={statClass(seqStatusClass(s.status))}>{s.status}</span></td>
              <td className="px-2 py-2 text-right">
                <button
                  className="w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center"
                  onClick={e => { e.stopPropagation(); onToast(`Menu for ${s.name}`); }}
                >
                  <span className="material-symbols-outlined text-[16px] text-on-surface-variant">more_horiz</span>
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EnrollmentsList({
  enrollments,
  onToast,
}: {
  enrollments: Enrollment[];
  onToast: (m: string) => void;
}) {
  if (enrollments.length === 0) {
    return (
      <div className="p-12 text-center text-on-surface-variant">
        <span className="material-symbols-outlined text-[40px] mb-2 block">group</span>
        <div className="font-medium mb-1">No enrollments</div>
        <div className="text-[12px]">Parties will appear here as they enter active sequences.</div>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-body-sm">
        <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider">
          <tr>
            <th className="w-8 px-3 py-2"></th>
            <th className="px-3 py-2">Party</th>
            <th className="px-3 py-2">Sequence</th>
            <th className="px-3 py-2">Progress</th>
            <th className="px-3 py-2">Next step</th>
            <th className="px-3 py-2">Status</th>
            <th className="w-8"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-dim">
          {enrollments.map(e => (
            <tr key={e.id} className="hover:bg-surface-container-low cursor-pointer" onClick={() => onToast(`Open party → /crm/parties/${e.partyId}`)}>
              <td className="px-3 py-2"></td>
              <td className="px-3 py-2 font-medium">{e.partyName}</td>
              <td className="px-3 py-2 text-on-surface-variant">{e.sequenceName}</td>
              <td className="px-3 py-2">
                <div className="enrollment-chain flex items-center gap-1">
                  {Array.from({ length: e.totalSteps }, (_, i) => (
                    <div
                      key={i}
                      className="node"
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        background:
                          i < e.step - 1 ? '#00714b' :
                          i === e.step - 1 ? '#0077c5' : '#dad9dd',
                        boxShadow: i === e.step - 1 ? '0 0 0 3px rgba(0,119,197,.15)' : 'none',
                      }}
                    />
                  ))}
                  <span className="ml-1 text-[11px] text-on-surface-variant">step {e.step} of {e.totalSteps}</span>
                </div>
              </td>
              <td className="px-3 py-2 text-on-surface-variant">{e.nextAt}</td>
              <td className="px-3 py-2"><span className={statClass(enrStatusClass(e.status))}>{e.status}</span></td>
              <td className="px-2 py-2 text-right">
                <button
                  className="w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center"
                  onClick={ev => { ev.stopPropagation(); onToast(`Menu for ${e.partyName}`); }}
                >
                  <span className="material-symbols-outlined text-[16px] text-on-surface-variant">more_horiz</span>
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RouteBuilder({
  stops,
  allStops,
  lateCount,
  driveMinutes,
  selected,
  allChecked,
  onCheckAll,
  onToggle,
  rowMenuForId,
  onOpenRowMenu,
  onCloseRowMenu,
  onMoveStop,
  onMarkArrived,
  onRemoveStop,
  onOptimize,
  onToast,
}: {
  stops: Stop[];
  allStops: Stop[];
  lateCount: number;
  driveMinutes: number;
  selected: Set<string>;
  allChecked: boolean;
  onCheckAll: (check: boolean) => void;
  onToggle: (id: string) => void;
  rowMenuForId: string | null;
  onOpenRowMenu: (id: string) => void;
  onCloseRowMenu: () => void;
  onMoveStop: (id: string, dir: 'up' | 'down') => void;
  onMarkArrived: (id: string) => void;
  onRemoveStop: (id: string) => void;
  onOptimize: () => void;
  onToast: (m: string) => void;
}) {
  return (
    <div>
      {/* KPI strip for route */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2 p-4 border-b border-surface-dim">
        <div>
          <div className="text-[10px] uppercase tracking-wider font-bold text-on-surface-variant">Stops today</div>
          <div className="text-headline-md mt-1 tabular-nums">{allStops.length}</div>
          <div className="text-[11px] text-on-surface-variant mt-0.5">Across 3 cities</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider font-bold text-on-surface-variant">Est. drive time</div>
          <div className="text-headline-md mt-1 tabular-nums text-qb-blue">{Math.floor(driveMinutes / 60)}h {driveMinutes % 60}m</div>
          <div className="text-[11px] text-on-surface-variant mt-0.5">Between stops</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider font-bold text-on-surface-variant">Est. distance</div>
          <div className="text-headline-md mt-1 tabular-nums">42.6 mi</div>
          <div className="text-[11px] text-on-surface-variant mt-0.5">Round trip</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-wider font-bold text-on-surface-variant">SLA at risk</div>
          <div className="text-headline-md mt-1 tabular-nums text-error">{lateCount}</div>
          <div className="text-[11px] text-on-surface-variant mt-0.5">Stop may be late</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-5 gap-0">
        {/* LEFT: stop list */}
        <div className="lg:col-span-3 border-r border-surface-dim">
          <div className="px-4 py-3 border-b border-surface-dim flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-label-sm uppercase tracking-wider font-bold text-on-surface">Today · Nov 15</span>
              <span className={statClass('info')}>Draft</span>
            </div>
            <span className="text-[11px] text-on-surface-variant">{stops.length} stops</span>
          </div>
          <div className="p-3">
            {stops.length === 0 ? (
              <div className="p-8 text-center text-on-surface-variant">
                <span className="material-symbols-outlined text-[40px] mb-2 block">route</span>
                <div className="font-medium mb-1">No stops yet</div>
                <div className="text-[12px]">Click <b>Add stop</b> to pick a party or appointment.</div>
              </div>
            ) : (
              stops.map((s, i) => (
                <div key={s.id} className="relative">
                  <div
                    className="stop flex items-center gap-2.5 p-2.5 border border-surface-dim rounded-lg mb-2 hover:border-qb-blue hover:shadow-sm"
                    draggable
                    onDragStart={e => e.dataTransfer.setData('text/plain', s.id)}
                    onDrop={e => {
                      e.preventDefault();
                      const fromId = e.dataTransfer.getData('text/plain');
                      const toId = s.id;
                      if (fromId && fromId !== toId) {
                        // simple: move from to before to — handled by parent
                      }
                    }}
                  >
                    <div className={`num w-6 h-6 rounded-full flex items-center justify-center text-white font-bold text-[11px] shrink-0 ${s.late ? '' : ''}`}
                         style={{ background: s.late ? '#8a5a00' : '#0077c5' }}>
                      {i + 1}
                    </div>
                    <input
                      type="checkbox"
                      className="row-check"
                      checked={selected.has(s.id)}
                      onChange={() => onToggle(s.id)}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <div className="font-medium text-body-sm truncate">{s.name}</div>
                        <span className={statClass(stopTypeClass(s.type))}>{s.type}</span>
                        {s.late && <span className={statClass('error')}>Late</span>}
                        {s.status === 'arrived' && <span className={statClass('success')}>Arrived</span>}
                      </div>
                      <div className="text-[11px] text-on-surface-variant truncate">{s.address}</div>
                      <div className="text-[11px] text-on-surface-variant truncate mt-0.5">{s.purpose}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-[12px] font-semibold tabular-nums">{s.time}</div>
                      <button
                        className="mt-1 w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center"
                        onClick={e => { e.stopPropagation(); onOpenRowMenu(s.id); }}
                      >
                        <span className="material-symbols-outlined text-[16px] text-on-surface-variant">more_horiz</span>
                      </button>
                    </div>
                  </div>

                  {/* row menu */}
                  {rowMenuForId === s.id && (
                    <div
                      className="row-menu open absolute right-0 mt-1 z-30"
                      style={{ minWidth: 250 }}
                      onClick={e => e.stopPropagation()}
                    >
                      <div className="menu-header">Open</div>
                      <button onClick={() => { onToast(`Navigate → /crm/parties/${s.partyId}`); onCloseRowMenu(); }}>
                        <span className="material-symbols-outlined">person</span>Open party profile
                      </button>
                      <button onClick={() => { onToast(`Click-to-call ${s.name}`); onCloseRowMenu(); }}>
                        <span className="material-symbols-outlined">call</span>Click-to-call
                      </button>
                      <div className="sep" />
                      <div className="menu-header">Reschedule</div>
                      <button onClick={() => { onMoveStop(s.id, 'up'); onCloseRowMenu(); }}>
                        <span className="material-symbols-outlined">arrow_upward</span>Move up
                      </button>
                      <button onClick={() => { onMoveStop(s.id, 'down'); onCloseRowMenu(); }}>
                        <span className="material-symbols-outlined">arrow_downward</span>Move down
                      </button>
                      <button onClick={() => { onToast('Date picker — move stop to another day'); onCloseRowMenu(); }}>
                        <span className="material-symbols-outlined">event</span>Move to another day
                      </button>
                      <div className="sep" />
                      <div className="menu-header">Create from this</div>
                      <button onClick={() => { onToast(`Book appointment with ${s.name}`); onCloseRowMenu(); }}>
                        <span className="material-symbols-outlined">event_available</span>Book appointment
                      </button>
                      <button onClick={() => { onToast(`Add note to ${s.name}`); onCloseRowMenu(); }}>
                        <span className="material-symbols-outlined">note_add</span>Add note
                      </button>
                      <button onClick={() => { onToast(`New task for ${s.name}`); onCloseRowMenu(); }}>
                        <span className="material-symbols-outlined">task_alt</span>New task
                      </button>
                      <div className="sep" />
                      <div className="menu-header">Route</div>
                      <button onClick={() => { onToast(`Prioritize ${s.name}`); onCloseRowMenu(); }}>
                        <span className="material-symbols-outlined">star</span>Prioritize stop
                      </button>
                      <button onClick={() => { onMarkArrived(s.id); onCloseRowMenu(); }}>
                        <span className="material-symbols-outlined">check_circle</span>Mark arrived
                      </button>
                      <div className="sep" />
                      <button className="danger" onClick={() => { onRemoveStop(s.id); onCloseRowMenu(); }}>
                        <span className="material-symbols-outlined">delete</span>Remove from route
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>

        {/* RIGHT: map + summary */}
        <div className="lg:col-span-2 p-4 space-y-4">
          <div className="bg-white rounded-xl shadow-sm border border-surface-dim p-3" style={{ height: 400 }}>
            <div className="map-canvas relative h-full bg-surface-container-high rounded-lg overflow-hidden">
              <div className="absolute inset-0" style={{
                backgroundImage: 'linear-gradient(rgba(0,0,0,.04) 1px,transparent 1px),linear-gradient(90deg,rgba(0,0,0,.04) 1px,transparent 1px)',
                backgroundSize: '32px 32px',
              }} />
              <div className="absolute top-3 left-3 text-[10px] uppercase tracking-wider font-bold text-on-surface-variant bg-white/90 px-2 py-1 rounded shadow-sm">
                Map · Charlotte, NC
              </div>
              {stops.map((s, i) => (
                <div key={s.id}>
                  <div
                    className="absolute"
                    style={{
                      left: `${s.x}%`,
                      top: `${s.y}%`,
                      width: 14,
                      height: 14,
                      background: s.late ? '#8a5a00' : '#0077c5',
                      borderRadius: '50% 50% 50% 0',
                      transform: 'rotate(-45deg)',
                      boxShadow: '0 2px 4px rgba(0,0,0,.2)',
                    }}
                  />
                  <div
                    className="absolute text-white font-bold text-[10px]"
                    style={{ left: `calc(${s.x}% + 2px)`, top: `calc(${s.y}% + 2px)` }}
                  >
                    {i + 1}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="bg-white rounded-xl shadow-sm border border-surface-dim p-4">
            <div className="section-h">Route summary</div>
            <div className="space-y-2 text-body-sm">
              <div className="flex justify-between"><span className="text-on-surface-variant">Total stops</span><span className="font-semibold tabular-nums">{allStops.length}</span></div>
              <div className="flex justify-between"><span className="text-on-surface-variant">Drive time</span><span className="font-semibold tabular-nums">{Math.floor(driveMinutes / 60)}h {driveMinutes % 60}m</span></div>
              <div className="flex justify-between"><span className="text-on-surface-variant">Distance</span><span className="font-semibold tabular-nums">42.6 mi</span></div>
              <div className="flex justify-between pt-2 border-t border-surface-dim"><span className="text-on-surface-variant">Depart by</span><span className="font-semibold tabular-nums">8:30 AM</span></div>
              <div className="flex justify-between"><span className="text-on-surface-variant">Return by</span><span className="font-semibold tabular-nums">4:15 PM</span></div>
              {lateCount > 0 && (
                <div className="flex justify-between text-error"><span>Late stop</span><span className="font-semibold">#{stops.findIndex(s => s.late) + 1}</span></div>
              )}
            </div>
            <div className="mt-3 pt-3 border-t border-surface-dim space-y-2">
              <button
                className="w-full h-8 bg-primary text-white rounded text-label-sm font-semibold hover:bg-primary-container flex items-center justify-center gap-1"
                onClick={onOptimize}
              >
                <span className="material-symbols-outlined text-[14px]">auto_fix_high</span>Re-optimize for drive time
              </button>
              <button
                className="w-full h-8 border border-surface-dim rounded text-label-sm font-semibold hover:bg-surface-container-low flex items-center justify-center gap-1"
                onClick={() => onToast('Route printed for driver')}
              >
                <span className="material-symbols-outlined text-[14px]">print</span>Print for driver
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StepList({
  steps,
  onDelete,
  onMove,
  onToast,
}: {
  steps: Step[];
  onDelete: (idx: number) => void;
  onMove: (from: number, to: number) => void;
  onToast: (m: string) => void;
}) {
  if (steps.length === 0) {
    return (
      <div className="p-4 text-center text-on-surface-variant text-[12px] border border-dashed border-surface-dim rounded-lg">
        No steps yet — add one below
      </div>
    );
  }
  return (
    <div>
      {steps.map((st, i) => (
        <div key={i}>
          <div
            className="step border border-surface-dim rounded-lg bg-white p-2.5 mb-2 flex items-start gap-2.5 hover:border-qb-blue"
            draggable
            onDragStart={e => e.dataTransfer.setData('text/plain', String(i))}
            onDrop={e => {
              e.preventDefault();
              const from = parseInt(e.dataTransfer.getData('text/plain'));
              if (!isNaN(from)) onMove(from, i);
            }}
            onDragOver={e => e.preventDefault()}
          >
            <div
              className="w-7 h-7 rounded flex items-center justify-center text-white font-bold text-[11px] shrink-0"
              style={{
                background: st.kind === 'email' ? '#0055a5' : st.kind === 'wait' ? '#8a5a00' : st.kind === 'task' ? '#6b1e28' : '#1e5a38',
              }}
            >
              {st.kind === 'email' ? '✉' : st.kind === 'wait' ? '⏱' : st.kind === 'task' ? '✓' : '↗'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] font-semibold text-on-surface">{st.title}</div>
              {st.sub && <div className="text-[11px] text-on-surface-variant mt-0.5">{st.sub}</div>}
            </div>
            <div className="flex items-center gap-1">
              <button
                className="w-6 h-6 rounded hover:bg-surface-container flex items-center justify-center"
                title="Edit"
                onClick={() => onToast('Open step editor — production: inline drawer for template, delay, assignee')}
              >
                <span className="material-symbols-outlined text-[14px] text-on-surface-variant">edit</span>
              </button>
              <button
                className="w-6 h-6 rounded hover:bg-error-container flex items-center justify-center"
                title="Delete"
                onClick={() => onDelete(i)}
              >
                <span className="material-symbols-outlined text-[14px] text-on-surface-variant">close</span>
              </button>
            </div>
          </div>
          {i < steps.length - 1 && (
            <div style={{ height: 14, marginLeft: 26, borderLeft: '2px dashed #dad9dd' }} />
          )}
        </div>
      ))}
    </div>
  );
}

function PartyEnrollmentsView({
  partyId,
  partyName,
  enrollments,
  onToast,
  onOpenBuilder,
}: {
  partyId: string;
  partyName?: string;
  enrollments: Enrollment[];
  onToast: (m: string) => void;
  onOpenBuilder: (seqId: string) => void;
}) {
  // Always show at least one row — mirror the HTML "Enrolled sequences" sidebar
  // (which has "New lead welcome" by default). If this party isn't in ENROLLMENTS,
  // show a fallback row scoped to them so the section is never empty.
  const rows = enrollments.length > 0
    ? enrollments
    : [{ id: 'enr-demo', sequenceId: 'seq-1', sequenceName: 'New lead welcome', partyId, partyName: partyName ?? 'This party', step: 2, totalSteps: 5, nextAt: 'tomorrow 9:00 AM', status: 'active' as const }];

  return (
    <div className="bg-white rounded-xl shadow-sm border border-surface-dim overflow-hidden mt-4">
      <div className="px-4 py-3 border-b border-surface-dim flex items-center justify-between">
        <h2 className="text-headline-sm flex items-center gap-2">
          <span className="material-symbols-outlined text-[20px] text-primary">alt_route</span>
          Enrolled sequences
          <span className="text-on-surface-variant text-body-sm font-normal">({rows.length})</span>
        </h2>
        <button
          className="h-7 px-2 border border-surface-dim rounded text-label-sm font-semibold hover:bg-surface-container-low flex items-center gap-1"
          onClick={() => onToast('Open party picker to enroll')}
        >
          <span className="material-symbols-outlined text-[14px]">group_add</span>Enroll in sequence
        </button>
      </div>
      <div className="divide-y divide-surface-dim">
        {rows.map(e => (
          <div key={e.id} className="px-4 py-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  className="text-body-sm font-medium text-primary hover:underline"
                  onClick={() => onOpenBuilder(e.sequenceId)}
                >
                  {e.sequenceName}
                </button>
                <span className={statClass(enrStatusClass(e.status))}>{e.status}</span>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <div className="enrollment-chain flex items-center gap-1">
                  {Array.from({ length: e.totalSteps }, (_, i) => (
                    <div
                      key={i}
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        background:
                          i < e.step - 1 ? '#00714b' :
                          i === e.step - 1 ? '#0077c5' : '#dad9dd',
                        boxShadow: i === e.step - 1 ? '0 0 0 3px rgba(0,119,197,.15)' : 'none',
                      }}
                    />
                  ))}
                </div>
                <span className="text-[11px] text-on-surface-variant">step {e.step} of {e.totalSteps}</span>
                <span className="text-[11px] text-on-surface-variant">·</span>
                <span className="text-[11px] text-on-surface-variant">next: {e.nextAt}</span>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                className="h-7 px-2 border border-surface-dim rounded text-label-sm font-semibold hover:bg-surface-container-low flex items-center gap-1"
                onClick={() => onToast('Pause enrollment')}
              >
                <span className="material-symbols-outlined text-[14px]">pause</span>Pause
              </button>
              <button
                className="h-7 px-2 border border-surface-dim rounded text-label-sm font-semibold hover:bg-surface-container-low flex items-center gap-1"
                onClick={() => onToast('Advance to next step')}
              >
                <span className="material-symbols-outlined text-[14px]">skip_next</span>Advance
              </button>
              <button
                className="h-7 px-2 border border-error text-error rounded text-label-sm font-semibold hover:bg-error-container/20 flex items-center gap-1"
                onClick={() => onToast('Removed from sequence')}
              >
                <span className="material-symbols-outlined text-[14px]">exit_to_app</span>Remove
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
