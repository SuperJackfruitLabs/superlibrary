import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FRAME_SANDBOX, type EmbedGrant } from '@superlibrary/contract';
import { SANDBOX, mountArtifact, type ShareInfo } from '../src/index';

const ORIGIN = 'https://itm-00000000000000a1.superlibrarycontent.dev';
const GRANT: EmbedGrant = {
  url: `${ORIGIN}/_view?sig=T`,
  downloadUrl: `${ORIGIN}/s/T/a.md?download=1`,
  expiresAt: '2026-10-09T00:05:00.000Z',
  version: 3,
  itemUrl: 'https://app.superlibrary.dev/a/itm_00000000000000a1/v/3',
  entry: 'a.md',
  files: [{ path: 'a.md', mediaType: 'text/markdown', view: 'markdown', bytes: 120 }],
};
const FOLDER: EmbedGrant = {
  ...GRANT,
  downloadUrl: null,
  entry: 'index.html',
  files: [
    { path: 'index.html', mediaType: 'text/html', view: 'html', bytes: 900 },
    { path: 'a/notes.md', mediaType: 'text/markdown', view: 'markdown', bytes: 2048 },
    { path: 'a/pic.png', mediaType: 'image/png', view: 'image', bytes: 50000 },
    { path: 'data.csv', mediaType: 'text/csv', view: 'csv', bytes: 10 },
  ],
};
const ITEM = 'itm_00000000000000a1';
const APP_LINK = `https://app.superlibrary.dev/a/${ITEM}`;

/** jsdom's Storage is shadowed by Node's own `localStorage` global on Node >= 25, so each test gets its own. */
function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() { return m.size; },
    key: (i: number) => [...m.keys()][i] ?? null,
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
  };
}

let el: HTMLElement;
beforeEach(() => {
  document.body.innerHTML = '';
  vi.stubGlobal('localStorage', memoryStorage());
  el = document.body.appendChild(document.createElement('div'));
  // Every grant in these tests is fresh unless a test moves the clock.
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-09T00:00:00.000Z'));
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});
const mount = (over: Record<string, unknown> = {}) => mountArtifact(el, { itemId: ITEM, getEmbedUrl: async () => GRANT, ...over });
const post = (data: unknown, source: MessageEventSource | null, origin = 'null') => window.dispatchEvent(new MessageEvent('message', { data, source, origin }));
const q = <T extends Element = HTMLElement>(sel: string) => el.querySelector<T>(sel);
const flush = () => new Promise((r) => setTimeout(r, 0));
const src = (m: { iframe: HTMLIFrameElement }) => new URL(m.iframe.getAttribute('src')!);

