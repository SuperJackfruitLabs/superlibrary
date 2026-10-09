// apps/api/src/indexing/extract.ts
import type { View } from '@superlibrary/contract';
import type { Env } from '../env';
import { isExpired, type ItemRow } from '../items/visibility';
import { blobKey } from '../storage/blobs';
import { decodeText, sniff } from '../guard/sniff';

const TEXT_VIEWS = new Set<View>(['markdown', 'code', 'text', 'json', 'yaml', 'toml', 'csv', 'tsv', 'mermaid', 'graphviz', 'html', 'ipynb', 'svg']);
/** Per item, so one huge folder cannot dominate the index or a Worker's memory. */
const MAX_TEXT = 400_000;

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
    return w && w.text.trim() !== '' ? { text: w.text, view: 'work-record', version: 0 } : null;
  }
  const v = await env.DB.prepare(`SELECT version, view FROM versions WHERE item_id = ? AND revoked_at IS NULL ORDER BY version DESC LIMIT 1`).bind(item.id).first<{ version: number; view: View }>();
  if (!v) return null;
  const files = (await env.DB.prepare(`SELECT path, sha256, view, bytes FROM version_files WHERE item_id = ? AND version = ? ORDER BY path`).bind(item.id, v.version).all<{ path: string; sha256: string; view: View; bytes: number }>()).results;
  const parts: string[] = [];
  let size = 0;
  for (const f of files) {
    if (!TEXT_VIEWS.has(f.view) || size >= MAX_TEXT) continue;
    const obj = await env.BLOBS.get(blobKey(f.sha256));
    if (!obj) continue;
    // version_files does not record the encoding, so sniff it from the bytes (phase 1's decodeText takes it).
    const bytes = new Uint8Array(await obj.arrayBuffer());
    const encoding = sniff(bytes, f.path).encoding;
    if (!encoding) continue;
    let decoded = '';
    try { decoded = decodeText(bytes, encoding); } catch { continue; }
    const t = textOf(f.view, decoded);
    const piece = files.length > 1 ? `${f.path}\n${t}` : t;
    parts.push(piece.slice(0, MAX_TEXT - size));
    size += piece.length;
  }
  const head = `${item.title}\n${files.map((f) => f.path).join('\n')}`;
  const body = parts.join('\n\n').trim();
  return { text: body ? `${item.title}\n\n${body}` : head, view: files.length === 1 ? v.view : 'text', version: v.version };
}
