import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/* Website settings (SHIP-IT step 4): the mode switch + the
   cms_website_settings row. 'template' renders the deployed template
   with manifest overrides; 'cms' renders composed pages from cms_*.
   One toggle, one deploy pipeline. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function GET() {
  const sb = supabaseAdmin();
  const [{ data: tenant }, { data: settings }] = await Promise.all([
    sb.from('tenants').select('website_mode, website_url').eq('id', DEFAULT_TENANT_ID).maybeSingle(),
    sb.from('cms_website_settings').select('*').eq('tenant_id', DEFAULT_TENANT_ID).maybeSingle(),
  ]);
  return NextResponse.json({
    data: {
      websiteMode: (tenant as { website_mode?: string } | null)?.website_mode || 'template',
      websiteUrl: (tenant as { website_url?: string } | null)?.website_url || null,
      settings: settings
        ? {
            id: String((settings as Record<string, unknown>).id),
            brandName: (settings as Record<string, unknown>).brand_name as string | null,
            logoUrl: (settings as Record<string, unknown>).logo_url as string | null,
            faviconUrl: (settings as Record<string, unknown>).favicon_url as string | null,
            canonicalOrigin: (settings as Record<string, unknown>).canonical_origin as string | null,
            defaultLocale: (settings as Record<string, unknown>).default_locale as string | null,
            defaultCurrency: (settings as Record<string, unknown>).default_currency as string | null,
            maintenanceMode: Boolean((settings as Record<string, unknown>).maintenance_mode),
            maintenanceMessage: (settings as Record<string, unknown>).maintenance_message as string | null,
          }
        : null,
    },
  });
}

export async function PATCH(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const sb = supabaseAdmin();

  if (typeof body.websiteMode === 'string') {
    if (!['template', 'cms'].includes(body.websiteMode)) return err('VALIDATION', "websiteMode must be 'template' or 'cms'", 400);
    const { error } = await sb.from('tenants').update({ website_mode: body.websiteMode }).eq('id', DEFAULT_TENANT_ID);
    if (error) return err('INTERNAL', error.message, 500);
  }
  if (typeof body.websiteUrl === 'string') {
    const { error } = await sb.from('tenants').update({ website_url: body.websiteUrl }).eq('id', DEFAULT_TENANT_ID);
    if (error) return err('INTERNAL', error.message, 500);
  }

  const fields: Record<string, unknown> = {};
  const map: Record<string, string> = {
    brandName: 'brand_name',
    logoUrl: 'logo_url',
    faviconUrl: 'favicon_url',
    canonicalOrigin: 'canonical_origin',
    defaultLocale: 'default_locale',
    defaultCurrency: 'default_currency',
    maintenanceMode: 'maintenance_mode',
    maintenanceMessage: 'maintenance_message',
  };
  for (const [camel, col] of Object.entries(map)) {
    if (body[camel] !== undefined) fields[col] = body[camel];
  }
  if (Object.keys(fields).length) {
    const { data: existing } = await sb.from('cms_website_settings').select('id').eq('tenant_id', DEFAULT_TENANT_ID).maybeSingle();
    if (existing) {
      const { error } = await sb.from('cms_website_settings').update(fields).eq('tenant_id', DEFAULT_TENANT_ID).eq('id', (existing as { id: string }).id);
      if (error) return err('INTERNAL', error.message, 500);
    } else {
      const { error } = await sb.from('cms_website_settings').insert({ tenant_id: DEFAULT_TENANT_ID, ...fields });
      if (error) return err('INTERNAL', error.message, 500);
    }
  }

  // Return the fresh state.
  const [{ data: tenant }, { data: settings }] = await Promise.all([
    sb.from('tenants').select('website_mode, website_url').eq('id', DEFAULT_TENANT_ID).maybeSingle(),
    sb.from('cms_website_settings').select('*').eq('tenant_id', DEFAULT_TENANT_ID).maybeSingle(),
  ]);
  return NextResponse.json({
    data: {
      websiteMode: (tenant as { website_mode?: string } | null)?.website_mode || 'template',
      websiteUrl: (tenant as { website_url?: string } | null)?.website_url || null,
      settings: settings
        ? {
            id: String((settings as Record<string, unknown>).id),
            brandName: (settings as Record<string, unknown>).brand_name as string | null,
            logoUrl: (settings as Record<string, unknown>).logo_url as string | null,
            faviconUrl: (settings as Record<string, unknown>).favicon_url as string | null,
            canonicalOrigin: (settings as Record<string, unknown>).canonical_origin as string | null,
            defaultLocale: (settings as Record<string, unknown>).default_locale as string | null,
            defaultCurrency: (settings as Record<string, unknown>).default_currency as string | null,
            maintenanceMode: Boolean((settings as Record<string, unknown>).maintenance_mode),
            maintenanceMessage: (settings as Record<string, unknown>).maintenance_message as string | null,
          }
        : null,
    },
  });
}