describe('mountArtifact', () => {
  it('renders the sandboxed frame exactly as spec §9 says', async () => {
    const m = await mount();
    expect(m.iframe.getAttribute('sandbox')).toBe(SANDBOX);
    expect(SANDBOX).toBe('allow-scripts allow-popups-to-escape-sandbox');
    expect(SANDBOX).toBe(FRAME_SANDBOX);
    expect(m.iframe.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(m.iframe.getAttribute('src')).toBe(GRANT.url);
    expect(m.iframe.style.height).toBe('480px');
  });

  it('asks the host for a URL for the requested version', async () => {
    const getEmbedUrl = vi.fn(async () => GRANT);
    await mount({ version: 3, getEmbedUrl });
    expect(getEmbedUrl).toHaveBeenCalledWith({ itemId: ITEM, version: 3 });
  });

  it('honours a resize only from its own frame, with the opaque origin, within bounds', async () => {
    const m = await mount();
    const other = document.body.appendChild(document.createElement('iframe'));
    post({ type: 'superlibrary:resize', height: 900 }, other.contentWindow);
    expect(m.iframe.style.height).toBe('480px');
    post({ type: 'superlibrary:resize', height: 900 }, m.iframe.contentWindow, 'https://evil.test');
    expect(m.iframe.style.height).toBe('480px');
    post({ type: 'superlibrary:resize', height: 'tall' }, m.iframe.contentWindow);
    expect(m.iframe.style.height).toBe('480px');
    post({ type: 'superlibrary:other', height: 700 }, m.iframe.contentWindow);
    expect(m.iframe.style.height).toBe('480px');
    post({ type: 'superlibrary:resize', height: 900.2 }, m.iframe.contentWindow);
    expect(m.iframe.style.height).toBe('901px');
    post({ type: 'superlibrary:resize', height: 1e9 }, m.iframe.contentWindow);
    expect(m.iframe.style.height).toBe('20000px');
  });

  it('has a toolbar: version label, Open in new window, Download and Copy link, all correct', async () => {
    const writeText = vi.fn(async () => {});
    await mount({ version: 3, clipboard: { writeText } });
    expect(el.querySelector('.sl-version')!.textContent).toBe('v3');
    const open = el.querySelector<HTMLAnchorElement>('a.sl-open')!;
    expect(open.href).toBe('https://app.superlibrary.dev/a/itm_00000000000000a1/v/3');
    expect(open.target).toBe('_blank');
    expect(open.rel).toBe('noopener noreferrer');
    expect(el.querySelector<HTMLAnchorElement>('a.sl-download')!.href).toBe(GRANT.downloadUrl);
    el.querySelector<HTMLButtonElement>('button.sl-copy')!.click();
    expect(writeText).toHaveBeenCalledWith('https://app.superlibrary.dev/a/itm_00000000000000a1/v/3');
  });

  it('without a version, links to the item; a folder has no Download', async () => {
    await mount({ getEmbedUrl: async () => ({ ...GRANT, downloadUrl: null }) });
    expect(el.querySelector<HTMLAnchorElement>('a.sl-open')!.href).toBe('https://app.superlibrary.dev/a/itm_00000000000000a1');
    expect(el.querySelector('a.sl-download')).toBeNull();
  });

  it('sends a theme to its frame, and stops listening when destroyed', async () => {
    const m = await mount();
    const send = vi.spyOn(m.iframe.contentWindow!, 'postMessage');
    m.setTheme('dark');
    expect(send).toHaveBeenCalledWith({ type: 'superlibrary:theme', theme: 'dark' }, '*');
    m.destroy();
    expect(el.children).toHaveLength(0);
  });

  it('stops honouring resizes once destroyed', async () => {
    const m = await mount();
    const win = m.iframe.contentWindow;
    m.destroy();
    post({ type: 'superlibrary:resize', height: 900 }, win);
    expect(m.iframe.style.height).toBe('480px');
  });
});

describe('(1) version label and menu', () => {
  const byVersion = (v: number): EmbedGrant => ({ ...GRANT, version: v, url: `${ORIGIN}/_view?sig=V${v}`, downloadUrl: `${ORIGIN}/s/V${v}/a.md?download=1` });

  it('labels the version the grant names, not the one asked for or the newest', async () => {
    await mount({ getEmbedUrl: async () => byVersion(2) });
    expect(q('.sl-version')!.textContent).toBe('v2');
  });

  it('has no menu when the host gives no versions, or only one', async () => {
    await mount();
    expect(q('select.sl-versions')).toBeNull();
    el.innerHTML = '';
    await mount({ getVersions: async () => [3] });
    expect(q('select.sl-versions')).toBeNull();
  });

  it('switches versions through getEmbedUrl(version), and tells the host', async () => {
    const getEmbedUrl = vi.fn(async ({ version }: { version?: number }) => byVersion(version ?? 3));
    const onVersionChange = vi.fn();
    const m = await mount({ getEmbedUrl, getVersions: async () => [3, 2, 1], onVersionChange });
    const sel = q<HTMLSelectElement>('select.sl-versions')!;
    expect([...sel.options].map((o) => [o.value, o.textContent])).toEqual([['3', 'v3 (latest)'], ['2', 'v2'], ['1', 'v1']]);
    expect(sel.value).toBe('3');
    expect(sel.getAttribute('aria-label')).toBe('Version');
    sel.value = '2';
    sel.dispatchEvent(new Event('change'));
    await flush();
    expect(getEmbedUrl).toHaveBeenLastCalledWith({ itemId: ITEM, version: 2 });
    expect(m.iframe.getAttribute('src')).toBe(`${ORIGIN}/_view?sig=V2`);
    expect(q('.sl-version')!.textContent).toBe('v2');
    expect(q<HTMLAnchorElement>('a.sl-open')!.href).toBe(`${APP_LINK}/v/2`);
    expect(q<HTMLAnchorElement>('a.sl-download')!.href).toBe(`${ORIGIN}/s/V2/a.md?download=1`);
    expect(onVersionChange).toHaveBeenCalledWith(2);
  });

  it('keeps the shown version and says why when a switch is refused', async () => {
    const getEmbedUrl = vi.fn(async ({ version }: { version?: number }) => {
      if (version === 1) throw new Error('revoked');
      return byVersion(3);
    });
    const m = await mount({ getEmbedUrl, getVersions: async () => [3, 1] });
    const sel = q<HTMLSelectElement>('select.sl-versions')!;
    sel.value = '1';
    sel.dispatchEvent(new Event('change'));
    await flush();
    expect(sel.value).toBe('3');
    expect(q('.sl-version')!.textContent).toBe('v3');
    expect(m.iframe.getAttribute('src')).toBe(`${ORIGIN}/_view?sig=V3`);
    expect(q('[role="alert"]')!.textContent).toBe('Version 1 could not be opened: revoked');
  });

  it('a version that turns out to be a folder loses Download and gains Files', async () => {
    const getEmbedUrl = vi.fn(async ({ version }: { version?: number }) => (version === 2 ? { ...FOLDER, version: 2 } : GRANT));
    const m = await mount({ getEmbedUrl, getVersions: async () => [3, 2] });
    expect(q('.sl-files-toggle')).toBeNull();
    await m.setVersion(2);
    expect(q('a.sl-download')).toBeNull();
    expect(q('.sl-files-toggle')).not.toBeNull();
  });

  it('still mounts when the version list cannot be read', async () => {
    await mount({ getVersions: async () => { throw new Error('down'); } });
    expect(q('.sl-version')!.textContent).toBe('v3');
    expect(q('select.sl-versions')).toBeNull();
  });
});

describe('(2) Share panel', () => {
  const info = (over: Partial<ShareInfo> = {}): ShareInfo => ({ scope: 'board:brd_0000000000000001', canWiden: true, title: 'Q3 notes', ...over });
  const openShare = async () => {
    q<HTMLButtonElement>('button.sl-share-toggle')!.click();
    await flush();
  };

  it('opens and closes as a disclosure, and Escape returns focus to its button', async () => {
    await mount();
    const toggle = q<HTMLButtonElement>('button.sl-share-toggle')!;
    const panel = q('.sl-share-panel')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(toggle.getAttribute('aria-controls')).toBe(panel.id);
    expect(panel.hidden).toBe(true);
    await openShare();
    expect(panel.hidden).toBe(false);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    panel.querySelector<HTMLElement>('button')!.focus();
    document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(panel.hidden).toBe(true);
    expect(document.activeElement).toBe(toggle);
  });

  it('closes when the person presses outside the embed, not inside it', async () => {
    await mount();
    await openShare();
    q('.sl-share-panel')!.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(q('.sl-share-panel')!.hidden).toBe(false);
    document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    expect(q('.sl-share-panel')!.hidden).toBe(true);
  });

  it('says who can see it in words, mapped from the API scope (ruling T14, plan D11)', async () => {
    let current = info({ scope: 'workspace' });
    await mount({ getShareInfo: async () => current });
    await openShare();
    expect(q('.sl-visibility')!.textContent).toBe('Who can see this: Everyone in the workspace');
    q<HTMLButtonElement>('button.sl-share-toggle')!.click();
    current = info({ scope: 'board:brd_0000000000000001' });
    await openShare();
    expect(q('.sl-visibility')!.textContent).toBe('Who can see this: Only you');
    q<HTMLButtonElement>('button.sl-share-toggle')!.click();
    current = info({ scope: 'board:brd_0000000000000001', boardVisible: true });
    await openShare();
    expect(q('.sl-visibility')!.textContent).toBe('Who can see this: This board');
  });

  it('widens to the workspace only after an explicit confirmation, through the host', async () => {
    let current = info();
    const setScope = vi.fn(async () => { current = info({ scope: 'workspace' }); });
    const onScopeChange = vi.fn();
    await mount({ getShareInfo: async () => current, setScope, onScopeChange });
    await openShare();
    q<HTMLButtonElement>('button.sl-widen')!.click();
    expect(setScope).not.toHaveBeenCalled();
    const confirm = q<HTMLButtonElement>('button.sl-widen-confirm')!;
    expect(confirm.textContent).toBe('Show it to everyone in the workspace');
    expect(document.activeElement).toBe(confirm);
    confirm.click();
    await flush();
    expect(setScope).toHaveBeenCalledWith({ itemId: ITEM, scope: 'workspace' });
    expect(q('.sl-visibility')!.textContent).toBe('Who can see this: Everyone in the workspace');
    expect(q('button.sl-widen')).toBeNull();
    expect(onScopeChange).toHaveBeenCalledWith(expect.objectContaining({ scope: 'workspace' }));
  });

  it('Cancel leaves the scope alone', async () => {
    const setScope = vi.fn(async () => {});
    await mount({ getShareInfo: async () => info(), setScope });
    await openShare();
    q<HTMLButtonElement>('button.sl-widen')!.click();
    q<HTMLButtonElement>('button.sl-widen-cancel')!.click();
    expect(setScope).not.toHaveBeenCalled();
    expect(q('button.sl-widen-confirm')).toBeNull();
    expect(document.activeElement).toBe(q('button.sl-widen'));
  });

  it('offers widening only to a person allowed to, when the host can do it, and not twice', async () => {
    const setScope = vi.fn(async () => {});
    await mount({ getShareInfo: async () => info({ canWiden: false }), setScope });
    await openShare();
    expect(q('button.sl-widen')).toBeNull();
    el.innerHTML = '';
    await mount({ getShareInfo: async () => info() });
    await openShare();
    expect(q('button.sl-widen')).toBeNull();
    el.innerHTML = '';
    await mount({ getShareInfo: async () => info({ scope: 'workspace' }), setScope });
    await openShare();
    expect(q('button.sl-widen')).toBeNull();
  });

  it('reports a refused widening and keeps the old words', async () => {
    await mount({ getShareInfo: async () => info(), setScope: async () => { throw new Error('not_permitted'); } });
    await openShare();
    q<HTMLButtonElement>('button.sl-widen')!.click();
    q<HTMLButtonElement>('button.sl-widen-confirm')!.click();
    await flush();
    expect(q('.sl-visibility')!.textContent).toBe('Who can see this: Only you');
    expect(q('.sl-share-panel [role="status"]')!.textContent).toBe('Could not change who can see this: not_permitted');
  });

  it('the link is the app link, never a content URL, and there is no public link', async () => {
    await mount({ getShareInfo: async () => info() });
    await openShare();
    const field = q<HTMLInputElement>('input.sl-link')!;
    expect(field.value).toBe(APP_LINK);
    expect(field.readOnly).toBe(true);
    const panel = q('.sl-share-panel')!;
    expect(panel.innerHTML).not.toContain('superlibrarycontent');
    expect(panel.textContent).not.toMatch(/public/i);
  });

  it('Share… uses the system share sheet with the title and the app link', async () => {
    const share = vi.fn(async () => {});
    vi.stubGlobal('navigator', { ...navigator, share });
    const writeText = vi.fn(async () => {});
    await mount({ getShareInfo: async () => info(), clipboard: { writeText } });
    await openShare();
    q<HTMLButtonElement>('button.sl-share')!.click();
    await flush();
    expect(share).toHaveBeenCalledWith({ title: 'Q3 notes', url: APP_LINK });
    expect(writeText).not.toHaveBeenCalled();
  });

  it('Share… copies the link where there is no share sheet, and a cancelled sheet copies nothing', async () => {
    const writeText = vi.fn(async () => {});
    await mount({ clipboard: { writeText } });
    q<HTMLButtonElement>('button.sl-share')!.click();
    await flush();
    expect(writeText).toHaveBeenCalledWith(APP_LINK);
    expect(q('.sl-share-panel [role="status"]')!.textContent).toBe('Link copied');

    el.innerHTML = '';
    writeText.mockClear();
    vi.stubGlobal('navigator', { ...navigator, share: vi.fn(async () => { throw new DOMException('cancelled', 'AbortError'); }) });
    await mount({ clipboard: { writeText } });
    q<HTMLButtonElement>('button.sl-share')!.click();
    await flush();
    expect(writeText).not.toHaveBeenCalled();
  });

  it('says how to copy by hand when the clipboard refuses', async () => {
    await mount({ clipboard: { writeText: async () => { throw new Error('denied'); } } });
    q<HTMLButtonElement>('button.sl-copy')!.click();
    await flush();
    expect(q('.sl-share-panel [role="status"]')!.textContent).toBe('Copy failed. Select the link above and copy it.');
  });
});

describe('(4) Full screen', () => {
  const fs = () => q<HTMLButtonElement>('button.sl-fullscreen')!;

  it('uses the Fullscreen API on the whole embed, and the same button exits', async () => {
    const request = vi.fn(async function (this: Element) {
      Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => this });
      document.dispatchEvent(new Event('fullscreenchange'));
    });
    const exit = vi.fn(async () => {
      Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => null });
      document.dispatchEvent(new Event('fullscreenchange'));
    });
    Element.prototype.requestFullscreen = request;
    Object.defineProperty(document, 'exitFullscreen', { configurable: true, value: exit });
    try {
      await mount();
      fs().click();
      await flush();
      expect(request.mock.contexts[0]).toBe(q('.sl-embed'));
      expect(fs().getAttribute('aria-pressed')).toBe('true');
      expect(fs().getAttribute('aria-label')).toBe('Exit full screen');
      fs().click();
      await flush();
      expect(exit).toHaveBeenCalled();
      expect(fs().getAttribute('aria-pressed')).toBe('false');
      expect(document.activeElement).toBe(fs());
    } finally {
      delete (Element.prototype as Partial<Element>).requestFullscreen;
      delete (document as Partial<Document>).exitFullscreen;
      delete (document as { fullscreenElement?: unknown }).fullscreenElement;
    }
  });

  it('falls back to a fixed overlay where there is no Fullscreen API (iOS Safari); Escape exits', async () => {
    expect(Element.prototype.requestFullscreen).toBeUndefined();
    await mount();
    document.documentElement.style.overflow = 'auto';
    fs().click();
    await flush();
    const root = q('.sl-embed')!;
    expect(root.classList.contains('sl-overlay')).toBe(true);
    expect(document.documentElement.style.overflow).toBe('hidden');
    expect(fs().getAttribute('aria-pressed')).toBe('true');
    expect(document.activeElement).toBe(fs());
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(root.classList.contains('sl-overlay')).toBe(false);
    expect(document.documentElement.style.overflow).toBe('auto');
    expect(document.activeElement).toBe(fs());
  });

  it('falls back to the overlay when the browser refuses fullscreen', async () => {
    Element.prototype.requestFullscreen = vi.fn(async () => { throw new TypeError('not allowed'); });
    try {
      await mount();
      fs().click();
      await flush();
      expect(q('.sl-embed')!.classList.contains('sl-overlay')).toBe(true);
    } finally {
      delete (Element.prototype as Partial<Element>).requestFullscreen;
    }
  });

  it('destroy leaves the overlay and gives the page its scrolling back', async () => {
    const m = await mount();
    document.documentElement.style.overflow = '';
    fs().click();
    await flush();
    m.destroy();
    expect(document.documentElement.style.overflow).toBe('');
  });
});

