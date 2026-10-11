// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';

const mounts: Array<{ el: HTMLElement; destroyed: boolean; version: number[] }> = [];
/** While set, mountArtifact does not resolve until it is released. */
let gate: Promise<void> | null = null;
vi.mock('@superlibrary/embed', async (orig) => ({
  ...(await orig<object>()),
  mountArtifact: async (el: HTMLElement) => { const m = { el, destroyed: false, version: [] as number[] }; mounts.push(m); await gate; return { destroy() { m.destroyed = true; }, setTheme() {}, setVersion: async (n: number) => { m.version.push(n); return true; } }; },
}));
vi.mock('$app/navigation', () => ({ replaceState: vi.fn(), goto: vi.fn() }));
let reply: (path: string, init?: RequestInit) => Response = () => Response.json({});
vi.mock('$lib/session.svelte', () => ({
  session: { me: { principalId: 'prn_000000000000000000a2', org: 'org_1', workspaceId: 'wks_1', role: 'owner' } },
  api: async (p: string, i?: RequestInit) => reply(p, i),
}));
import { ItemModel, UNREACHABLE } from './item.svelte';

const ID = 'itm_00000000000000a1';
const item = { id: ID, kind: 'artifact', title: 'Report', scope: 'workspace', outcome: 'completed', createdBy: 'prn_000000000000000000a2', createdAt: '2026-10-01T00:00:00.000Z', latestVersion: 2, expiresAt: null, revokedAt: null };
const v = (n: number, extra: object = {}) => ({ version: n, entry: 'a.md', view: 'markdown', mediaType: 'text/markdown', totalBytes: 10, fileCount: 1, sha256: 'a'.repeat(64), createdAt: '2026-10-01T00:00:00.000Z', revokedAt: null, scanOverride: false, files: [], ...extra });
const settle = async () => { for (let i = 0; i < 6; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); } };
let stop: (() => void) | null = null;
afterEach(() => { stop?.(); stop = null; mounts.length = 0; gate = null; });
const make = (props: { itemId: string; version?: number }) => { let m!: ItemModel; stop = $effect.root(() => { m = new ItemModel(() => props); }); return m; };

