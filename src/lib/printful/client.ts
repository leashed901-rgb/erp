import { PRINTFUL_ACTION_BY_ID } from './actions.generated';

/**
 * Printful v2 executor for the generated actions (actions.generated.ts,
 * built from Printful's official OpenAPI spec — the gap-filler for the
 * one supplier Composio's catalog and Activepieces both lack).
 *
 * Auth is OAuth 2.0 only (Printful retired Basic keys). The token passed
 * in belongs to the TENANT's Printful store — obtained through the
 * tenant's own connection, never a platform credential.
 */

const BASE = 'https://api.printful.com';

export class PrintfulError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = 'PrintfulError';
    this.status = status;
  }
}

export async function printfulCall(
  token: string,
  actionId: string,
  opts: {
    pathParams?: Record<string, string | number>;
    query?: Record<string, string | number | undefined>;
    body?: unknown;
  } = {},
): Promise<unknown> {
  const action = PRINTFUL_ACTION_BY_ID.get(actionId);
  if (!action) throw new Error(`Unknown Printful action '${actionId}'`);
  let path = action.path;
  for (const name of action.pathParams) {
    const value = opts.pathParams?.[name];
    if (value === undefined) throw new Error(`Printful action '${actionId}' needs path param '${name}'`);
    path = path.replace(`{${name}}`, encodeURIComponent(String(value)));
  }
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(opts.query || {})) {
    if (v !== undefined) qs.set(k, String(v));
  }
  const url = `${BASE}${path}${qs.size ? `?${qs}` : ''}`;
  const res = await fetch(url, {
    method: action.method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: action.hasBody && opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    throw new PrintfulError(res.status, `Printful ${action.method} ${path} answered ${res.status}: ${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : null;
}
