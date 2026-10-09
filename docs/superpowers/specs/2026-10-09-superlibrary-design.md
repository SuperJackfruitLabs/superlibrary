# Superlibrary: design

**Status:** for operator review, 2026-10-09. Decisions taken so far are in §15.

**Product:** Superlibrary, the memory of the Super Jackfruit Labs stack. Agents consult it before
they work, and people browse it.

**Domains**
- `superlibrary.dev`: the product. The app is at `app.superlibrary.dev` and the docs at
  `docs.superlibrary.dev`.
- `superlibrarycontent.dev`: the sandbox for untrusted content. It never serves anything with a
  login.

Both are active zones in the Cloudflare account that hosts Superpipeline.

## 1. Problem

Knowledge in the stack is scattered, and none of it is retrievable by the agents doing the work:

- Ideas are in `sketchbook` and decisions are in `charter`.
- Designs are in `atelier` and in per-repo specs.
- Each agent's memory is private to its own profile.
- Work history is in Superpipeline cards and their handoffs.
- Evidence is in Superwitness, and conversations are in Supermessage.

An agent starting a card has no way to ask what has already been done, decided or tried.

There is also nowhere to keep what agents make:
- Superpipeline stores no content. A reference is a URL.
- AgentPod reads a workspace live, and only while the station is up.

So agents published elsewhere. On 2026-10-03 and 2026-10-04 that meant gists under the operator's
personal GitHub account, two of them public. Those gists have since been made secret and `gh`
removed from the agent host. The gap remains.

## 2. What Superlibrary is

Superlibrary is **retrieval with provenance**. Every item answers three questions: where it came
from, who made it, and how it turned out.

- **At launch it holds:**
  1. **Agent artifacts:** files an agent links from its own workspace (§6–§9).
  2. **Superpipeline work history:** finished and abandoned cards, with their spec, each stage's
     handoff, comments and references (§5).
- **Later sources** are adapters, added one at a time: `charter` decisions, `sketchbook` ideas,
  agents' own memories, Superwitness evidence and Supermessage threads.
- **Agents** use it through MCP tools (§10). The board bridge can also add "related prior work"
  to each claim's prompt.
- **People** use it through the library app: browse, search, collections, and views by outcome
  (§11).

## 3. Concepts

- **Item:** one unit of memory. It has a kind (`artifact` or `work-record` at launch), a title, a
  body or file, its provenance, an **outcome**, a **visibility scope**, and its index entries.
- **Artifact:** an item backed by an immutable snapshot of a file or a folder.
  - It is versioned by source path: linking the same path again creates version *n+1*.
  - Its bytes are content-addressed by SHA-256, so identical content is stored once.
- **Work record:** an item that summarises one Superpipeline card from start to finish.
  - It holds the title, the spec, each stage's handoff (agent, stage, time and attempt), the
    comments and the references.
  - Any artifacts the card references are linked to it.
  - It is updated as the card moves, and gets its final outcome when the card finishes.
- **Outcome:** one of `approved`, `completed`, `rejected`, `failed`, `abandoned`, `superseded` or
  `in-progress`.
  - Set automatically from the source, for example a card completing or being rejected at a gate.
  - It drives ranking and is shown on every result.
- **Scope:** which board an item belongs to, or `workspace` for items visible to the whole
  workspace. Scope drives visibility (§4).
- **Provenance:** workspace, board, card, stage, run, agent principal, station, source path, the
  time it was created, and the source's own id and URL.
- **Collection:** a named set of items that people curate, such as "Building in public — week 41".

## 4. Visibility

The same rule applies to search, to `get`, to `related` and to the prompt context.

- **Agents** see items whose scope is a board they are **rostered on**, meaning they hold an
  enabled board-bridge row there, plus items scoped `workspace`. A cross-board link does not widen
  what an agent can see.
