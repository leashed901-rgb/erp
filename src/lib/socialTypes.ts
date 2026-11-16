/* Social publishing types (doc 23) — DTOs over the social_* tables.
   The doc names SocialPost, ScheduleSlot, PublishAttempt. Publishing
   runs through the platform worker (social_claim_outbox_events);
   these rows are the queue it claims. */

export interface SocialPostNetwork {
  network: string;
  status: string; // draft|scheduled|published|failed
  accountId: string | null;
  externalPostId: string | null;
  externalUrl: string | null;
  error: string | null;
  publishedAt: string | null;
}

export interface SocialPost {
  id: string;
  tenantId: string;
  title: string | null;
  caption: string;
  body: string | null;
  sourceType: string; // product|design|design_publication|collection|custom
  sourceId: string | null;
  mediaUrls: string[];
  productUrl: string | null;
  linkUrl: string | null;
  scheduledAt: string | null;
  publishedAt: string | null;
  status: string; // draft|scheduled|publishing|published|failed|cancelled
  approvedBy: string | null;
  error: string | null;
  seriesId: string | null;
  channels: string[];
  networks: SocialPostNetwork[];
  createdAt: string;
  updatedAt: string;
}

export interface SocialAccount {
  id: string;
  tenantId: string;
  network: string;
  platform: string;
  handle: string | null;
  displayName: string | null;
  avatarUrl: string | null;
  status: string; // connected|disconnected|needs_reconnect
  metricoolBrandId: string | null;
  platformAccountId: string | null;
  createdAt: string;
}

export interface ScheduleSlot {
  id: string;
  tenantId: string;
  weekday: number; // 0 = Sunday
  timeLocal: string;
  timezone: string | null;
  label: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface MediaAsset {
  id: string;
  tenantId: string;
  storageBucket: string | null;
  storagePath: string;
  mimeType: string;
  sizeBytes: number | null;
  createdAt: string;
}

export interface PostTarget {
  id: string;
  postId: string;
  accountId: string;
  platform: string;
  status: string; // queued|uploading|publishing|published|failed|skipped|unknown|handoff_pending
  platformPostId: string | null;
  platformUrl: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  publishedAt: string | null;
}

export interface PublishAttempt {
  id: string;
  postTargetId: string;
  attemptNo: number;
  result: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  httpStatus: number | null;
  providerRequestId: string | null;
  startedAt: string | null;
  finishedAt: string | null;
}

export interface NetworkPerformance {
  network: string;
  published: number;
  failed: number;
  scheduled: number;
  draft: number;
}

type Row = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v : null);
const num = (v: unknown) => (v != null && !Number.isNaN(Number(v)) ? Number(v) : null);

export function toPostNetwork(r: Row): SocialPostNetwork {
  return {
    network: String(r.network || ''),
    status: String(r.status || 'draft'),
    accountId: str(r.social_account_id),
    externalPostId: str(r.external_post_id),
    externalUrl: str(r.external_url),
    error: str(r.error),
    publishedAt: str(r.published_at),
  };
}

export function toSocialPost(r: Row, networks: SocialPostNetwork[] = []): SocialPost {
  return {
    id: String(r.id),
    tenantId: String(r.tenant_id || ''),
    title: str(r.title),
    caption: String(r.caption || ''),
    body: str(r.body),
    sourceType: String(r.source_type || 'custom'),
    sourceId: str(r.source_id),
    mediaUrls: Array.isArray(r.media_urls) ? (r.media_urls as string[]) : [],
    productUrl: str(r.product_url),
    linkUrl: str(r.link_url),
    scheduledAt: str(r.scheduled_at),
    publishedAt: str(r.published_at),
    status: String(r.status || 'draft'),
    approvedBy: str(r.approved_by),
    error: str(r.error),
    seriesId: str(r.series_id),
    channels: networks.map((n) => n.network),
    networks,
    createdAt: String(r.created_at || ''),
    updatedAt: String(r.updated_at || ''),
  };
}

export function toSocialAccount(r: Row): SocialAccount {
  return {
    id: String(r.id),
    tenantId: String(r.tenant_id || ''),
    network: String(r.network || ''),
    platform: String(r.platform || ''),
    handle: str(r.handle),
    displayName: str(r.display_name),
    avatarUrl: str(r.avatar_url),
    status: String(r.status || 'disconnected'),
    metricoolBrandId: str(r.metricool_brand_id),
    platformAccountId: str(r.platform_account_id),
    createdAt: String(r.created_at || ''),
  };
}

export function toScheduleSlot(r: Row): ScheduleSlot {
  return {
    id: String(r.id),
    tenantId: String(r.tenant_id || ''),
    weekday: num(r.weekday) ?? 0,
    timeLocal: String(r.time_local || ''),
    timezone: str(r.timezone),
    label: str(r.label),
    isActive: Boolean(r.is_active),
    createdAt: String(r.created_at || ''),
  };
}

export function toMediaAsset(r: Row): MediaAsset {
  return {
    id: String(r.id),
    tenantId: String(r.tenant_id || ''),
    storageBucket: str(r.storage_bucket),
    storagePath: String(r.storage_path || ''),
    mimeType: String(r.mime_type || ''),
    sizeBytes: num(r.size_bytes),
    createdAt: String(r.created_at || ''),
  };
}

export function toPostTarget(r: Row): PostTarget {
  return {
    id: String(r.id),
    postId: String(r.post_id || ''),
    accountId: String(r.social_account_id || ''),
    platform: String(r.platform || ''),
    status: String(r.status || 'queued'),
    platformPostId: str(r.platform_post_id),
    platformUrl: str(r.platform_url),
    errorCode: str(r.error_code),
    errorMessage: str(r.error_message),
    publishedAt: str(r.published_at),
  };
}

export function toPublishAttempt(r: Row): PublishAttempt {
  return {
    id: String(r.id),
    postTargetId: String(r.post_target_id || ''),
    attemptNo: num(r.attempt_no) ?? 0,
    result: str(r.result),
    errorCode: str(r.error_code),
    errorMessage: str(r.error_message),
    httpStatus: num(r.http_status),
    providerRequestId: str(r.provider_request_id),
    startedAt: str(r.started_at),
    finishedAt: str(r.finished_at),
  };
}
