import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { toAdAccount } from '@/lib/adDto';

/* Ad center accounts (doc 22 nav: Advertising/Ad center → ad_accounts).
   Accounts are organization-scoped; the tenant is the organization. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

async function orgId(): Promise<string | null> {
  const { data: org } = await supabaseAdmin()
    .from('organizations')
    .select('id')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .limit(1)
    .maybeSingle();
  return (org?.id as string) || null;
}

export async function GET() {
  const org = await orgId();
  if (!org) return NextResponse.json({ data: [] });
  const { data, error } = await supabaseAdmin()
    .from('ad_accounts')
    .select('*')
    .eq('organization_id', org)
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: (data || []).map((r) => toAdAccount(r as Record<string, unknown>)) });
}

/* Connect an ad account for the tenant's organization. Until this POST
   existed the accounts list could never gain a row — ad_accounts had no
   write path anywhere in the app, so SHIP-IT step 1 (connect a test ad
   account) dead-ended. Body: { name, status?, verified?, tier? }.
   This is the manual connect: provider OAuth (Meta/TikTok/Google) is a
   separate integration — ad_accounts carries no provider or external-id
   column, so there is nothing to sync against yet. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const name = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : null;
  if (!name) return err('VALIDATION', 'name is required', 400);
  const org = await orgId();
  if (!org) return err('VALIDATION', 'No organization exists for this tenant — ad accounts are organization-scoped.', 400);
  const { data, error } = await supabaseAdmin()
    .from('ad_accounts')
    .insert({
      organization_id: org,
      name,
      status: typeof body.status === 'string' ? body.status : 'active',
      verified: body.verified === true,
      tier: typeof body.tier === 'string' ? body.tier : null,
    })
    .select('*')
    .single();
  if (error) {
    // One ad account per organization (ad_accounts_organization_id_key).
    if (error.message.includes('ad_accounts_organization_id_key')) {
      return err('CONFLICT', 'An ad account is already connected for this organization.', 409);
    }
    return err('INTERNAL', error.message, 500);
  }
  return NextResponse.json({ data: toAdAccount(data as Record<string, unknown>) }, { status: 201 });
}
