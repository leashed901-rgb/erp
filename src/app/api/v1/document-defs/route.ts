import { NextResponse } from 'next/server';
import { DOCUMENT_DEFS } from '@/lib/documentDefs';

/** GET /api/v1/document-defs — every DocumentDef config (spec §B.4.4) */
export async function GET() {
  return NextResponse.json({ defs: DOCUMENT_DEFS });
}
