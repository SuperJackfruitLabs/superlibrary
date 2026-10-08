import { describe, expect, it } from 'vitest';
import { tree } from '../tree';

describe('tree', () => {
  it('renders objects and arrays as expandable nodes with counts, and leaves as text', () => {
    const el = tree({ name: 'x', tags: ['a', 'b'], n: 3, ok: true, none: null });
    expect(el.querySelector('summary')!.textContent).toBe('{5}');
    expect(el.textContent).toContain('tags');
    expect(el.textContent).toContain('[2]');
    expect(el.querySelector('.leaf.string')!.textContent).toBe('"x"');
    expect(el.querySelector('.leaf.null')!.textContent).toBe('null');
  });
  it('a date is a value, written as the file wrote it, not in the reader’s timezone', () => {
    const el = tree({ when: new Date('1979-05-27T07:32:00Z') });
    expect(el.querySelector('.leaf.date')!.textContent).toBe('1979-05-27T07:32:00.000Z');
  });
  it('never interprets a string as markup', () => {
    expect(tree({ s: '<img src=x onerror=alert(1)>' }).querySelector('img')).toBeNull();
  });
});
