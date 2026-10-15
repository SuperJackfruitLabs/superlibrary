// apps/web/src/lib/library.ts
/** The library page's state (the address), its requests, and its rows. */
import { BOARD_ID, OUTCOMES, PRN_ID, type BrowsePage, type Facets, type ItemSource, type ItemSummary, type Outcome, type SearchResult } from '@superlibrary/contract';
import { visibilityWords } from '@superlibrary/embed';
import { explain, ITEM_KIND_WORD, UNREACHABLE } from './item';
import { failCopy, failKindOf, readDeadline, type FailKind } from './loading';
import { OUTCOME_WORDS } from './kit/outcome';
import { makerOf, type Maker } from './vibe/faces';

type Api = (path: string, init?: RequestInit) => Promise<Response>;
export type Kind = 'artifact' | 'work-record';
export type Period = 'any' | 'week' | 'month' | '30d' | 'custom';
export interface Filters { q: string; kind: Kind | ''; outcomes: Outcome[]; board: string; agent: string; station: string; period: Period; from: string; to: string }
export const EMPTY_FILTERS: Filters = { q: '', kind: '', outcomes: [], board: '', agent: '', station: '', period: 'any', from: '', to: '' };

const PERIODS: readonly Period[] = ['any', 'week', 'month', '30d', 'custom'];
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** The address is the view (spec §11 "views by outcome" can be kept and shared). Unknown values are dropped. */
export function readFilters(params: URLSearchParams, defaults: Partial<Pick<Filters, 'period'>> = {}): Filters {
  const kind = params.get('kind');
  const period = params.get('period');
  const board = params.get('board') ?? '';
  const agent = params.get('agent') ?? '';
  const station = (params.get('station') ?? '').trim();
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  return {
    q: (params.get('q') ?? '').slice(0, 1000),
    kind: kind === 'artifact' || kind === 'work-record' ? kind : '',
    outcomes: [...new Set(params.getAll('outcome').filter((o): o is Outcome => (OUTCOMES as readonly string[]).includes(o)))],
    board: BOARD_ID.test(board) ? board : '',
    agent: PRN_ID.test(agent) ? agent : '',
    station: station.length <= 100 ? station : '',
    period: period && (PERIODS as readonly string[]).includes(period) ? (period as Period) : (defaults.period ?? 'any'),
    from: DAY.test(from) ? from : '',
    to: DAY.test(to) ? to : '',
  };
}

export function writeFilters(f: Filters, defaults: Partial<Pick<Filters, 'period'>> = {}): string {
  const p = new URLSearchParams();
  if (f.q.trim()) p.set('q', f.q.trim());
  if (f.kind) p.set('kind', f.kind);
  for (const o of f.outcomes) p.append('outcome', o);
  if (f.board) p.set('board', f.board);
  if (f.agent) p.set('agent', f.agent);
  if (f.station) p.set('station', f.station);
  if (f.period !== (defaults.period ?? 'any')) p.set('period', f.period);
  if (f.period === 'custom') { if (f.from) p.set('from', f.from); if (f.to) p.set('to', f.to); }
  return p.toString();
}

export const activeFilters = (f: Filters) => [f.kind, f.board, f.agent, f.station].filter(Boolean).length + f.outcomes.length + (f.period === 'custom' ? (f.from || f.to ? 1 : 0) : f.period !== 'any' ? 1 : 0);

const localDay = (s: string, plusDays = 0) => {
  const [y, m, d] = s.split('-').map(Number) as [number, number, number];
  return new Date(y, m - 1, d + plusDays);
};

/** A period's bounds as instants, computed in the person's own time zone (Review Focus). */
export function periodRange(f: Pick<Filters, 'period' | 'from' | 'to'>, now: Date = new Date()): { since?: string; until?: string } {
  switch (f.period) {
    case 'week': {
      const d = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7));   // back to Monday
      return { since: d.toISOString() };
    }
    case 'month': return { since: new Date(now.getFullYear(), now.getMonth(), 1).toISOString() };
    case '30d': return { since: new Date(now.getTime() - 30 * 86_400_000).toISOString() };
    case 'custom': {
      const out: { since?: string; until?: string } = {};
      if (DAY.test(f.from)) out.since = localDay(f.from).toISOString();
      if (DAY.test(f.to)) out.until = localDay(f.to, 1).toISOString();   // through the end of that day
      return out;
    }
    default: return {};
  }
}
export function rangeProblem(f: Filters): string | null {
  if (f.period !== 'custom') return null;
  const r = periodRange(f);
  return r.since && r.until && r.since >= r.until ? 'Choose an end date on or after the start date.' : null;
}

