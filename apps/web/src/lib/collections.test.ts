// apps/web/src/lib/collections.test.ts
import { describe, expect, it } from 'vitest';
import { addToCollection, askDeleteCollection, createCollection, removeFromCollection } from './collections';

function fakeApi(answer: (path: string, init: RequestInit) => Response) {
  const calls: Array<{ path: string; method: string; body: unknown }> = [];
  const api = async (path: string, init: RequestInit = {}) => {
    calls.push({ path, method: init.method ?? 'GET', body: init.body ? JSON.parse(String(init.body)) : undefined });
    return answer(path, init);
  };
  return { api, calls };
}

describe('collections from the app', () => {
  it('adds and removes through the collection routes', async () => {
    const { api, calls } = fakeApi(() => new Response(null, { status: 204 }));
    expect(await addToCollection(api, 'col_0123456789abcdef', 'itm_0123456789abcdef')).toBeNull();
    expect(await removeFromCollection(api, 'col_0123456789abcdef', 'itm_0123456789abcdef')).toBeNull();
    expect(calls).toEqual([
      { path: '/api/v1/collections/col_0123456789abcdef/items', method: 'POST', body: { itemId: 'itm_0123456789abcdef' } },
      { path: '/api/v1/collections/col_0123456789abcdef/items/itm_0123456789abcdef', method: 'DELETE', body: undefined },
    ]);
  });
  it('a taken name reads as a sentence', async () => {
    const { api } = fakeApi(() => Response.json({ error: 'name_taken' }, { status: 409 }));
    expect(await createCollection(api, 'Week 41', '')).toEqual({ ok: false, message: 'A collection with that name already exists.' });
  });
  it('deleting says what happens to the items', () => {
    expect(askDeleteCollection('Week 41')).toMatchObject({ title: 'Delete the collection “Week 41”?', action: 'Delete collection' });
    expect(askDeleteCollection('Week 41').message).toContain('its items stay in the library');
  });
});
