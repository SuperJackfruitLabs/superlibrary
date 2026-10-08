/** Spec §9: the hosts the content origin may load from. Change it here and nowhere else (plan D3). */
const CDN = ["'self'", 'data:', 'blob:', 'https://cdnjs.cloudflare.com', 'https://cdn.jsdelivr.net', 'https://unpkg.com'];
const FONTS = ['https://fonts.googleapis.com', 'https://fonts.gstatic.com'];
export const CONTENT_CSP_SOURCES = { cdn: CDN, fonts: FONTS } as const;

/** The content origin's CSP. No `form-action` (spec §9); `connect-src 'none'`. */
export function contentCsp(frameAncestors: string[]): string {
  const cdn = CDN.join(' ');
  const withFonts = `${cdn} ${FONTS.join(' ')}`;
  return [
    "default-src 'none'",
    `script-src ${cdn} 'unsafe-inline'`,
    `style-src ${withFonts} 'unsafe-inline'`,
    `img-src ${cdn}`,
    `font-src ${withFonts}`,
    `media-src ${cdn}`,
    "connect-src 'none'",
    `frame-ancestors ${frameAncestors.join(' ')}`,
  ].join('; ');
}

/** A path as a URL path: each segment encoded, the slashes kept. */
export function encodePath(path: string): string {
  return path.split('/').map(encodeURIComponent).join('/');
}

export function b64url(bytes: Uint8Array): string {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function fromB64url(s: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(s)) return null;
  try {
    const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
  } catch {
    return null;
  }
}

export interface ContentGrant {
  itemId: string;
  version: number;
  /** Unix seconds. */
  exp: number;
  /** The one origin the frame may post to (plan D18). */
  host: string;
}

/** What the API signs and the content Worker verifies. The item comes from the hostname, never the token. */
export function signingMessage(t: ContentGrant): Uint8Array {
  return new TextEncoder().encode(`superlibrary-content/v1\n${t.itemId}\n${t.version}\n${t.exp}\n${t.host}`);
}

/** `<version>.<exp>.<b64url host>.<b64url Ed25519 signature>` — path-safe, so it can sit in `/s/<token>/`. */
export function formatToken(t: { version: number; exp: number; host: string; sig: Uint8Array }): string {
  return `${t.version}.${t.exp}.${b64url(new TextEncoder().encode(t.host))}.${b64url(t.sig)}`;
}

export function parseToken(token: string): { version: number; exp: number; host: string; sig: Uint8Array } | null {
  const parts = token.split('.');
  if (parts.length !== 4) return null;
  const [v, e, h, s] = parts as [string, string, string, string];
  if (!/^[1-9][0-9]{0,8}$/.test(v) || !/^[1-9][0-9]{0,11}$/.test(e)) return null;
  const hostBytes = fromB64url(h);
  const sig = fromB64url(s);
  if (!hostBytes || !sig || sig.length !== 64) return null;
  return { version: Number(v), exp: Number(e), host: new TextDecoder().decode(hostBytes), sig };
}
