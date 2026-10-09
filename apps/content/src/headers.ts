import { FRAME_SANDBOX, contentCsp } from '@superlibrary/contract';

export interface HeaderEnv { FRAME_ANCESTORS: string }
export const frameAncestors = (env: HeaderEnv) => env.FRAME_ANCESTORS.split(/\s+/).filter((s) => s !== '');

/** Media types a browser runs as a document of this origin when opened top-level. */
const isDocument = (contentType: string) => /^(text\/html|image\/svg\+xml)\b/i.test(contentType);

function common(env: HeaderEnv, contentType: string, disposition: string): Headers {
  // Ruling C9: an HTML or SVG document sandboxes itself, so it gets an opaque origin even when it is
  // opened outside the host's frame. The directive is inert on everything else.
  const csp = contentCsp(frameAncestors(env)) + (isDocument(contentType) ? `; sandbox ${FRAME_SANDBOX}` : '');
  return new Headers({
    'Content-Type': contentType,
    'Content-Disposition': disposition,
    'Content-Security-Policy': csp,
    'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Referrer-Policy': 'no-referrer',
    // Never stored by default: content that a valid token served says how long it may be kept (cacheUntil).
    'Cache-Control': 'no-store',
  });
}

/** A page the host frames: the viewer, or an HTML artifact's own page. CORP same-site (spec §9). */
export function documentHeaders(env: HeaderEnv, contentType: string, disposition = 'inline'): Headers {
  const h = common(env, contentType, disposition);
  h.set('Cross-Origin-Resource-Policy', 'same-site');
  return h;
}

/**
 * Everything such a page loads. The page's origin is opaque (no allow-same-origin), and Chromium
 * blocks an opaque origin's subresources under CORP same-site — measured, plan D2 — and needs
 * ACAO for module scripts and fonts. The signed path is still required to fetch any byte.
 */
export function subresourceHeaders(env: HeaderEnv, contentType: string, disposition = 'inline'): Headers {
  const h = common(env, contentType, disposition);
  h.set('Cross-Origin-Resource-Policy', 'cross-origin');
  h.set('Access-Control-Allow-Origin', '*');
  return h;
}

/**
 * The answer when FRAME_ANCESTORS is empty (ruling T11): no CSP can be built that limits framing,
 * so nothing is served, and this refusal itself may be framed by no one.
 */
export function unconfiguredHeaders(): Headers {
  return new Headers({
    'Content-Type': 'application/json',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
    'X-Content-Type-Options': 'nosniff',
    'Cross-Origin-Resource-Policy': 'same-site',
    'Cache-Control': 'no-store',
  });
}

/**
 * Served content may be kept only while its token is valid: revocation is immediate (plan D7), so
 * no cache may outlive the URL that fetched it.
 */
export function cacheUntil(headers: Headers, exp: number): Headers {
  headers.set('Cache-Control', `private, max-age=${Math.max(0, exp - Math.floor(Date.now() / 1000))}`);
  return headers;
}
