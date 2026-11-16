'use client';

import { useCallback, useEffect, useState } from 'react';
import { useCmsEditor } from '@/lib/cmsStore';
import type { DomainKey } from '@/data/shellData';
import type { NavMenu, NavItem } from '@/lib/cmsTypes';

/* Navigation editor (SHIP-IT step 2): menus on the left, the selected
   menu's items on the right. Items are flat here — parent/child nesting
   is stored on the item (parent_id) and rendered indented on the
   storefront; the editor keeps the flat list with sort order controls. */

const LOCATIONS = ['header', 'footer', 'mobile', 'sidebar'];

export default function CmsNavigationEditorScreen({
  onToast,
  onNavigate,
}: {
  onToast: (m: string) => void;
  onNavigate: (domain: DomainKey, screenId: string) => void;
}) {
  const menuId = useCmsEditor((s) => s.menuId);
  const openMenu = useCmsEditor((s) => s.openMenu);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [menus, setMenus] = useState<NavMenu[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(menuId);
  const [newName, setNewName] = useState('');
  const [newLocation, setNewLocation] = useState('header');
  const [creating, setCreating] = useState(false);
  const [itemLabel, setItemLabel] = useState('');
  const [itemHref, setItemHref] = useState('');
  const [savingItem, setSavingItem] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/cms/navigation');
      const j = await res.json();
      if (!res.ok) throw new Error(j.error?.message || 'Navigation failed to load');
      const list = (j.data || []) as NavMenu[];
      setMenus(list);
      if (!selectedId && list.length) setSelectedId(list[0].id);
      else if (selectedId && !list.some((m) => m.id === selectedId)) setSelectedId(list[0]?.id ?? null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Navigation failed to load');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (menuId) setSelectedId(menuId);
  }, [menuId]);

  const selected = menus.find((m) => m.id === selectedId) ?? null;

  const createMenu = async () => {
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const res = await fetch('/api/cms/navigation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), location: newLocation }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error?.message || 'Create failed');
      onToast('Menu created');
      setNewName('');
      await load();
      setSelectedId(String(j.data.id));
      openMenu(String(j.data.id));
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setCreating(false);
    }
  };

  const addItem = async () => {
    if (!selected || !itemLabel.trim()) return;
    setSavingItem(true);
    try {
      const res = await fetch('/api/cms/navigation/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ menuId: selected.id, label: itemLabel.trim(), href: itemHref.trim() || null, sortOrder: (selected.items?.length || 0) + 1 }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error?.message || 'Add failed');
      setItemLabel('');
      setItemHref('');
      await load();
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Add failed');
    } finally {
      setSavingItem(false);
    }
  };

  const patchItem = async (item: NavItem, patch: Partial<NavItem>) => {
    try {
      const res = await fetch('/api/cms/navigation/items', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: item.id, ...patch }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error?.message || 'Update failed');
      await load();
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Update failed');
    }
  };

  const deleteItem = async (item: NavItem) => {
    try {
      const res = await fetch(`/api/cms/navigation/items?id=${encodeURIComponent(item.id)}`, { method: 'DELETE' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error?.message || 'Delete failed');
      onToast('Item deleted');
      await load();
    } catch (e) {
      onToast(e instanceof Error ? e.message : 'Delete failed');
    }
  };

  const moveItem = (item: NavItem, dir: -1 | 1) => {
    const list = [...(selected?.items || [])].sort((a, b) => a.sortOrder - b.sortOrder);
    const i = list.findIndex((x) => x.id === item.id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;
    void patchItem(list[i], { sortOrder: list[j].sortOrder });
    void patchItem(list[j], { sortOrder: list[i].sortOrder });
  };

  if (loading) {
    return (
      <div className="p-6">
        <p className="text-[13px] text-[#6f7a69]">Loading navigation…</p>
      </div>
    );
  }
  if (error) {
    return (
      <div className="p-6">
        <p className="text-[13px] text-[#ba1a1a]">{error}</p>
        <button className="mt-3 h-8 px-3 border border-[#dad9dd] rounded text-[12px] font-semibold" onClick={() => onNavigate('settings', 'navigation')}>
          Back to Navigation
        </button>
      </div>
    );
  }

  const input = 'h-9 px-3 border border-[#dad9dd] rounded-md text-[13px] bg-white';

  return (
    <div className="min-h-full bg-[#faf9fc]">
      <div className="h-[52px] bg-white border-b border-[#dad9dd] flex items-center justify-between px-5 sticky top-0 z-40">
        <div className="flex items-center gap-2.5 text-[13px] min-w-0">
          <button className="text-[#6f7a69] hover:text-black" onClick={() => onNavigate('settings', 'navigation')} aria-label="Back to Navigation">
            ←
          </button>
          <span className="material-symbols-outlined text-[18px] text-[#6f7a69]">menu</span>
          <strong>Navigation</strong>
          {selected && (
            <>
              <span className="text-[#6f7a69]">·</span>
              <span>{selected.name}</span>
            </>
          )}
        </div>
      </div>

      <div className="p-6 max-w-[1100px] mx-auto grid grid-cols-[300px_1fr] gap-6">
        <div>
          <h3 className="text-[13px] font-semibold mb-3">Menus ({menus.length})</h3>
          <div className="bg-white border border-[#dad9dd] rounded-xl overflow-hidden mb-4">
            {menus.map((m) => (
              <button
                key={m.id}
                onClick={() => {
                  setSelectedId(m.id);
                  openMenu(m.id);
                }}
                className={`w-full text-left px-4 py-3 border-b border-[#dad9dd] last:border-0 ${m.id === selectedId ? 'bg-[#eaf5e8]' : 'hover:bg-[#f4f3f7]'}`}
              >
                <span className="block text-[13px] font-semibold">{m.name}</span>
                <span className="block text-[11px] text-[#6f7a69]">
                  {m.location} · {(m.items || []).length} items · {m.status}
                </span>
              </button>
            ))}
            {menus.length === 0 && <p className="px-4 py-4 text-[13px] text-[#6f7a69]">No menus yet.</p>}
          </div>
          <div className="bg-white border border-[#dad9dd] rounded-xl p-4">
            <h4 className="text-[12px] font-semibold mb-3">New menu</h4>
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Menu name" className={`${input} w-full mb-2`} />
            <select value={newLocation} onChange={(e) => setNewLocation(e.target.value)} className={`${input} w-full mb-3`}>
              {LOCATIONS.map((l) => (
                <option key={l} value={l}>
                  {l}
                </option>
              ))}
            </select>
            <button onClick={() => void createMenu()} disabled={!newName.trim() || creating} className="h-8 px-3 rounded-md bg-[#0a6400] text-white text-[12px] font-semibold disabled:opacity-50">
              Create menu
            </button>
          </div>
        </div>

        <div>
          <h3 className="text-[13px] font-semibold mb-3">Items {selected ? `— ${selected.name}` : ''}</h3>
          {!selected && <p className="text-[13px] text-[#6f7a69]">Create a menu first.</p>}
          {selected && (
            <>
              <div className="bg-white border border-[#dad9dd] rounded-xl overflow-hidden mb-4">
                {[...(selected.items || [])]
                  .sort((a, b) => a.sortOrder - b.sortOrder)
                  .map((item) => (
                    <div key={item.id} className="flex items-center gap-2 px-4 py-3 border-b border-[#dad9dd] last:border-0">
                      <input
                        value={item.label}
                        onChange={(e) => {
                          const v = e.target.value;
                          setMenus((ms) =>
                            ms.map((m) =>
                              m.id === selected.id
                                ? { ...m, items: (m.items || []).map((it) => (it.id === item.id ? { ...it, label: v } : it)) }
                                : m,
                            ),
                          );
                        }}
                        onBlur={() => void patchItem(item, { label: item.label })}
                        className={`${input} w-[180px]`}
                        aria-label="Item label"
                      />
                      <input
                        value={item.href || ''}
                        onChange={(e) => {
                          const v = e.target.value;
                          setMenus((ms) =>
                            ms.map((m) =>
                              m.id === selected.id
                                ? { ...m, items: (m.items || []).map((it) => (it.id === item.id ? { ...it, href: v } : it)) }
                                : m,
                            ),
                          );
                        }}
                        onBlur={() => void patchItem(item, { href: item.href })}
                        className={`${input} flex-1`}
                        placeholder="/page-slug"
                        aria-label="Item link"
                      />
                      <span className={`px-2 py-[3px] rounded-[10px] text-[10px] font-bold uppercase ${item.status === 'active' ? 'bg-[#d9f2d0] text-[#0a6400]' : 'bg-[#f4f3f7] text-[#6f7a69]'}`}>
                        {item.status}
                      </span>
                      <button onClick={() => moveItem(item, -1)} className="h-7 w-7 rounded border border-[#dad9dd] text-[14px]" aria-label="Move up">
                        ↑
                      </button>
                      <button onClick={() => moveItem(item, 1)} className="h-7 w-7 rounded border border-[#dad9dd] text-[14px]" aria-label="Move down">
                        ↓
                      </button>
                      <button onClick={() => void deleteItem(item)} className="h-7 px-2 rounded border border-[#dad9dd] text-[12px] text-[#ba1a1a]" aria-label="Delete item">
                        Delete
                      </button>
                    </div>
                  ))}
                {(selected.items || []).length === 0 && <p className="px-4 py-4 text-[13px] text-[#6f7a69]">No items yet — add the first link below.</p>}
              </div>
              <div className="bg-white border border-[#dad9dd] rounded-xl p-4 flex gap-2">
                <input value={itemLabel} onChange={(e) => setItemLabel(e.target.value)} placeholder="Label" className={`${input} w-[200px]`} />
                <input value={itemHref} onChange={(e) => setItemHref(e.target.value)} placeholder="/page-slug or https://…" className={`${input} flex-1`} />
                <button onClick={() => void addItem()} disabled={!itemLabel.trim() || savingItem} className="h-9 px-4 rounded-md bg-[#0a6400] text-white text-[12px] font-semibold disabled:opacity-50">
                  Add item
                </button>
              </div>
              <p className="text-[12px] text-[#6f7a69] mt-3">Labels and links save when you click out of the field. Order is the storefront order.</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
