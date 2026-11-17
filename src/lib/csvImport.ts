/* csvImport — shared CSV import for list screens (GAP-2).
   Parse a CSV file, map headers onto a screen's columns (by column id or
   label, case-insensitive), convert camelCase keys to the snake_case field
   names the APIs take, POST each row, toast the real created/failed count.
   An optional mapRow hook lets document-backed lists (bills, orders)
   resolve a party name to an id and shape the document body. */

export interface ImportColumn {
  id: string;
  label: string;
}

export function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim());
}

export function toSnake(key: string): string {
  return key.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
}

export interface ImportResult {
  ok: number;
  failed: number;
}

export async function importCsvFile(
  file: File,
  columns: ImportColumn[],
  apiPath: string,
  mapRow?: (row: Record<string, string>) => Promise<Record<string, unknown> | null>,
  fieldMap?: Record<string, string>,
): Promise<ImportResult> {
  const text = await file.text();
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return { ok: 0, failed: 0 };
  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase());
  const keyFor = (h: string) =>
    columns.find((c) => c.id.toLowerCase() === h || c.label.toLowerCase() === h)?.id;
  let ok = 0;
  let failed = 0;
  for (const line of lines.slice(1)) {
    const cells = parseCsvLine(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      const k = keyFor(h);
      if (k && cells[i] !== undefined && cells[i] !== '') row[k] = cells[i];
    });
    if (Object.keys(row).length === 0) { failed++; continue; }
    try {
      const body = mapRow ? await mapRow(row) : null;
      const payload = body ?? Object.fromEntries(
        Object.entries(row).map(([k, v]) => [fieldMap?.[k] ?? toSnake(k), v]),
      );
      if (!payload) { failed++; continue; }
      const res = await fetch(apiPath, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) ok++;
      else failed++;
    } catch {
      failed++;
    }
  }
  return { ok, failed };
}

/** Resolve a party by display name (exact match first, then first hit). */
export async function resolvePartyId(name: string): Promise<string | null> {
  if (!name.trim()) return null;
  const res = await fetch(`/api/parties?q=${encodeURIComponent(name.trim())}`);
  const json = await res.json().catch(() => null);
  const rows = (json?.data ?? []) as { id: string; displayName?: string; name?: string }[];
  if (!rows.length) return null;
  const exact = rows.find(
    (r) => (r.displayName || r.name || '').toLowerCase() === name.trim().toLowerCase(),
  );
  return (exact || rows[0]).id;
}
