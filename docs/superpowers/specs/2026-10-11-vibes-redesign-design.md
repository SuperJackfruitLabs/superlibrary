# Superlibrary on vibekit: four vibes, each with its own layout

> **Status:** draft for the operator, 2026-10-11. Implementation plan:
> [`docs/superpowers/plans/2026-10-11-vibes-redesign.md`](../plans/2026-10-11-vibes-redesign.md).
> Suite spec: vibekit `docs/specs/2026-10-11-vibes-design.md` (accepted 2026-10-11). Foundations API:
> vibekit plan `2026-10-11-vibekit-foundations.md` (branch `feat/foundations`).

## 1. Goals

1. **Superlibrary is the first product on vibekit.** The person picks a vibe (Daylight, Paper, Studio,
   Quiet), a theme (Follow the sun, Light, Dark), a time-of-day strength (Strong, Subtle, Off) and
   whether to use a rough location. The choice paints the first frame, with no flash.
2. **Each vibe has its own layout for the three key screens**: the library home (`/`), the item page
   (`/a/[itemId]`, `/a/[itemId]/v/[version]`) and collections (`/collections`, `/collections/[id]`).
   Every other screen has one adaptive layout, styled per vibe.
3. **Nothing visible today is hidden in any vibe.** §6 is the parity table: every item in the
   inventory, and where it appears in each vibe. A test (§8.2) fails the build if a layout drops one.
4. **The retired system goes**: IBM Plex fonts, `design/tokens.toml` and its generator,
   `lib/kit/tokens.css`, the Ink parent colour and the hexagon parent mark. Superlibrary keeps its
   identity through vibekit's product colour (`--vk-product-superlibrary-bg/fg`) and its own book-spine
   mark (unchanged: a new mark is out of scope, suite spec "Not now").
5. **Best-in-class UX**: WCAG 2.2 AA, 44px targets, 16px inputs, full keyboard use, reduced motion
   wins, no layout shift from the vibe, fast.
6. **Deployed by morning.** Phase 1 ships alone (§9). Each later phase is shippable on its own because
   a vibe without its own layout falls back to the Daylight layout, styled in that vibe.

**Not in scope:** Supermessage; the content viewer inside the iframe (apps/content: it keeps light and
dark only, §10 R4); the Accounts profile sync of the appearance (later suite plan); the
`packages/embed` SDK (used unchanged; Superpipeline and the AgentPod console vendor it); any API change.

**No API changes.** Every screen below is built from data the API already returns. Two fields that are
returned but not shown today are now shown in some vibes (additive, §7): `BrowsePage.counts` on the
library home in Studio, and the agent principal (`source.agent` / `source.agentPrincipal` /
`provenance.agentPrincipal`) as a default face on rows and item headers.

## 2. Decisions taken while writing this spec

These are the choices the operator should know about. Each is reversible in one task.

