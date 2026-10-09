# @superlibrary/embed

Mount Superlibrary's viewer in another product. The frame is sandboxed on the content origin; the
toolbar around it lives in the host page and has:

| Control | What it does |
|---|---|
| **Version** (`v3`) | The version the grant names. With more than one live version from `getVersions`, a menu that switches through `getEmbedUrl({ itemId, version })`. |
| **Files** | Folder artifacts only: the version's files, entry first, then tree order, with sizes. Choosing one opens it in the frame (`/_view?…&path=`). |
| **View source** | For text-backed kinds (HTML, SVG, Markdown, code, JSON, CSV…): the content viewer shows the file as highlighted source (`/_view?…&source=1`), still sandboxed. |
| **Theme** | System (default), Light or Dark. Remembered on this device (`localStorage` key `superlibrary:theme`), sent to the frame. |
| **Download** | Single-file versions only (a folder has none in phase 1). |
| **Full screen** | The Fullscreen API on the whole embed; a fixed overlay where there is none (iPhone Safari) or it is refused. While full screen the embed is a modal dialog (`role="dialog"`, `aria-modal`, named "<title>, full screen"): Tab and Shift+Tab wrap inside it, and the rest of the page is `inert`. The same button, or Escape, exits, and focus returns to the button. Escape works while focus is in the toolbar; keys pressed inside the frame never reach the host page, so from there the exit button is the way out. |
| **Open in new window** | `https://app.superlibrary.dev/a/<id>[/v/<n>]`. |
| **Share** | Who can see the item, in words; widening it to the workspace, for a person allowed to; **Copy link** and **Share…** (the system share sheet, or a copy where there is none). The link is always the app link, never a content URL. There are no public links. |

```ts
import { mountArtifact } from '@superlibrary/embed';

const api = (path: string, init: RequestInit = {}) =>
  // With the signed-in person's own token for the audience https://app.superlibrary.dev.
  fetch(`https://app.superlibrary.dev/api/v1/items/${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  }).then(async (res) => {
    if (!res.ok) throw new Error(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `HTTP ${res.status}`);
    return res.json();
  });

const view = await mountArtifact(el, {
  itemId: 'itm_…',
  version: 3, // optional; the newest live version otherwise
  getEmbedUrl: ({ itemId, version }) =>
    api(`${itemId}/embed`, { method: 'POST', body: JSON.stringify(version ? { version } : {}) }),
  // Optional. Live versions for the version menu.
  getVersions: async ({ itemId }) => {
    const { versions } = await api(itemId);
    return versions.filter((v: { revokedAt: string | null }) => !v.revokedAt).map((v: { version: number }) => v.version);
  },
  // Optional. Who can see it, for the Share panel.
  getShareInfo: async ({ itemId }) => {
    const { item } = await api(itemId);
    return { scope: item.scope, canWiden: personMayManage(item), title: item.title };
  },
  // Optional. Widening to the workspace (person only, audited by the API as item.scope_changed).
  setScope: ({ itemId, scope }) => api(`${itemId}/scope`, { method: 'POST', body: JSON.stringify({ scope }) }),
  theme: hostTheme, // optional: 'light' | 'dark' | 'system', until the person picks one in the toolbar
  onVersionChange: (version) => history.replaceState(null, '', `/a/${id}/v/${version}`),
  onScopeChange: (info) => refreshItem(),
});
view.setTheme('dark'); // the host's own theme switch
await view.setVersion(2); // false if the host could not mint it; the reason shows in the toolbar
view.destroy();
```

## The host's duties

1. **Mint with the person's own token.** `getEmbedUrl` calls `POST /api/v1/items/:id/embed` with
   the signed-in person's token for the audience `https://app.superlibrary.dev`, so the API checks
   that person's access. Never a shared or service token.
2. **Be allowed.** The host's origin is in the content Worker's `FRAME_ANCESTORS` and the API's
   `EMBED_HOSTS` (both vars; one test holds the two together), and its web client may request the
   Superlibrary audience in Accounts.

## Options

