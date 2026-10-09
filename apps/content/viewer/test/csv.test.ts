import { describe, expect, it } from 'vitest';
import { parseDelimited, sortRows } from '../csv';

describe('parseDelimited (RFC 4180)', () => {
  it('handles quotes, escaped quotes, separators and newlines inside quotes, and CRLF', () => {
    expect(parseDelimited('a,b\r\n"x, y","he said ""hi"""\n"multi\nline",2\n', ',')).toEqual([['a', 'b'], ['x, y', 'he said "hi"'], ['multi\nline', '2']]);
  });
  it('splits TSV on tabs', () => expect(parseDelimited('a\tb\n1\t2', '\t')).toEqual([['a', 'b'], ['1', '2']]));
});

describe('sortRows', () => {
  it('sorts numbers as numbers and text as text, both directions', () => {
    const rows = [['10', 'b'], ['9', 'a'], ['100', 'c']];
    expect(sortRows(rows, 0, 1).map((r) => r[0])).toEqual(['9', '10', '100']);
    expect(sortRows(rows, 1, -1).map((r) => r[1])).toEqual(['c', 'b', 'a']);
  });
});