| # | Decision | Why |
|---|---|---|
| D1 | **The theme option "System" becomes "Follow the sun".** vibekit's theme preference is `sun`, `light` or `dark`, and its head script resolves `sun` by the clock, not the OS. A person who had chosen Light or Dark in the old Account menu keeps it (one-time migration from `localStorage['superlibrary:theme']`). | Matches vibekit and the other products. |
| D2 | **Every existing sentence keeps its exact words in every vibe.** Errors, empty states, dialogs, buttons, toasts and status lines are unchanged. The vibe's voice shows only in new, decorative lines: the greeting (vibekit `greeting()`), Paper's dateline, Studio's readout. Studio's labels are upper-cased by CSS only (`text-transform`), so the DOM text, screen readers and tests read the same words. | The "same meaning in every message" rule needs a reviewer per rewording; none is available tonight, and e2e asserts ~60 exact sentences. Rewording per vibe is a later plan. |
| D3 | **Danger is a product token, not vibekit's signal.** vibekit's signal colour means "a person is needed" and nothing else. Superlibrary's destructive buttons (Revoke, Remove from memory, Delete collection) use `--sl-danger`, defined per theme in `lib/vibe/superlibrary.css` and contrast-checked against every vibe's surfaces. | The suite rule. |
| D4 | **Where Superlibrary uses the signal colour:** only where the person must act for the page to go on: the secret-found panel on Upload, the expired item's "Keep it" panel, and the "Superlibrary is not enabled" notice. | One signal colour, one meaning. |
| D5 | **Outcome colours are product tokens on vibekit**: seven `--sl-outcome-*` per theme. Three light values are darkened so that every outcome passes 4.5:1 as text on `bg`, `surface` and `raised` of all four vibes (Studio light and Quiet light failed with today's values): approved `#187c49 → #13663b`, completed `#0f766e → #0b625c`, abandoned `#6b6b70 → #5a5a5f`. Dark values are unchanged. An outcome is still always a word plus its colour. | Checked with WCAG 2.x maths against vibekit's values (§8.1 test keeps it true). |
| D6 | **The appearance cookie is host-only** on `app.superlibrary.dev` (`vk_appearance`, `Secure` on https, `SameSite=Lax`, one year). | Brief: the products are not under `.superjackfruit.com` yet. |
| D7 | **Changing vibe resets the time-of-day strength to that vibe's default** (`defaultTimeStrength`: Quiet → Off, others → Strong); the person can then change it. | Predictable; Quiet's spec default is Off. |
| D8 | **Agents get vibekit's default face from their principal id.** Superlibrary has no avatar URL for an agent (the API returns only `prn_…` ids), so `Face` is never given `src` here. When the API one day returns the Matrix avatar URL, the Face `src` override is a one-line change in `lib/vibe/faces.ts`. | Brief: "a chosen picture overrides via Face `src` if the product has it". It does not. |
| D9 | **Sections own the fields; layouts own the arrangement.** Each block of fields (Versions, Details, Provenance, Related, Collections, Manage, Timeline, …) is one shared component that renders every field, with a `variant` (`list`, `table`, `plain`) for its shape. A vibe's layout places, wraps and orders the sections. | A layout cannot drop a field it never renders itself. The parity test covers the rest. |
| D10 | **Screenshots are attached, not pixel-compared, in CI.** Baselines made on macOS do not match Linux CI. CI asserts axe, the parity list, no sideways scroll and 44px targets for every vibe × theme, and attaches a screenshot of each to the report. `PW_VISUAL=1` turns on `toHaveScreenshot` against Linux baselines once they are generated in CI (a follow-up, §10 R6). | Green CI by morning without flaky pixel diffs. |
| D11 | **The parent hexagon mark is retired** (suite spec). The suite switcher and footer keep the words "Super Jackfruit Labs" and drop the mark; product entries show vibekit product chips. The Superlibrary book-spine mark, `favicon.svg` and the PNG icons are unchanged. | No new mark tonight. |
| D12 | **Switching vibe re-creates the screen's layout.** The screen's view model keeps its state (filters, dialog, delete date being typed, notice); sections that load their own data (Related, Collections, Moderate) load again, and a caption being typed in Moderate is lost. The viewer is re-mounted. | Vibe changes are rare; the alternative (portalled sections) costs a day. |

## 3. Architecture

```
app.html            <script>{HEAD_SCRIPT}</script> first in <head>  → data-vibe/theme/phase/time before paint
+layout.svelte      imports vibekit fonts.css + vibekit.css + lib/vibe/superlibrary.css + app.css + kit.css
                    initAppearance(): migrate old theme, refine phase with phaseAt(), tick every 60 s
lib/vibe/           appearance.svelte.ts (look state, setAppearance, cookie, location)
                    layout.ts (pickLayout), VibeLayout.svelte (the one place a layout is chosen)
                    superlibrary.css (product tokens), AppearanceDialog.svelte, suite.ts, copy.ts, faces.ts
lib/screens/        one view model per screen (a class with $state): LibraryModel, ItemModel,
                    CollectionsModel, CollectionModel; fixtures for tests; parity.ts (the inventory as data)
lib/sections/       shared field blocks used by every layout (Versions, Details, Provenance, …)
lib/layouts/        <screen>/<Screen><Vibe>.svelte, and registry.ts (which vibe has which layout)
routes/…            each key route: create its model, render <VibeLayout layouts={REGISTRY.x} {model} />
```

- **vibekit is vendored** as `apps/web/vendor/vibekit-0.0.1.tgz`, dependency
  `"@superjackfruit/vibekit": "file:./vendor/vibekit-0.0.1.tgz"` in `apps/web/package.json`. Its own
  dependencies (Fontsource, bits-ui, suncalc) come from the public npm registry as usual.
- **The layout is picked in one place.** `VibeLayout` reads `look.appearance.vibe` and renders
  `pickLayout(vibe, layouts)`, which falls back to `daylight` when a vibe has no layout yet.
  `lib/layouts/registry.ts` is the only file that maps vibes to layouts. No layout or section checks
  the vibe in its markup; per-vibe styling is CSS on `[data-vibe="…"]`.
- **The view model is the data and the actions.** Each model is a class in a `.svelte.ts` file,
  constructed in the route's component script (so its `$effect`s belong to the route). Layouts get
  `model` and nothing else. Element hooks (the viewer, focus targets) are Svelte attachments on the
  model (`{@attach model.viewer}`), so any layout can host them.
- **The embed** (`@superlibrary/embed`) is mounted by `ItemModel` on whatever element the layout
  attaches. It gets the resolved theme (`light`/`dark`) and follows changes with `setTheme`. Its
  toolbar takes vibekit colours and font through its existing host hooks (`--sl-host-*`).
- **CSS layering**: vibekit's CSS is in `@layer vk.tokens, vk.base, vk.components`; Superlibrary's
  CSS is unlayered, so a product rule always wins over a vibekit default. Product CSS uses only
  `--vk-*` and `--sl-*` variables. `lib/vibe/superlibrary.css` is the one file with colour literals.

### 3.1 Token mapping (old → new)

| Old (retired) | New |
|---|---|
| `--color-surface` (page) | `--vk-color-bg` |
| `--color-surface-raised` (cards, menus) | `--vk-color-surface` |
| `--color-surface-sunken` (hover, wells) | `--vk-color-raised` |
| `--color-border` / `--color-border-strong` | `--vk-color-line` / `--vk-color-faint` |
| `--color-content` / `-muted` / `-faint` | `--vk-color-text` / `--vk-color-muted` / `--vk-color-faint` |
| `--color-accent` / `--color-accent-content` | `--vk-color-primary` / `--vk-color-primary-fg` |
| `--color-danger` | `--sl-danger` |
| `--color-ok` | `--vk-color-success-text` |
| `--color-scrim`, `--elevation-overlay` | `--sl-scrim`, `--sl-shadow-overlay` |
| `--accent-mark` | `--sl-mark` (= `--vk-product-superlibrary-fg`) |
| `--outcome-<o>` | `--sl-outcome-<o>` |
| `--product-<k>-accent` | `--vk-product-<k>-bg` / `-fg` (chip) |
| `--parent-*` | removed |
| `--font-sans` / `--font-mono` | `--vk-font-body` (headings `--vk-font-display`) / `--vk-font-mono` |
| `--space-1,2,3,4,6,8` (4…32px) | `--vk-space-1,2,3,4,5,6` |
| `--tap` | `--vk-target-min` |
| `--radius-control` / `-card` / `-pill` | `--vk-radius-sm` / `--vk-radius-md` / `--vk-radius-pill` |
| `--motion-quick` / `-settle` / `-easing` | `--vk-motion-fast` / `--vk-motion-base` / `--vk-motion-easing` |
| `--type-*` sizes | `--vk-text-sm` (meta, labels), `--vk-text-md` (body, UI), `--vk-text-lg` (h2/title), `--vk-text-xl` (h1 on home) |
| `--focus-ring` / `--focus-offset` | vibekit's `:focus-visible` (`--vk-focus`), product rule deleted |

### 3.2 Product tokens (`lib/vibe/superlibrary.css`)

| Token | Light | Dark | Checked against (all 8 looks) |
|---|---|---|---|
| `--sl-outcome-approved` | `#13663b` | `#4cc38a` | 4.5:1 on `bg`, `surface`, `raised` |
| `--sl-outcome-completed` | `#0b625c` | `#2dd4bf` | same |
| `--sl-outcome-in-progress` | `#2356c2` | `#8ab4ff` | same |
| `--sl-outcome-superseded` | `#6d4fb3` | `#b39cf0` | same |
| `--sl-outcome-rejected` | `#b42318` | `#ff6b5b` | same |
| `--sl-outcome-failed` | `#a14306` | `#f79009` | same |
| `--sl-outcome-abandoned` | `#5a5a5f` | `#98989d` | same |
| `--sl-danger` | `#ad2e1f` | `#ff6b5b` | same (text and 2px border of the danger button) |
| `--sl-mark` | `var(--vk-product-superlibrary-fg)` | same | 3:1 on `bg` and on `--vk-product-superlibrary-bg` |
| `--sl-scrim` | `rgb(20 18 30 / 0.45)` | `rgb(0 0 0 / 0.6)` | n/a (behind dialogs) |
| `--sl-shadow-overlay` | `0 12px 32px rgb(20 18 30 / 0.18)` | `0 12px 32px rgb(0 0 0 / 0.5)` | n/a |

Values were checked before writing (all pass); `product-tokens.test.ts` re-checks them against the
vendored vibekit `tokens.css`, so a vibekit colour change that breaks one fails the build.

## 4. The shell, the appearance picker and time of day

### 4.1 Shell (one adaptive layout, every screen)

Structure and class names stay as today (`header.suite-shell` > `.suite-shell-brand`, `.suite-shell-nav`,
`.suite-shell-end`), because e2e and component tests pin them. Phone (<768px): brand row with the
account button, nav as a full-width row of four below. Wider: one row.

| Vibe | Look |
|---|---|
| Daylight | The mark sits on a rounded chip in `--vk-product-superlibrary-bg`; nav items are pills (`--vk-radius-pill`), current one filled `--vk-color-surface` with the ground lift. Display font for the name. |
| Paper | No chip: the mark beside the name in Newsreader; a 1px rule under the header; current nav item underlined. |
| Studio | A dense bar (`--vk-color-raised` background, `--vk-radius-sm`); nav labels upper-case Martian Mono `--vk-text-sm` (CSS); current item has a 2px `--vk-color-primary` underline. |
| Quiet | Plain text links, underlined; current item bold with `aria-current`. No chip, no shadow. |

The account menu holds, in order: the detail line (`An owner|A member of this workspace · <principalId>`),
a button **Appearance** (opens §4.2), and **Sign out**. The Theme radios move into the Appearance
dialog. The suite switcher ("Products") lists AgentPod, Superpipeline and Superlibrary (the entries with
an address), each with a small chip in its vibekit product colour; the current one is marked
`aria-current`. The footer is the link "Super Jackfruit Labs" to https://superjackfruit.com.

### 4.2 Appearance dialog

A modal dialog (`role="dialog"`, `aria-modal`, labelled "Appearance"), opened from the account menu.
The menu closes as it opens; focus moves to the checked vibe; Escape or **Done** closes it and focus
returns to the **Account** button. Every change applies at once (a live preview) and is saved in the
cookie. On phones it is a full-height sheet; wider, a 480px panel.

1. **Vibe**: a `fieldset` (legend "Vibe") of four native radios as cards. Each card: the name, the
   suite's one-line "feels like" (`A sunlit room your team works in`, `A letter from a colleague`,
   `A well-made piece of equipment`, `A clear printed page`) and a 3-swatch sample drawn in that
   vibe's colours by putting `data-vibe="<that vibe>" data-theme="<current theme>"` on the sample
   (vibekit's token blocks match any element, not only `<html>`). Radios are 44px tall cards; arrow
   keys move between them (native).
2. **Light or dark**: vibekit `Segmented` (label "Light or dark"): Follow the sun / Light / Dark.
   Hint: "Follow the sun: light by day, dark after dusk."
3. **Time of day**: `Segmented` (label "Time of day"): Strong / Subtle / Off. Hint: "How much the
   time of day shows. Quiet starts with Off."
4. **Use my location for the sun**: a native checkbox. Checking it asks the browser for a position
   once, rounds it to one decimal place (about 10 km) and keeps it in this browser
   (`localStorage['superlibrary:place']`). Hint: "A rough location that never leaves this device.
   Without it, the day runs 6:00 to 18:00 in your time zone." If the browser refuses, the box
   unchecks and the hint says "Location was not shared, so your time zone is used." (`role="status"`).
5. A muted line: "Saved in this browser for Superlibrary."
6. **Done** (primary).

### 4.3 Time of day

`initAppearance()` runs at the top of the root layout: it reads the cookie, migrates the old theme
(D1), computes the phase with `phaseAt(now, { place } | { timeZone })`, writes the attributes, and
repeats every 60 seconds and when the tab becomes visible (re-reading the cookie, so another tab's
change is followed). Only CSS variables change, so the phase never moves layout.

| Vibe | Strong | Subtle | Off |
|---|---|---|---|
| Daylight | Home: a `Sky` band behind the heading and search, with the greeting (`greeting(phase,'daylight')`, e.g. "Golden hour.") | Sky band tinted (vibekit `data-time="subtle"`), greeting shown | Plain band, no greeting |
| Paper | The page takes the phase tint (`--vk-sky-<phase>-top`); home and collections show the dateline "Saturday 11 October, in golden light" | Tint mixed 50% with `--vk-color-bg`; dateline shown | No tint, no dateline |
| Studio | A readout in the page header: a 10px light in `--vk-sky-<phase>-sun` and "GOLDEN HOUR · 17:42" (`greeting(phase,'studio')` + clock) | Readout without the light | No readout |
| Quiet | A plain line "Time of day: golden hour" under the heading on home | same | Nothing (default) |

All of these are decorative: `aria-hidden="true"` on the light and the sun, and the greeting is a
plain `<p>` (not a heading). Theme Follow-the-sun switches light ↔ dark at night with no layout change.

### 4.4 Agent faces

`lib/vibe/faces.ts` exports `makerOf(source, createdBy)` → `{ id, label } | null`: an agent maker is
`source.agentPrincipal ?? createdBy` when `source.agent` is true; the label is the existing provenance
words `An agent (prn_…)`. People get no face. Each vibe shows it its own way: Daylight 24px Face with
its mood ring (mood `done` for approved/completed, `working` for in-progress, `resting` otherwise);
Paper a 24px round portrait (the same Face) beside the byline; Studio a 16px square Face (vibekit
squares faces in Studio) beside a status light; Quiet the words only. The face is decorative where the
words are also shown (`label` is still set; the words follow it).

## 5. Screen by screen

Common to every layout: the page `<title>`s are unchanged; every list keeps its accessible name; every
heading level is as today (one `h1`, sections `h2`); focus management is the model's (heading focus
after removal, focus back to the opener after a dialog, Rename button after editing). Widths: phone
390px, tablet 768px, desktop 1024–1920px; the shell's max width stays 1100px except where noted.

