/** suli search, collect and scope (spec §11). A client: it adds no authority and renders the server's refusals. */
import { COLLECTION_ID, OUTCOMES, type CollectionDetail, type CollectionSummary, type SearchResult } from '@superlibrary/contract';
import { client, itemId, refused, type Client } from './artifacts.ts';

/** Server text is written by agents and people: no control character (ESC, CSI, OSC, newline) reaches the terminal. */
export function printable(s: unknown): string {
  return String(s ?? '').replace(/[\u0000-\u001f\u007f-\u009f]+/g, ' ').replace(/\s+/g, ' ').trim();
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
/** The start of that day, UTC (as `suli upload --expires`); `plus` days later for an inclusive end. */
function dayStart(d: string, plus = 0): string {
  if (!DAY.test(d)) throw new Error(`a date is YYYY-MM-DD: ${d}`);
  const t = new Date(`${d}T00:00:00.000Z`);
  if (Number.isNaN(t.getTime())) throw new Error(`a date is YYYY-MM-DD: ${d}`);
  t.setUTCDate(t.getUTCDate() + plus);
  return t.toISOString();
}

export interface SearchOptions { kind: string | null; outcome: string | null; board: string | null; agent: string | null; station: string | null; since: string | null; until: string | null; limit: string | null }

export function searchBody(words: string, o: SearchOptions): Record<string, unknown> {
  if (!words.trim()) throw new Error('say what to look for: suli search <words>');
  const body: Record<string, unknown> = { query: words.trim() };
  if (o.kind) {
    if (o.kind !== 'artifact' && o.kind !== 'work-record') throw new Error('--kind is artifact or work-record');
    body.kinds = [o.kind];
  }
  if (o.outcome) {
    const list = o.outcome.split(',').map((s) => s.trim()).filter(Boolean);
    const bad = list.find((x) => !(OUTCOMES as readonly string[]).includes(x));
    if (bad) throw new Error(`unknown outcome: ${bad}. One of ${OUTCOMES.join(', ')}`);
    body.outcomes = list;
  }
  if (o.board) body.board = o.board;
  if (o.agent) body.agent = o.agent;
  if (o.station) body.station = o.station;
  if (o.since) body.since = dayStart(o.since);
  if (o.until) body.until = dayStart(o.until, 1);
  if (o.limit) {
    const n = Number(o.limit);
    if (!Number.isInteger(n) || n < 1 || n > 25) throw new Error('--limit is 1 to 25');
    body.limit = n;
  }
  return body;
}

export function resultLines(results: SearchResult[]): string[] {
  if (results.length === 0) return ['Nothing matches.'];
  return results.flatMap((r) => [
    `${printable(r.itemId)}  [${printable(r.outcome)}]  ${printable(r.title)}`,
    ...(r.snippet ? [`    ${printable(r.snippet).slice(0, 200)}`] : []),
    ...(r.supersededBy ? [`    superseded by ${printable(r.supersededBy)}`] : []),
  ]);
}

export async function searchWith(c: Client, words: string, o: SearchOptions): Promise<SearchResult[]> {
  const res = await c('POST', '/api/v1/search', searchBody(words, o));
  if (!res.ok) return refused(res, 'the search');
  return ((await res.json()) as { results: SearchResult[] }).results;
}

export async function search(words: string, o: SearchOptions & { json: boolean }): Promise<void> {
  const results = await searchWith(client(), words, o);
  process.stdout.write(o.json ? JSON.stringify({ results }) + '\n' : resultLines(results).join('\n') + '\n');
}

export async function collectListWith(c: Client): Promise<CollectionSummary[]> {
  const res = await c('GET', '/api/v1/collections');
  if (!res.ok) return refused(res, 'the collections');
  return ((await res.json()) as { collections: CollectionSummary[] }).collections;
}

/** A collection named by its id, or by its exact name in any case. */
export async function resolveCollection(c: Client, ref: string | undefined): Promise<CollectionSummary> {
  if (!ref) throw new Error('name a collection: its id (col_…) or its name');
  const all = await collectListWith(c);
  const found = COLLECTION_ID.test(ref) ? all.find((x) => x.id === ref) : all.find((x) => x.name.toLowerCase() === ref.toLowerCase());
  if (!found) throw new Error(`no collection called ${ref}. Run suli collect list.`);
  return found;
}

export async function collectCreateWith(c: Client, name: string, description: string | null): Promise<CollectionSummary> {
  if (!name.trim()) throw new Error('name the collection: suli collect create <name>');
  const res = await c('POST', '/api/v1/collections', { name: name.trim(), description: description ?? '' });
  if (!res.ok) return refused(res, 'the collection');
  return (await res.json()) as CollectionSummary;
}

export async function collectShowWith(c: Client, ref: string | undefined): Promise<CollectionDetail> {
  const col = await resolveCollection(c, ref);
  const res = await c('GET', `/api/v1/collections/${col.id}`);
  if (!res.ok) return refused(res, 'the collection');
  return (await res.json()) as CollectionDetail;
}

export async function collectAddWith(c: Client, ref: string | undefined, rawItem: string | undefined, note: string | null): Promise<void> {
  const id = itemId(rawItem, 'collect add');
  const col = await resolveCollection(c, ref);
  const res = await c('POST', `/api/v1/collections/${col.id}/items`, note ? { itemId: id, note } : { itemId: id });
  if (res.status === 404) throw new Error(`${id} does not exist or you cannot see it.`);
  if (!res.ok) return refused(res, id);
}

export async function collectRemoveWith(c: Client, ref: string | undefined, rawItem: string | undefined): Promise<void> {
  const id = itemId(rawItem, 'collect remove');
  const col = await resolveCollection(c, ref);
  const res = await c('DELETE', `/api/v1/collections/${col.id}/items/${id}`);
  if (res.status === 404) throw new Error(`${id} does not exist or you cannot see it.`);
  if (!res.ok) return refused(res, id);
}

/** Spec §4: widening to the workspace is a person's act, recorded. Narrowing does not exist. */
export async function scopeWith(c: Client, rawItem: string | undefined, scope: string | undefined): Promise<unknown> {
  if (scope !== 'workspace') throw new Error('only workspace: suli scope <item> workspace (an item is never narrowed)');
  const id = itemId(rawItem, 'scope');
  const res = await c('POST', `/api/v1/items/${id}/scope`, { scope: 'workspace' });
  if (!res.ok) return refused(res, id);
  return res.json();
}

export const collectionLines = (list: CollectionSummary[]): string =>
  list.length ? list.map((x) => `${printable(x.id)}  ${printable(x.name)}  (${x.itemCount} item${x.itemCount === 1 ? '' : 's'})`).join('\n') : 'No collections yet.';
export const createdLine = (c: CollectionSummary): string => `Created ${printable(c.name)} (${printable(c.id)}).`;
export const detailLines = (d: CollectionDetail): string =>
  [`${printable(d.name)}  (${printable(d.id)})`, ...(d.description ? [printable(d.description)] : []), ...d.entries.map((e) => `  ${printable(e.item.id)}  [${printable(e.item.outcome)}]  ${printable(e.item.title)}`)].join('\n');

const out = (json: boolean, value: unknown, text: string): void => { process.stdout.write(json ? JSON.stringify(value) + '\n' : text + '\n'); };

export async function collect(sub: string | undefined, args: string[], o: { description: string | null; note: string | null; json: boolean }): Promise<void> {
  const c = client();
  if (sub === 'list') {
    const list = await collectListWith(c);
    return out(o.json, { collections: list }, collectionLines(list));
  }
  if (sub === 'create') {
    const col = await collectCreateWith(c, args.join(' '), o.description);
    return out(o.json, col, createdLine(col));
  }
  if (sub === 'show') {
    const d = await collectShowWith(c, args[0]);
    return out(o.json, d, detailLines(d));
  }
  if (sub === 'add') { await collectAddWith(c, args[0], args[1], o.note); return out(o.json, { added: true }, 'Added.'); }
  if (sub === 'remove') { await collectRemoveWith(c, args[0], args[1]); return out(o.json, { removed: true }, 'Removed.'); }
  throw new Error(`unknown command: collect ${sub ?? ''}. Run suli help collect.`);
}

export async function scope(rawItem: string | undefined, to: string | undefined, o: { json: boolean }): Promise<void> {
  const r = await scopeWith(client(), rawItem, to);
  out(o.json, r, 'Everyone in the workspace can now see it.');
}
