import { NextRequest } from 'next/server';
import { TABLE_REGISTRY } from '@/lib/tableRegistry';
import { dataGet, dataPost, dataPatch, dataDelete, dataNotFound } from '@/lib/dataRoute';

/* Generic data layer for registry tables (2026-11-15 table-layer
   sweep + wire closure): every table in TABLE_REGISTRY is served
   here and through its per-domain route /api/<domain>/data/[table].
   The shared handler lives in lib/dataRoute.ts. */

export async function GET(req: NextRequest, ctx: { params: Promise<{ table: string }> }) {
  const { table } = await ctx.params;
  const r = TABLE_REGISTRY[table];
  return r ? dataGet(req, table, r) : dataNotFound(table);
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ table: string }> }) {
  const { table } = await ctx.params;
  const r = TABLE_REGISTRY[table];
  return r ? dataPost(req, table, r) : dataNotFound(table);
}

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ table: string }> }) {
  const { table } = await ctx.params;
  const r = TABLE_REGISTRY[table];
  return r ? dataPatch(req, table, r) : dataNotFound(table);
}

export async function DELETE(req: NextRequest, ctx: { params: Promise<{ table: string }> }) {
  const { table } = await ctx.params;
  const r = TABLE_REGISTRY[table];
  return r ? dataDelete(req, table, r) : dataNotFound(table);
}
