'use client';

import { useEffect, useState } from 'react';
import { DemoRow } from '@/data/shellData';
import StatusPill from './StatusPill';
import { platformActions } from '@/hooks/usePlatformApi';
import styles from './PeekDrawer.module.css';

interface PeekDrawerProps {
  open: boolean;
  row: DemoRow | null;
  onClose: () => void;
  onOpenFull: () => void;
  onToast?: (message: string) => void;
}

interface ActivityItem { id: string; who: string; what: string; when: string }
interface CustomFieldValue {
  fieldId: string; key: string; label: string; type: string;
  options: unknown; required: boolean; helpText: string | null;
  value: string | number | boolean | null;
}

/**
 * The right-hand drawer. Beyond the row's own fields it carries two
 * platform sections, both live:
 *  - Activity: this record's timeline from platform_audit_events
 *    (GET /api/platform/activity?table=&id=).
 *  - Custom fields: the entity type's platform_custom_fields with
 *    this record's platform_custom_field_values; saving runs the
 *    registry action custom_fields.set.
 * The record's table travels on the row as __table (set by the list
 * that opened the peek); without it both sections stay hidden.
 */
export default function PeekDrawer({ open, row, onClose, onOpenFull, onToast }: PeekDrawerProps) {
  const title = row
    ? row.no
      ? `Invoice #${row.no}`
      : String(
          row.title ||
            row.name ||
            row.seller ||
            row.dimension ||
            row.code ||
            row.vendor ||
            row.payee ||
            row.holder ||
            row.event ||
            'Record'
        )
    : 'Invoice #1002';

  const fields = row
    ? Object.entries(row).filter(([k]) => k !== 'status' && k !== 'id' && k !== '__table')
    : [];

  const table = row && typeof row.__table === 'string' ? row.__table : null;
  const recordId = row && typeof row.id === 'string' ? row.id : null;

  const [activity, setActivity] = useState<ActivityItem[] | null>(null);

  // Party summary (CRM pack): when the peeked record belongs to a
  // customer (an order, an invoice, a ticket…), show the party's open
  // balance, last order and open tickets right here — the numbers
  // come from the party API, computed from the live tables.
  const partyRef = row
    ? ((row as any).customer_id || (row as any).customerId || (row as any).partyId ||
       (row as any).requester_customer_id || (row as any).crm_customer_id || null) as string | null
    : null;
  const [partyInfo, setPartyInfo] = useState<{
    name: string;
    financials: { openBalance: number; openInvoiceCount: number; lastOrder: { ref: string; at: string; total: number } | null; openTickets: number };
  } | null>(null);

  useEffect(() => {
    if (!open || !partyRef) {
      setPartyInfo(null);
      return;
    }
    let cancelled = false;
    fetch(`/api/parties/${partyRef}?source=crm_customers`)
      .then((r) => r.json())
      .then((j) => {
        if (!cancelled && j.data?.financials) {
          setPartyInfo({ name: j.data.name, financials: j.data.financials });
        }
      })
      .catch(() => { if (!cancelled) setPartyInfo(null); });
    return () => { cancelled = true; };
  }, [open, partyRef]);
  const [customFields, setCustomFields] = useState<CustomFieldValue[]>([]);
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<{ text: string; error: boolean } | null>(null);

  useEffect(() => {
    if (!open || !table || !recordId) {
      setActivity(null);
      setCustomFields([]);
      return;
    }
    let cancelled = false;
    fetch(`/api/platform/activity?table=${encodeURIComponent(table)}&id=${encodeURIComponent(recordId)}`)
      .then((r) => r.json())
      .then((j) => { if (!cancelled) setActivity((j.data as ActivityItem[]) || []); })
      .catch(() => { if (!cancelled) setActivity([]); });
    fetch(`/api/platform/customization?kind=values&entityType=${encodeURIComponent(table)}&entityId=${encodeURIComponent(recordId)}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        const defs = (j.data as CustomFieldValue[]) || [];
        setCustomFields(defs);
        setDraft(Object.fromEntries(defs.map((d) => [d.key, d.value === null || d.value === undefined ? '' : String(d.value)])));
      })
      .catch(() => { if (!cancelled) setCustomFields([]); });
    return () => { cancelled = true; };
  }, [open, table, recordId]);

  const saveCustomFields = async () => {
    if (!table || !recordId) return;
    const values: Record<string, unknown> = {};
    for (const f of customFields) {
      const raw = draft[f.key] ?? '';
      if (f.type === 'number' || f.type === 'currency' || f.type === 'percent') values[f.key] = raw === '' ? null : Number(raw);
      else if (f.type === 'checkbox' || f.type === 'boolean') values[f.key] = raw === 'true';
      else values[f.key] = raw === '' ? null : raw;
    }
    setSaving(true);
    const res = await platformActions.setCustomFields(table, recordId, values);
    setSaving(false);
    setSaveMsg(res.ok ? { text: 'Saved', error: false } : { text: res.error || 'Could not save custom fields', error: true });
  };

  return (
    <div id="peek" className={`${styles.peek} ${open ? styles.open : ''}`}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={`material-symbols-outlined ${styles.icon18Muted}`}>receipt_long</span>
          <span id="peek-title" className={styles.title}>
            {title}
          </span>
        </div>
        <div className={styles.headerRight}>
          <button
            id="peek-open-full"
            type="button"
            className={styles.openFullBtn}
            onClick={onOpenFull}
          >
            <span className={`material-symbols-outlined ${styles.icon14}`}>open_in_full</span>
            Open full
          </button>
          <button
            id="peek-close"
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
          >
            <span className={`material-symbols-outlined ${styles.icon18}`}>close</span>
          </button>
        </div>
      </div>
      <div id="peek-body" className={styles.body}>
        {row && (
          <>
            <div className={styles.statusRow}>
              {row.status ? <StatusPill status={String(row.status)} /> : null}
            </div>
            <dl className={styles.fieldList}>
              {fields.map(([k, v]) => (
                <div key={k} className={styles.fieldRow}>
                  <dt className={styles.fieldKey}>{k}</dt>
                  <dd className={styles.fieldVal}>{String(v)}</dd>
                </div>
              ))}
            </dl>
            {partyInfo && (
              <div className={styles.section}>
                <h3 className={styles.sectionHeading}>Customer</h3>
                <dl>
                  <div className={styles.fieldRow}>
                    <dt className={styles.fieldKey}>Name</dt>
                    <dd className={styles.fieldVal}>{partyInfo.name}</dd>
                  </div>
                  <div className={styles.fieldRow}>
                    <dt className={styles.fieldKey}>Open balance</dt>
                    <dd className={styles.fieldVal}>
                      ${partyInfo.financials.openBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      {partyInfo.financials.openInvoiceCount > 0 && ` · ${partyInfo.financials.openInvoiceCount} open invoice${partyInfo.financials.openInvoiceCount === 1 ? '' : 's'}`}
                    </dd>
                  </div>
                  <div className={styles.fieldRow}>
                    <dt className={styles.fieldKey}>Last order</dt>
                    <dd className={styles.fieldVal}>
                      {partyInfo.financials.lastOrder
                        ? `${partyInfo.financials.lastOrder.ref} · ${new Date(partyInfo.financials.lastOrder.at).toLocaleDateString()} · $${partyInfo.financials.lastOrder.total.toLocaleString('en-US', { minimumFractionDigits: 2 })}`
                        : '—'}
                    </dd>
                  </div>
                  <div className={styles.fieldRow}>
                    <dt className={styles.fieldKey}>Open tickets</dt>
                    <dd className={styles.fieldVal}>{partyInfo.financials.openTickets}</dd>
                  </div>
                </dl>
              </div>
            )}
            {table && recordId && (
              <div className={styles.section}>
                <h3 className={styles.sectionHeading}>Activity</h3>
                <div className={styles.activityList}>
                  {activity === null && (
                    <div className={styles.activityItem}>Loading…</div>
                  )}
                  {activity !== null && activity.length === 0 && (
                    <div className={styles.activityItem}>No activity recorded for this record yet.</div>
                  )}
                  {(activity || []).map((a) => (
                    <div key={a.id} className={styles.activityItem}>
                      <span className={`material-symbols-outlined ${styles.icon14}`}>check_circle</span>
                      {a.what} · {new Date(a.when).toLocaleString()}
                    </div>
                  ))}
                </div>
              </div>
            )}
            {customFields.length > 0 && (
              <div className={styles.section}>
                <h3 className={styles.sectionHeading}>Custom fields</h3>
                {customFields.map((f) => (
                  <div key={f.fieldId} style={{ marginBottom: 10 }}>
                    <label
                      htmlFor={`peek-cf-${f.key}`}
                      style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}
                    >
                      {f.label}{f.required ? ' *' : ''}
                    </label>
                    {f.type === 'checkbox' || f.type === 'boolean' ? (
                      <input
                        id={`peek-cf-${f.key}`}
                        type="checkbox"
                        checked={(draft[f.key] ?? '') === 'true'}
                        onChange={(e) => setDraft((prev) => ({ ...prev, [f.key]: e.target.checked ? 'true' : 'false' }))}
                      />
                    ) : f.type === 'select' && Array.isArray(f.options) ? (
                      <select
                        id={`peek-cf-${f.key}`}
                        className={styles.noteInput}
                        value={draft[f.key] ?? ''}
                        onChange={(e) => setDraft((prev) => ({ ...prev, [f.key]: e.target.value }))}
                      >
                        <option value="">—</option>
                        {(f.options as unknown[]).map((o) => {
                          const v = typeof o === 'object' && o !== null ? String((o as { value?: unknown }).value ?? '') : String(o);
                          return <option key={v} value={v}>{v}</option>;
                        })}
                      </select>
                    ) : (
                      <input
                        id={`peek-cf-${f.key}`}
                        type={f.type === 'number' || f.type === 'currency' || f.type === 'percent' ? 'number' : 'text'}
                        className={styles.noteInput}
                        value={draft[f.key] ?? ''}
                        onChange={(e) => setDraft((prev) => ({ ...prev, [f.key]: e.target.value }))}
                        placeholder={f.helpText || ''}
                      />
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  className={styles.openFullBtn}
                  disabled={saving}
                  onClick={() => void saveCustomFields()}
                >
                  {saving ? 'Saving…' : 'Save custom fields'}
                </button>
                {saveMsg && (
                  <span role="status" style={{ marginLeft: 10, fontSize: 12, color: saveMsg.error ? '#b3261e' : '#2e7d32' }}>
                    {saveMsg.text}
                  </span>
                )}
              </div>
            )}
            <div className={styles.section}>
              <h3 className={styles.sectionHeading}>Notes &amp; tasks</h3>
              <textarea className={styles.noteInput} placeholder="Add a note…" />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
