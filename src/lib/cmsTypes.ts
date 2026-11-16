/* CMS & Website types (doc 25) — DTOs over the cms_* tables. */

export interface CmsPage {
  id: string;
  slug: string;
  title: string;
  pageType: string | null;
  body: string | null;
  blocks: unknown[];
  excerpt: string | null;
  featuredImageUrl: string | null;
  status: string;
  publishedAt: string | null;
  scheduledFor: string | null;
  version: number;
  locale: string | null;
  updatedAt: string;
}

export interface ContentBlock {
  id: string;
  blockId: string;
  componentType: string;
  props: Record<string, unknown>;
  slotId: string | null;
  pageId: string | null;
  status: string;
  locale: string | null;
  sortOrder: number;
}

export interface BannerDef {
  id: string;
  name: string;
  bannerType: string | null;
  headline: string | null;
  subheadline: string | null;
  body: string | null;
  imageUrl: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  backgroundColor: string | null;
  textColor: string | null;
  placement: string | null;
  sortOrder: number;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
  dismissible: boolean;
}

export interface PopupDef {
  id: string;
  name: string;
  headline: string | null;
  body: string | null;
  imageUrl: string | null;
  ctaLabel: string | null;
  ctaUrl: string | null;
  collectEmail: boolean;
  triggerType: string | null;
  triggerValue: number | null;
  frequency: string | null;
  targetPages: string[];
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
  impressions: number;
  conversions: number;
}

export interface NavMenu {
  id: string;
  name: string;
  location: string;
  status: string;
  locale: string | null;
  items: NavItem[];
}

export interface NavItem {
  id: string;
  menuId: string;
  parentId: string | null;
  label: string;
  href: string | null;
  itemType: string | null;
  icon: string | null;
  badge: string | null;
  sortOrder: number;
  status: string;
}

export interface SeoEntry {
  id: string;
  pageId: string | null;
  scope: string | null;
  metaTitle: string | null;
  metaDescription: string | null;
  canonicalUrl: string | null;
  ogTitle: string | null;
  ogDescription: string | null;
  ogImageUrl: string | null;
  robotsIndex: boolean;
  robotsFollow: boolean;
}

export interface CmsRedirect {
  id: string;
  fromUrl: string;
  toUrl: string;
  statusCode: number;
  active: boolean;
}

export interface CmsSlot {
  id: string;
  slotKey: string;
  pageType: string;
  maxItems: number | null;
  description: string | null;
}

export interface MediaAsset {
  id: string;
  mediaId: string | null;
  url: string;
  cdnUrl: string | null;
  mimeType: string | null;
  fileSize: number | null;
  width: number | null;
  height: number | null;
  altText: string | null;
  title: string | null;
  caption: string | null;
  source: string | null;
  tags: string | null;
  status: string;
  createdAt: string;
}

type Row = Record<string, unknown>;
const str = (v: unknown) => (typeof v === 'string' ? v : null);
const num = (v: unknown) => (v != null && !Number.isNaN(Number(v)) ? Number(v) : null);
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

export function toCmsPage(r: Row): CmsPage {
  return {
    id: String(r.id),
    slug: String(r.slug || ''),
    title: String(r.title || ''),
    pageType: str(r.page_type),
    body: str(r.body),
    blocks: Array.isArray(r.blocks) ? (r.blocks as unknown[]) : [],
    excerpt: str(r.excerpt),
    featuredImageUrl: str(r.featured_image_url),
    status: String(r.status || 'draft'),
    publishedAt: str(r.published_at),
    scheduledFor: str(r.scheduled_for),
    version: num(r.version) ?? 1,
    locale: str(r.locale),
    updatedAt: String(r.updated_at || ''),
  };
}

export function toContentBlock(r: Row): ContentBlock {
  return {
    id: String(r.id),
    blockId: String(r.block_id || ''),
    componentType: String(r.component_type || ''),
    props: obj(r.props),
    slotId: str(r.slot_id),
    pageId: str(r.page_id),
    status: String(r.status || 'draft'),
    locale: str(r.locale),
    sortOrder: num(r.sort_order) ?? 0,
  };
}

