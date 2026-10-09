// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';

const ME = { principalId: 'prn_000000000000000000a2', org: 'org_1', workspaceId: 'wks_1', role: 'owner' };
const item = (id: string) => ({ id, kind: 'artifact', title: `Title ${id.slice(-1)}`, scope: 'workspace', outcome: 'completed', createdBy: ME.principalId, createdAt: '2026-10-01T00:00:00.000Z', latestVersion: 1, expiresAt: null, revokedAt: null });
const version = { version: 1, entry: 'i.html', view: 'rendered', mediaType: 'text/html', totalBytes: 1, fileCount: 1, sha256: 'a'.repeat(64), createdAt: '2026-10-01T00:00:00.000Z', revokedAt: null, scanOverride: false, files: [] };
vi.mock('$lib/session.svelte', () => ({
  session: { me: { principalId: 'prn_000000000000000000a2', org: 'org_1', workspaceId: 'wks_1', role: 'owner' } },
  api: async (path: string, init?: RequestInit) => {
    if (path.endsWith('/remove')) return new Response('{}');
    const id = /items\/(itm_[0-9a-f]{16})/.exec(path)![1]!;
    return Response.json({ item: item(id), versions: [version] });
  },
}));
vi.mock('$app/navigation', () => ({ replaceState: vi.fn(), goto: vi.fn() }));
vi.mock('@superlibrary/embed', async (orig) => ({ ...(await orig<object>()), mountArtifact: async () => ({ destroy() {}, setTheme() {}, setVersion: async () => true }) }));
import ItemView from './ItemView.svelte';

let c: ReturnType<typeof mount> | null = null;
afterEach(() => { if (c) unmount(c); c = null; document.body.innerHTML = ''; });
const settle = async () => { for (let i = 0; i < 6; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); } };
const A = 'itm_00000000000000a1';
const B = 'itm_00000000000000b2';

describe('the item page after a removal', () => {
  it('focuses the heading, and shows the next item when the route changes', async () => {
    const props = $state({ itemId: A });
    c = mount(ItemView, { target: document.body, props });
    await settle();
    [...document.querySelectorAll('button')].find((b) => b.textContent!.trim() === 'Remove from memory')!.click();
    flushSync();
    const ta = document.querySelector<HTMLTextAreaElement>('[role=alertdialog] textarea')!;
    ta.value = 'posted twice'; ta.dispatchEvent(new Event('input', { bubbles: true })); flushSync();
    [...document.querySelectorAll<HTMLButtonElement>('[role=alertdialog] button')].find((b) => b.textContent === 'Remove from memory')!.click();
    await settle();
    expect(document.querySelector('h1')!.textContent).toBe('Removed from memory');
    expect(document.activeElement).toBe(document.querySelector('h1'));
    props.itemId = B;
    await settle();
    expect(document.body.textContent).not.toContain('Removed from memory');
    expect(document.querySelector('h1')!.textContent).toBe('Title 2');
  });
});