describe('(5) Theme', () => {
  const theme = () => q<HTMLSelectElement>('select.sl-theme')!;

  it('defaults to the system theme and passes nothing in the URL', async () => {
    const m = await mount();
    expect(theme().value).toBe('system');
    expect([...theme().options].map((o) => o.textContent)).toEqual(['System', 'Light', 'Dark']);
    expect(src(m).searchParams.has('theme')).toBe(false);
    expect(q('.sl-embed')!.hasAttribute('data-theme')).toBe(false);
  });

  it('a choice is sent to the frame and remembered on this device', async () => {
    const m = await mount();
    const send = vi.spyOn(m.iframe.contentWindow!, 'postMessage');
    theme().value = 'dark';
    theme().dispatchEvent(new Event('change'));
    expect(send).toHaveBeenCalledWith({ type: 'superlibrary:theme', theme: 'dark' }, '*');
    expect(localStorage.getItem('superlibrary:theme')).toBe('dark');
    expect(q('.sl-embed')!.getAttribute('data-theme')).toBe('dark');
    theme().value = 'system';
    theme().dispatchEvent(new Event('change'));
    expect(send).toHaveBeenLastCalledWith({ type: 'superlibrary:theme', theme: 'system' }, '*');
    expect(q('.sl-embed')!.hasAttribute('data-theme')).toBe(false);
  });

  it('the remembered choice is in the first URL (no flash) and re-sent on every frame load', async () => {
    localStorage.setItem('superlibrary:theme', 'light');
    const m = await mount();
    expect(theme().value).toBe('light');
    expect(src(m).searchParams.get('theme')).toBe('light');
    const send = vi.spyOn(m.iframe.contentWindow!, 'postMessage');
    m.iframe.dispatchEvent(new Event('load'));
    expect(send).toHaveBeenCalledWith({ type: 'superlibrary:theme', theme: 'light' }, '*');
  });

  it('a host theme applies until the person chooses one; a stored nonsense value is ignored', async () => {
    localStorage.setItem('superlibrary:theme', 'purple');
    const m = await mount({ theme: 'dark' });
    expect(theme().value).toBe('dark');
    expect(src(m).searchParams.get('theme')).toBe('dark');
  });

  it('works when storage throws (private mode, blocked site data)', async () => {
    vi.spyOn(localStorage, 'getItem').mockImplementation(() => { throw new DOMException('denied', 'SecurityError'); });
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new DOMException('denied', 'SecurityError'); });
    const m = await mount();
    expect(theme().value).toBe('system');
    const send = vi.spyOn(m.iframe.contentWindow!, 'postMessage');
    theme().value = 'dark';
    theme().dispatchEvent(new Event('change'));
    expect(send).toHaveBeenCalledWith({ type: 'superlibrary:theme', theme: 'dark' }, '*');
    m.destroy();
    vi.stubGlobal('localStorage', undefined);
    await mount();
    expect(theme().value).toBe('system');
  });

  it('setTheme from the host updates the menu without overwriting the person\'s stored choice', async () => {
    localStorage.setItem('superlibrary:theme', 'light');
    const m = await mount();
    m.setTheme('dark');
    expect(theme().value).toBe('dark');
    expect(localStorage.getItem('superlibrary:theme')).toBe('light');
  });
});

