import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/* Oversight rules (doc 23, Publishing → Oversight). The rule catalog
   is the set of checks the Oversight screen actually runs against
   draft posts; whether each is enabled is tenant configuration, kept
   in policy_settings (scope 'social', key 'oversight.rules', value =
   JSON map of rule id -> enabled). Defaults apply until the tenant
   saves a choice. blocked_words persists as a toggle like the others
   — no blocked-word list exists in the platform yet, so that check
   has nothing to match against. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

const SCOPE = 'social';
const KEY = 'oversight.rules';

const RULE_CATALOG = [
  { id: 'blocked_words', name: 'Blocked words', category: 'Policy / compliance', defaultEnabled: true },
  { id: 'duplicate', name: 'Duplicate caption check', category: 'Spam / duplication', defaultEnabled: true },
  { id: 'missing_media', name: 'Missing media', category: 'Content quality', defaultEnabled: true },
  { id: 'new_author', name: 'First post from new author', category: 'Brand voice', defaultEnabled: false },
  { id: 'channel_not_connected', name: 'Channel not connected', category: 'Policy / compliance', defaultEnabled: true },
] as const;

async function readEnabled(): Promise<Record<string, boolean>> {
  const sb = supabaseAdmin();
  const { data } = await sb
    .from('policy_settings')
    .select('value')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('scope', SCOPE)
    .eq('key', KEY)
    .maybeSingle();
  if (!data) return {};
  try {
    const v = JSON.parse((data as { value: string }).value) as Record<string, unknown>;
    const out: Record<string, boolean> = {};
    for (const [k, val] of Object.entries(v)) if (typeof val === 'boolean') out[k] = val;
    return out;
  } catch {
    return {};
  }
}

function dto(saved: Record<string, boolean>) {
  return RULE_CATALOG.map((r) => ({
    id: r.id,
    name: r.name,
    category: r.category,
    enabled: saved[r.id] ?? r.defaultEnabled,
  }));
}

export async function GET() {
  try {
    return NextResponse.json({ data: dto(await readEnabled()) });
  } catch (e) {
    return err('INTERNAL', e instanceof Error ? e.message : String(e), 500);
  }
}

export async function PUT(req: NextRequest) {
  const body = (await req.json().catch(() => null)) as { rules?: { id: string; enabled: boolean }[] } | null;
  if (!body || !Array.isArray(body.rules)) return err('VALIDATION', 'rules array is required', 400);
  const valid = new Set<string>(RULE_CATALOG.map((r) => r.id));
  const map: Record<string, boolean> = {};
  for (const r of body.rules) {
    if (valid.has(r.id) && typeof r.enabled === 'boolean') map[r.id] = r.enabled;
  }
  const sb = supabaseAdmin();
  const { data: existing } = await sb
    .from('policy_settings')
    .select('id')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('scope', SCOPE)
    .eq('key', KEY)
    .maybeSingle();
  const value = JSON.stringify(map);
  const { error } = existing
    ? await sb.from('policy_settings').update({ value, updated_at: new Date().toISOString() }).eq('id', (existing as { id: string }).id)
    : await sb.from('policy_settings').insert({ tenant_id: DEFAULT_TENANT_ID, scope: SCOPE, key: KEY, value });
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: dto(map) });
}
