import { describe, expect, it } from 'vitest';
import { upload } from './helpers/upload';
import { HUMAN, devHeaders } from './helpers/org-plane';
import { call, workspaceOf } from './helpers/library';

const HOST = { ...devHeaders(HUMAN), Origin: 'https://host.test' };
const EVIL = { ...devHeaders(HUMAN), Origin: 'https://evil.test' };
const acao = (r: Response) => r.headers.get('Access-Control-Allow-Origin');

describe('CORS for embedding hosts (spec §9 Embedding, Tasks 22-23)', () => {
  it('the item, me, scope and related answer an embedding host, refusals included', async () => {
    await workspaceOf();
    const a = (await upload([{ path: 'c.md', body: '# c' }], { title: 'C' })).body.itemId as string;
    expect(acao(await call(`/api/v1/items/${a}`, { headers: HOST }))).toBe('https://host.test');
    expect(acao(await call('/api/v1/me', { headers: HOST }))).toBe('https://host.test');
    expect(acao(await call('/api/v1/related', { method: 'POST', body: { itemId: a }, headers: HOST }))).toBe('https://host.test');
    const refused = await call('/api/v1/items/itm_00000000000000ff', { headers: HOST });
    expect(refused.status).toBe(404);
    expect(acao(refused)).toBe('https://host.test');
    expect(acao(await call(`/api/v1/items/${a}/scope`, { method: 'POST', body: { scope: 'workspace' }, headers: HOST }))).toBe('https://host.test');
  });
  it('another origin gets no CORS, and the library routes stay same-origin', async () => {
    const a = (await upload([{ path: 'd.md', body: '# d' }], { title: 'D' })).body.itemId as string;
    expect(acao(await call(`/api/v1/items/${a}`, { headers: EVIL }))).toBeNull();
    // A refusal on a route a host does not use carries no CORS either, and neither does its preflight.
    expect(acao(await call(`/api/v1/items/${a}/revoke`, { method: 'POST', body: {}, headers: { Origin: 'https://host.test' } }))).toBeNull();
    const pre = await call(`/api/v1/items/${a}/revoke`, { method: 'OPTIONS', headers: { Origin: 'https://host.test', 'Access-Control-Request-Method': 'POST' } });
    expect(acao(pre)).toBeNull();
    expect(acao(await call('/api/v1/browse', { method: 'POST', body: {}, headers: HOST }))).toBeNull();
  });
  it('preflights name the methods', async () => {
    const pre = (path: string) => call(path, { method: 'OPTIONS', headers: { Origin: 'https://host.test', 'Access-Control-Request-Method': 'POST' } });
    const item = await pre('/api/v1/items/itm_0123456789abcdef');
    expect(item.status).toBe(204);
    expect(item.headers.get('Access-Control-Allow-Methods')).toBe('GET');
    expect(item.headers.get('Access-Control-Allow-Origin')).toBe('https://host.test');
    expect(item.headers.get('Access-Control-Allow-Headers')).toContain('authorization');
    expect(item.headers.get('Access-Control-Allow-Credentials')).toBeNull();
    const evil = await call('/api/v1/items/itm_0123456789abcdef', { method: 'OPTIONS', headers: { Origin: 'https://evil.test', 'Access-Control-Request-Method': 'GET' } });
    expect(evil.headers.get('Access-Control-Allow-Origin')).toBeNull();
    expect((await pre('/api/v1/items/itm_0123456789abcdef/scope')).headers.get('Access-Control-Allow-Methods')).toBe('POST');
    expect((await pre('/api/v1/related')).headers.get('Access-Control-Allow-Methods')).toBe('POST');
    expect((await pre('/api/v1/me')).headers.get('Access-Control-Allow-Methods')).toBe('GET');
  });
});
