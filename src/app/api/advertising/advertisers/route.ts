import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { toAdAdvertiser } from '@/lib/adDto';

/* Advertisers (doc 22 nav: Advertising/Advertisers → ad_advertisers). */

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

export async function GET() {
  const { data, error } = await supabaseAdmin()
    .from('ad_advertisers')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(200);
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: (data || []).map((r) => toAdAdvertiser(r as Record<string, unknown>)) });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  if (typeof body.displayName !== 'string' || !body.displayName.trim()) return err('VALIDATION', 'displayName is required', 400);
  const sb = supabaseAdmin();
  const isSystem = body.isSystem === true;
  let userId = typeof body.userId === 'string' ? body.userId : null;
  if (!isSystem && !userId) {
    const { data: users } = await sb.auth.admin.listUsers({ page: 1, perPage: 1 });
    userId = users?.users?.[0]?.id || null;
  }
  if (!isSystem && !userId) {
    return err('VALIDATION', 'Advertisers belong to a user account — no user exists to own this advertiser.', 400);
  }
  const { data, error } = await sb
    .from('ad_advertisers')
    .insert({
      display_name: body.displayName.trim(),
      status: typeof body.status === 'string' ? body.status : 'active',
      is_system: isSystem,
      user_id: userId,
    })
    .select('*')
    .single();
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({ data: toAdAdvertiser(data as Record<string, unknown>) }, { status: 201 });
}
