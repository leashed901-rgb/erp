import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/* Workspace identity for Settings → Workspace → General: the tenant
   row, the accounting entity's currency/fiscal start, and the
   default business-hours timezone. Region has no source in the
   platform data, so it is returned as null and shown as '—'. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function GET() {
  const sb = supabaseAdmin();
  const since7d = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
  const count = async (q: PromiseLike<{ count: number | null }>) => (await q).count ?? 0;
  const [{ data: tenant }, { data: entity }, { data: hours }, activeMembers, modulesEnabled, packsApplied, auditEvents7d, customFields, savedViews] = await Promise.all([
    sb.from('tenants').select('name, slug, legal_name, default_currency, plan_tier, logo_url, logo_dark_url, favicon_url, primary_color, secondary_color, accent_color, brand_font, support_email, support_phone, website_url').eq('id', DEFAULT_TENANT_ID).maybeSingle(),
    sb.from('acct_entities').select('functional_currency, fiscal_year_start_month').eq('tenant_id', DEFAULT_TENANT_ID).limit(1).maybeSingle(),
    sb.from('support_business_hours').select('timezone, is_default').eq('tenant_id', DEFAULT_TENANT_ID).eq('is_active', true).order('is_default', { ascending: false }).limit(1).maybeSingle(),
    count(sb.from('tenant_memberships').select('id', { count: 'exact', head: true }).eq('tenant_id', DEFAULT_TENANT_ID).eq('active', true)),
    count(sb.from('platform_tenant_modules').select('module_code', { count: 'exact', head: true }).eq('tenant_id', DEFAULT_TENANT_ID).eq('enabled', true)),
    count(sb.from('platform_tenant_packs').select('pack_code', { count: 'exact', head: true }).eq('tenant_id', DEFAULT_TENANT_ID)),
    count(sb.from('platform_audit_events').select('id', { count: 'exact', head: true }).eq('tenant_id', DEFAULT_TENANT_ID).gte('occurred_at', since7d)),
    count(sb.from('platform_custom_fields').select('id', { count: 'exact', head: true }).eq('tenant_id', DEFAULT_TENANT_ID).eq('is_active', true)),
    count(sb.from('platform_saved_views').select('id', { count: 'exact', head: true }).eq('tenant_id', DEFAULT_TENANT_ID)),
  ]);
  if (!tenant) return err('NOT_FOUND', 'Tenant not found', 404);
  const t = tenant as unknown as Record<string, string | null>;
  const e = entity as { functional_currency: string | null; fiscal_year_start_month: number | null } | null;
  const h = hours as { timezone: string | null } | null;
  return NextResponse.json({
    data: {
      name: t.name,
      slug: t.slug,
      legalName: t.legal_name || t.name,
      currency: e?.functional_currency || t.default_currency || 'USD',
      fiscalYearStartMonth: e?.fiscal_year_start_month ?? null,
      timezone: h?.timezone || null,
      planTier: t.plan_tier || null,
      region: null,
      branding: {
        logoUrl: t.logo_url, logoDarkUrl: t.logo_dark_url, faviconUrl: t.favicon_url,
        primaryColor: t.primary_color, secondaryColor: t.secondary_color, accentColor: t.accent_color,
        brandFont: t.brand_font, supportEmail: t.support_email, supportPhone: t.support_phone, websiteUrl: t.website_url,
      },
      // kpis.md stat bar — every tile a real count from its named source.
      kpis: { activeMembers, modulesEnabled, packsApplied, auditEvents7d, customFields, savedViews },
    },
  });
}

/**
 * PATCH /api/platform/workspace — branding lives on the tenants row
 * (SHIP-IT step 2: branding → tenants columns). Body accepts camelCase
 * branding/identity fields; only provided fields are written.
 */
export async function PATCH(req: Request) {
  try {
    const body = (await req.json()) as Record<string, unknown>;
    const FIELDS: Record<string, string> = {
      name: 'name', legalName: 'legal_name', logoUrl: 'logo_url', logoDarkUrl: 'logo_dark_url',
      faviconUrl: 'favicon_url', primaryColor: 'primary_color', secondaryColor: 'secondary_color',
      accentColor: 'accent_color', brandFont: 'brand_font', supportEmail: 'support_email',
      supportPhone: 'support_phone', websiteUrl: 'website_url', defaultCurrency: 'default_currency',
    };
    const patch: Record<string, unknown> = {};
    for (const [camel, snake] of Object.entries(FIELDS)) {
      if (body[camel] !== undefined) patch[snake] = body[camel];
    }
    if (!Object.keys(patch).length) return err('VALIDATION', 'No branding fields provided', 400);
    patch.updated_at = new Date().toISOString();
    const { error } = await supabaseAdmin().from('tenants').update(patch).eq('id', DEFAULT_TENANT_ID);
    if (error) return err('WRITE_FAILED', error.message, 500);
    return NextResponse.json({ data: { ok: true } });
  } catch (e: unknown) {
    return err('INTERNAL', e instanceof Error ? e.message : 'Failed', 500);
  }
}
