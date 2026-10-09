import type { View } from '@superlibrary/contract';

/** Spec §7: about 800 tokens with 15% overlap (plan P17: 4 characters a token). */
export const CHUNK = { chars: 3200, overlap: 480 } as const;

/**
 * Where to end a piece that starts at `from`: the best boundary (paragraph, line, sentence, word)
 * past the half-way point of the window, else a hard cut at the window's end.
 */
function cutPoint(text: string, from: number, max: number): number {
  const end = from + max;
  if (end >= text.length) return text.length;
  const window = text.slice(from, end);
  const at = [window.lastIndexOf('\n\n'), window.lastIndexOf('\n'), window.lastIndexOf('. ') + 1 || -1, window.lastIndexOf(' ')]
    .find((i) => i > max * 0.5);
  return at === undefined ? end : from + at;
}

/** Pieces no longer than `max`, without overlap. */
function pieces(text: string, max: number): string[] {
  const out: string[] = [];
  let pos = 0;
  while (pos < text.length) {
    const cut = cutPoint(text, pos, max);
    out.push(text.slice(pos, cut));
    pos = cut;
  }
  return out;
}

/** Sliding window: each chunk ends at a boundary; the next starts ~overlap characters earlier, at a word start. */
export function chunkText(text: string): string[] {
  const t = text.trim();
  if (t === '') return [];
  if (t.length <= CHUNK.chars) return [t];
  const out: string[] = [];
  let pos = 0;
  for (;;) {
    const cut = cutPoint(t, pos, CHUNK.chars);
    const chunk = t.slice(pos, cut).trim();
    if (chunk !== '') out.push(chunk);
    if (cut >= t.length) break;
    let next = cut - CHUNK.overlap;
    const ws = t.slice(next, cut).search(/\s/);
    if (ws >= 0) next += ws + 1;
    pos = Math.max(next, pos + 1); // cut - pos > chars/2 > overlap, so this always advances
  }
  return out;
}

const DECL = /^(?:export\s+)?(?:default\s+)?(?:async\s+)?(?:function|class|interface|type|const|let|enum|def|func|fn|pub\s+fn|impl|struct|module|public|private|protected)\b/;

/** Spec §7: code keeps its function boundaries where possible. */
export function chunkCode(text: string): string[] {
  const lines = text.replace(/\s+$/, '').split('\n');
  const blocks: string[] = [];
  let cur: string[] = [];
  for (const line of lines) {
    if (DECL.test(line) && cur.some((l) => l.trim() !== '')) { blocks.push(cur.join('\n')); cur = []; }
    cur.push(line);
  }
  if (cur.length) blocks.push(cur.join('\n'));
  const out: string[] = [];
  let acc = '';
  for (const b of blocks) {
    if (b.length > CHUNK.chars) {
      if (acc.trim()) out.push(acc.trim());
      acc = '';
      out.push(...pieces(b, CHUNK.chars).map((p) => p.trim()).filter(Boolean));
      continue;
    }
    if (acc.length + b.length + 1 > CHUNK.chars) { if (acc.trim()) out.push(acc.trim()); acc = ''; }
    acc = acc ? `${acc}\n${b}` : b;
  }
  if (acc.trim()) out.push(acc.trim());
  return out;
}

export function chunkFor(view: View | 'work-record', text: string): string[] {
  return view === 'code' ? chunkCode(text) : chunkText(text);
}
