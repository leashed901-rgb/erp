import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { writePartySpine, spineRowToPartyListItem, type PartyListItem } from '@/lib/partySpine';

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
 * GET /api/parties — the unified party list, read from the spine
 * (platform_parties). One query, not five. The metadata carries name,
 * email, phone, company, roles — everything the list + pills need.
 * Query: ?role=customer|vendor|supplier|lead|seller & ?q=search
 *
 * The response items are typed as `SharedParty & { …extra UI fields }`
 * — the @platform/shared Party contract record (id, tenantId, kind,
 * displayName, email, phone, roles) intersected with the UI list row
 * (source, name, company, balance, lifecycleStage, …). API consumers
 * that import @platform/shared can read the contract fields without
 * depending on the web app's UI shape.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const role = searchParams.get('role');
  const idParam = searchParams.get('id');
  const q = searchParams.get('q')?.trim().toLowerCase();

  let query = supabaseAdmin()
    .from('platform_parties')
    .select('id, party_kind, metadata, created_at, updated_at')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .order('updated_at', { ascending: false })
    .limit(500);

  if (idParam) query = query.eq('id', idParam);

  if (role && role !== 'all') {
    // metadata->roles is jsonb; contains needs a JSON value, not a
    // Postgres array literal — the old [role] form 500ed with
    // "invalid input syntax for type json". Roles are stored lowercase.
    query = query.contains('metadata', { roles: [role.toLowerCase()] });
  }

  const { data: spine, error } = await query;

  if (error) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: error.message } }, { status: 500 });
  }

  // The Party DTO derives from the spine row (partySpine.ts) — the
  // canonical mapper shared by every consumer of platform_parties.
  const parties: PartyListItem[] = (spine || []).map((p) => spineRowToPartyListItem(p));

  const filtered = q
    ? parties.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.email || '').toLowerCase().includes(q) ||
        (p.company || '').toLowerCase().includes(q) ||
        (p.phone || '').includes(q))
    : parties;

  // Vendor enrichment (doc 07): open balance + YTD paid come from the
  // bills/payments tables, and the W-9 pill comes from acct_vendors +
  // the latest contractor invite — not from the spine metadata alone.
  // Runs when the caller asked for a pay-side role, or when the list
  // itself contains pay-side parties (the unified Parties screen lists
  // every role, and its vendor columns read these fields). A pure
  // customer list stays a single query.
  const vendorRole = role && ['vendor', 'supplier', 'contractor'].includes(role.toLowerCase());
  const hasPaySideParty = filtered.some((p) =>
    p.roles.some((r) => ['vendor', 'supplier', 'contractor'].includes(r)),
  );
  if ((vendorRole || hasPaySideParty) && filtered.length > 0) {
    const ids = filtered.map((p) => p.id);
    const [vendorsRes, invitesRes, billsRes, paymentsRes] = await Promise.all([
      supabaseAdmin()
        .from('acct_vendors')
        .select('id, is_1099_vendor, w9_received_at, vendor_kind, is_active')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .in('id', ids),
      supabaseAdmin()
        .from('acct_contractor_invites')
        .select('vendor_id, status, sent_at')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .in('vendor_id', ids)
        .order('sent_at', { ascending: false }),
      supabaseAdmin()
        .from('acct_ap_bills')
        .select('vendor_id, open_balance')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .gt('open_balance', 0),
      supabaseAdmin()
        .from('acct_ap_payments')
        .select('vendor_id, amount, payment_date')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .is('voided_at', null)
        .gte('payment_date', `${new Date().getFullYear()}-01-01`),
    ]);
    const vendorById = new Map((vendorsRes.data || []).map((v: { id: string }) => [v.id, v]));
    const latestInvite = new Map<string, { status: string }>();
    for (const inv of invitesRes.data || []) {
      if (!latestInvite.has(inv.vendor_id)) latestInvite.set(inv.vendor_id, inv);
    }
    const openByVendor = new Map<string, number>();
    for (const b of billsRes.data || []) {
      openByVendor.set(b.vendor_id, (openByVendor.get(b.vendor_id) || 0) + Number(b.open_balance || 0));
    }
    const ytdByVendor = new Map<string, number>();
    for (const p of paymentsRes.data || []) {
      ytdByVendor.set(p.vendor_id, (ytdByVendor.get(p.vendor_id) || 0) + Number(p.amount || 0));
    }
    for (const p of filtered as (PartyListItem & { contractorW9Status?: string | null; track1099?: boolean; vendorKind?: string | null; openBalance?: number; ytdPaid?: number })[]) {
      const v = vendorById.get(p.id) as { is_1099_vendor?: boolean; w9_received_at?: string | null; vendor_kind?: string; is_active?: boolean } | undefined;
      const invite = latestInvite.get(p.id);
      p.track1099 = !!v?.is_1099_vendor;
      p.is1099 = !!v?.is_1099_vendor;
      p.w9Received = !!v?.w9_received_at;
      p.isActive = v ? !!v.is_active : true;
      p.vendorKind = v?.vendor_kind || null;
      p.openBalance = openByVendor.get(p.id) || 0;
      p.balance = p.openBalance;
      p.ytdPaid = ytdByVendor.get(p.id) || 0;
      p.contractorW9Status = v?.w9_received_at
        ? 'Completed'
        : invite && ['sent', 'opened'].includes(invite.status)
          ? 'Invited'
          : p.roles.includes('contractor')
            ? 'Missing'
            : null;
    }
  }

  // Customer enrichment (CRM pack): the open balance is computed from
  // the invoices themselves. The spine metadata balance is a stale
  // mirror — it read $0 while real invoices were open. Spine ids ARE
  // the source record ids (the vendor enrichment above relies on the
  // same identity), so invoices join directly. Drafts are not owed
  // yet; paid/void/written-off are closed.
  const hasCustomerParty = filtered.some((p) => p.roles.includes('customer'));
  if (hasCustomerParty && filtered.length > 0) {
    const customerIds = filtered
      .filter((p) => p.roles.includes('customer'))
      .map((p) => p.id);
    const { data: invRows } = await supabaseAdmin()
      .from('acct_ar_invoices')
      .select('customer_id, total, amount_paid, amount_credited')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .in('customer_id', customerIds)
      .not('status', 'in', '(paid,void,written_off,draft)');
    const openByCustomer = new Map<string, number>();
    for (const inv of invRows || []) {
      const open =
        Number(inv.total || 0) - Number(inv.amount_paid || 0) - Number(inv.amount_credited || 0);
      if (open > 0) {
        openByCustomer.set(inv.customer_id, (openByCustomer.get(inv.customer_id) || 0) + open);
      }
    }
    for (const p of filtered) {
      if (p.roles.includes('customer')) p.balance = openByCustomer.get(p.id) || 0;
    }
  }

  const counts = {
    all: filtered.length,
    customer: filtered.filter(p => p.roles.includes('customer')).length,
    vendor: filtered.filter(p => p.roles.includes('vendor')).length,
    supplier: filtered.filter(p => p.roles.includes('supplier')).length,
    lead: filtered.filter(p => p.roles.includes('lead')).length,
    seller: filtered.filter(p => p.roles.includes('seller')).length,
  };

  return NextResponse.json({ data: filtered, meta: { total: filtered.length, counts } });
}

