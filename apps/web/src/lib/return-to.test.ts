import { expect, it } from 'vitest';
import { safeReturnTo } from './return-to';

it('only ever returns a path on this origin', () => {
  expect(safeReturnTo('/a/itm_0000000000000001?x=1')).toBe('/a/itm_0000000000000001?x=1');
  for (const bad of ['//evil.test', '/\\evil.test', 'https://evil.test', 'javascript:alert(1)', '', null, undefined, '/\u0000x']) expect(safeReturnTo(bad)).toBe('/');
});
