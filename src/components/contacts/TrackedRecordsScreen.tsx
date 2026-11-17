/* Tracked records — dependents (children, pets, …) attached to a customer,
   with each dependent's event timeline (crm_record_events: status changes,
   vaccinations, appointments, any dated event). SHIP-IT__115: the
   tracked-records + events screens. Live on /api/crm/dependents and
   /api/crm/record-events; no mock rows anywhere.
   Record-associated children (CRM pack): the record's TYPE comes from
   crm_record_types (drives the type + event-type pickers when the
   tenant has types configured) and its RELATED PARTIES come from
   crm_record_parties — both through the generic data route. */
import { useEffect, useState } from 'react';

interface DependentRow {
  id: string;
  primary_customer_id: string;
  dependent_type: string;
  name: string;
  date_of_birth: string | null;
  notes: string | null;
  is_active: boolean;
  created_at: string;
}

interface RecordEventRow {
  id: string;
  dependent_id: string;
  event_type: string;
  occurred_at: string;
  reference_number: string | null;
  status_from: string | null;
  status_to: string | null;
  amount: number | null;
  appointment_id: string | null;
}

interface CustomerRow {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company_name: string | null;
  email: string | null;
}

function customerName(c: CustomerRow): string {
  return [c.first_name, c.last_name].filter(Boolean).join(' ') || c.company_name || c.email || c.id.slice(0, 8);
}

const DEPENDENT_TYPES = ['child', 'pet', 'spouse', 'parent', 'other'];
const EVENT_TYPES = ['status_change', 'vaccination', 'appointment', 'note', 'other'];

interface RecordTypeRow {
  id: string;
  code: string;
  label: string;
  dependent_type: string | null;
  event_types: string[] | null;
  is_active: boolean;
}

interface RecordPartyRow {
  id: string;
  dependent_id: string;
  customer_id: string;
  role: string | null;
  is_primary: boolean;
  starts_on: string | null;
  ends_on: string | null;
}