### 5.1 Library home (`/`)

The model (`LibraryModel`) holds: filters (from the address), facets, rows, counts, next cursor,
loading, error, the search words, and the actions `submit()`, `setFilters(f)`, `retry()`, `more()`.
Rows carry structured parts (`kindWord`, `board`, `station`, `path`) as well as today's joined `line`,
and `maker` (§4.4).

**Daylight**: a conversation with the room.
1. `Sky` band (phase from `look.phase`, radius `--vk-radius-lg`): greeting `p.sl-greeting`; row `.heading`
   with `h1` "Library" (display font, `--vk-text-xl`) and the primary **Upload** button; then the search
   form as one rounded pill (input + **Search** button inside it). Phone: heading row wraps, the button
   stays beside the title.
2. Filters card: the `details.filters` disclosure ("Filters" / "Filters · N on"), surface background,
   radius md; controls in the grid as today; open by default from 768px.
3. Status line (`role="status"`), error + **Try again**, or the empty state (cards with the same title,
   body and **Upload** action).
4. Results as cards (`ResultList` variant `cards`): each `li.result` is a rounded surface card with a
   4px outcome-coloured left edge; first row: Face (agent makers only) + title; then the meta row
   (outcome word pill, `line`, visibility), then the snippet (3 lines, clamped), then
   "See what replaced it". One column on all widths (reading width 760px).
5. **More** below.

**Paper**: the front page of a newspaper.
1. Masthead: dateline `p.sl-dateline` (when time shows); `.heading` with `h1` "Library" in Newsreader
   and **Upload** as a secondary button; a 2px rule.
2. Search as one underlined field with **Search**.
3. Desktop ≥1024: two columns, results 2/3 left, a "sidebar" 1/3 right holding the filters disclosure
   (open) and the status line. Phone/tablet: filters disclosure then status line above the results.
4. Results as an index (`ResultList` variant `index`): title in Newsreader `--vk-text-lg` as the link,
   then a byline line in italics: portrait Face (agent makers) + `line`; then "Outcome word ·
   visibility"; the snippet as a quoted excerpt (serif, muted, left rule); "See what replaced it" as a
   text link. Entries separated by 1px rules, no cards.
5. **More** as a secondary button centred.

