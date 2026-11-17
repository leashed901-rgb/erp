import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

/**
 * GET /api/staff/[id] — the staff profile contract: the staff party
 * with every association joined in one payload, the way the party
 * profile serves a contact. Hours = shifts + time clock +
 * availability + blocked times; Wages = the payroll employee record
 * + timesheets + pay history (run items with their run's period).
 * Nothing here is a page of its own — it all belongs to the person.
 */
export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const sb = supabaseAdmin();

  const staffRes = await sb
    .from('crm_staff')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('id', id)
    .maybeSingle();
  if (staffRes.error) {
    return NextResponse.json(
      { error: { code: 'INTERNAL', message: staffRes.error.message, requestId: crypto.randomUUID() } },
      { status: 500 },
    );
  }
  if (!staffRes.data) {
    return NextResponse.json(
      { error: { code: 'NOT_FOUND', message: 'Staff member not found', requestId: crypto.randomUUID() } },
      { status: 404 },
    );
  }
  const staff = staffRes.data;

  const empRes = await sb
    .from('payroll_employees')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('staff_id', id)
    .maybeSingle();
  const employee = empRes.data || null;

  const [shifts, clock, availability, blocked, timesheets, runItems] = await Promise.all([
    sb.from('crm_staff_shifts').select('*').eq('tenant_id', DEFAULT_TENANT_ID).eq('staff_id', id).order('shift_date', { ascending: false }).limit(60),
    sb.from('crm_staff_time_clock_entries').select('*').eq('tenant_id', DEFAULT_TENANT_ID).eq('staff_id', id).order('clock_in', { ascending: false }).limit(60),
    sb.from('crm_staff_availability').select('*').eq('tenant_id', DEFAULT_TENANT_ID).eq('staff_id', id).order('day_of_week', { ascending: true }),
    sb.from('crm_staff_blocked_times').select('*').eq('tenant_id', DEFAULT_TENANT_ID).eq('staff_id', id).order('starts_at', { ascending: false }).limit(60),
    employee
      ? sb.from('payroll_timesheets').select('*').eq('tenant_id', DEFAULT_TENANT_ID).eq('employee_id', employee.id).order('week_start', { ascending: false }).limit(26)
      : Promise.resolve({ data: [] as unknown[] }),
    employee
      ? sb.from('payroll_run_items').select('*, payroll_runs(number, pay_period_start, pay_period_end, pay_date, status)').eq('employee_id', employee.id).order('created_at', { ascending: false }).limit(52)
      : Promise.resolve({ data: [] as unknown[] }),
  ]);

  return NextResponse.json({
    data: {
      staff,
      payroll: employee,
      hours: {
        shifts: shifts.data || [],
        clock: clock.data || [],
        availability: availability.data || [],
        blocked: blocked.data || [],
        timesheets: timesheets.data || [],
      },
      wages: {
        runItems: runItems.data || [],
      },
    },
  });
}
