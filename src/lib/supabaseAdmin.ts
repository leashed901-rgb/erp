/**
 * supabaseAdmin.ts — server-side Supabase client (service role).
 * Lazy singleton — never throws at module-eval time. Connects to the real
 * project via env (see supabaseConfig.ts). Used by every API route + the
 * party mirror. Writes NEVER flow from the client; this is server-only.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, DEFAULT_TENANT_ID } from './supabaseConfig';

let _client: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (!_client) {
    _client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
  }
  return _client;
}

export { DEFAULT_TENANT_ID };