describe('(6) Download', () => {
  it('a stale grant is minted again before it downloads', async () => {
    const fresh = { ...GRANT, url: `${ORIGIN}/_view?sig=F`, downloadUrl: `${ORIGIN}/s/F/a.md?download=1`, expiresAt: '2026-10-09T00:10:00.000Z' };
    const getEmbedUrl = vi.fn(async ({ version }: { version?: number }) => (version === undefined ? GRANT : fresh));
    await mount({ getEmbedUrl });
    vi.setSystemTime(new Date('2026-10-09T00:04:55.000Z'));
    const a = q<HTMLAnchorElement>('a.sl-download')!;
    // Runs after the SDK's own listener: records whether the SDK held the click back.
    const clicks: [string, boolean][] = [];
    a.addEventListener('click', (e) => { clicks.push([a.href, e.defaultPrevented]); e.preventDefault(); });
    a.dispatchEvent(new MouseEvent('click', { cancelable: true, bubbles: true }));
    await flush();
    expect(getEmbedUrl).toHaveBeenLastCalledWith({ itemId: ITEM, version: 3 });
    expect(clicks).toEqual([[GRANT.downloadUrl, true], [fresh.downloadUrl, false]]);
  });

  it('judges freshness on this device\'s clock: a clock running ahead neither loops nor re-mints', async () => {
    const skewed = { ...GRANT, expiresAt: '2026-10-08T23:00:00.000Z' }; // already "past" here
    const getEmbedUrl = vi.fn(async () => skewed);
    await mount({ getEmbedUrl });
    const seen: boolean[] = [];
    q<HTMLAnchorElement>('a.sl-download')!.addEventListener('click', (e) => { seen.push(e.defaultPrevented); e.preventDefault(); });
    q<HTMLAnchorElement>('a.sl-download')!.dispatchEvent(new MouseEvent('click', { cancelable: true, bubbles: true }));
    await flush();
    expect(seen).toEqual([false]);
    expect(getEmbedUrl).toHaveBeenCalledTimes(1);
  });

  it('a fresh grant downloads straight away', async () => {
    const getEmbedUrl = vi.fn(async () => GRANT);
    await mount({ getEmbedUrl });
    const seen: boolean[] = [];
    q<HTMLAnchorElement>('a.sl-download')!.addEventListener('click', (e) => { seen.push(e.defaultPrevented); e.preventDefault(); });
    q<HTMLAnchorElement>('a.sl-download')!.dispatchEvent(new MouseEvent('click', { cancelable: true, bubbles: true }));
    expect(seen).toEqual([false]);
    expect(getEmbedUrl).toHaveBeenCalledTimes(1);
  });
});