export function toBanner(r: Row): BannerDef {
  return {
    id: String(r.id),
    name: String(r.name || ''),
    bannerType: str(r.banner_type),
    headline: str(r.headline),
    subheadline: str(r.subheadline),
    body: str(r.body),
    imageUrl: str(r.image_url),
    ctaLabel: str(r.cta_label),
    ctaUrl: str(r.cta_url),
    backgroundColor: str(r.background_color),
    textColor: str(r.text_color),
    placement: str(r.placement),
    sortOrder: num(r.sort_order) ?? 0,
    isActive: Boolean(r.is_active),
    startsAt: str(r.starts_at),
    endsAt: str(r.ends_at),
    dismissible: Boolean(r.dismissible),
  };
}

export function toPopup(r: Row): PopupDef {
  return {
    id: String(r.id),
    name: String(r.name || ''),
    headline: str(r.headline),
    body: str(r.body),
    imageUrl: str(r.image_url),
    ctaLabel: str(r.cta_label),
    ctaUrl: str(r.cta_url),
    collectEmail: Boolean(r.collect_email),
    triggerType: str(r.trigger_type),
    triggerValue: num(r.trigger_value),
    frequency: str(r.frequency),
    targetPages: Array.isArray(r.target_pages) ? (r.target_pages as string[]) : [],
    isActive: Boolean(r.is_active),
    startsAt: str(r.starts_at),
    endsAt: str(r.ends_at),
    impressions: num(r.impressions) ?? 0,
    conversions: num(r.conversions) ?? 0,
  };
}

export function toNavItem(r: Row): NavItem {
  return {
    id: String(r.id),
    menuId: String(r.menu_id || ''),
    parentId: str(r.parent_id),
    label: String(r.label || ''),
    href: str(r.href),
    itemType: str(r.item_type),
    icon: str(r.icon),
    badge: str(r.badge),
    sortOrder: num(r.sort_order) ?? 0,
    status: String(r.status || 'active'),
  };
}

export function toNavMenu(r: Row, items: NavItem[] = []): NavMenu {
  return {
    id: String(r.id),
    name: String(r.name || ''),
    location: String(r.location || ''),
    status: String(r.status || 'active'),
    locale: str(r.locale),
    items,
  };
}

export function toSeoEntry(r: Row): SeoEntry {
  return {
    id: String(r.id),
    pageId: str(r.page_id),
    scope: str(r.scope),
    metaTitle: str(r.meta_title),
    metaDescription: str(r.meta_description),
    canonicalUrl: str(r.canonical_url),
    ogTitle: str(r.og_title),
    ogDescription: str(r.og_description),
    ogImageUrl: str(r.og_image_url),
    robotsIndex: r.robots_index !== false,
    robotsFollow: r.robots_follow !== false,
  };
}

export function toRedirect(r: Row): CmsRedirect {
  return {
    id: String(r.id),
    fromUrl: String(r.from_url || ''),
    toUrl: String(r.to_url || ''),
    statusCode: num(r.status_code) ?? 301,
    active: Boolean(r.active),
  };
}

export function toSlot(r: Row): CmsSlot {
  return {
    id: String(r.id),
    slotKey: String(r.slot_key || ''),
    pageType: String(r.page_type || ''),
    maxItems: num(r.max_items),
    description: str(r.description),
  };
}

export function toMediaAsset(r: Row): MediaAsset {
  return {
    id: String(r.id),
    mediaId: str(r.media_id),
    url: String(r.url || ''),
    cdnUrl: str(r.cdn_url),
    mimeType: str(r.mime_type),
    fileSize: num(r.file_size),
    width: num(r.width),
    height: num(r.height),
    altText: str(r.alt_text),
    title: str(r.title),
    caption: str(r.caption),
    source: str(r.source),
    tags: str(r.tags),
    status: String(r.status || 'draft'),
    createdAt: String(r.created_at || ''),
  };
}
