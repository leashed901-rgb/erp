'use client';
/**
 * StaffScreen — the Staff rail surface (Kim, 2026-11-16).
 *
 * Staff are contact parties with an employee role and a different
 * profile view. ONE list, ONE profile: employee type and wage live
 * on the person's payroll record (payroll_employees, joined by
 * staff_id), hours live in their shifts / time clock / availability
 * / blocked times, pay history in their run items. None of those is
 * a page — they are tabs and card sections on the staff profile,
 * served joined by GET /api/staff and GET /api/staff/[id].
 */
import { useCallback, useEffect, useState } from 'react';

interface PayrollLite { id: string; pay_type: string | null; pay_rate: number | null; pay_schedule: string | null; is_active: boolean }
interface StaffRow {
  id: string; party_id: string | null; display_name: string | null; first_name: string | null; last_name: string | null;
  email: string | null; phone: string | null; role: string | null; is_service_staff: boolean; is_active: boolean;
  hire_date: string | null; termination_date: string | null; commission_rate: number | null; salary_period: string | null;
  payroll: PayrollLite | null;
}
interface StaffDetail {
  staff: StaffRow & { bio: string | null; notes: string | null; service_specialties: string | null; certifications: string | null; max_daily_appointments: number | null };
  payroll: (PayrollLite & { hire_date: string | null }) | null;
  hours: {
    shifts: { id: string; shift_date: string; starts_at: string; ends_at: string; status: string | null; is_overtime: boolean; role: string | null }[];
    clock: { id: string; clock_in: string; clock_out: string | null; source: string | null }[];
    availability: { id: string; day_of_week: number; available_from: string | null; available_to: string | null; availability_type: string | null }[];
    blocked: { id: string; starts_at: string; ends_at: string; block_type: string | null; reason: string | null }[];
    timesheets: { id: string; week_start: string; week_end: string; hours_regular: number | null; hours_overtime: number | null; hours_pto: number | null; hours_sick: number | null; status: string | null }[];
  };
  wages: {
    runItems: { id: string; hours_regular: number | null; hours_overtime: number | null; gross_wages: number | null; tax_withheld: number | null; net_paid: number | null; commission_amount: number | null; payroll_runs: { number: string | null; pay_period_start: string | null; pay_period_end: string | null; pay_date: string | null; status: string | null } | null }[];
  };
}

