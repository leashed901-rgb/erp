import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { apiError } from '@/lib/podServer';
import { loadTechPackSnapshot } from '@/lib/techPackSnapshot';
import { computeBomLedger, parseLedgerSettings, type LedgerMaterial } from '@/lib/bomLedger';

/**
 * GET /api/v1/tech-packs/:id/bom-ledger — the Reactive BOM Ledger, computed
 * on every read from the pack's own POMs, construction ops and priced
 * materials. Query params (all optional): fabricWidthCm (default 150),
 * markerEfficiency (0–1 or 0–100, default 0.85), wastePct (0–1 or 0–100,
 * default 0.05). Read-only; writes nothing — applying a computed quantity
 * to a BOM row goes through the existing POST /bom route.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const snapshot = await loadTechPackSnapshot(id);
    if (!snapshot) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Tech pack not found.', requestId: crypto.randomUUID() } },
        { status: 404 },
      );
    }
    const settings = parseLedgerSettings(new URL(req.url).searchParams);
    const materialIds = Array.from(
      new Set(
        (snapshot.bom as Array<Record<string, unknown>>)
          .map((b) => String(b.material_id ?? ''))
          .filter(Boolean),
      ),
    );
    const materialsById = new Map<string, LedgerMaterial>();
    if (materialIds.length > 0) {
      const { data } = await supabaseAdmin()
        .from('ds_materials')
        .select('id,code,name,kind,unit_cost,uom,weight_gsm,width_cm')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .in('id', materialIds);
      for (const m of (data ?? []) as Array<Record<string, unknown>>) {
        materialsById.set(String(m.id), m as unknown as LedgerMaterial);
      }
    }
    return NextResponse.json(computeBomLedger(snapshot, materialsById, settings));
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to compute BOM ledger.');
  }
}
