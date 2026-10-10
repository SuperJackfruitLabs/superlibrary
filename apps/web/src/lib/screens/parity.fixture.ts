/** The inventory (spec §6) as data, and an API that answers with all of it. Used only by tests. */
import { formatBytes } from '@superlibrary/embed';
import { day, when } from '$lib/item';

/**
 * One thing a person can see. Every form is checked strictly (parity.svelte.test.ts):
 * - a string: the phrase, as whole words, in the page's text ("Run" is not found in "Running");
 * - `css`: an element that is there and not hidden;
 * - `heading`: a heading with exactly this name (and level, when given);
 * - `role` + `name`: a control with exactly this accessible name (a select also with these options);
 * - `label` + `value`: a label (a <dt>, <th> or label span) and, in the element right after it, its value;
 * - `in` + `together`: one element matching `in` that shows every phrase (a row, an entry); only the
 *   innermost matches count, so a wrapper around several rows is not one row;
 * - `plain`: the phrase as text that is not a link (a revoked version's name).
 * Dates are built with the app's own `when()`/`day()`, so they are exact in any time zone or locale.
 */
export type Need =
  | string
  | { css: string; what: string }
  | { heading: string; level?: 1 | 2 | 3 | 4 | 5 | 6 }
  | { role: 'button' | 'link' | 'combobox' | 'searchbox' | 'checkbox' | 'group' | 'field'; name: string; options?: readonly string[] }
  | { label: string; value: string }
  | { in: string; together: readonly string[] }
  | { plain: string };

const AGENT = 'prn_00000000000000000a9a';
const BOARD = 'brd_00000000000000b1';
const ARTIFACT = {
  id: 'itm_00000000000000f1', kind: 'artifact', title: 'Parity report', scope: 'workspace', audience: 'workspace', outcome: 'completed',
  createdBy: AGENT, createdAt: '2026-10-01T09:00:00.000Z', latestVersion: 2, expiresAt: '2026-12-01T00:00:00.000Z', revokedAt: null,
  caption: 'A caption for search', supersededBy: null,
  source: { agent: true, agentPrincipal: AGENT, sourceKind: 'agentpod', station: 'stn_00000000000000s1', stationName: 'docs', path: 'out/report', board: BOARD, card: 'card_00000000000000c1', stage: 'review', run: 'run_00000000000000r1' },
};
const VERSIONS = [
  { version: 2, entry: 'index.md', view: 'markdown', mediaType: 'text/markdown', totalBytes: 2048, fileCount: 2, sha256: 'b'.repeat(64), createdAt: '2026-10-02T09:00:00.000Z', revokedAt: null, scanOverride: true, files: [] },
  { version: 1, entry: 'index.md', view: 'markdown', mediaType: 'text/markdown', totalBytes: 512, fileCount: 1, sha256: 'c'.repeat(64), createdAt: '2026-10-01T09:00:00.000Z', revokedAt: '2026-10-02T10:00:00.000Z', scanOverride: false, files: [] },
];
const RECORD_ITEM = {
  id: 'itm_00000000000000f2', kind: 'work-record', title: 'Parity card', scope: `board:${BOARD}`, audience: 'board', outcome: 'rejected',
  createdBy: 'source:superpipeline', createdAt: '2026-10-01T09:00:00.000Z', latestVersion: 0, expiresAt: null, revokedAt: null,
  supersededBy: ARTIFACT.id, caption: 'Replaced by the report',
  source: { sourceUrl: 'https://app.superpipeline.dev/b/x/c/y', board: BOARD, stage: 'review', card: 'card_00000000000000c2' },
};
const RECORD_VIEW = {
  item: RECORD_ITEM, boardName: 'Parity board', artifacts: [ARTIFACT],
  record: {
    schema: 'work-record/1', boardId: BOARD, cardId: 'card_00000000000000c2', title: 'Parity card', spec: { goal: 'Ship the parity check' }, state: 'rejected', stage: 'review',
    archivedAt: '2026-10-05T00:00:00.000Z', createdAt: '2026-10-01T09:00:00.000Z', updatedAt: '2026-10-05T00:00:00.000Z',
    handoffs: [
      { runId: 'run_1', stage: 'draft', agent: AGENT, startedAt: '2026-10-02T09:00:00.000Z', endedAt: null, attempt: 1, status: 'completed', handoff: { summary: 'Draft ready' }, failureReason: null },
      { runId: 'run_2', stage: 'review', agent: null, startedAt: null, endedAt: null, attempt: 2, status: 'failed', handoff: null, failureReason: 'tests failed' },
    ],
    comments: [{ id: 'c1', author: { kind: 'human', name: 'A reviewer' }, body: 'Needs work', createdAt: '2026-10-03T09:00:00.000Z' }],
    gates: [{ id: 'g1', stage: 'review', decision: 'approve', resolvedAt: '2026-10-04T09:00:00.000Z' }],
    references: [], supersededByCard: null, outcome: 'rejected', redactions: [{ field: 'comments[0].body', rule: 'github-token' }], truncated: true,
  },
};
const COLLECTION = { id: 'col_0123456789abcdef', name: 'Parity set', description: 'Things to keep', createdBy: AGENT, createdAt: '2026-10-01T09:00:00.000Z', updatedAt: '2026-10-01T09:00:00.000Z', itemCount: 2, canEdit: true };
const DETAIL = { ...COLLECTION, entries: [
  { item: ARTIFACT, addedBy: AGENT, addedAt: '2026-10-03T09:00:00.000Z', note: 'Keep this one' },
  { item: RECORD_ITEM, addedBy: AGENT, addedAt: '2026-10-03T10:00:00.000Z', note: null },
] };
const RELATED = { itemId: 'itm_00000000000000f3', kind: 'artifact', title: 'Related note', outcome: 'approved', scope: 'workspace', provenance: {}, snippet: 'A related snippet', url: '', score: 1, supersededBy: null, wrapped: '', tokens: 1 };

