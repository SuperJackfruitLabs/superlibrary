import type { Env } from './env';

/** A route group: its response, or null when the path is not its own. */
export type Handler = (request: Request, env: Env, ctx: ExecutionContext, url: URL) => Promise<Response | null>;

export function json(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

/** Every refusal names itself: `{ error: <code>, ... }`, never a bare status. */
export function error(status: number, code: string, extra: Record<string, unknown> = {}): Response {
  return json({ error: code, ...extra }, status);
}
