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

const originsOf = (s: string | undefined) => (s ?? '').split(/\s+/).filter((x) => x !== '');

/** CORS for a browser origin exactly in the space-separated `allowed` list, else none. Never credentials: callers send a bearer. */
export function corsFor(request: Request, allowed: string | undefined): Record<string, string> {
  const origin = request.headers.get('Origin');
  return origin && originsOf(allowed).includes(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};
}

/** A preflight's answer: 204, with the CORS headers only for an allowed origin. */
export function preflight(request: Request, allowed: string | undefined, methods: string): Response {
  const cors = corsFor(request, allowed);
  if (!cors['Access-Control-Allow-Origin']) return new Response(null, { status: 204 });
  return new Response(null, { status: 204, headers: { ...cors, 'Access-Control-Allow-Methods': methods, 'Access-Control-Allow-Headers': 'authorization, content-type', 'Access-Control-Max-Age': '600' } });
}

/** `res` with the CORS headers for an allowed origin added (every answer, refusals included). */
export function withCors(request: Request, allowed: string | undefined, res: Response): Response {
  for (const [k, v] of Object.entries(corsFor(request, allowed))) res.headers.set(k, v);
  return res;
}
