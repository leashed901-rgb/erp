import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';
import type { TableReg } from '@/lib/tableRegistry';

/* Shared data-route handler (2026-11-15 wire closure): the house
   data surface for registry tables — tenant-scoped, { data } /
   { error } envelope, equality filters on real columns only.
   Served by /api/v1/data/[table] and by the per-domain routes
   /api/<domain>/data/[table]; both resolve the table's registry
   entry and delegate here so the rules can never diverge.
   acct_* engine tables are read-only through this layer; their
   sanctioned write paths are the engine RPCs. */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function dataGet(req: NextRequest, table: string, r: TableReg) {
  const sp = new URL(req.url).searchParams;
  const limit = Math.min(Math.max(Number(sp.get('limit') || 50) || 50, 1), 200);
  const offset = Math.max(Number(sp.get('offset') || 0) || 0, 0);
  let q = supabaseAdmin().from(table).select('*');
  if (r.tenant) q = q.eq('tenant_id', DEFAULT_TENANT_ID);
  for (const [k, v] of sp.entries()) {
    if (['limit', 'offset'].includes(k)) continue;
    if (r.columns.includes(k)) q = q.eq(k, v);
  }
  if (r.columns.includes('created_at')) q = q.order('created_at', { ascending: false });
  q = q.range(offset, offset + limit - 1);
  const { data, error } = await q;
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: data ?? [] });
}

export async function dataPost(req: NextRequest, table: string, r: TableReg) {
  if (!r.writable) return err('FORBIDDEN', `${table} is read-only through the data layer`, 403);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err('VALIDATION', 'Invalid JSON', 400); }
  const row: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) if (r.columns.includes(k) && k !== 'id') row[k] = v;
  if (r.tenant) row.tenant_id = DEFAULT_TENANT_ID;
  const { data, error } = await supabaseAdmin().from(table).insert(row).select('*').single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data }, { status: 201 });
}

export async function dataPatch(req: NextRequest, table: string, r: TableReg) {
  if (!r.writable) return err('FORBIDDEN', `${table} is read-only through the data layer`, 403);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err('VALIDATION', 'Invalid JSON', 400); }
  const id = String(body.id || new URL(req.url).searchParams.get('id') || '');
  if (!id) return err('VALIDATION', 'id is required', 400);
  const patch: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body)) if (r.columns.includes(k) && k !== 'id' && k !== 'tenant_id') patch[k] = v;
  let q = supabaseAdmin().from(table).update(patch).eq('id', id);
  if (r.tenant) q = q.eq('tenant_id', DEFAULT_TENANT_ID);
  const { data, error } = await q.select('*').single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data });
}

export async function dataDelete(req: NextRequest, table: string, r: TableReg) {
  if (!r.writable) return err('FORBIDDEN', `${table} is read-only through the data layer`, 403);
  const id = new URL(req.url).searchParams.get('id') || '';
  if (!id) return err('VALIDATION', 'id is required', 400);
  let q = supabaseAdmin().from(table).delete().eq('id', id);
  if (r.tenant) q = q.eq('tenant_id', DEFAULT_TENANT_ID);
  const { error } = await q;
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { id, deleted: true } });
}

export function dataNotFound(table: string) {
  return err('NOT_FOUND', `No data route registered for ${table}`, 404);
}
