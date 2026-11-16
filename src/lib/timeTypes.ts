/* Time tracking DTOs (doc 13). */

export interface TimeEntry {
  id: string;
  employeeId: string | null;
  vendorId: string | null;
  userId: string | null;
  customerId: string | null;
  itemId: string | null;
  taskId: string | null;
  workDate: string;
  hours: number;
  rate: number | null;
  billable: boolean;
  description: string | null;
  status: string;
  invoiceId: string | null;
  amount: number; // hours × rate
}

export interface TimeOffRequest {
  id: string;
  staffId: string;
  requestType: string;
  startsOn: string;
  endsOn: string;
  isPartialDay: boolean;
  hoursRequested: number | null;
  reason: string | null;
  status: string; // pending | approved | denied | …
  reviewedBy: string | null;
  reviewedAt: string | null;
  reviewNote: string | null;
  blocksBooking: boolean;
}

export interface ShiftTemplate {
  id: string;
  name: string;
  locationId: string | null;
  dayOfWeek: number | null;
  startsAt: string | null;
  endsAt: string | null;
  breakMinutes: number | null;
  role: string | null;
  requiredHeadcount: number | null;
  isActive: boolean;
}

export function toTimeEntry(r: Record<string, unknown>): TimeEntry {
  const hours = Number(r.hours) || 0;
  const rate = r.rate != null ? Number(r.rate) : null;
  return {
    id: String(r.id),
    employeeId: (r.employee_id as string) || null,
    vendorId: (r.vendor_id as string) || null,
    userId: (r.user_id as string) || null,
    customerId: (r.customer_id as string) || null,
    itemId: (r.item_id as string) || null,
    taskId: (r.task_id as string) || null,
    workDate: String(r.work_date || ''),
    hours,
    rate,
    billable: Boolean(r.billable),
    description: (r.description as string) || null,
    status: String(r.status || ''),
    invoiceId: (r.invoice_id as string) || null,
    amount: rate != null ? hours * rate : 0,
  };
}

export function toTimeOffRequest(r: Record<string, unknown>): TimeOffRequest {
  return {
    id: String(r.id),
    staffId: String(r.staff_id || ''),
    requestType: String(r.request_type || ''),
    startsOn: String(r.starts_on || ''),
    endsOn: String(r.ends_on || ''),
    isPartialDay: Boolean(r.is_partial_day),
    hoursRequested: r.hours_requested != null ? Number(r.hours_requested) : null,
    reason: (r.reason as string) || null,
    status: String(r.status || ''),
    reviewedBy: (r.reviewed_by as string) || null,
    reviewedAt: (r.reviewed_at as string) || null,
    reviewNote: (r.review_note as string) || null,
    blocksBooking: Boolean(r.blocks_booking),
  };
}
