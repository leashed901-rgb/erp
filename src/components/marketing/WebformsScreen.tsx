'use client';
/* WebformsScreen — Marketing/Webforms + Webforms/Submissions (doc 24).
   No HTML mockup exists for this screen; it follows the house list +
   drawer pattern (NewsletterScreen): list of platform_webforms, builder
   drawer (name/slug/creates/fields), and a submissions inbox drawer
   (platform_webform_submissions → lead created by the submit RPC).
   Public form lives at /f/[slug]. */
import { useEffect, useMemo, useState } from 'react';
import { fetchWebformDetail, useWebforms, webformMutations } from '@/hooks/useMarketingApi';
import type { Webform, WebformSubmission } from '@/lib/marketingTypes';
import { exportToCsv } from '@/lib/csvExport';

interface MarketingScreenProps {
  onToast: (msg: string) => void;
  onNavigate?: (domain: import('@/data/shellData').DomainKey, screenId: string) => void;
}

interface FieldDraft {
  key: string;
  label: string;
  type: string;
  required: boolean;
}

const FIELD_TYPES = ['text', 'email', 'phone', 'textarea'] as const;
const DEFAULT_FIELDS: FieldDraft[] = [
  { key: 'name', label: 'Name', type: 'text', required: true },
  { key: 'email', label: 'Email', type: 'email', required: true },
  { key: 'phone', label: 'Phone', type: 'phone', required: false },
  { key: 'message', label: 'Message', type: 'textarea', required: false },
];

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function fmt(iso: string) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function WebformsScreen({ onToast }: MarketingScreenProps) {
  const { webforms, loading, error, refresh, setWebforms } = useWebforms();
  const [q, setQ] = useState('');
  const [tab, setTab] = useState('All');
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editing, setEditing] = useState<Webform | null>(null);
  const [detail, setDetail] = useState<Webform | null>(null);
  const [submissions, setSubmissions] = useState<WebformSubmission[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');

  // builder state
  const [formName, setFormName] = useState('');
  const [formSlug, setFormSlug] = useState('');
  const [formCreates, setFormCreates] = useState('lead');
  const [formSuccess, setFormSuccess] = useState('');
  const [formFields, setFormFields] = useState<FieldDraft[]>(DEFAULT_FIELDS);
  const [newFieldKey, setNewFieldKey] = useState('');
  const [newFieldLabel, setNewFieldLabel] = useState('');
  const [newFieldType, setNewFieldType] = useState('text');
  const [newFieldRequired, setNewFieldRequired] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const items = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return webforms.filter((f) => {
      if (tab === 'Active' && !f.isActive) return false;
      if (tab === 'Inactive' && f.isActive) return false;
      if (needle && !`${f.name} ${f.slug}`.toLowerCase().includes(needle)) return false;
      return true;
    });
  }, [webforms, q, tab]);

  const openNew = () => {
    setEditing(null);
    setFormName('');
    setFormSlug('');
    setFormCreates('lead');
    setFormSuccess('');
    setFormFields(DEFAULT_FIELDS);
    setFormError('');
    setDrawerOpen(true);
  };

  const openEdit = (f: Webform) => {
    setEditing(f);
    setFormName(f.name);
    setFormSlug(f.slug);
    setFormCreates(f.creates || 'lead');
    setFormSuccess(f.successMessage || '');
    setFormFields(
      (f.fields as FieldDraft[]).length
        ? (f.fields as FieldDraft[]).map((fld) => ({
            key: String(fld.key || ''),
            label: String(fld.label || fld.key || ''),
            type: String(fld.type || 'text'),
            required: Boolean(fld.required),
          }))
        : DEFAULT_FIELDS,
    );
    setFormError('');
    setDrawerOpen(true);
  };

  const openDetail = async (f: Webform) => {
    setDetail(f);
    setDetailLoading(true);
    const res = await fetchWebformDetail(f.id);
    if (res.ok && res.data) setSubmissions(res.data.submissions);
    else setSubmissions([]);
    setDetailLoading(false);
  };

  const addField = () => {
    const key = slugify(newFieldKey || newFieldLabel);
    if (!key || !newFieldLabel.trim()) return;
    if (formFields.some((fld) => fld.key === key)) {
      setFormError(`Field key "${key}" already exists.`);
      return;
    }
    setFormFields([...formFields, { key, label: newFieldLabel.trim(), type: newFieldType, required: newFieldRequired }]);
    setNewFieldKey('');
    setNewFieldLabel('');
    setNewFieldRequired(false);
    setFormError('');
  };

  const saveForm = async () => {
    if (!formName.trim()) {
      setFormError('Name is required.');
      return;
    }
    if (!formFields.length) {
      setFormError('Add at least one field.');
      return;
    }
    setSaving(true);
    setFormError('');
    const payload = {
      name: formName.trim(),
      slug: slugify(formSlug || formName),
      creates: formCreates,
      fields: formFields,
      successMessage: formSuccess.trim() || undefined,
    };
    const res = editing ? await webformMutations.update(editing.id, payload) : await webformMutations.create(payload);
    setSaving(false);
    if (!res.ok || !res.data) {
      setFormError(res.error || 'Save failed.');
      return;
    }
    setWebforms(editing ? webforms.map((f) => (f.id === editing.id ? res.data! : f)) : [res.data!, ...webforms]);
    setDrawerOpen(false);
    onToast(editing ? 'Webform updated.' : 'Webform created.');
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    const res = await webformMutations.remove(deleteId);
    if (!res.ok) {
      onToast(res.error || 'Delete failed.');
      setDeleteId(null);
      return;
    }
    setWebforms(webforms.filter((f) => f.id !== deleteId));
    if (detail?.id === deleteId) setDetail(null);
    setDeleteId(null);
    onToast('Webform deleted.');
  };

  const publicUrl = (f: Webform) => (typeof window === 'undefined' ? `/f/${f.slug}` : `${window.location.origin}/f/${f.slug}`);

  const copyLink = async (f: Webform) => {
    try {
      await navigator.clipboard.writeText(publicUrl(f));
      onToast('Public link copied.');
    } catch {
      onToast(publicUrl(f));
    }
  };

  return (
    <div className="min-h-full bg-white p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Webforms</h1>
          <p className="mt-1 text-sm text-gray-500">
            Public forms that create leads. A submission lands in the inbox below and creates a lead in the CRM.
          </p>
        </div>
        <button
          type="button"
          onClick={openNew}
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700"
        >
          New webform
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Couldn&apos;t load webforms: {error}{' '}
          <button type="button" className="underline" onClick={() => void refresh()}>
            Retry
          </button>
        </div>
      )}

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {['All', 'Active', 'Inactive'].map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`rounded-full px-3 py-1 text-sm ${tab === t ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          >
            {t}
          </button>
        ))}
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search forms"
          aria-label="Search webforms"
          className="ml-auto w-64 rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
        <button
          type="button"
          onClick={() => exportToCsv(items.map((f) => ({ name: f.name, slug: f.slug, creates: f.creates, fields: f.fields.length, active: f.isActive })), [{ key: 'name', label: 'Name' }, { key: 'slug', label: 'Slug' }, { key: 'creates', label: 'Creates' }, { key: 'fields', label: 'Fields' }, { key: 'active', label: 'Active' }], `webforms-${new Date().toISOString().slice(0, 10)}`)}
          className="rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-700"
        >
          Export CSV
        </button>
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-gray-200">
        <table className="w-full text-left text-sm">
          <thead className="bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-4 py-3">Form</th>
              <th className="px-4 py-3">Public link</th>
              <th className="px-4 py-3">Creates</th>
              <th className="px-4 py-3">Fields</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  Loading webforms…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  No webforms yet. Create one — its public link works the moment you save it.
                </td>
              </tr>
            ) : (
              items.map((f) => (
                <tr key={f.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <button type="button" className="font-medium text-gray-900 underline-offset-2 hover:underline" onClick={() => void openDetail(f)}>
                      {f.name}
                    </button>
                    <div className="text-xs text-gray-500">/{f.slug}</div>
                  </td>
                  <td className="px-4 py-3">
                    <button type="button" className="text-xs text-blue-700 underline-offset-2 hover:underline" onClick={() => void copyLink(f)}>
                      Copy link
                    </button>{' '}
                    <a href={publicUrl(f)} target="_blank" rel="noreferrer" className="text-xs text-blue-700 underline-offset-2 hover:underline">
                      Open
                    </a>
                  </td>
                  <td className="px-4 py-3 capitalize">{f.creates || '—'}</td>
                  <td className="px-4 py-3">{f.fields.length}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2 py-0.5 text-xs ${f.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>
                      {f.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-500">{fmt(f.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <button type="button" className="mr-3 text-sm text-gray-700 underline-offset-2 hover:underline" onClick={() => openEdit(f)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="text-sm text-gray-700 underline-offset-2 hover:underline"
                      onClick={async () => {
                        const res = await webformMutations.update(f.id, { isActive: !f.isActive });
                        if (res.ok && res.data) setWebforms(webforms.map((w) => (w.id === f.id ? res.data! : w)));
                        else onToast(res.error || 'Update failed.');
                      }}
                    >
                      {f.isActive ? 'Deactivate' : 'Activate'}
                    </button>{' '}
                    <button type="button" className="ml-3 text-sm text-red-600 underline-offset-2 hover:underline" onClick={() => setDeleteId(f.id)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ── Builder drawer ── */}
      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30" role="dialog" aria-label={editing ? 'Edit webform' : 'New webform'}>
          <div className="h-full w-full max-w-xl overflow-y-auto bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between">
              <h2 className="text-lg font-semibold text-gray-900">{editing ? 'Edit webform' : 'New webform'}</h2>
              <button type="button" aria-label="Close" className="text-xl text-gray-500" onClick={() => setDrawerOpen(false)}>
                ×
              </button>
            </div>
            {formError && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{formError}</div>}
            <label className="mt-4 block text-sm font-medium text-gray-700" htmlFor="wf-name">
              Name
            </label>
            <input
              id="wf-name"
              value={formName}
              onChange={(e) => {
                setFormName(e.target.value);
                if (!editing) setFormSlug(slugify(e.target.value));
              }}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <label className="mt-4 block text-sm font-medium text-gray-700" htmlFor="wf-slug">
              Slug (public URL is /f/<span className="font-mono">{formSlug || 'slug'}</span>)
            </label>
            <input id="wf-slug" value={formSlug} onChange={(e) => setFormSlug(slugify(e.target.value))} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            <label className="mt-4 block text-sm font-medium text-gray-700" htmlFor="wf-creates">
              Submission creates
            </label>
            <select id="wf-creates" value={formCreates} onChange={(e) => setFormCreates(e.target.value)} className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm">
              <option value="lead">Lead</option>
              <option value="deal">Lead + deal</option>
              <option value="none">Nothing (inbox only)</option>
            </select>
            <label className="mt-4 block text-sm font-medium text-gray-700" htmlFor="wf-success">
              Success message
            </label>
            <input
              id="wf-success"
              value={formSuccess}
              onChange={(e) => setFormSuccess(e.target.value)}
              placeholder="Thanks — we'll be in touch."
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />

            <h3 className="mt-6 text-sm font-semibold text-gray-900">Fields</h3>
            <div className="mt-2 space-y-2">
              {formFields.map((fld, i) => (
                <div key={fld.key} className="flex items-center gap-2 rounded-lg border border-gray-200 px-3 py-2 text-sm">
                  <span className="font-mono text-xs text-gray-500">{fld.key}</span>
                  <span className="flex-1">{fld.label}</span>
                  <span className="text-xs text-gray-500">{fld.type}</span>
                  {fld.required && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">required</span>}
                  <button
                    type="button"
                    aria-label={`Remove field ${fld.label}`}
                    className="text-gray-400 hover:text-red-600"
                    onClick={() => setFormFields(formFields.filter((_, j) => j !== i))}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-end gap-2 rounded-lg bg-gray-50 p-3">
              <div>
                <label className="block text-xs font-medium text-gray-600" htmlFor="wf-new-label">
                  Label
                </label>
                <input id="wf-new-label" value={newFieldLabel} onChange={(e) => setNewFieldLabel(e.target.value)} className="mt-1 w-40 rounded-lg border border-gray-300 px-2 py-1.5 text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600" htmlFor="wf-new-key">
                  Key
                </label>
                <input
                  id="wf-new-key"
                  value={newFieldKey}
                  onChange={(e) => setNewFieldKey(e.target.value)}
                  placeholder={slugify(newFieldLabel) || 'field_key'}
                  className="mt-1 w-32 rounded-lg border border-gray-300 px-2 py-1.5 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600" htmlFor="wf-new-type">
                  Type
                </label>
                <select id="wf-new-type" value={newFieldType} onChange={(e) => setNewFieldType(e.target.value)} className="mt-1 rounded-lg border border-gray-300 px-2 py-1.5 text-sm">
                  {FIELD_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <label className="flex items-center gap-1 text-sm text-gray-700">
                <input type="checkbox" checked={newFieldRequired} onChange={(e) => setNewFieldRequired(e.target.checked)} /> Required
              </label>
              <button type="button" onClick={addField} className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm">
                Add field
              </button>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setDrawerOpen(false)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm">
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void saveForm()}
                disabled={saving}
                className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {saving ? 'Saving…' : editing ? 'Save changes' : 'Create webform'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Submissions inbox drawer ── */}
      {detail && (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/30" role="dialog" aria-label={`Submissions for ${detail.name}`}>
          <div className="h-full w-full max-w-xl overflow-y-auto bg-white p-6 shadow-xl">
            <div className="flex items-start justify-between">
              <div>
                <h2 className="text-lg font-semibold text-gray-900">{detail.name}</h2>
                <p className="mt-1 text-sm text-gray-500">
                  Public link: <a href={publicUrl(detail)} target="_blank" rel="noreferrer" className="text-blue-700 underline">{publicUrl(detail)}</a>
                </p>
              </div>
              <button type="button" aria-label="Close" className="text-xl text-gray-500" onClick={() => setDetail(null)}>
                ×
              </button>
            </div>
            <h3 className="mt-6 text-sm font-semibold text-gray-900">Submissions ({submissions.length})</h3>
            {detailLoading ? (
              <p className="mt-2 text-sm text-gray-500">Loading submissions…</p>
            ) : submissions.length === 0 ? (
              <p className="mt-2 text-sm text-gray-500">No submissions yet. Submit the public form to see one here — a lead is created automatically.</p>
            ) : (
              <div className="mt-2 space-y-3">
                {submissions.map((s) => (
                  <div key={s.id} className="rounded-lg border border-gray-200 p-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className={`rounded-full px-2 py-0.5 text-xs ${s.status === 'processed' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'}`}>{s.status}</span>
                      <span className="text-xs text-gray-500">{fmt(s.createdAt)}</span>
                    </div>
                    <dl className="mt-2 space-y-1">
                      {Object.entries(s.payload).map(([k, v]) => (
                        <div key={k} className="flex gap-2">
                          <dt className="w-24 shrink-0 font-medium text-gray-600">{k}</dt>
                          <dd className="text-gray-900">{String(v ?? '')}</dd>
                        </div>
                      ))}
                    </dl>
                    {s.leadId && <p className="mt-2 text-xs text-gray-500">Lead created: <span className="font-mono">{s.leadId}</span></p>}
                    {s.sourceUrl && <p className="text-xs text-gray-400">from {s.sourceUrl}</p>}
                  </div>
                ))}
              </div>
            )}
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => openEdit(detail)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm">
                Edit form
              </button>
              <button type="button" onClick={() => setDetail(null)} className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white">
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete confirm ── */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" role="alertdialog" aria-label="Delete webform">
          <div className="w-full max-w-sm rounded-xl bg-white p-6 shadow-xl">
            <h2 className="text-lg font-semibold text-gray-900">Delete this webform?</h2>
            <p className="mt-2 text-sm text-gray-600">Its public link stops working. Submissions already received stay in the database.</p>
            <div className="mt-6 flex justify-end gap-2">
              <button type="button" onClick={() => setDeleteId(null)} className="rounded-lg border border-gray-300 px-4 py-2 text-sm">
                Cancel
              </button>
              <button type="button" onClick={() => void confirmDelete()} className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white">
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
