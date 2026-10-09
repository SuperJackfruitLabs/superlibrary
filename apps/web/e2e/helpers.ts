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

/** Nothing scrolls sideways: the page is no wider than the screen. */
export async function expectNoSideways(page: Page, label: string) {
  const w = await page.evaluate(() => ({ scrollWidth: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth), innerWidth: window.innerWidth }));
  expect(w.scrollWidth, `${label}: nothing scrolls sideways (innerWidth ${w.innerWidth})`).toBeLessThanOrEqual(w.innerWidth);
}

/**
 * Every control a person can tap on a phone is at least 44px tall (Apple's minimum; iOS is the
 * primary platform). A checkbox is measured by its label, which is what takes the tap; a link inside
 * a sentence is exempt (WCAG 2.5.8's inline exception).
 */
export async function shortControls(page: Page, atLeast: number): Promise<string[]> {
  const { checked, short } = await page.evaluate(() => {
    const short: string[] = [];
    let checked = 0;
    const controls = document.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, summary, [role=button]');
    for (const el of controls) {
      const target = el instanceof HTMLInputElement && (el.type === 'checkbox' || el.type === 'radio') ? (el.closest('label') ?? el) : el;
      const r = target.getBoundingClientRect();
      const style = getComputedStyle(target);
      if (r.width === 0 || r.height === 0 || style.visibility === 'hidden') continue;
      if (el.closest('[hidden], .visually-hidden')) continue;
      const p = el.tagName === 'A' ? el.closest('p') : null;
      if (p && p.textContent!.trim() !== el.textContent!.trim()) continue;
      checked++;
      if (r.height < 44 - 0.5) short.push(`${el.tagName.toLowerCase()}${el.className ? '.' + String(el.className).split(' ').join('.') : ''} "${(el.textContent || el.getAttribute('aria-label') || el.getAttribute('name') || '').trim().slice(0, 40)}" ${r.height.toFixed(1)}px`);
    }
    return { checked, short };
  });
  expect(checked, 'controls measured').toBeGreaterThanOrEqual(atLeast);
  return short;
}

import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** The dev person's workspace (on a fresh run, the dev person is its owner: the first person seen). */
export async function devWorkspace(request: APIRequestContext): Promise<string> {
  const res = await request.get(`${API}/api/v1/me`, { headers: DEV });
  return ((await res.json()) as { workspaceId: string }).workspaceId;
}

const sq = (s: string) => `'${s.replace(/'/g, "''")}'`;
const REPO = join(import.meta.dirname, '..', '..', '..');
let seq = 0;

/**
 * A work record written straight into the local D1 the dev Worker serves, with its FTS row. e2e has
 * no Superpipeline; these are the rows the ingest and index consumers write (phases 2-3 A13, B3).
 */
export function seedWorkRecordLocal(o: { ws: string; title: string; text: string; outcome: string; board?: string; boardName?: string; comment?: string }): string {
  const hex = `${Date.now().toString(16)}${(seq++).toString(16).padStart(4, '0')}`.slice(-16).padStart(16, '0');
  const id = `itm_${hex}`;
  const card = `card_${hex}`;
  const board = o.board ?? 'brd_00000000000000e1';
  const now = new Date().toISOString();
  const text = `${o.title}\n${o.text}`;
  const body = {
    schema: 'work-record/1', boardId: board, cardId: card, title: o.title, spec: { goal: o.text }, state: 'completed', stage: 'review', archivedAt: null, createdAt: now, updatedAt: now,
    handoffs: [{ runId: `run_${hex}`, stage: 'draft', agent: 'prn_000000000000000000a2', startedAt: now, endedAt: now, attempt: 1, status: 'completed', handoff: { summary: 'Draft ready' }, failureReason: null }],
    comments: [{ id: 'cmt_e2e', author: { kind: 'human', name: 'A person' }, body: o.comment ?? 'Reviewed', createdAt: now }],
    references: [], gates: [], supersededByCard: null, outcome: o.outcome, redactions: [], truncated: false,
  };
  const sql = [
    `INSERT OR REPLACE INTO source_boards (workspace_id, board_id, name, last_seen_at) VALUES (${sq(o.ws)}, ${sq(board)}, ${sq(o.boardName ?? 'Marketing & Community')}, ${sq(now)});`,
    `INSERT INTO items (id, workspace_id, kind, title, scope, outcome, created_by) VALUES (${sq(id)}, ${sq(o.ws)}, 'work-record', ${sq(o.title)}, ${sq(`board:${board}`)}, ${sq(o.outcome)}, 'source:superpipeline');`,
    `INSERT INTO work_records (item_id, workspace_id, board_id, card_id, digest, body, text, source_updated_at) VALUES (${sq(id)}, ${sq(o.ws)}, ${sq(board)}, ${sq(card)}, 'e2e', ${sq(JSON.stringify(body))}, ${sq(text)}, ${sq(now)});`,
    `INSERT INTO item_sources (item_id, source, board_id, card_id, stage, source_id, source_url) VALUES (${sq(id)}, 'superpipeline', ${sq(board)}, ${sq(card)}, 'review', ${sq(card)}, ${sq(`https://app.superpipeline.dev/b/${board}/c/${card}`)});`,
    `INSERT INTO chunks (id, item_id, version, position, text, tokens) VALUES (${sq(`${id}:0:0`)}, ${sq(id)}, 0, 0, ${sq(text)}, 20);`,
    `INSERT INTO chunks_fts (text, chunk_id, item_id) VALUES (${sq(text)}, ${sq(`${id}:0:0`)}, ${sq(id)});`,
  ].join('\n');
  const file = join(mkdtempSync(join(tmpdir(), 'sl-e2e-')), 'seed.sql');
  writeFileSync(file, sql);
  // The same persist directory the webServer's API uses (playwright.config.ts PERSIST), relative to apps/api.
  execFileSync('pnpm', ['--filter', '@superlibrary/api', 'exec', 'wrangler', 'd1', 'execute', 'superlibrary-catalog', '--local', '--persist-to', '../../.wrangler-e2e', '--file', file], { cwd: REPO, stdio: 'pipe' });
  return id;
}
