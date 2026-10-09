/** The item page's helpers: the embed's callbacks, the item read, and the page's words. */
import { ITEM_ID, type EmbedGrant, type ItemSummary, type VersionSummary, type View } from '@superlibrary/contract';
import { formatBytes, visibilityWords, type MountOptions, type ShareInfo } from '@superlibrary/embed';
import type { Me } from './api';

type Api = (path: string, init?: RequestInit) => Promise<Response>;

export class ItemError extends Error {
  constructor(public status: number, public code: string) { super(code); }
}

const codeOf = async (res: Response) => ((await res.json().catch(() => ({}))) as { error?: string }).error ?? `http_${res.status}`;
const JSON_HEADERS = { 'content-type': 'application/json' };

/** The app is one more host of the embed (spec §9, Embedding): no renderer of its own. */
export function embedUrlGetter(api: Api): MountOptions['getEmbedUrl'] {
  return async ({ itemId, version }) => {
    const res = await api(`/api/v1/items/${itemId}/embed`, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify(version ? { version } : {}) });
    if (!res.ok) throw new ItemError(res.status, await codeOf(res));
    return (await res.json()) as EmbedGrant;
  };
}

export function parseVersion(raw: string | undefined): number | undefined {
  return raw && /^[1-9][0-9]*$/.test(raw) ? Number(raw) : undefined;
}

/** Plan D12, mirrored so the page offers only what the API will allow: the uploader or an owner. */
export const mayManage = (me: Me, item: ItemSummary) => item.createdBy === me.principalId || me.role === 'owner';

export type ItemRead =
  | { state: 'ok'; item: ItemSummary; versions: VersionSummary[] }
  /** GET answers 410 `expired`; the uploader or an owner may still keep it (PATCH works until it is swept). */
  | { state: 'expired' }
  | { state: 'refused'; code: string };

export async function readItem(api: Api, itemId: string): Promise<ItemRead> {
  // A route parameter is whatever was typed: anything but an item id is not found, unasked.
  if (!ITEM_ID.test(itemId)) return { state: 'refused', code: 'not_found' };
  const res = await api(`/api/v1/items/${itemId}`);
  if (!res.ok) {
    const code = await codeOf(res);
    return res.status === 410 && code === 'expired' ? { state: 'expired' } : { state: 'refused', code };
  }
  const body = (await res.json()) as { item: ItemSummary; versions: VersionSummary[] };
  return { state: 'ok', item: body.item, versions: body.versions };
}

/** Live versions, for the toolbar's version menu. */
export function versionsGetter(api: Api): NonNullable<MountOptions['getVersions']> {
  return async ({ itemId }) => {
    const r = await readItem(api, itemId);
    if (r.state !== 'ok') throw new ItemError(0, r.state === 'expired' ? 'expired' : r.code);
    return r.versions.filter((x) => !x.revokedAt).map((x) => x.version);
  };
}

/** Read on each Share open, so a widening elsewhere shows. `me` is read then too. */
export function shareInfoGetter(api: Api, me: () => Me | null): NonNullable<MountOptions['getShareInfo']> {
  return async ({ itemId }) => {
    const r = await readItem(api, itemId);
    if (r.state !== 'ok') throw new ItemError(0, r.state === 'expired' ? 'expired' : r.code);
    const who = me();
    return { scope: r.item.scope, canWiden: who !== null && mayManage(who, r.item), title: r.item.title, boardVisible: r.item.audience === 'board' } satisfies ShareInfo;
  };
}

/** POST …/scope; a refusal throws an Error whose message is the API's code (the README's contract). */
export function scopeSetter(api: Api): NonNullable<MountOptions['setScope']> {
  return async ({ itemId, scope }) => {
    const res = await api(`/api/v1/items/${itemId}/scope`, { method: 'POST', headers: JSON_HEADERS, body: JSON.stringify({ scope }) });
    if (!res.ok) throw new Error(await codeOf(res));
    return res.json();
  };
}

/** The version asked for, else the newest live one (what the embed shows without a version). */
export function shownVersion(versions: VersionSummary[], asked: number | undefined): VersionSummary | undefined {
  return asked !== undefined ? versions.find((x) => x.version === asked) : versions.find((x) => !x.revokedAt);
}

const KIND_WORDS: Record<View, string> = {
  html: 'HTML page', markdown: 'Markdown', image: 'Image', svg: 'SVG image', pdf: 'PDF', code: 'Code', text: 'Text',
  json: 'JSON', yaml: 'YAML', toml: 'TOML', csv: 'CSV table', tsv: 'TSV table', ipynb: 'Jupyter notebook',
  mermaid: 'Mermaid diagram', graphviz: 'Graphviz diagram', audio: 'Audio', video: 'Video', download: 'File (download only)',
};
export const kindWords = (view: View) => KIND_WORDS[view];

export interface Row { label: string; value: string; note?: string; mono?: boolean; copy?: boolean }

