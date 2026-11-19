import { notFound } from 'next/navigation';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import PublicWebform from './PublicWebform';

/* Public webform page — /f/<slug>. Renders an active form straight from
   the database on every request, no shell, no auth gate: this is the
   public surface a webform link points at. Submit goes through the
   platform_submit_webform RPC (creates submission + lead atomically). */

export const dynamic = 'force-dynamic';

type Field = { key: string; label: string; type: string; required: boolean };

export default async function PublicWebformPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const { data } = await supabaseAdmin()
    .from('platform_webforms')
    .select('slug, name, creates, fields, success_message, is_active')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('slug', slug)
    .maybeSingle();
  const row = data as { slug?: string; name?: string; creates?: string; fields?: unknown; success_message?: string; is_active?: boolean } | null;
  if (!row || !row.is_active) notFound();
  const fields: Field[] = (Array.isArray(row.fields) ? row.fields : []).map((f) => {
    const fld = (f || {}) as Record<string, unknown>;
    return {
      key: String(fld.key || ''),
      label: String(fld.label || fld.key || ''),
      type: ['text', 'email', 'phone', 'textarea'].includes(String(fld.type)) ? String(fld.type) : 'text',
      required: fld.required === true,
    };
  }).filter((f) => f.key);
  return (
    <main className="min-h-screen bg-white px-6 py-16">
      <div className="mx-auto w-full max-w-lg">
        <h1 className="text-2xl font-bold text-gray-900">{row.name || 'Contact us'}</h1>
        <div className="mt-6">
          <PublicWebform
            form={{
              slug: String(row.slug || slug),
              name: String(row.name || ''),
              successMessage: String(row.success_message || 'Thanks — we got it.'),
              fields,
            }}
          />
        </div>
      </div>
    </main>
  );
}
