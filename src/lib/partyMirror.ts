'use client';
/* partyMirror.ts — the Supabase → platformStore party bridge.
 *
 * Supabase is the SYSTEM OF RECORD for parties (crm_customers,
 * acct_vendors, suppliers, crm_leads). The document engine's party
 * pickers read platformStore.parties (fast, offline, seeded demo rows).
 * This mapper keeps the store a live MIRROR of Supabase:
 *
 *   - On shell boot: GET /api/parties → mirror every row into the store.
 *   - After every PartyFormDrawer save: the created/updated row is
 *     mirrored so the pickers see it immediately.
 *
 * One-way only (Supabase → store). Writes NEVER flow this direction —
 * creating a party always goes through POST /api/parties.
 *
 * The API contract for a Party is defined in @platform/shared (the
 * canonical record: id, tenantId, kind, displayName, email, phone,
 * roles). `toSharedParty` produces that contract record from a
 * Supabase row, so /api/parties GET responses can be typed as
 * `SharedParty & { …extra UI fields }` — the API boundary speaks the
 * shared contract while the UI keeps its richer shape.
 */
import type { Party, PartyRole } from '@/lib/platformStore';
import type { Party as SharedParty } from '@platform/shared';

/** A row from /api/parties (list shape) or /api/parties POST/PATCH (detail shape). */
export interface SupabasePartyRecord {
  id: string;
  source: string; // 'crm_customers' | 'acct_vendors' | 'suppliers' | 'crm_leads' | 'sellers'
  roles?: string[];
  // list shape
  name?: string | null;
  email?: string | null;
  phone?: string | null;
  balance?: number | null;
  addedAt?: string | null;
  company?: string | null;
  // detail shape (varies by table)
  first_name?: string | null;
  last_name?: string | null;
  company_name?: string | null;
  preferred_name?: string | null;
  legal_name?: string | null;
  contact_name?: string | null;
  address_line1?: string | null;
  address_line2?: string | null;
  city?: string | null;
  state?: string | null;
  postal_code?: string | null;
  country?: string | null;
  outstanding_balance?: number | null;
  payment_terms_days?: number | null;
  tax_number?: string | null;
  is_1099_vendor?: boolean | null;
  // sellers
  display_name?: string | null;
  website?: string | null;
  commission_rate?: number | null;
  notes?: string | null;
  lead_notes?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
  last_activity_at?: string | null;
  [k: string]: unknown;
}

export function storeRoleForSource(source: string): PartyRole {
  if (source === 'acct_vendors') return 'Vendor';
  if (source === 'suppliers') return 'Supplier';
  if (source === 'crm_leads') return 'Lead';
  if (source === 'sellers') return 'Seller';
  return 'Customer';
}

/** Map a Supabase party row → the platformStore Party shape. */
export function supabaseRecordToStoreParty(rec: SupabasePartyRecord): Party {
  const role = storeRoleForSource(rec.source);
  const personName = [rec.first_name, rec.last_name].filter(Boolean).join(' ');
  const name =
    personName ||
    rec.name ||
    rec.company_name ||
    rec.legal_name ||
    rec.contact_name ||
    rec.display_name ||
    rec.company ||
    'Unnamed';
  const today = new Date().toISOString().slice(0, 10);
  return {
    id: rec.id, // Supabase uuid — upsert key for the mirror
    name,
    displayName: rec.preferred_name || name,
    firstName: rec.first_name || '',
    lastName: rec.last_name || '',
    email: rec.email || '',
    phone: rec.phone || '',
    roles: [role],
    balance: rec.outstanding_balance ?? rec.balance ?? 0,
    address: [rec.address_line1, rec.address_line2].filter(Boolean).join(' '),
    city: rec.city || '',
    state: rec.state || '',
    zip: rec.postal_code || '',
    country: rec.country || '',
    terms: rec.payment_terms_days ? `Net ${rec.payment_terms_days}` : (rec.commission_rate != null ? `${Number(rec.commission_rate)}% commission` : ''),
    creditLimit: 0,
    taxId: rec.tax_number || (rec as { tax_id_last4?: string | null }).tax_id_last4 ? `••••${(rec as { tax_id_last4?: string | null }).tax_id_last4}` : '',
    taxExempt: false,
    track1099: !!rec.is_1099_vendor,
    notes: rec.lead_notes || rec.notes || '',
    tags: [],
    owner: 'Current user',
    segmentIds: [],
    added: (rec.created_at || rec.addedAt || '').toString().slice(0, 10) || today,
    lastActivity: (rec.updated_at || rec.last_activity_at || '').toString().slice(0, 10) || today,
  };
}

/**
 * Produce the canonical @platform/shared Party contract record from a
 * Supabase row. The store Party is the UI shape; this is the API shape
 * — use it at any boundary that crosses packages (e.g. when posting to
 * /api/parties, or when sending a Party reference to a future
 * storefront-sdk / apps/api consumer that imports @platform/shared).
 *
 * `tenantId` is required by the contract record but not stored on the
 * Supabase row in the list shape — pass DEFAULT_TENANT_ID (server) or
 * the active workspace id (client) from the caller.
 */
export function toSharedParty(
  rec: SupabasePartyRecord,
  tenantId: string,
): SharedParty {
  const role = storeRoleForSource(rec.source);
  const personName = [rec.first_name, rec.last_name].filter(Boolean).join(' ');
  const displayName =
    rec.preferred_name ||
    personName ||
    rec.name ||
    rec.company_name ||
    rec.legal_name ||
    rec.contact_name ||
    rec.display_name ||
    rec.company ||
    'Unnamed';
  const kind: 'person' | 'company' =
    role === 'Vendor' || role === 'Supplier' || !!rec.company_name || !!rec.legal_name
      ? 'company'
      : 'person';
  return {
    id: rec.id,
    tenantId,
    kind,
    displayName,
    email: rec.email ?? null,
    phone: rec.phone ?? null,
    roles: [role.toLowerCase()],
  };
}
