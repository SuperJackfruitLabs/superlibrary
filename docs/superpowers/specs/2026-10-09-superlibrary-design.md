# Superlibrary: design

**Status:** draft for operator review, 2026-10-09. The decisions taken so far are in §12.
**Product:** Superlibrary — everything your agents make, kept and viewable.
**Domains:**
- `superlibrary.dev`: the product, with the app at `app.superlibrary.dev` and docs at
  `docs.superlibrary.dev`.
- `superlibrarycontent.dev`: the sandbox for untrusted content. Nothing with a login is ever
  served from this domain.

## 1. Problem

Agents write reports, designs, screenshots, web pages and data files in their workspaces. Until
now nothing could hold them:
- **Superpipeline stores no content.** `superpipeline_add_reference` takes only a URL ("publish the
  document first").
- **AgentPod can read a workspace, but only live**, while the station is up.

So agents published their work elsewhere: as gists under the operator's personal GitHub account,
because the agent host's `gh` was signed in as them. On 2026-10-03 and 2026-10-04 that produced two
public gists of internal material. The gists have since been made secret and `gh` removed from the
host. The gap remains.

Superlibrary is where agent-made work is kept: private to the workspace, attributed to the agent
and run that made it, versioned, durable, and viewable in the browser. That includes interactive
pages, in the same way a chat assistant's artifacts are.

## 2. Product shape

**Artifact**
- An immutable snapshot of one file or one folder, with a title, a kind, its source, who made
  it, and a version history.
- Linking the same path again creates version *n+1*. The link shows the latest version, with a
  history.
- Every version is content-addressed by SHA-256. Identical bytes are stored once.

**Library**
- Each workspace has one. You browse it by project, card, station, agent, kind and date, and
  search titles and text content.
- **Collections** group artifacts across sources, for example "Building in public — week 41".

**Sources**
- Where artifacts come from. The first source is an **AgentPod station workspace**.
- Later sources: direct upload by a person, Superpipeline card attachments, Superwitness evidence
  and Supermessage files. Each source is a small adapter that hands Superlibrary the bytes plus
  their provenance.

**Consumers**
- Superpipeline cards show inline previews.
- Supermessage shows a link card.
- The AgentPod console links from a station's files.

## 3. Architecture

Superlibrary is Cloudflare-native, like Superpipeline:

| Part | Runs on | Role |
|---|---|---|
| `apps/api` | Worker, with D1 and R2 | REST and MCP API. Metadata in D1; blobs in a private R2 bucket keyed by SHA-256. Verifies organization-plane tokens offline (audience `https://app.superlibrary.dev`). |
| `apps/web` | Pages (SvelteKit) | The library and viewer at `app.superlibrary.dev`. Signs in through accounts.superjackfruit.com, with PKCE and tokens held in memory, as the AgentPod console does. |
| `apps/content` | Worker on `*.superlibrarycontent.dev` | Serves artifact bytes only, with a short-lived signed URL. One subdomain per artifact. No cookies, no auth state, no API. |
| `packages/contract` | — | Zod schemas shared with AgentPod and Superpipeline. |

The organization plane registers Superlibrary as a product: an audience, web and CLI clients, an
entitlement (`superlibrary` in `ent`), and scopes `artifacts:read`, `artifacts:write` and
`artifacts:admin`. A workspace without the entitlement gets `403 product_not_enabled`, like every
other product.

## 4. Flows

### An agent links a file

The first source is AgentPod.

1. The agent calls the AgentPod MCP tool `agentpod_link_artifact { path, title?, kind?, entry? }`.
   `entry` is for folders, for example `index.html`.
2. The AgentPod hub identifies the caller's station from its run-scoped token, which is the only
   station it may read. It reads the bytes through the node's `fs.read`, extended with `offset` for
   chunked reads.
3. The hub applies the source-side guardrails (§7), then calls Superlibrary
   `POST /v1/artifacts` with its service credential. It passes `act` = the agent's principal, plus
   the provenance: workspace, station, path, run and card, and the file's sha256.
4. Superlibrary runs the content checks (§7), stores the bytes and returns
   `{ artifactId, version, url, sha256, mediaType, bytes }`. The URL is
   `https://app.superlibrary.dev/a/<artifactId>`.
5. The agent attaches the URL with `superpipeline_add_reference`. Superpipeline recognises the
   `superlibrary` provider and renders a preview.

### A person

- Uploads a file directly in the app, or with `slib upload`.
- Links a station file with `fleet artifacts link --station ID --path P`, or with **Link this
  file** in the console's file panel. Both go through the same hub path as the agent.
- Manages artifacts with `slib` or `fleet artifacts`: `list`, `show`, `versions`, `revoke`,
  `expire`, `collect`.

### A viewer

1. A person opens `app.superlibrary.dev/a/<id>[/v/<n>]`. The page shows the title, provenance,
   version history, hash and size, and the preview.
2. For kinds that run in the sandbox, the web app asks the API for a five-minute signed URL bound
   to that one artifact version.
3. It embeds that URL from `<artifactId>.superlibrarycontent.dev` in a sandboxed frame (§6).

## 5. File types

The type is decided by sniffing the bytes; the extension is not trusted.

| Kind | Shown as |
|---|---|
| **HTML**, including multi-file apps with their own JS, CSS and images | Interactive, sandboxed |
| **Markdown** | Rendered: tables, task lists, highlighted code, Mermaid, images from the same folder |
| **Images** (PNG, JPEG, GIF, WebP, AVIF) | Inline, zoomable |
| **SVG** | As an image only, so its scripts cannot run; the source is available |
| **PDF** | A viewer, in the sandbox |
| **Code, text and logs** | Syntax-highlighted, paged when large |
| **JSON, YAML, TOML** | A readable structured view, plus raw |
| **CSV and TSV** | A sortable table (first 5,000 rows), plus download |
| **Notebooks** (`.ipynb`) | Cells and saved outputs; nothing is executed |
| **Diagrams** (Mermaid, Graphviz) | Rendered, plus source |
| **Audio and video** | Native players |
| **Office files** (DOCX, XLSX, PPTX) | Download; a text preview in phase 2 |
| **Anything else** (archives, binaries) | Download, with type, size and hash shown |

## 6. Running untrusted HTML safely

1. **A separate site.** `superlibrarycontent.dev` shares no cookies, storage or same-site
   relationship with `superlibrary.dev`, the AgentPod console, Superpipeline or Accounts. It never
   serves anything with a login.
2. **One subdomain per artifact.** The content Worker uses a wildcard route,
   `<artifactId>.superlibrarycontent.dev`.
3. **A sandboxed frame:**

   ```html
   <iframe sandbox="allow-scripts allow-popups-to-escape-sandbox" referrerpolicy="no-referrer">
   ```

   Without `allow-same-origin`, each frame runs in a unique, opaque origin. There is no
   `allow-forms`, `allow-top-navigation` or `allow-modals`.
4. **CSP on the content origin:**
   - `default-src 'none'`;
   - scripts, styles, images, fonts and media from `'self'`, `data:` and `blob:`, and from the
     trusted CDNs only: `https://cdnjs.cloudflare.com`, `https://cdn.jsdelivr.net`,
     `https://unpkg.com`, plus `https://fonts.googleapis.com` and `https://fonts.gstatic.com` for
     styles and fonts;
   - `connect-src 'none'`, so pages cannot fetch, send data out or open sockets;
   - `frame-ancestors https://app.superlibrary.dev`;
   - no `form-action`.
5. **Access through signed URLs, never cookies.** A URL lasts 5 minutes, covers one artifact
   version, and is minted only after the viewer's permission is checked.
6. **Headers:**
   - `X-Content-Type-Options: nosniff`;
   - `Cross-Origin-Resource-Policy: same-site`;
   - `Cross-Origin-Opener-Policy: same-origin`;
   - `Content-Disposition: attachment` for every kind that is not rendered.

## 7. Guardrails

**Who can create**
- An agent can create artifacts only from its own station, identified by its token. The tool has
  no station argument.
- A person can create artifacts from stations they can read, or by direct upload into a workspace
  where they hold `artifacts:write`.
- Agents cannot use direct upload in v1. Everything an agent stores comes from its own workspace,
  with provenance.

**What can be linked** (checked by the source, and again by Superlibrary for direct uploads)
- Paths must stay inside the workspace root. `..` is refused, and so is a symlink that leaves the
  root.
- Refused by default:
  - `.env*`, `.ssh/`, `.gnupg/`;
  - `*.pem`, `*.key`, `id_*`;
  - `.git/` internals;
  - `.netrc`, `.npmrc`, `.pypirc`;
  - cloud credential files;
  - each harness's own config, session and token files (taken from its descriptor).
- Size limits: 25 MB per file; 100 MB and 500 files per folder; 1 GB stored per workspace by
  default, configurable.
- A **secret scan** runs before anything is stored. It looks for token-shaped strings (AWS,
  GitHub, Slack, OpenAI, Anthropic, signed JWTs, PEM blocks, high-entropy assignments). A hit is
  refused, naming the file and line. An operator can override one artifact, and the override is
  recorded.

**Who can view**
- Signed-in members of the artifact's workspace with `artifacts:read`. This is checked on every
  view, and every view is audited.
- No anonymous links in v1.

**Lifecycle**
- Revoke one artifact or one version, or set an expiry.
- **Removing a station or node keeps its artifacts.** They are marked "from a removed station" and
  stay viewable to the workspace.
- Revoking every artifact from a station is a separate, explicit action. Node removal offers it as
  a checkbox, off by default.
- Retention: artifacts a card references, or that sit in a collection, are kept. Everything else
  is deleted after **30 days**.

## 8. Availability

The bytes are copied when an artifact is created, so viewing never depends on the station.

| Situation | Existing artifacts | Creating new ones | "Changed since linked" |
|---|---|---|---|
| Station stopped, or node offline or asleep | work | refused, "station unavailable" | "can't check right now" |
| File edited, moved or deleted | show the frozen version | linking again creates a new version | "changed" or "no longer there" |
| Workspace cleaned, or runtime destroyed | work | refused | "no longer there" |
| Station or node removed | work, marked removed | refused | — |
| AgentPod hub down | work, since viewing goes straight to Superlibrary | refused, because station sources need the hub | — |
| Superlibrary or R2 down | unavailable until it recovers | refused | — |

## 9. Changes in other repositories

**accounts**
- Product registry entry, audience, web and CLI clients.
- The `superlibrary` entitlement and `artifacts:*` scopes.
- The AgentPod hub's service grant to create artifacts on an agent's behalf.

**agentpod**
- `fs.read` gains `offset`.
- A folder manifest walk that honours the guardrails.
- The `agentpod_link_artifact` MCP tool.
- `fleet artifacts` commands.
- **Link this file** in the console.
- The hub's Superlibrary client.
- Node-side path-escape checks.

**superpipeline**
- Recognise `app.superlibrary.dev/a/…` references.
- An inline preview in the card drawer for safe kinds (images, Markdown, text, code), fetched with
  the viewer's own token.
- Every other kind opens Superlibrary.

**Agent instructions** (coordinator and every station)
- Link produced files with `agentpod_link_artifact` and attach them to the card.
- Never use gists or personal accounts.

## 10. Phases

1. **The repo, the plane registration, the API, storage and the content Worker**, with direct
   upload by a person and the viewer for every kind.
2. **AgentPod as a source:** the MCP tool, `fleet artifacts`, and the console's Link action.
3. **Superpipeline previews**, and the agent instructions.
4. **The library:** browse, search, collections, retention jobs and the audit view.

## 11. Tests (each guard proven by reverting it)

- An agent cannot link another station's file.
- Path escape is refused, whether by `..`, an absolute path or a symlink.
- A denylisted path is refused.
- The secret scan refuses a match, and an override is recorded.
- Size caps are enforced.
- A sniffed type wins over the extension.
- A malicious HTML fixture in the content origin cannot:
  - read cookies or storage from other origins;
  - fetch, use XHR or open a WebSocket;
  - navigate the top window;
  - frame itself outside the app.
- A signed URL expires, and opens only its own artifact.
- A non-member gets 403, and every view is audited.
- Versions are immutable, and linking again creates *n+1*.
- Revocation stops serving at once.
- Removing a station keeps its artifacts.
- Retention deletes only artifacts that no card or collection references.

## 12. Decisions so far (operator, 2026-10-08 and 2026-10-09)

1. Superlibrary is its own product, in its own repository.
2. The domains are `superlibrary.dev` and `superlibrarycontent.dev`, registered through Cloudflare.
3. HTML artifacts may load from trusted CDNs only: cdnjs, jsDelivr, unpkg, and Google Fonts for
   styles and fonts. They have no network access.
4. Unreferenced artifacts are kept for 30 days.
5. Removing a station keeps its artifacts. Revoking them is a separate action.