- **People** see items on boards they can read in Superpipeline, plus `workspace` items.
- **The filter comes first.** Visibility is applied before ranking, in the vector query's metadata
  filter and in the SQL query. A result an agent may not see never reaches the ranking step, and
  neither do snippets of it.
- **Changing scope** to `workspace` is a person's act, recorded in the audit log. An agent can
  propose it, but cannot do it.
- **The roster** comes from the AgentPod hub, which owns the board-bridge rows. Superlibrary reads
  it through a new read endpoint, `GET /api/bridge/principals/:prn/boards`, and caches it for five
  minutes. The cache is cleared when a bridge row changes.

## 5. Sources at launch

### Superpipeline work history

- Superlibrary registers a push config on each workspace board for these events:
  - `card.created`, `card.updated` and `card.advanced`;
  - `card.completed`, `card.rejected`, `card.failed`, `card.deleted` and `card.resumed`;
  - `card.comment.added` and `card.comment.deleted`;
  - `gate.resolved`.
- Each event updates that card's work record. On a terminal event, the full card is read back to
  settle the final outcome.
- A **backfill job** imports existing cards, archived ones included, so memory starts with
  history, not empty.
- **Outcome mapping:**
  - terminal stage reached after an approved gate → `approved`;
  - terminal stage with no gate → `completed`;
  - rejected at a gate → `rejected`;
  - circuit breaker or permanent failure → `failed`;
  - archived without completing → `abandoned`;
  - a later card with a `supersedes` link → `superseded`.
- **Indexed:** the title, the description, structured spec fields flattened to text, each handoff,
  comments, and reference titles. Secret-scanned before indexing (§8).

### AgentPod artifacts

1. The agent calls `agentpod_link_artifact { path, title?, kind?, entry? }`.
2. The hub identifies the caller's station from its run-scoped token; that is the only station it
   may read.
3. The hub reads the bytes through `fs.read`, with a new `offset` for chunked reads, and applies
   the source guardrails (§8).
4. The hub calls Superlibrary with its service credential, with `act` set to the agent principal.
   It sends the provenance, including the board and card of the run, so the artifact is scoped to
   that board.
5. Superlibrary returns `{ itemId, version, url, sha256, mediaType, bytes }`. The URL is
   `https://app.superlibrary.dev/a/<itemId>`.
6. The agent attaches the URL to the card with `superpipeline_add_reference`. The card's work
   record links it.

**People** can link station files with `fleet artifacts link` or the console's **Link this file**,
and can upload directly through the app or `suli upload`. Agents cannot upload directly in v1:
everything an agent stores comes from its own workspace, with provenance.

## 6. Architecture

Superlibrary is Cloudflare-native, like Superpipeline:

| Part | Runs on | Holds | Role |
|---|---|---|---|
| `apps/api` | Worker `superlibrary-api` | D1 (read and write), R2 (read and write), Vectorize, Workers AI, the URL-signing key | REST and MCP API. Verifies organization-plane tokens offline (audience `https://app.superlibrary.dev`). Runs the ingest and indexing queues. |
| `apps/web` | Pages `superlibrary-web` | — | The library and viewer at `app.superlibrary.dev`. Signs in through accounts.superjackfruit.com, with PKCE and tokens held in memory. |
| `apps/content` | Worker `superlibrary-content` on `*.superlibrarycontent.dev` | **R2 read-only**, and the signing key's verification half | Serves artifact bytes and **the viewer for every kind** (§9) for one valid signed URL. No cookies, no API, no database. |
| `packages/contract` | — | — | Zod schemas shared with AgentPod and Superpipeline. |
| `packages/embed` | — | — | `@superlibrary/embed`, the host SDK that mounts the sandboxed viewer frame and its toolbar in any product (§9, Embedding). |

**Two Workers on purpose.** The content Worker serves agent-written pages. A bug there can at most
read artifact bytes. It cannot reach the database, a write permission or a key, and the API cannot
be reached on the content domain.

**Background work** runs on Cloudflare Queues:
- `ingest`: source events into items;
- `index`: text extraction, chunking and embeddings;
- `retention`: the daily sweep.