describe('(7) Files', () => {
  const folder = (over: Record<string, unknown> = {}) => mount({ getEmbedUrl: async () => FOLDER, ...over });
  const files = () => [...el.querySelectorAll<HTMLButtonElement>('button.sl-file')];

  it('a single file has no Files list', async () => {
    await mount();
    expect(q('.sl-files-toggle')).toBeNull();
  });

  it('lists a folder\'s files in the grant\'s order (entry first, then tree order), with sizes', async () => {
    await folder();
    const toggle = q<HTMLButtonElement>('button.sl-files-toggle')!;
    expect(toggle.getAttribute('aria-label')).toBe('Files (4)');
    toggle.click();
    expect(files().map((b) => b.querySelector('.sl-file-path')!.textContent)).toEqual(['index.html', 'a/notes.md', 'a/pic.png', 'data.csv']);
    expect(files().map((b) => b.querySelector('.sl-file-size')!.textContent)).toEqual(['900 B', '2.0 KB', '48.8 KB', '10 B']);
    expect(files()[0]!.getAttribute('aria-current')).toBe('true');
  });

  it('selecting a file opens it in the frame through /_view?path=, and the entry again without it', async () => {
    const m = await folder();
    q<HTMLButtonElement>('button.sl-files-toggle')!.click();
    files()[1]!.click();
    await flush();
    expect(m.iframe.getAttribute('src')).toBe(`${ORIGIN}/_view?sig=T&path=a%2Fnotes.md`);
    expect(files()[1]!.getAttribute('aria-current')).toBe('true');
    expect(files()[0]!.hasAttribute('aria-current')).toBe(false);
    expect(q('.sl-files-panel')!.hidden).toBe(true);
    q<HTMLButtonElement>('button.sl-files-toggle')!.click();
    files()[0]!.click();
    await flush();
    expect(m.iframe.getAttribute('src')).toBe(`${ORIGIN}/_view?sig=T`);
  });

  it('a new file starts from the initial height (an HTML page never reports one)', async () => {
    const m = await folder();
    post({ type: 'superlibrary:resize', height: 3000 }, m.iframe.contentWindow);
    q<HTMLButtonElement>('button.sl-files-toggle')!.click();
    files()[1]!.click();
    await flush();
    expect(m.iframe.style.height).toBe('480px');
  });

  it('a stale grant is minted again (same version) before opening a file', async () => {
    const getEmbedUrl = vi.fn(async ({ version }: { version?: number }) => (version === undefined ? FOLDER : { ...FOLDER, url: `${ORIGIN}/_view?sig=F`, expiresAt: '2026-10-09T00:10:00.000Z' }));
    const m = await folder({ getEmbedUrl });
    vi.setSystemTime(new Date('2026-10-09T00:06:00.000Z'));
    q<HTMLButtonElement>('button.sl-files-toggle')!.click();
    files()[3]!.click();
    await flush();
    expect(getEmbedUrl).toHaveBeenLastCalledWith({ itemId: ITEM, version: 3 });
    expect(m.iframe.getAttribute('src')).toBe(`${ORIGIN}/_view?sig=F&path=data.csv`);
  });

  it('keeps the person\'s theme in the URL of every file it opens', async () => {
    localStorage.setItem('superlibrary:theme', 'dark');
    const m = await folder();
    q<HTMLButtonElement>('button.sl-files-toggle')!.click();
    files()[3]!.click();
    await flush();
    expect(src(m).searchParams.get('path')).toBe('data.csv');
    expect(src(m).searchParams.get('theme')).toBe('dark');
  });
});