const money = (n: number | null | undefined) => (n == null ? '—' : `$${Number(n).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}
function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? String(iso).slice(0, 5) : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
function initials(name: string) {
  return (name || '').split(' ').map((w) => w[0] || '').join('').slice(0, 2).toUpperCase() || '??';
}
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
function staffName(s: StaffRow): string {
  return s.display_name || [s.first_name, s.last_name].filter(Boolean).join(' ') || 'Staff member';
}

type ProfileTab = 'overview' | 'hours' | 'wages';

export default function StaffScreen({ onToast }: { onToast: (m: string) => void }) {
  const [rows, setRows] = useState<StaffRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<StaffDetail | null>(null);
  const [tab, setTab] = useState<ProfileTab>('overview');
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newRole, setNewRole] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [addBusy, setAddBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch('/api/staff');
      const j = await r.json();
      setRows((j.data as StaffRow[]) || []);
    } catch { setRows([]); }
    setLoaded(true);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const openProfile = useCallback(async (id: string) => {
    setSelectedId(id);
    setDetail(null);
    setTab('overview');
    try {
      const r = await fetch(`/api/staff/${id}`);
      const j = await r.json();
      if (r.ok) setDetail(j.data as StaffDetail);
      else onToast(j.error?.message || 'Could not load that profile');
    } catch { onToast('Could not load that profile'); }
  }, [onToast]);

  async function handleAddStaff() {
    if (!newName.trim()) return;
    setAddBusy(true);
    try {
      const r = await fetch('/api/crm/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ display_name: newName.trim(), role: newRole.trim() || undefined, email: newEmail.trim() || undefined }),
      });
      const j = await r.json();
      if (!r.ok) { onToast(j.error?.message || 'Could not add that staff member'); return; }
      setNewName(''); setNewRole(''); setNewEmail('');
      setShowAdd(false);
      await load();
      onToast('Staff member added');
    } finally { setAddBusy(false); }
  }

  /* ── Profile view ──────────────────────────────────────────── */
  if (selectedId) {
    const s = detail?.staff;
    const p = detail?.payroll;
    return (
      <main className="px-6 pb-12">
        <div className="flex items-center gap-2 text-label-sm text-on-surface-variant mt-4 mb-2">
          <button className="hover:underline font-semibold text-on-surface" onClick={() => { setSelectedId(null); setDetail(null); }}>← Staff</button>
          <span className="text-outline">/</span>
          <span className="text-on-surface font-semibold">{s ? staffName(s) : 'Profile'}</span>
        </div>
        {!detail || !s ? (
          <div className="bg-white rounded-xl border border-surface-dim p-8 text-center text-on-surface-variant text-body-md mt-4">Loading profile…</div>
        ) : (
          <>
            <div className="bg-white rounded-xl border border-surface-dim p-5 mt-2">
              <div className="flex items-start justify-between flex-wrap gap-4">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 rounded-full bg-primary-container flex items-center justify-center text-headline-sm font-bold text-primary">{initials(staffName(s))}</div>
                  <div>
                    <h1 className="text-headline-lg">{staffName(s)}</h1>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      {s.role && <span className="pill tag">{s.role}</span>}
                      {p?.pay_type && <span className="pill tag">{p.pay_type}</span>}
                      <span className="pill tag">{s.is_active ? 'Active' : 'Inactive'}</span>
                      {s.is_service_staff && <span className="pill tag">Bookable</span>}
                    </div>
                    <div className="text-body-sm text-on-surface-variant mt-1">{s.email || 'No email'}{s.phone ? ` · ${s.phone}` : ''}</div>
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="border border-surface-dim rounded-lg px-4 py-3">
                    <div className="text-[10px] uppercase tracking-wider font-bold text-on-surface-variant">Pay rate</div>
                    <div className="text-headline-sm tabular-nums mt-0.5">{p ? money(p.pay_rate) : '—'}</div>
                    <div className="text-[11px] text-on-surface-variant">{p?.pay_schedule || s.salary_period || (p ? '' : 'Not on payroll')}</div>
                  </div>
                  <div className="border border-surface-dim rounded-lg px-4 py-3">
                    <div className="text-[10px] uppercase tracking-wider font-bold text-on-surface-variant">Hired</div>
                    <div className="text-headline-sm mt-0.5">{fmtDate(s.hire_date || p?.hire_date)}</div>
                    <div className="text-[11px] text-on-surface-variant">{s.termination_date ? `Ended ${fmtDate(s.termination_date)}` : 'Current'}</div>
                  </div>
                  <div className="border border-surface-dim rounded-lg px-4 py-3">
                    <div className="text-[10px] uppercase tracking-wider font-bold text-on-surface-variant">Commission</div>
                    <div className="text-headline-sm tabular-nums mt-0.5">{s.commission_rate != null ? `${s.commission_rate}%` : '—'}</div>
                    <div className="text-[11px] text-on-surface-variant">{s.max_daily_appointments ? `Max ${s.max_daily_appointments} appts/day` : ''}</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-1 border-b border-surface-dim bg-white overflow-x-auto mt-4">
              {([['overview', 'Overview'], ['hours', 'Hours'], ['wages', 'Wages']] as [ProfileTab, string][]).map(([id, label]) => (
                <button key={id} className={`px-3 py-2 text-label-md tab-underline ${tab === id ? 'active' : 'text-on-surface-variant'}`} onClick={() => setTab(id)}>{label}</button>
              ))}
            </div>

            {tab === 'overview' && (
              <div className="bg-white rounded-xl border border-surface-dim p-5 mt-4 space-y-3">
                <div className="grid grid-cols-2 gap-4 text-body-md">
                  <div><span className="text-on-surface-variant">Role: </span>{s.role || '—'}</div>
                  <div><span className="text-on-surface-variant">Employee type: </span>{p?.pay_type || 'Not on payroll yet'}</div>
                  <div><span className="text-on-surface-variant">Email: </span>{s.email || '—'}</div>
                  <div><span className="text-on-surface-variant">Phone: </span>{s.phone || '—'}</div>
                  {s.service_specialties && <div className="col-span-2"><span className="text-on-surface-variant">Specialties: </span>{s.service_specialties}</div>}
                  {s.certifications && <div className="col-span-2"><span className="text-on-surface-variant">Certifications: </span>{s.certifications}</div>}
                  {s.bio && <div className="col-span-2"><span className="text-on-surface-variant">Bio: </span>{s.bio}</div>}
                  {s.notes && <div className="col-span-2"><span className="text-on-surface-variant">Notes: </span>{s.notes}</div>}
                </div>
              </div>
            )}

            {tab === 'hours' && (
              <div className="space-y-4 mt-4">
                <div className="bg-white rounded-xl border border-surface-dim p-5">
                  <h2 className="text-headline-sm mb-2">Weekly availability</h2>
                  {detail.hours.availability.length === 0 ? (
                    <p className="text-body-sm text-on-surface-variant">No regular availability set.</p>
                  ) : (
                    <div className="space-y-1">
                      {detail.hours.availability.map((a) => (
                        <div key={a.id} className="flex items-center gap-2 text-body-md">
                          <span className="font-medium w-28">{DAYS[a.day_of_week % 7]}</span>
                          <span>{a.available_from ? fmtTime(a.available_from) : '—'} – {a.available_to ? fmtTime(a.available_to) : '—'}</span>
                          {a.availability_type && <span className="pill tag">{a.availability_type}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 items-start">
                  <div className="bg-white rounded-xl border border-surface-dim p-5">
                    <h2 className="text-headline-sm mb-2">Shifts</h2>
                    {detail.hours.shifts.length === 0 ? (
                      <p className="text-body-sm text-on-surface-variant">No shifts scheduled.</p>
                    ) : (
                      <table className="w-full text-left text-body-sm">
                        <thead><tr className="text-label-sm text-on-surface-variant uppercase tracking-wider border-b border-surface-dim"><th className="py-2 pr-2">Date</th><th className="py-2 pr-2">Time</th><th className="py-2 pr-2">Status</th><th className="py-2">OT</th></tr></thead>
                        <tbody className="divide-y divide-surface-dim">
                          {detail.hours.shifts.map((sh) => (
                            <tr key={sh.id}><td className="py-2 pr-2">{fmtDate(sh.shift_date)}</td><td className="py-2 pr-2">{fmtTime(sh.starts_at)}–{fmtTime(sh.ends_at)}</td><td className="py-2 pr-2">{sh.status || '—'}</td><td className="py-2">{sh.is_overtime ? 'Yes' : ''}</td></tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                    <h2 className="text-headline-sm mt-5 mb-2">Time clock</h2>
                    {detail.hours.clock.length === 0 ? (
                      <p className="text-body-sm text-on-surface-variant">No clock entries yet.</p>
                    ) : (
                      <div className="space-y-1">
                        {detail.hours.clock.map((c) => (
                          <div key={c.id} className="text-body-md flex items-center gap-2">
                            <span>{fmtDate(c.clock_in)}</span>
                            <span className="text-on-surface-variant">{fmtTime(c.clock_in)} → {c.clock_out ? fmtTime(c.clock_out) : 'still in'}</span>
                            {c.source && <span className="pill tag">{c.source}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="space-y-4">
                    <div className="bg-white rounded-xl border border-surface-dim p-5">
                      <h2 className="text-headline-sm mb-2">Blocked times</h2>
                      {detail.hours.blocked.length === 0 ? (
                        <p className="text-body-sm text-on-surface-variant">No blocked times. Add them from Appointments → Scheduling setup.</p>
                      ) : (
                        <div className="space-y-1">
                          {detail.hours.blocked.map((b) => (
                            <div key={b.id} className="text-body-md flex items-center gap-2 flex-wrap">
                              <span className="font-medium">{fmtDate(b.starts_at)}</span>
                              <span className="text-on-surface-variant">{fmtTime(b.starts_at)}–{fmtTime(b.ends_at)}</span>
                              {b.block_type && <span className="pill tag">{b.block_type}</span>}
                              {b.reason && <span className="text-on-surface-variant">· {b.reason}</span>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <div className="bg-white rounded-xl border border-surface-dim p-5">
                      <h2 className="text-headline-sm mb-2">Timesheets</h2>
                      {detail.hours.timesheets.length === 0 ? (
                        <p className="text-body-sm text-on-surface-variant">No timesheets yet.</p>
                      ) : (
                        <table className="w-full text-left text-body-sm">
                          <thead><tr className="text-label-sm text-on-surface-variant uppercase tracking-wider border-b border-surface-dim"><th className="py-2 pr-2">Week</th><th className="py-2 pr-2">Regular</th><th className="py-2 pr-2">OT</th><th className="py-2 pr-2">PTO</th><th className="py-2">Status</th></tr></thead>
                          <tbody className="divide-y divide-surface-dim">
                            {detail.hours.timesheets.map((t) => (
                              <tr key={t.id}><td className="py-2 pr-2">{fmtDate(t.week_start)}</td><td className="py-2 pr-2">{t.hours_regular ?? 0}h</td><td className="py-2 pr-2">{t.hours_overtime ?? 0}h</td><td className="py-2 pr-2">{t.hours_pto ?? 0}h</td><td className="py-2">{t.status || '—'}</td></tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )}

            {tab === 'wages' && (
              <div className="bg-white rounded-xl border border-surface-dim p-5 mt-4">
                <h2 className="text-headline-sm mb-2">Pay history</h2>
                {!p ? (
                  <p className="text-body-sm text-on-surface-variant">This staff member has no payroll record yet — wages appear here once they are added in Payroll.</p>
                ) : detail.wages.runItems.length === 0 ? (
                  <p className="text-body-sm text-on-surface-variant">On payroll as {p.pay_type || '—'} at {money(p.pay_rate)}{p.pay_schedule ? ` · ${p.pay_schedule}` : ''}. No pay runs yet.</p>
                ) : (
                  <table className="w-full text-left text-body-sm">
                    <thead><tr className="text-label-sm text-on-surface-variant uppercase tracking-wider border-b border-surface-dim"><th className="py-2 pr-2">Run</th><th className="py-2 pr-2">Period</th><th className="py-2 pr-2">Hours</th><th className="py-2 pr-2">Gross</th><th className="py-2 pr-2">Tax</th><th className="py-2 pr-2">Net</th><th className="py-2">Status</th></tr></thead>
                    <tbody className="divide-y divide-surface-dim">
                      {detail.wages.runItems.map((it) => (
                        <tr key={it.id}>
                          <td className="py-2 pr-2 font-medium">{it.payroll_runs?.number || '—'}</td>
                          <td className="py-2 pr-2">{fmtDate(it.payroll_runs?.pay_period_start)} – {fmtDate(it.payroll_runs?.pay_period_end)}</td>
                          <td className="py-2 pr-2">{(it.hours_regular ?? 0) + (it.hours_overtime ?? 0)}h</td>
                          <td className="py-2 pr-2">{money(it.gross_wages)}</td>
                          <td className="py-2 pr-2">{money(it.tax_withheld)}</td>
                          <td className="py-2 pr-2 font-semibold">{money(it.net_paid)}</td>
                          <td className="py-2">{it.payroll_runs?.status || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </>
        )}
      </main>
    );
  }

  /* ── Directory view ────────────────────────────────────────── */
  return (
    <main className="px-6 pb-12">
      <div className="flex items-center gap-2 text-label-sm text-on-surface-variant mt-4 mb-2">
        <span className="text-on-surface font-semibold">Staff</span>
      </div>
      <div className="flex items-center justify-between gap-4 py-4 flex-wrap">
        <div>
          <h1 className="text-headline-lg">Staff</h1>
          <p className="text-body-sm text-on-surface-variant mt-0.5">Your people as parties — open one for their hours, wages and employee type.</p>
        </div>
        <button className="h-8 px-3 bg-primary text-white rounded text-body-md font-semibold hover:bg-primary-container flex items-center gap-1" onClick={() => setShowAdd(!showAdd)}>
          <span className="material-symbols-outlined text-[16px]">add</span>Add staff
        </button>
      </div>

      {showAdd && (
        <div className="bg-white border border-surface-dim rounded-xl p-4 mb-4 flex items-center gap-2 flex-wrap">
          <input className="h-9 px-3 border border-surface-dim rounded text-body-md flex-1 min-w-[180px]" placeholder="Full name" value={newName} onChange={(e) => setNewName(e.target.value)} />
          <input className="h-9 px-3 border border-surface-dim rounded text-body-md" placeholder="Role (e.g. Stylist)" value={newRole} onChange={(e) => setNewRole(e.target.value)} />
          <input className="h-9 px-3 border border-surface-dim rounded text-body-md flex-1 min-w-[180px]" placeholder="Email (optional)" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
          <button className="h-9 px-4 bg-primary text-white rounded text-body-md font-semibold disabled:opacity-50" disabled={addBusy || !newName.trim()} onClick={() => void handleAddStaff()}>Save</button>
          <button className="h-9 px-3 border border-surface-dim rounded text-body-md" onClick={() => setShowAdd(false)}>Cancel</button>
        </div>
      )}

      {!loaded ? (
        <div className="bg-white rounded-xl border border-surface-dim p-8 text-center text-on-surface-variant text-body-md">Loading staff…</div>
      ) : rows.length === 0 ? (
        <div className="bg-white rounded-xl border border-surface-dim p-8 text-center">
          <span className="material-symbols-outlined text-[40px] text-on-surface-variant">badge</span>
          <h2 className="text-headline-sm mt-2">No staff yet</h2>
          <p className="text-body-sm text-on-surface-variant mt-1">Add your first staff member — they become a party with an employee profile.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-surface-dim overflow-hidden">
          <table className="w-full text-left text-body-sm">
            <thead className="bg-surface-container-low text-label-sm text-on-surface-variant uppercase tracking-wider">
              <tr><th className="px-3 py-2">Name</th><th className="px-3 py-2">Role</th><th className="px-3 py-2">Employee type</th><th className="px-3 py-2">Pay rate</th><th className="px-3 py-2">Hired</th><th className="px-3 py-2">Status</th></tr>
            </thead>
            <tbody className="divide-y divide-surface-dim">
              {rows.map((s) => (
                <tr key={s.id} className="hover:bg-surface-container-low cursor-pointer" onClick={() => void openProfile(s.id)}>
                  <td className="px-3 py-2 font-medium">{staffName(s)}</td>
                  <td className="px-3 py-2">{s.role || '—'}</td>
                  <td className="px-3 py-2">{s.payroll?.pay_type || <span className="text-on-surface-variant">Not on payroll</span>}</td>
                  <td className="px-3 py-2">{s.payroll ? money(s.payroll.pay_rate) : '—'}</td>
                  <td className="px-3 py-2">{fmtDate(s.hire_date)}</td>
                  <td className="px-3 py-2"><span className="pill tag">{s.is_active ? 'Active' : 'Inactive'}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </main>
  );
}
