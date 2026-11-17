import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

const err = (code: string, message: string, status: number) =>
  NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });

/** DELETE /api/parties/[id]/addresses/[addressId] — remove an address. */
export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string; addressId: string }> }) {
  const { id, addressId } = await ctx.params;
  const { error } = await supabaseAdmin()
    .from('acct_party_addresses')
    .delete()
    .eq('id', addressId)
    .eq('party_id', id)
    .eq('tenant_id', DEFAULT_TENANT_ID);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { deleted: true, id: addressId } });
}