describe('the item page model', () => {
  it('reads the item and says its facts', async () => {
    reply = () => Response.json({ item, versions: [v(2), v(1)] });
    const m = make({ itemId: ID });
    await settle();
    expect(m.phase).toBe('ok');
    expect(m.manage).toBe(true);
    expect(m.versionWords).toBe('v2 (latest)');
    expect(m.detailsHeading).toBe('Details · version 2');
    expect(m.visibility).toBe('Everyone in the workspace');
    expect(m.headerActions.map((a) => a.label)).toEqual(['Upload a new version']);
    expect(m.tabTitle).toBe('Report');
  });

  it('says what is inside each enclosure, from data', async () => {
    reply = () => Response.json({ item, versions: [v(2, { totalBytes: 1234 }), v(1)] });
    const m = make({ itemId: ID });
    await settle();
    expect(m.versionsSummary).toBe('2 versions · v2 latest');
    expect(m.detailsSummary).toBe('Markdown · 1.2 KB');
    expect(m.artifactsSummary).toBe('');
    stop!();
    reply = () => Response.json({ item, versions: [v(1)] });
    const one = make({ itemId: ID });
    await settle();
    expect(one.versionsSummary).toBe('1 version · v1 latest');
  });

  it('the timeline, related and collections summaries count correctly, one and many', async () => {
    reply = () => Response.json({ item, versions: [v(1)] });
    const m = make({ itemId: ID });
    await settle();
    const rec = (handoffs: number) => ({ record: { createdAt: '2026-10-01T00:00:00.000Z', archivedAt: null, comments: [], gates: [],
      handoffs: Array.from({ length: handoffs }, (_, i) => ({ runId: `r${i}`, stage: 'draft', agent: null, startedAt: null, endedAt: null, attempt: i + 1, status: 'completed', handoff: null, failureReason: null })) } });
    m.record = rec(0) as unknown as typeof m.record;
    expect(m.timelineSummary).toBe('1 entry');
    m.record = rec(2) as unknown as typeof m.record;
    expect(m.timelineSummary).toBe('3 entries');
    // Still looking (or failed): no summary rather than a wrong one.
    expect([m.relatedSummary, m.collectionsSummary]).toEqual(['', '']);
    m.relatedCount = 1; m.collectionCount = 1;
    expect([m.relatedSummary, m.collectionsSummary]).toEqual(['1 item', '1 collection']);
    m.relatedCount = 0; m.collectionCount = 3;
    expect([m.relatedSummary, m.collectionsSummary]).toEqual(['0 items', '3 collections']);
  });

  it('a bad id is refused without asking; an unreachable library offers Try again', async () => {
    const calls: string[] = [];
    reply = (p) => { calls.push(p); throw new TypeError('offline'); };
    const bad = make({ itemId: 'not-an-id' });
    await settle();
    expect(bad.refusal).toBe('Nothing here, or you cannot see it.');
    expect(bad.canRetryRefusal).toBe(false);
    expect(calls).toEqual([]);
    stop!();
    const off = make({ itemId: ID });
    await settle();
    expect(off.refusal).toBe(UNREACHABLE);
    expect(off.canRetryRefusal).toBe(true);
  });

  it('mounts one viewer on the attached element; a new element replaces it', async () => {
    reply = () => Response.json({ item, versions: [v(1)] });
    const m = make({ itemId: ID });
    await settle();
    const a = document.createElement('div');
    const detach = m.viewer(a) as () => void;
    await settle();
    expect(mounts.map((x) => x.el)).toEqual([a]);
    detach();
    const b = document.createElement('div');
    m.viewer(b);
    await settle();
    expect(mounts[0]!.destroyed).toBe(true);
    expect(mounts.map((x) => x.el)).toEqual([a, b]);
  });

  it('revoking a version asks first, then says so', async () => {
    let revoked = false;
    reply = (p) => {
      if (p.endsWith('/versions/2/revoke')) { revoked = true; return Response.json({}); }
      return Response.json({ item, versions: revoked ? [v(2, { revokedAt: '2026-10-02T00:00:00.000Z' }), v(1)] : [v(2), v(1)] });
    };
    const m = make({ itemId: ID });
    await settle();
    m.revokeVersion(new MouseEvent('click'), 2);
    expect(m.pending?.action).toBe('Revoke version 2');
    await m.confirmPending('');
    await settle();
    expect(revoked).toBe(true);
    expect(m.pending).toBeNull();
    expect(m.notice).toBe('Version 2 was revoked.');
  });

  it('a delete date must be after today', async () => {
    reply = () => Response.json({ item, versions: [v(1)] });
    const m = make({ itemId: ID });
    await settle();
    m.expires = '2000-01-01';
    await m.saveExpiry(false);
    expect(m.expiryError).toBe('Choose a date after today.');
  });
});

describe('the viewer is mounted once at a time', () => {
  const live = () => mounts.filter((x) => !x.destroyed);

  it('switching version in place keeps the one embed', async () => {
    reply = () => Response.json({ item, versions: [v(2), v(1)] });
    const m = make({ itemId: ID });
    await settle();
    m.viewer(document.createElement('div'));
    await settle();
    await m.pick(1, new MouseEvent('click', { cancelable: true }));
    expect(mounts).toHaveLength(1);
    expect(mounts[0]!.version).toEqual([1]);
    expect(m.shown).toBe(1);
  });

  it('showing the latest, or trying again, destroys the old embed and mounts exactly one', async () => {
    reply = () => Response.json({ item, versions: [v(2), v(1)] });
    const m = make({ itemId: ID });
    await settle();
    m.viewer(document.createElement('div'));
    await settle();
    m.showLatest();
    await settle();
    m.retryViewer();
    await settle();
    expect(mounts).toHaveLength(3);
    expect(live()).toHaveLength(1);
    expect(mounts[2]!.destroyed).toBe(false);
  });

  it('a layout that attaches a new element before the old one detaches still leaves one embed', async () => {
    reply = () => Response.json({ item, versions: [v(1)] });
    const m = make({ itemId: ID });
    await settle();
    const a = document.createElement('div');
    const b = document.createElement('div');
    const detachA = m.viewer(a) as () => void;
    await settle();
    m.viewer(b);
    detachA(); // the old element's cleanup runs after the new one attached: it must not unset the new one
    await settle();
    expect(live().map((x) => x.el)).toEqual([b]);
  });

  it('a mount still pending when the page goes is destroyed when it resolves', async () => {
    reply = () => Response.json({ item, versions: [v(1)] });
    let release!: () => void;
    gate = new Promise<void>((r) => { release = r; });
    const m = make({ itemId: ID });
    await settle();
    m.viewer(document.createElement('div'));
    await settle();
    expect(mounts).toHaveLength(1);
    stop!();
    stop = null;
    release();
    await settle();
    expect(mounts[0]!.destroyed).toBe(true);
  });

  it('a mount pending when the element is replaced is destroyed, and only the new one lives', async () => {
    reply = () => Response.json({ item, versions: [v(1)] });
    let release!: () => void;
    gate = new Promise<void>((r) => { release = r; });
    const m = make({ itemId: ID });
    await settle();
    const detach = m.viewer(document.createElement('div')) as () => void;
    await settle();
    detach();
    const b = document.createElement('div');
    m.viewer(b);
    await settle();
    release();
    await settle();
    expect(mounts.map((x) => x.destroyed)).toEqual([true, false]);
    expect(mounts[1]!.el).toBe(b);
  });
});