/**
 * POST /api/parties — create a party. `role` routes the insert to the
 * correct Supabase table: customer → crm_customers, vendor → acct_vendors,
 * supplier → suppliers, lead → crm_leads.
 *
 * Field contract: EVERY field the PartyFormDrawer collects is written to a
 * real column here. Columns that are REQUIRED in the schema but have no
 * form input (acct_vendors.vendor_number / ap_account_id / currency,
 * suppliers.slug / catalog_source) are auto-resolved server-side so a
 * create never 400s on a column the user was never shown.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const role = body.role || 'customer';

  if (role === 'customer') {
    const { data, error } = await supabaseAdmin()
      .from('crm_customers')
      .insert({
        tenant_id: DEFAULT_TENANT_ID,
        first_name: body.first_name || null,
        last_name: body.last_name || null,
        // Display name → preferred_name (real column), never stuffed into company.
        preferred_name: body.preferred_name || body.display || null,
        company_name: body.company_name || null,
        email: body.email || null,
        phone: body.phone || null,
        mobile_phone: body.mobile_phone || null,
        address_line1: body.address || null,
        address_line2: body.address2 || body.street2 || null,
        city: body.city || null,
        state: body.state || null,
        postal_code: body.zip || null,
        country: body.country || 'US',
        // Real form select — falls back to the old company-derived default.
        customer_type: body.customer_type || (body.company_name ? 'Wholesale' : 'Retail'),
        marketing_email_opt_in: !!body.marketing_email_opt_in,
        marketing_sms_opt_in: !!body.marketing_sms_opt_in,
        lifecycle_stage: 'new_customer',
        lifecycle_status: 'active',
        lead_status: 'converted',
        first_contact_at: new Date().toISOString(),
        last_activity_at: new Date().toISOString(),
        is_active: true,
      })
      .select('id, first_name, last_name, company_name, email, phone, city, state, outstanding_balance, lifetime_value, lifecycle_stage, created_at')
      .single();
    if (error) return NextResponse.json({ error: { code: 'VALIDATION', message: error.message } }, { status: 400 });
    await writePartySpine(data.id, 'customer', { name: [data.first_name, data.last_name].filter(Boolean).join(' ') || data.company_name || data.email, email: data.email, phone: data.phone, company: data.company_name, city: data.city, state: data.state });
    // The create-form notes box lands in crm_notes — same store the Notes
    // tab reads, so it round-trips into the profile immediately.
    if (body.notes && String(body.notes).trim()) {
      await supabaseAdmin().from('crm_notes').insert({
        tenant_id: DEFAULT_TENANT_ID,
        customer_id: data.id,
        note_type: 'general',
        body: String(body.notes).trim(),
      });
    }
    return NextResponse.json({ data: { ...data, source: 'crm_customers', roles: ['customer'] } }, { status: 201 });
  }

  if (role === 'vendor') {
    // Auto-resolve the REQUIRED bookkeeping columns the form doesn't show:
    // vendor_number continues the tenant's VND-#### sequence, ap_account_id
    // points at the tenant's Accounts Payable (subtype accounts_payable).
    const [numRes, apRes] = await Promise.all([
      supabaseAdmin()
        .from('acct_vendors')
        .select('vendor_number')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .like('vendor_number', 'VND-%'),
      supabaseAdmin()
        .from('acct_chart_of_accounts')
        .select('id')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .eq('is_active', true)
        .eq('subtype', 'accounts_payable')
        .limit(1),
    ]);
    let nextNum = 1;
    for (const row of numRes.data || []) {
      const m = /^VND-(\d+)$/.exec(row.vendor_number || '');
      if (m) nextNum = Math.max(nextNum, parseInt(m[1], 10) + 1);
    }
    const vendorNumber = `VND-${String(nextNum).padStart(4, '0')}`;
    const apAccountId = apRes.data?.[0]?.id;
    if (!apAccountId) {
      return NextResponse.json({ error: { code: 'CONFIG', message: 'No Accounts Payable account found in acct_chart_of_accounts — cannot create vendor' } }, { status: 500 });
    }

    const is1099 = !!body.is1099;
    const { data, error } = await supabaseAdmin()
      .from('acct_vendors')
      .insert({
        tenant_id: DEFAULT_TENANT_ID,
        vendor_number: vendorNumber,
        legal_name: body.name || body.company_name,
        email: body.email || null,
        phone: body.phone || null,
        currency: 'USD',
        ap_account_id: apAccountId,
        payment_terms_days: body.terms ?? 30,
        is_1099_vendor: is1099,
        tax_number: body.tax_number || null,
        tax_form_type: is1099 ? (body.tax_form_type || 'W-9') : null,
        w9_received_at: body.w9_received ? new Date().toISOString() : null,
        is_active: true,
        metadata: {},
      })
      .select('id, legal_name, email, phone, payment_terms_days, is_1099_vendor, is_active, created_at')
      .single();
    if (error) return NextResponse.json({ error: { code: 'VALIDATION', message: error.message } }, { status: 400 });
    await writePartySpine(data.id, 'vendor', { name: data.legal_name, email: data.email, phone: data.phone, terms: data.payment_terms_days, is1099: data.is_1099_vendor });
    return NextResponse.json({ data: { ...data, source: 'acct_vendors', roles: ['vendor'] } }, { status: 201 });
  }

  if (role === 'supplier') {
    const baseName = body.name || body.company_name || 'Supplier';
    const baseSlug = baseName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'supplier';
    // Slug is REQUIRED + unique — dedupe against existing rows.
    const { data: existing } = await supabaseAdmin()
      .from('suppliers')
      .select('slug')
      .like('slug', `${baseSlug}%`);
    const taken = new Set((existing || []).map((r: { slug: string }) => r.slug));
    let slug = baseSlug;
    for (let i = 2; taken.has(slug); i++) slug = `${baseSlug}-${i}`;

    const apiBaseUrl = body.api_base_url || body.api_url || null;
    const { data, error } = await supabaseAdmin()
      .from('suppliers')
      .insert({
        name: baseName,
        slug,
        kind: body.kind || 'pod',
        // Manual form entries are 'manual'; an API URL implies 'api'.
        catalog_source: apiBaseUrl ? 'api' : 'manual',
        api_base_url: apiBaseUrl,
        ordering_status: body.ordering_status || 'catalog_only',
      })
      .select('id, name, kind, ordering_status, created_at')
      .single();
    if (error) return NextResponse.json({ error: { code: 'VALIDATION', message: error.message } }, { status: 400 });
    await writePartySpine(data.id, 'supplier', { name: data.name, kind: data.kind, orderingStatus: data.ordering_status });
    return NextResponse.json({ data: { ...data, source: 'suppliers', roles: ['supplier'] } }, { status: 201 });
  }

  if (role === 'lead') {
    const statusVocab = ['new', 'contacted', 'qualified', 'pending', 'working', 'converted', 'lost'];
    const rawStatus = String(body.status || 'new').toLowerCase().replace(/\s+/g, '_');
    const { data, error } = await supabaseAdmin()
      .from('crm_leads')
      .insert({
        tenant_id: DEFAULT_TENANT_ID,
        contact_name: body.name || [body.first_name, body.last_name].filter(Boolean).join(' ') || null,
        email: body.email || null,
        phone: body.phone || null,
        lead_source: body.lead_source || 'manual',
        lead_type: body.lead_type || 'general',
        status: statusVocab.includes(rawStatus) ? rawStatus : 'new',
        first_contact_at: new Date().toISOString(),
        next_follow_up_at: body.next_follow_up_at || null,
        notes: body.notes || null,
      })
      .select('id, contact_name, email, phone, status, created_at')
      .single();
    if (error) return NextResponse.json({ error: { code: 'VALIDATION', message: error.message } }, { status: 400 });
    await writePartySpine(data.id, 'lead', { name: data.contact_name, email: data.email, phone: data.phone, status: data.status });
    return NextResponse.json({ data: { ...data, source: 'crm_leads', roles: ['lead'] } }, { status: 201 });
  }

  if (role === 'seller') {
    // Sellers are a contact type in the unified party model. The canonical
    // record lands in `sellers` (contact-shaped: legal/display name, email,
    // phone, website, commission_rate) and the extended self-serve profile
    // lands in `seller_self_serve_profiles` — same chain POST /api/sellers
    // uses, so both the Parties module and the Seller relationships module
    // read the same rows.
    const legalName = String(body.name || body.legal_name || '').trim();
    if (!legalName) {
      return NextResponse.json({ error: { code: 'VALIDATION', message: 'Legal name is required' } }, { status: 400 });
    }
    const displayName = String(body.display_name || body.display || '').trim() || legalName;
    const applicantType =
      body.applicant_type === 'business' || body.applicant_type === 'business_seller'
        ? 'business_seller'
        : 'individual_seller';

    // slug is REQUIRED + unique — dedupe against existing rows.
    const baseSlug = legalName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'seller';
    const { data: existing } = await supabaseAdmin()
      .from('sellers')
      .select('slug')
      .like('slug', `${baseSlug}%`);
    const taken = new Set((existing || []).map((r: { slug: string }) => r.slug));
    let slug = baseSlug;
    for (let i = 2; taken.has(slug); i++) slug = `${baseSlug}-${i}`;

    const commissionRatePct =
      body.commission_rate != null && body.commission_rate !== ''
        ? Number(body.commission_rate)
        : null;
    if (commissionRatePct != null && (Number.isNaN(commissionRatePct) || commissionRatePct < 0 || commissionRatePct > 100)) {
      return NextResponse.json({ error: { code: 'VALIDATION', message: 'commission_rate must be a percentage between 0 and 100' } }, { status: 400 });
    }

    const sb = supabaseAdmin();
    // 1. canonical sellers row
    const { data: sellerRow, error: sellerError } = await sb
      .from('sellers')
      .insert({
        tenant_id: DEFAULT_TENANT_ID,
        seller_type: 'marketplace',
        legal_name: legalName,
        display_name: displayName,
        slug,
        email: body.email || null,
        phone: body.phone || null,
        website: body.website || null,
        // The column stores a 0–1 fraction (numeric(4,4)-style); the API
        // contract speaks percent (12.5 → 0.125) so forms stay human.
        commission_rate: commissionRatePct != null ? commissionRatePct / 100 : null,
      })
      .select('id, legal_name, display_name, email, phone, website, commission_rate, status, seller_type, slug, created_at')
      .single();
    if (sellerError) return NextResponse.json({ error: { code: 'VALIDATION', message: sellerError.message } }, { status: 400 });

    // 2. self-serve profile row (fresh applicant account id; a new seller is
    //    below the tax reporting threshold → 'not_required')
    const { error: profileError } = await sb
      .from('seller_self_serve_profiles')
      .insert({
        tenant_id: DEFAULT_TENANT_ID,
        seller_id: sellerRow.id,
        user_id: crypto.randomUUID(),
        legal_name: legalName,
        display_name: displayName,
        applicant_type: applicantType,
        tax_form_status: 'not_required',
        owners: {},
        categories: {},
      });
    if (profileError) {
      // roll the canonical row back so a failed profile leaves no orphan seller
      await sb.from('sellers').delete().eq('id', sellerRow.id);
      return NextResponse.json({ error: { code: 'VALIDATION', message: profileError.message } }, { status: 400 });
    }

    await writePartySpine(sellerRow.id, 'seller', { name: sellerRow.display_name || sellerRow.legal_name, email: sellerRow.email, phone: sellerRow.phone, website: sellerRow.website, commissionRate: sellerRow.commission_rate });
    return NextResponse.json({ data: {
      ...sellerRow,
      // percent at the API boundary (stored as a 0–1 fraction)
      commission_rate: sellerRow.commission_rate != null ? Number(sellerRow.commission_rate) * 100 : null,
      source: 'sellers', roles: ['seller'],
    } }, { status: 201 });
  }

  return NextResponse.json({ error: { code: 'VALIDATION', message: `Unknown role: ${role}` } }, { status: 400 });
}
