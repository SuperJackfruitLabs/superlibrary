import { createHash } from 'node:crypto';
import { expect, type APIRequestContext, type FrameLocator, type Page } from '@playwright/test';
import { contentLabel, type CommitResult } from '@superlibrary/contract';

const API = 'http://localhost:8787';
export const APP = 'http://localhost:5173';
export const DEV = { 'X-Dev-Principal': 'prn_0000000000000000de01', 'X-Dev-Org': 'org_0000000000000000de01' };

/** The whole upload protocol, as a person (DEV_AUTH). `item` uploads a new version of it (plan D17). */
export async function uploadViaApi(
  request: APIRequestContext,
  files: { path: string; body: string | Buffer }[],
  opts: { title?: string; override?: string; item?: string } = {},
): Promise<CommitResult> {
  const bufs = files.map((f) => ({ path: f.path, buf: Buffer.isBuffer(f.body) ? f.body : Buffer.from(f.body) }));
  const created = await request.post(`${API}/api/v1/uploads`, {
    headers: DEV,
    data: {
      title: opts.title ?? 'e2e',
      ...(opts.item ? { item: opts.item } : {}),
      files: bufs.map((f) => ({ path: f.path, bytes: f.buf.length, sha256: createHash('sha256').update(f.buf).digest('hex') })),
    },
  });
  if (created.status() !== 201) throw new Error(`declare: ${created.status()} ${await created.text()}`);
  const { uploadId } = await created.json();
  for (const f of bufs) {
    const put = await request.put(`${API}/api/v1/uploads/${uploadId}/files?path=${encodeURIComponent(f.path)}`, { headers: DEV, data: f.buf });
    if (!put.ok()) throw new Error(`put ${f.path}: ${put.status()} ${await put.text()}`);
  }
  if (opts.override) {
    const o = await request.post(`${API}/api/v1/uploads/${uploadId}/override`, { headers: DEV, data: { reason: opts.override } });
    if (!o.ok()) throw new Error(`override: ${o.status()} ${await o.text()}`);
  }
  const committed = await request.post(`${API}/api/v1/uploads/${uploadId}/commit`, { headers: DEV });
  if (committed.status() !== 201) throw new Error(`commit: ${committed.status()} ${await committed.text()}`);
  return committed.json();
}

/** A signed frame URL, minted for the app as host (plan D18). */
export async function embedUrl(request: APIRequestContext, itemId: string, version?: number): Promise<string> {
  const res = await request.post(`${API}/api/v1/items/${itemId}/embed`, { headers: { ...DEV, Origin: APP }, data: version === undefined ? {} : { version } });
  if (!res.ok()) throw new Error(`embed: ${res.status()} ${await res.text()}`);
  return (await res.json()).url;
}

/** The item's own content origin (plan D10), as the dev content Worker serves it. */
export const contentOriginOf = (itemId: string) => `http://${contentLabel(itemId)}.localhost:8788`;

/** The SDK's frame (`iframe.sl-frame`); its accessible name is the item's title, so it is found by class. */
export const frameOf = (page: Page): FrameLocator => page.frameLocator('iframe.sl-frame');

/**
 * Watches a page for the two things no rendered file may cause (Task 13): a CSP violation in any
 * frame (an init script listens for `securitypolicyviolation`, which also sees a caught probe), and
 * a request to anywhere but the app and the item's own content origin. Install before `goto`.
 */
export async function watchContainment(page: Page, itemId: string) {
  await page.addInitScript(() => {
    const seen: string[] = [];
    Object.defineProperty(globalThis, '__slViolations', { value: seen });
    document.addEventListener('securitypolicyviolation', (e) => seen.push(`${e.effectiveDirective} ${e.blockedURI}`));
  });
  const allowed = new Set([APP, contentOriginOf(itemId)]);
  const offOrigin: string[] = [];
  const requests: string[] = [];
  /** URLs that got an answer, and why the others failed (`csp` is the browser's own refusal). */
  const responded: string[] = [];
  const failed: { url: string; error: string }[] = [];
  page.on('response', (r) => responded.push(r.url()));
  page.on('requestfailed', (r) => failed.push({ url: r.url(), error: r.failure()?.errorText ?? '' }));
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.protocol !== 'http:' && u.protocol !== 'https:' && u.protocol !== 'ws:' && u.protocol !== 'wss:') return; // data:, blob:
    requests.push(r.url());
    if (!allowed.has(u.origin)) offOrigin.push(r.url());
  });
  const content = contentOriginOf(itemId);
  /**
   * Every frame's violations. Only a frame that went away mid-read is skipped (a navigation, a
   * remount); any other failure to read is a failure, and the item's own frame must have been read,
   * so an empty answer cannot come from not looking.
   */
  const violations = async (): Promise<string[]> => {
    const all: string[] = [];
    let readContent = false;
    for (const f of page.frames()) {
      let v: string[];
      try {
        v = await f.evaluate(() => (globalThis as { __slViolations?: string[] }).__slViolations ?? []);
      } catch (e) {
        if (f.isDetached() || /detached|Execution context was destroyed|navigat/i.test(String(e))) continue;
        throw e;
      }
      if (f.url().startsWith(`${content}/`)) readContent = true;
      all.push(...v);
    }
    expect(readContent, `the item's content-origin frame (${content}) was read for violations`).toBe(true);
    return all;
  };
  return {
    requests,
    responded,
    failed,
    violations,
    /** No CSP violation anywhere, no request off the two origins, and the frame's own requests did reach its origin. */
    async expectContained() {
      expect(await violations(), 'securitypolicyviolation events').toEqual([]);
      expect(offOrigin, 'requests off the app and content origins').toEqual([]);
      expect(requests.some((u) => u.startsWith(`${contentOriginOf(itemId)}/`)), 'the frame loaded from its content origin').toBe(true);
    },
  };
}
