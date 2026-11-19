'use client';

import { useState } from 'react';

type Field = { key: string; label: string; type: string; required: boolean };
type Form = { slug: string; name: string; successMessage: string; fields: Field[] };

/* Public webform renderer — posts { formSlug, payload } to the submit
   route, which runs platform_submit_webform (submission + lead). */

export default function PublicWebform({ form }: { form: Form }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [state, setState] = useState<'idle' | 'sending' | 'done' | 'error'>('idle');
  const [error, setError] = useState('');

  const set = (key: string, v: string) => setValues((prev) => ({ ...prev, [key]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setState('sending');
    setError('');
    const payload: Record<string, string> = {};
    for (const f of form.fields) payload[f.key] = values[f.key] || '';
    try {
      const res = await fetch('/api/marketing/webforms/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formSlug: form.slug, payload, sourceUrl: window.location.href }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => null);
        throw new Error((j as { error?: { message?: string } } | null)?.error?.message || `Submit failed (${res.status})`);
      }
      setState('done');
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : 'Submit failed');
      setState('error');
    }
  }

  if (state === 'done') {
    return (
      <div className="rounded-lg border border-gray-200 bg-gray-50 px-5 py-6">
        <p className="text-[15px] text-gray-900">{form.successMessage}</p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {form.fields.map((f) => (
        <div key={f.key}>
          <label htmlFor={`pf-${f.key}`} className="block text-sm font-medium text-gray-700">
            {f.label}
            {f.required ? ' *' : ''}
          </label>
          {f.type === 'textarea' ? (
            <textarea
              id={`pf-${f.key}`}
              required={f.required}
              value={values[f.key] || ''}
              onChange={(e) => set(f.key, e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
              rows={4}
            />
          ) : (
            <input
              id={`pf-${f.key}`}
              type={f.type === 'email' ? 'email' : f.type === 'phone' ? 'tel' : 'text'}
              required={f.required}
              value={values[f.key] || ''}
              onChange={(e) => set(f.key, e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
          )}
        </div>
      ))}
      {state === 'error' && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={state === 'sending'}
        className="rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {state === 'sending' ? 'Sending…' : 'Submit'}
      </button>
    </form>
  );
}