function filterBody(f: Filters, now: Date) {
  return {
    ...(f.kind ? { kinds: [f.kind] } : {}), ...(f.outcomes.length ? { outcomes: f.outcomes } : {}), ...(f.board ? { board: f.board } : {}),
    ...(f.agent ? { agent: f.agent } : {}), ...(f.station ? { station: f.station } : {}), ...periodRange(f, now),
  };
}
export const searchBody = (f: Filters, now = new Date()) => ({ query: f.q.trim(), ...filterBody(f, now), limit: 25 });
export const browseBody = (f: Filters, cursor: string | null, now = new Date(), limit = 50) => ({ ...filterBody(f, now), limit, ...(cursor ? { cursor } : {}) });

/** One row of any list: a search hit or a browsed item, said the same way. */
export interface Row { id: string; title: string; kind: Kind; outcome: Outcome; line: string; snippet: string | null; supersededBy: string | null; visibility: string | null; kindWord: string; board: string | null; station: string | null; path: string | null; maker: Maker | null }
function partsOf(kind: Kind, s: ItemSource | undefined, boards: Map<string, string>) {
  return { kindWord: ITEM_KIND_WORD[kind], board: s?.board ? (boards.get(s.board) ?? s.board) : null, station: s?.stationName || s?.station || null, path: s?.path ?? null };
}
const lineOf = (p: ReturnType<typeof partsOf>) => [p.kindWord, p.board, p.station, p.path].filter(Boolean).join(' · ');
const WORKSPACE_WORDS = 'Everyone in the workspace';
export const rowOfResult = (r: SearchResult, boards: Map<string, string>): Row => {
  const parts = partsOf(r.kind, r.provenance, boards);
  return {
    id: r.itemId, title: r.title, kind: r.kind, outcome: r.outcome, line: lineOf(parts), snippet: r.snippet || null, supersededBy: r.supersededBy,
    visibility: r.scope === 'workspace' ? WORKSPACE_WORDS : null, ...parts, maker: makerOf(r.provenance),
  };
};
export const rowOfItem = (i: ItemSummary, boards: Map<string, string>): Row => {
  const src = i.source ?? (i.scope.startsWith('board:') ? { board: i.scope.slice(6) } : undefined);
  const parts = partsOf(i.kind, src, boards);
  return {
    id: i.id, title: i.title, kind: i.kind, outcome: i.outcome, line: lineOf(parts),
    snippet: i.caption ?? null, supersededBy: i.supersededBy ?? null,
    visibility: visibilityWords({ scope: i.scope, canWiden: false, boardVisible: i.audience === 'board' }),
    ...parts, maker: makerOf(i.source, i.createdBy),
  };
};
export const boardNames = (f: Facets | null) => new Map((f?.boards ?? []).map((b) => [b.id, b.name]));

export type Loaded<T> = { ok: true; value: T } | { ok: false; kind: FailKind; message: string };
/**
 * GET, or POST with a JSON body. A failure comes back as a sentence: 404/403 "not there for you",
 * 5xx/network/timeout "could not load", another refusal in words (`explain`). Never a raw code.
 */
export async function loadJson<T>(api: Api, path: string, body?: unknown, opts: { read?: boolean } = {}): Promise<Loaded<T>> {
  try {
    // A POST that only reads (browse, search) gets the reads' 20 s deadline too; a write is never aborted.
    const signal = body !== undefined && opts.read ? { signal: readDeadline() } : {};
    const res = await api(path, body === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), ...signal });
    if (!res.ok) {
      const b = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
      const kind = failKindOf(res.status);
      const message = res.status === 404 || res.status === 403 || res.status >= 500 ? failCopy(kind) : explain(b.error ?? '', b.detail);
      return { ok: false, kind, message };
    }
    return { ok: true, value: (await res.json()) as T };
  } catch {
    return { ok: false, kind: 'failed', message: UNREACHABLE };
  }
}
export const searchLibrary = (api: Api, f: Filters) => loadJson<{ results: SearchResult[] }>(api, '/api/v1/search', searchBody(f), { read: true });
export const browseLibrary = (api: Api, f: Filters, cursor: string | null = null) => loadJson<BrowsePage>(api, '/api/v1/browse', browseBody(f, cursor), { read: true });
export const loadFacets = (api: Api) => loadJson<Facets>(api, '/api/v1/facets');

const PERIOD_WORDS: Record<Period, string> = { any: '', week: ' this week', month: ' this month', '30d': ' in the last 30 days', custom: ' between those dates' };
/** "Everything rejected on Marketing & Community this month" (spec §11's own example). */
export function viewTitle(outcome: Outcome | null, board: string | null, period: Period): string {
  const what = outcome ? `Everything ${OUTCOME_WORDS[outcome].toLowerCase()}` : 'Everything';
  return `${what}${board ? ` on ${board}` : ''}${PERIOD_WORDS[period]}`;
}