export const FIX = {
  me: { principalId: 'prn_000000000000000000a2', org: 'org_1', workspaceId: 'wks_1', role: 'owner' as const },
  artifactId: ARTIFACT.id, recordId: RECORD_ITEM.id, collectionId: COLLECTION.id,
  respond(path: string, init?: RequestInit): Response {
    const method = init?.method ?? 'GET';
    if (path === '/api/v1/facets') return Response.json({ boards: [{ id: BOARD, name: 'Parity board' }], agents: [AGENT], stations: [{ id: 'stn_00000000000000s1', name: 'docs' }] });
    if (path === '/api/v1/browse') return Response.json({ items: [ARTIFACT, RECORD_ITEM], next: 'cursor1', counts: { approved: 0, completed: 1, 'in-progress': 0, superseded: 0, rejected: 1, failed: 0, abandoned: 0 } });
    if (path === '/api/v1/search') return Response.json({ results: [] });
    if (path === '/api/v1/related') return Response.json({ items: [RELATED] });
    if (path === '/api/v1/collections' && method === 'GET') return Response.json({ collections: [COLLECTION] });
    if (path === `/api/v1/collections/${COLLECTION.id}`) return Response.json(DETAIL);
    if (path === `/api/v1/items/${ARTIFACT.id}`) return Response.json({ item: ARTIFACT, versions: VERSIONS });
    if (path === `/api/v1/items/${RECORD_ITEM.id}`) return Response.json({ item: RECORD_ITEM, versions: [] });
    if (path === `/api/v1/items/${RECORD_ITEM.id}/record`) return Response.json(RECORD_VIEW);
    return Response.json({ error: 'not_found' }, { status: 404 });
  },
};

const OUTCOME_WORDS = ['Approved', 'Completed', 'In progress', 'Superseded', 'Rejected', 'Failed', 'Abandoned'];
/** A row or entry of a list, whatever shape a vibe gives it (a card, a line, a table row). */
const ROW = (list: string) => `[aria-label="${list}"] li, [aria-label="${list}"] tr`;
/** The element holding the h1: the item's header facts (IH2–IH5) belong with the title, wherever a vibe puts it. */
const HEADER = ':has(> h1)';
const ITEM_COMMON: Need[] = [
  { heading: 'Provenance' },
  { heading: 'Related' }, { in: ROW('Related items'), together: ['Related note', 'Approved', 'A related snippet'] }, { css: '[aria-label="Related items"]', what: 'the related list' },
  { heading: 'Collections' }, { role: 'combobox', name: 'Collection', options: ['Parity set'] }, { role: 'button', name: 'Add to collection' },
  { heading: 'Moderate' }, { role: 'button', name: 'Remove from memory' },
  { role: 'field', name: 'Delete on' }, { role: 'button', name: 'Set the delete date' },
  { heading: 'Revoke' }, 'Nobody will be able to view it again. The record of it stays.', { role: 'button', name: 'Revoke this item' },
];

