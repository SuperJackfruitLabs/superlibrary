// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { parseMe } from './api';
import { initSession, refreshMe, session } from './session.svelte';

const ME = { principalId: 'prn_0000000000000000de01', org: 'org_0000000000000000de01', workspaceId: 'wsp_0000000000000001', role: 'owner' };

/** No plane (discovery 404) and `/api/v1/me` answering `me`. */
function serve(me: () => Response) {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => (String(url).includes('oauth-protected-resource') ? new Response('', { status: 404 }) : me())));
}

afterEach(() => { vi.unstubAllGlobals(); session.me = null; session.notEnabled = null; });

describe('parseMe', () => {
  it('accepts only the /me shape', () => {
    expect(parseMe(ME)).toEqual(ME);
    expect(parseMe({ ...ME, principalId: 42 })).toBeNull();
    expect(parseMe({ ...ME, role: 'admin' })).toBeNull();
    expect(parseMe(null)).toBeNull();
    expect(parseMe('<!doctype html>')).toBeNull();
  });
});

describe('the session never hangs on an answer it cannot use', () => {
  it('signs in on a real /me', async () => {
    serve(() => Response.json(ME));
    await initSession();
    expect(session.me).toEqual(ME);
  });

  it('an HTML page where /me should be (no Worker route) is an error, not a session', async () => {
    serve(() => new Response('<!doctype html><title>app</title>', { status: 200, headers: { 'content-type': 'text/html' } }));
    await expect(initSession()).rejects.toThrow('The library service answered, but not as expected.');
    expect(session.me).toBeNull();
  });

  it('JSON of the wrong shape is an error, not a session', async () => {
    serve(() => Response.json({ hello: 'world' }));
    await expect(refreshMe()).rejects.toThrow('not as expected');
    expect(session.me).toBeNull();
  });

  it('a server error is an error the page can show and retry', async () => {
    serve(() => new Response('', { status: 503 }));
    await expect(refreshMe()).rejects.toThrow("Couldn't reach Superlibrary. Try again in a moment.");
    await expect(refreshMe()).rejects.not.toThrow(/HTTP|503/);
  });

  it('a 401 is not an error: the guard signs in again', async () => {
    serve(() => new Response('{}', { status: 401 }));
    await expect(refreshMe()).resolves.toBeUndefined();
    expect(session.me).toBeNull();
  });

  it('product_not_enabled is a notice, not an error', async () => {
    serve(() => Response.json({ error: 'product_not_enabled', org: 'org_0000000000000000de01' }, { status: 403 }));
    await refreshMe();
    expect(session.notEnabled).toEqual({ org: 'org_0000000000000000de01' });
  });

  it('any other 403 says why instead of signing in again and again', async () => {
    serve(() => Response.json({ error: 'principal_not_supported' }, { status: 403 }));
    await expect(refreshMe()).rejects.toThrow('This account cannot use Superlibrary.');
    await expect(refreshMe()).rejects.not.toThrow(/principal_not_supported/);
  });

  it('a /me that never answers ends in an error at the deadline, never in Connecting… forever (S1)', async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => String(url).includes('oauth-protected-resource')
        ? Promise.resolve(new Response('', { status: 404 }))
        : new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal!.reason)))));
      const started = initSession().then(() => 'resolved', (e: Error) => e.message);
      await vi.advanceTimersByTimeAsync(20_001);
      expect(await started).toBe("Couldn't reach Superlibrary. Try again in a moment.");
    } finally { vi.useRealTimers(); }
  });

  it('plane discovery that never answers is given up at the deadline too', async () => {
    vi.useFakeTimers();
    try {
      vi.stubGlobal('fetch', vi.fn((url: string, init?: RequestInit) => String(url).includes('oauth-protected-resource')
        ? new Promise<Response>((_, reject) => init?.signal?.addEventListener('abort', () => reject(init.signal!.reason)))
        : Promise.resolve(Response.json(ME))));
      const started = initSession().then(() => 'resolved', (e: Error) => e.message);
      await vi.advanceTimersByTimeAsync(20_001);
      expect(await started).toBe('resolved');
    } finally { vi.useRealTimers(); }
  });
});
