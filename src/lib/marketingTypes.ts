/* Marketing types (doc 24) — DTOs over commerce_promotions (the
   canonical discount table), crm_campaigns, crm_automation_workflows,
   platform_webforms, newsletter_subscribers, marketing_suppressions. */

export interface PromotionTarget {
  kind: string; // all|collection|product|customers
  label: string;
  id?: string;
}

export interface Promotion {
  id: string;
  code: string;
  name: string;
  promotionType: string; // percent|fixed_amount|free_shipping|bogo
  value: number;
  minimumSubtotal: number | null;
  maximumDiscount: number | null;
  usageLimit: number | null;
  usageCount: number;
  active: boolean;
  startAt: string | null;
  endAt: string | null;
  isAutomatic: boolean;
  targets: PromotionTarget[];
  scope: string;
  perCustomerLimit: number | null;
  combinable: boolean;
  draft: boolean;
  bogo: { buy: number; get: number } | null;
}

export interface Campaign {
  id: string;
  name: string;
  campaignType: string;
  channel: string;
  status: string; // draft|scheduled|sending|sent|paused|cancelled
  templateId: string | null;
  segment: Record<string, unknown>;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}

export interface AutomationFlow {
  id: string;
  name: string;
  workflowType: string;
  status: string; // draft|active|paused|archived
  trigger: Record<string, unknown>;
  condition: Record<string, unknown>;
  action: Record<string, unknown>;
  allowReentry: boolean;
  createdAt: string;
}

export interface Webform {
  id: string;
  slug: string;
  name: string;
  creates: string | null;
  fields: unknown[];
  successMessage: string | null;
  redirectUrl: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface WebformSubmission {
  id: string;
  webformId: string;
  payload: Record<string, unknown>;
  sourceUrl: string | null;
  status: string;
  leadId: string | null;
  createdAt: string;
}

export interface Subscriber {
  id: string;
  email: string;
  source: string | null;
  confirmedAt: string | null;
  createdAt: string;
}

export interface Suppression {
  id: string;
  contact: string;
  channel: string;
  source: string;
  reason: string | null;
  createdAt: string;
}

type Row = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v : null);
const num = (v: unknown) => (v != null && !Number.isNaN(Number(v)) ? Number(v) : null);
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

export function toPromotion(r: Row): Promotion {
  const rules = obj(r.rules);
  return {
    id: String(r.id),
    code: String(r.code || ''),
    name: String(r.name || ''),
    promotionType: String(r.promotion_type || 'percent'),
    value: num(r.value) ?? 0,
    minimumSubtotal: num(r.minimum_subtotal),
    maximumDiscount: num(r.maximum_discount),
    usageLimit: num(r.usage_limit),
    usageCount: num(r.usage_count) ?? 0,
    active: Boolean(r.active),
    startAt: str(r.start_at),
    endAt: str(r.end_at),
    isAutomatic: Boolean(r.is_automatic),
    targets: Array.isArray(rules.targets) ? (rules.targets as PromotionTarget[]) : [],
    scope: typeof rules.scope === 'string' ? rules.scope : 'Entire order',
    perCustomerLimit: num(rules.perCustomerLimit),
    combinable: rules.combinable === true,
    draft: rules.status === 'draft',
    bogo:
      rules.bogo && typeof rules.bogo === 'object'
        ? { buy: num((rules.bogo as Row).buy) ?? 2, get: num((rules.bogo as Row).get) ?? 1 }
        : null,
  };
}

export function toCampaign(r: Row): Campaign {
  return {
    id: String(r.id),
    name: String(r.name || ''),
    campaignType: String(r.campaign_type || 'email'),
    channel: String(r.channel || 'email'),
    status: String(r.status || 'draft'),
    templateId: str(r.template_id),
    segment: obj(r.segment_definition),
    scheduledAt: str(r.scheduled_at),
    startedAt: str(r.started_at),
    completedAt: str(r.completed_at),
    createdAt: String(r.created_at || ''),
  };
}

export function toAutomationFlow(r: Row): AutomationFlow {
  return {
    id: String(r.id),
    name: String(r.name || ''),
    workflowType: String(r.workflow_type || 'custom'),
    status: String(r.status || 'draft'),
    trigger: obj(r.trigger_definition),
    condition: obj(r.condition_definition),
    action: obj(r.action_definition),
    allowReentry: Boolean(r.allow_reentry),
    createdAt: String(r.created_at || ''),
  };
}

export function toWebform(r: Row): Webform {
  return {
    id: String(r.id),
    slug: String(r.slug || ''),
    name: String(r.name || ''),
    creates: str(r.creates),
    fields: Array.isArray(r.fields) ? (r.fields as unknown[]) : [],
    successMessage: str(r.success_message),
    redirectUrl: str(r.redirect_url),
    isActive: Boolean(r.is_active),
    createdAt: String(r.created_at || ''),
  };
}

export function toWebformSubmission(r: Row): WebformSubmission {
  return {
    id: String(r.id),
    webformId: String(r.webform_id || ''),
    payload: obj(r.payload),
    sourceUrl: str(r.source_url),
    status: String(r.status || 'new'),
    leadId: str(r.lead_id),
    createdAt: String(r.created_at || ''),
  };
}

export function toSubscriber(r: Row): Subscriber {
  return {
    id: String(r.id),
    email: String(r.email || ''),
    source: str(r.source),
    confirmedAt: str(r.confirmed_at),
    createdAt: String(r.created_at || ''),
  };
}

export function toSuppression(r: Row): Suppression {
  return {
    id: String(r.id),
    contact: String(r.contact || ''),
    channel: String(r.channel || ''),
    source: String(r.source || ''),
    reason: str(r.reason),
    createdAt: String(r.created_at || ''),
  };
}
