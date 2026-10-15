// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';

let reply: (path: string, init?: RequestInit) => Response = () => Response.json({ collections: [] });
vi.mock('$lib/session.svelte', () => ({ api: async (p: string, i?: RequestInit) => reply(p, i) }));
import { CollectionModel, CollectionsModel, countWords } from './collections.svelte';

const settle = async () => { for (let i = 0; i < 6; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); } };
let stop: (() => void) | null = null;
afterEach(() => { stop?.(); stop = null; document.body.innerHTML = ''; });
const detail = { id: 'col_0123456789abcdef', name: 'Week 41', description: '', createdBy: 'p', createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z', itemCount: 1, canEdit: true, entries: [] };

describe('collections', () => {
  it('counts in words', () => { expect(countWords(1)).toBe('1 item'); expect(countWords(3)).toBe('3 items'); });

  it('creating needs a name, then opens the new collection', async () => {
    const go = vi.fn();
    reply = (p, i) => (i?.method === 'POST' ? Response.json({ ...detail, id: 'col_00000000000000c9' }) : Response.json({ collections: [] }));
    let m!: CollectionsModel;
    stop = $effect.root(() => { m = new CollectionsModel(go); });
    await settle();
    await m.create();
    expect(m.createError).toBe('Give the collection a name.');
    m.name = 'Week 42';
    await m.create();
    expect(go).toHaveBeenCalledWith('/collections/col_00000000000000c9');
  });

  it('a bad id is refused without asking, and the meta line is in words', async () => {
    const calls: string[] = [];
    reply = (p) => { calls.push(p); return Response.json(detail); };
    let bad!: CollectionModel;
    stop = $effect.root(() => { bad = new CollectionModel(() => 'nope', vi.fn()); });
    await settle();
    expect(bad.error).toBe("This doesn't exist or isn't shared with you.");
    expect(calls).toEqual([]);
    stop!();
    let m!: CollectionModel;
    stop = $effect.root(() => { m = new CollectionModel(() => detail.id, vi.fn()); });
    await settle();
    expect(m.meta).toMatch(/^1 item · created /);
    expect(m.ask?.action).toBe('Delete collection');
  });

  it('a newer rename anchor is never cleared by an older detach, and Cancel focuses the live one', async () => {
    reply = () => Response.json(detail);
    let m!: CollectionModel;
    stop = $effect.root(() => { m = new CollectionModel(() => detail.id, vi.fn()); });
    await settle();
    const a = document.body.appendChild(document.createElement('button'));
    const b = document.body.appendChild(document.createElement('button'));
    const detachA = m.renameAnchor(a) as () => void;
    m.renameAnchor(b);
    detachA();
    await m.stopEditing();
    expect(document.activeElement).toBe(b);
  });
});
