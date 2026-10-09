import { readFileSync } from 'node:fs';
import { webcrypto } from 'node:crypto';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { expect, test } from '@playwright/test';
import { formatToken, signingMessage } from '@superlibrary/contract';
import { APP, contentOriginOf, embedUrl, frameOf, uploadViaApi, watchContainment } from './helpers';

const PROBE = readFileSync(new URL('./fixtures/probe.js', import.meta.url), 'utf8');
const HTML = '<!doctype html><html><body><pre id="results"></pre><script src="probe.js"></script></body></html>';
const tokenOf = (url: string) => new URL(url).searchParams.get('sig')!;

// A security assertion that passes only on a second try is a failure, not a flake.
test.describe.configure({ retries: 0 });

test.describe('the content origin, under a malicious HTML artifact (spec §15)', () => {
  test('it runs, and can read no storage, reach no network, navigate nothing and open nothing', async ({ page, request }) => {
    const item = await uploadViaApi(request, [{ path: 'index.html', body: HTML }, { path: 'probe.js', body: PROBE }], { title: 'probe' });
    const watch = await watchContainment(page, item.itemId);
    const popups: string[] = [];
    page.on('popup', (p) => popups.push(p.url()));
    await page.goto('/');
    await page.evaluate(() => { localStorage.setItem('secret', 'app-secret'); sessionStorage.setItem('secret', 'app-secret'); });
    await page.goto(`/a/${item.itemId}`);
    const results = frameOf(page).locator('#results');
    await expect(results).not.toBeEmpty({ timeout: 15_000 });
    const r = JSON.parse((await results.textContent())!) as Record<string, string>;

    for (const k of ['localStorage', 'sessionStorage', 'cookie', 'indexedDB', 'parentStorage', 'parentDocument', 'topLocation', 'fetchExternal', 'fetchSelf', 'xhr', 'websocket', 'popup', 'topNavigation']) {
      expect(r[k], k).toMatch(/^blocked:/);
    }
    // sendBeacon only queues, so it answers true; the CSP then drops it (the connect-src poll below).
    expect(r.beacon, 'beacon').toBe('allowed:true');
    expect(JSON.stringify(r)).not.toContain('app-secret');

    // The CSP is what stopped the network attempts: wait until it has reported each of them.
    await expect.poll(async () => (await watch.violations()).filter((v) => v.startsWith('connect-src ')).map((v) => v.slice('connect-src '.length)).sort(), { timeout: 10_000 })
      .toEqual(expect.arrayContaining([`${contentOriginOf(item.itemId)}/s/`, 'https://example.com/', 'https://example.com/beacon', 'wss://example.com/'].map((u) => expect.stringContaining(u))));
    expect((await watch.violations()).every((v) => v.startsWith('connect-src ')), 'only the network attempts were refused by the CSP').toBe(true);
    // The XHR shows up as a request that the browser itself failed (`csp`); nothing got an answer.
    const outbound = watch.requests.filter((u) => new URL(u).hostname === 'example.com');
    expect(watch.responded.filter((u) => new URL(u).hostname === 'example.com'), 'no request reached the network').toEqual([]);
    expect(watch.failed.filter((f) => outbound.includes(f.url)).map((f) => f.error), 'each one refused by the CSP').toEqual(outbound.map(() => 'csp'));
    expect(popups).toEqual([]);
    expect(new URL(page.url()).pathname, 'the top window did not navigate').toBe(`/a/${item.itemId}`);
    expect(await page.evaluate(() => localStorage.getItem('secret')), "the app's storage is untouched").toBe('app-secret');
  });

  test('it cannot be framed by an origin outside the allowlist', async ({ page, request, browserName }) => {
    const item = await uploadViaApi(request, [{ path: 'index.html', body: HTML }, { path: 'probe.js', body: PROBE }]);
    const url = await embedUrl(request, item.itemId);
    // A real server on loopback, not `page.route`: Chrome's Local Network Access treats a fulfilled
    // page as public and refuses its frame before any request, which would pass for the wrong reason.
    const evil = createServer((_req, res) => { res.setHeader('content-type', 'text/html'); res.end(`<iframe sandbox="allow-scripts" src="${url}"></iframe>`); });
    await new Promise<void>((done) => evil.listen(0, '127.0.0.1', done));
    try {
      const responses: number[] = [];
      const content = new URL(url).origin;
      const policies: string[] = [];
      page.on('response', async (r) => {
        if (!r.url().startsWith(`${content}/s/`) || r.request().resourceType() !== 'document') return;
        responses.push(r.status());
        policies.push((await r.allHeaders())['content-security-policy'] ?? '');
      });
      const refusals: string[] = [];
      page.on('console', (m) => { if (m.text().includes('frame-ancestors')) refusals.push(m.text()); });
      await page.goto(`http://127.0.0.1:${(evil.address() as AddressInfo).port}/`);
      // The content Worker answered (`/_view` redirects to the entry), and the browser refused to
      // show it, because of frame-ancestors.
      await expect.poll(() => responses, { timeout: 10_000 }).toEqual([200]);
      const child = () => page.frames().find((f) => f !== page.mainFrame());
      // Chromium swaps the refused frame for its error page; WebKit leaves the URL and shows nothing.
      if (browserName === 'chromium') await expect.poll(() => child()?.url() ?? '', { timeout: 10_000 }).toMatch(/^chrome-error:/);
      await expect.poll(() => refusals.length, { timeout: 10_000 }).toBeGreaterThan(0);
      // Chromium names the policy in its message; WebKit only names the directive. The policy is
      // the configured allowlist either way: it is on the response the browser refused to show.
      if (browserName === 'chromium') expect(refusals[0]).toContain('http://localhost:5173');
      await expect.poll(() => policies[0] ?? '', { message: 'the refused document carries the configured frame-ancestors', timeout: 10_000 }).toMatch(/frame-ancestors http:\/\/localhost:5173(;|$)/);
      // In every engine: the refused frame holds none of the artifact's document.
      expect(child(), 'the frame exists').toBeDefined();
      expect(await child()!.locator('#results').count(), "the artifact's page did not render in the frame").toBe(0);
    } finally {
      await new Promise((done) => evil.close(done));
    }
  });

  test('the frame the app renders has exactly the spec §9 sandbox and referrer policy', async ({ page, request }) => {
    const item = await uploadViaApi(request, [{ path: 'a.md', body: '# a' }]);
    const watch = await watchContainment(page, item.itemId);
    await page.goto(`/a/${item.itemId}`);
    const frame = page.locator('iframe.sl-frame');
    await expect(frame).toHaveAttribute('sandbox', 'allow-scripts allow-popups-to-escape-sandbox');
    await expect(frame).toHaveAttribute('referrerpolicy', 'no-referrer');
    await expect(frameOf(page).locator('h1')).toHaveText('a');
    await watch.expectContained();
  });

  test('a signed URL opens only its own item and version', async ({ page, request }) => {
    const a = await uploadViaApi(request, [{ path: 'a.md', body: '# only in version 1' }], { title: 'scoped' });
    await uploadViaApi(request, [{ path: 'b.md', body: '# only in version 2' }], { item: a.itemId });
    const b = await uploadViaApi(request, [{ path: 'a.md', body: '# another item' }]);
    const v1 = tokenOf(await embedUrl(request, a.itemId, 1));
    const A = contentOriginOf(a.itemId);
    const status = async (url: string) => (await page.goto(url))!.status();

    // The control: the token opens its own version's file.
    expect(await status(`${A}/s/${v1}/a.md`)).toBe(200);
    expect(await page.locator('body').textContent()).toContain('# only in version 1');
    // Not a file of another version of the same item…
    expect(await status(`${A}/s/${v1}/b.md`)).toBe(404);
    // …nor that version by editing the token's version…
    expect(await status(`${A}/s/${v1.replace(/^1\./, '2.')}/b.md`)).toBe(403);
    expect(await page.locator('body').textContent()).toContain('invalid_signature');
    // …nor another item, on that item's origin.
    expect(await status(`${contentOriginOf(b.itemId)}/s/${v1}/a.md`)).toBe(403);
    expect(await page.locator('body').textContent()).toContain('invalid_signature');
  });

  test('a signed URL expires', async ({ page, request }) => {
    const item = await uploadViaApi(request, [{ path: 'a.md', body: '# expires' }]);
    // A genuine token for the item, signed with the dev key (`pnpm e2e` writes it), ten seconds in the past.
    const jwk = /URL_SIGNING_PRIVATE_KEY='([^']+)'/.exec(readFileSync(new URL('../../api/.dev.vars', import.meta.url), 'utf8'))![1]!;
    const key = await webcrypto.subtle.importKey('jwk', JSON.parse(jwk), { name: 'Ed25519' }, false, ['sign']);
    const sign = async (exp: number) => {
      const g = { itemId: item.itemId, version: 1, exp, host: APP };
      return formatToken({ version: 1, exp, host: APP, sig: new Uint8Array(await webcrypto.subtle.sign('Ed25519', key, signingMessage(g))) });
    };
    const now = Math.floor(Date.now() / 1000);
    const at = (t: string) => `${contentOriginOf(item.itemId)}/s/${t}/a.md`;

    expect((await page.goto(at(await sign(now + 60))))!.status(), 'the control: the same key, unexpired').toBe(200);
    const res = (await page.goto(at(await sign(now - 10))))!;
    expect(res.status()).toBe(403);
    // A navigation gets the page that asks the host for a new URL; it shows nothing of the file.
    expect(await res.text()).not.toContain('# expires');
    expect(await res.text()).toContain('/_viewer/expired.js');
  });
});
