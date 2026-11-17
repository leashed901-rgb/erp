import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/**
 * GET /api/staff — the staff directory: every crm_staff row with its
 * payroll identity joined in (payroll_employees.staff_id → pay_type,
 * pay_rate, pay_schedule). Staff are parties with an employee role;
 * this is the list contract for the Staff rail surface. Employee
 * type and wage live on the payroll record, not on the staff row.
 */
export async function GET() {
  const sb = supabaseAdmin();
  const [staffRes, empRes] = await Promise.all([
    sb
      .from('crm_staff')
      .select('id, party_id, display_name, first_name, last_name, email, phone, role, is_service_staff, is_active, hire_date, termination_date, color_label, commission_rate, salary_period')
      .eq('tenant_id', DEFAULT_TENANT_ID)
      .order('display_name', { ascending: true })
      .limit(500),
    sb
      .from('payroll_employees')
      .select('id, staff_id, pay_type, pay_rate, pay_schedule, is_active')
      .eq('tenant_id', DEFAULT_TENANT_ID),
  ]);
  if (staffRes.error) {
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: staffRes.error.message, requestId: crypto.randomUUID() } },
      { status: 500 },
    );
  }
  const empByStaff = new Map<string, { id: string; pay_type: string | null; pay_rate: number | null; pay_schedule: string | null; is_active: boolean }>();
  for (const e of empRes.data || []) {
    if (e.staff_id) empByStaff.set(e.staff_id, e);
  }
  const data = (staffRes.data || []).map((s) => ({
    ...s,
    payroll: empByStaff.get(s.id) || null,
  }));
  return NextResponse.json({ data });
}