export const when = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
/** A library row's second line: version, who can see it (in words), when, and its delete date. */
export function listLine(item: ItemSummary): string {
  const seen = visibilityWords({ scope: item.scope, canWiden: false, boardVisible: item.audience === 'board' });
  return `v${item.latestVersion} · ${seen} · ${when(item.createdAt)}${item.expiresAt ? ` · to be deleted ${when(item.expiresAt)}` : ''}`;
}
export const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { dateStyle: 'medium' });

/** Spec §3 Provenance, as far as a source provides it; phase 1 uploads are a person's. */
export function provenanceRows(item: ItemSummary, me: Me | null): Row[] {
  const s = item.source ?? {};
  const who = s.agent ? `An agent (${item.createdBy})` : me && item.createdBy === me.principalId ? 'You (a person)' : `A person (${item.createdBy})`;
  const rows: Row[] = [{ label: 'Created by', value: who }];
  if (s.station) rows.push({ label: 'Station', value: s.station, mono: true });
  if (s.path) rows.push({ label: 'Source path', value: s.path, mono: true });
  if (s.board) rows.push({ label: 'Board', value: s.board, mono: true });
  if (s.stage) rows.push({ label: 'Stage', value: s.stage });
  if (s.card) rows.push({ label: 'Card', value: s.card, mono: true });
  if (s.run) rows.push({ label: 'Run', value: s.run, mono: true });
  rows.push({ label: 'Created', value: when(item.createdAt) });
  rows.push({ label: 'Visible to', value: visibilityWords({ scope: item.scope, canWiden: false, boardVisible: item.audience === 'board' }) });
  rows.push({ label: 'Outcome', value: item.outcome });
  return rows;
}

/** One version's details: kind, media type, size, SHA-256 (with copy) and the rest. */
export function versionRows(v: VersionSummary): Row[] {
  const folder = v.fileCount > 1;
  const rows: Row[] = [
    { label: 'Kind', value: folder ? `Folder, opens on ${/^(HTML|SVG|[AEIOU])/.test(kindWords(v.view)) ? 'an' : 'a'} ${kindWords(v.view)}` : kindWords(v.view) },
    { label: 'Media type', value: v.mediaType, mono: true },
    { label: 'Size', value: `${formatBytes(v.totalBytes)} (${v.totalBytes.toLocaleString('en-US')} bytes)` },
  ];
  if (folder) rows.push({ label: 'Files', value: String(v.fileCount) }, { label: 'Opens on', value: v.entry, mono: true });
  rows.push({ label: 'SHA-256', value: v.sha256, mono: true, copy: true, ...(folder ? { note: "of the folder's file list" } : {}) });
  rows.push({ label: 'Uploaded', value: when(v.createdAt) });
  if (v.scanOverride) rows.push({ label: 'Secret scan', value: 'Overridden by the uploader, recorded' });
  if (v.revokedAt) rows.push({ label: 'Revoked', value: when(v.revokedAt) });
  return rows;
}

const WORDS: Record<string, string> = {
  revoked: 'This was revoked.', expired: 'This has expired.', not_found: 'Nothing here, or you cannot see it.', name_taken: 'A collection with that name already exists.',
  not_permitted: 'Only the person who uploaded it, or an owner of the workspace, may do that.',
  sign_in_required: 'Sign in again to do that.',
};
/** A refusal in words. `detail` is the API's own detail, passed through when there is no better sentence. */
export function explain(code: string, detail?: string): string {
  if (code === 'invalid') {
    if (detail === 'expiresAt must be in the future') return 'Choose a date after today.';
    if (detail === 'that would make a loop of replacements') return 'That would make a loop: the replacement is already marked as superseded by this item.';
    if (detail === 'an item cannot supersede itself') return 'An item cannot replace itself.';
    if (detail === 'a reason of 3 to 500 characters is required') return 'Say why, in at least 3 characters.';
    return detail ? `That was not accepted: ${detail}.` : 'That was not accepted.';
  }
  return WORDS[code] ?? `Something went wrong (${code}).`;
}

export interface Ask { title: string; message: string; action: string; reason?: boolean }

/** The confirmations: the button names the exact act. */
export const askRevokeVersion = (n: number): Ask => ({
  title: `Revoke version ${n}?`, message: `Nobody will be able to view version ${n} again. The other versions stay. This cannot be undone.`, action: `Revoke version ${n}`,
});
export const askRevokeItem = (title: string): Ask => ({
  title: `Revoke “${title}”?`, message: 'Nobody will be able to view it or any of its versions again. This cannot be undone.', action: 'Revoke this item', reason: true,
});

/** A change to the item (revoke, expiry): null when it was done, else the sentence to show. */
export async function change(api: Api, path: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown): Promise<string | null> {
  try {
    const res = await api(path, body === undefined ? { method } : { method, headers: JSON_HEADERS, body: JSON.stringify(body) });
    if (res.ok) return null;
    const b = (await res.json().catch(() => ({}))) as { error?: string; detail?: string };
    return explain(b.error ?? `http_${res.status}`, b.detail);
  } catch {
    return 'The library could not be reached. Check your connection and try again.';
  }
}
