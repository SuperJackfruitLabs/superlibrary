// apps/api/src/indexing/extract.ts
import type { View } from '@superlibrary/contract';
import type { Env } from '../env';
import { isExpired, type ItemRow } from '../items/visibility';
import { blobKey } from '../storage/blobs';

export const TEXT_VIEWS = new Set<View>(['markdown', 'code', 'text', 'json', 'yaml', 'toml', 'csv', 'tsv', 'mermaid', 'graphviz', 'html', 'ipynb', 'svg']);
/** Per item, so one huge folder cannot dominate the index or a Worker's memory. */
export const MAX_TEXT = 400_000;

/** Decodes a bounded prefix. A multi-byte character cut at the end becomes U+FFFD, never an error. */
function decodePrefix(b: Uint8Array): string | null {
  const head = b.subarray(0, 8192);
  let encoding: 'utf-8' | 'utf-16le' | 'utf-16be' = 'utf-8';
  let skip = 0;
  if (head[0] === 0xff && head[1] === 0xfe) { encoding = 'utf-16le'; skip = 2; }
  else if (head[0] === 0xfe && head[1] === 0xff) { encoding = 'utf-16be'; skip = 2; }
  else if (head.includes(0)) return null;
  else if (head[0] === 0xef && head[1] === 0xbb && head[2] === 0xbf) skip = 3;
  return new TextDecoder(encoding, { fatal: false, ignoreBOM: true }).decode(b.subarray(skip));
}

function textOf(view: View, raw: string): string {
  if (view === 'html') return raw.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
  if (view === 'svg') return [...raw.matchAll(/<(title|desc|text)[^>]*>([\s\S]*?)<\/\1>/gi)].map((m) => m[2]).join('\n');
  if (view === 'ipynb') {
    try {
      const nb = JSON.parse(raw) as { cells?: Array<{ source?: string | string[] }> };
      return (nb.cells ?? []).map((c) => (Array.isArray(c.source) ? c.source.join('') : c.source ?? '')).join('\n\n');
    } catch { return ''; }
  }
  return raw;
}

/** Spec §7: what an item says, for chunking. Images and binaries by title, path and caption only. */
export async function extractText(env: Env, item: ItemRow): Promise<{ text: string; view: View | 'work-record'; version: number } | null> {
  if (item.revoked_at || isExpired(item)) return null;
  if (item.kind === 'work-record') {
    const w = await env.DB.prepare(`SELECT text FROM work_records WHERE item_id = ?`).bind(item.id).first<{ text: string }>();
    return w && w.text.trim() !== '' ? { text: w.text.slice(0, MAX_TEXT), view: 'work-record', version: 0 } : null;
  }
  const v = await env.DB.prepare(`SELECT version, view FROM versions WHERE item_id = ? AND revoked_at IS NULL ORDER BY version DESC LIMIT 1`).bind(item.id).first<{ version: number; view: View }>();
  if (!v) return null;
  const files = (await env.DB.prepare(`SELECT path, sha256, view, bytes FROM version_files WHERE item_id = ? AND version = ? ORDER BY path`).bind(item.id, v.version).all<{ path: string; sha256: string; view: View; bytes: number }>()).results;
  const parts: string[] = [];
  let size = 0;
  for (const f of files) {
    if (!TEXT_VIEWS.has(f.view) || size >= MAX_TEXT) continue;
    // Only MAX_TEXT characters are used, so read no more than MAX_TEXT * 4 bytes (a character is at
    // most 4 bytes in UTF-8): a 25 MB blob must not be held, and decoded, several times over.
    const budget = (MAX_TEXT - size) * 4;
    const obj = await env.BLOBS.get(blobKey(f.sha256), f.bytes > budget ? { range: { offset: 0, length: budget } } : undefined);
    if (!obj) continue;
    const bytes = new Uint8Array(await obj.arrayBuffer());
    const decoded = decodePrefix(bytes);
    if (decoded === null) continue;
    const t = textOf(f.view, decoded);
    const piece = files.length > 1 ? `${f.path}\n${t}` : t;
    parts.push(piece.slice(0, MAX_TEXT - size));
    size += Math.min(piece.length, MAX_TEXT - size);
  }
  const head = `${item.title}\n${files.map((f) => f.path).join('\n')}`;
  const body = parts.join('\n\n').trim();
  return { text: body ? `${item.title}\n\n${body}` : head, view: files.length === 1 ? v.view : 'text', version: v.version };
}
