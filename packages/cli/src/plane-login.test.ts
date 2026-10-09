import { expect, it } from 'vitest';
import { SULI_CLIENT_ID, deviceLogin, discoverPlane } from './plane-login.ts';

it('discovers the plane from the API and signs in as the suli device client', async () => {
  const target = await discoverPlane('https://app.test', (async () => Response.json({ resource: 'https://app.test', authorization_servers: ['https://accounts.test'] })) as never);
  expect(target).toEqual({ plane: 'https://accounts.test', audience: 'https://app.test' });
  const bodies: unknown[] = [];
  const fetchFn = (async (url: string, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)));
    if (url.endsWith('/device/code')) return Response.json({ device_code: 'd', user_code: 'ABCD-EFGH', verification_uri_complete: 'https://accounts.test/device?c=1', interval: 1 });
    return Response.json({ device_credential: 'dev_00000000000000000000:' + 'a'.repeat(43) });
  }) as never;
  const lines: string[] = [];
  await deviceLogin(target!, { print: (l) => lines.push(l), sleep: async () => {} }, fetchFn);
  expect(SULI_CLIENT_ID).toBe('suli');
  expect(bodies[0]).toEqual({ client_id: 'suli', scope: 'openid' });
  expect(lines[0]).toContain('ABCD-EFGH');
});

it('no sign-in service is a 404; any other failure of discovery is an error', async () => {
  expect(await discoverPlane('https://app.test', (async () => new Response('', { status: 404 })) as never)).toBeNull();
  await expect(discoverPlane('https://app.test', (async () => new Response('', { status: 503 })) as never)).rejects.toThrow('discovery answered 503');
});