describe('focus after the dialogs', () => {
  const focusable = (tag: string) => { const e = document.createElement(tag); e.tabIndex = -1; document.body.append(e); return e; };

  it('a revoked item has no control to return to: focus goes to the refusal', async () => {
    let revoked = false;
    reply = (p, init) => {
      if (init?.method === 'POST') { revoked = true; return Response.json({}); }
      return revoked ? Response.json({ error: 'revoked' }, { status: 410 }) : Response.json({ item, versions: [v(1)] });
    };
    const m = make({ itemId: ID });
    await settle();
    const p = focusable('p');
    m.refusalAnchor(p);
    (document.activeElement as HTMLElement | null)?.blur();
    m.revokeItem(new MouseEvent('click'));
    await m.confirmPending('');
    await settle();
    expect(m.pending).toBeNull();
    expect(m.phase).not.toBe('ok');
    expect(document.activeElement).toBe(p);
    p.remove();
  });

  it('a revoked version has no Revoke button: focus goes to the notice', async () => {
    reply = (p, init) => (init?.method === 'POST' ? Response.json({}) : Response.json({ item, versions: [v(2), v(1)] }));
    const m = make({ itemId: ID });
    await settle();
    const n = focusable('div');
    m.noticeEl = n;
    (document.activeElement as HTMLElement | null)?.blur();
    m.revokeVersion(new MouseEvent('click'), 1);
    await m.confirmPending('');
    await settle();
    expect(m.pending).toBeNull();
    expect(document.activeElement).toBe(n);
    n.remove();
  });

  it('removal puts focus on the heading the layout anchors, and releases it on detach', async () => {
    reply = () => Response.json({ item, versions: [v(1)] });
    const m = make({ itemId: ID });
    await settle();
    const h = focusable('h1');
    const detach = m.removedAnchor(h) as () => void;
    await m.removedNow();
    expect(m.removed).toBe(true);
    expect(document.activeElement).toBe(h);
    detach();
    (document.activeElement as HTMLElement | null)?.blur();
    await m.removedNow();
    expect(document.activeElement).not.toBe(h);
    h.remove();
  });

  it('an anchor attached before the old one detaches keeps the new element', async () => {
    reply = () => Response.json({ item, versions: [v(1)] });
    const m = make({ itemId: ID });
    await settle();
    const a = focusable('h1');
    const b = focusable('h1');
    const detachA = m.removedAnchor(a) as () => void;
    m.removedAnchor(b);
    detachA();
    await m.removedNow();
    expect(document.activeElement).toBe(b);
    a.remove(); b.remove();
  });

  it('a failed confirmation keeps the dialog open with its sentence', async () => {
    reply = (p) => (p.includes('/revoke') ? Response.json({ error: 'forbidden' }, { status: 403 }) : Response.json({ item, versions: [v(2), v(1)] }));
    const m = make({ itemId: ID });
    await settle();
    m.revokeVersion(new MouseEvent('click'), 1);
    await m.confirmPending('');
    expect(m.pending).not.toBeNull();
    expect(m.dialogError).toBeTruthy();
    m.cancelPending();
    expect(m.pending).toBeNull();
  });
});
