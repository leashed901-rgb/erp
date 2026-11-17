import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

const err = (code: string, message: string, status: number) =>
  NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });

/** DELETE /api/vendor-aliases/[id] — remove an alias. */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const { error } = await supabaseAdmin()
    .from('acct_vendor_aliases')
    .delete()
    .eq('id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { deleted: true, id } });
}
