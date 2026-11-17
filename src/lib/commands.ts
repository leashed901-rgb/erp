/**
 * commands.ts — the data-access bridge from the web app to @platform/commands.
 *
 * The web app has 139 API routes that call `supabaseAdmin().from('t').select/
 * insert/update` directly. The guide calls this "two data-access layers" — the
 * routes bypass the command registry (`@platform/commands`) and the typed RPC
 * wrappers (`@platform/db`). Re-routing all 139 in one pass is a Phase 2 effort.
 *
 * This file is the *bridge*: it makes `@platform/commands` importable from any
 * server route, and provides a single `getCommandContext()` helper that builds
 * the `{ supabase, userId, tenantId }` context the commands need. New code
 * (and any route that wants to migrate) imports from here; the legacy routes
 * carry a `@platform/commands bridge — legacy direct-write` comment block and
 * keep working unchanged until they migrate.
 *
 * The exports are:
 *   - everything from `@platform/commands` (defineCommand, commandContext,
 *     register/list/get/toMcpTools, the studio/techpack/rfq/media command
 *     bundles, registerAll)
 *   - `getCommandContext()` — server-route entry point: builds a CommandContext
 *     from supabaseAdmin + DEFAULT_TENANT_ID + the caller's userId (defaults to
 *     a service-internal system id when no authenticated user is present, e.g.
 *     a background sweep or a webhook).
 *
 * Server-only. Never import this from a client component — it transitively
 * imports supabaseAdmin (service-role client). The lint:security gate
 * (packages/config/eslint.config.mjs) blocks @/lib/supabaseAdmin from
 * apps/web/src/components/** and apps/web/src/hooks/** — this file lives under
 * apps/web/src/lib/** so it is not subject to that rule, but every consumer
 * must be a server route or server-only lib.
 */

// Re-export the command registry surface so consumers can do
//   `import { defineCommand, getCommandContext, studio } from '@/lib/commands'`
// without learning a second import path.
//
// The four command bundles (studio/techpack/rfq/media) are re-exported as
// namespaces from the root `@platform/commands` index — the package's
// `exports` map only exposes `.`, `./define`, `./registry`, `./context`, so
// importing `@platform/commands/studio` would not resolve; the index already
// does `export * as studio from './studio/commands'` (and same for the other
// three), so the namespace form below is the supported path.
export {
  defineCommand,
  commandContext,
  register,
  list,
  get,
  toMcpTools,
  registerAll,
  studio,
  techpack,
  rfq,
  media,
} from '@platform/commands';
export type {
  CommandDef,
  CommandContext,
  CommandScope,
  CommandPermission,
} from '@platform/commands';

import { supabaseAdmin, DEFAULT_TENANT_ID } from './supabaseAdmin';
import type { CommandContext } from '@platform/commands';

/**
 * A stable id used when a server route runs without an authenticated user in
 * the request context (background sweeps, webhook receivers, the render
 * worker's polling loop). The platform_parties row for this id is created by
 * the dev seed; production installs mint it from the bootstrap script. The
 * point is that commands always carry a non-empty `userId` — the registry
 * contract requires it.
 */
export const SYSTEM_USER_ID =
  process.env.SYSTEM_USER_ID || '00000000-0000-0000-0000-000000000001';

/**
 * Build a CommandContext for a server route.
 *
 * Usage in an API route:
 *   import { getCommandContext, studio } from '@/lib/commands';
 *   export async function POST(req: NextRequest) {
 *     const ctx = getCommandContext(req.headers.get('x-user-id') || undefined);
 *     const result = await studio.designSave.run(
 *       { designId, canvasJson },
 *       ctx,
 *     );
 *     ...
 *   }
 *
 * `userId` is optional — when omitted, the context falls back to SYSTEM_USER_ID
 * so background routes (cron sweeps, webhook receivers, the render worker)
 * still satisfy the `userId` invariant. The tenant is always DEFAULT_TENANT_ID
 * (the platform is single-tenant per install; multi-tenant is a Phase 3
 * concern and would flow through the API key on apps/api, not here).
 *
 * The supabase client is the service-role admin client. Commands that need a
 * user-scoped client (RLS-enforced reads) should be re-routed through the
 * storefront API (apps/api), not invoked from the staff app's server routes.
 */
export function getCommandContext(userId?: string): CommandContext {
  return {
    supabase: supabaseAdmin(),
    userId: userId || SYSTEM_USER_ID,
    tenantId: DEFAULT_TENANT_ID,
  };
}

/**
 * Convenience: also re-export DEFAULT_TENANT_ID + SYSTEM_USER_ID so server
 * routes that already import { DEFAULT_TENANT_ID } from '@/lib/supabaseAdmin'
 * can switch to importing from '@/lib/commands' without losing the constant.
 */
export { DEFAULT_TENANT_ID };
