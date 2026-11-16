/* Support types (doc 26) — DTOs over the support_* tables. */

export interface Ticket {
  id: string;
  ticketRef: string;
  subject: string;
  status: string;
  priority: string;
  category: string;
  ticketType: string | null;
  sourceChannel: string | null;
  requesterType: string;
  requesterName: string | null;
  requesterEmail: string | null;
  requesterCustomerId: string | null;
  assignedStaffId: string | null;
  assignedTeamId: string | null;
  conversationId: string;
  orderId: string | null;
  productId: string | null;
  tags: string[];
  visibilityLevel: string;
  onHold: boolean;
  firstResponseDueAt: string | null;
  nextReplyDueAt: string | null;
  resolutionDueAt: string | null;
  firstResponseBreachedAt: string | null;
  resolutionBreachedAt: string | null;
  slaPolicyId: string | null;
  messageCount: number;
  lastMessageAt: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
  mergedIntoId: string | null;
  csatScore: number | null;
  createdAt: string;
  updatedAt: string;
}

export interface TicketEvent {
  id: string;
  ticketId: string;
  eventType: string;
  detail: string;
  actorType: string | null;
  actorStaffId: string | null;
  actorLabel: string | null;
  visibility: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface SlaPolicy {
  id: string;
  name: string;
  firstResponseMinutes: number | null;
  nextReplyMinutes: number | null;
  resolutionMinutes: number | null;
  usesBusinessHours: boolean;
  isDefault: boolean;
  isActive: boolean;
}

export interface Macro {
  id: string;
  name: string;
  description: string | null;
  actions: Array<Record<string, unknown>>;
  isActive: boolean;
}

export interface SupportQueue {
  id: string;
  name: string;
  ownerType: string;
  filter: Record<string, unknown>;
  isShared: boolean;
  sortOrder: number;
}

export interface RoutingRule {
  id: string;
  name: string;
  ruleOrder: number;
  conditions: Record<string, unknown>;
  strategy: string;
  targetTeamId: string | null;
  targetStaffId: string | null;
  setPriority: string | null;
  slaPolicyId: string | null;
  isActive: boolean;
}

export interface SupportAutomation {
  id: string;
  name: string;
  triggerEvent: string;
  conditions: Record<string, unknown>;
  actions: unknown[];
  dryRun: boolean;
  killSwitch: boolean;
  isActive: boolean;
}

export interface BusinessHours {
  id: string;
  name: string;
  timezone: string;
  schedule: Record<string, unknown>;
  isDefault: boolean;
  isActive: boolean;
}

export interface Holiday {
  id: string;
  businessHoursId: string | null;
  holidayDate: string;
  name: string;
}

export interface KbArticle {
  id: string;
  title: string;
  summary: string | null;
  body: string | null;
  collection: string;
  audience: string;
  ownerName: string | null;
  status: string;
  usageCount: number;
  updatedAt: string;
}

export interface CannedReply {
  id: string;
  title: string;
  body: string;
  categoryCode: string | null;
  isActive: boolean;
}

export interface OncallSchedule {
  id: string;
  teamId: string | null;
  name: string;
  timezone: string;
  rotationType: string;
  shiftLengthHours: number;
  rotationStartAt: string;
  covers: string;
  isActive: boolean;
}

export interface OncallOverride {
  id: string;
  scheduleId: string;
  staffId: string;
  startsAt: string;
  endsAt: string;
  reason: string | null;
}

export interface EscalationPolicy {
  id: string;
  name: string;
  repeatCount: number;
  triggerOn: string[];
  matchPriorities: string[];
  isDefault: boolean;
  isActive: boolean;
}

export interface SupportPage {
  id: string;
  policyId: string;
  ticketId: string | null;
  currentStep: number;
  loopNo: number;
  pagedStaffId: string | null;
  status: string;
  summary: string;
  triggeredBy: string;
  triggeredAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
}

export interface SupportContextCard {
  customer: {
    id: string;
    name: string | null;
    email: string | null;
    customerSince: string | null;
    lifetimeValue: number | null;
    lifecycleStage: string | null;
  } | null;
  openTickets: number;
  previousTickets: Array<{ id: string; ticketRef: string; subject: string; status: string; createdAt: string }>;
  order: { id: string; number: string | null; status: string | null; total: number | null } | null;
}

type Row = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v : null);
const num = (v: unknown) => (v != null && !Number.isNaN(Number(v)) ? Number(v) : null);
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
const arr = (v: unknown): string[] => (Array.isArray(v) ? v.map(String) : []);

