import { describe, expect, it } from 'vitest';
import {
  ITEM_ID, newId, contentLabel, itemIdFromLabel, SCOPE_RE, LIMITS, UploadCreate,
  FRAME_SANDBOX, contentCsp, encodePath, formatToken, parseToken, signingMessage, b64url, fromB64url,
  compareTreePaths, orderFiles, sizeRefusal,
} from '../src/index';

describe('ids', () => {
  it('mints prefixed 16-hex ids, and maps an item id to a hostname label and back', () => {
    const id = newId('itm');
    expect(id).toMatch(ITEM_ID);
    expect(contentLabel(id)).toBe(id.replace('itm_', 'itm-'));
    expect(itemIdFromLabel(contentLabel(id))).toBe(id);
  });
  it('refuses a label that is not exactly an item label', () => {
    for (const bad of ['itm_0123456789abcdef', 'itm-0123', 'ITM-0123456789ABCDEF', 'x.itm-0123456789abcdef', '']) {
      expect(itemIdFromLabel(bad)).toBeNull();
    }
  });
});

describe('model', () => {
  it('accepts workspace and board scopes only', () => {
    expect(SCOPE_RE.test('workspace')).toBe(true);
    expect(SCOPE_RE.test('board:brd_00000000000000b1')).toBe(true);
    expect(SCOPE_RE.test('board:anything')).toBe(false);
    expect(SCOPE_RE.test('public')).toBe(false);
  });
  it('states the spec §8 limits exactly', () => {
    expect(LIMITS.fileBytes).toBe(25 * 1024 * 1024);
    expect(LIMITS.folderBytes).toBe(100 * 1024 * 1024);
    expect(LIMITS.folderFiles).toBe(500);
    expect(LIMITS.workspaceBytes).toBe(1024 * 1024 * 1024);
    expect(LIMITS.embedTtlSeconds).toBe(300);
    expect(LIMITS.retentionDays).toBe(30);
    expect(LIMITS.csvRows).toBe(5000);
  });
  it('validates an upload declaration', () => {
    const ok = UploadCreate.safeParse({ title: 'Report', files: [{ path: 'a.md', bytes: 3, sha256: 'a'.repeat(64) }] });
    expect(ok.success).toBe(true);
    expect(UploadCreate.safeParse({ title: 'x', files: [] }).success).toBe(false);
    expect(UploadCreate.safeParse({ title: 'x', files: [{ path: 'a', bytes: -1, sha256: 'a'.repeat(64) }] }).success).toBe(false);
    expect(UploadCreate.safeParse({ title: 'x', scope: 'public', files: [{ path: 'a', bytes: 1, sha256: 'a'.repeat(64) }] }).success).toBe(false);
  });
});

describe('content origin', () => {
  it('builds the spec §9 CSP, with frame-ancestors from configuration', () => {
    const csp = contentCsp(['https://app.superlibrary.dev', 'https://app.superpipeline.dev']);
    const cdn = "'self' data: blob: https://cdnjs.cloudflare.com https://cdn.jsdelivr.net https://unpkg.com";
    expect(csp).toBe([
      "default-src 'none'",
      `script-src ${cdn} 'unsafe-inline'`,
      `style-src ${cdn} https://fonts.googleapis.com https://fonts.gstatic.com 'unsafe-inline'`,
      `img-src ${cdn}`,
      `font-src ${cdn} https://fonts.googleapis.com https://fonts.gstatic.com`,
      `media-src ${cdn}`,
      "connect-src 'none'",
      'frame-ancestors https://app.superlibrary.dev https://app.superpipeline.dev',
    ].join('; '));
    expect(csp).not.toContain('form-action');
    // Operator decision D3: inline script and style are allowed; eval and WebAssembly are not.
    expect(csp).not.toContain('unsafe-eval');
    expect(csp).not.toContain('wasm-unsafe-eval');
  });
  it('refuses to build a CSP that anyone may frame (ruling T11: an empty frame-ancestors is ignored by browsers)', () => {
    expect(() => contentCsp([])).toThrow(/frame-ancestors/);
  });
  it('the frame sandbox is the spec §9 one: scripts and escaping popups, never same-origin, forms, top navigation or modals', () => {
    expect(FRAME_SANDBOX).toBe('allow-scripts allow-popups-to-escape-sandbox');
  });
  it('encodes each path segment, keeping the slashes', () => {
    expect(encodePath('img/a b#1?.png')).toBe('img/a%20b%231%3F.png');
    expect(encodePath('ünï/100%.md')).toBe('%C3%BCn%C3%AF/100%25.md');
  });
  it('round-trips a token and refuses a malformed one', () => {
    const sig = new Uint8Array(64).fill(7);
    const t = formatToken({ version: 3, exp: 1_800_000_000, host: 'https://app.superlibrary.dev', sig });
    expect(parseToken(t)).toEqual({ version: 3, exp: 1_800_000_000, host: 'https://app.superlibrary.dev', sig });
    for (const bad of ['', '3.1800000000', 'x.1.aaa.bbb', '0.1800000000.aGk.' + b64url(sig), '3.1800000000.aGk.short']) {
      expect(parseToken(bad)).toBeNull();
    }
  });
  it('signs item, version, expiry and host together', () => {
    const m = new TextDecoder().decode(signingMessage({ itemId: 'itm_0123456789abcdef', version: 2, exp: 99, host: 'https://h.test' }));
    expect(m).toBe('superlibrary-content/v1\nitm_0123456789abcdef\n2\n99\nhttps://h.test');
  });
  it('base64url round-trips and rejects junk', () => {
    const bytes = new Uint8Array([0, 255, 62, 63]);
    expect(fromB64url(b64url(bytes))).toEqual(bytes);
    expect(fromB64url('***')).toBeNull();
  });
});

describe('file order', () => {
  it('sorts by path segment, so a folder stays together, and puts the entry first', () => {
    const paths = ['s/a.css', 's/a-b.css', 'z.txt', 's/a/x.css', 's/index.html', 'readme.txt', 's/a/b/c.txt'];
    expect([...paths].sort(compareTreePaths)).toEqual(['readme.txt', 's/a/b/c.txt', 's/a/x.css', 's/a-b.css', 's/a.css', 's/index.html', 'z.txt']);
    expect(orderFiles('s/index.html', paths.map((path) => ({ path }))).map((f) => f.path))
      .toEqual(['s/index.html', 'readme.txt', 's/a/b/c.txt', 's/a/x.css', 's/a-b.css', 's/a.css', 'z.txt']);
  });
});

describe('sizeRefusal', () => {
  it('says the limits in MB, derived from LIMITS', () => {
    expect(sizeRefusal.file('a.bin')).toBe(`a.bin is larger than ${LIMITS.fileBytes / 1048576} MB, the limit for one file.`);
    expect(sizeRefusal.file('a.bin')).toContain('25 MB');
    expect(sizeRefusal.folder()).toBe('Together these are more than 100 MB, the limit for a folder.');
    expect(sizeRefusal.files()).toBe('A folder may have at most 500 files.');
    expect(sizeRefusal.files(501)).toBe('A folder may have at most 500 files; this has 501.');
  });
});
