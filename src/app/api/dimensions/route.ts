import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * GET /api/dimensions — tracking dimensions (Batch I).
 * A dimension is a reporting axis (department, project, region...).
 * Each row carries its value count. POST — create (code + name +
 * data_type; the engine puts no CHECK on data_type, so the screen
 * offers text | number | date | list and stores the choice).
 */
export async function GET() {
  const [{ data: dims, error: dErr }, { data: values, error: vErr }] = await Promise.all([
    supabaseAdmin().from('acct_dimensions').select('*').eq('tenant_id', DEFAULT_TENANT_ID).order('code'),
    supabaseAdmin().from('acct_dimension_values').select('dimension_id').eq('tenant_id', DEFAULT_TENANT_ID),
  ]);
  if (dErr) return err('INTERNAL', dErr.message, 500);
  if (vErr) return err('INTERNAL', vErr.message, 500);
  const counts = new Map<string, number>();
  for (const v of (values ?? []) as { dimension_id: string }[]) counts.set(v.dimension_id, (counts.get(v.dimension_id) || 0) + 1);
  return NextResponse.json({
    data: ((dims ?? []) as Record<string, unknown>[]).map((d) => ({
      id: d.id,
      code: d.code,
      name: d.name,
      dataType: d.data_type,
      isRequired: d.is_required,
      isActive: d.is_active,
      valueCount: counts.get(d.id as string) || 0,
    })),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const code = String(body.code || '').trim();
  const name = String(body.name || '').trim();
  const dataType = String(body.dataType || 'text').trim();
  if (!code) return err('VALIDATION', 'code is required', 400);
  if (!name) return err('VALIDATION', 'name is required', 400);
  const { data, error } = await supabaseAdmin().from('acct_dimensions').insert({
    tenant_id: DEFAULT_TENANT_ID,
    code,
    name,
    data_type: dataType,
    is_required: !!body.isRequired,
    is_active: body.isActive !== false,
  }).select().single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { id: data.id, code: data.code, name: data.name, dataType: data.data_type, isRequired: data.is_required, isActive: data.is_active, valueCount: 0 } }, { status: 201 });
}