export const PARITY: Record<'library' | 'artifact' | 'record' | 'collections' | 'collection', readonly Need[]> = {
  library: [
    { heading: 'Library', level: 1 }, { role: 'link', name: 'Upload' },
    { role: 'searchbox', name: 'Search the library' }, { css: 'input[type="search"]#q', what: 'the search box' }, { role: 'button', name: 'Search' }, 'Filters',
    { role: 'combobox', name: 'Kind', options: ['Everything', 'Artifacts', 'Work records'] },
    { role: 'combobox', name: 'Board', options: ['Every board', 'Parity board'] },
    { role: 'combobox', name: 'Agent', options: ['Anyone', AGENT] },
    { role: 'combobox', name: 'Station', options: ['Any station', 'docs'] },
    { role: 'combobox', name: 'Active', options: ['Any time', 'This week', 'This month', 'Last 30 days', 'Between dates…'] },
    { role: 'group', name: 'Outcome' }, ...OUTCOME_WORDS.map((w): Need => ({ role: 'checkbox', name: w })),
    '2+ items, most recent activity first',
    // R1–R6 row by row. R3 is checked by its parts: Studio shows kind, board, station and path in their own columns.
    { css: '[aria-label="Library"]', what: 'the list named Library' },
    { in: ROW('Library'), together: ['Parity report', 'Completed', 'Artifact', 'Parity board', 'docs', 'out/report', 'Everyone in the workspace', 'A caption for search'] },
    { in: ROW('Library'), together: ['Parity card', 'Rejected', 'Work record', 'Parity board', 'This board', 'Replaced by the report', 'See what replaced it'] },
    { css: `a[href="/a/${ARTIFACT.id}"]`, what: 'a row links to its item' }, { css: `a[href="/a/${RECORD_ITEM.id}"]`, what: 'the record row links to its item' },
    { css: `a[href="/a/${ARTIFACT.id}"].replaced, a.replaced[href="/a/${ARTIFACT.id}"]`, what: 'the replaced-by link' },
    { role: 'button', name: 'More' },
  ],
  artifact: [
    { heading: 'Parity report', level: 1 }, { css: 'h1', what: 'a heading' },
    { in: HEADER, together: ['Parity report', 'Completed', 'v2 (latest)', 'Everyone in the workspace', `deleted on ${day(ARTIFACT.expiresAt)}`] },
    { role: 'link', name: 'Upload a new version' },
    { css: '.viewer', what: 'the viewer' },
    { heading: 'Versions' },
    { in: 'li, tr', together: ['v2', `${when(VERSIONS[0]!.createdAt)} · ${formatBytes(2048)} · 2 files`, 'Shown', 'Latest', 'Secret scan overridden', 'Revoke version 2'] },
    { in: 'li, tr', together: ['v1', `${when(VERSIONS[1]!.createdAt)} · ${formatBytes(512)} · 1 file`, 'Revoked'] },
    { role: 'link', name: 'v2' }, { plain: 'v1' },
    { role: 'button', name: 'Revoke version 2' },
    { heading: 'Details · version 2' },
    { label: 'Item', value: 'Artifact' }, { label: 'Kind', value: 'Folder, opens on a Markdown' }, { label: 'Media type', value: 'text/markdown' },
    { label: 'Size', value: `${formatBytes(2048)} (2,048 bytes)` }, { label: 'Files', value: '2' }, { label: 'Opens on', value: 'index.md' },
    { label: 'SHA-256', value: 'b'.repeat(64) }, { label: 'SHA-256', value: "of the folder's file list" }, { role: 'button', name: 'Copy SHA-256' },
    { label: 'Uploaded', value: when(VERSIONS[0]!.createdAt) }, { label: 'Secret scan', value: 'Overridden by the uploader, recorded' },
    { label: 'Created by', value: `An agent (${AGENT})` }, { label: 'Station', value: 'stn_00000000000000s1' }, { label: 'Source path', value: 'out/report' },
    { label: 'Board', value: BOARD }, { label: 'Stage', value: 'review' }, { label: 'Card', value: 'card_00000000000000c1' }, { label: 'Run', value: 'run_00000000000000r1' },
    { label: 'Created', value: when(ARTIFACT.createdAt) }, { label: 'Visible to', value: 'Everyone in the workspace' }, { label: 'Outcome', value: 'completed' },
    { role: 'field', name: 'Caption' }, 'Shown with the item and used by search. Most useful for images.', { role: 'button', name: 'Save caption' },
    { role: 'field', name: 'Replaced by' }, { role: 'button', name: 'Mark as superseded' },
    { heading: `To be deleted on ${day(ARTIFACT.expiresAt)}` }, { role: 'button', name: 'Keep it (no delete date)' },
    ...ITEM_COMMON,
  ],
  record: [
    { heading: 'Parity card', level: 1 }, { in: HEADER, together: ['Parity card', 'Rejected', 'This board'] },
    'Parity board', 'Now at review', { role: 'link', name: 'Open the card in Superpipeline' },
    { css: 'a[target="_blank"][rel="noopener noreferrer"]', what: 'the card link opens safely' },
    'Some text was hidden because it looked like a secret.', 'This record is long: its oldest comments and handoffs were shortened.',
    { heading: 'Spec' }, { label: 'goal', value: 'Ship the parity check' },
    { heading: 'Timeline' }, { css: 'ol.timeline', what: 'the timeline list' },
    { in: 'ol.timeline > li', together: ['Card created', when(RECORD_VIEW.record.createdAt)] },
    { in: 'ol.timeline > li', together: ['draft · attempt 1 · completed', `${when(RECORD_VIEW.record.handoffs[0]!.startedAt!)} · ${AGENT}`, 'Draft ready'] },
    { in: 'ol.timeline > li', together: ['review · attempt 2 · failed', 'Time not recorded', 'Failed: tests failed'] },
    { in: 'ol.timeline > li', together: ['Comment', `${when(RECORD_VIEW.record.comments[0]!.createdAt)} · A reviewer`, 'Needs work'] },
    { in: 'ol.timeline > li', together: ['Gate at review: approved', when(RECORD_VIEW.record.gates[0]!.resolvedAt)] },
    { in: 'ol.timeline > li', together: ['Archived', when(RECORD_VIEW.record.archivedAt)] },
    { heading: 'Artifacts' }, { in: 'li, tr', together: ['Parity report', 'v2'] }, { role: 'link', name: 'Parity report v2' },
    { label: 'Created by', value: 'A person (source:superpipeline)' }, { label: 'Board', value: BOARD }, { label: 'Stage', value: 'review' },
    { label: 'Card', value: 'card_00000000000000c2' }, { label: 'Created', value: when(RECORD_ITEM.createdAt) }, { label: 'Visible to', value: 'This board' }, { label: 'Outcome', value: 'rejected' },
    { role: 'button', name: 'Show to everyone in the workspace' }, { heading: 'Delete on a date' },
    'Superseded by', { role: 'link', name: 'the item that replaced it' }, { role: 'button', name: 'Undo superseded' },
    ...ITEM_COMMON,
  ],
  collections: [
    { heading: 'Collections', level: 1 }, 'Named sets of items, put together by people. An artifact in a collection is kept however old it is.',
    { role: 'field', name: 'Name' }, { role: 'field', name: 'Description (optional)' }, { role: 'button', name: 'Create collection' },
    { css: '[aria-label="Collections"]', what: 'the list named Collections' },
    { in: ROW('Collections'), together: ['Parity set', '2 items', 'Things to keep'] },
    { css: `a[href="/collections/${COLLECTION.id}"]`, what: 'a collection links to itself' },
  ],
  collection: [
    { heading: 'Parity set', level: 1 }, 'Things to keep', `2 items · created ${when(COLLECTION.createdAt)}`, { role: 'button', name: 'Rename or describe' }, { role: 'button', name: 'Delete collection' },
    { css: '[aria-label="Items in this collection"]', what: 'the list named Items in this collection' },
    { in: ROW('Items in this collection'), together: ['Parity report', 'Completed', `added ${when(DETAIL.entries[0]!.addedAt)}`, 'Keep this one', 'Remove “Parity report” from collection'] },
    { in: ROW('Items in this collection'), together: ['Parity card', 'Rejected', `added ${when(DETAIL.entries[1]!.addedAt)}`, 'Remove “Parity card” from collection'] },
    { role: 'button', name: 'Remove “Parity report” from collection' },
    { css: `a[href="/a/${ARTIFACT.id}"]`, what: 'an entry links to its item' }, { css: `a[href="/a/${RECORD_ITEM.id}"]`, what: 'the record entry links to its item' },
  ],
};
