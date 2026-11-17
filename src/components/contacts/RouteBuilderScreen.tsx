'use client';
/**
 * RouteBuilderScreen — Contacts / CRM / Route Builder, built to
 * Kim's crm_route__sequencing template. Plan the day: build the
 * route from the day's appointments (the build endpoint performs
 * crm_build_route's writes), add stops from parties / appointments /
 * manual addresses, sequence them, mark arrivals. Stops are
 * crm_route_stops on the day's crm_routes row.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';

interface RouteStop {
  id: string; seq: number; appointment_id: string | null; customer_id: string | null;
  address: string | null; window_start: string | null; window_end: string | null;
  service_minutes: number | null; status: string; notes: string | null;
  arrived_at: string | null; completed_at: string | null;
  party_name: string | null; party_phone: string | null; party_city: string | null;
  appointment_title: string | null; appointment_number: string | null;
}
interface RouteData {
  id: string; route_date: string; name: string; status: string;
  total_distance_m: number | null; total_duration_s: number | null;
  stops: RouteStop[];
}
interface PartyOption { id: string; name: string; city: string | null; state: string | null }
interface ApptOption { id: string; title: string | null; appointment_number: string | null; starts_at: string; customer_id: string | null }

async function api<T>(url: string, init?: RequestInit): Promise<{ data: T | null; error?: string }> {
  try {
    const res = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...init });
    const json = await res.json();
    if (!res.ok) return { data: null, error: json?.error?.message || `HTTP ${res.status}` };
    return { data: json.data as T };
  } catch (e) {
    return { data: null, error: e instanceof Error ? e.message : 'Request failed' };
  }
}

function todayStr(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}
function fmtTime(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
function fmtDateLong(iso: string): string {
  const d = new Date(`${iso}T12:00:00`);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function RouteBuilderScreen({ onToast }: { onToast: (m: string) => void; onNavigate?: (d: string, s: string) => void }) {
  const [date, setDate] = useState(todayStr());
  const [staffList, setStaffList] = useState<{ id: string; display_name: string | null }[]>([]);
  const [staffId, setStaffId] = useState('');
  const [route, setRoute] = useState<RouteData | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  // Add-stop drawer
  const [addOpen, setAddOpen] = useState(false);
  const [addMode, setAddMode] = useState<'party' | 'appointment' | 'manual'>('party');
  const [parties, setParties] = useState<PartyOption[]>([]);
  const [appointments, setAppointments] = useState<ApptOption[]>([]);
  const [addPartyId, setAddPartyId] = useState('');
  const [addApptId, setAddApptId] = useState('');
  const [addAddress, setAddAddress] = useState('');
  const [addNotes, setAddNotes] = useState('');

  const refresh = useCallback(async () => {
    const qs = staffId ? `&staff_id=${staffId}` : '';
    const { data } = await api<RouteData | null>(`/api/crm/routes?date=${date}${qs}`);
    setRoute(data);
    setLoaded(true);
  }, [date, staffId]);
  useEffect(() => {
    void (async () => {
      const { data } = await api<{ id: string; display_name: string | null }[]>('/api/crm/staff');
      setStaffList(data || []);
    })();
  }, []);
  useEffect(() => { setLoaded(false); void refresh(); }, [refresh]);

  const stops = useMemo(() => route?.stops || [], [route]);
  const serviceMinutes = stops.reduce((sum, s) => sum + (s.service_minutes || 0), 0);
  const now = Date.now();
  const atRisk = stops.filter(s => s.status === 'pending' && s.window_end && new Date(s.window_end).getTime() < now).length;
  const cities = new Set(stops.map(s => s.party_city).filter(Boolean));

  async function buildRoute() {
    setBusy('build');
    const { data, error } = await api<RouteData>('/api/crm/routes/build', { method: 'POST', body: JSON.stringify({ date, staff_id: staffId || undefined }) });
    setBusy(null);
    if (error) { onToast(`Build failed: ${error}`); return; }
    setRoute(data);
    onToast(data && data.stops.length > 0 ? `Route built — ${data.stops.length} stops from the day's appointments` : 'Route created — no addressed appointments that day; add stops manually');
  }

  async function stopAction(stop: RouteStop, action: 'up' | 'down' | 'arrive' | 'complete' | 'prioritize' | 'remove') {
    if (!route) return;
    setBusy(`stop-${stop.id}`);
    if (action === 'remove') {
      const { error } = await api(`/api/crm/routes/${route.id}/stops/${stop.id}`, { method: 'DELETE' });
      setBusy(null);
      if (error) { onToast(`Remove failed: ${error}`); return; }
      onToast('Stop removed');
    } else {
      const { error } = await api(`/api/crm/routes/${route.id}/stops/${stop.id}`, { method: 'PATCH', body: JSON.stringify({ action }) });
      setBusy(null);
      if (error) { onToast(`Failed: ${error}`); return; }
      if (action === 'arrive') onToast('Marked arrived');
      if (action === 'complete') onToast('Stop completed');
    }
    void refresh();
  }

  async function openAdd() {
    setAddOpen(true);
    setAddPartyId(''); setAddApptId(''); setAddAddress(''); setAddNotes('');
    const custs = await api<PartyOption[]>('/api/parties?role=customer');
    setParties(custs.data || []);
    try {
      const res = await fetch(`/api/crm/appointments?from=${date}T00:00:00Z&to=${date}T23:59:59Z`);
      const json = await res.json();
      const items = (json.items || []) as Record<string, any>[];
      setAppointments(items.map(a => ({
        id: a.id,
        title: a.service?.name || 'Appointment',
        appointment_number: a.appointment_number || null,
        starts_at: a.starts_at,
        customer_id: a.customer?.id || null,
      })));
    } catch {
      setAppointments([]);
    }
  }

  async function submitAdd() {
    if (!route) { onToast('Build the route first'); return; }
    const payload: Record<string, unknown> = { notes: addNotes || undefined };
    if (addMode === 'party') {
      if (!addPartyId) { onToast('Pick a party'); return; }
      payload.customer_id = addPartyId;
    } else if (addMode === 'appointment') {
      if (!addApptId) { onToast('Pick an appointment'); return; }
      payload.appointment_id = addApptId;
    } else {
      if (!addAddress.trim()) { onToast('Enter an address'); return; }
      payload.address = addAddress.trim();
    }
    setBusy('add-stop');
    const { error } = await api(`/api/crm/routes/${route.id}/stops`, { method: 'POST', body: JSON.stringify(payload) });
    setBusy(null);
    if (error) { onToast(`Add stop failed: ${error}`); return; }
    onToast('Stop added');
    setAddOpen(false);
    void refresh();
  }

  return (
    <main className="px-6 pb-12 flex flex-col h-full overflow-y-auto">
      <div className="flex items-center gap-2 text-label-sm text-on-surface-variant mt-4 mb-2">
        <span>Contacts / CRM</span><span className="text-outline">/</span>
        <span className="text-on-surface font-semibold">Route Builder</span>
      </div>
      <div className="flex items-start justify-between gap-4 py-3 mb-4 flex-wrap">
        <div>
          <h1 className="text-headline-lg flex items-center gap-2">
            <span className="material-symbols-outlined text-primary">route</span>Route Builder
          </h1>
          <p className="text-body-sm text-on-surface-variant mt-0.5">Plan your day — pick stops, sequence them, hand the driver the list.</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" className="field-input" style={{ width: 160 }} value={date} onChange={e => setDate(e.target.value)} />
          <select className="field-input" style={{ width: 170 }} value={staffId} onChange={e => setStaffId(e.target.value)}>
            <option value="">Staff: default</option>
            {staffList.map(m => <option key={m.id} value={m.id}>{m.display_name || 'Staff'}</option>)}
          </select>
          <button className="h-8 px-3 border border-surface-dim rounded text-body-md font-medium hover:bg-surface-container-low flex items-center gap-1" onClick={() => window.print()}>
            <span className="material-symbols-outlined text-[16px]">print</span>Print for driver
          </button>
          <button className="h-8 px-3 bg-primary text-white text-body-md font-semibold hover:bg-primary-container flex items-center gap-1 disabled:opacity-40" disabled={busy === 'build'} onClick={() => void buildRoute()}>
            <span className="material-symbols-outlined text-[16px]">auto_fix_high</span>{busy === 'build' ? 'Building…' : 'Build from appointments'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 mb-4">
        <div className="bg-white rounded-xl border border-surface-dim p-3">
          <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Stops today</div>
          <div className="text-headline-sm mt-1 tabular-nums">{loaded ? stops.length : '—'}</div>
          <div className="text-[11px] text-on-surface-variant mt-0.5">{cities.size > 0 ? `Across ${cities.size} ${cities.size === 1 ? 'city' : 'cities'}` : '—'}</div>
        </div>
        <div className="bg-white rounded-xl border border-surface-dim p-3">
          <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Service time</div>
          <div className="text-headline-sm mt-1 tabular-nums">{loaded ? `${Math.floor(serviceMinutes / 60)}h ${serviceMinutes % 60}m` : '—'}</div>
          <div className="text-[11px] text-on-surface-variant mt-0.5">At stops (drive time needs the optimizer)</div>
        </div>
        <div className="bg-white rounded-xl border border-surface-dim p-3">
          <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">Window</div>
          <div className="text-headline-sm mt-1">{stops.length ? `${fmtTime(stops[0].window_start)} – ${fmtTime(stops[stops.length - 1].window_end)}` : '—'}</div>
          <div className="text-[11px] text-on-surface-variant mt-0.5">First to last stop</div>
        </div>
        <div className="bg-white rounded-xl border border-surface-dim p-3">
          <div className="text-[10px] text-on-surface-variant uppercase tracking-wider font-bold">SLA at risk</div>
          <div className={`text-headline-sm mt-1 tabular-nums ${atRisk > 0 ? 'text-error' : ''}`}>{loaded ? atRisk : '—'}</div>
          <div className="text-[11px] text-on-surface-variant mt-0.5">Stops past their window, not arrived</div>
        </div>
      </div>

      <div className="flex items-center gap-3 mb-3 flex-wrap">
        <span className="text-headline-sm">{fmtDateLong(date)}</span>
        {route ? <span className="pill info">{route.status}</span> : <span className="pill tag">no route yet</span>}
        <div className="flex-1" />
        <button className="h-8 px-3 bg-primary text-white text-body-md font-semibold hover:bg-primary-container flex items-center gap-1 disabled:opacity-40" disabled={!route} onClick={() => void openAdd()}>
          <span className="material-symbols-outlined text-[16px]">add_location</span>Add stop
        </button>
      </div>

      {!route ? (
        <div className="bg-white rounded-xl border border-surface-dim py-12 text-center">
          <p className="text-body-sm text-on-surface-variant max-w-md mx-auto">
            {loaded ? 'No route for this day yet. Build it from the day\u2019s appointments, then add any extra stops.' : 'Loading…'}
          </p>
        </div>
      ) : stops.length === 0 ? (
        <div className="bg-white rounded-xl border border-surface-dim py-12 text-center">
          <p className="text-body-sm text-on-surface-variant">This route has no stops. Add one from a party, an appointment, or a manual address.</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-surface-dim overflow-hidden">
          <div className="divide-y divide-surface-dim">
            {stops.map((stop, i) => (
              <div key={stop.id} className="px-4 py-3 flex items-start gap-3 hover:bg-surface-container-low">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-label-md font-bold shrink-0 ${stop.status === 'completed' ? 'bg-secondary text-white' : stop.status === 'arrived' ? 'bg-primary text-white' : 'bg-surface-container'}`}>
                  {stop.status === 'completed' ? <span className="material-symbols-outlined text-[16px]">check</span> : stop.seq}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{stop.party_name || stop.appointment_title || 'Manual stop'}</span>
                    {stop.appointment_number && <span className="pill tag">{stop.appointment_number}</span>}
                    <span className={`pill ${stop.status === 'completed' ? 'status role customer' : stop.status === 'arrived' ? 'info' : 'warn'}`}>{stop.status}</span>
                    {stop.status === 'pending' && stop.window_end && new Date(stop.window_end).getTime() < now && <span className="pill bad">late</span>}
                  </div>
                  <div className="text-body-sm text-on-surface-variant mt-0.5">{stop.address || 'No address'}</div>
                  <div className="text-[11px] text-on-surface-variant mt-0.5">
                    {fmtTime(stop.window_start)} – {fmtTime(stop.window_end)}{stop.service_minutes ? ` · ${stop.service_minutes} min service` : ''}{stop.party_phone ? ` · ${stop.party_phone}` : ''}
                  </div>
                  {stop.notes && <div className="text-[12px] mt-0.5">{stop.notes}</div>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button className="w-7 h-7 rounded hover:bg-surface-container flex items-center justify-center disabled:opacity-30" title="Move up" disabled={i === 0 || busy === `stop-${stop.id}`} onClick={() => void stopAction(stop, 'up')}>
                    <span className="material-symbols-outlined text-[16px]">arrow_upward</span>
                  </button>
                  <button className="w-7 h-7 rounded hover:bg-surface-container flex items-center justify-center disabled:opacity-30" title="Move down" disabled={i === stops.length - 1 || busy === `stop-${stop.id}`} onClick={() => void stopAction(stop, 'down')}>
                    <span className="material-symbols-outlined text-[16px]">arrow_downward</span>
                  </button>
                  <button className="w-7 h-7 rounded hover:bg-surface-container flex items-center justify-center" title="Prioritize stop" disabled={busy === `stop-${stop.id}`} onClick={() => void stopAction(stop, 'prioritize')}>
                    <span className="material-symbols-outlined text-[16px]">star</span>
                  </button>
                  {stop.status === 'pending' && (
                    <button className="h-7 px-2 border border-surface-dim rounded text-label-sm font-medium hover:bg-surface-container-low disabled:opacity-40" disabled={busy === `stop-${stop.id}`} onClick={() => void stopAction(stop, 'arrive')}>Mark arrived</button>
                  )}
                  {stop.status === 'arrived' && (
                    <button className="h-7 px-2 bg-primary text-white rounded text-label-sm font-semibold hover:bg-primary-container disabled:opacity-40" disabled={busy === `stop-${stop.id}`} onClick={() => void stopAction(stop, 'complete')}>Complete</button>
                  )}
                  <button className="w-7 h-7 rounded hover:bg-error/10 text-error flex items-center justify-center" title="Remove from route" disabled={busy === `stop-${stop.id}`} onClick={() => void stopAction(stop, 'remove')}>
                    <span className="material-symbols-outlined text-[16px]">delete</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
          <div className="px-4 py-3 bg-surface-container-low border-t border-surface-dim text-body-sm flex flex-wrap gap-x-6 gap-y-1">
            <span>Total stops <strong>{stops.length}</strong></span>
            <span>Depart by <strong>{fmtTime(stops[0]?.window_start)}</strong></span>
            <span>Return by <strong>{fmtTime(stops[stops.length - 1]?.window_end)}</strong></span>
            <span>Late stops <strong>{atRisk}</strong></span>
            <span className="text-on-surface-variant">Drive time & distance land when the route optimizer processes this route.</span>
          </div>
        </div>
      )}

      {/* Add stop drawer */}
      {addOpen && (
        <>
          <div className="drawer-scrim open" onClick={() => setAddOpen(false)} />
          <div className="drawer open" style={{ width: 440 }}>
            <div className="flex items-center justify-between px-6 h-14 border-b border-surface-dim shrink-0">
              <h3 className="text-[16px] font-semibold flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">add_location</span>Add stop to route
              </h3>
              <button className="w-8 h-8 rounded hover:bg-surface-container flex items-center justify-center" onClick={() => setAddOpen(false)}>
                <span className="material-symbols-outlined text-[20px]">close</span>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <p className="text-body-sm text-on-surface-variant">Pick a party, an appointment, or a manual address.</p>
              <div>
                <label className="field-label">Add from</label>
                <div className="flex gap-1">
                  {(['party', 'appointment', 'manual'] as const).map(m => (
                    <button key={m} className={`h-8 px-3 rounded text-body-md capitalize ${addMode === m ? 'bg-primary text-white font-semibold' : 'border border-surface-dim hover:bg-surface-container-low'}`} onClick={() => setAddMode(m)}>
                      {m === 'party' ? 'Party' : m === 'appointment' ? 'Appointment' : 'Manual'}
                    </button>
                  ))}
                </div>
              </div>
              {addMode === 'party' && (
                <div>
                  <label className="field-label">Search customers</label>
                  <select className="field-input" value={addPartyId} onChange={e => setAddPartyId(e.target.value)}>
                    <option value="">Select a customer…</option>
                    {parties.map(p => <option key={p.id} value={p.id}>{p.name}{p.city ? ` · ${p.city}` : ''}</option>)}
                  </select>
                </div>
              )}
              {addMode === 'appointment' && (
                <div>
                  <label className="field-label">That day&rsquo;s bookings</label>
                  <select className="field-input" value={addApptId} onChange={e => setAddApptId(e.target.value)}>
                    <option value="">Select an appointment…</option>
                    {appointments.map(a => <option key={a.id} value={a.id}>{a.appointment_number || ''} {a.title || 'Appointment'} · {fmtTime(a.starts_at)}</option>)}
                  </select>
                  {appointments.length === 0 && <p className="text-[12px] text-on-surface-variant mt-1">No appointments on this date.</p>}
                </div>
              )}
              {addMode === 'manual' && (
                <div>
                  <label className="field-label">Address</label>
                  <input className="field-input" value={addAddress} onChange={e => setAddAddress(e.target.value)} placeholder="Street, City, ST ZIP" />
                </div>
              )}
              <div>
                <label className="field-label">Stop notes</label>
                <textarea className="field-input" rows={2} value={addNotes} onChange={e => setAddNotes(e.target.value)} />
              </div>
            </div>
            <div className="px-6 py-4 border-t border-surface-dim flex justify-end gap-2 shrink-0">
              <button className="h-9 px-4 border border-surface-dim rounded text-[13px] font-medium hover:bg-surface-container-low" onClick={() => setAddOpen(false)}>Cancel</button>
              <button className="h-9 px-4 bg-primary text-white rounded text-[13px] font-semibold hover:bg-primary-container disabled:opacity-40" disabled={busy === 'add-stop'} onClick={() => void submitAdd()}>
                {busy === 'add-stop' ? 'Adding…' : 'Add stop'}
              </button>
            </div>
          </div>
        </>
      )}
    </main>
  );
}
