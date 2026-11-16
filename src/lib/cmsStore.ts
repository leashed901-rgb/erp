import { create } from 'zustand';

/* CMS editor state — which record each CMS editor screen is showing.
   Mirrors the designCanvasStore pattern: lists set the id, then navigate
   to the editor screen, which reads the id back. A null id means "new". */

interface CmsEditorState {
  pageId: string | null;
  bannerId: string | null;
  popupId: string | null;
  menuId: string | null;
  blockId: string | null;
  openPage: (id: string | null) => void;
  openBanner: (id: string | null) => void;
  openPopup: (id: string | null) => void;
  openMenu: (id: string | null) => void;
  openBlock: (id: string | null) => void;
}

export const useCmsEditor = create<CmsEditorState>((set) => ({
  pageId: null,
  bannerId: null,
  popupId: null,
  menuId: null,
  blockId: null,
  openPage: (id) => set({ pageId: id }),
  openBanner: (id) => set({ bannerId: id }),
  openPopup: (id) => set({ popupId: id }),
  openMenu: (id) => set({ menuId: id }),
  openBlock: (id) => set({ blockId: id }),
}));

/** Open the right editor for a list row, by the list's config key. */
export function openCmsEditorForList(key: string, id: string | null): string | null {
  const s = useCmsEditor.getState();
  switch (key) {
    case 'cms-pages':
    case 'website-cms':
      s.openPage(id);
      return 'cms-page-editor';
    case 'banners':
      s.openBanner(id);
      return 'cms-banner-editor';
    case 'popups':
      s.openPopup(id);
      return 'cms-popup-editor';
    case 'navigation':
      s.openMenu(id);
      return 'cms-navigation-editor';
    case 'content-blocks':
      s.openBlock(id);
      return 'cms-block-editor';
    case 'media':
      return 'cms-media-library';
    default:
      return null;
  }
}
