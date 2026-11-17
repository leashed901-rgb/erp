'use client';
/* useCmsApi — client data layer for CMS & Website (doc 25).
   Banners/popups ride the existing /api/v1/marketing routes;
   pages/blocks/navigation/seo/redirects/slots use /api/cms. */
import { useList, fetchJson } from '@/hooks/useCrmApi';
import type { CmsPage, ContentBlock, BannerDef, PopupDef, NavMenu, SeoEntry, CmsRedirect } from '@/lib/cmsTypes';
import { toBanner, toPopup } from '@/lib/cmsTypes';

interface MutationResult<T = unknown> {
  ok: boolean;
  error?: string;
  data?: T;
}

async function call<T>(url: string, init?: RequestInit): Promise<MutationResult<T>> {
  const res = await fetchJson<{ data: T }>(url, init);
  return res.ok ? { ok: true, data: res.data.data } : { ok: false, error: res.error };
}

export function useCmsPages() {
  const { data, loaded, error, refresh, setData } = useList<CmsPage>(
    'cmsPages',
    '/api/cms/pages',
    (raw) => ((raw as { data?: CmsPage[] })?.data ?? []) as CmsPage[],
  );
  return { pages: data, loading: !loaded, error, refresh, setPages: setData };
}

export function useCmsBlocks(pageId?: string) {
  const url = pageId ? `/api/cms/blocks?pageId=${pageId}` : '/api/cms/blocks';
  const { data, loaded, error, refresh, setData } = useList<ContentBlock>(
    'cmsBlocks:' + (pageId || 'all'),
    url,
    (raw) => ((raw as { data?: ContentBlock[] })?.data ?? []) as ContentBlock[],
  );
  return { blocks: data, loading: !loaded, error, refresh, setBlocks: setData };
}

export function useBanners() {
  const { data, loaded, error, refresh, setData } = useList<BannerDef>(
    'cmsBanners',
    '/api/v1/marketing/banners',
    (raw) => (((raw as { data?: Record<string, unknown>[] })?.data ?? []) as Record<string, unknown>[]).map(toBanner),
  );
  return { banners: data, loading: !loaded, error, refresh, setBanners: setData };
}

export function usePopups() {
  const { data, loaded, error, refresh, setData } = useList<PopupDef>(
    'cmsPopups',
    '/api/v1/marketing/popups',
    (raw) => (((raw as { data?: Record<string, unknown>[] })?.data ?? []) as Record<string, unknown>[]).map(toPopup),
  );
  return { popups: data, loading: !loaded, error, refresh, setPopups: setData };
}

export function useNavigation() {
  const { data, loaded, error, refresh } = useList<NavMenu>(
    'cmsNavigation',
    '/api/cms/navigation',
    (raw) => ((raw as { data?: NavMenu[] })?.data ?? []) as NavMenu[],
  );
  return { menus: data, loading: !loaded, error, refresh };
}

export function useRedirects() {
  const { data, loaded, error, refresh } = useList<CmsRedirect>(
    'cmsRedirects',
    '/api/cms/redirects',
    (raw) => ((raw as { data?: CmsRedirect[] })?.data ?? []) as CmsRedirect[],
  );
  return { redirects: data, loading: !loaded, error, refresh };
}

export const cmsMutations = {
  createPage: (input: Record<string, unknown>) => call<CmsPage>('/api/cms/pages', { method: 'POST', body: JSON.stringify(input) }),
  updatePage: (id: string, patch: Record<string, unknown>) =>
    call<CmsPage>(`/api/cms/pages/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deletePage: (id: string) => call<{ id: string; deleted: boolean }>(`/api/cms/pages/${id}`, { method: 'DELETE' }),
  saveSeo: (input: Record<string, unknown>) => call<SeoEntry>('/api/cms/seo', { method: 'POST', body: JSON.stringify(input) }),
  createBlock: (input: Record<string, unknown>) => call<ContentBlock>('/api/cms/blocks', { method: 'POST', body: JSON.stringify(input) }),
  updateBlock: (id: string, patch: Record<string, unknown>) =>
    call<ContentBlock>(`/api/cms/blocks/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteBlock: (id: string) => call<{ id: string; deleted: boolean }>(`/api/cms/blocks/${id}`, { method: 'DELETE' }),
  updateBanner: (id: string, patch: Record<string, unknown>) =>
    call<BannerDef>(`/api/v1/marketing/banners/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteBanner: (id: string) => call<{ id: string; deleted: boolean }>(`/api/v1/marketing/banners/${id}`, { method: 'DELETE' }),
  updatePopup: (id: string, patch: Record<string, unknown>) =>
    call<PopupDef>(`/api/v1/marketing/popups/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deletePopup: (id: string) => call<{ id: string; deleted: boolean }>(`/api/v1/marketing/popups/${id}`, { method: 'DELETE' }),
};
