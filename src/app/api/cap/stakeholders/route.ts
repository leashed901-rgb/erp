import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status = 400) {
  return NextResponse.json({ error: { code, message } }, { status });
}

const STAKEHOLDER_TYPES = ['founder', 'employee', 'advisor', 'consultant', 'investor', 'entity', 'board_member', 'other'];

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const name = String(body.name ?? '').trim();
    if (!name) return err('VALIDATION', 'Stakeholder name is required.');
    const type = String(body.type ?? body.stakeholder_type ?? 'other').toLowerCase();
    if (!STAKEHOLDER_TYPES.includes(type)) return err('VALIDATION', `stakeholder_type must be one of: ${STAKEHOLDER_TYPES.join(', ')}`);
    const { data, error } = await supabaseAdmin()
      .from('cap_stakeholders')
      .insert({
        tenant_id: DEFAULT_TENANT_ID,
        party_id: body.party_id ?? null,
        user_id: body.user_id ?? null,
        employee_id: body.employee_id ?? null,
        name,
        email: body.email ? String(body.email).trim() : null,
        stakeholder_type: type,
        is_us_person: body.is_us_person !== undefined ? Boolean(body.is_us_person) : true,
        tax_id_last4: body.tax_id_last4 ?? body.tax_id_masked ?? null,
        address: body.address ?? null,
        holder_kind: body.holder_kind ?? 'person',
        is_board: Boolean(body.is_board),
        is_insider: Boolean(body.is_insider),
      })
      .select()
      .single();
    if (error) return err('CREATE_FAILED', error.message);
    return NextResponse.json({ data }, { status: 201 });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to create stakeholder.';
    return err('CREATE_FAILED', message);
  }
}
