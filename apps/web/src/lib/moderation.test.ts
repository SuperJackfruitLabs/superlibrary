// apps/web/src/lib/moderation.test.ts
import { describe, expect, it } from 'vitest';
import { askRemove, askSupersede, parseItemRef } from './moderation';
import { explain } from './item';

describe('moderation helpers (spec §11)', () => {
  it('parseItemRef takes an id or an item link, and nothing else', () => {
    expect(parseItemRef(' itm_0123456789abcdef ')).toBe('itm_0123456789abcdef');
    expect(parseItemRef('https://app.superlibrary.dev/a/itm_0123456789abcdef/v/3')).toBe('itm_0123456789abcdef');
    expect(parseItemRef('http://localhost:5173/a/itm_0123456789abcdef?x=1')).toBe('itm_0123456789abcdef');
    expect(parseItemRef('itm_0123')).toBeNull();
    expect(parseItemRef('https://example.com/b/itm_0123456789abcdef')).toBeNull();
  });
  it('the confirmations name the act, and removal asks for a reason', () => {
    expect(askSupersede('Old plan', 'New plan')).toMatchObject({ title: 'Mark “Old plan” as superseded?', action: 'Mark as superseded' });
    expect(askRemove('Old plan', 'work-record')).toMatchObject({ action: 'Remove from memory', reason: true, required: true });
    expect(askRemove('Old plan', 'work-record').message).toContain('later changes to the card will not bring it back');
  });
  it('refusals read as sentences', () => {
    expect(explain('invalid', 'that would make a loop of replacements')).toBe('That would make a loop: the replacement is already marked as superseded by this item.');
    expect(explain('invalid', 'an item cannot supersede itself')).toBe('An item cannot replace itself.');
    expect(explain('not_found', 'the replacement was not found')).toBe('Nothing here, or you cannot see it.');
  });
});

describe('the wire calls', () => {
  const seen: Array<{ path: string; method: string | undefined; body: unknown }> = [];
  const ok = async (path: string, init?: RequestInit) => { seen.push({ path, method: init?.method, body: JSON.parse(String(init?.body)) }); return new Response('{}'); };
  it('send the documented paths, methods and bodies', async () => {
    const { supersede, setCaption, widen, removeItem } = await import('./moderation');
    const id = 'itm_0123456789abcdef';
    expect(await supersede(ok, id, 'itm_0123456789abcde0')).toBeNull();
    expect(await supersede(ok, id, null)).toBeNull();
    expect(await setCaption(ok, id, 'A diagram')).toBeNull();
    expect(await widen(ok, id)).toBeNull();
    expect(await removeItem(ok, id, 'posted twice')).toBeNull();
    expect(seen).toEqual([
      { path: `/api/v1/items/${id}/supersede`, method: 'POST', body: { by: 'itm_0123456789abcde0' } },
      { path: `/api/v1/items/${id}/supersede`, method: 'POST', body: { by: null } },
      { path: `/api/v1/items/${id}/caption`, method: 'PATCH', body: { caption: 'A diagram' } },
      { path: `/api/v1/items/${id}/scope`, method: 'POST', body: { scope: 'workspace' } },
      { path: `/api/v1/items/${id}/remove`, method: 'POST', body: { reason: 'posted twice' } },
    ]);
  });
  it('a refusal comes back as a sentence', async () => {
    const { removeItem } = await import('./moderation');
    const refuse = async () => Response.json({ error: 'forbidden' }, { status: 403 });
    expect(await removeItem(refuse, 'itm_0123456789abcdef', 'why')).toMatch(/\S/);
  });
});