Every handler is idempotent, so a duplicate delivery changes nothing.

**Accounts registers Superlibrary as a product:**
- an audience;
- the web and CLI clients;
- an entitlement, `superlibrary`, carried in `ent`;
- scopes: `library:read`, `library:write` and `library:admin`;
- a service grant that lets the AgentPod hub create artifacts on an agent's behalf.

A workspace without the entitlement gets `403 product_not_enabled`.

## 7. Search and the move to own hardware

**Hybrid retrieval**
1. **Semantic:** Workers AI embeddings (`@cf/baai/bge-m3`, multilingual, 1024 dimensions), stored
   in Vectorize with metadata for `workspace`, `scope`, `kind`, `outcome` and `itemId`.
2. **Exact words:** D1 FTS5 over the same chunks.
3. **Fusion:** the two lists are merged with reciprocal rank fusion, then multiplied by an outcome
   weight:
   - `approved` / `completed`: 1.0
   - `in-progress`: 0.8
   - `superseded`: 0.5
   - `rejected` / `failed` / `abandoned`: 0.4

   Rejected and failed work therefore ranks lower but is never hidden.
4. **Results** carry an outcome label, provenance, a snippet and a link.

**Chunking:** text is cut into about 800 tokens with 15% overlap, and every chunk records its
item, version and position. Code keeps its function boundaries where possible. Images are indexed
by title and alt text, plus their caption if a person adds one. OCR and image embeddings are
phase 5.

**The move to own hardware.** Embedding and vector storage sit behind two interfaces,
`Embedder.embed(texts)` and `VectorIndex.query/upsert/delete`.
- Every vector records the embedder's id and dimensions, so two models never mix in one index.
- Moving to foundry means three steps: deploy an `Embedder` that calls an embedding service on
  foundry through the tunnel, run the **re-index job** (which re-embeds every chunk into a new
  index), then switch reads to the new index.
- No product code changes. D1 full-text search keeps working whatever happens to the index.

## 8. Guardrails

**Content**
- **Path rules** (source side, and again for direct uploads):
  - paths must stay inside the workspace root;
  - `..` is refused, and so is a symlink that leaves the root;
  - denied by default: `.env*`, `.ssh/`, `.gnupg/`, `*.pem`, `*.key`, `id_*`, `.git/` internals,
    `.netrc`, `.npmrc`, `.pypirc`, cloud credential files, and each harness's own config, session
    and token files.
- **Secret scan** on every artifact and every work record before storing or indexing.
  - It looks for AWS, GitHub, Slack, OpenAI and Anthropic keys, signed JWTs, PEM blocks and
    high-entropy assignments.
  - An artifact with a hit is refused, naming the file and line. A work record is stored with the
    match replaced by `[redacted secret]`, and the redaction is flagged on the record.
  - A person can override one artifact. The override is recorded.
- **Sizes:**
  - 25 MB per file;
  - 100 MB and 500 files per folder;
  - 1 GB per workspace by default.
- **Type** is sniffed from the bytes, never taken from the extension.

**Prompt safety.** Retrieved content is data, not instructions.
- MCP results and the related-work section wrap every item in a labelled block: item id,
  provenance and outcome.
- Agents are told, in the tool description and in the prompt section, that retrieved text is
  reference material and never instructions.
- The related-work section is capped at about 1,500 tokens and five items.

**Access**
- Every read is checked against the visibility rule (§4) and written to the audit log.
- There are no anonymous links in v1.

## 9. Artifact viewing

### File types

The type comes from sniffing the bytes.

