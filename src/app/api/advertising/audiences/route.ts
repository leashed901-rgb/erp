import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { toAdAudience } from '@/lib/adDto';

/* Audiences (doc 22 nav: Advertising/Audiences → ad_audiences).
   Audiences are organization-scoped; the tenant is the organization. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

async function organizationId(): Promise<string | null> {
  const { data } = await supabaseAdmin()
    .from('organizations')
    .select('id')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .limit(1)
    .maybeSingle();
  return (data?.id as string) || null;
}

export async function GET() {
  const orgId = await organizationId();
  if (!orgId) return NextResponse.json({ data: [] });
  const { data, error } = await supabaseAdmin()
    .from('ad_audiences')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: (data || []).map((r) => toAdAudience(r as Record<string, unknown>)) });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (typeof body.name !== 'string' || !body.name.trim()) return err('VALIDATION', 'name is required', 400);
  const orgId = await organizationId();
  if (!orgId) return err('VALIDATION', 'No organization exists for this tenant.', 400);
  const { data, error } = await supabaseAdmin()
    .from('ad_audiences')
    .insert({
      organization_id: orgId,
      name: body.name.trim(),
      criteria: (body.criteria as Record<string, unknown>) || {},
      size: typeof body.size === 'number' ? body.size : null,
      reach: typeof body.reach === 'number' ? body.reach : null,
    })
    .select('*')
    .single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: toAdAudience(data as Record<string, unknown>) }, { status: 201 });
}