**Studio**: a dashboard.
1. Header row: `h1` "Library" + the readout (§4.3) + **Upload** (primary, amber).
2. Metric tiles (`dl.sl-tiles`, additive): "Shown" (rows `N[+]`), "Filters on" (N), and when browsing
   (not searching) one tile per outcome with its count from `BrowsePage.counts`, in outcome order, each
   tile edged in its outcome colour (word + number). Hidden while loading the first page; on error the
   tiles are not drawn.
3. One dense row: search input + **Search**, then the filters disclosure (open from 1024px; its grid
   becomes 4 columns there).
4. Status line, error/empty states as in Daylight.
5. Results as a table (`ResultList` variant `table`, `<table class="results" aria-label="Search
   results|Library">`): columns: (status light, `aria-hidden`), Title (the link), Outcome (word), Kind,
   Board, Station, Source path (mono), Visible to, Excerpt (snippet, 2 lines clamped), Replaced by
   ("See what replaced it" link or empty). Below 1024px this ten-column table is stacked (smaller
   tables stack below 768px): each row a block, each cell prefixed by its column name (`data-label` +
   `::before` with empty alt text), with explicit ARIA table roles so Safari keeps the semantics. No
   sideways scroll at any width.
6. **More** right-aligned.

**Quiet**: a printed page.
1. `h1` "Library"; the time line if enabled; **Upload** as a secondary button on its own line.
2. Search form with a **visible** label "Search the library" above the input, and **Search**.
3. Filters disclosure, open by default at every width.
4. Status line, error/empty as today.
5. Results as a plain list (`ResultList` variant `plain`): title as an underlined link; then one
   sentence-like line "Outcome: Rejected. Work record · Marketing & Community · docs · out/report.md.
   Visible to: Everyone in the workspace."; then the snippet; then "See what replaced it". No faces, no
   cards, no colour edge (the outcome word keeps its colour).
6. **More**.

### 5.2 Item page (`/a/[itemId]`, `/a/[itemId]/v/[version]`)

The model (`ItemModel`) holds everything `ItemView.svelte` holds today (phase, refusal, item, versions,
shown version, frame error, record, removed, notice, copy status, delete date, pending dialog, busy,
dialog error), derived values (manage, current, latestLive, rows for details and provenance, header
meta, maker, expiry heading) and the actions (load, pick a version, show latest, retry viewer, copy,
revoke version, revoke item, confirm/cancel dialog, save expiry, moderation callbacks), plus the
attachments `viewer`, `noticeAnchor`, `refusalAnchor`, `removedAnchor`.

**States outside the ok page** (loading, expired, refused, removed, record failed) are one adaptive
component, `ItemStates`, in every vibe: today's markup and sentences, styled per vibe. The expired
page's "Keep it" panel uses the signal colour (D4). The toast notice and the confirm dialog are drawn by
the route around whichever layout is shown.