| Kind | Shown as |
|---|---|
| HTML, including multi-file apps with their own JS, CSS and images | Interactive, sandboxed |
| Markdown | Rendered: tables, task lists, code highlighting, Mermaid, images from the same folder |
| PNG, JPEG, GIF, WebP, AVIF | Inline, zoomable |
| SVG | As an image only (scripts cannot run), with the source available |
| PDF | Viewer, inside the sandbox |
| Code, text, logs | Syntax-highlighted, paged when large |
| JSON, YAML, TOML | The readable structured view, plus raw |
| CSV, TSV | Sortable table (first 5,000 rows), plus download |
| `.ipynb` | Cells and saved outputs, never executed |
| Mermaid, Graphviz | Rendered, plus source |
| Audio, video | Native players |
| DOCX, XLSX, PPTX | Download; a text preview in phase 5 |
| Anything else | Download, with type, size and hash |

### Running untrusted HTML safely

1. **A separate site.** `superlibrarycontent.dev` shares no cookies, storage or same-site
   relationship with any product.
2. **One subdomain per artifact:** `<itemId>.superlibrarycontent.dev`, through a wildcard route.
3. **A sandboxed frame:**
   ```html
   <iframe sandbox="allow-scripts allow-popups-to-escape-sandbox" referrerpolicy="no-referrer">
   ```
   With no `allow-same-origin`, each artifact gets a unique opaque origin. The frame also has no
   `allow-forms`, `allow-top-navigation` or `allow-modals`.
4. **CSP:**
   - `default-src 'none'`;
   - scripts, styles, images, fonts and media allowed from `'self'`, `data:` and `blob:`, and from
     `https://cdnjs.cloudflare.com`, `https://cdn.jsdelivr.net` and `https://unpkg.com`;
   - inline scripts and styles allowed (`'unsafe-inline'`), so single-file pages work; `unsafe-eval`
     and WebAssembly are not;
   - styles and fonts also allowed from `https://fonts.googleapis.com` and
     `https://fonts.gstatic.com`;
   - **`connect-src 'none'`**;
   - `frame-ancestors` set from configuration to the embedding hosts (§9, Embedding): initially
     `https://app.superlibrary.dev https://app.superpipeline.dev https://console.agentpod.dev`;
   - no `form-action`.
5. **Signed URLs, never cookies.** Each URL lasts 5 minutes, covers one item version, and is minted
   only after the viewer's permission has been checked.
6. **Headers:**
   - `X-Content-Type-Options: nosniff`;
   - `Cross-Origin-Resource-Policy: same-site`;
   - `Cross-Origin-Opener-Policy: same-origin`;
   - `Content-Disposition: attachment` for every kind that is not rendered.

### Embedding

Amended 2026-10-09 (operator): the viewer can be embedded in other products, with an option to
open it in a new window.

- **All rendering lives on the content origin.** `https://<itemId>.superlibrarycontent.dev/_view?sig=…`
  is a small viewer page that renders every kind in the table above: Markdown sanitized, code
  highlighted, CSV as a table, JSON/YAML/TOML structured, notebooks read-only, Mermaid and
  Graphviz, images, SVG as an `<img>`, PDF, audio and video, and a download card for the rest. An
  HTML artifact renders its own entry file. The renderer bundle is served from the content origin
  itself (CSP `'self'`). The library app has no renderers of its own: it embeds the same frame, so
  every host gets one renderer.
- **Embed API:** `POST /api/v1/items/:id/embed { version? }` →
  `{ url, expiresAt, version, entry, files, downloadUrl, itemUrl }`: a 5-minute signed URL for one
  item version, minted only after checking the caller's own access with a person's token for the
  audience `https://app.superlibrary.dev`. The visibility rules are the same as viewing on
  Superlibrary. `files` is the version's file list (`path`, `mediaType`, `view`, `bytes`; entry
  first, then tree order); `downloadUrl` is `null` for a folder.
- **Viewer URL parameters.** The token signs only the item, version, expiry and host, so the host
  adds `/_view` parameters without a new grant: `path=` (one file of the version; an HTML file
  redirects to `/s/<token>/<path>`, so its relative links keep working), `source=1` (a text-backed
  file shown as highlighted source, still sandboxed) and `theme=light|dark|system` (the initial
  theme, so the frame does not flash the system theme).
