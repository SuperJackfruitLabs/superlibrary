/**
 * @superlibrary/embed — mount Superlibrary's viewer in any product (spec §9, Embedding). The host
 * mints the URL with its own person's token; the frame needs no sign-in, so it works where
 * third-party storage is partitioned (Safari, iOS). The toolbar lives here, outside the sandbox.
 */
import { FRAME_SANDBOX, LIMITS, MAX_FRAME_HEIGHT, SOURCE_VIEWS, isExpiredMessage, isOpenMessage, isResizeMessage, isWebUrl, type EmbedGrant, type FileEntry, type Theme } from '@superlibrary/contract';
import { icon, type IconName } from './icons';
import { injectStyle } from './style';
import { formatBytes, frameUrl, storeTheme, storedTheme, visibilityWords, type FrameView, type ShareInfo } from './view';

export type { ShareInfo } from './view';
export type { Theme } from '@superlibrary/contract';

/** The frame's sandbox: the contract's, so the SDK and the content Worker's CSP cannot drift apart. */
export const SANDBOX = FRAME_SANDBOX;

export interface MountOptions {
  itemId: string;
  version?: number;
  /** The host calls POST /api/v1/items/:id/embed with ITS person's token and returns the grant. */
  getEmbedUrl: (q: { itemId: string; version?: number }) => Promise<EmbedGrant>;
  appUrl?: string;
  /** Initial px; default 480. HTML artifacts keep it (plan D18). */
  height?: number;
  clipboard?: Pick<Clipboard, 'writeText'>;
  /** Live (not revoked) version numbers for the version menu. Without it, or with one, the label has no menu. */
  getVersions?: (q: { itemId: string }) => Promise<number[]>;
  /** Who can see the item, for the Share panel. Without it the panel offers only the link. */
  getShareInfo?: (q: { itemId: string }) => Promise<ShareInfo>;
  /** Widen the item to the workspace: POST /api/v1/items/:id/scope with the person's token. Without it, no widening. */
  setScope?: (q: { itemId: string; scope: 'workspace' }) => Promise<unknown>;
  /** The item's title, for the frame's accessible name and the share sheet (ShareInfo.title wins). */
  title?: string;
  /** The host's theme, used until the person picks one in the toolbar on this device. Default 'system'. */
  theme?: Theme;
  /** The person switched versions in the toolbar. */
  onVersionChange?: (version: number) => void;
  /** The person widened the item; `info` is what getShareInfo answered afterwards. */
  onScopeChange?: (info: ShareInfo) => void;
  /** Nonce for the toolbar's one `<style>` element, for hosts whose CSP needs it. */
  nonce?: string;
}

export interface Mounted {
  iframe: HTMLIFrameElement;
  /** Apply a theme now (the host's own switch). It is not stored as the person's choice. */
  setTheme(theme: Theme): void;
  /** Show another version; false (with the reason shown in the toolbar) when the host could not mint it. */
  setVersion(version: number): Promise<boolean>;
  destroy(): void;
}

/** A grant this close to its expiry is minted again before it is used to open anything. */
const STALE_MS = 15_000;
/** An expired message reloads the frame at most this often, whatever the frame says. */
const EXPIRED_EVERY_MS = 10_000;
const TTL_MS = LIMITS.embedTtlSeconds * 1000;
const THEME_NAMES: Record<Theme, string> = { system: 'System', light: 'Light', dark: 'Dark' };
let mounts = 0;

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