**The content starts right under the title in every vibe**: the top of the viewer is at most 130px
below the top of the `h1` on desktop and 170px on a phone (today's e2e budget, now run per vibe).

**Daylight**
1. Header band (`header.item-header`, background `--vk-product-superlibrary-bg`, text
   `--vk-product-superlibrary-fg`, radius lg, padding 12px phone / 16px wider): `h1`; meta line
   (`p.item-meta`): Face 24 (agent maker) · outcome badge · `vN` / `vN (latest)` · visibility ·
   `deleted on <date>`; the toolbar ("Upload a new version", managers, artifacts) on the right from
   768px, under the meta on phones.
2. The viewer (`div.viewer`), then the frame-error block.
3. Artifacts: two cards side by side from 800px: **Versions** (list variant) and **Details · version N**.
   Work records: the record's line (board · "Now at <stage>"), **Open the card in Superpipeline**,
   the two info notices, then the **Spec** as a "pinned brief" card (a small pin label "Brief" is
   decorative, `aria-hidden`), then **Timeline** as a conversation: each entry a bubble; entries with
   a `who` get a Face made from that name; good/bad tone colours the bubble edge; then **Artifacts**.
4. **Provenance** card.
5. **Related** and **Collections** cards side by side from 800px.
6. Managers: the Manage group (visually hidden `h2` "Manage" as today): **Moderate**, the delete-date
   panel and **Revoke**, two columns from 800px.

**Paper**: a letter with enclosures (column max 720px, the viewer full width).
1. Letterhead: a top row with the kicker `p.sl-kicker` "Superlibrary · Artifact" (or "Work record") and
   "Upload a new version" as a secondary button on the right; then `h1` in Newsreader; then a byline
   `p.item-meta`: portrait Face (agent maker) + "Created by <Created by words>" + outcome word + `vN (latest)` +
   visibility + `deleted on <date>`. (The button sits above the title so the content still starts
   within the title budget.)
2. The viewer framed as a sheet (1px rule, surface background), then the frame-error block.
3. Work records: the record line as a dateline, **Open the card in Superpipeline**, the notices, and
   the **Spec** as the letter's body (`dl` with run-in bold terms).
4. "Enclosed" (`h2`, additive) and the enclosures, each an `Enclosure` (a heading with a disclosure
   button, `aria-expanded`, `aria-controls`; the region is labelled by the heading): **Versions**
   ("3 versions · v3 latest"), **Details · version N** ("Markdown · 1.2 KB"), **Provenance**
   ("Created by …"), **Related**, **Collections**. Work records: **Timeline** (open) and **Artifacts**
   (open) come first. Versions is open by default; the others are open from 1024px and closed below,
   each with its summary text visible in the closed state.
5. Managers: `h2` "Manage" (visible here) and the three panels stacked, as a postscript.

**Studio**: a dashboard (full shell width).
1. Readout bar (`div.sl-readout`, mono): "ITEM" + the item id, a status light in the outcome colour
   (`aria-hidden`), the outcome word, the time readout on the right.
2. `h1`, the meta line as compact chips, the toolbar on the right.
3. The viewer, then the frame-error block.
4. Tiles (`dl.sl-tiles`, additive restatements, under the viewer so the content keeps the title
   budget): artifacts: Version (`vN of M`, plus "latest"), Size, Files, Kind, Uploaded; work records:
   Stage, Timeline entries, Artifacts linked.
5. Panels grid (1 column phone, 2 from 800px, 3 from 1280px), each panel a `section` with a mono `h2`:
   **Versions** (table variant: Version | Uploaded | Size | Files | Flags | action), **Details ·
   version N** (dense `dl`), **Provenance** (dense `dl`), **Related**, **Collections**. Work records:
   **Spec** (dense `dl`), **Timeline** as a log (`ol.timeline` styled as rows: light by tone | time |
   event | who | detail), **Artifacts**.
6. Managers: the Manage group as a command area: Moderate, delete date, Revoke panels in the grid,
   destructive buttons right-aligned.

**Quiet**: one column, max 720px, everything open.
1. A text link "← Library" (to `/`, additive), `h1`, then the facts as a plain `dl.sl-facts`: Outcome,
   Version (`vN (latest)`), Visible to, Delete date (only if set).
2. The viewer, the frame-error block, then "Upload a new version" as a secondary button (after the
   viewer, so the content keeps the title budget).
3. Artifacts: `h2` **Versions** (plain variant: one line per version: link, then "date · size · files",
   then the badges as words "Shown, Latest", then the Revoke button), `h2` **Details · version N**.
   Work records: the record line, the link button, notices, **Spec**, **Timeline** (plain ordered list),
   **Artifacts**.
4. `h2` **Provenance**, **Related**, **Collections**.
5. Managers: `h2` "Manage" (visible), then `h3` "Moderate", the delete-date form, `h3` "Revoke".

### 5.3 Collections (`/collections`)

The model (`CollectionsModel`): list, loading, error, name, description, creating, createError;
`load()`, `create()`. The create form stays **above** the list in every vibe, because the empty
sentence says "Create the first one above."

- **Daylight**: heading and blurb; the create form as a rounded card ("Name", "Description (optional)",
  **Create collection**); the list as cards in a grid (1 column phone, 2 from 768px, 3 from 1024px):
  name, "N items", description.
- **Paper**: masthead `h1` and the blurb as a standfirst (italic); dateline; the form as a single line
  of underlined fields; the list as a table of contents: name, a dotted leader, "N items", and the
  description in italics on the next line.
- **Studio**: `h1` + readout; the form as a command bar (inline fields + button); the list as a table
  (`aria-label="Collections"`): Name (link) | Items | Description; stacked below 768px.
- **Quiet**: `h1`, blurb, the form (labels above fields), the list as plain lines: "Name — N items —
  description".

### 5.4 One collection (`/collections/[id]`)

The model (`CollectionModel`): the collection, error, notice, editing, name, description, editError,
deleting (opener), busy, dialogError; `load()`, `startEdit()`, `save()`, `stopEditing()`,
`remove(itemId, title)`, `askDelete(e)`, `confirmDelete()`, `cancelDelete()`; attachment `renameAnchor`.
The toast and the delete dialog are drawn by the route around the layout. Error and loading are the
adaptive part (same in every vibe).

- **Daylight**: a header card: `h1`, the description, the meta "N items · created <date>", the actions
  **Rename or describe** and **Delete collection** (danger), or the inline edit form. Entries as cards
  with a 4px outcome edge: title link, outcome word, "added <date>", note; **Remove** on the card.
- **Paper**: the name as the letter title, the description as the body, the meta as a dateline; the
  actions as secondary buttons; the entries as a numbered list of enclosures (title link in serif,
  "Outcome · added <date>" in italics, the note quoted), **Remove** as a secondary button.
- **Studio**: readout; `h1`; tiles "Items" (N) and "Created" (date); actions in a command row; entries
  as a table (`aria-label="Items in this collection"`): Title | Outcome | Added | Note | action;
  stacked below 768px.
- **Quiet**: `h1`, description, meta, actions, then a plain list.

### 5.5 Adaptive screens (one layout, styled per vibe)

**Outcomes** (`/outcomes`), **Upload** (`/upload`), **Sign in** (`/login`), **Signing in**
(`/auth/callback`) and the root layout's notices (Connecting…, start error, not enabled, not signed in)
keep today's markup and order. They use vibekit type, colours, radii and controls; headings in the
vibe's display font; Outcomes renders its rows through `ResultList`, so it gets each vibe's row shape
from the home screen's phases. The Upload secret panel and the not-enabled notice use the signal
colour (D4). Sign in: the mark on the product chip, `h1` "Superlibrary", the sentence and **Sign in**
in a centred panel; in Daylight the panel sits on the `Sky`.

### 5.6 Interactions shared by every vibe

- Buttons: vibekit `.vk-button` (primary, secondary, quiet) plus the product danger style
  (`.sl-danger`: surface background, `--sl-danger` text, 2px inset border). Hover never lowers
  contrast (primary and danger keep their own background).
- Inputs, selects, textareas: 16px or more, 44px tall, 2px `--vk-color-faint` border, focus ring from
  vibekit.
- Disclosures (`details` and `Enclosure`): summary 44px tall; keyboard Enter/Space; the closed state
  shows what is inside (count or summary).
- Motion: Daylight cards lift 1px on hover (`--vk-motion-fast`, `--vk-motion-easing`); Paper fades
  enclosures in (`--vk-motion-base`); Studio lights blink only for work in progress (`in-progress`
  outcome), 1.6s; Quiet nothing. Vibe and theme changes use a same-document View Transition, skipped
  with reduced motion. `prefers-reduced-motion: reduce` turns every animation and transition off
  (vibekit base) and the product CSS uses only vibekit motion variables, so it obeys.

## 6. Parity table

Every inventory item (Superlibrary web inventory, origin/main 7307ebb) and where it appears in each
vibe. "Adaptive" = same place in every vibe. "=" = same as the Daylight cell. Sentences are unchanged
(D2). The test in §8.2 holds the strings and controls of this table.

### 6.1 Shell and root layout (adaptive)

| # | Item | Daylight | Paper | Studio | Quiet |
|---|---|---|---|---|---|
| S1 | Mark + "Superlibrary" home link | header left, mark on product chip | header left, mark beside serif name | header left, dense | header left, plain |
| S2 | Nav Library / Outcomes / Collections / Upload, current marked (Library also on `/a/*`) | header middle; phone: row of four under brand | = | = | = |
| S3 | "Products" switcher and its panel (heading "Super Jackfruit Labs", product links, current marked) | header right | = | = | = |
| S4 | "Account" button; detail "An owner/A member of this workspace · <principalId>" | header right; first line of the account menu | = | = | = |
| S5 | Theme System/Light/Dark | Account menu › **Appearance** dialog › "Light or dark" (System → Follow the sun, D1) | = | = | = |
| S6 | Sign out | account menu, last | = | = | = |
| S7 | Footer "Super Jackfruit Labs" link | page foot | = | = | = |
| S8 | Tab titles (`Library · Superlibrary`, …, `Not enabled · Superlibrary`) | unchanged | = | = | = |
| L1 | "Connecting…" | centred status | = | = | = |
| L2 | Start error (4 sentences) + Try again | centred alert + button | = | = | = |
| L3 | "Superlibrary is not enabled for this workspace" + "Enable it" + "(an owner of the workspace can)." | centred notice with signal edge | = | = | = |
| L4 | "Not signed in. Sign in" | centred status | = | = | = |
| NEW | Appearance dialog (vibe, light/dark, time of day, location) | account menu | = | = | = |

### 6.2 Library home (`/`)

| # | Item | Daylight | Paper | Studio | Quiet |
|---|---|---|---|---|---|
| H1 | `h1` Library | in the sky band | masthead | header row | top |
| H2 | Upload (primary; to /upload) | beside h1 in the sky band | beside h1 (secondary style) | header row right | own line under h1 |
| H3 | Search form: label "Search the library" (hidden), input, Search | pill in the sky band | underlined field under masthead | dense row with filters | label visible above input |
| H4 | Filters disclosure "Filters" / "Filters · N on"; open ≥768px | card under the sky | right sidebar ≥1024 (open), above results below | in the dense row; open ≥1024 | under search, open at all widths |
| F1–F5 | Kind, Board, Agent, Station, Active selects (all options) | in the disclosure grid | = (sidebar: one column) | = (4-column grid ≥1024) | = (one column) |
| F6 | From / To dates (custom period) | in the grid | = | = | = |
| F7 | Outcome fieldset, 7 checkboxes, word + colour | in the grid, full row | = | = | = |
| F8 | "Choose an end date on or after the start date." | under the grid | = | = | = |
| F9 | Clear filters (when N > 0, keeps q) | under the grid | = | = | = |
| H5 | Status line: Loading… / "The 25 best matches" / "N match(es)" / "N[+] item(s), most recent activity first" | above results | sidebar ≥1024, else above results | above results (also as the "Shown" tile) | above results |
| H6 | Error sentence + Try again (resumes cursor) | above results | = | = | = |
| H7 | Empty when searching: "Nothing matches." / "Try other words, or clear the filters." | empty card | plain centred | panel | plain |
| H8 | Empty library: "Nothing here yet" / "Upload a file or a folder, or link one from an agent's station." + Upload | empty card | = | = | = |
| R1 | Row title, whole row links to /a/<id> | card title | serif link | Title column | underlined link |
| R2 | Outcome word in its colour; row edge in outcome colour | pill + left edge | word in byline | Outcome column + status light | "Outcome: <word>." |
| R3 | Artifact/Work record · board name · station · source path | meta row | italic byline | Kind, Board, Station, Source path columns | in the facts line |
| R4 | Visibility words | meta row | with the outcome word | Visible to column | "Visible to: …" |
| R5 | Snippet (search) / caption (browse) | 3 lines | quoted excerpt | Excerpt column (2 lines) | own line |
| R6 | "See what replaced it" link | card foot | text link | Replaced by column | own line |
| R7 | List name "Search results" / "Library" | `ul` aria-label | = | `table` aria-label | `ul` aria-label |
| H9 | More / Loading… (disabled while loading) | under list | centred | right | under list |
| NEW | Greeting / dateline / readout / time line (§4.3) | sky band | masthead | header | under h1 if on |
| NEW | Agent face (§4.4) | 24px in card title row | portrait in byline | — (status light only) | — (no faces) |
| NEW | Outcome count tiles (browse) | — | — | tiles row | — |

### 6.3 Outcomes (`/outcomes`, adaptive)

| # | Item | All vibes |
|---|---|---|
| O1 | `h1` view title ("Everything rejected on Press this month") | top |
| O2 | Tabs nav "Outcome": Everything + total, 7 outcomes + counts, current marked | under h1 (vibe-styled pills / underlines / segments / plain links) |
| O3 | Filter disclosure without outcomes; Clear filters keeps outcome and period | under tabs |
| O4 | Status line | above rows |
| O5 | Error + Try again | above rows |
| O6 | "Nothing<outcome> here in this period. Try another board or a longer period." | in place of rows |
| O7 | Rows (as R1–R7, label = title) | the vibe's row shape (`ResultList`) |
| O8 | More | under rows |

### 6.4 Collections (`/collections`)

| # | Item | Daylight | Paper | Studio | Quiet |
|---|---|---|---|---|---|
| C1 | `h1` Collections | top | masthead | top + readout | top |
| C2 | Blurb "Named sets of items, put together by people. …" | under h1 | standfirst (italic) | under h1 | under h1 |
| C3–C5 | Form: Name (120), Description (optional) (1000), Create collection / Creating… | card above list | underlined line above list | command bar above list | plain form above list |
| C6 | "Give the collection a name." / server sentences | under the form | = | = | = |
| C7 | Loading… | list area | = | = | = |
| C8 | Error + Try again | list area | = | = | = |
| C9 | "No collections yet. Create the first one above." | list area | = | = | = |
| C10 | List "Collections": name (link), "N item(s)", " · description" | cards grid | table of contents | table: Name, Items, Description | plain lines |

### 6.5 One collection (`/collections/[id]`)

| # | Item | Daylight | Paper | Studio | Quiet |
|---|---|---|---|---|---|
| D1 | Toast: "Saved." / "Removed “<title>” from the collection." / error; Dismiss | top of page | = | = | = |
| D2 | Error + All collections | adaptive | = | = | = |
| D3 | Loading… | adaptive | = | = | = |
| D4 | `h1` name | header card | letter title | under readout | top |
| D5 | Description | header card | letter body | under h1 | under h1 |
| D6 | "N item(s) · created <date, time>" | header card | dateline | tiles Items + Created | under description |
| D7 | Rename or describe → form (Name, Description, Save, Cancel, error); focus back to the button | header card | under dateline | command row | under meta |
| D8 | Delete collection (danger) → dialog (title, message, Cancel, Delete collection / Working…, error) | header card | under dateline | command row | under meta |
| D9 | "Nothing in it yet. Open an item and choose **Add to collection**." | entries area | = | = | = |
| D10 | Entries "Items in this collection": title link, outcome, "added <date, time>", note | cards with outcome edge | numbered enclosures | table: Title, Outcome, Added, Note | plain list |
| D11 | Remove “<title>” from collection | on each card | secondary button per entry | action column | button per line |

### 6.6 Upload (`/upload`, adaptive)

| # | Item | All vibes |
|---|---|---|
| U1 | `h1` Upload / Upload a new version / Upload a new version of <title> | top |
| U2 | "Everyone in the workspace will be able to see it." / "Who will see the new version: …" | under h1 |
| U3 | Item read problems (3 sentences) | error line |
| U4–U9 | Title, Files, Folder, ".zip as the folder" checkbox, iPhone hint, Delete on (optional) | the form, in today's order |
| U10 | "N file(s) chosen[, size]." (live) | under the fields |
| U11 | Left-out notice (sentence or list + "…and N more") + explanation | under the count |
| U12 | "Show the files" disclosure | under the notice |
| U13 | Error line (all precheck / refusal / connection sentences) | above the button |
| U14 | Upload / Preparing… / Sending i of n… / Finishing… / Uploading… | form end |
| U15 | Secret panel: h2 (focused), alert, findings, explanation, Reason, Upload anyway | under the form, signal edge |

### 6.7 Item page (`/a/…`)

| # | Item | Daylight | Paper | Studio | Quiet |
|---|---|---|---|---|---|
| I1 | Loading… | adaptive `ItemStates` | = | = | = |
| I2 | Expired: h1, sentence, Keep it panel (Delete on, Set the delete date, Keep it (no delete date), error), Back to the library | adaptive, signal edge on the panel | = | = | = |
| I3 | Refused sentence (all `explain` codes) + Back to the library + Try again (unreachable only) | adaptive | = | = | = |
| I4 | Removed: h1 "Removed from memory" (focused) + sentence + Back to the library | adaptive | = | = | = |
| I5 | Toasts (7 notices), Dismiss; focus target after a dialog | top of page | = | = | = |
| IH1 | `h1` title | header band | letterhead | under readout | top |
| IH2 | Outcome word + colour | meta line | byline | readout + meta chips | facts: Outcome |
| IH3 | `vN` / `vN (latest)` | meta line | byline | meta chips (+ Version tile) | facts: Version |
| IH4 | Visibility words | meta line | byline | meta chips | facts: Visible to |
| IH5 | `deleted on <date>` | meta line | byline | meta chips | facts: Delete date |
| IH6 | Upload a new version (managers, artifacts) | toolbar in band | secondary button in the letterhead's top row | toolbar right | secondary button after the viewer |
| V1 | Viewer and its toolbar (version, Files (N), View source, Theme, Download, Full screen, Open in new window, Share panel, More) | under header | framed sheet | full width | under facts |
| V2 | Frame error + Show the latest version + Try again | under viewer | = | = | = |
| VS1 | Versions: vN (link or plain if revoked), "date · size · n file(s)", Shown / Latest / Revoked / Secret scan overridden, Revoke version N (managers) | card (list) | enclosure, open (list) | panel (table) | h2 section (plain) |
| DT1 | Details · version N: Item, Kind, Media type, Size, Files, Opens on, SHA-256 + note + Copy, Uploaded, Secret scan, Revoked; copy status; "No version of this item can be viewed." | card | enclosure (open ≥1024) | panel, dense | h2 section |
| P1 | Provenance: Created by, Station, Source path, Board, Stage, Card, Run, Created, Visible to, Outcome | card | enclosure (open ≥1024) | panel, dense | h2 section |
| RL1 | Related: Looking for related work… / could not be loaded / Nothing related found yet. / list (title, outcome, snippet) | card | enclosure | panel | h2 section |
| AC1 | Collections: load error + Try again; "No collections yet. Create one."; Collection select + Add to collection; result sentence | card | enclosure | panel | h2 section |
| M1 | Moderate: Caption + hint + Save caption + error (artifacts) | Manage group card | Manage postscript | Manage panel | Manage › h3 Moderate |
| M2 | Superseded by link + Undo superseded / Replaced by + Mark as superseded + 4 validation sentences + dialog | Moderate card | = | = | = |
| M3 | Show to everyone in the workspace (work records not shown to the workspace) + dialog | Moderate card | = | = | = |
| M4 | Remove from memory (danger) + dialog with required reason | Moderate card | = | = | = |
| E1 | Delete-date panel: "To be deleted on <date>" / "Delete on a date", Delete on, Set the delete date, Keep it (no delete date), "Choose a date after today." | Manage group card | postscript | panel | Manage section |
| RV1 | Revoke: h2, "Nobody will be able to view it again. The record of it stays.", Revoke this item + dialog (optional reason) | Manage group card | postscript | panel, button right | Manage › h3 Revoke |
| DG1 | Confirm dialogs (title, message, Cancel focused, exact action, Working…, error, Escape, focus back) | modal over page | = | = | = |
| W1 | Board name (or id) · "Now at <stage>" | under header | dateline | Stage tile + readout | first line |
| W2 | Open the card in Superpipeline (https only, new tab, noopener) | under the record line | = | = | = |
| W3 | "Some text was hidden because it looked like a secret." / "This record is long: …" | info notices | = | = | = |
| W4 | Spec: h2 + every key/value | pinned brief card | letter body | panel, dense | h2 section |
| W5 | Timeline: Card created, attempts (`<stage> · attempt <n> · <status>`, who, detail), comments, gates, Archived; time or "Time not recorded" | conversation bubbles (`ol.timeline`) | enclosure, open, correspondence | log rows (`ol.timeline`) | plain `ol.timeline` |
| W6 | Artifacts: title + `v<latest>` / "No artifacts linked that you can see." | card | enclosure, open | panel | h2 section |
| W7 | "The record could not be loaded." + Try again | adaptive | = | = | = |
| NEW | Maker face | meta line | byline portrait | — | — |
| NEW | Tiles (version, size, files, kind, uploaded / stage, entries, artifacts) | — | — | tiles row under the viewer | — |
| NEW | "Enclosed" heading, visible "Manage" heading, "← Library" link | — | Enclosed, Manage | — | Manage, ← Library |

### 6.8 Sign in and callback (adaptive)

| # | Item | All vibes |
|---|---|---|
| LG1 | Mark (`data-testid="superlibrary-mark"` in `main`), `h1` Superlibrary, "Sign in with your Super Jackfruit Labs account.", Sign in, the 4 error sentences | centred panel (Daylight: on the sky) |
| CB1 | "Signing you in…", "Taking you to sign in…", the 3 failure sentences, "Back to sign-in" | centred |

### 6.9 Viewer toolbar (packages/embed, unchanged)

The embed is not changed. Its toolbar and panels look the same in structure in every vibe; only the
host hooks change: `--sl-host-bg` = `--vk-color-surface`, `-fg` = `--vk-color-text`, `-muted` =
`--vk-color-muted`, `-line` = `--vk-color-line`, `-hover` = `--vk-color-raised`, `-accent` =
`--vk-color-primary`, `-accent-content` = `--vk-color-primary-fg`, `-danger` = `--sl-danger`, the same
for each `-dark` hook (the page's current values, since the toolbar always follows the page), and
`--sl-host-font` = `--vk-font-body`. The embed's own Theme select stays (its per-device choice still
wins inside the frame, as today).

## 7. Information added (not required, all additive)

Greeting / dateline / readout; agent faces; Studio's outcome count tiles and item tiles; Paper's
"Enclosed" heading and visible "Manage"; Quiet's "← Library" link and visible "Manage" heading;
the Appearance dialog. None of these removes or replaces an inventory item.

## 8. Accessibility, performance and tests

### 8.1 Requirements

- WCAG 2.2 AA. Text 4.5:1 and interface parts 3:1 in every vibe × theme (vibekit checks its tokens;
  `product-tokens.test.ts` checks Superlibrary's against every look; axe checks the rendered pages).
- 44px targets for every control at 390px in every vibe (the `shortControls` check, now per vibe).
- Inputs 16px or more (vibekit field rule + `app.css`).
- Full keyboard use; visible focus (vibekit `--vk-focus`, forced-colors outline); dialogs trap focus
  and return it; disclosures operable by Enter/Space; no keyboard trap in the stacked tables.
- Reduced motion wins (vibekit base + only vibekit motion variables in product CSS).
- No layout shift from the vibe: attributes are set by the head script before the first paint; the
  phase refinement only changes colours. The old 768px filters-open flip stays as today.
- No sideways scroll at 390–1920px in every vibe (tables stack below 768px).
- Speed: only the active vibe's fonts are fetched (Fontsource `@font-face`, `font-display: swap`); no
  Google Fonts request; added JS (vibekit + bits-ui) at most 60 KB gzipped over today's build (measure
  with `vite build`); first load renders the same number of requests as today plus the fonts.

### 8.2 Tests

**Unit and component (Vitest, `pnpm -C apps/web test`, CI job `test`):**

| Test | What it holds |
|---|---|
| `lib/vibe/product-tokens.test.ts` (new) | every `--sl-*` colour against `bg`/`surface`/`raised` of all 8 looks, read from the vendored vibekit `tokens.css`; the mark at 3:1 |
| `lib/vibe/app-html.test.ts` (new) | `app.html` holds vibekit's `HEAD_SCRIPT` verbatim, before `%sveltekit.head%` and before any stylesheet; no Google Fonts; no `superlibrary:theme` script left |
| `lib/vibe/appearance.test.ts` (new) | cookie read/write (host-only, Secure on https), migration of the old theme key, junk cookie falls back, blocked storage never throws, phase and attributes painted, vibe change resets strength, location rounding and refusal |
| `lib/vibe/layout.test.ts` (new) | `pickLayout` returns the vibe's layout or Daylight's |
| `lib/vibe/AppearanceDialog.svelte.test.ts` (new) | radios and segments change `look`; Escape and Done close; focus returns to the opener |
| `lib/layouts/parity.svelte.test.ts` (new) | for each vibe × each key screen, mounts the layout with a full fixture model (all optional fields present, manager, agent maker) and asserts every string and control in `lib/screens/parity.ts` is in the page (opening every disclosure first) |
| `lib/kit/kit.test.ts` (changed) | the literal scan now exempts only `lib/vibe/superlibrary.css`; `outcomeVar('rejected')` is `var(--sl-outcome-rejected)`; the embed host hooks read `var(--vk-…)`/`var(--sl-…)`; the primary/danger hover rule is rewritten for `.vk-button--primary` and `.sl-danger` |
| `lib/kit/tokens.test.ts`, `lib/kit/theme.test.ts` | deleted with what they tested |
| `lib/kit/SuiteHeader.svelte.test.ts` (changed) | the menu holds the detail, **Appearance** (calls `onappearance`) and Sign out; no theme radios |
| `lib/kit/SuiteSwitcher.svelte.test.ts` (changed) | the hexagon-mark test is deleted; the heading is the name; products keep addresses and the current mark |
| all other existing tests | unchanged and green (they mount routes, which now pick the Daylight layout by default) |

**End to end (Playwright, `pnpm --filter @superlibrary/web e2e`, CI job `e2e`):**

- Existing specs run unchanged with no cookie (Daylight, follow the sun). Their pinned selectors are
  kept in the Daylight layouts and the shell: `header.suite-shell`, `.suite-shell-brand`,
  `.suite-shell-account`, `.suite-shell-nav`, `.viewer`, `ol.timeline`, `.results .result-link`,
  `.results li`, `.secrets code`, `.heading a[href="/upload"]`, `[data-testid="superlibrary-mark"]`, and
  every role/name and sentence they assert.
- `e2e/appearance.spec.ts` (new): with the cookie `paper.dark.strong.0`, the page's `<html>` has
  `data-vibe="paper"`, `data-theme="dark"` even when the app's JavaScript is blocked (the head script
  alone paints); the body background is Paper dark's `bg`; the picker changes vibe and theme, writes
  the cookie and survives a reload; Escape closes it back to Account; with reduced motion no view
  transition runs.
