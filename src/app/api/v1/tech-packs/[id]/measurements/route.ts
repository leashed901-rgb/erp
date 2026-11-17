import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import { apiError } from '@/lib/podServer';

/**
 * POST /api/v1/tech-packs/:id/measurements — upsert measurement cells.
 * Body: { rows: [{ pom_id, size_label, value, tol_plus?, tol_minus? }] }
 * (one cell per POM × size; existing cells are updated in place).
 * DELETE ?pomId=&sizeLabel= removes one cell. Tenant-scoped; the
 * ds__tp_child_guard trigger locks writes once the pack is approved/released.
 */
async function ownTechPack(id: string) {
  const { data } = await supabaseAdmin()
    .from('tech_packs')
    .select('id')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .single();
  return Boolean(data);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: tpId } = await params;
    if (!(await ownTechPack(tpId))) {
      return NextResponse.json(
        { error: { code: 'NOT_FOUND', message: 'Tech pack not found.', requestId: crypto.randomUUID() } },
        { status: 404 },
      );
    }
    const body = await req.json();
    const rows = Array.isArray(body?.rows) ? body.rows : [];
    if (rows.length === 0) {
      return NextResponse.json(
        { error: { code: 'VALIDATION', message: 'rows is required.', requestId: crypto.randomUUID() } },
        { status: 400 },
      );
    }
    const saved: unknown[] = [];
    for (const r of rows) {
      const pomId = String(r?.pom_id ?? '').trim();
      const sizeLabel = String(r?.size_label ?? '').trim();
      if (!pomId || !sizeLabel || r?.value === undefined || r?.value === null || r?.value === '') continue;
      const { data: existing } = await supabaseAdmin()
        .from('tech_pack_measurements')
        .select('id')
        .eq('tenant_id', DEFAULT_TENANT_ID)
        .eq('tech_pack_id', tpId)
        .eq('pom_id', pomId)
        .eq('size_label', sizeLabel)
        .maybeSingle();
      const row = {
        tenant_id: DEFAULT_TENANT_ID,
        tech_pack_id: tpId,
        pom_id: pomId,
        size_label: sizeLabel,
        value: r.value,
        tol_plus: r.tol_plus ?? null,
        tol_minus: r.tol_minus ?? null,
      };
      const { data, error } = existing
        ? await supabaseAdmin()
            .from('tech_pack_measurements')
            .update(row)
            .eq('id', existing.id)
            .select()
            .single()
        : await supabaseAdmin().from('tech_pack_measurements').insert(row).select().single();
      if (error) throw new Error(`tech-pack measurements: ${error.message}`);
      saved.push(data);
    }
    return NextResponse.json({ saved: saved.length, items: saved });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to save measurements.');
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id: tpId } = await params;
    const sp = new URL(req.url).searchParams;
    const pomId = sp.get('pomId');
    const sizeLabel = sp.get('sizeLabel');
    if (!pomId || !sizeLabel) {
      return NextResponse.json(
        { error: { code: 'VALIDATION', message: 'pomId and sizeLabel are required.', requestId: crypto.randomUUID() } },
        { status: 400 },
      );
    }
    const { error } = await supabaseAdmin()
      .from('tech_pack_measurements')
      .delete()
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .eq('tech_pack_id', tpId)
      .eq('pom_id', pomId)
      .eq('size_label', sizeLabel);
    if (error) throw new Error(`tech-pack measurements delete: ${error.message}`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return apiError(err instanceof Error ? err.message : 'Failed to delete measurement.');
  }
}
