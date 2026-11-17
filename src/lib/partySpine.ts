/**
 * partySpine.ts — the party spine helper.
 * platform_parties is the single source of truth for "one record per
 * human/company." Every role-specific insert (crm_customers, acct_vendors,
 * suppliers, crm_leads, sellers) calls this to mirror the record into the
 * spine, so the unified party list reads from ONE table, not five.
 *
 * party_kind is 'person' or 'organization' (the schema's CHECK constraint).
 * The ROLE (customer/vendor/lead/seller) goes in metadata.roles.
 */
import { supabaseAdmin, DEFAULT_TENANT_ID } from './supabaseAdmin';
import type { Party as SharedParty } from '@platform/shared';

export async function writePartySpine(
  id: string,
  role: string,
  metadata: Record<string, unknown>,
) {
  // Infer party_kind: organization if there's a company or the role is
  // vendor/supplier (those are always companies); person otherwise.
  const isOrg =
    !!metadata.company ||
    !!metadata.company_name ||
    role === 'vendor' ||
    role === 'supplier';
  const party_kind = isOrg ? 'organization' : 'person';

  await supabaseAdmin()
    .from('platform_parties')
    .upsert(
      {
        id,
        tenant_id: DEFAULT_TENANT_ID,
        party_kind,
        metadata: { ...metadata, roles: [role] },
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'id' },
    );
}

/* ── Canonical Party DTO (doc 01) ─────────────────────────────
 * The Party DTO is DERIVED FROM platform_parties: one spine row in,
 * the @platform/shared Party contract + the UI list fields out.
 * Callers pass the raw spine row — never a source-table row — so the
 * unified party list speaks one shape regardless of which role table
 * originally created the record. */

export interface SpinePartyRow {
  id: string;
  party_kind: string;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
}

export type PartyListItem = SharedParty & {
  source: string;
  name: string;
  company: string | null;
  city: string | null;
  state: string | null;
  balance: number;
  lifetimeValue: number;
  lifecycleStage: string | null;
  terms: number | null;
  is1099: boolean;
  w9Received: boolean;
  isActive: boolean;
  orderingStatus: string | null;
  sellerType: string | null;
  sellerStatus: string | null;
  website: string | null;
  commissionRate: number | null;
  addedAt: string;
  lastActivity: string | null;
};

export function spineRowToPartyListItem(p: SpinePartyRow): PartyListItem {
  const m = (p.metadata || {}) as Record<string, any>;
  const roles: string[] = m.roles || [];
  const kind: 'person' | 'company' =
    p.party_kind === 'person' ? 'person' : 'company';
  const displayName: string = m.name || 'Unnamed';
  return {
    // SharedParty contract fields
    id: p.id,
    tenantId: DEFAULT_TENANT_ID,
    kind,
    displayName,
    email: m.email || null,
    phone: m.phone || null,
    roles,
    // UI list fields
    source: roles[0] || p.party_kind,
    name: displayName,
    company: m.company || null,
    city: m.city || null,
    state: m.state || null,
    balance: m.balance || 0,
    lifetimeValue: m.lifetimeValue || 0,
    lifecycleStage: m.status || null,
    terms: m.terms || null,
    is1099: m.is1099 || false,
    w9Received: m.w9Received || false,
    isActive: true,
    orderingStatus: m.orderingStatus || null,
    sellerType: m.sellerType || null,
    sellerStatus: m.sellerStatus || null,
    website: m.website || null,
    commissionRate: m.commissionRate || null,
    addedAt: p.created_at,
    lastActivity: p.updated_at,
  };
}