- **Who may frame it** is the content origin's `frame-ancestors` allowlist, which is
  configuration, not code. Supermessage desktop joins it later. Framing from an origin that is not
  listed is refused.
- **Frame protocol** (`postMessage`, checked on both sides): the frame reports
  `{ type: "superlibrary:resize", height }` so the host can size it to its content, and the host
  may send `{ type: "superlibrary:theme", theme: "light" | "dark" | "system" }`, which the frame
  accepts only from the host signed into its URL. Without a message the frame follows the system.
  Two more messages from the frame (PR 3 review, 2026-10-09):
  - `{ type: "superlibrary:expired", path }`: the 5-minute URL ran out while the person was still
    viewing (a relative link in an HTML page, a media range request, a late image). The content
    origin answers a document navigation with an expired but genuine URL with a small `no-store`
    403 page (same headers as every document; its one script from `'self'`) that posts it to the
    signed host; other requests keep the JSON refusal. The viewer posts it when an image of the
    version fails, or an audio or video fails or stalls. The host SDK mints the same version
    again and reloads the same view, at most once every 10 seconds and only for a grant old
    enough to have expired.
  - `{ type: "superlibrary:open", url }`: a link clicked in a rendered file (Markdown, notebook
    Markdown, Graphviz node URLs). The sandbox stays exactly as above, without `allow-popups`, so
    the host opens it with `noopener,noreferrer`, and only for `http:` and `https:` URLs.
- **Host SDK** `@superlibrary/embed`: `mountArtifact(el, { itemId, version?, getEmbedUrl, … })`
  renders the sandboxed frame and, outside the sandbox, a toolbar. Amended 2026-10-09 (operator):
  1. **Version** label (from the grant, never the item's latest number), with a menu of the live
     versions that switches through `getEmbedUrl(version)`.
  2. **Share** panel: who can see the item in words: "Only you", "This board" or "Everyone in the
     workspace". In phase 1 a board item reads "Only you" (§4: only its uploader sees it until
     the board check exists); "This board" appears once the API reports board visibility. A
     person allowed to (the uploader or an owner; agents never) can widen it to the workspace
     after an explicit confirmation; this calls `POST /api/v1/items/:id/scope`, audited.
     **Copy link** copies the app link (`https://app.superlibrary.dev/a/<id>[/v/<n>]`), never a
     content URL; **Share…** opens the system share sheet with the title and that link, or copies
     it where there is none. There are no public links.
  3. **Open in new window** (the app link).
  4. **Full screen**: the Fullscreen API on the whole embed, or a fixed overlay where there is
     none (iPhone Safari) or it is refused. While it is open the embed is a named modal dialog:
     focus is contained (Tab and Shift+Tab wrap inside it) and the rest of the page is inert. The
     same button and Escape exit, and focus returns to the button. Keys pressed inside the frame
     do not reach the host, so from there the button is the way out.
  5. **Theme**: System (default), Light or Dark, remembered per device, sent to the frame by the
     theme message and in the first URL.
  6. **Download** of a single-file version (a folder has none; §9 sandbox has no downloads).
  7. **Files** for folder artifacts: the version's file list, entry first, then tree order, with
     sizes; choosing one opens it in the frame.
  8. **View source** for text-backed kinds (HTML, SVG, Markdown, code, JSON, CSV…), rendered by
     the content viewer in source mode.

  The host supplies callbacks for what only it can know with the person's token: the grant
  (`getEmbedUrl`), the live versions (`getVersions`), who can see the item (`getShareInfo`) and the
  widening (`setScope`). Every control works at phone and desktop widths. The package README
  documents them.
- **Accounts:** Superpipeline's and the AgentPod console's web clients may obtain a token for the
  Superlibrary audience for the signed-in person (per-client resources, issuer contract §3.1).
  Superpipeline's card-drawer integration remains a later phase (§14, phase 4).
