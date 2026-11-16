/**
 * Supabase connection config — NO HARDCODED SECRETS.
 *
 * The service-role key was removed from this file after it leaked (it was
 * embedded here as a fallback and shipped inside a zip). Treat the old key as
 * fully public/compromised: rotate it in the Supabase dashboard
 * (Settings → API → regenerate service-role key for project
 * pcwwvfgxnrglmmpbfqhf) BEFORE deploying. Until rotated, anyone with the old
 * key has service-role access to that project.
 *
 * Every value now comes from env. If any is missing, this throws at module
 * load (fail-fast) rather than silently falling back to a compromised key.
 */
function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) {
    throw new Error(
      `Missing required env var ${name}. Copy .env.example to .env and fill in real values ` +
        `(rotate the service-role key in the Supabase dashboard first).`,
    );
  }
  return v;
}

export const SUPABASE_URL = requiredEnv('NEXT_PUBLIC_SUPABASE_URL');
export const SUPABASE_SERVICE_ROLE_KEY = requiredEnv('SUPABASE_SERVICE_ROLE_KEY');
export const SUPABASE_ANON_KEY = requiredEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY');

/** The tenant this platform instance operates on. Not a secret. */
export const DEFAULT_TENANT_ID =
  process.env.DEFAULT_TENANT_ID || '652fd2be-d19a-4778-835d-db38094d7718';
