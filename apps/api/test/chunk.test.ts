// apps/api/test/chunk.test.ts
import { describe, expect, it } from 'vitest';
import { CHUNK, chunkCode, chunkFor, chunkText } from '../src/indexing/chunk';

const para = (n: number, w = 'word') => Array.from({ length: n }, (_, i) => `${w}${i}`).join(' ');

describe('chunkText', () => {
  it('keeps a short text whole', () => expect(chunkText('one short note')).toEqual(['one short note']));
  it('cuts long prose into ≤3,200-character chunks overlapping by about 15%', () => {
    const text = Array.from({ length: 40 }, (_, i) => `Paragraph ${i}. ${para(60)}`).join('\n\n');
    const chunks = chunkText(text);
    expect(chunks.length).toBeGreaterThan(3);
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(CHUNK.chars);
    for (let i = 1; i < chunks.length; i++) {
      const tail = chunks[i - 1]!.slice(-200);
      expect(chunks[i]!.includes(tail.slice(tail.indexOf(' ') + 1, tail.indexOf(' ') + 60))).toBe(true);
    }
  });
  it('overlaps consecutive chunks by about 480 characters (unique words, so a shared tail is real)', () => {
    const text = Array.from({ length: 1500 }, (_, i) => `w${i}`).join(' ');
    const chunks = chunkText(text);
    for (let i = 1; i < chunks.length; i++) {
      const prev = chunks[i - 1]!;
      const head = chunks[i]!.split(' ').slice(0, 5).join(' ');
      const at = prev.lastIndexOf(head);
      expect(at).toBeGreaterThanOrEqual(0);
      const shared = prev.length - at;
      expect(shared).toBeGreaterThan(CHUNK.overlap - 30);
      expect(shared).toBeLessThanOrEqual(CHUNK.overlap);
    }
  });
  it('prefers paragraph boundaries', () => {
    const text = `${'a '.repeat(1400)}\n\n${'b '.repeat(1400)}`;
    expect(chunkText(text)[0]!.trim().endsWith('a')).toBe(true);
  });
  it('cuts a single huge line hard instead of looping', () => {
    const chunks = chunkText('x'.repeat(10_000));
    expect(chunks.every((c) => c.length <= CHUNK.chars)).toBe(true);
    expect(chunks.join('').replace(/x/g, '').length).toBe(0);
  });
  it('returns nothing for blank text', () => expect(chunkText('  \n ')).toEqual([]));
});

describe('chunkCode', () => {
  it('starts chunks at top-level declarations where they fit', () => {
    const fn = (n: number) => `export function f${n}() {\n${'  const x = 1;\n'.repeat(60)}}\n`;
    const src = Array.from({ length: 6 }, (_, i) => fn(i)).join('\n');
    const chunks = chunkCode(src);
    expect(chunks.length).toBeGreaterThan(1);
    for (const c of chunks) expect(c.trimStart().startsWith('export function f')).toBe(true);
  });
  it('splits a function longer than a chunk by lines', () => {
    const src = `def big():\n${'    x = 1\n'.repeat(1000)}`;
    expect(chunkCode(src).every((c) => c.length <= CHUNK.chars)).toBe(true);
  });
});

describe('chunkFor', () => {
  it('uses code chunking for code and prose chunking for the rest', () => {
    expect(chunkFor('code', 'def a():\n  pass\n')).toEqual(['def a():\n  pass']);
    expect(chunkFor('work-record', 'Title\n\nBody')).toEqual(['Title\n\nBody']);
  });
});