export function toTicket(r: Row): Ticket {
  return {
    id: String(r.id),
    ticketRef: String(r.ticket_ref || ''),
    subject: String(r.subject || ''),
    status: String(r.status || 'new'),
    priority: String(r.priority || 'normal'),
    category: String(r.category || ''),
    ticketType: str(r.ticket_type),
    sourceChannel: str(r.source_channel),
    requesterType: String(r.requester_type || 'customer'),
    requesterName: str(r.requester_name),
    requesterEmail: str(r.requester_email),
    requesterCustomerId: str(r.requester_customer_id),
    assignedStaffId: str(r.assigned_staff_id),
    assignedTeamId: str(r.assigned_team_id),
    conversationId: String(r.conversation_id || ''),
    orderId: str(r.order_id),
    productId: str(r.product_id),
    tags: arr(r.tags),
    visibilityLevel: String(r.visibility_level || 'public'),
    onHold: Boolean(r.on_hold),
    firstResponseDueAt: str(r.first_response_due_at),
    nextReplyDueAt: str(r.next_reply_due_at),
    resolutionDueAt: str(r.resolution_due_at),
    firstResponseBreachedAt: str(r.first_response_breached_at),
    resolutionBreachedAt: str(r.resolution_breached_at),
    slaPolicyId: str(r.sla_policy_id),
    messageCount: num(r.message_count) ?? 0,
    lastMessageAt: str(r.last_message_at),
    resolvedAt: str(r.resolved_at),
    closedAt: str(r.closed_at),
    mergedIntoId: str(r.merged_into_id),
    csatScore: num(r.csat_score),
    createdAt: String(r.created_at || ''),
    updatedAt: String(r.updated_at || ''),
  };
}

export function toTicketEvent(r: Row): TicketEvent {
  return {
    id: String(r.id),
    ticketId: String(r.ticket_id || ''),
    eventType: String(r.event_type || 'message'),
    detail: typeof r.detail === 'string' ? r.detail : '',
    actorType: str(r.actor_type),
    actorStaffId: str(r.actor_staff_id),
    actorLabel: str(r.actor_label),
    visibility: str(r.visibility),
    payload: obj(r.payload),
    createdAt: String(r.created_at || ''),
  };
}

export function toSlaPolicy(r: Row): SlaPolicy {
  return {
    id: String(r.id),
    name: String(r.name || ''),
    firstResponseMinutes: num(r.first_response_minutes),
    nextReplyMinutes: num(r.next_reply_minutes),
    resolutionMinutes: num(r.resolution_minutes),
    usesBusinessHours: Boolean(r.uses_business_hours),
    isDefault: Boolean(r.is_default),
    isActive: Boolean(r.is_active),
  };
}

export function toMacro(r: Row): Macro {
  return {
    id: String(r.id),
    name: String(r.name || ''),
    description: str(r.description),
    actions: Array.isArray(r.actions) ? (r.actions as Array<Record<string, unknown>>) : [],
    isActive: Boolean(r.is_active),
  };
}

export function toSupportQueue(r: Row): SupportQueue {
  return {
    id: String(r.id),
    name: String(r.name || ''),
    ownerType: String(r.owner_type || ''),
    filter: obj(r.filter),
    isShared: Boolean(r.is_shared),
    sortOrder: num(r.sort_order) ?? 0,
  };
}

