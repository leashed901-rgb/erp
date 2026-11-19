'use client';

/**
 * Content Library — media assets grid, wired to the real
 * social_media_assets rows (doc 23). Upload stores the file in the
 * tenant's 'social-media' bucket and registers the row; delete
 * soft-deletes the row and removes the stored object.
 */
import { useRef, useState } from 'react';
import styles from './SocialLibrary.module.css';
import { useMediaAssets, socialMutations } from '@/hooks/useSocialApi';
import type { MediaAsset } from '@/lib/socialTypes';

interface SocialLibraryScreenProps {
  onToast: (msg: string) => void;
  onNavigate?: (domain: import('@/data/shellData').DomainKey, screenId: string) => void;
}

function formatBytes(b: number | null): string {
  if (b == null) return '—';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function baseName(path: string): string {
  const parts = path.split('/');
  return parts[parts.length - 1] || path;
}

function isVideo(a: MediaAsset): boolean {
  return a.mimeType.startsWith('video/');
}

function uploadedOn(a: MediaAsset): string {
  if (!a.createdAt) return '—';
  return new Date(a.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export default function SocialLibraryScreen({ onToast, onNavigate }: SocialLibraryScreenProps) {
  const { assets, loading, error, refresh } = useMediaAssets();
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('All types');
  const [previewAsset, setPreviewAsset] = useState<MediaAsset | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const filtered = assets.filter((a) => {
    const s = search.trim().toLowerCase();
    const searchMatch = !s || baseName(a.storagePath).toLowerCase().includes(s);
    const typeMatch = typeFilter === 'All types' || (typeFilter === 'Images' ? !isVideo(a) : isVideo(a));
    return searchMatch && typeMatch;
  });

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    let ok = 0;
    let firstErr = '';
    for (const f of Array.from(files)) {
      const form = new FormData();
      form.append('file', f);
      try {
        const res = await fetch('/api/social/assets/upload', { method: 'POST', body: form });
        const body = (await res.json().catch(() => ({}))) as { data?: unknown; error?: { message?: string } };
        if (!res.ok) firstErr = body.error?.message || `upload failed (${res.status})`;
        else ok++;
      } catch (e) {
        firstErr = e instanceof Error ? e.message : 'upload failed';
      }
    }
    setUploading(false);
    await refresh();
    if (ok > 0) onToast(`Uploaded ${ok} asset${ok === 1 ? '' : 's'}.`);
    if (firstErr) onToast(`Upload problem: ${firstErr}`);
  };

  const handleDelete = async (asset: MediaAsset) => {
    setBusy(true);
    const r = await socialMutations.deleteAsset(asset.id);
    setBusy(false);
    setPreviewAsset(null);
    if (!r.ok) { onToast(`Delete failed: ${r.error || 'unknown error'}`); return; }
    await refresh();
    onToast(`Deleted "${baseName(asset.storagePath)}".`);
  };

  const imageCount = assets.filter((a) => !isVideo(a)).length;
  const videoCount = assets.filter((a) => isVideo(a)).length;

  return (
    <div className={styles.screen}>
      <div className={styles.toolbar}>
        <div className={styles.toolbarLeft}>
          <h1 className={styles.toolbarTitle}>Content library</h1>
          <p className={styles.toolbarSub}>
            {loading ? 'Loading assets…' : `${assets.length} assets · ${imageCount} images · ${videoCount} videos`}
          </p>
        </div>
        <div className={styles.toolbarRight}>
          <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} disabled={uploading} onClick={() => fileRef.current?.click()}>
            <span className="material-symbols-outlined">upload</span> {uploading ? 'Uploading…' : 'Upload media'}
          </button>
          <input ref={fileRef} type="file" accept="image/*,video/*" multiple style={{ display: 'none' }} onChange={(e) => { void handleFiles(e.target.files); e.target.value = ''; }} />
        </div>
      </div>

      <div className={styles.content}>
        <div className={styles.gridHead}>
          <h2 className={styles.gridTitle}>All assets</h2>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flex: 1, maxWidth: 420, marginLeft: 'auto' }}>
            <input className={styles.search} type="text" placeholder="Search assets…" value={search} onChange={(e) => setSearch(e.target.value)} />
            <select className={styles.select} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
              <option>All types</option>
              <option>Images</option>
              <option>Videos</option>
            </select>
          </div>
        </div>

        {error ? (
          <div className={styles.empty}>
            <span className="material-symbols-outlined">error</span>
            <h3>Could not load assets</h3>
            <p>{error}</p>
          </div>
        ) : loading ? (
          <div className={styles.empty}><h3>Loading…</h3></div>
        ) : filtered.length === 0 ? (
          <div className={styles.empty}>
            <span className="material-symbols-outlined">perm_media</span>
            <h3>No assets found</h3>
            <p>{assets.length === 0 ? 'Nothing uploaded yet — upload your first asset.' : 'Adjust your filters or upload new media.'}</p>
          </div>
        ) : (
          <div className={styles.grid}>
            {filtered.map((asset) => (
              <div key={asset.id} className={styles.asset} onClick={() => setPreviewAsset(asset)}>
                <div className={styles.thumb}>
                  <span className="material-symbols-outlined">{isVideo(asset) ? 'movie' : 'image'}</span>
                  <span className={`${styles.thumbBadge} ${isVideo(asset) ? styles.thumbBadgeVideo : ''}`}>{isVideo(asset) ? 'Video' : 'Image'}</span>
                </div>
                <div className={styles.assetMeta}>
                  <span className={styles.assetName}>{baseName(asset.storagePath)}</span>
                  <div className={styles.assetInfo}>
                    <span>{formatBytes(asset.sizeBytes)}</span>
                    <span>{uploadedOn(asset)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {previewAsset && (
        <div className={styles.modalScrim} onClick={() => setPreviewAsset(null)}>
          <div className={styles.modalBox} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHead}>
              <h2>{baseName(previewAsset.storagePath)}</h2>
              <button type="button" className={styles.btnIcon} onClick={() => setPreviewAsset(null)}><span className="material-symbols-outlined">close</span></button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.previewThumb}>
                <span className="material-symbols-outlined">{isVideo(previewAsset) ? 'movie' : 'image'}</span>
              </div>
              <div>
                <div className={styles.field}><span className={styles.fieldLabel}>Type</span><span className={styles.fieldValue}><span className={`${styles.pill} ${styles.pillGray}`}>{isVideo(previewAsset) ? 'Video' : 'Image'}</span></span></div>
                <div className={styles.field}><span className={styles.fieldLabel}>File size</span><span className={styles.fieldValue}>{formatBytes(previewAsset.sizeBytes)}</span></div>
                <div className={styles.field}><span className={styles.fieldLabel}>Uploaded</span><span className={styles.fieldValue}>{uploadedOn(previewAsset)}</span></div>
                <div className={styles.field}><span className={styles.fieldLabel}>Storage</span><span className={styles.fieldValue}>{previewAsset.storageBucket || 'social-media'} / {previewAsset.storagePath}</span></div>
                <div className={styles.field}><span className={styles.fieldLabel}>Asset ID</span><span className={styles.fieldValue}>{previewAsset.id}</span></div>
              </div>
            </div>
            <div className={styles.modalFoot}>
              <button type="button" className={`${styles.btn} ${styles.btnDanger}`} disabled={busy} onClick={() => void handleDelete(previewAsset)}><span className="material-symbols-outlined">delete</span> Delete</button>
              <button type="button" className={`${styles.btn} ${styles.btnPrimary}`} onClick={() => { setPreviewAsset(null); onNavigate?.('marketing', 'mkt-create-content'); }}><span className="material-symbols-outlined">add_photo_alternate</span> Use in post</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
