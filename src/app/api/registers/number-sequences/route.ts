import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * GET /api/registers/number-sequences — the document-number
 * sequences (Batch I, read-only). Sequences are created on demand by
 * acct_next_number when a document asks for its next number; nothing
 * here is typed in by hand.
 */
export async function GET() {
  const { data, error } = await supabaseAdmin().from('acct_number_sequences').select('*').eq('tenant_id', DEFAULT_TENANT_ID).order('doc_type');
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({
    data: ((data ?? []) as Record<string, unknown>[]).map((s) => ({
      entityId: s.entity_id,
      docType: s.doc_type,
      prefix: s.prefix,
      nextValue: s.next_value,
      padding: s.padding,
    })),
  });
}
