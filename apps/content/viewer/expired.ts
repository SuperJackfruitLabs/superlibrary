/**
 * The expired page's one script (content Worker, `expiredPage`): tell the host signed into the URL
 * which file ran out, so it mints a new URL and reloads the same view. No imports, so it is tiny.
 */
import type { ExpiredMessage } from '@superlibrary/contract';

export function announceExpired(doc: Document = document, win: Window = window): void {
  const el = doc.getElementById('sl-expired');
  if (!el) return;
  const { host, path } = JSON.parse(el.textContent ?? '{}') as { host?: unknown; path?: unknown };
  if (typeof host !== 'string' || typeof path !== 'string') return;
  const msg: ExpiredMessage = { type: 'superlibrary:expired', path };
  win.parent.postMessage(msg, host);
}

announceExpired();