export default function TrackedRecordsScreen({ onToast }: { onToast: (m: string) => void }) {
  const [dependents, setDependents] = useState<DependentRow[]>([]);
  const [customers, setCustomers] = useState<CustomerRow[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [events, setEvents] = useState<RecordEventRow[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [showAddEvent, setShowAddEvent] = useState(false);

  // Add-dependent form
  const [newCustomerId, setNewCustomerId] = useState('');
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState('child');
  const [newDob, setNewDob] = useState('');
  const [newNotes, setNewNotes] = useState('');

  // Add-event form
  const [evType, setEvType] = useState('note');
  const [evDate, setEvDate] = useState('');
  const [evRef, setEvRef] = useState('');
  const [evAmount, setEvAmount] = useState('');

  // Record types + related parties (record-associated children)
  const [recordTypes, setRecordTypes] = useState<RecordTypeRow[]>([]);
  const [relatedParties, setRelatedParties] = useState<RecordPartyRow[]>([]);
  const [showAddParty, setShowAddParty] = useState(false);
  const [rpCustomerId, setRpCustomerId] = useState('');
  const [rpRole, setRpRole] = useState('');
  const [rpPrimary, setRpPrimary] = useState(false);

  const customerById = new Map(customers.map((c) => [c.id, c]));
  const selected = dependents.find((d) => d.id === selectedId) || null;

  async function loadDependents(selectId?: string) {
    const [dRes, cRes] = await Promise.all([
      fetch('/api/crm/dependents'),
      fetch('/api/crm/customers?limit=200'),
    ]);
    const dJson = await dRes.json().catch(() => null);
    const cJson = await cRes.json().catch(() => null);
    const rows = (dJson?.data ?? []) as DependentRow[];
    setDependents(rows);
    setCustomers((cJson?.data ?? []) as CustomerRow[]);
    setLoaded(true);
    const pick = selectId || rows[0]?.id || null;
    setSelectedId(pick);
    if (pick) { void loadEvents(pick); void loadRelatedParties(pick); }
  }

  async function loadEvents(dependentId: string) {
    const res = await fetch(`/api/crm/record-events?dependent_id=${dependentId}`);
    const json = await res.json().catch(() => null);
    setEvents((json?.data ?? []) as RecordEventRow[]);
  }

  async function loadRecordTypes() {
    const res = await fetch('/api/crm/data/crm_record_types?is_active=true');
    const json = await res.json().catch(() => null);
    setRecordTypes(((json?.data ?? []) as RecordTypeRow[]));
  }

  async function loadRelatedParties(dependentId: string) {
    const res = await fetch(`/api/crm/data/crm_record_parties?dependent_id=${dependentId}`);
    const json = await res.json().catch(() => null);
    setRelatedParties(((json?.data ?? []) as RecordPartyRow[]));
  }

  useEffect(() => { void loadDependents(); void loadRecordTypes(); }, []);

  function selectDependent(id: string) {
    setSelectedId(id);
    setShowAddEvent(false);
    setShowAddParty(false);
    void loadEvents(id);
    void loadRelatedParties(id);
  }

  async function handleAddParty(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId || !rpCustomerId) { onToast('Pick a party to link first'); return; }
    const res = await fetch('/api/crm/data/crm_record_parties', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dependent_id: selectedId,
        customer_id: rpCustomerId,
        role: rpRole.trim() || null,
        is_primary: rpPrimary,
      }),
    });
    if (!res.ok) { onToast('Could not link that party'); return; }
    onToast('Party linked to this record');
    setShowAddParty(false);
    setRpCustomerId(''); setRpRole(''); setRpPrimary(false);
    await loadRelatedParties(selectedId);
  }

  async function handleAddDependent(e: React.FormEvent) {
    e.preventDefault();
    if (!newCustomerId || !newName.trim()) { onToast('Pick a customer and a name first'); return; }
    const res = await fetch('/api/crm/dependents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        primary_customer_id: newCustomerId,
        name: newName.trim(),
        dependent_type: newType,
        date_of_birth: newDob || null,
        notes: newNotes.trim() || null,
      }),
    });
    if (!res.ok) { onToast('Could not add that dependent'); return; }
    const json = await res.json().catch(() => null);
    onToast(`Dependent ${newName.trim()} added`);
    setShowAdd(false);
    setNewName(''); setNewDob(''); setNewNotes('');
    await loadDependents(json?.data?.id);
  }

  async function handleAddEvent(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId) return;
    const res = await fetch('/api/crm/record-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        dependent_id: selectedId,
        event_type: evType,
        occurred_at: evDate ? new Date(evDate).toISOString() : undefined,
        reference_number: evRef.trim() || null,
        amount: evAmount ? Number(evAmount) : null,
      }),
    });
    if (!res.ok) { onToast('Could not add that event'); return; }
    onToast('Event added to the timeline');
    setShowAddEvent(false);
    setEvRef(''); setEvAmount(''); setEvDate('');
    await loadEvents(selectedId);
  }

  return (
    <main className="px-6 pb-12 flex flex-col h-full">
      <div className="flex items-center justify-between py-4">
        <div>
          <h1 className="text-headline-lg">Tracked records</h1>
          <p className="text-body-sm text-on-surface-variant mt-0.5">From Supabase crm_dependents · {dependents.length} records · each with its event timeline</p>
        </div>
        <button className="h-8 px-3 bg-primary text-white text-body-md font-semibold rounded hover:bg-primary-container flex items-center gap-1" onClick={() => setShowAdd(!showAdd)}>
          <span className="material-symbols-outlined text-[16px]">add</span>Add dependent
        </button>
      </div>

      {showAdd && (
        <form onSubmit={handleAddDependent} className="border border-outline-variant rounded-lg bg-white p-4 mb-3 grid grid-cols-2 gap-3">
          <label className="text-body-sm">Customer
            <select className="mt-1 w-full h-9 border border-surface-dim rounded px-2" value={newCustomerId} onChange={(e) => setNewCustomerId(e.target.value)}>
              <option value="">Pick a customer…</option>
              {customers.map((c) => (<option key={c.id} value={c.id}>{customerName(c)}</option>))}
            </select>
          </label>
          <label className="text-body-sm">Name
            <input className="mt-1 w-full h-9 border border-surface-dim rounded px-2" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Dependent name" />
          </label>
          <label className="text-body-sm">Type
            <select className="mt-1 w-full h-9 border border-surface-dim rounded px-2" value={newType} onChange={(e) => setNewType(e.target.value)}>
              {recordTypes.length > 0
                ? recordTypes.map((t) => (<option key={t.id} value={t.dependent_type || t.code}>{t.label}</option>))
                : DEPENDENT_TYPES.map((t) => (<option key={t} value={t}>{t}</option>))}
            </select>
          </label>
          <label className="text-body-sm">Date of birth
            <input type="date" className="mt-1 w-full h-9 border border-surface-dim rounded px-2" value={newDob} onChange={(e) => setNewDob(e.target.value)} />
          </label>
          <label className="text-body-sm col-span-2">Notes
            <input className="mt-1 w-full h-9 border border-surface-dim rounded px-2" value={newNotes} onChange={(e) => setNewNotes(e.target.value)} placeholder="Optional notes" />
          </label>
          <div className="col-span-2 flex gap-2">
            <button type="submit" className="h-8 px-3 bg-primary text-white text-body-md font-semibold rounded">Save dependent</button>
            <button type="button" className="h-8 px-3 border border-surface-dim rounded" onClick={() => setShowAdd(false)}>Cancel</button>
          </div>
        </form>
      )}

      {!loaded ? (
        <p className="text-body-md text-on-surface-variant py-8">Loading records…</p>
      ) : dependents.length === 0 ? (
        <div className="border border-outline-variant rounded-lg bg-white p-8 text-center">
          <p className="text-body-lg font-semibold">No tracked records yet</p>
          <p className="text-body-sm text-on-surface-variant mt-1">Add a dependent — a child, a pet, anyone whose events you track against a customer.</p>
        </div>
      ) : (
        <div className="grid grid-cols-[320px_1fr] gap-4 items-start">
          <div className="border border-outline-variant rounded-lg bg-white overflow-hidden">
            {dependents.map((d) => {
              const c = customerById.get(d.primary_customer_id);
              const active = d.id === selectedId;
              return (
                <button key={d.id} type="button" onClick={() => selectDependent(d.id)} className={`w-full text-left px-4 py-3 border-b border-outline-variant last:border-b-0 ${active ? 'bg-primary-container/20' : 'hover:bg-surface-container-low'}`}>
                  <div className="text-body-md font-semibold">{d.name}</div>
                  <div className="text-body-sm text-on-surface-variant">{d.dependent_type} · {c ? customerName(c) : d.primary_customer_id.slice(0, 8)} · {d.is_active ? 'active' : 'inactive'}</div>
                </button>
              );
            })}
          </div>

          <div className="border border-outline-variant rounded-lg bg-white p-4">
            {selected ? (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-headline-sm">{selected.name}</h2>
                    <p className="text-body-sm text-on-surface-variant">{selected.dependent_type} · {customerById.get(selected.primary_customer_id) ? customerName(customerById.get(selected.primary_customer_id)!) : ''}{selected.date_of_birth ? ` · born ${selected.date_of_birth}` : ''}</p>
                    {selected.notes && <p className="text-body-sm mt-1">{selected.notes}</p>}
                  </div>
                  <button className="h-8 px-3 border border-surface-dim rounded text-body-md font-semibold flex items-center gap-1" onClick={() => setShowAddEvent(!showAddEvent)}>
                    <span className="material-symbols-outlined text-[16px]">add</span>Add event
                  </button>
                </div>

                {showAddEvent && (
                  <form onSubmit={handleAddEvent} className="border border-outline-variant rounded-lg p-3 mt-3 grid grid-cols-2 gap-3 bg-surface-container-low/50">
                    <label className="text-body-sm">Event type
                      <select className="mt-1 w-full h-9 border border-surface-dim rounded px-2 bg-white" value={evType} onChange={(e) => setEvType(e.target.value)}>
                        {(recordTypes.find((t) => (t.dependent_type || t.code) === selected.dependent_type)?.event_types?.length
                          ? recordTypes.find((t) => (t.dependent_type || t.code) === selected.dependent_type)!.event_types!
                          : EVENT_TYPES).map((t) => (<option key={t} value={t}>{t}</option>))}
                      </select>
                    </label>
                    <label className="text-body-sm">Date
                      <input type="date" className="mt-1 w-full h-9 border border-surface-dim rounded px-2 bg-white" value={evDate} onChange={(e) => setEvDate(e.target.value)} />
                    </label>
                    <label className="text-body-sm">Reference
                      <input className="mt-1 w-full h-9 border border-surface-dim rounded px-2 bg-white" value={evRef} onChange={(e) => setEvRef(e.target.value)} placeholder="Reference number (optional)" />
                    </label>
                    <label className="text-body-sm">Amount
                      <input className="mt-1 w-full h-9 border border-surface-dim rounded px-2 bg-white" value={evAmount} onChange={(e) => setEvAmount(e.target.value)} placeholder="0.00" inputMode="decimal" />
                    </label>
                    <div className="col-span-2 flex gap-2">
                      <button type="submit" className="h-8 px-3 bg-primary text-white text-body-md font-semibold rounded">Save event</button>
                      <button type="button" className="h-8 px-3 border border-surface-dim rounded bg-white" onClick={() => setShowAddEvent(false)}>Cancel</button>
                    </div>
                  </form>
                )}

                <div className="mt-4 border-t border-outline-variant pt-3">
                  <div className="flex items-center justify-between">
                    <h3 className="text-body-md font-semibold">Related parties</h3>
                    <button type="button" className="h-7 px-2 border border-surface-dim rounded text-body-sm font-semibold flex items-center gap-1" onClick={() => setShowAddParty(!showAddParty)}>
                      <span className="material-symbols-outlined text-[14px]">add</span>Link party
                    </button>
                  </div>
                  <div className="mt-2 space-y-1">
                    <div className="text-body-md flex items-center gap-2">
                      <span>{customerById.get(selected.primary_customer_id) ? customerName(customerById.get(selected.primary_customer_id)!) : selected.primary_customer_id.slice(0, 8)}</span>
                      <span className="pill tag">primary</span>
                    </div>
                    {relatedParties.filter((rp) => rp.customer_id !== selected.primary_customer_id).map((rp) => (
                      <div key={rp.id} className="text-body-md flex items-center gap-2">
                        <span>{customerById.get(rp.customer_id) ? customerName(customerById.get(rp.customer_id)!) : rp.customer_id.slice(0, 8)}</span>
                        {rp.role && <span className="pill tag">{rp.role}</span>}
                        {rp.is_primary && <span className="pill tag">primary</span>}
                        {(rp.starts_on || rp.ends_on) && <span className="text-body-sm text-on-surface-variant">{rp.starts_on || ''}{rp.ends_on ? ` → ${rp.ends_on}` : ''}</span>}
                      </div>
                    ))}
                    {relatedParties.length === 0 && <p className="text-body-sm text-on-surface-variant">No other parties linked to this record yet.</p>}
                  </div>
                  {showAddParty && (
                    <form onSubmit={handleAddParty} className="border border-outline-variant rounded-lg p-3 mt-3 grid grid-cols-2 gap-3 bg-surface-container-low/50">
                      <label className="text-body-sm">Party
                        <select className="mt-1 w-full h-9 border border-surface-dim rounded px-2 bg-white" value={rpCustomerId} onChange={(e) => setRpCustomerId(e.target.value)}>
                          <option value="">Pick a customer…</option>
                          {customers.map((c) => (<option key={c.id} value={c.id}>{customerName(c)}</option>))}
                        </select>
                      </label>
                      <label className="text-body-sm">Role
                        <input className="mt-1 w-full h-9 border border-surface-dim rounded px-2 bg-white" value={rpRole} onChange={(e) => setRpRole(e.target.value)} placeholder="e.g. guardian, vet, co-owner" />
                      </label>
                      <label className="text-body-sm flex items-center gap-2">
                        <input type="checkbox" checked={rpPrimary} onChange={(e) => setRpPrimary(e.target.checked)} /> Primary contact
                      </label>
                      <div className="flex gap-2 items-end justify-end">
                        <button type="submit" className="h-8 px-3 bg-primary text-white text-body-md font-semibold rounded">Link party</button>
                        <button type="button" className="h-8 px-3 border border-surface-dim rounded bg-white" onClick={() => setShowAddParty(false)}>Cancel</button>
                      </div>
                    </form>
                  )}
                </div>

                <div className="mt-4">
                  {events.length === 0 ? (
                    <p className="text-body-md text-on-surface-variant py-4">No events yet for {selected.name} — add the first one above.</p>
                  ) : (
                    <table className="w-full text-left">
                      <thead>
                        <tr className="text-body-sm text-on-surface-variant border-b border-outline-variant">
                          <th className="py-2 pr-2 font-semibold">Date</th>
                          <th className="py-2 pr-2 font-semibold">Event</th>
                          <th className="py-2 pr-2 font-semibold">Reference</th>
                          <th className="py-2 font-semibold text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {events.map((ev) => (
                          <tr key={ev.id} className="border-b border-outline-variant last:border-b-0 text-body-md">
                            <td className="py-2 pr-2">{ev.occurred_at ? new Date(ev.occurred_at).toLocaleDateString() : '—'}</td>
                            <td className="py-2 pr-2">{ev.event_type}{ev.status_from || ev.status_to ? ` (${ev.status_from || ''} → ${ev.status_to || ''})` : ''}</td>
                            <td className="py-2 pr-2">{ev.reference_number || '—'}</td>
                            <td className="py-2 text-right">{ev.amount != null ? `$${Number(ev.amount).toFixed(2)}` : '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              </>
            ) : (
              <p className="text-body-md text-on-surface-variant py-4">Pick a record on the left to see its timeline.</p>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