| Option | Required | |
|---|---|---|
| `itemId` | yes | `itm_` + 16 hex. |
| `getEmbedUrl({ itemId, version? })` | yes | Resolves to the API's `EmbedGrant` (`url`, `expiresAt`, `version`, `entry`, `files`, `downloadUrl`, `itemUrl`). Called at mount and on a version switch. It is called again, with the shown `version`, when the grant is within 15 s of its lifetime and the person opens a file, a source view or a download, and when the frame reports an expired URL. The lifetime is measured on the device's clock from when the grant arrived. When answers arrive out of order, the person's last choice wins. |
| `version` | | Show this version; the toolbar links to `/a/<id>/v/<n>`. Without it, the newest live version and `/a/<id>`. |
| `getVersions({ itemId })` | | Live version numbers. A failure only hides the menu. |
| `getShareInfo({ itemId })` | | `{ scope, boardVisible?, canWiden, title? }`, read each time Share opens. `scope` is the API's `ItemSummary.scope`. The words: `workspace` reads "Everyone in the workspace"; a `board:` item reads "Only you" (in phase 1 only its uploader can see it, plan D11), or "This board" when `boardVisible` is true (phase 3). `canWiden`: the person is the uploader or an owner. Agents never reach this, since the API refuses them (D13). |
| `setScope({ itemId, scope: 'workspace' })` | | Called after the person confirms in the panel. Then `getShareInfo` is read again. Without it, or without `canWiden`, there is no widening control. Narrowing does not exist in phase 1. |
| `title` | | The frame's accessible name and the share sheet's title (`ShareInfo.title` wins). |
| `theme` | | The host's theme, used until the person picks one on this device. Default `system`. |
| `appUrl` | | Default `https://app.superlibrary.dev`. |
| `height` | | Initial frame height in px, default 480, restored whenever the frame opens another file. HTML artifacts keep it (they report no height). |
| `clipboard` | | Default `navigator.clipboard`. If copying fails, the panel says so and selects the link for copying by hand. |
| `onVersionChange(version)` | | The person switched versions in the toolbar. |
| `onScopeChange(info)` | | The person widened the item; `info` is the fresh `ShareInfo`. |
| `nonce` | | Put on the toolbar's one `<style>` element (`#sl-embed-style`), for a host whose CSP needs it. |

The toolbar's colours are custom properties on `.sl-embed` (`--sl-bg`, `--sl-fg`, `--sl-muted`,
`--sl-line`, `--sl-hover`, `--sl-accent`, `--sl-danger`). Below 640 px of width it shows icons
only; every control keeps its accessible name.

## Frame protocol

- **URL.** The grant's `url` is `https://<label>.superlibrarycontent.dev/_view?sig=<token>`. The
  token signs only the item, version, expiry and host, so the toolbar adds `/_view` parameters
  without a new grant: `path=<file>` (absent for the entry; an HTML file answers with a redirect
  to `/s/<token>/<path>`, so its relative links keep working), `source=1` (show the file as source)
  and `theme=light|dark|system` (the initial theme, so the frame does not flash the system theme;
  the SDK leaves it out for `system`, which is the frame's default).
- **Frame to host:** `{ type: "superlibrary:resize", height }`, posted to the host origin signed
  into the token. The SDK accepts it only from its own frame (`event.source`), with origin `"null"`
  (the frame is sandboxed without `allow-same-origin`, so its origin is opaque), with a finite
  non-negative `height`, and clamps it to 20000 px (`MAX_FRAME_HEIGHT`). HTML artifacts render
  their own page and do not report a height.
- **Host to frame:** `{ type: "superlibrary:theme", theme: "light" | "dark" | "system" }`, with
  target origin `"*"` (an opaque origin cannot be named). The SDK sends it on every frame load and
  every theme change; the frame accepts it only from the signed host. Without any message, the
  frame follows the system.
- **Frame to host:** `{ type: "superlibrary:expired", path }` — a URL ran out while the frame used
  it. The content origin answers a document navigation with an expired but genuine URL (a relative
  link in an HTML page, a reload) with a small page that posts it; the viewer posts it when an
  image of the version fails, or an audio or video fails or stalls (Chromium hides a refused range
  request from the media element, which then retries and stalls instead of failing). The SDK (same `source` and `"null"` checks as resize)
  mints the same version again through `getEmbedUrl` and reloads the same view (file, source,
  theme); if the frame had moved to another HTML page of the version, it reloads that page. It acts
  only when its grant is old enough to have expired, and at most once every 10 seconds.
- **Frame to host:** `{ type: "superlibrary:open", url }` — the person clicked an http(s) link in a
  rendered file (Markdown, notebook Markdown, Graphviz node URLs). The sandbox grants no popups,
  so the SDK opens it with `window.open(url, "_blank", "noopener,noreferrer")`, and only for
  `http:` and `https:` URLs. Any page in the frame, an HTML artifact's included, may post it; the
  browser's popup blocker still applies.

The URL lives five minutes; the SDK mints a new one before it opens anything after that.
