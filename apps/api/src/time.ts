/**
 * Timestamps as the API returns them: ISO 8601 UTC with `Z`. SQLite's `datetime('now')` stores
 * `YYYY-MM-DD HH:MM:SS` (UTC, no zone), which browsers would parse as local time. Stored values
 * are unchanged; only responses are converted, here and nowhere else.
 */
export function isoUtc(t: string): string;
export function isoUtc(t: string | null): string | null;
export function isoUtc(t: string | null): string | null {
  if (t === null) return null;
  const m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}:\d{2}(?:\.\d+)?)(Z|[+-]\d{2}:\d{2})?$/.exec(t);
  if (!m) return t;
  return m[3] && m[3] !== 'Z' ? new Date(t).toISOString() : `${m[1]}T${m[2]}Z`;
}
