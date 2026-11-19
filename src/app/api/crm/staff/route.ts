import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/** GET /api/crm/staff — active staff for assignment pickers */
export async function GET() {
  const { data, error } = await supabaseAdmin()
    .from('crm_staff')
    .select('id, display_name, role, email')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('is_active', true)
    .order('display_name', { ascending: true })
    .limit(100);

  if (error) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  }

  return NextResponse.json({ data: data || [] });
}

/** POST /api/crm/staff — add a staff member (the team directory the
 *  assignment pickers and project member lists read from). */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'Invalid JSON body', requestId: crypto.randomUUID() } }, { status: 400 });
  }
  const displayName = typeof body.display_name === 'string' ? body.display_name.trim() : '';
  if (!displayName) {
    return NextResponse.json({ error: { code: 'VALIDATION', message: 'display_name is required', requestId: crypto.randomUUID() } }, { status: 400 });
  }
  const parts = displayName.split(/\s+/);
  const { data, error } = await supabaseAdmin()
    .from('crm_staff')
    .insert({
      tenant_id: DEFAULT_TENANT_ID,
      display_name: displayName,
      first_name: parts[0] || null,
      last_name: parts.slice(1).join(' ') || null,
      email: typeof body.email === 'string' ? body.email : null,
      role: typeof body.role === 'string' ? body.role : 'member',
      is_active: true,
    })
    .select('id, display_name, role, email')
    .single();

  if (error) {
    return NextResponse.json({ error: { code: 'INTERNAL', message: error.message, requestId: crypto.randomUUID() } }, { status: 500 });
  }
  return NextResponse.json({ data }, { status: 201 });
}