describe('(8) View source', () => {
  const source = () => q<HTMLButtonElement>('button.sl-source');

  it('toggles the frame between rendered and ?source=1 for a text-backed file', async () => {
    const m = await mount();
    expect(source()!.getAttribute('aria-pressed')).toBe('false');
    source()!.click();
    await flush();
    expect(m.iframe.getAttribute('src')).toBe(`${ORIGIN}/_view?sig=T&source=1`);
    expect(source()!.getAttribute('aria-pressed')).toBe('true');
    source()!.click();
    await flush();
    expect(m.iframe.getAttribute('src')).toBe(GRANT.url);
  });

  it('is offered for HTML, and not for kinds without text', async () => {
    await mount({ getEmbedUrl: async () => FOLDER });
    expect(source()).not.toBeNull();
    el.innerHTML = '';
    await mount({ getEmbedUrl: async () => ({ ...GRANT, entry: 'p.png', files: [{ path: 'p.png', mediaType: 'image/png', view: 'image', bytes: 9 }] }) });
    expect(source()).toBeNull();
  });

  it('follows the file chosen in Files, and shows the chosen file\'s source', async () => {
    const m = await mount({ getEmbedUrl: async () => FOLDER });
    q<HTMLButtonElement>('button.sl-files-toggle')!.click();
    el.querySelectorAll<HTMLButtonElement>('button.sl-file')[2]!.click();
    await flush();
    expect(source()).toBeNull();
    q<HTMLButtonElement>('button.sl-files-toggle')!.click();
    el.querySelectorAll<HTMLButtonElement>('button.sl-file')[3]!.click();
    await flush();
    source()!.click();
    await flush();
    expect(m.iframe.getAttribute('src')).toBe(`${ORIGIN}/_view?sig=T&path=data.csv&source=1`);
  });
});

describe('(3) Open in new window, and the toolbar\'s accessible names', () => {
  it('every control has a name a screen reader can say, even when only its icon shows', async () => {
    await mount({ getEmbedUrl: async () => FOLDER, getVersions: async () => [3, 2] });
    const names = [...el.querySelectorAll<HTMLElement>('.sl-toolbar button, .sl-toolbar a, .sl-toolbar select')].map((c) => c.getAttribute('aria-label') ?? c.textContent);
    expect(names).toEqual(['Version', 'Files (4)', 'View source', 'Theme', 'Full screen', 'Open in new window', 'Share', 'More']);
  });
});

describe('PR 3 review: full-screen overlay contains focus', () => {
  const fs = () => q<HTMLButtonElement>('button.sl-fullscreen')!;
  const tab = (target: Element, shiftKey = false) => {
    const ev = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true });
    target.dispatchEvent(ev);
    return ev;
  };
  const enter = async () => {
    fs().click();
    await flush();
  };

  it('is a named modal dialog while open, and not after', async () => {
    await mount({ title: 'Q3 notes' });
    const root = q('.sl-embed')!;
    expect(root.hasAttribute('role')).toBe(false);
    await enter();
    expect(root.getAttribute('role')).toBe('dialog');
    expect(root.getAttribute('aria-modal')).toBe('true');
    expect(root.getAttribute('aria-label')).toBe('Q3 notes, full screen');
    fs().click();
    expect(root.hasAttribute('role')).toBe(false);
    expect(root.hasAttribute('aria-modal')).toBe(false);
  });

  it('makes everything outside the embed inert at every level up to <body>, and restores only what it changed', async () => {
    document.body.innerHTML = '<header id="h">h</header><main id="m"><p id="s">s</p><section id="w"></section><aside id="a" inert>a</aside></main>';
    el = document.getElementById('w')!;
    const before = el.appendChild(document.createElement('span')); // the host's own sibling inside el
    await mount();
    const inert = (id: string) => document.getElementById(id)!.hasAttribute('inert');
    await enter();
    expect([inert('h'), inert('s'), inert('a'), before.hasAttribute('inert')]).toEqual([true, true, true, true]);
    expect([inert('m'), inert('w'), q('.sl-embed')!.hasAttribute('inert')]).toEqual([false, false, false]);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect([inert('h'), inert('s'), before.hasAttribute('inert')]).toEqual([false, false, false]);
    expect(inert('a')).toBe(true); // it was inert before; it stays so
  });

  it('Tab from the last control lands on the first; Shift+Tab from the first lands on the last', async () => {
    const m = await mount({ getVersions: async () => [3, 2] });
    await enter();
    const first = q('select.sl-versions')!;
    // The frame is the last stop: from inside it, the browser moves on to the sentinel after it.
    m.iframe.focus();
    expect(tab(m.iframe).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(first);
    expect(tab(first, true).defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(m.iframe);
    q<HTMLElement>('.sl-sentinel:not(.sl-sentinel-start)')!.focus();
    expect(document.activeElement).toBe(first);
    q<HTMLElement>('.sl-sentinel-start')!.focus();
    expect(document.activeElement).toBe(m.iframe);
    // In between, Tab is the browser's own.
    fs().focus();
    expect(tab(fs()).defaultPrevented).toBe(false);
  });

  it('Tab is left alone when the overlay is not open', async () => {
    const m = await mount();
    m.iframe.focus();
    expect(tab(m.iframe).defaultPrevented).toBe(false);
    expect(q('.sl-sentinel')).toBeNull();
  });
});

