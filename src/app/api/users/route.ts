import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

function err(code: string, message: string, status: number) {
  return NextResponse.json({ error: { code, message, requestId: crypto.randomUUID() } }, { status });
}

/**
 * GET /api/users — workspace users (picker for workflow approvers).
 * approver_id on acct_workflow_actions is an FK to auth.users, so
 * the approver picker reads the auth user list, not employees.
 * Service-role only: the route runs server-side with the admin key.
 */
export async function GET() {
  const sb = supabaseAdmin();
  const { data, error } = await sb.auth.admin.listUsers({ perPage: 1000 });
  if (error) return err('INTERNAL', error.message, 500);
  return NextResponse.json({
    data: (data?.users ?? []).map((u) => ({
      id: u.id,
      email: u.email || '',
      name: (u.user_metadata?.full_name as string) || (u.user_metadata?.name as string) || u.email || u.id,
    })),
  });
}
