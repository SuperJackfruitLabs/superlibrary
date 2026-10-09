/** Where a completed sign-in may go: a path on this origin, nothing else. */
export function safeReturnTo(raw: string | null | undefined): string {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\') || /[\u0000-\u001f]/.test(raw)) return '/';
  return raw;
}