- **Why a signed content URL, not the whole app in a frame.** Embedding the Superlibrary app would
  need a sign-in inside a third-party frame, which storage partitioning and Safari's Intelligent
  Tracking Prevention break. A signed content URL needs no sign-in inside the frame, so it works
  on iOS too.

### Availability

An artifact's bytes are copied when it is created, so viewing never depends on its station.

| Situation | Existing items | New artifacts | "Changed since linked" check |
|---|---|---|---|
| Station stopped, node offline or asleep | work | refused: "station unavailable" | "can't check right now" |
| File edited, moved or deleted | show the frozen version | linking again creates a new version | "changed" or "no longer there" |
| Workspace cleaned or runtime destroyed | work | refused | "no longer there" |
| Station or node removed | work, marked as removed | refused | — |
| AgentPod hub down | work | refused | — |
| Superlibrary or R2 down | unavailable until recovery | refused | — |

## 10. Agent interface (MCP)

These tools are served by `superlibrary-api` at `/mcp`. They accept the agent's own
organization-plane token, which gains the Superlibrary audience.

- **`library_search { query, kinds?, outcomes?, board?, limit? }`:** ranked results with an
  outcome label, provenance, a snippet and an item id.
- **`library_get { itemId, version? }`:** the full item. For an artifact this is its text content
  or a description of it. For a work record it is the whole record.
- **`library_related { cardId? | itemId? }`:** items related to a card or an item, using the
  title, spec and references.
- **`agentpod_link_artifact`** (served by AgentPod): adds a file from the agent's own workspace.

**Related prior work in the prompt.** When a card is claimed, the AgentPod bridge calls
`library_related { cardId }` and adds a capped "Related prior work" section to the prompt. Each
item carries its outcome and link, and the section is labelled as reference material. It can be
switched off per board. If Superlibrary is unreachable, the section is left out and the claim goes
ahead.

**Agent instructions** (the coordinator and every station):
- check `library_search` before starting non-trivial work;
- link produced files with `agentpod_link_artifact` and attach them to the card;
- never publish through gists or personal accounts.

## 11. People's interface

- **The library app:**
  - search, with filters for kind, outcome, board, agent, station and date;
  - an item page with provenance, versions and related items;
  - work-record timelines;
  - collections.
- **Views by outcome,** for example "everything rejected on Marketing & Community this month".
- **Moderation:**
  - change an item's scope to `workspace` (the viewer's Share panel, §9, for the uploader or an
    owner; audited; narrowing is not offered in phase 1);
  - mark an item `superseded` by another;
  - revoke an item or a single version;
  - edit a caption;
  - remove an item from memory, with a recorded reason.
- **`suli` CLI:** `search`, `get`, `upload`, `collect`, `revoke`, `scope`.
- **Superpipeline:** card drawers preview linked artifacts inline for images, Markdown, text and
  code, and have a "Related prior work" panel.

## 12. Lifecycle

- **Artifacts**
  - Revoke one artifact or one version, or set an expiry.
  - **Removing a station or node keeps its artifacts.** They are marked as from a removed station
    and stay visible within their scope.
  - Revoking all of a station's artifacts is a separate, explicit action. Node removal offers it
    as a checkbox, off by default.
  - **Retention:** artifacts referenced by a work record, a card or a collection are kept. Any
    other artifact is deleted after **30 days**.
- **Work records** are kept for as long as their card exists. Deleting a card deletes its work
  record and its index entries.
- **Deletion removes everything:** the D1 row, the R2 bytes when no other version shares them, the
  Vectorize vectors and the FTS rows.

## 13. Changes in other repositories

- **accounts:**
  - product registry entry, audience, and web and CLI clients;
  - Superpipeline's and the AgentPod console's web clients may request the Superlibrary audience
    (§9, Embedding);
  - the `superlibrary` entitlement and `library:*` scopes;
  - the hub's service grant;
  - the Superlibrary audience in agents' station tokens.