- `e2e/vibes.spec.ts` (new, Chromium): for each vibe × theme on `/`, an artifact page, a work-record
  page, `/collections` and a collection: axe (`wcag2a`, `wcag2aa`, `wcag21aa`, `wcag22aa`) with no
  violations; no sideways scroll at 390 and 1280; no control under 44px at 390; the viewer within the
  title budget on the artifact page; a full-page screenshot attached to the report
  (`toHaveScreenshot` only with `PW_VISUAL=1`, D10).
- `e2e/parity.spec.ts` (new, Chromium): for each vibe, the real stack's key controls and words are
  present and work (search, filters, a row, Upload; on an owned artifact: Versions, Details, Provenance,
  Related, Collections add, Mark as superseded dialog, Revoke this item; on a collection: Rename,
  Delete dialog, Remove).

## 9. Rollout (each phase shippable)

| Phase | Ships | Gate |
|---|---|---|
| **1. Foundation and Daylight** | vibekit vendored; product tokens; fonts and old tokens retired; head script; appearance state and dialog; layout selector; view models; Daylight layouts of `/`, item and collections; adaptive Outcomes, Upload, Sign in, callback, notices restyled; all four vibes selectable (Paper, Studio and Quiet use the Daylight layouts, in their own colours, type and radii); new unit, parity and e2e tests. | CI green (test, e2e) on the PR; merge → deploy-web; live check §9.1 |
| **2. Paper** | `LibraryPaper`, `ResultList` index variant, `ItemPaper` (+ `Enclosure`), `CollectionsPaper`, `CollectionPaper`; registry entries; parity and vibes specs cover Paper's own layouts | same |
| **3. Studio** | `LibraryStudio`, table variants (results, versions, collections, entries), `ItemStudio` (tiles, log timeline), `CollectionsStudio`, `CollectionStudio` | same |
| **4. Quiet** | `LibraryQuiet`, plain variants, `ItemQuiet`, `CollectionsQuiet`, `CollectionQuiet` | same |

