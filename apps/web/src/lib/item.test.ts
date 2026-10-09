import { describe, expect, it } from 'vitest';
import type { ItemSummary, VersionSummary } from '@superlibrary/contract';
import type { Me } from './api';
import {
  ItemError, askRevokeItem, askRevokeVersion, embedUrlGetter, explain, kindWords, mayManage, parseVersion, provenanceRows, readItem, scopeSetter,
  shareInfoGetter, shownVersion, versionRows, versionsGetter,
} from './item';

describe('item helpers', () => {
  it('asks the API for an embed URL with the version, if any', async () => {
    const bodies: string[] = [];
    const get = embedUrlGetter(async (path, init) => { bodies.push(`${path} ${init?.body}`); return new Response(JSON.stringify({ url: 'u', version: 2 }), { status: 200 }); });
    await get({ itemId: 'itm_0000000000000001', version: 2 });
    await get({ itemId: 'itm_0000000000000001' });
    expect(bodies).toEqual(['/api/v1/items/itm_0000000000000001/embed {"version":2}', '/api/v1/items/itm_0000000000000001/embed {}']);
  });
  it('turns a refusal into an ItemError with the server’s code', async () => {
    const get = embedUrlGetter(async () => new Response(JSON.stringify({ error: 'revoked' }), { status: 410 }));
    await expect(get({ itemId: 'itm_0000000000000001' })).rejects.toMatchObject({ status: 410, code: 'revoked' });
    expect(new ItemError(410, 'revoked')).toBeInstanceOf(Error);
  });
  it('parses a version from the route, and explains codes in words', () => {
    expect(parseVersion('3')).toBe(3);
    for (const bad of ['0', '-1', 'x', '1.5', undefined]) expect(parseVersion(bad)).toBeUndefined();
    expect(explain('revoked')).toBe('This was revoked.');
    expect(explain('not_found')).toBe('Nothing here, or you cannot see it.');
  });
});

