// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import type { ItemSummary } from '@superlibrary/contract';

let answer: () => Response = () => new Response('{}');
vi.mock('$lib/session.svelte', () => ({ api: async () => answer() }));
import ModerationPanel from './ModerationPanel.svelte';

let c: ReturnType<typeof mount> | null = null;
afterEach(() => { if (c) unmount(c); c = null; document.body.innerHTML = ''; });
const item = { id: 'itm_0123456789abcdef', kind: 'artifact', title: 'Plan', scope: 'workspace', outcome: 'completed', createdBy: 'p', createdAt: '2026-10-01T00:00:00.000Z', latestVersion: 1, expiresAt: null, revokedAt: null } as ItemSummary;
const settle = async () => { for (let i = 0; i < 5; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); } };

async function removeWith(reason: string) {
  const onremoved = vi.fn();
  c = mount(ModerationPanel, { target: document.body, props: { item, onchanged: vi.fn(), onremoved } });
  flushSync();
  [...document.querySelectorAll('button')].find((b) => b.textContent!.trim() === 'Remove from memory')!.click();
  flushSync();
  const ta = document.querySelector<HTMLTextAreaElement>('[role=alertdialog] textarea')!;
  ta.value = reason; ta.dispatchEvent(new Event('input', { bubbles: true })); flushSync();
  [...document.querySelectorAll<HTMLButtonElement>('[role=alertdialog] button')].find((b) => b.textContent === 'Remove from memory')!.click();
  await settle();
  return onremoved;
}

describe('removing from memory', () => {
  it('fires onremoved only on success', async () => {
    answer = () => new Response('{}');
    const onremoved = await removeWith('posted twice');
    expect(onremoved).toHaveBeenCalledOnce();
  });
  it('a refusal stays in the dialog and removes nothing', async () => {
    answer = () => Response.json({ error: 'forbidden' }, { status: 403 });
    const onremoved = await removeWith('posted twice');
    expect(onremoved).not.toHaveBeenCalled();
    expect(document.querySelector('[role=alertdialog] [role=alert]')).not.toBeNull();
  });
});
