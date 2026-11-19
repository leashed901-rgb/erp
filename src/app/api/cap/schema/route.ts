import { NextResponse } from 'next/server';

/**
 * GET /api/cap/schema — the cap/val table inventory + the CHECK-enum values
 * the DB enforces.
 *
 * NOTE: PostgREST does not expose information_schema, so live column detail
 * cannot be served from this route (the previous version tried
 * .from('information_schema.columns') and 400'd). The table list below is
 * taken from supabase/migrations/19_cap_table_valuation (10_tables.sql +
 * S110) — the same DDL that created the tables. Column detail lives in
 * those files; the enums here mirror the DB CHECKs.
 */
const TABLES = [
  'cap_board_approvals',
  'cap_convertibles',
  'cap_documents',
  'cap_equity_events',
  'cap_funding_rounds',
  'cap_issuances',
  'cap_issuer_profiles',
  'cap_option_exercises',
  'cap_option_grants',
  'cap_option_pools',
  'cap_qualified_individuals',
  'cap_share_classes',
  'cap_stakeholders',
  'cap_table_snapshots',
  'cap_valuations',
  'cap_vesting_schedules',
  'val_allocations',
  'val_approaches',
  'val_comps',
  'val_dlom',
  'val_inputs',
  'val_material_events',
  'val_reports',
  'val_requests',
];

export async function GET() {
  return NextResponse.json({
    data: {
      tables: TABLES,
      enums: {
        stakeholder_type: ['founder', 'employee', 'advisor', 'consultant', 'investor', 'entity', 'board_member', 'other'],
        class_type: ['common', 'preferred'],
        grant_type: ['iso', 'nso', 'rsu', 'sar'],
        instrument: ['safe_post_money', 'safe_pre_money', 'convertible_note'],
        convertible_status: ['outstanding', 'converted', 'repaid', 'cancelled'],
        round_type: ['pre_seed', 'seed', 'series_a', 'series_b', 'series_c', 'series_d', 'growth', 'bridge', 'other'],
        round_status: ['planned', 'open', 'closed', 'cancelled'],
        event_type: ['issuance', 'grant', 'exercise', 'cancellation', 'repurchase', 'transfer', 'conversion', 'round_closed', 'pool_increase', 'valuation', 'split'],
        approval_type: ['plan_adopt', 'pool_increase', 'grant_batch', 'issuance', 'valuation_adopt', 'financing', 'qualified_individual', 'other'],
        valuation_type: ['409a', 'board_fmv', 'investor', 'other'],
        valuation_status: ['draft', 'final', 'superseded'],
        snapshot_reason: ['valuation', 'grant', 'financing', 'board', 'audit', 'manual'],
        document_type: ['board_consent', 'stockholder_consent', 'stock_certificate', 'stock_purchase_agreement', 'safe', 'convertible_note', '409a_report', 'equity_plan', 'grant_agreement', 'exercise_notice', '83b_election', 'charter', 'bylaws', 'side_letter', 'other'],
      },
    },
  });
}