Phases 2–4 are independent of each other and can be built in parallel by three implementers after
phase 1 merges; each touches only its own layout files, its variant in each section, its CSS file
(`lib/layouts/<vibe>.css`) and one line per screen in `registry.ts`.

### 9.1 Deploy and live check

Merging to `main` runs `.github/workflows/ci.yml`: `test` and `e2e` must pass, then `deploy-api`
(unchanged code, no-op), `deploy-content` and `deploy-web` (`wrangler pages deploy` of
`apps/web/build` to the Pages project `superlibrary-web`, https://app.superlibrary.dev). Branch
protection is not enforced, so the PR must be green before merging by hand.

Live check after each deploy:
1. `curl -s https://app.superlibrary.dev/ | grep -c 'vk_appearance'` prints `1` (head script shipped).
2. `curl -s https://app.superlibrary.dev/ | grep -c 'fonts.googleapis'` prints `0`.
3. In a browser: the library home shows the Daylight sky; Account › Appearance › Paper / Dark repaints
   at once; reload keeps it; an artifact opens in the viewer; DevTools shows `vk_appearance` on
   `app.superlibrary.dev`.
4. On the iPhone (the operator's primary platform): the same, and nothing scrolls sideways.

## 10. Risks

| # | Risk | Mitigation |
|---|---|---|
| R1 | vibekit's foundations are still being built; its API may move before the tarball is cut. | Task 1 copies the tarball produced by `pnpm pack` after vibekit's `pnpm verify` passes and records its SHA-256; the plan names every export it uses, so a rename fails `svelte-check` at once. |
| R2 | A per-vibe layout drops a field. | D9 (sections own fields) and the parity test over `lib/screens/parity.ts` in every vibe; e2e parity on the real stack. |
| R3 | The vendored package's `.svelte` files are not compiled in Vitest. | `test.server.deps.inline: ['@superjackfruit/vibekit']` in `vitest.config.ts` from Task 1. |
| R4 | The viewer inside the iframe stays in the old light/dark look (apps/content). | Accepted for now; it already follows light/dark. Passing the vibe to `/_view` is a later plan. |
| R5 | "Follow the sun" is dark only at night, not by the OS setting (D1). | Stated in the dialog hint; Light and Dark remain explicit choices. |
| R6 | Visual regressions slip without pixel comparison (D10). | Screenshots are attached to every CI run for review; a follow-up generates Linux baselines in CI and turns on `PW_VISUAL=1`. |
| R7 | Rewritten CSS breaks an e2e selector. | The pinned selectors in §8.2 are listed in the plan's Global Constraints; e2e runs on every PR. |
| R8 | Vibe change re-creates sections (D12): a caption being typed is lost. | Accepted; noted. |
| R9 | The cookie is per host; Superpipeline will not see Superlibrary's choice yet. | Accounts profile sync is the suite's next plan. |
| R10 | A blocked or private-mode storage or cookie. | Every read and write is in try/catch; the head script has its own try; defaults are Daylight / follow the sun. |