- **agentpod:**
  - `fs.read` gains `offset`;
  - a folder manifest walk;
  - node-side path checks;
  - the `agentpod_link_artifact` tool;
  - the Superlibrary client;
  - `fleet artifacts`;
  - the console's **Link this file**;
  - the roster endpoint (§4);
  - "Related prior work" in the bridge's prompt (`CardPrompt` gains an optional field, so older
    servers keep working).
- **superpipeline:**
  - recognise `app.superlibrary.dev` references;
  - inline previews and the "Related prior work" panel in the card drawer;
  - a `supersedes` link kind;
  - make sure board push configs can subscribe to the events listed in §5.

## 14. Phases

1. **Core**
   - repo, CI, the two Workers and the Pages app;
   - D1, R2 and Queues;
   - registration in Accounts;
   - direct upload by a person;
   - the viewer for every kind;
   - the guardrails and the secret scan.
2. **Sources:** AgentPod artifacts through `link_artifact`, and Superpipeline work history through
   events, plus the backfill.
3. **Retrieval:**
   - hybrid search behind the `Embedder` and `VectorIndex` interfaces;
   - the visibility filter;
   - the MCP tools;
   - "related prior work" in prompts;
   - the agent instructions.
4. **The library app:** browse, collections, outcome views, moderation, and the Superpipeline
   drawer panels.
5. **Later:**
   - more sources (`charter`, `sketchbook`, agent memories, Superwitness, Supermessage);
   - OCR and image embeddings;
   - Office previews;
   - the embedder on own hardware, when wanted.

## 15. Tests

Each guard is proven by reverting it and watching its test fail.

**Visibility**
- An agent gets no result from a board it is not rostered on, through search, `get`, `related`
  or the prompt section.
- A `workspace` item is visible to everyone in the workspace.
- A hidden item never appears, even as a snippet.

**Outcomes**
- Each source event maps to the right outcome.
- Ranking weights are applied.
- Superseded items point to their replacement.

**Ingest**
- Duplicate deliveries are idempotent.
- Backfill matches what live events produce.
- Deleting a card removes its record and its vectors.

**Sources**
- An agent cannot link another station's file.
- A path that escapes the workspace is refused, and so is a denylisted path.
- The secret scan refuses an artifact and redacts a work record. An override is recorded.
- Sizes are capped, and the sniffed type wins over the extension.

**Content origin** (tested with a malicious HTML fixture)
- It cannot read other origins' storage.
- It cannot fetch, use XHR or open a WebSocket.
- It cannot navigate the top window, or be framed outside the app.
- A signed URL expires and opens only its own item version.

**Prompt safety**
- Retrieved text is wrapped and labelled.
- The section's caps hold.
- If Superlibrary is down, the claim goes ahead without the section.

**Swapping the index**
- A re-index into a new index with a different embedder keeps search working.
- Vectors from two embedders never mix.

## 16. Decisions (operator, 2026-10-08 and 2026-10-09)

1. Superlibrary is its own product, in its own repository, and is **the stack's knowledge layer**.
2. Its first job is **memory that agents consult**, which people can also browse.
3. At launch it holds **agent artifacts and Superpipeline work history**.
4. **Everything goes in, labelled with its outcome.** Approved and completed work ranks first.
5. An agent sees **the boards it is rostered on, plus workspace-wide items**.
6. Search runs on **Cloudflare (Workers AI, Vectorize, D1 FTS)**, behind interfaces that allow a
   later move to own hardware.
7. Domains: `superlibrary.dev` and `superlibrarycontent.dev`.
8. HTML artifacts may load libraries from trusted CDNs only, and have no network access.
9. Unreferenced artifacts are deleted after 30 days.
10. Removing a station keeps its artifacts. Revoking them is a separate act.
11. CLI name: `suli`.
12. The viewer can be embedded in other products through a signed content URL and the
    `@superlibrary/embed` host SDK, with **Open in new window** (§9, Embedding).
13. HTML artifacts may use inline scripts and styles. Eval and WebAssembly stay blocked.
