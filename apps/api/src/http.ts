export function json(body: unknown, status = 200, headers: HeadersInit = {}): Response {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

/** Every refusal names itself: `{ error: <code>, ... }`, never a bare status. */
export function error(status: number, code: string, extra: Record<string, unknown> = {}): Response {
  return json({ error: code, ...extra }, status);
}