const ME: Me = { principalId: 'prn_00000000000000000001', org: 'org_00000000000000000001', workspaceId: 'wsp_0000000000000001', role: 'member' };
const OTHER = 'prn_00000000000000000002';
const ITEM: ItemSummary = {
  id: 'itm_0000000000000001', kind: 'artifact', title: 'Report', scope: 'board:brd_0000000000000001', outcome: 'completed',
  createdBy: ME.principalId, createdAt: '2026-10-09T06:48:00.000Z', latestVersion: 3, expiresAt: null, revokedAt: null,
};
const v = (version: number, extra: Partial<VersionSummary> = {}): VersionSummary => ({
  version, entry: 'report.md', view: 'markdown', mediaType: 'text/markdown', totalBytes: 2150, fileCount: 1,
  sha256: 'ab'.repeat(32), createdAt: '2026-10-09T06:48:00.000Z', revokedAt: null, scanOverride: false,
  files: [{ path: 'report.md', mediaType: 'text/markdown', view: 'markdown', bytes: 2150 }], ...extra,
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('who may manage an item (a mirror of plan D12; the API still decides)', () => {
  it('the uploader or an owner, nobody else', () => {
    expect(mayManage(ME, ITEM)).toBe(true);
    expect(mayManage(ME, { ...ITEM, createdBy: OTHER })).toBe(false);
    expect(mayManage({ ...ME, role: 'owner' }, { ...ITEM, createdBy: OTHER })).toBe(true);
  });
});

describe('the callbacks the item page gives the embed', () => {
  it('lists only live versions', async () => {
    const get = versionsGetter(async () => json({ item: ITEM, versions: [v(3), v(2, { revokedAt: '2026-10-09T07:00:00.000Z' }), v(1)] }));
    expect(await get({ itemId: ITEM.id })).toEqual([3, 1]);
  });
  it('share info says who can see it, and lets only a manager widen it', async () => {
    const mine = shareInfoGetter(async () => json({ item: ITEM, versions: [] }), () => ME);
    expect(await mine({ itemId: ITEM.id })).toEqual({ scope: ITEM.scope, canWiden: true, title: 'Report' });
    const theirs = shareInfoGetter(async () => json({ item: { ...ITEM, scope: 'workspace', createdBy: OTHER }, versions: [] }), () => ME);
    expect(await theirs({ itemId: ITEM.id })).toMatchObject({ scope: 'workspace', canWiden: false });
    const signedOut = shareInfoGetter(async () => json({ item: ITEM, versions: [] }), () => null);
    expect(await signedOut({ itemId: ITEM.id })).toMatchObject({ canWiden: false });
  });
  it('widening posts the scope and throws the API’s code on a refusal', async () => {
    const seen: string[] = [];
    await scopeSetter(async (path, init) => { seen.push(`${init?.method} ${path} ${init?.body}`); return json({ item: { ...ITEM, scope: 'workspace' } }); })({ itemId: ITEM.id, scope: 'workspace' });
    expect(seen).toEqual([`POST /api/v1/items/${ITEM.id}/scope {"scope":"workspace"}`]);
    await expect(scopeSetter(async () => json({ error: 'not_permitted' }, 403))({ itemId: ITEM.id, scope: 'workspace' })).rejects.toThrow('not_permitted');
  });
});

describe('reading the item', () => {
  it('an item and its versions', async () => {
    expect(await readItem(async () => json({ item: ITEM, versions: [v(1)] }), ITEM.id)).toEqual({ state: 'ok', item: ITEM, versions: [v(1)] });
  });
  it('an expired item is its own state (its uploader or an owner may still keep it), read from the 410 body', async () => {
    expect(await readItem(async () => json({ error: 'expired' }, 410), ITEM.id)).toEqual({ state: 'expired' });
    expect(await readItem(async () => json({ error: 'revoked' }, 410), ITEM.id)).toEqual({ state: 'refused', code: 'revoked' });
    expect(await readItem(async () => new Response('<html>', { status: 502 }), ITEM.id)).toEqual({ state: 'refused', code: 'http_502' });
  });
});

describe('the version shown', () => {
  it('is the one asked for, else the newest live one', () => {
    const vs = [v(3, { revokedAt: '2026-10-09T07:00:00.000Z' }), v(2), v(1)];
    expect(shownVersion(vs, 1)?.version).toBe(1);
    expect(shownVersion(vs, undefined)?.version).toBe(2);
    expect(shownVersion(vs, 9)).toBeUndefined();
    expect(shownVersion([v(1, { revokedAt: '2026-10-09T07:00:00.000Z' })], undefined)).toBeUndefined();
  });
});

describe('provenance and details, in words', () => {
  const rows = (r: Array<{ label: string; value: string }>) => Object.fromEntries(r.map((x) => [x.label, x.value]));
  it('who created it, and when', () => {
    const r = rows(provenanceRows(ITEM, ME));
    expect(r['Created by']).toBe('You (a person)');
    expect(r.Created).toBe(new Date(ITEM.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }));
    expect(r['Visible to']).toBe('Only you');
    expect(rows(provenanceRows({ ...ITEM, createdBy: OTHER, scope: 'workspace' }, ME))).toMatchObject({ 'Created by': `A person (${OTHER})`, 'Visible to': 'Everyone in the workspace' });
  });
  it('station, source path, card and run appear only when a source provides them', () => {
    expect(provenanceRows(ITEM, ME).map((x) => x.label)).not.toContain('Station');
    const agent = rows(provenanceRows({ ...ITEM, createdBy: OTHER, source: { agent: true, station: 'stn_1', path: 'out/report.md', card: 'crd_1', run: 'run_1' } }, ME));
    expect(agent).toMatchObject({ 'Created by': `An agent (${OTHER})`, Station: 'stn_1', 'Source path': 'out/report.md', Card: 'crd_1', Run: 'run_1' });
  });
  it('a version: kind, media type, size and SHA-256', () => {
    const r = rows(versionRows(v(2)));
    expect(r).toMatchObject({ Kind: 'Markdown', 'Media type': 'text/markdown', Size: '2.1 KB (2,150 bytes)', 'SHA-256': 'ab'.repeat(32) });
    expect(r.Files).toBeUndefined();
    const folder = rows(versionRows(v(1, { entry: 'site/index.html', view: 'html', mediaType: 'text/html', fileCount: 3, scanOverride: true })));
    expect(folder).toMatchObject({ Kind: 'Folder, opens on an HTML page', Files: '3', 'Opens on': 'site/index.html', 'Secret scan': 'Overridden by the uploader, recorded' });
    expect(versionRows(v(1, { fileCount: 3 })).find((x) => x.label === 'SHA-256')?.note).toBe("of the folder's file list");
  });
  it('every view has words', () => {
    expect(kindWords('ipynb')).toBe('Jupyter notebook');
    expect(kindWords('download')).toBe('File (download only)');
  });
});

describe('what the person is told', () => {
  it('a refused change says why in a sentence', () => {
    expect(explain('not_permitted')).toBe('Only the person who uploaded it, or an owner of the workspace, may do that.');
    expect(explain('invalid', 'expiresAt must be in the future')).toBe('Choose a date after today.');
    expect(explain('invalid', 'reason must be a string of at most 500 characters')).toBe('That was not accepted: reason must be a string of at most 500 characters.');
    expect(explain('teapot')).toBe('Something went wrong (teapot).');
  });
});

describe('what each confirmation asks', () => {
  it('names the exact act on its button', () => {
    expect(askRevokeVersion(3)).toEqual({ title: 'Revoke version 3?', message: 'Nobody will be able to view version 3 again. The other versions stay. This cannot be undone.', action: 'Revoke version 3' });
    expect(askRevokeItem('Report')).toEqual({ title: 'Revoke “Report”?', message: 'Nobody will be able to view it or any of its versions again. This cannot be undone.', action: 'Revoke this item', reason: true });
  });
});
