'use client';

/**
 * Mail — a QUICK ACTION, not a screen (Kim, 2026-11-15): the rail
 * mail icon opens this compose overlay. Pick a party, optionally
 * start from a message template (crm_message_templates), and send —
 * the message goes through POST /api/parties/[id]/email, which
 * enqueues it on the tenant's verified sender domain and writes it
 * to the party's timeline. Queued honestly: the mail worker
 * delivers it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

interface PartyOption {
  id: string;
  name: string;
  email: string | null;
  source: string;
  roles?: string[];
}

interface MailTemplate {
  id: string;
  name: string;
  subject: string | null;
  body: string;
  category: string | null;
}

export default function MailQuickAction({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [parties, setParties] = useState<PartyOption[]>([]);
  const [selected, setSelected] = useState<PartyOption | null>(null);
  const [templates, setTemplates] = useState<MailTemplate[]>([]);
  const [templateId, setTemplateId] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; error: boolean } | null>(null);
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const loadParties = useCallback(async (q: string) => {
    try {
      const r = await fetch(`/api/parties${q ? `?q=${encodeURIComponent(q)}` : ''}`);
      const j = await r.json();
      setParties(((j.data as PartyOption[]) || []).filter(p => p.email).slice(0, 8));
    } catch { /* picker stays empty */ }
  }, []);

  useEffect(() => {
    void loadParties('');
    void (async () => {
      try {
        const r = await fetch('/api/crm/templates');
        const j = await r.json();
        setTemplates((j.data as MailTemplate[]) || []);
      } catch { /* templates optional */ }
    })();
  }, [loadParties]);

  useEffect(() => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => void loadParties(query.trim()), 250);
  }, [query, loadParties]);

  function applyTemplate(id: string) {
    setTemplateId(id);
    const t = templates.find(x => x.id === id);
    if (t) {
      if (t.subject) setSubject(t.subject);
      setBody(t.body || '');
    }
  }

  async function handleSend() {
    if (!selected) { setNote({ text: 'Pick a recipient first.', error: true }); return; }
    if (!subject.trim() || !body.trim()) { setNote({ text: 'Subject and message are required.', error: true }); return; }
    setBusy(true);
    setNote(null);
    try {
      const r = await fetch(`/api/parties/${selected.id}/email?source=${encodeURIComponent(selected.source || 'crm_customers')}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject: subject.trim(), body: body.trim(), to: selected.email || undefined }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j?.error?.message || 'Send failed');
      setNote({ text: `Queued to ${j.data.to} from ${j.data.from} — the mail worker delivers it, and the message is on ${selected.name}'s timeline.`, error: false });
      setSubject('');
      setBody('');
      setTemplateId('');
    } catch (e: any) {
      setNote({ text: `Error: ${e.message}`, error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[210] flex justify-end">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative w-[440px] max-w-[92vw] h-full bg-background shadow-xl flex flex-col">
        <div className="flex items-center gap-2 px-4 h-14 border-b border-outline-variant shrink-0">
          <span className="material-symbols-outlined text-primary">mail</span>
          <div className="flex-1 min-w-0">
            <div className="text-title-sm font-semibold leading-tight">New mail</div>
            <div className="text-[11px] text-on-surface-variant leading-tight">Quick action — mail a party from a template or from scratch.</div>
          </div>
          <button className="w-8 h-8 rounded-full hover:bg-surface-container flex items-center justify-center" onClick={onClose} aria-label="Close">
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">To</label>
            {selected ? (
              <div className="mt-1 flex items-center gap-2 border border-outline-variant rounded px-2.5 py-2">
                <span className="material-symbols-outlined text-[18px] text-primary">person</span>
                <div className="flex-1 min-w-0">
                  <div className="text-body-md font-medium truncate">{selected.name}</div>
                  <div className="text-[11px] text-on-surface-variant truncate">{selected.email}</div>
                </div>
                <button className="text-[12px] text-primary font-semibold" onClick={() => setSelected(null)}>Change</button>
              </div>
            ) : (
              <>
                <input
                  className="field-input w-full mt-1"
                  placeholder="Search parties by name or email…"
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                />
                <div className="mt-1 border border-outline-variant rounded divide-y divide-outline-variant overflow-hidden">
                  {parties.length === 0 ? (
                    <div className="px-3 py-2.5 text-body-sm text-on-surface-variant">No parties with an email on file.</div>
                  ) : parties.filter(p => !query.trim() || p.name.toLowerCase().includes(query.trim().toLowerCase()) || (p.email || '').toLowerCase().includes(query.trim().toLowerCase())).map(p => (
                    <button key={p.id} className="w-full text-left px-3 py-2 hover:bg-surface-container-low" onClick={() => setSelected(p)}>
                      <div className="text-body-md font-medium truncate">{p.name}</div>
                      <div className="text-[11px] text-on-surface-variant truncate">{p.email}{p.roles && p.roles.length ? ` · ${p.roles.join(', ')}` : ''}</div>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Template</label>
            <select className="field-input w-full mt-1" value={templateId} onChange={e => applyTemplate(e.target.value)}>
              <option value="">No template — write it fresh</option>
              {templates.map(t => <option key={t.id} value={t.id}>{t.name}{t.category ? ` · ${t.category}` : ''}</option>)}
            </select>
          </div>

          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Subject</label>
            <input className="field-input w-full mt-1" value={subject} onChange={e => setSubject(e.target.value)} placeholder="Subject" />
          </div>

          <div>
            <label className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">Message</label>
            <textarea className="field-input w-full mt-1" rows={9} value={body} onChange={e => setBody(e.target.value)} placeholder="Write the message…" />
          </div>

          {note && (
            <div className={`text-body-sm rounded px-3 py-2 ${note.error ? 'bg-error-container text-on-error-container' : 'bg-primary-container text-on-primary-container'}`}>
              {note.text}
            </div>
          )}
        </div>

        <div className="p-4 border-t border-outline-variant shrink-0 flex items-center gap-2">
          <button className="h-9 px-4 rounded bg-primary text-white text-body-md font-semibold disabled:opacity-50" disabled={busy} onClick={() => void handleSend()}>
            {busy ? 'Sending…' : 'Send mail'}
          </button>
          <button className="h-9 px-3 rounded text-body-md hover:bg-surface-container" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
