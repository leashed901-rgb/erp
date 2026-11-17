import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/* GET /api/cms/schemas — the section library: active cms_block_schemas
   rows with their field definitions. The page editor renders its Add
   section menu and each section's edit form from this. */
export async function GET() {
  const { data, error } = await supabaseAdmin()
    .from('cms_block_schemas')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('status', 'active')
    .order('label', { ascending: true });
  if (error) return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  return NextResponse.json({
    data: (data || []).map((r) => ({
      id: String(r.id),
      componentType: String(r.component_type || ''),
      version: String(r.version || '1'),
      label: String(r.label || r.component_type || ''),
      description: String(r.description || ''),
      fields: Array.isArray(r.fields) ? r.fields : [],
      allowedSlots: Array.isArray(r.allowed_slots) ? r.allowed_slots : [],
      icon: String(r.icon || 'widgets'),
    })),
  });
}
