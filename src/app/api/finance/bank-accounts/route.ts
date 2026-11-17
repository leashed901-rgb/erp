import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

const err = (code: string, message: string, status: number) =>
  NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });

export interface BankAccountDto {
  id: string;
  name: string;
  institutionName: string | null;
  accountType: string | null;
  maskedAccountNumber: string | null;
  glAccountId: string | null;
  isActive: boolean;
}

const toDto = (r: Record<string, unknown>): BankAccountDto => ({
  id: String(r.id),
  name: String(r.name),
  institutionName: (r.institution_name as string) || null,
  accountType: (r.account_type as string) || null,
  maskedAccountNumber: (r.masked_account_number as string) || null,
  glAccountId: (r.gl_account_id as string) || null,
  isActive: Boolean(r.is_active),
});

/** GET /api/finance/bank-accounts — pay-from pickers (tax filing pay,
 *  payroll post) read from here. */
export async function GET() {
  const { data, error } = await supabaseAdmin()
    .from('acct_bank_accounts')
    .select('*')
    .eq('tenant_id', DEFAULT_TENANT_ID)
    .eq('is_active', true)
    .order('name', { ascending: true });
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: (data || []).map(toDto) });
}

/** POST /api/finance/bank-accounts — register a bank account. */
export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return err('VALIDATION', 'Invalid JSON', 400); }
  if (!body.name) return err('VALIDATION', 'name is required', 400);
  const insert = {
    tenant_id: DEFAULT_TENANT_ID,
    name: String(body.name),
    institution_name: body.institutionName ? String(body.institutionName) : null,
    account_type: String(body.accountType || 'checking'),
    masked_account_number: body.maskedAccountNumber ? String(body.maskedAccountNumber) : null,
    gl_account_id: body.glAccountId ? String(body.glAccountId) : null,
    currency: 'USD',
    is_active: true,
  };
  const { data, error } = await supabaseAdmin().from('acct_bank_accounts').insert(insert).select('*').single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: toDto(data) }, { status: 201 });
}
