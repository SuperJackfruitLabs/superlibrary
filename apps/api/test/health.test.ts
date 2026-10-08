import { SELF } from 'cloudflare:test';
import { expect, it } from 'vitest';

it('answers /api/health', async () => {
  const res = await SELF.fetch('https://api.test/api/health');
  expect(res.status).toBe(200);
  expect(await res.json()).toEqual({ ok: true, service: 'superlibrary-api' });
});

it('answers an unknown /api path with a JSON 404', async () => {
  const res = await SELF.fetch('https://api.test/api/v1/nothing');
  expect(res.status).toBe(404);
  expect(await res.json()).toEqual({ error: 'not_found' });
});