describe('PR 3 review: an expired URL is minted again', () => {
  const later = { ...FOLDER, url: `${ORIGIN}/_view?sig=F`, expiresAt: '2026-10-09T00:10:00.000Z' };
  const at = (iso: string) => vi.setSystemTime(new Date(iso));
  const expired = (m: { iframe: HTMLIFrameElement }, path: string, origin = 'null', source: MessageEventSource | null = m.iframe.contentWindow) =>
    post({ type: 'superlibrary:expired', path }, source, origin);

  it('reloads the same view (file, source, theme) from a new grant for the same version', async () => {
    localStorage.setItem('superlibrary:theme', 'dark');
    const getEmbedUrl = vi.fn(async ({ version }: { version?: number }) => (version === undefined ? FOLDER : later));
    const m = await mount({ getEmbedUrl });
    q<HTMLButtonElement>('button.sl-files-toggle')!.click();
    el.querySelectorAll<HTMLButtonElement>('button.sl-file')[3]!.click();
    await flush();
    q<HTMLButtonElement>('button.sl-source')!.click();
    await flush();
    at('2026-10-09T00:04:50.000Z');
    expired(m, 'data.csv');
    await flush();
    expect(getEmbedUrl).toHaveBeenLastCalledWith({ itemId: ITEM, version: 3 });
    expect(m.iframe.getAttribute('src')).toBe(`${ORIGIN}/_view?sig=F&path=data.csv&source=1&theme=dark`);
  });

  it('only from its own frame, with the opaque origin', async () => {
    const getEmbedUrl = vi.fn(async () => FOLDER);
    const m = await mount({ getEmbedUrl });
    at('2026-10-09T00:04:50.000Z');
    const other = document.body.appendChild(document.createElement('iframe'));
    expired(m, 'index.html', 'null', other.contentWindow);
    expired(m, 'index.html', 'https://evil.test');
    post({ type: 'superlibrary:expired', path: 7 }, m.iframe.contentWindow);
    await flush();
    expect(getEmbedUrl).toHaveBeenCalledTimes(1);
  });

  it('at most once every 10 seconds', async () => {
    const getEmbedUrl = vi.fn(async ({ version }: { version?: number }) => (version === undefined ? FOLDER : { ...later, expiresAt: '2026-10-09T00:04:56.000Z' }));
    const m = await mount({ getEmbedUrl });
    at('2026-10-09T00:04:50.000Z');
    expired(m, 'index.html');
    await flush();
    expect(getEmbedUrl).toHaveBeenCalledTimes(2);
    at('2026-10-09T00:04:55.000Z'); // the new grant is stale already, but 5 s is too soon
    expired(m, 'index.html');
    await flush();
    expect(getEmbedUrl).toHaveBeenCalledTimes(2);
    at('2026-10-09T00:05:01.000Z');
    expired(m, 'index.html');
    await flush();
    expect(getEmbedUrl).toHaveBeenCalledTimes(3);
  });

  it('ignores it while its grant is fresh: a file that fails for another reason never loops', async () => {
    const getEmbedUrl = vi.fn(async () => FOLDER);
    const m = await mount({ getEmbedUrl });
    at('2026-10-09T00:00:10.000Z');
    expired(m, 'a/pic.png');
    await flush();
    expect(getEmbedUrl).toHaveBeenCalledTimes(1);
  });

  it('a grant shorter than five minutes is stale by its own lifetime', async () => {
    const short = { ...FOLDER, expiresAt: '2026-10-09T00:00:20.000Z' };
    const getEmbedUrl = vi.fn(async ({ version }: { version?: number }) => (version === undefined ? short : later));
    const m = await mount({ getEmbedUrl });
    at('2026-10-09T00:00:21.000Z');
    expired(m, 'index.html');
    await flush();
    expect(getEmbedUrl).toHaveBeenCalledTimes(2);
  });

  it('an HTML page the frame navigated to is where it reloads; a failed image is not', async () => {
    const getEmbedUrl = vi.fn(async ({ version }: { version?: number }) => (version === undefined ? { ...FOLDER, files: [...FOLDER.files, { path: 'about.html', mediaType: 'text/html', view: 'html' as const, bytes: 5 }] } : { ...later, files: [...FOLDER.files, { path: 'about.html', mediaType: 'text/html', view: 'html' as const, bytes: 5 }] }));
    const m = await mount({ getEmbedUrl });
    at('2026-10-09T00:04:50.000Z');
    expired(m, 'about.html');
    await flush();
    expect(m.iframe.getAttribute('src')).toBe(`${ORIGIN}/_view?sig=F&path=about.html`);
    q<HTMLButtonElement>('button.sl-files-toggle')!.click();
    expect(el.querySelector('button.sl-file[aria-current] .sl-file-path')!.textContent).toBe('about.html');
    at('2026-10-09T00:10:00.000Z');
    expired(m, 'a/pic.png');
    await flush();
    expect(new URL(m.iframe.getAttribute('src')!).searchParams.get('path')).toBe('about.html');
  });
});

describe('PR 3 review: links in rendered files open through the host', () => {
  const open = (m: { iframe: HTMLIFrameElement }, url: unknown, origin = 'null', source: MessageEventSource | null = m.iframe.contentWindow) =>
    post({ type: 'superlibrary:open', url }, source, origin);

  it('opens http(s) in a new window without opener or referrer', async () => {
    const win = vi.spyOn(window, 'open').mockImplementation(() => null);
    const m = await mount();
    open(m, 'https://example.com/a?b=1');
    open(m, 'http://example.com/');
    expect(win.mock.calls).toEqual([['https://example.com/a?b=1', '_blank', 'noopener,noreferrer'], ['http://example.com/', '_blank', 'noopener,noreferrer']]);
  });

  it('never opens javascript:, data: or anything else, nor anything from another frame or origin', async () => {
    const win = vi.spyOn(window, 'open').mockImplementation(() => null);
    const m = await mount();
    for (const url of ['javascript:alert(1)', ' JavaScript:alert(1)', 'data:text/html,<script>1</script>', 'blob:https://x.test/1', 'file:///etc/passwd', '/a', 42]) open(m, url);
    const other = document.body.appendChild(document.createElement('iframe'));
    open(m, 'https://example.com/', 'null', other.contentWindow);
    open(m, 'https://example.com/', 'https://evil.test');
    expect(win).not.toHaveBeenCalled();
  });
});

