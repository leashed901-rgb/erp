import { NextResponse, NextRequest } from 'next/server';
import { supabaseAdmin, DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * Controls (Batch I). GET — all controls (domain / process /
 * policy_rule / threshold / owner_role / enforcement / frequency /
 * status). POST — create (control_code + domain + process + status).
 * PATCH ?id= — edit. DELETE ?id=.
 */
export async function GET() {
  const { data, error } = await supabaseAdmin().from('acct_controls').select('*').eq('tenant_id', DEFAULT_TENANT_ID).order('control_code');
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({
    data: ((data ?? []) as Record<string, unknown>[]).map((c) => ({
      id: c.id,
      controlCode: c.control_code,
      domain: c.domain,
      process: c.process,
      policyRule: c.policy_rule,
      threshold: c.threshold,
      ownerRole: c.owner_role,
      enforcement: c.enforcement,
      frequency: c.frequency,
      status: c.status,
    })),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const controlCode = String(body.controlCode || '').trim();
  const domain = String(body.domain || '').trim();
  const process = String(body.process || '').trim();
  const status = String(body.status || '').trim();
  if (!controlCode) return err('VALIDATION', 'controlCode is required', 400);
  if (!domain) return err('VALIDATION', 'domain is required', 400);
  if (!process) return err('VALIDATION', 'process is required', 400);
  if (!status) return err('VALIDATION', 'status is required', 400);
  const { data, error } = await supabaseAdmin().from('acct_controls').insert({
    tenant_id: DEFAULT_TENANT_ID,
    control_code: controlCode,
    domain,
    process,
    policy_rule: body.policyRule ? String(body.policyRule) : null,
    threshold: (body.threshold && typeof body.threshold === 'object' ? body.threshold : {}),
    owner_role: body.ownerRole ? String(body.ownerRole) : null,
    enforcement: body.enforcement ? String(body.enforcement) : null,
    frequency: body.frequency ? String(body.frequency) : null,
    status,
  }).select().single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { id: data.id, controlCode: data.control_code, domain: data.domain, process: data.process, status: data.status } }, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return err('VALIDATION', 'id is required', 400);
  const body = await req.json().catch(() => ({}));
  const patch: Record<string, unknown> = {};
  if (body.domain !== undefined) patch.domain = String(body.domain || '').trim();
  if (body.process !== undefined) patch.process = String(body.process || '').trim();
  if (body.policyRule !== undefined) patch.policy_rule = body.policyRule ? String(body.policyRule) : null;
  if (body.threshold !== undefined) patch.threshold = (body.threshold && typeof body.threshold === 'object' ? body.threshold : {});
  if (body.ownerRole !== undefined) patch.owner_role = body.ownerRole ? String(body.ownerRole) : null;
  if (body.enforcement !== undefined) patch.enforcement = body.enforcement ? String(body.enforcement) : null;
  if (body.frequency !== undefined) patch.frequency = body.frequency ? String(body.frequency) : null;
  if (body.status !== undefined) patch.status = String(body.status || '').trim();
  if (Object.keys(patch).length === 0) return err('VALIDATION', 'Nothing to update', 400);
  if (patch.domain === '' || patch.process === '' || patch.status === '') return err('VALIDATION', 'domain, process and status cannot be empty', 400);
  const { data, error } = await supabaseAdmin().from('acct_controls').update(patch).eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id).select().single();
  if (error || !data) return err('NOT_FOUND', 'Control not found', 404);
  return NextResponse.json({ data: { id: data.id, controlCode: data.control_code, domain: data.domain, process: data.process, status: data.status } });
}

export async function DELETE(req: NextRequest) {
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return err('VALIDATION', 'id is required', 400);
  const { error } = await supabaseAdmin().from('acct_controls').delete().eq('tenant_id', DEFAULT_TENANT_ID).eq('id', id);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: { deleted: true } });
}
