import { NextRequest, NextResponse } from 'next/server';
import type { ImpactSummary } from '@/lib/contracts';

/** GET /api/v1/impact/{type}/{id} (spec §B.4.2)
 *  Returns the impact tier + counts for the ExistingRecordBanner (spec §1.9, rule 7). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ type: string; id: string }> }) {
  const { type, id } = await params;

  // Default: tier 1 (no warning). Real implementation would count
  // how many other records reference this one.
  const impact: ImpactSummary = {
    tier: 1,
    usedIn: [],
    impactCounts: {},
  };

  // For now, return tier 1. When the full reference-counting is built,
  // this will query for dependent records (invoices referencing this
  // party, orders referencing this item, etc.) and compute the tier.
  return NextResponse.json({ data: impact });
}
