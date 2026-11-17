import { NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

const err = (code: string, message: string, status: number) =>
  NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });

/** GET /api/v1/shipping/printer-settings — the tenant's printer settings
 *  (tenant_printer_settings, PK tenant_id). 0 rows → the column defaults. */
export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb
    .from('tenant_printer_settings')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .maybeSingle();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({
    data: {
      receiptPaper: (data?.receipt_paper as string) || '80mm',
      receiptAutoPrint: (data?.receipt_auto_print as boolean) ?? true,
      labelPaper: (data?.label_paper as string) || '4x6',
      labelAutoPrint: (data?.label_auto_print as boolean) ?? true,
      documentPaper: (data?.document_paper as string) || 'letter',
      documentAutoPrint: (data?.document_auto_print as boolean) ?? true,
      configured: !!data,
    },
  });
}

/** POST /api/v1/shipping/printer-settings — upsert the tenant's printer
 *  settings. Body: { receiptPaper, receiptAutoPrint, labelPaper,
 *  labelAutoPrint, documentPaper, documentAutoPrint } (any subset). */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const patch: Record<string, unknown> = { tenant_id: DEFAULT_TENANT_ID };
  const map: Record<string, string> = {
    receiptPaper: 'receipt_paper',
    receiptAutoPrint: 'receipt_auto_print',
    labelPaper: 'label_paper',
    labelAutoPrint: 'label_auto_print',
    documentPaper: 'document_paper',
    documentAutoPrint: 'document_auto_print',
  };
  for (const [key, col] of Object.entries(map)) {
    if (body[key] !== undefined) patch[col] = body[key];
  }
  patch.updated_at = new Date().toISOString();
  const { data, error } = await supabaseAdmin()
    .from('tenant_printer_settings')
    .upsert(patch, { onConflict: 'tenant_id' })
    .select('*')
    .single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({
    data: {
      receiptPaper: (data?.receipt_paper as string) || '80mm',
      receiptAutoPrint: (data?.receipt_auto_print as boolean) ?? true,
      labelPaper: (data?.label_paper as string) || '4x6',
      labelAutoPrint: (data?.label_auto_print as boolean) ?? true,
      documentPaper: (data?.document_paper as string) || 'letter',
      documentAutoPrint: (data?.document_auto_print as boolean) ?? true,
      configured: true,
    },
  });
}
