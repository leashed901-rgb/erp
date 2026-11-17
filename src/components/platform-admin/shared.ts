// Client-side helpers + shapes for the Platform Admin surface.
// (Types mirror src/lib/platformAdmin.ts; the server lib is never imported client-side.)

export interface AdminTenant {
  id: string;
  name: string;
  slug: string | null;
  business_type: string | null;
  lifecycle: string;
  plan_label: string | null;
  billing_status: string;
  member_count: number | null;
  last_activity_at: string | null;
  owner: { display: string | null; email: string | null; pending_invitation: boolean } | null;
  attention_flags: string[];
  created_at: string;
}

export async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: 'no-store' });
  const json = (await res.json().catch(() => null)) as { data?: T; error?: { message?: string } } | null;
  if (!res.ok || !json?.data) throw new Error(json?.error?.message || `Request failed (${res.status})`);
  return json.data;
}

export async function apiPost<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const json = (await res.json().catch(() => null)) as { data?: T; error?: { message?: string } } | null;
  if (!res.ok || json?.data === undefined) throw new Error(json?.error?.message || `Request failed (${res.status})`);
  return json.data as T;
}

export function relTime(iso: string | null): string {
  if (!iso) return 'Not available';
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