export function toRoutingRule(r: Row): RoutingRule {
  return {
    id: String(r.id),
    name: String(r.name || ''),
    ruleOrder: num(r.rule_order) ?? 0,
    conditions: obj(r.conditions),
    strategy: String(r.strategy || ''),
    targetTeamId: str(r.target_team_id),
    targetStaffId: str(r.target_staff_id),
    setPriority: str(r.set_priority),
    slaPolicyId: str(r.sla_policy_id),
    isActive: Boolean(r.is_active),
  };
}

export function toSupportAutomation(r: Row): SupportAutomation {
  return {
    id: String(r.id),
    name: String(r.name || ''),
    triggerEvent: String(r.trigger_event || ''),
    conditions: obj(r.conditions),
    actions: Array.isArray(r.actions) ? (r.actions as unknown[]) : [],
    dryRun: Boolean(r.dry_run),
    killSwitch: Boolean(r.kill_switch),
    isActive: Boolean(r.is_active),
  };
}

export function toBusinessHours(r: Row): BusinessHours {
  return {
    id: String(r.id),
    name: String(r.name || ''),
    timezone: String(r.timezone || ''),
    schedule: obj(r.schedule),
    isDefault: Boolean(r.is_default),
    isActive: Boolean(r.is_active),
  };
}

export function toHoliday(r: Row): Holiday {
  return {
    id: String(r.id),
    businessHoursId: str(r.business_hours_id),
    holidayDate: String(r.holiday_date || ''),
    name: String(r.name || ''),
  };
}

export function toKbArticle(r: Row): KbArticle {
  return {
    id: String(r.id),
    title: String(r.title || ''),
    summary: str(r.summary),
    body: str(r.body),
    collection: String(r.collection || ''),
    audience: String(r.audience || ''),
    ownerName: str(r.owner_name),
    status: String(r.status || 'draft'),
    usageCount: num(r.usage_count) ?? 0,
    updatedAt: String(r.updated_at || ''),
  };
}

export function toCannedReply(r: Row): CannedReply {
  return {
    id: String(r.id),
    title: String(r.title || ''),
    body: String(r.body || ''),
    categoryCode: str(r.category_code),
    isActive: Boolean(r.is_active),
  };
}

export function toOncallSchedule(r: Row): OncallSchedule {
  return {
    id: String(r.id),
    teamId: str(r.team_id),
    name: String(r.name || ''),
    timezone: String(r.timezone || ''),
    rotationType: String(r.rotation_type || ''),
    shiftLengthHours: num(r.shift_length_hours) ?? 0,
    rotationStartAt: String(r.rotation_start_at || ''),
    covers: String(r.covers || ''),
    isActive: Boolean(r.is_active),
  };
}

export function toEscalationPolicy(r: Row): EscalationPolicy {
  return {
    id: String(r.id),
    name: String(r.name || ''),
    repeatCount: num(r.repeat_count) ?? 0,
    triggerOn: arr(r.trigger_on),
    matchPriorities: arr(r.match_priorities),
    isDefault: Boolean(r.is_default),
    isActive: Boolean(r.is_active),
  };
}

export function toSupportPage(r: Row): SupportPage {
  return {
    id: String(r.id),
    policyId: String(r.policy_id || ''),
    ticketId: str(r.ticket_id),
    currentStep: num(r.current_step) ?? 1,
    loopNo: num(r.loop_no) ?? 1,
    pagedStaffId: str(r.paged_staff_id),
    status: String(r.status || ''),
    summary: String(r.summary || ''),
    triggeredBy: String(r.triggered_by || ''),
    triggeredAt: String(r.triggered_at || ''),
    acknowledgedAt: str(r.acknowledged_at),
    resolvedAt: str(r.resolved_at),
  };
}
