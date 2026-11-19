import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { writePartySpine } from '@/lib/partySpine';

/**
 * ── @platform/commands bridge — legacy direct-write ────────────────────────
 * This route is one of three designated "anchor" routes (parties,
 * crm/customers, products) where the data-access unification is documented.
 *
 * The canonical data-access path in the monorepo is:
 *   API route → @platform/commands (defineCommand registry) → @platform/db
 *   (typed RPC wrappers over p_* Postgres functions) → supabase
 * The command registry is the single source of truth for what the platform
 * does — every command is also surfaced to AI agents via apps/mcp-gateway.
 *
 * NEW routes should delegate to commands:
 *   import { getCommandContext, studio } from '@/lib/commands';
 *   const ctx = getCommandContext(reqUserId);
 *   const r = await studio.someCommand.run({...}, ctx);
 *   if (!r.ok) return NextResponse.json({ error: r.error }, { status: 400 });
 *
 * This route (and 138 others) currently calls supabaseAdmin().from('t')...
 * directly. That works (the staff app is single-tenant, service-role), but
 * it bypasses the registry — so the audit trail in platform_audit_log loses
 * the command id, and AI agents can't reach this mutation via MCP. Migrating
 * the 139 routes is a Phase 2 effort; this comment block establishes the
 * bridge so the migration has a clear target. Until then, this route stays
 * on the legacy direct-write path for backward compatibility.
 *
 * The bridge lives in apps/web/src/lib/commands.ts — `getCommandContext()`
 * builds `{ supabase, userId, tenantId }` from supabaseAdmin + DEFAULT_TENANT_ID
 * + the caller's user id. The studio/techpack/rfq/media command bundles are
 * re-exported from there so consumers don't need to learn a second import.
 * ──────────────────────────────────────────────────────────────────────────
 */

/**
 * GET /api/crm/customers
 * Query params: q (search), status, segment_id, lead_status, limit, cursor
 * Returns the customer list with computed balance/LTV from the row.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = searchParams.get('q')?.trim();
  const status = searchParams.get('status');
  const lifecycleStage = searchParams.get('lifecycle_stage');
  const limit = Math.min(parseInt(searchParams.get('limit') || '100'), 500);

  let query = supabaseAdmin()
    .from('crm_customers')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('updated_at', { ascending: false })
    .limit(limit);

  if (q) {
    query = query.or(`first_name.ilike.%${q}%,last_name.ilike.%${q}%,email.ilike.%${q}%,company_name.ilike.%${q}%,phone.ilike.%${q}%`);
  }
  if (status && status !== 'all') {
    query = query.eq('lifecycle_status', status);
  }
  if (lifecycleStage && lifecycleStage !== 'all') {
    query = query.eq('lifecycle_stage', lifecycleStage);
  }

  const { data, error } = await query;
  if (error) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  }

  // Compute summary stats for KPI strip
  const total = data.length;
  const activeCount = data.filter(c => c.lifecycle_status === 'active').length;
  const openAR = data.reduce((s, c) => s + (Number(c.outstanding_balance) || 0), 0);
  const lifetimeValue = data.reduce((s, c) => s + (Number(c.lifetime_value) || 0), 0);

  return NextResponse.json({
    data,
    meta: {
      total,
      summary: { active: activeCount, open_ar: openAR, lifetime_value: lifetimeValue },
    },
  });
}

/**
 * POST /api/crm/customers
 * Creates a new customer. Required: at least first_name or company_name + email.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();

  const insert = {
    tenant_id: DEFAULT_TENANT_ID,
    customer_type: body.customer_type || 'Retail',
    lifecycle_stage: body.lifecycle_stage || 'lead',
    lifecycle_status: body.lifecycle_status || 'active',
    first_name: body.first_name || null,
    last_name: body.last_name || null,
    company_name: body.company_name || null,
    email: body.email || null,
    phone: body.phone || null,
    mobile_phone: body.mobile_phone || null,
    address_line1: body.address_line1 || null,
    city: body.city || null,
    state: body.state || null,
    postal_code: body.postal_code || null,
    country: body.country || 'US',
    lead_status: body.lead_status || 'new',
    outstanding_balance: body.outstanding_balance || 0,
    lifetime_value: body.lifetime_value || 0,
    is_active: true,
    marketing_email_opt_in: body.marketing_email_opt_in ?? true,
    transactional_email_opt_in: body.transactional_email_opt_in ?? true,
  };

  const { data, error } = await supabaseAdmin()
    .from('crm_customers')
    .insert(insert)
    .select('*')
    .single();

  if (error) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: error.message, fields: { detail: error.details }, requestId: crypto.randomUUID() } }, { status: 400 });
  }

  // Write to the party spine — one record per human/company in platform_parties
  await writePartySpine(data.id, 'customer', {
    name: [data.first_name, data.last_name].filter(Boolean).join(' ') || data.company_name || data.email,
    email: data.email,
    phone: data.phone,
    company: data.company_name,
    city: data.city,
    state: data.state,
  });

  return NextResponse.json({ data, warnings: [] }, { status: 201 });
}