describe('PR 3 review: the last version chosen wins', () => {
  const deferred = <T,>() => {
    let resolve!: (v: T) => void;
    const promise = new Promise<T>((r) => { resolve = r; });
    return { promise, resolve };
  };
  const byVersion = (v: number): EmbedGrant => ({ ...GRANT, version: v, url: `${ORIGIN}/_view?sig=V${v}` });

  it('a slow earlier switch landing last does not undo a later one', async () => {
    const slow = deferred<EmbedGrant>();
    const getEmbedUrl = vi.fn(async ({ version }: { version?: number }) => (version === 2 ? slow.promise : byVersion(version ?? 3)));
    const m = await mount({ getEmbedUrl, getVersions: async () => [3, 2, 1] });
    const two = m.setVersion(2);
    const one = await m.setVersion(1);
    slow.resolve(byVersion(2));
    expect(await two).toBe(false);
    expect(one).toBe(true);
    expect(m.iframe.getAttribute('src')).toBe(`${ORIGIN}/_view?sig=V1`);
    expect(q('.sl-version')!.textContent).toBe('v1');
    expect(q<HTMLSelectElement>('select.sl-versions')!.value).toBe('1');
  });

  it('a re-mint for a file opened on the old version, landing after a switch, is dropped', async () => {
    const slow = deferred<EmbedGrant>();
    let calls = 0;
    const getEmbedUrl = vi.fn(async ({ version }: { version?: number }) => {
      calls++;
      if (version === undefined) return FOLDER;
      if (version === 3) return slow.promise; // the stale grant's re-mint
      return byVersion(version);
    });
    const m = await mount({ getEmbedUrl, getVersions: async () => [3, 2] });
    vi.setSystemTime(new Date('2026-10-09T00:04:55.000Z'));
    q<HTMLButtonElement>('button.sl-files-toggle')!.click();
    el.querySelectorAll<HTMLButtonElement>('button.sl-file')[1]!.click();
    await m.setVersion(2);
    slow.resolve({ ...FOLDER, url: `${ORIGIN}/_view?sig=OLD` });
    await flush();
    expect(calls).toBe(3);
    expect(m.iframe.getAttribute('src')).toBe(`${ORIGIN}/_view?sig=V2`);
    expect(q('.sl-version')!.textContent).toBe('v2');
    // The dropped grant was not kept either: what opens next is still version 2's.
    q<HTMLButtonElement>('button.sl-source')!.click();
    await flush();
    expect(m.iframe.getAttribute('src')).toBe(`${ORIGIN}/_view?sig=V2&source=1`);
  });
});

describe('PR 3 review: Escape belongs to the SDK only when it acts', () => {
  it('ignores an Escape another handler already took, and one from outside the embed', async () => {
    await mount();
    q<HTMLButtonElement>('button.sl-share-toggle')!.click();
    await flush();
    const panel = q('.sl-share-panel')!;
    const taken = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    taken.preventDefault();
    q<HTMLElement>('button.sl-copy')!.dispatchEvent(taken);
    expect(panel.hidden).toBe(false);
    const outside = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.body.dispatchEvent(outside);
    expect(panel.hidden).toBe(false);
    expect(outside.defaultPrevented).toBe(false);
  });

  it('consumes the Escape it acts on', async () => {
    await mount();
    q<HTMLButtonElement>('button.sl-share-toggle')!.click();
    await flush();
    const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    q<HTMLElement>('button.sl-copy')!.dispatchEvent(ev);
    expect(q('.sl-share-panel')!.hidden).toBe(true);
    expect(ev.defaultPrevented).toBe(true);
    q<HTMLButtonElement>('button.sl-fullscreen')!.click();
    await flush();
    const ev2 = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    document.body.dispatchEvent(ev2);
    expect(ev2.defaultPrevented).toBe(true);
    expect(q('.sl-embed')!.classList.contains('sl-overlay')).toBe(false);
  });
});

describe('the toolbar on phones (operator review of phase 1): every control keeps its words', () => {
  const more = () => q<HTMLButtonElement>('button.sl-more-toggle')!;
  const panel = () => q<HTMLElement>('.sl-more-panel')!;
  it('a labelled More panel holds every secondary control, each with its words', async () => {
    await mount({ getEmbedUrl: async () => FOLDER });
    expect(more().textContent).toContain('More');
    expect(more().getAttribute('aria-controls')).toBe(panel().id);
    expect(panel().hidden).toBe(true);
    more().click();
    expect(more().getAttribute('aria-expanded')).toBe('true');
    const words = [...panel().querySelectorAll<HTMLElement>('button, a, label')].map((c) => c.textContent!.trim());
    expect(words).toEqual(['Files (4)', 'View source', expect.stringContaining('Theme'), 'Open in new window']);
    for (const s of ['.sl-files-toggle', '.sl-source', '.sl-theme-menu', '.sl-open']) expect(q(s)!.classList.contains('sl-secondary'), s).toBe(true);
    for (const s of ['.sl-version-menu', '.sl-fullscreen', '.sl-share-toggle']) expect(q(s)!.classList.contains('sl-secondary'), s).toBe(false);
  });
  it('a More item does what its toolbar control does', async () => {
    const m = await mount();
    more().click();
    [...panel().querySelectorAll('button')].find((b) => b.textContent === 'View source')!.click();
    await flush();
    expect(src(m).searchParams.get('source')).toBe('1');
    expect(panel().hidden).toBe(true);
    more().click();
    expect([...panel().querySelectorAll('a')].map((a) => a.textContent)).toEqual(['Download', 'Open in new window']);
  });
  it('the theme chosen in More is the theme chosen in the toolbar', async () => {
    await mount();
    more().click();
    const sel = panel().querySelector<HTMLSelectElement>('select')!;
    sel.value = 'dark';
    sel.dispatchEvent(new Event('change'));
    expect(q('.sl-embed')!.getAttribute('data-theme')).toBe('dark');
    expect(q<HTMLSelectElement>('select.sl-theme')!.value).toBe('dark');
  });
  it('labels are never hidden at narrow widths, and the host may set the colours and face', async () => {
    await mount();
    const css = document.getElementById('sl-embed-style')!.textContent!;
    expect(css).not.toMatch(/\.sl-toolbar \.sl-label\{position:absolute/);
    expect(css).toMatch(/@container \(max-width:640px\)\{[^}]*\.sl-toolbar \.sl-secondary\{display:none\}/);
    for (const n of ['bg', 'fg', 'muted', 'line', 'hover', 'accent', 'accent-content', 'danger']) {
      expect(css, n).toContain(`var(--sl-host-${n},`);
      expect(css, `${n} dark`).toContain(`var(--sl-host-${n}-dark,`);
    }
    expect(css).toContain('var(--sl-host-font,');
  });
});