function make<K extends keyof HTMLElementTagNameMap>(tag: K, props: Partial<HTMLElementTagNameMap[K]> = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

function caret(): SVGSVGElement {
  const c = icon('chevron');
  c.setAttribute('class', 'sl-icon sl-caret');
  return c;
}

const labelSpan = (text: string) => make('span', { className: 'sl-label', textContent: text });

function toolButton(cls: string, name: IconName, label: string): HTMLButtonElement {
  const b = make('button', { type: 'button', className: `sl-btn ${cls}`, title: label }, icon(name), labelSpan(label));
  b.setAttribute('aria-label', label);
  return b;
}

export async function mountArtifact(el: HTMLElement, opts: MountOptions): Promise<Mounted> {
  const { itemId } = opts;
  const [first, listed] = await Promise.all([
    opts.getEmbedUrl(opts.version === undefined ? { itemId } : { itemId, version: opts.version }),
    opts.getVersions ? opts.getVersions({ itemId }).catch(() => []) : Promise.resolve([] as number[]),
  ]);
  let grant = first;
  let explicitVersion = opts.version !== undefined;
  const versions = [...new Set([...listed, grant.version])].sort((a, b) => b - a);
  const app = (opts.appUrl ?? 'https://app.superlibrary.dev').replace(/\/+$/, '');
  const initialHeight = `${opts.height ?? 480}px`;
  let view: FrameView = { path: grant.entry, source: false, theme: storedTheme() ?? opts.theme ?? 'system' };
  let shareInfo: ShareInfo | null = null;
  const id = `sl-embed-${++mounts}`;
  const link = () => `${app}/a/${itemId}${explicitVersion ? `/v/${grant.version}` : ''}`;
  const files = (): FileEntry[] => grant.files ?? [];
  const isFolder = () => files().length > 1;
  const current = () => files().find((f) => f.path === view.path);

  injectStyle(document, opts.nonce);
  const root = make('div', { className: 'sl-embed' });
  const bar = make('div', { className: 'sl-toolbar' });
  bar.setAttribute('role', 'toolbar');
  bar.setAttribute('aria-label', 'Artifact');
  const errorEl = make('p', { className: 'sl-error', hidden: true });
  errorEl.setAttribute('role', 'alert');

  // (1) Version label, with a menu when the host lists more than one live version.
  const versionEl = make('span');
  const versionLabel = make('span', { className: 'sl-version' });
  const versionSelect = make('select', { className: 'sl-versions' });
  versionSelect.setAttribute('aria-label', 'Version');
  versionSelect.addEventListener('change', () => void setVersion(Number(versionSelect.value)));
  const renderVersion = () => {
    versionLabel.textContent = `v${grant.version}`;
    if (versions.length < 2) {
      versionEl.className = 'sl-btn sl-version-menu';
      versionEl.replaceChildren(versionLabel);
      return;
    }
    versionSelect.replaceChildren(...versions.map((v, i) => make('option', { value: String(v), textContent: `v${v}${i === 0 ? ' (latest)' : ''}` })));
    versionSelect.value = String(grant.version);
    versionEl.className = 'sl-select sl-version-menu';
    versionEl.title = 'Version';
    if (!versionEl.contains(versionSelect)) versionEl.replaceChildren(versionLabel, caret(), versionSelect);
  };

  // (7) Files, (8) View source.
  const filesToggle = toolButton('sl-files-toggle', 'files', 'Files');
  const filesPanel = make('div', { className: 'sl-panel sl-files-panel', id: `${id}-files`, hidden: true });
  const sourceBtn = toolButton('sl-source', 'source', 'View source');
  // (5) Theme.
  const themeSelect = make('select', { className: 'sl-theme' });
  themeSelect.setAttribute('aria-label', 'Theme');
  themeSelect.append(...(['system', 'light', 'dark'] as const).map((t) => make('option', { value: t, textContent: THEME_NAMES[t] })));
  const themeLabel = labelSpan('');
  const themeEl = make('span', { className: 'sl-select sl-theme-menu', title: 'Theme' }, icon('theme'), themeLabel, caret(), themeSelect);
  // (6) Download, (4) Full screen, (3) Open in new window, (2) Share.
  const download = make('a', { className: 'sl-btn sl-download', rel: 'noopener noreferrer', title: 'Download' }, icon('download'), labelSpan('Download'));
  download.setAttribute('aria-label', 'Download');
  const fsBtn = toolButton('sl-fullscreen', 'maximize', 'Full screen');
  const open = make('a', { className: 'sl-btn sl-open', target: '_blank', rel: 'noopener noreferrer', title: 'Open in new window' }, icon('open'), labelSpan('Open in new window'));
  open.setAttribute('aria-label', 'Open in new window');
  const shareToggle = toolButton('sl-share-toggle', 'share', 'Share');
  const sharePanel = make('div', { className: 'sl-panel sl-share-panel', id: `${id}-share`, hidden: true });
  for (const [toggle, panel] of [[filesToggle, filesPanel], [shareToggle, sharePanel]] as const) {
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', panel.id);
  }

  const iframe = document.createElement('iframe');
  iframe.className = 'sl-frame';
  iframe.setAttribute('sandbox', SANDBOX);
  iframe.setAttribute('referrerpolicy', 'no-referrer');
  iframe.setAttribute('title', opts.title ?? 'Superlibrary artifact');
  iframe.style.height = initialHeight;

  root.append(bar, errorEl, filesPanel, sharePanel, iframe);

  const showError = (text: string | null) => {
    errorEl.textContent = text ?? '';
    errorEl.hidden = text === null;
  };

  /** Lay the toolbar out for the current grant and file; keeps focus on a control that stays. */
  const renderBar = () => {
    const active = document.activeElement as HTMLElement | null;
    const sourceable = current() !== undefined && SOURCE_VIEWS.has(current()!.view);
    const n = files().length;
    filesToggle.setAttribute('aria-label', `Files (${n})`);
    filesToggle.title = `Files (${n})`;
    filesToggle.querySelector('.sl-label')!.textContent = `Files (${n})`;
    sourceBtn.setAttribute('aria-pressed', String(view.source));
    if (grant.downloadUrl) download.href = grant.downloadUrl;
    open.href = link();
    const children: HTMLElement[] = [versionEl];
    if (isFolder()) children.push(filesToggle);
    if (sourceable) children.push(sourceBtn);
    children.push(make('span', { className: 'sl-spacer' }), themeEl);
    if (grant.downloadUrl) children.push(download); // D6: folders have no download in phase 1
    children.push(fsBtn, open, shareToggle);
    bar.replaceChildren(...children);
    if (!isFolder() && openPanel?.panel === filesPanel) closePanel(false);
    if (active && active !== document.activeElement && active.isConnected) active.focus();
  };

  const renderFiles = () => {
    const list = make('ul');
    for (const f of files()) {
      const b = make('button', { type: 'button', className: 'sl-file' }, make('span', { className: 'sl-file-path', textContent: f.path }), make('span', { className: 'sl-file-size', textContent: formatBytes(f.bytes) }));
      if (f.path === view.path) b.setAttribute('aria-current', 'true');
      b.addEventListener('click', () => {
        closePanel(true);
        void show({ path: f.path, source: false });
      });
      list.append(make('li', {}, b));
    }
    filesPanel.replaceChildren(list);
  };

  // --- Grant freshness: the URL lives five minutes; anything opened after that needs a new one.
  // Its age is measured on this device's clock from when the grant arrived, never by comparing
  // `expiresAt` (the server's clock) with now. The lifetime is `expiresAt` minus that arrival when
  // it is plausible (5 s to 5 min), else five minutes: a clock far ahead or behind cannot make every
  // grant look stale, so nothing loops.
  let receivedAt = Date.now();
  const lifetime = () => {
    const l = Date.parse(grant.expiresAt) - receivedAt;
    return l >= 5000 && l <= TTL_MS ? l : TTL_MS;
  };
  const stale = () => Date.now() - receivedAt >= lifetime() - STALE_MS;
  const accept = (g: EmbedGrant) => {
    grant = g;
    receivedAt = Date.now();
  };
  // Every person's choice (a version, a file, source) takes a ticket; a grant that arrives for an
  // older ticket is dropped, so the last choice wins whatever order the host answers in.
  let epoch = 0;
  /** The grant to use for ticket `mine`, minted again if stale; null if a later choice superseded it. */
  const fresh = async (mine: number): Promise<EmbedGrant | null> => {
    if (!stale()) return grant;
    const g = await opts.getEmbedUrl({ itemId, version: grant.version });
    if (mine !== epoch) return null;
    accept(g);
    renderBar();
    return grant;
  };

  /** Point the frame at a view of the current version. */
  const show = async (next: Partial<FrameView>): Promise<void> => {
    const mine = ++epoch;
    let g: EmbedGrant | null;
    try {
      g = await fresh(mine);
    } catch (e) {
      if (mine === epoch) showError(`This could not be opened: ${message(e)}`);
      return;
    }
    if (!g || mine !== epoch) return;
    const before = view;
    view = { ...view, ...next };
    showError(null);
    iframe.setAttribute('src', frameUrl(g, view));
    iframe.style.height = initialHeight; // a new document reports its own height; HTML never does
    if (before.path !== view.path) {
      renderFiles();
      renderBar();
    } else {
      sourceBtn.setAttribute('aria-pressed', String(view.source));
    }
  };

  const setVersion = async (n: number): Promise<boolean> => {
    const mine = ++epoch;
    if (n === grant.version) {
      renderVersion();
      return true;
    }
    let g: EmbedGrant;
    try {
      g = await opts.getEmbedUrl({ itemId, version: n });
    } catch (e) {
      if (mine !== epoch) return false;
      showError(`Version ${n} could not be opened: ${message(e)}`);
      renderVersion();
      return false;
    }
    if (mine !== epoch) return false;
    accept(g);
    explicitVersion = true;
    if (!versions.includes(g.version)) {
      versions.push(g.version);
      versions.sort((a, b) => b - a);
    }
    view = { ...view, path: g.entry, source: false };
    showError(null);
    iframe.setAttribute('src', frameUrl(g, view));
    iframe.style.height = initialHeight;
    renderVersion();
    renderFiles();
    renderBar();
    shareLink.value = link();
    opts.onVersionChange?.(g.version);
    return true;
  };

  sourceBtn.addEventListener('click', () => void show({ source: !view.source }));

  download.addEventListener('click', (e) => {
    if (!stale()) return;
    e.preventDefault();
    fresh(epoch).then(
      (g) => {
        if (g?.downloadUrl && !stale()) download.click(); // never a click loop
      },
      (err: unknown) => showError(`The download could not start: ${message(err)}`),
    );
  });

  // --- Theme (5): the person's choice on this device, else the host's, else the system's.
  const postTheme = () => iframe.contentWindow?.postMessage({ type: 'superlibrary:theme', theme: view.theme }, '*');
  const applyTheme = (t: Theme) => {
    view = { ...view, theme: t };
    themeSelect.value = t;
    themeLabel.textContent = THEME_NAMES[t];
    if (t === 'system') root.removeAttribute('data-theme');
    else root.setAttribute('data-theme', t);
    // An opaque origin cannot be named as a targetOrigin; the frame checks the sender (viewer/protocol.ts).
    postTheme();
  };
  themeSelect.addEventListener('change', () => {
    const t = themeSelect.value as Theme;
    storeTheme(t);
    applyTheme(t);
  });
  iframe.addEventListener('load', postTheme);

  // --- Panels (2, 7): disclosures under the toolbar, one open at a time.
  let openPanel: { toggle: HTMLButtonElement; panel: HTMLElement } | null = null;
  function closePanel(focusToggle: boolean) {
    if (!openPanel) return;
    const { toggle, panel } = openPanel;
    openPanel = null;
    panel.hidden = true;
    toggle.setAttribute('aria-expanded', 'false');
    if (focusToggle) toggle.focus();
  }
  const togglePanel = (toggle: HTMLButtonElement, panel: HTMLElement, focusFirst: () => HTMLElement | null) => {
    const wasOpen = openPanel?.panel === panel;
    closePanel(false);
    if (wasOpen) return;
    openPanel = { toggle, panel };
    panel.hidden = false;
    toggle.setAttribute('aria-expanded', 'true');
    focusFirst()?.focus();
  };
  filesToggle.addEventListener('click', () => togglePanel(filesToggle, filesPanel, () => filesPanel.querySelector('[aria-current]')));

  // --- Share (2): visibility in words, widen to the workspace, the app link. Never a content URL, never public.
  const visibility = make('p', { className: 'sl-visibility', hidden: !opts.getShareInfo });
  const widenBox = make('div', { className: 'sl-row' });
  const shareLink = make('input', { className: 'sl-link', readOnly: true, value: link() });
  shareLink.setAttribute('aria-label', 'Link');
  const copyBtn = make('button', { type: 'button', className: 'sl-copy', textContent: 'Copy link' });
  const shareBtn = make('button', { type: 'button', className: 'sl-share', textContent: 'Share…' });
  const status = make('p', { className: 'sl-status' });
  status.setAttribute('role', 'status');
  sharePanel.append(visibility, widenBox, shareLink, make('div', { className: 'sl-row' }, copyBtn, shareBtn), make('p', { className: 'sl-muted', textContent: 'People sign in to Superlibrary to open the link, and see it only if they are allowed to.' }), status);

  const renderShare = (info: ShareInfo | null) => {
    if (info) visibility.replaceChildren('Who can see this: ', make('strong', { textContent: visibilityWords(info) }));
    widenBox.replaceChildren();
    if (!info || !opts.setScope || !info.canWiden || info.scope === 'workspace') return;
    const widen = make('button', { type: 'button', className: 'sl-widen', textContent: 'Show to everyone in the workspace…' });
    widen.addEventListener('click', () => {
      const confirm = make('button', { type: 'button', className: 'sl-widen-confirm sl-primary', textContent: 'Show it to everyone in the workspace' });
      const cancel = make('button', { type: 'button', className: 'sl-widen-cancel', textContent: 'Cancel' });
      cancel.addEventListener('click', () => {
        renderShare(shareInfo);
        widenBox.querySelector<HTMLElement>('.sl-widen')?.focus();
      });
      confirm.addEventListener('click', () => void widenToWorkspace(confirm));
      widenBox.replaceChildren(make('p', { textContent: 'Everyone in the workspace will be able to find and open it. This cannot be undone here.' }), confirm, cancel);
      confirm.focus();
    });
    widenBox.append(widen);
  };

  let shareLoad = 0;
  const loadShare = async () => {
    if (!opts.getShareInfo) return;
    const mine = ++shareLoad;
    visibility.textContent = 'Checking who can see this…';
    try {
      const info = await opts.getShareInfo({ itemId });
      if (mine !== shareLoad) return;
      shareInfo = info;
      renderShare(info);
    } catch (e) {
      if (mine === shareLoad) visibility.textContent = `Who can see this could not be checked: ${message(e)}`;
    }
  };

  async function widenToWorkspace(confirm: HTMLButtonElement) {
    confirm.disabled = true;
    status.textContent = 'Changing who can see this…';
    try {
      await opts.setScope!({ itemId, scope: 'workspace' });
      const info = await opts.getShareInfo!({ itemId });
      shareInfo = info;
      renderShare(info);
      status.textContent = 'Everyone in the workspace can see it now.';
      opts.onScopeChange?.(info);
    } catch (e) {
      renderShare(shareInfo);
      status.textContent = `Could not change who can see this: ${message(e)}`;
    }
  }

  const copyLink = async () => {
    const clipboard = opts.clipboard ?? (typeof navigator !== 'undefined' ? navigator.clipboard : undefined);
    try {
      if (!clipboard) throw new Error('no clipboard');
      await clipboard.writeText(link());
      status.textContent = 'Link copied';
    } catch {
      status.textContent = 'Copy failed. Select the link above and copy it.';
      shareLink.select();
    }
  };
  copyBtn.addEventListener('click', () => void copyLink());
  shareBtn.addEventListener('click', async () => {
    if (typeof navigator.share !== 'function') return copyLink();
    try {
      await navigator.share({ title: shareInfo?.title ?? opts.title ?? 'Superlibrary artifact', url: link() });
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return; // the person closed the sheet
      await copyLink();
    }
  });
  shareToggle.addEventListener('click', () => {
    status.textContent = '';
    togglePanel(shareToggle, sharePanel, () => copyBtn);
    if (openPanel?.panel === sharePanel) void loadShare();
  });

  // --- Full screen (4): the Fullscreen API on the whole embed; a fixed overlay where it is missing
  // or refused (iPhone Safari has no element fullscreen). The same button exits; so does Escape.
  let overlay = false;
  let nativeOn = false;
  let savedOverflow = '';
  const docEl = document.documentElement;
  type WebkitDoc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void };
  type WebkitEl = HTMLElement & { webkitRequestFullscreen?: () => void };
  const nativeElement = () => document.fullscreenElement ?? (document as WebkitDoc).webkitFullscreenElement ?? null;
  // While full screen the embed is a modal dialog: focus stays inside it (Tab wraps; a sentinel
  // after the frame catches Tab out of the frame, one before the toolbar catches Shift+Tab where a
  // browser skips the first control, as WebKit does without full keyboard access), and everything
  // else on the page is inert.
  const sentinel = make('span', { className: 'sl-sentinel', tabIndex: 0 });
  const sentinelStart = make('span', { className: 'sl-sentinel sl-sentinel-start', tabIndex: 0 });
  const tabbables = () =>
    [...root.querySelectorAll<HTMLElement>('button, a[href], select, input, iframe')].filter(
      (c) => !c.closest('[hidden]') && !(c as HTMLButtonElement).disabled,
    );
  sentinel.addEventListener('focus', () => tabbables()[0]?.focus());
  sentinelStart.addEventListener('focus', () => tabbables().at(-1)?.focus());
  let inerted: Element[] = [];
  let contained = false;
  const contain = (on: boolean) => {
    if (on === contained) return;
    contained = on;
    if (on) {
      root.setAttribute('role', 'dialog');
      root.setAttribute('aria-modal', 'true');
      root.setAttribute('aria-label', `${opts.title ?? 'Superlibrary artifact'}, full screen`);
      root.prepend(sentinelStart);
      root.append(sentinel);
      for (let n: Element = root; n !== document.body && n.parentElement; n = n.parentElement) {
        for (const sib of n.parentElement.children) {
          if (sib === n || sib.hasAttribute('inert')) continue;
          sib.setAttribute('inert', '');
          inerted.push(sib);
        }
      }
    } else {
      for (const a of ['role', 'aria-modal', 'aria-label']) root.removeAttribute(a);
      sentinel.remove();
      sentinelStart.remove();
      for (const sib of inerted) sib.removeAttribute('inert');
      inerted = [];
    }
  };
  const syncFullscreen = () => {
    const on = overlay || nativeElement() === root;
    contain(on);
    const label = on ? 'Exit full screen' : 'Full screen';
    fsBtn.setAttribute('aria-pressed', String(on));
    fsBtn.setAttribute('aria-label', label);
    fsBtn.title = label;
    fsBtn.replaceChildren(icon(on ? 'minimize' : 'maximize'), labelSpan(label));
  };
  const enterFullscreen = async () => {
    const request = root.requestFullscreen ?? (root as WebkitEl).webkitRequestFullscreen;
    if (typeof request === 'function') {
      try {
        await request.call(root);
        return;
      } catch {
        // Refused (a host frame without allowfullscreen, no user activation): use the overlay.
      }
    }
    overlay = true;
    savedOverflow = docEl.style.overflow;
    docEl.style.overflow = 'hidden';
    root.classList.add('sl-overlay');
    syncFullscreen();
    fsBtn.focus();
  };
  const leaveOverlay = () => {
    overlay = false;
    root.classList.remove('sl-overlay');
    docEl.style.overflow = savedOverflow;
    syncFullscreen();
  };
  const exitFullscreen = () => {
    if (nativeElement() === root) {
      const exit = document.exitFullscreen ?? (document as WebkitDoc).webkitExitFullscreen;
      void exit?.call(document);
    } else if (overlay) {
      leaveOverlay();
      fsBtn.focus();
    }
  };
  fsBtn.addEventListener('click', () => (overlay || nativeElement() === root ? exitFullscreen() : void enterFullscreen()));
  const onFullscreenChange = () => {
    const on = nativeElement() === root;
    syncFullscreen();
    if (nativeOn && !on) fsBtn.focus();
    nativeOn = on;
  };
  document.addEventListener('fullscreenchange', onFullscreenChange);
  document.addEventListener('webkitfullscreenchange', onFullscreenChange);

  const onKey = (e: KeyboardEvent) => {
    if (e.defaultPrevented || !root.isConnected) return;
    if (e.key === 'Tab' && contained) {
      const stops = tabbables();
      const first = stops[0];
      const last = stops.at(-1);
      const active = document.activeElement;
      if (!first || !last) return;
      if (!e.shiftKey && (active === last || !root.contains(active))) {
        e.preventDefault();
        first.focus();
      } else if (e.shiftKey && (active === first || !root.contains(active))) {
        e.preventDefault();
        last.focus();
      }
      return;
    }
    if (e.key !== 'Escape') return;
    // Document-wide only for the overlay; a panel answers an Escape from inside the embed. Focus in
    // the frame never reaches here: the toolbar's exit button is the way out from there.
    const inside = e.target instanceof Node && root.contains(e.target);
    if (openPanel && inside) {
      e.preventDefault();
      closePanel(true);
    } else if (overlay) {
      e.preventDefault();
      exitFullscreen();
    }
  };
  const onPointer = (e: Event) => {
    if (openPanel && e.target instanceof Node && !root.contains(e.target)) closePanel(false);
  };
  document.addEventListener('keydown', onKey);
  document.addEventListener('pointerdown', onPointer);

  // The frame's origin is opaque, so its messages arrive with origin "null": identity is the
  // frame's own window (plan D18). Anything else is ignored.
  const onMessage = (e: MessageEvent) => {
    if (e.source !== iframe.contentWindow || e.origin !== 'null') return;
    if (isResizeMessage(e.data)) iframe.style.height = `${Math.min(Math.ceil(e.data.height), MAX_FRAME_HEIGHT)}px`;
    // The sandbox grants no popups (spec §9), so a link in a rendered file asks the host. Only
    // http(s): never javascript:, data: or anything else a file could name.
    else if (isOpenMessage(e.data) && isWebUrl(e.data.url)) window.open(e.data.url, '_blank', 'noopener,noreferrer');
    else if (isExpiredMessage(e.data)) void onExpired(e.data.path);
  };

  // A URL ran out while the frame used it (a relative link, a media range request, a late image):
  // mint the same version again and reload the same view. Only for a grant old enough to have
  // expired, and at most once every 10 s, so a file that fails for another reason cannot loop.
  let lastExpiredReload = -Infinity;
  const onExpired = async (path: string) => {
    if (!stale() || Date.now() - lastExpiredReload < EXPIRED_EVERY_MS) return;
    lastExpiredReload = Date.now();
    const mine = epoch;
    let g: EmbedGrant;
    try {
      g = await opts.getEmbedUrl({ itemId, version: grant.version });
    } catch (err) {
      if (mine === epoch) showError(`This could not be opened again: ${message(err)}`);
      return;
    }
    if (mine !== epoch) return;
    accept(g);
    // An HTML page can move to another page of the version by itself; reload where it was.
    const moved = files().find((f) => f.path === path && f.view === 'html' && path !== view.path);
    if (moved) view = { ...view, path: moved.path, source: false };
    iframe.setAttribute('src', frameUrl(g, view));
    iframe.style.height = initialHeight;
    renderFiles();
    renderBar();
  };
  window.addEventListener('message', onMessage);

  renderVersion();
  renderFiles();
  renderBar();
  syncFullscreen();
  applyTheme(view.theme);
  iframe.setAttribute('src', frameUrl(grant, view));
  el.append(root);

  return {
    iframe,
    setTheme: (theme) => applyTheme(theme),
    setVersion,
    destroy: () => {
      window.removeEventListener('message', onMessage);
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('fullscreenchange', onFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', onFullscreenChange);
      if (overlay) leaveOverlay();
      contain(false);
      if (nativeElement() === root) exitFullscreen();
      root.remove();
    },
  };
}
