import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { apiError } from '@/lib/podServer';

/**
 * /api/v1/designs/:id/colorways — the design's colorways (design_colorways).
 * GET — list, sort asc. POST { name, hex?, pantone? } — add one.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: designId } = await params;
    const { data, error } = await supabaseAdmin()
      .from('design_colorways')
      .select('id,name,garment_color_hex,pantone_codes,is_default,sort')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('design_id', designId)
      .order('sort', { ascending: true });
    if (error) throw new Error(`design_colorways: ${error.message}`);
    return NextResponse.json({
      items: (data ?? []).map((c) => ({
        id: c.id as string,
        name: c.name as string,
        hex: (c.garment_color_hex as string | null) ?? null,
        pantone: ((c.pantone_codes as string[] | null) ?? [])[0] ?? null,
        is_default: Boolean(c.is_default),
      })),
    });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to list colorways.');
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: designId } = await params;
    const body = await req.json().catch(() => ({}));
    const name = String(body?.name ?? '').trim();
    if (!name) return apiError('name is required.', 400);
    const hex = typeof body?.hex === 'string' ? body.hex.trim() : null;
    const pantone = typeof body?.pantone === 'string' && body.pantone.trim() ? [body.pantone.trim()] : [];
    const { data: existing } = await supabaseAdmin()
      .from('design_colorways')
      .select('sort')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('design_id', designId)
      .order('sort', { ascending: false })
      .limit(1)
      .maybeSingle();
    const { data, error } = await supabaseAdmin()
      .from('design_colorways')
      .insert({
        tenant_id: DEFAULT_TENANT_ID,
        design_id: designId,
        name,
        garment_color_hex: hex,
        pantone_codes: pantone,
        is_default: false,
        sort: (existing?.sort ?? 0) + 1,
      })
      .select('id,name,garment_color_hex,pantone_codes,is_default')
      .single();
    if (error) throw new Error(`design_colorways insert: ${error.message}`);
    return NextResponse.json(
      {
        item: {
          id: data.id as string,
          name: data.name as string,
          hex: (data.garment_color_hex as string | null) ?? null,
          pantone: ((data.pantone_codes as string[] | null) ?? [])[0] ?? null,
          is_default: Boolean(data.is_default),
        },
      },
      { status: 201 },
    );
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to add colorway.');
  }
}
