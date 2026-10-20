---
title: Embed
description: Mount Superlibrary's artifact viewer in another product's page with @superlibrary/embed. The host's duties, the options, the frame protocol, and which origins may embed it.
---

`@superlibrary/embed` mounts Superlibrary's viewer in a host page. The artifact renders in a
sandboxed frame on the content origin; the toolbar around it lives in the host page.

:::caution[Allowed origins]
Framing is allowed only from origins listed in configuration. The shipped configuration lists
SuperJackfruit's own Superpipeline app (`https://app.superpipeline.dev`) and AgentPod console
(`https://console.agentpod.dev`), besides Superlibrary's own app. Another host has to be added to
both lists; see [Allowed origins](#allowed-origins).
:::

The package is not published to npm. A product in another repository vendors a build: `pnpm
--filter @superlibrary/embed bundle` writes `dist/superlibrary-embed.js`, one ES module, and its
types. Record the Superlibrary commit and each file's SHA-256 beside the copy.

## Mounting

```ts
import { mountArtifact } from '@superlibrary/embed';

const api = (path: string, init: RequestInit = {}) =>
  // With the signed-in person's own token for the audience https://app.superlibrary.dev.
  fetch(`https://app.superlibrary.dev/api/v1/items/${path}`, {
    ...init,
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
  }).then((res) => res.json());

const view = await mountArtifact(el, {
  itemId: 'itm_…',
  getEmbedUrl: ({ itemId, version }) =>
    api(`${itemId}/embed`, { method: 'POST', body: JSON.stringify(version ? { version } : {}) }),
});

view.setTheme('dark');     // the host's own theme switch
await view.setVersion(2);  // false if the host could not mint it
view.destroy();
```

## The host's duties

1. **Mint with the person's own token.** `getEmbedUrl` calls `POST /api/v1/items/{id}/embed`
   with the signed-in person's token, so the API checks that person's access. Never a shared or
   service token.
2. **Be allowed.** The host's origin must be in the content Worker's `FRAME_ANCESTORS` and the
   API's `EMBED_HOSTS`, and its web client must be allowed to request the Superlibrary audience
   from the account service.

## The toolbar

| Control | What it does |
|---|---|
| **Version** | The version shown; a menu to switch when `getVersions` gives more than one |
| **Files** | For a folder: its files, entry first, with sizes |
| **View source** | For text kinds: the file as highlighted source, still sandboxed |
| **Theme** | System, Light or Dark, remembered on this device |
| **Download** | Single-file versions only |
| **Full screen** | The whole embed, as a modal dialog; Escape or the same button exits |
| **Open in new window** | The item in the Superlibrary app |
| **Share** | Who can see the item, in words; widening to the workspace for a person allowed to; copy the app link. There are no public links. |

Below 640 px of width, the secondary controls move into a labelled **More** panel. No control is
an icon alone.

## Options

| Option | Required | |
|---|---|---|
| `itemId` | yes | `itm_` + 16 hex |
| `getEmbedUrl({ itemId, version? })` | yes | Resolves to the API's `EmbedGrant`: `url`, `expiresAt`, `version`, `entry`, `files`, `downloadUrl`, `itemUrl`. Called at mount, on a version switch, and again before a grant runs out. |
| `version` | | Show this version; otherwise the newest live one |
| `getVersions({ itemId })` | | Live version numbers, for the version menu |
| `getShareInfo({ itemId })` | | `{ scope, boardVisible?, canWiden, title? }`, for the Share panel |
| `setScope({ itemId, scope: 'workspace' })` | | Widen the item, after the person confirms |
| `title` | | The frame's accessible name |
| `theme` | | `light`, `dark` or `system` (default), until the person picks one |
| `appUrl` | | Default `https://app.superlibrary.dev` |
| `height` | | Initial frame height in px; default 480 |
| `clipboard` | | Default `navigator.clipboard` |
| `onVersionChange(version)`, `onScopeChange(info)` | | Callbacks for the person's choices |
| `nonce` | | Put on the toolbar's one `<style>` element, for a strict CSP |

**Styling.** Every colour is a custom property with a host hook: `--sl-host-bg`, `-fg`, `-muted`,
`-line`, `-hover`, `-accent`, `-accent-content` and `-danger`, the same names ending in `-dark`
for dark mode, and `--sl-host-font`.

## The frame

The grant's `url` is `https://<label>.superlibrarycontent.dev/_view?sig=<token>`, on a separate
content domain with a label per item. The content Worker holds no credentials, has no API or
database, and reads storage through a type with no write methods. The URL lives five minutes; the
SDK mints a new one before it opens anything after that.

The frame is sandboxed without `allow-same-origin`. It talks to the host with `postMessage`:

| Message | Direction | |
|---|---|---|
| `superlibrary:resize` | frame to host | `{ height }`, clamped to 20,000 px. HTML artifacts do not report one. |
| `superlibrary:theme` | host to frame | `{ theme }`, sent on every load and theme change |
| `superlibrary:expired` | frame to host | A URL ran out; the SDK mints the same version again and reloads |
| `superlibrary:open` | frame to host | The person clicked an http(s) link; the SDK opens it in a new window |

The SDK accepts messages only from its own frame.

## Allowed origins

| Setting | Where | Shipped value |
|---|---|---|
| `FRAME_ANCESTORS` | content Worker | `https://app.superlibrary.dev https://app.superpipeline.dev https://console.agentpod.dev` |
| `EMBED_HOSTS` | API | `https://app.superpipeline.dev https://console.agentpod.dev` |

`EMBED_HOSTS` is `FRAME_ANCESTORS` without the app itself; a test holds the two together.
