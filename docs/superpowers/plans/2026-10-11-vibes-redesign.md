# Superlibrary on vibekit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Superlibrary's web app (`apps/web`) onto vibekit: four person-chosen vibes, each in light and dark with time-of-day awareness, with a layout of its own for the library home, the item page and collections, and nothing that is visible today hidden in any vibe. Phase 1 (vibekit, appearance, Daylight layouts of every screen) ships alone; phases 2–4 add the Paper, Studio and Quiet layouts.

**Architecture:** vibekit is vendored as a tarball. An inline head script paints `data-vibe/theme/phase/time` on `<html>` before the first frame; `lib/vibe/appearance.svelte.ts` keeps the person's setting in a host-only cookie and refines the phase. Each key screen has one view model (a class with `$state` in `lib/screens/`) and one layout per vibe (`lib/layouts/<screen>/`), chosen in one place (`VibeLayout` + `lib/layouts/registry.ts`, falling back to Daylight). Shared section components (`lib/sections/`) render every field; layouts only arrange them. Product colours (outcomes, danger, mark) are product tokens built on vibekit and contrast-checked against every look.

**Tech Stack:** SvelteKit 2.70 (adapter-static, `ssr=false`), Svelte 5.57 (runes, `{@attach}`), Vite 8, TypeScript 6, Vitest 4 (jsdom component tests), Playwright 1.61 + `@axe-core/playwright` 4.13.0, pnpm 11.5.2, vibekit 0.0.1 (`@superjackfruit/vibekit`: tokens CSS, fonts, `HEAD_SCRIPT`, `phaseAt`, `appearanceCookie`, `Face`, `Sky`, `Segmented`, `greeting`, `contrastRatio`).

**Spec:** `docs/superpowers/specs/2026-10-11-vibes-redesign-design.md` (this repository). Suite spec: vibekit `docs/specs/2026-10-11-vibes-design.md`.

## Global Constraints

- **No information visible today may disappear in any vibe.** The parity table (spec §6) is the contract; `lib/screens/parity.fixture.ts` holds it as data and `lib/layouts/parity.svelte.test.ts` runs it in every vibe. A layout may move, wrap or label-disclose a field; it may not drop it. Never edit a parity list to make a test pass; fix the layout.
- **Sentences do not change** (spec D2). Every error, empty state, dialog, toast, status line, button and label keeps its exact words in every vibe. Studio's upper-case labels are CSS `text-transform` only.
- **Selectors pinned by existing tests stay** in the shell and the Daylight layouts: `header.suite-shell`, `.suite-shell-brand`, `.suite-shell-nav`, `.suite-shell-end`, `.suite-shell-account`, `.suite-shell-menu`, `button.suite-switcher`, `.viewer`, `ol.timeline` (every vibe), `.results .result-link` and `.results li` (Daylight rows), `.secrets code`, `.heading a[href="/upload"]`, `[data-testid="superlibrary-mark"]`, `.item-header`, and every role/name the e2e specs use.
- **Colours**: product CSS uses only `--vk-*` and `--sl-*` variables. The one file with colour literals is `apps/web/src/lib/vibe/superlibrary.css`. vibekit's signal colour (`--vk-color-signal*`) is used only for the three "person must act" panels (spec D4). Danger is `--sl-danger`.
- **Accessibility**: text 4.5:1, parts 3:1; every control at least 44px tall at 390px; inputs `font-size: max(16px, 1rem)`; full keyboard use; visible focus; dialogs trap and return focus; reduced motion wins (use only `--vk-motion-*` in product CSS); no sideways scroll at 390–1920px in any vibe.
- **One place picks a layout**: only `lib/layouts/registry.ts` maps vibes to layouts and row variants. No `{#if vibe === …}` in layouts or sections; per-vibe styling is CSS under `[data-vibe="…"]`.
- **No API changes**; `packages/embed`, `packages/contract`, `apps/api`, `apps/content` are not edited.
- **No agent or host names** in shipped code; agents appear by principal id (`An agent (prn_…)`).
- `{@html}`, `innerHTML` and browser dialogs stay banned (existing guard tests).
- Run commands from the repository root unless a step says otherwise. The web app's tests: `pnpm -C apps/web test`; type check: `pnpm -C apps/web typecheck`; e2e: `pnpm --filter @superlibrary/web e2e` (boots the real stack; first time `pnpm --filter @superlibrary/web exec playwright install chromium webkit`).
- Commit after each task with a message ending in:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8
  ```

## Review Focus

1. **Parity**: a per-vibe layout that renders a section's fields itself instead of using the section, or wraps a section in something that is not keyboard/screen-reader reachable. Owned by Tasks 13, 16–26.
2. **The viewer re-mount**: `ItemModel.viewer` is an attachment; switching vibe or version must destroy the old embed and mount one new embed, never two (a pending mount resolved after teardown is destroyed). Owned by Task 9.
3. **Focus returns**: after the delete dialog, after Rename/Cancel, after Remove from memory (heading), after the Appearance dialog (Account button). Owned by Tasks 6, 9, 11.
4. **First paint**: `app.html` holds vibekit's `HEAD_SCRIPT` verbatim before any stylesheet; a stale copy after a vibekit update fails `app-html.test.ts`. Owned by Task 3.
5. **Cookie hygiene**: host-only, `Secure` only on https (Playwright WebKit on http://localhost rejects Secure cookies), junk falls back, blocked storage never throws. Owned by Task 3.
6. **Contrast of product tokens** against every vibe × theme, read from the vendored vibekit CSS. Owned by Task 2.

---

## File structure

```
apps/web/
  vendor/vibekit-0.0.1.tgz, vendor/vibekit-0.0.1.tgz.sha256      vendored vibekit (Task 1)
  scripts/sync-head-script.mjs                                    writes HEAD_SCRIPT into app.html (Task 3)
  src/app.html                                                    head script, theme-color (Task 3)
  src/app.css                                                     page structure on --vk-* (Task 4)
  src/lib/kit/kit.css                                             kit + shell on --vk-* (Task 4)
  src/lib/vibe/
    superlibrary.css, product-tokens.test.ts                      product tokens (Task 2)
    appearance.svelte.ts, appearance.test.ts                      the person's setting (Task 3)
    app-html.test.ts, vendor.test.ts                              guards (Tasks 1, 3)
    suite.ts                                                      parent + products (Task 5)
    copy.ts, faces.ts, faces.test.ts                              words, makers (Tasks 6, 7)
    AppearanceDialog.svelte, AppearanceDialog.svelte.test.ts      the picker (Task 6)
    layout.ts, layout.test.ts, VibeLayout.svelte                  the one place a layout is chosen (Task 7)
    (lib/layouts/rows.ts holds ROWS, the row shape per vibe, re-exported by the registry)
    vibes.css                                                     per-vibe flavour of shell + adaptive screens (Task 12)
  src/lib/screens/
    library.svelte.ts, item.svelte.ts, collections.svelte.ts      view models (Tasks 8, 9, 11)
    parity.fixture.ts                                             the inventory as data + API fixture (Task 13)
  src/lib/sections/                                               shared field blocks (Tasks 8, 10)
    SearchForm, LibraryStatus, LibraryResults, VersionsSection, DetailsSection, ProvenanceSection,
    FrameError, ExpiryForm, ManageSection, RecordLine, SpecRows, Timeline, LinkedArtifacts, RecordFailed,
    Enclosure (Task 17), Tiles (Task 20)
  src/lib/layouts/
    registry.ts                                                   which vibe has which layout (Task 7, +1 line per later task)
    daylight.css, paper.css, studio.css, quiet.css                layout styles (Tasks 8, 16, 20, 24)
    library/Library{Daylight,Paper,Studio,Quiet}.svelte
    item/ItemStates.svelte, item/Item{Daylight,Paper,Studio,Quiet}.svelte
    collections/Collections{…}.svelte, collections/Collection{…}.svelte
    parity.svelte.test.ts                                         parity in every vibe (Task 13)
  e2e/vibes.ts, e2e/appearance.spec.ts, e2e/vibes.spec.ts, e2e/parity.spec.ts   (Task 14)
Deleted: design/tokens.toml, scripts/generate-tokens.mjs, scripts/tokens.mjs, apps/web/src/lib/kit/{tokens.css,
tokens.test.ts,suite.generated.ts,ParentMark.svelte,theme.svelte.ts,theme.test.ts}
```

---

# Phase 1: vibekit, appearance and Daylight (ships alone)

### Task 1: Vendor vibekit

**Files:**
- Create: `apps/web/vendor/vibekit-0.0.1.tgz`, `apps/web/vendor/vibekit-0.0.1.tgz.sha256`, `apps/web/src/lib/vibe/vendor.test.ts`
- Modify: `apps/web/package.json`, `apps/web/vitest.config.ts`, `pnpm-lock.yaml`, `apps/web/src/routes/+layout.svelte` (font imports only)

**Interfaces:**
- Consumes: vibekit's packed tarball (vibekit plan Task 13 done, `pnpm verify` green on `feat/foundations` or vibekit `main`).
- Produces: `@superjackfruit/vibekit` importable from the web app, in Vite, svelte-check and Vitest.

- [ ] **Step 1: Pack vibekit**

```bash
cd /Users/rakeshgangwar/SuperJackfruit/vibekit-worktrees/foundations
git log --oneline -1 && pnpm verify
mkdir -p /tmp/vk && pnpm pack --pack-destination /tmp/vk
ls /tmp/vk
```
Expected: `pnpm verify` ends without errors; `/tmp/vk/superjackfruit-vibekit-0.0.1.tgz` exists. If `verify` fails, stop: vibekit is not ready (report it, do not vendor a broken build).

- [ ] **Step 2: Copy it in and record its checksum**

```bash
cd <superlibrary worktree>
mkdir -p apps/web/vendor
cp /tmp/vk/superjackfruit-vibekit-0.0.1.tgz apps/web/vendor/vibekit-0.0.1.tgz
(cd apps/web/vendor && shasum -a 256 vibekit-0.0.1.tgz > vibekit-0.0.1.tgz.sha256 && cat vibekit-0.0.1.tgz.sha256)
```

- [ ] **Step 3: Write the failing test** at `apps/web/src/lib/vibe/vendor.test.ts`

```ts
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HEAD_SCRIPT, VIBES, contrastRatio, phaseAt } from '@superjackfruit/vibekit';

const WEB = join(import.meta.dirname, '..', '..', '..');
const require = createRequire(import.meta.url);

describe('vibekit is vendored', () => {
  it('its exports resolve', () => {
    expect([...VIBES]).toEqual(['daylight', 'paper', 'studio', 'quiet']);
    expect(HEAD_SCRIPT).toContain('vk_appearance');
    expect(contrastRatio('#ffffff', '#000000')).toBeCloseTo(21, 0);
    expect(phaseAt(new Date(2026, 9, 11, 12, 0))).toBe('noon');
  });

  it('the tarball is the one whose checksum is recorded', () => {
    const tgz = readFileSync(join(WEB, 'vendor', 'vibekit-0.0.1.tgz'));
    const recorded = readFileSync(join(WEB, 'vendor', 'vibekit-0.0.1.tgz.sha256'), 'utf8').trim().split(/\s+/)[0];
    expect(createHash('sha256').update(tgz).digest('hex')).toBe(recorded);
  });

  it('ships the stylesheets the app imports', () => {
    for (const f of ['vibekit.css', 'fonts.css', 'tokens.css']) expect(existsSync(require.resolve(`@superjackfruit/vibekit/${f}`)), f).toBe(true);
  });

  it('the retired fonts are gone', () => {
    const pkg = JSON.parse(readFileSync(join(WEB, 'package.json'), 'utf8')) as { dependencies: Record<string, string> };
    expect(pkg.dependencies['@superjackfruit/vibekit']).toBe('file:./vendor/vibekit-0.0.1.tgz');
    expect(Object.keys(pkg.dependencies).filter((d) => d.includes('ibm-plex'))).toEqual([]);
  });
});
```

- [ ] **Step 4: Run it to see it fail**

Run: `pnpm -C apps/web exec vitest run src/lib/vibe/vendor.test.ts`
Expected: FAIL, `Failed to resolve import "@superjackfruit/vibekit"`.

- [ ] **Step 5: Add the dependency and drop IBM Plex**

In `apps/web/package.json` `dependencies`: remove `@fontsource/ibm-plex-mono` and `@fontsource/ibm-plex-sans`; add `"@superjackfruit/vibekit": "file:./vendor/vibekit-0.0.1.tgz"`. In `apps/web/src/routes/+layout.svelte` delete the four `@fontsource/ibm-plex-*` imports and the comment above them, and add in their place:

```ts
  import '@superjackfruit/vibekit/fonts.css';
  import '@superjackfruit/vibekit/vibekit.css';
```

In `apps/web/vitest.config.ts`, inside `test: { … }`, add (vibekit ships `.svelte` files and bits-ui; Vitest must compile them, not externalise them):

```ts
    server: { deps: { inline: ['@superjackfruit/vibekit', 'bits-ui'] } },
```

Then install (this updates `pnpm-lock.yaml`, which is committed):

```bash
pnpm install
```

- [ ] **Step 6: Run it to see it pass, and the whole suite**

Run: `pnpm -C apps/web exec vitest run src/lib/vibe/vendor.test.ts && pnpm -C apps/web test && pnpm -C apps/web typecheck`
Expected: PASS (4 tests); the whole suite still passes (the old `tokens.css` and kit still load; the page now renders in vibekit's fonts under the old colours); typecheck 0 errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/vendor apps/web/package.json apps/web/vitest.config.ts apps/web/src/lib/vibe/vendor.test.ts apps/web/src/routes/+layout.svelte pnpm-lock.yaml
git commit -m "Vendor vibekit 0.0.1 and load its fonts in place of IBM Plex" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8"
```

---

### Task 2: Product tokens on vibekit, checked against every look

**Files:**
- Create: `apps/web/src/lib/vibe/superlibrary.css`, `apps/web/src/lib/vibe/product-tokens.test.ts`
- Modify: `apps/web/src/routes/+layout.svelte` (one import)

**Interfaces:**
- Consumes: vibekit `tokens.css` (`[data-vibe="X"][data-theme="Y"] { … }` blocks), `contrastRatio`, `VIBES`, `THEMES`; `OUTCOMES` from `@superlibrary/contract`.
- Produces: CSS variables `--sl-outcome-<outcome>`, `--sl-danger`, `--sl-mark`, `--sl-scrim`, `--sl-shadow-overlay`, defined for light and dark.

- [ ] **Step 1: Write the failing test** at `apps/web/src/lib/vibe/product-tokens.test.ts`

```ts
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { OUTCOMES } from '@superlibrary/contract';
import { THEMES, VIBES, contrastRatio } from '@superjackfruit/vibekit';

const require = createRequire(import.meta.url);
const vk = readFileSync(require.resolve('@superjackfruit/vibekit/tokens.css'), 'utf8');
const sl = readFileSync(join(import.meta.dirname, 'superlibrary.css'), 'utf8');

/** The body of the first rule whose selector is exactly `selector`. */
function block(css: string, selector: string): string {
  const i = css.indexOf(`${selector} {`);
  if (i < 0) throw new Error(`no block for ${selector}`);
  return css.slice(i, css.indexOf('}', i));
}
function hex(body: string, name: string): string {
  const m = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})\\b`).exec(body);
  if (!m) throw new Error(`--${name} is not a six-digit hex colour here`);
  return m[1]!.toLowerCase();
}
const PRODUCT = { light: block(sl, ':root, [data-theme="light"]'), dark: block(sl, '[data-theme="dark"]') } as const;
const TEXT = [...OUTCOMES.map((o) => `sl-outcome-${o}`), 'sl-danger'];

describe('Superlibrary tokens, built on vibekit', () => {
  for (const vibe of VIBES) {
    for (const theme of THEMES) {
      const look = () => block(vk, `[data-vibe="${vibe}"][data-theme="${theme}"]`);
      it(`${vibe} ${theme}: every outcome and danger reads at 4.5:1 on bg, surface and raised`, () => {
        const grounds = ['bg', 'surface', 'raised'].map((g) => [g, hex(look(), `vk-color-${g}`)] as const);
        const short = TEXT.flatMap((n) =>
          grounds.map(([g, ground]) => ({ n, g, r: contrastRatio(hex(PRODUCT[theme], n), ground) })),
        ).filter((x) => x.r < 4.5).map((x) => `${x.n} on ${x.g}: ${x.r.toFixed(2)}`);
        expect(short).toEqual([]);
      });
      it(`${vibe} ${theme}: the mark is 3:1 on the page and on the product chip`, () => {
        const mark = hex(look(), 'vk-product-superlibrary-fg');
        expect(contrastRatio(mark, hex(look(), 'vk-color-bg'))).toBeGreaterThanOrEqual(3);
        expect(contrastRatio(mark, hex(look(), 'vk-product-superlibrary-bg'))).toBeGreaterThanOrEqual(3);
      });
    }
  }

  it('defines each token in both themes, and the mark from vibekit', () => {
    for (const n of [...TEXT, 'sl-scrim', 'sl-shadow-overlay']) {
      expect(PRODUCT.light, n).toContain(`--${n}:`);
      expect(PRODUCT.dark, n).toContain(`--${n}:`);
    }
    expect(sl).toContain('--sl-mark: var(--vk-product-superlibrary-fg);');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm -C apps/web exec vitest run src/lib/vibe/product-tokens.test.ts`
Expected: FAIL, ENOENT for `superlibrary.css`.

- [ ] **Step 3: Write** `apps/web/src/lib/vibe/superlibrary.css` (selectors exactly as written: the test finds blocks by them)

```css
/* Superlibrary's own meanings, built on vibekit. The only file in the app with colour literals:
   product-tokens.test.ts checks each against every vibe's bg, surface and raised, in both themes.
   An outcome is always shown as a word plus its colour. Danger is not vibekit's signal (that means
   "a person is needed" and nothing else). */
:root, [data-theme="light"] {
  --sl-outcome-approved: #13663b;
  --sl-outcome-completed: #0b625c;
  --sl-outcome-in-progress: #2356c2;
  --sl-outcome-superseded: #6d4fb3;
  --sl-outcome-rejected: #b42318;
  --sl-outcome-failed: #a14306;
  --sl-outcome-abandoned: #5a5a5f;
  --sl-danger: #ad2e1f;
  --sl-scrim: rgb(20 18 30 / 0.45);
  --sl-shadow-overlay: 0 12px 32px rgb(20 18 30 / 0.18);
}

[data-theme="dark"] {
  --sl-outcome-approved: #4cc38a;
  --sl-outcome-completed: #2dd4bf;
  --sl-outcome-in-progress: #8ab4ff;
  --sl-outcome-superseded: #b39cf0;
  --sl-outcome-rejected: #ff6b5b;
  --sl-outcome-failed: #f79009;
  --sl-outcome-abandoned: #98989d;
  --sl-danger: #ff6b5b;
  --sl-scrim: rgb(0 0 0 / 0.6);
  --sl-shadow-overlay: 0 12px 32px rgb(0 0 0 / 0.5);
}

:root {
  --sl-mark: var(--vk-product-superlibrary-fg);
}
```

In `+layout.svelte`, after the two vibekit imports, add `import '$lib/vibe/superlibrary.css';`.

- [ ] **Step 4: Run it to see it pass**

Run: `pnpm -C apps/web exec vitest run src/lib/vibe/product-tokens.test.ts`
Expected: PASS (17 tests). If a pair fails because the vendored vibekit's colours differ from the values this plan was checked against, darken (light) or lighten (dark) that product colour in small steps until it passes; never lower the threshold.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/vibe/superlibrary.css apps/web/src/lib/vibe/product-tokens.test.ts apps/web/src/routes/+layout.svelte
git commit -m "Product tokens on vibekit: outcomes, danger and the mark, contrast-checked in every vibe" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8"
```

---

### Task 3: The person's appearance, the cookie and the no-flash head script

**Files:**
- Create: `apps/web/src/lib/vibe/appearance.svelte.ts`, `apps/web/src/lib/vibe/appearance.test.ts`, `apps/web/src/lib/vibe/app-html.test.ts`, `apps/web/scripts/sync-head-script.mjs`
- Modify: `apps/web/src/app.html`, `apps/web/static/manifest.webmanifest`, `apps/web/src/routes/+layout.svelte`

**Interfaces:**
- Consumes: vibekit `Appearance`, `DEFAULT_APPEARANCE`, `COOKIE_NAME`, `appearanceCookie`, `appearanceFromCookieHeader`, `defaultTimeStrength`, `htmlAttributes`, `phaseAt`, `HEAD_SCRIPT`, types `Phase`, `Place`, `Theme`, `TimeStrength`, `Vibe`, `ThemePreference`.
- Produces (from `$lib/vibe/appearance.svelte`):
  - `look: { appearance: Appearance; phase: Phase; theme: Theme; now: Date }` (reactive `$state`)
  - `initAppearance(doc?: Document, now?: () => Date): () => void`
  - `setAppearance(next: Appearance, doc?: Document): void`
  - `chooseVibe(v: Vibe)`, `chooseTheme(t: ThemePreference)`, `chooseStrength(s: TimeStrength)`, `chooseLocation(on: boolean): Promise<boolean>`
  - `OLD_THEME_KEY = 'superlibrary:theme'`, `PLACE_KEY = 'superlibrary:place'`

- [ ] **Step 1: Write the failing tests**

`apps/web/src/lib/vibe/appearance.test.ts`:

```ts
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_APPEARANCE } from '@superjackfruit/vibekit';
import { OLD_THEME_KEY, PLACE_KEY, chooseLocation, chooseVibe, initAppearance, look, setAppearance } from './appearance.svelte';

const html = () => document.documentElement;
const attrs = () => ({ vibe: html().dataset.vibe, theme: html().dataset.theme, phase: html().dataset.phase, time: html().dataset.time });
const noon = () => new Date(2026, 9, 11, 12, 0);
const night = () => new Date(2026, 9, 11, 23, 0);
const clearCookies = () => {
  for (const c of document.cookie.split('; ')) if (c) document.cookie = `${c.split('=')[0]}=; Max-Age=0; Path=/`;
};
let stop: (() => void) | null = null;

beforeEach(() => {
  clearCookies();
  localStorage.clear();
  for (const a of ['data-vibe', 'data-theme', 'data-phase', 'data-time']) html().removeAttribute(a);
});
afterEach(() => { stop?.(); stop = null; vi.restoreAllMocks(); vi.unstubAllGlobals(); });

describe('the appearance setting', () => {
  it('a first visit is Daylight, following the sun: light at noon', () => {
    stop = initAppearance(document, noon);
    expect(attrs()).toEqual({ vibe: 'daylight', theme: 'light', phase: 'noon', time: 'strong' });
    expect(look.appearance).toEqual(DEFAULT_APPEARANCE);
    expect(look.theme).toBe('light');
  });

  it('following the sun is dark at night', () => {
    stop = initAppearance(document, night);
    expect(attrs().theme).toBe('dark');
    expect(attrs().phase).toBe('night');
  });

  it('reads the person’s cookie', () => {
    document.cookie = 'vk_appearance=studio.dark.subtle.0; Path=/';
    stop = initAppearance(document, noon);
    expect(attrs()).toEqual({ vibe: 'studio', theme: 'dark', phase: 'noon', time: 'subtle' });
  });

  it('a junk cookie falls back field by field and never throws', () => {
    document.cookie = 'vk_appearance=neon.sun.%3Cimg%3E; Path=/';
    expect(() => { stop = initAppearance(document, noon); }).not.toThrow();
    expect(attrs()).toEqual({ vibe: 'daylight', theme: 'light', phase: 'noon', time: 'strong' });
  });

  it('an old Light or Dark choice carries over once, and the old key goes', () => {
    localStorage.setItem(OLD_THEME_KEY, 'dark');
    stop = initAppearance(document, noon);
    expect(attrs().theme).toBe('dark');
    expect(document.cookie).toContain('vk_appearance=daylight.dark.strong.0');
    expect(localStorage.getItem(OLD_THEME_KEY)).toBeNull();
  });

  it('the cookie wins over the old key', () => {
    document.cookie = 'vk_appearance=paper.light.strong.0; Path=/';
    localStorage.setItem(OLD_THEME_KEY, 'dark');
    stop = initAppearance(document, noon);
    expect(attrs().theme).toBe('light');
  });

  it('a change paints at once, is saved host-only, and lets the viewer follow the page', () => {
    const writes: string[] = [];
    const desc = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie')!;
    vi.spyOn(Document.prototype, 'cookie', 'set').mockImplementation(function (this: Document, v: string) { writes.push(v); desc.set!.call(this, v); });
    stop = initAppearance(document, noon);
    localStorage.setItem(OLD_THEME_KEY, 'light');
    setAppearance({ vibe: 'paper', theme: 'dark', timeStrength: 'strong', useLocation: false });
    expect(attrs().vibe).toBe('paper');
    expect(attrs().theme).toBe('dark');
    expect(look.theme).toBe('dark');
    const last = writes.at(-1)!;
    expect(last).toMatch(/^vk_appearance=paper\.dark\.strong\.0; /);
    expect(last).not.toContain('Domain=');
    expect(last).not.toContain('Secure');   // jsdom is http; on https it is Secure
    expect(localStorage.getItem(OLD_THEME_KEY)).toBeNull();
  });

  it('choosing a vibe resets the time of day to that vibe’s default', () => {
    stop = initAppearance(document, noon);
    chooseVibe('quiet');
    expect(look.appearance.timeStrength).toBe('off');
    expect(attrs().time).toBe('off');
    chooseVibe('paper');
    expect(look.appearance.timeStrength).toBe('strong');
  });

  it('blocked storage never throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(() => { stop = initAppearance(document, noon); }).not.toThrow();
    expect(() => setAppearance({ ...DEFAULT_APPEARANCE, vibe: 'studio' })).not.toThrow();
    expect(attrs().vibe).toBe('studio');
  });

  it('location is rounded to about 10 km and kept on this device; a refusal turns it off', async () => {
    stop = initAppearance(document, noon);
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition: (ok: PositionCallback) => ok({ coords: { latitude: 28.61394, longitude: 77.20902 } } as GeolocationPosition) } });
    expect(await chooseLocation(true)).toBe(true);
    expect(JSON.parse(localStorage.getItem(PLACE_KEY)!)).toEqual({ latitude: 28.6, longitude: 77.2 });
    expect(look.appearance.useLocation).toBe(true);
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition: (_ok: PositionCallback, err: PositionErrorCallback) => err({ code: 1 } as GeolocationPositionError) } });
    expect(await chooseLocation(true)).toBe(false);
    expect(look.appearance.useLocation).toBe(false);
    await chooseLocation(false);
    expect(localStorage.getItem(PLACE_KEY)).toBeNull();
  });
});
```

`apps/web/src/lib/vibe/app-html.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { HEAD_SCRIPT } from '@superjackfruit/vibekit';

const html = readFileSync(join(import.meta.dirname, '..', '..', 'app.html'), 'utf8');

describe('app.html paints the vibe before anything else', () => {
  it('holds vibekit’s head script verbatim (run `node apps/web/scripts/sync-head-script.mjs` after a vibekit update)', () => {
    expect(html).toContain(`<script>${HEAD_SCRIPT}</script>`);
  });
  it('the script comes before SvelteKit’s head and any stylesheet', () => {
    const at = html.indexOf(`<script>${HEAD_SCRIPT}</script>`);
    expect(at).toBeGreaterThan(-1);
    expect(at).toBeLessThan(html.indexOf('%sveltekit.head%'));
    const sheet = html.indexOf('rel="stylesheet"');
    if (sheet > -1) expect(at).toBeLessThan(sheet);
  });
  it('the retired theme script and Google Fonts are gone', () => {
    expect(html).not.toContain("localStorage.getItem('superlibrary:theme')");
    expect(html).not.toContain('fonts.googleapis.com');
  });
});
```

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm -C apps/web exec vitest run src/lib/vibe/appearance.test.ts src/lib/vibe/app-html.test.ts`
Expected: FAIL: `./appearance.svelte` cannot be resolved; app-html's first test fails (no head script).

- [ ] **Step 3: Implement** `apps/web/src/lib/vibe/appearance.svelte.ts`

```ts
/**
 * The person's appearance in this browser: vibe, theme, time-of-day strength, and whether to use a
 * rough location. It lives in vibekit's `vk_appearance` cookie, host-only on this product's host for
 * now (spec D6), so the inline head script in app.html can paint the first frame. After that, this
 * module works out the real phase (with the place if allowed) and keeps <html> in step.
 */
import {
  COOKIE_NAME, DEFAULT_APPEARANCE, appearanceCookie, appearanceFromCookieHeader, defaultTimeStrength, htmlAttributes, phaseAt,
  type Appearance, type Phase, type Place, type Theme, type ThemePreference, type TimeStrength, type Vibe,
} from '@superjackfruit/vibekit';

/** The embed's per-device theme key (packages/embed view.ts THEME_KEY), also the old app's. */
export const OLD_THEME_KEY = 'superlibrary:theme';
/** A rough place (one decimal, about 10 km). It never leaves this device. */
export const PLACE_KEY = 'superlibrary:place';

export const look = $state<{ appearance: Appearance; phase: Phase; theme: Theme; now: Date }>({
  appearance: DEFAULT_APPEARANCE, phase: 'noon', theme: 'light', now: new Date(),
});

function store(): Storage | null {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}
function read(key: string): string | null {
  try { return store()?.getItem(key) ?? null; } catch { return null; }
}
function write(key: string, value: string | null): void {
  try { if (value === null) store()?.removeItem(key); else store()?.setItem(key, value); } catch { /* private window or blocked storage */ }
}
function timeZone(): string | undefined {
  try { return Intl.DateTimeFormat().resolvedOptions().timeZone; } catch { return undefined; }
}
function place(): Place | undefined {
  try {
    const p = JSON.parse(read(PLACE_KEY) ?? 'null') as Place | null;
    if (p && Math.abs(p.latitude) <= 90 && Math.abs(p.longitude) <= 180) return { latitude: p.latitude, longitude: p.longitude };
  } catch { /* junk: no place */ }
  return undefined;
}

export function phaseFor(a: Appearance, now: Date): Phase {
  const p = a.useLocation ? place() : undefined;
  return phaseAt(now, p ? { place: p } : { timeZone: timeZone() });
}

function saveCookie(doc: Document, a: Appearance): void {
  try { doc.cookie = appearanceCookie(a, { secure: doc.location?.protocol === 'https:' }); } catch { /* cookies blocked: this page only */ }
}

function paint(doc: Document, a: Appearance, now: Date): void {
  const phase = phaseFor(a, now);
  const attrs = htmlAttributes(a, phase);
  for (const [k, v] of Object.entries(attrs)) doc.documentElement.setAttribute(k, v);
  look.appearance = a;
  look.phase = phase;
  look.theme = attrs['data-theme'];
  look.now = now;
  // The browser's own chrome follows the page (the two metas in app.html).
  const bg = doc.defaultView?.getComputedStyle(doc.documentElement).getPropertyValue('--vk-color-bg').trim();
  if (bg) for (const m of doc.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) m.content = bg;
}

function fromCookie(doc: Document): { appearance: Appearance; present: boolean } {
  let raw = '';
  try { raw = doc.cookie; } catch { /* blocked */ }
  return { appearance: appearanceFromCookieHeader(raw), present: new RegExp(`(?:^|; )${COOKIE_NAME}=`).test(raw) };
}

/** Call once, at the top of the root layout. Returns the cleanup. */
export function initAppearance(doc: Document = document, now: () => Date = () => new Date()): () => void {
  let { appearance, present } = fromCookie(doc);
  if (!present) {
    const old = read(OLD_THEME_KEY);
    if (old === 'light' || old === 'dark') {
      appearance = { ...appearance, theme: old };
      saveCookie(doc, appearance);
      write(OLD_THEME_KEY, null);
    }
  }
  paint(doc, appearance, now());
  // Another tab may have changed the cookie: follow it.
  const tick = () => { const c = fromCookie(doc); paint(doc, c.present ? c.appearance : look.appearance, now()); };
  const timer = setInterval(tick, 60_000);
  const onVisible = () => { if (doc.visibilityState === 'visible') tick(); };
  doc.addEventListener('visibilitychange', onVisible);
  return () => { clearInterval(timer); doc.removeEventListener('visibilitychange', onVisible); };
}

export function setAppearance(next: Appearance, doc: Document = document): void {
  saveCookie(doc, next);
  // The viewer follows the page again: drop a per-device theme left by the old app or the toolbar.
  write(OLD_THEME_KEY, null);
  const apply = () => paint(doc, next, new Date());
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const start = (doc as Document & { startViewTransition?: (cb: () => void) => unknown }).startViewTransition;
  if (start && !reduce) start.call(doc, apply);
  else apply();
}

export const chooseVibe = (vibe: Vibe) => setAppearance({ ...look.appearance, vibe, timeStrength: defaultTimeStrength(vibe) });
export const chooseTheme = (theme: ThemePreference) => setAppearance({ ...look.appearance, theme });
export const chooseStrength = (timeStrength: TimeStrength) => setAppearance({ ...look.appearance, timeStrength });

/** Turn the location on (asks the browser once) or off. Resolves whether it is on afterwards. */
export async function chooseLocation(on: boolean): Promise<boolean> {
  if (!on) {
    write(PLACE_KEY, null);
    setAppearance({ ...look.appearance, useLocation: false });
    return false;
  }
  const got = await new Promise<Place | null>((resolve) => {
    try {
      navigator.geolocation.getCurrentPosition(
        (p) => resolve({ latitude: Math.round(p.coords.latitude * 10) / 10, longitude: Math.round(p.coords.longitude * 10) / 10 }),
        () => resolve(null),
        { enableHighAccuracy: false, maximumAge: 86_400_000, timeout: 10_000 },
      );
    } catch { resolve(null); }
  });
  if (got) write(PLACE_KEY, JSON.stringify(got));
  setAppearance({ ...look.appearance, useLocation: got !== null });
  return got !== null;
}
```

- [ ] **Step 4: Write** `apps/web/scripts/sync-head-script.mjs`

```js
// Writes vibekit's HEAD_SCRIPT into src/app.html between the vk:head markers.
// Run after vendoring a new vibekit: node apps/web/scripts/sync-head-script.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const web = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(join(web, 'package.json'));
// The package root also exports Svelte components, which Node cannot load; this module is plain JS.
const styles = dirname(require.resolve('@superjackfruit/vibekit/tokens.css'));
const { HEAD_SCRIPT } = await import(pathToFileURL(join(styles, '..', 'appearance', 'appearance.js')).href);
const file = join(web, 'src', 'app.html');
const html = readFileSync(file, 'utf8');
const next = html.replace(/<!-- vk:head -->[\s\S]*?<!-- \/vk:head -->/, `<!-- vk:head --><script>${HEAD_SCRIPT}</script><!-- /vk:head -->`);
if (next === html && !html.includes(`<script>${HEAD_SCRIPT}</script>`)) throw new Error('app.html has no <!-- vk:head --> markers');
writeFileSync(file, next);
console.log('app.html: head script in step with vibekit');
```

- [ ] **Step 5: Edit** `apps/web/src/app.html`

Replace the whole `<head>` up to `%sveltekit.head%` with (keep the comment on the manifest as it is):

```html
  <head>
    <meta charset="utf-8" />
    <!-- First, before any stylesheet: vibekit paints data-vibe/theme/phase/time from the vk_appearance
         cookie, so the first frame is already in the person's vibe. Generated: scripts/sync-head-script.mjs. -->
    <!-- vk:head --><!-- /vk:head -->
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Superlibrary</title>
    <link rel="icon" href="/favicon.ico" sizes="any" />
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <!-- Installable to a home screen. No service worker: nothing is cached offline, because a
         stale app shell would fight the sign-in. -->
    <link rel="manifest" href="/manifest.webmanifest" />
    <meta name="theme-color" content="#17162a" media="(prefers-color-scheme: dark)" />
    <meta name="theme-color" content="#fff8ee" media="(prefers-color-scheme: light)" />
    <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
    <meta name="apple-mobile-web-app-capable" content="yes" />
    <meta name="mobile-web-app-capable" content="yes" />
    <meta name="apple-mobile-web-app-status-bar-style" content="default" />
    <meta name="apple-mobile-web-app-title" content="Superlibrary" />
    %sveltekit.head%
  </head>
```

(The old `<script>try{var t=localStorage.getItem('superlibrary:theme')…</script>` line is gone.) Then run `node apps/web/scripts/sync-head-script.mjs`. In `apps/web/static/manifest.webmanifest` set `"background_color": "#17162a"` and `"theme_color": "#17162a"` (Daylight dark).

- [ ] **Step 6: Start it in the root layout**

In `apps/web/src/routes/+layout.svelte`: delete `import { applyTheme, readTheme } from '$kit/theme.svelte';` and the `applyTheme(readTheme());` line in `onMount`. Add the import `import { initAppearance } from '$lib/vibe/appearance.svelte';` and, directly after `let { children } = $props();`:

```ts
  // Before any child renders: the cookie, the old theme's migration, and the real phase (spec §4.3).
  const stopAppearance = initAppearance();
```

and change `onDestroy(() => stop?.());` to `onDestroy(() => { stop?.(); stopAppearance(); });`. (`AppHeader` and `ItemView` still import `$kit/theme.svelte`; Task 6 moves them. The theme file stays until then.)

- [ ] **Step 7: Run the tests**

Run: `pnpm -C apps/web exec vitest run src/lib/vibe && pnpm -C apps/web test`
Expected: `appearance.test.ts` 10 passed, `app-html.test.ts` 3 passed, `installable.test.ts` still passes (theme-color values match its regex), the whole suite passes.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/lib/vibe/appearance.svelte.ts apps/web/src/lib/vibe/appearance.test.ts apps/web/src/lib/vibe/app-html.test.ts apps/web/scripts/sync-head-script.mjs apps/web/src/app.html apps/web/static/manifest.webmanifest apps/web/src/routes/+layout.svelte
git commit -m "Appearance: the vk_appearance cookie, the no-flash head script, the real phase, and the old theme carried over" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8"
```

---

### Task 4: Restyle the app on vibekit variables

**Files:**
- Modify: `apps/web/src/app.css`, `apps/web/src/lib/kit/kit.css`, `apps/web/src/lib/kit/outcome.ts`, `apps/web/src/lib/record.ts`, `apps/web/src/lib/Mark.svelte`, `apps/web/src/lib/kit/kit.test.ts`, `apps/web/src/lib/record.test.ts` (only if it asserts `toneVar`), `apps/web/src/routes/+layout.svelte` (drop the old tokens import)

**Interfaces:**
- Consumes: `--vk-*` (vibekit) and `--sl-*` (Task 2).
- Produces: every product class (`.kit-*`, `.suite-shell*`, `.results`, `.result*`, `.panel`, `.rows`, `.versions`, `.badge`, `.modal*`, `.viewer` host hooks, …) on vibekit variables; `outcomeVar(o)` returns `var(--sl-outcome-<o>)`; `toneVar` uses `--sl-outcome-approved` / `--sl-outcome-rejected` / `--vk-color-faint`.

- [ ] **Step 1: Update the guard test first** (`apps/web/src/lib/kit/kit.test.ts`)

Replace the four `it(...)` bodies as follows (keep the imports and `files()`):

```ts
  it('no colour or font literal anywhere in the app: lib/vibe/superlibrary.css is the one product source', () => {
    const exempt = new Set(['superlibrary.css']);
    const scanned = files(src).filter((f) => /\.(css|svelte|ts)$/.test(f) && !/\.test\.ts$/.test(f) && !exempt.has(f.split('/').at(-1)!));
    expect(scanned.some((f) => f.endsWith('kit.css'))).toBe(true);
    const offenders = scanned.flatMap((f) => {
      const text = readFileSync(f, 'utf8');
      const hits = [...text.matchAll(/#[0-9a-fA-F]{3}(?:[0-9a-fA-F]{3})?\b(?![\w-])|rgba?\(|hsla?\(|font-family:\s*(?!\s|var\()|font:[^;}]*['"]|font:[^;}]*\b(?:Inter|Arial|Helvetica|Georgia|Roboto|serif|sans-serif|monospace|system-ui)\b|'IBM Plex|--(?:color|accent|parent|product|outcome|type|space|radius|motion|focus|elevation)-[a-z]|var\(--tap\)|var\(--font-(?:sans|mono)\)/g)].map((m) => m[0]);
      return hits.length ? [`${f}: ${hits.join(', ')}`] : [];
    });
    expect(offenders).toEqual([]);
  });
  it('a primary or danger button keeps its own background on hover (a hover must never leave 1:1 text)', () => {
    const kit = readFileSync(join(import.meta.dirname, 'kit.css'), 'utf8');
    const rule = (v: string) => kit.split('\n').find((l) => l.startsWith(`.kit-button--${v},`) && l.includes(`.kit-button--${v}:hover`));
    expect(rule('primary')).toMatch(/background: var\(--vk-color-primary\)/);
    expect(rule('danger')).toMatch(/background: var\(--vk-color-surface\)/);
    expect(rule('danger')).toMatch(/color: var\(--sl-danger\)/);
  });
  it('every outcome has a word, a place, and a token', () => {
    expect(Object.keys(OUTCOME_WORDS).sort()).toEqual([...OUTCOMES].sort());
    expect([...OUTCOME_ORDER].sort()).toEqual([...OUTCOMES].sort());
    expect(outcomeVar('rejected')).toBe('var(--sl-outcome-rejected)');
  });
  it('the embed in the app takes the vibe’s colours and type', () => {
    const kit = readFileSync(join(import.meta.dirname, 'kit.css'), 'utf8');
    for (const n of ['bg', 'fg', 'muted', 'line', 'hover', 'accent', 'accent-content', 'danger']) {
      expect(kit, n).toMatch(new RegExp(`--sl-host-${n}: var\\(--(?:vk|sl)-`));
      expect(kit, `${n}-dark`).toMatch(new RegExp(`--sl-host-${n}-dark: var\\(--(?:vk|sl)-`));
    }
    expect(kit).toContain('--sl-host-font: var(--vk-font-body);');
  });
```

The `--(?:color|accent|…)-[a-z]` alternative makes any leftover old variable an offender. The scan skips `*.test.ts` and `superlibrary.css` only.

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm -C apps/web exec vitest run src/lib/kit/kit.test.ts`
Expected: FAIL, listing old variables in `app.css`, `kit.css`, `outcome.ts`, `record.ts`, `Mark.svelte`, `ParentMark.svelte`, `tokens.css`, and the hover/outcome/embed tests failing. (`tokens.css`, `ParentMark.svelte` and `suite.generated.ts` are deleted in Task 5; until then add them to `exempt` with a `// Task 5 deletes these` comment: `new Set(['superlibrary.css', 'tokens.css', 'suite.generated.ts', 'ParentMark.svelte'])`.)

- [ ] **Step 3: Rename variables mechanically**

```bash
cd apps/web/src
perl -pi -e '
  s/var\(--color-surface-raised\)/var(--vk-color-surface)/g; s/var\(--color-surface-sunken\)/var(--vk-color-raised)/g;
  s/var\(--color-surface\)/var(--vk-color-bg)/g;
  s/var\(--color-border-strong\)/var(--vk-color-faint)/g; s/var\(--color-border\)/var(--vk-color-line)/g;
  s/var\(--color-content-muted\)/var(--vk-color-muted)/g; s/var\(--color-content-faint\)/var(--vk-color-faint)/g;
  s/var\(--color-content\)/var(--vk-color-text)/g;
  s/var\(--color-accent-content\)/var(--vk-color-primary-fg)/g; s/var\(--color-accent-soft\)/var(--vk-color-raised)/g; s/var\(--color-accent\)/var(--vk-color-primary)/g;
  s/var\(--color-danger\)/var(--sl-danger)/g; s/var\(--color-ok\)/var(--vk-color-success-text)/g;
  s/var\(--color-scrim\)/var(--sl-scrim)/g; s/var\(--elevation-overlay\)/var(--sl-shadow-overlay)/g;
  s/var\(--space-8\)/var(--vk-space-6)/g; s/var\(--space-6\)/var(--vk-space-5)/g; s/var\(--space-([1-4])\)/var(--vk-space-$1)/g;
  s/var\(--tap\)/var(--vk-target-min)/g;
  s/var\(--radius-control\)/var(--vk-radius-sm)/g; s/var\(--radius-card\)/var(--vk-radius-md)/g; s/var\(--radius-pill\)/var(--vk-radius-pill)/g; s/var\(--radius-sharp\)/0/g;
  s/var\(--motion-quick\)/var(--vk-motion-fast)/g; s/var\(--motion-settle\)/var(--vk-motion-base)/g; s/var\(--motion-easing\)/var(--vk-motion-easing)/g;
  s/var\(--font-sans\)/var(--vk-font-body)/g; s/var\(--font-mono\)/var(--vk-font-mono)/g;
  s/var\(--type-label-weight\)/600/g; s/var\(--type-ui-lg-weight\)/600/g; s/var\(--type-title-weight\)/650/g; s/var\(--type-[a-z]+-weight\)/400/g;
  s/var\(--type-label-line\)/1.3/g; s/var\(--type-meta-line\)/1.35/g; s/var\(--type-ui-lg-line\)/1.4/g; s/var\(--type-ui-line\)/1.4/g; s/var\(--type-body-line\)/1.55/g; s/var\(--type-title-line\)/1.25/g;
  s/var\(--type-(?:label|meta)-size\)/var(--vk-text-sm)/g; s/var\(--type-(?:ui-lg|ui|body)-size\)/var(--vk-text-md)/g; s/var\(--type-title-size\)/var(--vk-text-lg)/g;
' app.css lib/kit/kit.css
cd -
```

- [ ] **Step 4: Hand edits the rename cannot do**

`apps/web/src/app.css`:
- Replace the first comment with `/* Page structure on vibekit variables (--vk-*) and Superlibrary's own (--sl-*, lib/vibe/superlibrary.css). Nothing here defines a colour. */`.
- `body { … }` becomes `body { margin: 0; background: var(--vk-color-bg); color: var(--vk-color-text); font: 400 var(--vk-text-md)/1.55 var(--vk-font-body); }`.
- `h1, h2, h3 { … }` becomes `h1, h2, h3 { font-family: var(--vk-font-display); font-weight: 650; line-height: 1.2; } h1 { font-size: var(--vk-text-lg); } h2 { font-size: var(--vk-text-md); }`.
- The `button, .button { … }` rule becomes vibekit's secondary button:
  `button, .button { display: inline-flex; align-items: center; justify-content: center; gap: var(--vk-space-2); padding: 0 var(--vk-space-4); border: 0; border-radius: var(--vk-radius-md); background: var(--vk-color-surface); color: var(--vk-color-text); box-shadow: inset 0 0 0 2px var(--vk-color-line), 0 var(--vk-lift) 0 var(--vk-color-ground); font: 600 var(--vk-text-md)/1 var(--vk-font-body); text-decoration: none; cursor: pointer; transition: transform var(--vk-motion-fast) var(--vk-motion-easing); }`
  and `button:hover, .button:hover { background: var(--vk-color-raised); }`.
- `.primary, .primary:hover { background: var(--vk-color-primary); color: var(--vk-color-primary-fg); box-shadow: 0 var(--vk-lift) 0 var(--vk-color-ground); }`.
- `input…` field rule: border becomes `2px solid var(--vk-color-faint)`, `border-radius: var(--vk-radius-sm)`, `background: var(--vk-color-surface)`; the same for `textarea` and add `select { border: 2px solid var(--vk-color-faint); border-radius: var(--vk-radius-sm); background: var(--vk-color-surface); color: inherit; padding: 0 var(--vk-space-3); }`.
- `.danger, .danger:hover { background: var(--vk-color-surface); color: var(--sl-danger); box-shadow: inset 0 0 0 2px var(--sl-danger); }`, `.danger-outline { box-shadow: inset 0 0 0 2px var(--sl-danger); color: var(--sl-danger); }`, `.danger-text { color: var(--sl-danger); }`.
- `.secrets { … border: 2px solid var(--vk-color-signal); background: var(--vk-color-signal-wash); … }` (the signal: the person must act, spec D4) and `.secrets h2 { color: var(--vk-color-signal-text); }`.
- `.panel { … border: 0; background: var(--vk-color-surface); box-shadow: inset 0 0 0 1px var(--vk-color-line); border-radius: var(--vk-radius-md); }`.
- `.modal { … border-radius: var(--vk-radius-lg); background: var(--vk-color-surface); }`.
- `.versions li.current { border-left: 3px solid var(--vk-color-primary); … }` stays as renamed.
- Add at the end: `.sl-needs { box-shadow: inset 0 0 0 2px var(--vk-color-signal); background: var(--vk-color-signal-wash); }` (the expired item's Keep-it panel and the not-enabled notice use it) and `.notice h1 { font-size: var(--vk-text-lg); }`.

`apps/web/src/lib/kit/kit.css`:
- Delete the first rule `:focus-visible { outline: var(--focus-ring); … }` (vibekit's base draws focus).
- The button block becomes (one rule per line, exactly; the test reads the primary and danger lines):

```css
.kit-button { display: inline-flex; align-items: center; justify-content: center; gap: var(--vk-space-2); min-height: var(--vk-target-min); padding: 0 var(--vk-space-4); box-sizing: border-box;
  border: 0; border-radius: var(--vk-radius-md); background: var(--vk-color-surface); color: var(--vk-color-text); box-shadow: inset 0 0 0 2px var(--vk-color-line), 0 var(--vk-lift) 0 var(--vk-color-ground);
  font: 600 var(--vk-text-md)/1 var(--vk-font-body); text-decoration: none; cursor: pointer; transition: transform var(--vk-motion-fast) var(--vk-motion-easing); }
.kit-button:hover { background: var(--vk-color-raised); }
.kit-button:active { transform: translateY(1px); }
.kit-button:disabled { opacity: 0.55; cursor: default; }
.kit-button--primary, .kit-button--primary:hover { background: var(--vk-color-primary); color: var(--vk-color-primary-fg); box-shadow: 0 var(--vk-lift) 0 var(--vk-color-ground); }
.kit-button--danger, .kit-button--danger:hover { background: var(--vk-color-surface); color: var(--sl-danger); box-shadow: inset 0 0 0 2px var(--sl-danger); }
.kit-button--ghost { box-shadow: none; background: transparent; }
```

- `.kit-toast`: `border: 0; box-shadow: inset 0 0 0 1px var(--vk-color-line); border-left: 4px solid var(--vk-color-success); border-radius: var(--vk-radius-md); background: var(--vk-color-surface);` and `.kit-toast--info { border-left-color: var(--vk-color-primary); } .kit-toast--danger { border-left-color: var(--sl-danger); }`.
- The `.outcome` rules stay (they read `--o`); `.result { … border-left: 4px solid var(--o); }`.
- The `.viewer { … }` host-hook block becomes:

```css
/* The embed takes the vibe's colours and type (packages/embed host hooks). Its toolbar always follows
   the page, so the -dark hooks carry the page's current values too. */
.viewer {
  --sl-host-font: var(--vk-font-body);
  --sl-host-bg: var(--vk-color-surface); --sl-host-fg: var(--vk-color-text); --sl-host-muted: var(--vk-color-muted);
  --sl-host-line: var(--vk-color-line); --sl-host-hover: var(--vk-color-raised); --sl-host-accent: var(--vk-color-primary);
  --sl-host-accent-content: var(--vk-color-primary-fg); --sl-host-danger: var(--sl-danger);
  --sl-host-bg-dark: var(--vk-color-surface); --sl-host-fg-dark: var(--vk-color-text); --sl-host-muted-dark: var(--vk-color-muted);
  --sl-host-line-dark: var(--vk-color-line); --sl-host-hover-dark: var(--vk-color-raised); --sl-host-accent-dark: var(--vk-color-primary);
  --sl-host-accent-content-dark: var(--vk-color-primary-fg); --sl-host-danger-dark: var(--sl-danger);
}
```

- `.suite-shell-brand { … font: 650 var(--vk-text-md)/1 var(--vk-font-display); }`.
- `.suite-dot { … background: var(--chip-bg); box-shadow: inset 0 0 0 1px var(--chip-fg); }` (Task 5 sets `--chip-bg`/`--chip-fg`).
- `.suite-shell-theme` rules: delete (Task 6 removes the fieldset).

`apps/web/src/lib/kit/outcome.ts`: `export const outcomeVar = (o: Outcome) => \`var(--sl-outcome-${o})\`;`.
`apps/web/src/lib/record.ts`: `export const toneVar = (t: Tone) => (t === 'good' ? 'var(--sl-outcome-approved)' : t === 'bad' ? 'var(--sl-outcome-rejected)' : 'var(--vk-color-faint)');` (update `record.test.ts` if it asserts the old strings).
`apps/web/src/lib/Mark.svelte`: `style="fill: var(--accent-mark)"` → `style="fill: var(--sl-mark)"`, and in its comment replace the sentence about `--accent-mark` with "The mark is drawn in vibekit's Superlibrary product colour (`--sl-mark`), checked at 3:1 in every vibe."
`apps/web/src/routes/+layout.svelte`: delete `import '$kit/tokens.css';`.

- [ ] **Step 5: Check nothing old is left, and run the tests**

```bash
grep -rnE -- "--(color|accent|parent|product|outcome|type|space|radius|motion|focus|elevation)-[a-z]|var\(--tap\)|var\(--font-(sans|mono)\)" apps/web/src --include=*.css --include=*.svelte --include=*.ts | grep -v -e 'kit/tokens.css' -e 'suite.generated.ts' -e 'ParentMark.svelte' -e '\.test\.ts'
pnpm -C apps/web test && pnpm -C apps/web typecheck
```
Expected: grep prints nothing (`--product-` remains only in `SuiteSwitcher.svelte`, which Task 5 rewrites; if grep shows it, leave that one line for Task 5 and add `SuiteSwitcher.svelte` to the test's temporary `exempt` set with the same comment); tests pass; typecheck 0 errors.

- [ ] **Step 6: Look at it**

Run `pnpm --filter @superlibrary/web dev` with the API (`pnpm --filter @superlibrary/api dev`) and open http://localhost:5173 in Daylight: controls 44px, Figtree text, Bricolage headings, cream page. Switch the cookie by hand in DevTools (`document.cookie = 'vk_appearance=studio.dark.strong.0; Path=/'`, reload) to see another vibe paint.

- [ ] **Step 7: Commit**

```bash
git add -A apps/web/src
git commit -m "Restyle on vibekit variables: page, kit, shell, viewer hooks, outcomes and the mark" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8"
```

---

### Task 5: Retire the old token pipeline and the hexagon mark

**Files:**
- Delete: `design/tokens.toml`, `scripts/generate-tokens.mjs`, `scripts/tokens.mjs`, `apps/web/src/lib/kit/tokens.css`, `apps/web/src/lib/kit/tokens.test.ts`, `apps/web/src/lib/kit/suite.generated.ts`, `apps/web/src/lib/kit/ParentMark.svelte`
- Create: `apps/web/src/lib/vibe/suite.ts`
- Modify: `package.json` (root), `apps/web/src/lib/kit/SuiteSwitcher.svelte`, `apps/web/src/lib/kit/SuiteFooter.svelte`, `apps/web/src/lib/AppHeader.svelte` (import path), `apps/web/src/lib/kit/SuiteSwitcher.svelte.test.ts`, `apps/web/src/lib/kit/kit.test.ts` (exempt set back to `superlibrary.css` only), `pnpm-lock.yaml`

**Interfaces:**
- Produces: `PARENT: { name: 'Super Jackfruit Labs'; href: 'https://superjackfruit.com' }`, `PRODUCTS: ReadonlyArray<{ key: Product; name: string; url: string }>` from `$lib/vibe/suite`.

- [ ] **Step 1: Update the switcher test first** (`SuiteSwitcher.svelte.test.ts`)

Delete the test `'the parent mark is three hexagons on the ink tile, filled when small'`. In `'the switcher is headed by the parent mark and name, …'`, rename it to `'the switcher is headed by the parent's name, and lists products with addresses, the current one marked'`, drop any assertion about `svg`/`parent-mark`, keep the address and `aria-current` assertions, change its import of `PRODUCTS` to `$lib/vibe/suite`, and add:

```ts
    const chip = document.querySelector<HTMLElement>('.suite-list li')!;
    expect(chip.style.getPropertyValue('--chip-bg')).toMatch(/^var\(--vk-product-[a-z]+-bg\)$/);
    expect(document.querySelector('svg.parent-mark')).toBeNull();
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm -C apps/web exec vitest run src/lib/kit/SuiteSwitcher.svelte.test.ts`
Expected: FAIL (`$lib/vibe/suite` cannot be resolved).

- [ ] **Step 3: Write** `apps/web/src/lib/vibe/suite.ts`

```ts
import type { Product } from '@superjackfruit/vibekit';

/** The suite around Superlibrary. Colours come from vibekit (--vk-product-<key>-bg/fg); an entry with no address is not listed. */
export const PARENT = { name: 'Super Jackfruit Labs', href: 'https://superjackfruit.com' } as const;
export const PRODUCTS: ReadonlyArray<{ key: Product; name: string; url: string }> = [
  { key: 'agentpod', name: 'AgentPod', url: 'https://console.agentpod.dev' },
  { key: 'superpipeline', name: 'Superpipeline', url: 'https://app.superpipeline.dev' },
  { key: 'superwitness', name: 'Superwitness', url: '' },
  { key: 'supermessage', name: 'Supermessage', url: '' },
  { key: 'superlibrary', name: 'Superlibrary', url: 'https://app.superlibrary.dev' },
];
```

- [ ] **Step 4: Rewrite the switcher and footer**

`SuiteSwitcher.svelte`: import `PARENT` from `$lib/vibe/suite`; drop `ParentMark`; the props type becomes `{ products: ReadonlyArray<{ key: string; name: string; url: string }>; current: string }`; the button content becomes `<span>Products</span>`; the panel heading becomes `<p class="suite-head">{PARENT.name}</p>`; each `li` gets `style:--chip-bg={\`var(--vk-product-${p.key}-bg)\`} style:--chip-fg={\`var(--vk-product-${p.key}-fg)\`}` instead of `--product-accent`.

`SuiteFooter.svelte`:

```svelte
<!-- apps/web/src/lib/kit/SuiteFooter.svelte -->
<script lang="ts">
  import { PARENT } from '$lib/vibe/suite';
</script>

<footer class="suite-shell-footer"><a href={PARENT.href}>{PARENT.name}</a></footer>
```

`AppHeader.svelte`: `import { PRODUCTS } from '$lib/vibe/suite';`.

- [ ] **Step 5: Delete the pipeline**

```bash
git rm design/tokens.toml scripts/generate-tokens.mjs scripts/tokens.mjs apps/web/src/lib/kit/tokens.css apps/web/src/lib/kit/tokens.test.ts apps/web/src/lib/kit/suite.generated.ts apps/web/src/lib/kit/ParentMark.svelte
grep -rn "smol-toml\|generate-tokens\|tokens.mjs\|suite.generated\|ParentMark" --exclude-dir=node_modules --exclude-dir=.svelte-kit --exclude-dir=docs . 
```
Remove `"tokens": "node scripts/generate-tokens.mjs"` from the root `package.json` scripts and `smol-toml` from its devDependencies if grep shows no other user, then `pnpm install`. In `kit.test.ts` set `exempt` back to `new Set(['superlibrary.css'])`.

- [ ] **Step 6: Run everything**

Run: `pnpm -C apps/web test && pnpm -C apps/web typecheck && pnpm test`
Expected: all pass. `pnpm test` (all packages) must not reference the deleted scripts.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "Retire design/tokens.toml, its generator, the Ink parent and the hexagon mark; the suite list moves to lib/vibe/suite.ts" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8"
```

---

### Task 6: The Appearance dialog in the account menu

**Files:**
- Create: `apps/web/src/lib/vibe/copy.ts`, `apps/web/src/lib/vibe/AppearanceDialog.svelte`, `apps/web/src/lib/vibe/AppearanceDialog.svelte.test.ts`
- Modify: `apps/web/src/lib/kit/SuiteHeader.svelte`, `apps/web/src/lib/kit/SuiteHeader.svelte.test.ts`, `apps/web/src/lib/AppHeader.svelte`, `apps/web/src/lib/ItemView.svelte` (two lines), `apps/web/src/app.css` (dialog styles)
- Delete: `apps/web/src/lib/kit/theme.svelte.ts`, `apps/web/src/lib/kit/theme.test.ts`

**Interfaces:**
- Consumes: `look`, `chooseVibe`, `chooseTheme`, `chooseStrength`, `chooseLocation` (Task 3); vibekit `Segmented`, `VIBES`, `greeting`; `holdModal` (`$kit/modal`).
- Produces: `AppearanceDialog { opener?: HTMLElement | null; onclose: () => void }`; `SuiteHeader` prop `onappearance?: (opener: HTMLElement) => void` (replaces `theme`/`ontheme`); `copy.ts`: `VIBE_WORDS`, `PHASE_NAMES`, `dateline(now, phase)`, `readout(now, phase)`, `timeLine(phase)`.

- [ ] **Step 1: Write the failing tests**

`apps/web/src/lib/vibe/AppearanceDialog.svelte.test.ts`:

```ts
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { DEFAULT_APPEARANCE } from '@superjackfruit/vibekit';
import AppearanceDialog from './AppearanceDialog.svelte';
import { look, setAppearance } from './appearance.svelte';

let c: ReturnType<typeof mount> | null = null;
beforeEach(() => {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
  setAppearance({ ...DEFAULT_APPEARANCE });
});
afterEach(() => { if (c) unmount(c); c = null; document.body.innerHTML = ''; });
const open = (onclose = vi.fn(), opener: HTMLElement | null = null) => { c = mount(AppearanceDialog, { target: document.body, props: { onclose, opener } }); flushSync(); return onclose; };
const radio = (name: string) => [...document.querySelectorAll<HTMLInputElement>('input[name="vibe"]')].find((r) => r.closest('label')!.textContent!.includes(name))!;

describe('the appearance dialog', () => {
  it('is a labelled modal dialog that starts on the chosen vibe', () => {
    open();
    const d = document.querySelector('[role="dialog"]')!;
    expect(d.getAttribute('aria-modal')).toBe('true');
    expect(document.getElementById(d.getAttribute('aria-labelledby')!)!.textContent).toBe('Appearance');
    expect(document.activeElement).toBe(radio('Daylight'));
  });

  it('lists the four vibes with what each feels like, each with a sample in its own colours', () => {
    open();
    const cards = [...document.querySelectorAll('.sl-vibe-card')];
    expect(cards.map((l) => l.querySelector('.sl-vibe-name')!.textContent)).toEqual(['Daylight', 'Paper', 'Studio', 'Quiet']);
    expect(cards[1]!.textContent).toContain('A letter from a colleague');
    expect(cards[2]!.querySelector('.sl-vibe-sample')!.getAttribute('data-vibe')).toBe('studio');
  });

  it('a vibe applies at once and is saved', () => {
    open();
    radio('Studio').click(); flushSync();
    expect(document.documentElement.dataset.vibe).toBe('studio');
    expect(look.appearance.vibe).toBe('studio');
    expect(document.cookie).toContain('vk_appearance=studio.');
  });

  it('light or dark and the time of day are labelled radio groups', () => {
    open();
    const groups = [...document.querySelectorAll('[role="radiogroup"]')].map((g) => g.getAttribute('aria-label'));
    expect(groups).toEqual(['Light or dark', 'Time of day']);
    const dark = [...document.querySelectorAll<HTMLElement>('[role="radio"]')].find((r) => r.textContent === 'Dark')!;
    dark.click(); flushSync();
    expect(look.appearance.theme).toBe('dark');
  });

  it('choosing Quiet shows the time of day turned off', () => {
    open();
    radio('Quiet').click(); flushSync();
    const off = [...document.querySelectorAll<HTMLElement>('[role="radio"]')].find((r) => r.textContent === 'Off')!;
    expect(off.getAttribute('aria-checked') ?? off.getAttribute('data-state')).toMatch(/true|checked/);
  });

  it('Done and Escape close it, and focus goes back to the opener', () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    const onclose = open(vi.fn(), opener);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(onclose).toHaveBeenCalledOnce();
    [...document.querySelectorAll('button')].find((b) => b.textContent === 'Done')!.click();
    expect(onclose).toHaveBeenCalledTimes(2);
  });
});
```

In `SuiteHeader.svelte.test.ts`: in `open()` replace `const ontheme = vi.fn();` with `const onappearance = vi.fn();`, drop `theme: 'system'` and pass `onappearance`; return `{ onsignout, onappearance }`. Replace the test `'the account menu holds the theme and Sign out, …'` body's theme part with:

```ts
    expect(menu.querySelectorAll('input[type=radio]')).toHaveLength(0);
    const items = [...menu.querySelectorAll('button')].map((b) => b.textContent!.trim());
    expect(items).toEqual(['Appearance', 'Sign out']);
    menu.querySelector<HTMLButtonElement>('button.suite-shell-appearance')!.click(); flushSync();
    expect(onappearance).toHaveBeenCalledWith(btn);
    expect(menu.hidden).toBe(true);
    btn.click(); flushSync();
```
then the existing Sign out and Escape assertions (rename the test to `'the account menu holds Appearance and Sign out, and Escape closes it back to its button'`).

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm -C apps/web exec vitest run src/lib/vibe/AppearanceDialog.svelte.test.ts src/lib/kit/SuiteHeader.svelte.test.ts`
Expected: FAIL (component missing; menu still has theme radios).

- [ ] **Step 3: Write** `apps/web/src/lib/vibe/copy.ts`

```ts
import { greeting, type Phase, type Vibe } from '@superjackfruit/vibekit';

/** The suite spec's "feels like" line for each vibe (shown in the picker). */
export const VIBE_WORDS: Record<Vibe, { name: string; feel: string }> = {
  daylight: { name: 'Daylight', feel: 'A sunlit room your team works in' },
  paper: { name: 'Paper', feel: 'A letter from a colleague' },
  studio: { name: 'Studio', feel: 'A well-made piece of equipment' },
  quiet: { name: 'Quiet', feel: 'A clear printed page' },
};
export const PHASE_NAMES: Record<Phase, string> = { dawn: 'dawn', morning: 'morning', noon: 'midday', golden: 'golden hour', dusk: 'dusk', night: 'night' };
const PHASE_LIGHT: Record<Phase, string> = { dawn: 'first light', morning: 'morning light', noon: 'midday light', golden: 'golden light', dusk: 'the dusk', night: 'lamplight' };

/** Paper's dateline: "Saturday 11 October, in golden light". */
export const dateline = (now: Date, phase: Phase) => `${now.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}, in ${PHASE_LIGHT[phase]}`;
/** Studio's readout: "GOLDEN HOUR · 17:42". */
export const readout = (now: Date, phase: Phase) => `${greeting(phase, 'studio')} · ${now.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })}`;
/** Quiet's plain line, only when the person turned the time of day on. */
export const timeLine = (phase: Phase) => `Time of day: ${PHASE_NAMES[phase]}`;
```

- [ ] **Step 4: Write** `apps/web/src/lib/vibe/AppearanceDialog.svelte`

```svelte
<script lang="ts">
  import { untrack } from 'svelte';
  import { Segmented, VIBES, type ThemePreference, type TimeStrength } from '@superjackfruit/vibekit';
  import { holdModal } from '$kit/modal';
  import { chooseLocation, chooseStrength, chooseTheme, chooseVibe, look } from './appearance.svelte';
  import { VIBE_WORDS } from './copy';

  let { opener = null, onclose }: { opener?: HTMLElement | null; onclose: () => void } = $props();
  let dialog = $state<HTMLElement | null>(null);
  let theme = $state<ThemePreference>(untrack(() => look.appearance.theme));
  let strength = $state<TimeStrength>(untrack(() => look.appearance.timeStrength));
  let locating = $state(false);
  let locationNote = $state<string | null>(null);

  $effect(() => { if (theme !== untrack(() => look.appearance.theme)) chooseTheme(theme); });
  $effect(() => { if (strength !== untrack(() => look.appearance.timeStrength)) chooseStrength(strength); });
  // A vibe change resets the strength (spec D7): show the reset.
  $effect(() => { const s = look.appearance.timeStrength; untrack(() => { strength = s; }); });
  $effect(() => { if (!dialog) return; return holdModal(dialog, onclose, untrack(() => opener)); });

  async function location(e: Event) {
    const on = (e.currentTarget as HTMLInputElement).checked;
    locating = true;
    const ok = await chooseLocation(on);
    locating = false;
    locationNote = on && !ok ? 'Location was not shared, so your time zone is used.' : null;
  }
</script>

<div class="modal-backdrop">
  <div class="modal sl-appearance" role="dialog" aria-modal="true" aria-labelledby="appearance-h" bind:this={dialog}>
    <h2 id="appearance-h">Appearance</h2>
    <fieldset class="sl-vibes">
      <legend>Vibe</legend>
      {#each VIBES as v (v)}
        <label class="sl-vibe-card">
          <input type="radio" name="vibe" value={v} checked={look.appearance.vibe === v} data-autofocus={look.appearance.vibe === v ? '' : undefined} onchange={() => chooseVibe(v)} />
          <span class="sl-vibe-text"><span class="sl-vibe-name">{VIBE_WORDS[v].name}</span><span class="sl-vibe-feel">{VIBE_WORDS[v].feel}</span></span>
          <span class="sl-vibe-sample" data-vibe={v} data-theme={look.theme} aria-hidden="true"><span></span><span></span><span></span></span>
        </label>
      {/each}
    </fieldset>
    <div class="sl-setting">
      <p class="sl-setting-label">Light or dark</p>
      <Segmented label="Light or dark" options={[{ value: 'sun', label: 'Follow the sun' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]} bind:value={theme} />
      <p class="muted sl-setting-hint">Follow the sun: light by day, dark after dusk.</p>
    </div>
    <div class="sl-setting">
      <p class="sl-setting-label">Time of day</p>
      <Segmented label="Time of day" options={[{ value: 'strong', label: 'Strong' }, { value: 'subtle', label: 'Subtle' }, { value: 'off', label: 'Off' }]} bind:value={strength} />
      <p class="muted sl-setting-hint">How much the time of day shows. Quiet starts with Off.</p>
    </div>
    <label class="check"><input type="checkbox" checked={look.appearance.useLocation} disabled={locating} onchange={location} /> Use my location for the sun</label>
    <p class="muted sl-setting-hint" role="status">{locationNote ?? 'A rough location that never leaves this device. Without it, the day runs 6:00 to 18:00 in your time zone.'}</p>
    <p class="muted">Saved in this browser for Superlibrary.</p>
    <div class="modal-actions"><button type="button" class="kit-button kit-button--primary" onclick={onclose}>Done</button></div>
  </div>
</div>
```

Append to `apps/web/src/app.css`:

```css
/* The Appearance dialog (spec §4.2). A full-height sheet on phones, a 480px panel wider. */
.sl-appearance { width: min(480px, 100%); }
@media (max-width: 599px) { .sl-appearance { width: 100%; max-height: 100dvh; min-height: 100dvh; border-radius: 0; } .modal-backdrop:has(.sl-appearance) { padding: 0; } }
.sl-vibes { display: grid; gap: var(--vk-space-2); margin: 0 0 var(--vk-space-4); padding: 0; border: 0; }
.sl-vibes legend { margin-bottom: var(--vk-space-2); font-weight: 600; }
.sl-vibe-card { display: grid; grid-template-columns: auto 1fr auto; align-items: center; gap: var(--vk-space-3); min-height: var(--vk-target-min); padding: var(--vk-space-2) var(--vk-space-3); border-radius: var(--vk-radius-md); box-shadow: inset 0 0 0 2px var(--vk-color-line); cursor: pointer; }
.sl-vibe-card:has(input:checked) { box-shadow: inset 0 0 0 2px var(--vk-color-text); }
.sl-vibe-card input { width: 22px; height: 22px; margin: 0; }
.sl-vibe-text { display: grid; gap: 2px; }
.sl-vibe-name { font-weight: 650; }
.sl-vibe-feel { color: var(--vk-color-muted); font-size: var(--vk-text-sm); }
.sl-vibe-sample { display: inline-flex; gap: 3px; padding: 4px; border-radius: var(--vk-radius-sm); background: var(--vk-color-bg); box-shadow: inset 0 0 0 1px var(--vk-color-line); }
.sl-vibe-sample span { width: 14px; height: 22px; border-radius: 3px; }
.sl-vibe-sample span:nth-child(1) { background: var(--vk-color-surface); }
.sl-vibe-sample span:nth-child(2) { background: var(--vk-color-primary); }
.sl-vibe-sample span:nth-child(3) { background: var(--vk-color-signal); }
.sl-setting { display: grid; gap: var(--vk-space-2); margin: 0 0 var(--vk-space-4); }
.sl-setting-label { margin: 0; font-weight: 600; }
.sl-setting-hint { margin: 0; font-size: var(--vk-text-sm); }
```

- [ ] **Step 5: Wire the shell**

`SuiteHeader.svelte`: remove `theme` and `ontheme` from the props, the `import type { Theme } …` line and the `<fieldset class="suite-shell-theme">…</fieldset>`; add the prop `onappearance?: (opener: HTMLElement) => void`; between the detail line and Sign out add:

```svelte
      <button type="button" class="kit-button suite-shell-appearance" onclick={() => { menus.open = null; if (button) onappearance?.(button); }}>Appearance</button>
```

`AppHeader.svelte`: remove the `$kit/theme.svelte` import and the `theme`/`ontheme` props; add `import AppearanceDialog from '$lib/vibe/AppearanceDialog.svelte';`, `let appearanceFrom = $state<HTMLElement | null>(null);`, pass `onappearance={(el) => (appearanceFrom = el)}` to `SuiteHeader`, and after it:

```svelte
{#if appearanceFrom}<AppearanceDialog opener={appearanceFrom} onclose={() => (appearanceFrom = null)} />{/if}
```

`ItemView.svelte`: replace `import { themeState } from '$kit/theme.svelte';` with `import { look } from '$lib/vibe/appearance.svelte';`; `$effect(() => { const t = themeState.value; mounted?.setTheme(t); });` becomes `$effect(() => { const t = look.theme; mounted?.setTheme(t); });`; in `mountArtifact(…)` `theme: untrack(() => themeState.value)` becomes `theme: untrack(() => look.theme)`.

Delete `apps/web/src/lib/kit/theme.svelte.ts` and `apps/web/src/lib/kit/theme.test.ts`.

- [ ] **Step 6: Run the tests**

Run: `pnpm -C apps/web test && pnpm -C apps/web typecheck`
Expected: all pass. If bits-ui renders its radio items with `data-state="checked"` rather than `aria-checked`, the "Quiet shows Off" test's regex already accepts either.

- [ ] **Step 7: Commit**

```bash
git add -A apps/web/src
git commit -m "Appearance dialog in the account menu: vibe, light or dark, time of day, location" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8"
```

---

### Task 7: The layout selector, the registry, and agent makers on rows

**Files:**
- Create: `apps/web/src/lib/vibe/layout.ts`, `apps/web/src/lib/vibe/layout.test.ts`, `apps/web/src/lib/vibe/VibeLayout.svelte`, `apps/web/src/lib/vibe/faces.ts`, `apps/web/src/lib/vibe/faces.test.ts`, `apps/web/src/lib/layouts/rows.ts`, `apps/web/src/lib/layouts/registry.ts`
- Modify: `apps/web/src/lib/library.ts`, `apps/web/src/lib/library.test.ts`

**Interfaces:**
- Produces:
  - `type Layouts<C> = { daylight: C } & Partial<Record<'paper' | 'studio' | 'quiet', C>>`; `pickLayout<C>(vibe: Vibe, layouts: Layouts<C>): C`
  - `VibeLayout<M> { layouts: Layouts<Component<{ model: M }>>; model: M }`
  - `type RowVariant = 'cards' | 'index' | 'table' | 'plain'`; `ROWS: Record<Vibe, RowVariant>`; `LAYOUTS` (filled by Tasks 8, 10, 11, then one line per later task)
  - `interface Maker { id: string; label: string }`; `makerOf(source?: ItemSource, createdBy?: string): Maker | null`; `moodOf(o: Outcome): Mood`
  - `Row` gains `kindWord: string; board: string | null; station: string | null; path: string | null; maker: Maker | null` (all existing fields unchanged)

- [ ] **Step 1: Write the failing tests**

`apps/web/src/lib/vibe/layout.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { VIBES } from '@superjackfruit/vibekit';
import { pickLayout } from './layout';

describe('one place picks the layout', () => {
  it('a vibe with its own layout gets it', () => {
    expect(pickLayout('paper', { daylight: 'D', paper: 'P' })).toBe('P');
  });
  it('a vibe without one gets the Daylight layout, in its own colours', () => {
    for (const v of VIBES) expect(pickLayout(v, { daylight: 'D' })).toBe('D');
  });
});
```

`apps/web/src/lib/vibe/faces.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { makerOf, moodOf } from './faces';

describe('who made it, as a face', () => {
  it('an agent maker is its principal, said the provenance way', () => {
    expect(makerOf({ agent: true, agentPrincipal: 'prn_00000000000000000a9a' }, 'prn_x')).toEqual({ id: 'prn_00000000000000000a9a', label: 'An agent (prn_00000000000000000a9a)' });
    expect(makerOf({ agent: true }, 'prn_00000000000000000a9b')).toEqual({ id: 'prn_00000000000000000a9b', label: 'An agent (prn_00000000000000000a9b)' });
  });
  it('people and unknown makers get no face', () => {
    expect(makerOf(undefined, 'prn_1')).toBeNull();
    expect(makerOf({ agent: false }, 'prn_1')).toBeNull();
    expect(makerOf({ agent: true })).toBeNull();
  });
  it('the mood follows how the work turned out', () => {
    expect(moodOf('approved')).toBe('done');
    expect(moodOf('in-progress')).toBe('working');
    expect(moodOf('rejected')).toBe('resting');
  });
});
```

Append to the `rowOf…` describe in `apps/web/src/lib/library.test.ts` (reuse that block's `r`, `boards` and `i`):

```ts
  it('a row carries its parts as well as its line, and an agent maker', () => {
    const row = rowOfResult({ ...r, provenance: { ...r.provenance, agent: true, agentPrincipal: 'prn_00000000000000000a9a' } }, boards);
    expect(row).toMatchObject({ kindWord: 'Artifact', board: 'Marketing & Community', station: 'docs', path: 'out/report.md', maker: { id: 'prn_00000000000000000a9a' } });
    expect(rowOfItem(i, boards)).toMatchObject({ kindWord: 'Work record', board: 'Marketing & Community', station: null, path: null, maker: null });
  });
```
(If that describe names its search result or item differently, use its names; the expected values follow from the existing `line` assertions just above it.)

- [ ] **Step 2: Run them to see them fail**

Run: `pnpm -C apps/web exec vitest run src/lib/vibe/layout.test.ts src/lib/vibe/faces.test.ts src/lib/library.test.ts`
Expected: FAIL (modules missing; `kindWord` undefined).

- [ ] **Step 3: Implement**

`apps/web/src/lib/vibe/layout.ts`:

```ts
import type { Vibe } from '@superjackfruit/vibekit';

/** A screen's layouts: Daylight's is required, the others arrive phase by phase. */
export type Layouts<C> = { daylight: C } & Partial<Record<Exclude<Vibe, 'daylight'>, C>>;

/** The only place a layout is chosen. A vibe without its own gets Daylight's, which its tokens restyle. */
export const pickLayout = <C>(vibe: Vibe, layouts: Layouts<C>): C => layouts[vibe] ?? layouts.daylight;
```

`apps/web/src/lib/vibe/VibeLayout.svelte`:

```svelte
<script lang="ts" generics="M">
  import type { Component } from 'svelte';
  import { look } from './appearance.svelte';
  import { pickLayout, type Layouts } from './layout';

  let { layouts, model }: { layouts: Layouts<Component<{ model: M }>>; model: M } = $props();
  const Layout = $derived(pickLayout(look.appearance.vibe, layouts));
</script>

<Layout {model} />
```

`apps/web/src/lib/vibe/faces.ts`:

```ts
import type { ItemSource, Outcome } from '@superlibrary/contract';
import type { Mood } from '@superjackfruit/vibekit';

/** An agent that made something. The face is vibekit's default from the id (the API has no avatar URL; spec D8). */
export interface Maker { id: string; label: string }

export function makerOf(source?: ItemSource, createdBy?: string): Maker | null {
  if (!source?.agent) return null;
  const id = source.agentPrincipal ?? createdBy;
  return id ? { id, label: `An agent (${id})` } : null;
}

export const moodOf = (o: Outcome): Mood => (o === 'approved' || o === 'completed' ? 'done' : o === 'in-progress' ? 'working' : 'resting');
```

`apps/web/src/lib/library.ts`: import `makerOf, type Maker` from `$lib/vibe/faces`; extend `Row` with `kindWord: string; board: string | null; station: string | null; path: string | null; maker: Maker | null`; add a helper and use it in both `rowOf…`:

```ts
function partsOf(kind: Kind, s: ItemSource | undefined, boards: Map<string, string>) {
  return { kindWord: KIND_WORD[kind], board: s?.board ? (boards.get(s.board) ?? s.board) : null, station: s?.stationName ?? s?.station ?? null, path: s?.path ?? null };
}
```

`rowOfResult` adds `...partsOf(r.kind, r.provenance, boards), maker: makerOf(r.provenance)`; `rowOfItem` computes `const src = i.source ?? (i.scope.startsWith('board:') ? { board: i.scope.slice(6) } : undefined);`, uses it for `line` and `...partsOf(i.kind, src, boards)`, and adds `maker: makerOf(i.source, i.createdBy)`. `lineOf` can be rewritten as `[p.kindWord, p.board, p.station, p.path].filter(Boolean).join(' · ')` over `partsOf`.

`apps/web/src/lib/layouts/rows.ts` (its own file, with no imports of layouts, so `ResultList` can read it without an import cycle through the registry):

```ts
import type { Vibe } from '@superjackfruit/vibekit';

export type RowVariant = 'cards' | 'index' | 'table' | 'plain';
/** How a list of results is drawn in each vibe (home, outcomes). Phases 2 to 4 change one value each. */
export const ROWS: Record<Vibe, RowVariant> = { daylight: 'cards', paper: 'cards', studio: 'cards', quiet: 'cards' };
```

`apps/web/src/lib/layouts/registry.ts`:

```ts
/**
 * Which vibe has which layout: the one place (spec §3), with rows.ts for result rows. A vibe missing
 * here gets Daylight's layout in its own colours and type. Each later phase adds one line per screen.
 */
export { ROWS, type RowVariant } from './rows';

export const LAYOUTS = {} as const;   // Tasks 8, 10 and 11 add library, item, collections, collection
```

- [ ] **Step 4: Run them to see them pass**

Run: `pnpm -C apps/web test && pnpm -C apps/web typecheck`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add -A apps/web/src
git commit -m "One place picks a layout by vibe; rows carry their parts and an agent maker" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8"
```

---
### Task 8: The library home: its view model and the Daylight layout

**Files:**
- Create: `apps/web/src/lib/screens/library.svelte.ts`, `apps/web/src/lib/screens/library.svelte.test.ts`, `apps/web/src/lib/sections/SearchForm.svelte`, `apps/web/src/lib/sections/LibraryStatus.svelte`, `apps/web/src/lib/sections/LibraryResults.svelte`, `apps/web/src/lib/sections/results/ResultsCards.svelte`, `apps/web/src/lib/layouts/library/LibraryDaylight.svelte`, `apps/web/src/lib/layouts/daylight.css`
- Modify: `apps/web/src/lib/ResultList.svelte`, `apps/web/src/routes/+page.svelte`, `apps/web/src/lib/layouts/registry.ts`, `apps/web/src/routes/+layout.svelte` (import `daylight.css`)

**Interfaces:**
- Consumes: `readFilters`, `writeFilters`, `activeFilters`, `rangeProblem`, `boardNames`, `browseLibrary`, `searchLibrary`, `loadFacets`, `rowOfItem`, `rowOfResult`, `Row`, `Filters` (`$lib/library`); `ROWS` (`$lib/layouts/rows`); `look`; vibekit `Sky`, `Face`, `greeting`.
- Produces:
  - `class LibraryModel` with state `facets`, `results`, `items`, `counts: OutcomeCounts | null`, `next`, `loading`, `error`, `words`; derived `filters`, `searching`, `boards`, `rows: Row[]`, `activeCount`, `listLabel`, `summary`, `status`, `empty: 'none' | 'no-match' | 'nothing-yet'`; actions `setFilters(f)`, `submit()`, `retry()`, `more()`, `load(f, cursor?)`. Constructor `(params: () => URLSearchParams, navigate: (href: string) => unknown, api?: Api)`.
  - Sections taking `{ model: LibraryModel }`: `SearchForm` (+ `labelVisible?: boolean`), `LibraryStatus`, `LibraryResults`.
  - `ResultList { rows: Row[]; label: string; variant?: RowVariant }`, drawing `SHAPES[variant ?? ROWS[vibe]]`.
  - `LAYOUTS.library = { daylight: LibraryDaylight }`.

- [ ] **Step 1: Write the failing model test** at `apps/web/src/lib/screens/library.svelte.test.ts`

```ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';

const calls: Array<{ path: string; body: any }> = [];
let browse: (n: number, body: any) => Response = () => Response.json({ items: [], next: null, counts: {} });
vi.mock('$lib/session.svelte', () => ({
  api: async (path: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ path, body });
    if (path === '/api/v1/facets') return Response.json({ boards: [{ id: 'brd_00000000000000b1', name: 'Press' }], agents: [], stations: [] });
    if (path === '/api/v1/search') return Response.json({ results: [] });
    return browse(calls.filter((c) => c.path === '/api/v1/browse').length, body);
  },
}));
import { LibraryModel } from './library.svelte';

const item = (n: number) => ({ id: `itm_00000000000000a${n}`, kind: 'artifact', title: `Item ${n}`, scope: 'workspace', outcome: 'completed', createdBy: 'p', createdAt: '2026-10-01T00:00:00.000Z', latestVersion: 1, expiresAt: null, revokedAt: null });
const settle = async () => { for (let i = 0; i < 6; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); } };
let stop: (() => void) | null = null;
afterEach(() => { stop?.(); stop = null; calls.length = 0; });
function make(qs = '') {
  const params = $state({ url: new URL(`http://localhost/${qs}`) });
  const navigate = vi.fn((href: string) => { params.url = new URL(`http://localhost${href}`); });
  let m!: LibraryModel;
  stop = $effect.root(() => { m = new LibraryModel(() => params.url.searchParams, navigate); });
  return { m, navigate };
}

describe('the library home model', () => {
  it('browses by default and says how many, most recent first', async () => {
    browse = () => Response.json({ items: [item(1), item(2)], next: 'c1', counts: { approved: 0, completed: 2, 'in-progress': 0, superseded: 0, rejected: 0, failed: 0, abandoned: 0 } });
    const { m } = make();
    await settle();
    expect(m.rows.map((r) => r.title)).toEqual(['Item 1', 'Item 2']);
    expect(m.status).toBe('2+ items, most recent activity first');
    expect(m.listLabel).toBe('Library');
    expect(m.counts?.completed).toBe(2);
    expect(m.empty).toBe('none');
  });

  it('a search goes into the address, and an empty answer says so', async () => {
    const { m, navigate } = make();
    await settle();
    m.words = 'retro';
    m.submit();
    expect(navigate).toHaveBeenCalledWith('/?q=retro');
    await settle();
    expect(m.searching).toBe(true);
    expect(m.empty).toBe('no-match');
    expect(m.listLabel).toBe('Search results');
  });

  it('Try again after a failed More resumes from that cursor', async () => {
    browse = (n) => (n === 1 ? Response.json({ items: [item(1)], next: 'c1', counts: {} }) : n === 2 ? Response.json({ error: 'unavailable' }, { status: 503 }) : Response.json({ items: [item(2)], next: null, counts: {} }));
    const { m } = make();
    await settle();
    await m.more();
    expect(m.error).not.toBeNull();
    await m.retry();
    expect(calls.filter((c) => c.path === '/api/v1/browse').at(-1)!.body.cursor).toBe('c1');
    expect(m.rows.map((r) => r.title)).toEqual(['Item 1', 'Item 2']);
  });

  it('a backwards date range asks for an end date and sends nothing', async () => {
    const { m } = make('?period=custom&from=2026-10-10&to=2026-10-01');
    await settle();
    expect(calls.filter((c) => c.path === '/api/v1/browse')).toHaveLength(0);
    expect(m.rows).toEqual([]);
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm -C apps/web exec vitest run src/lib/screens/library.svelte.test.ts`
Expected: FAIL (`./library.svelte` cannot be resolved).

- [ ] **Step 3: Implement** `apps/web/src/lib/screens/library.svelte.ts` (the logic of today's `routes/+page.svelte`, moved)

```ts
import { untrack } from 'svelte';
import type { Facets, ItemSummary, OutcomeCounts, SearchResult } from '@superlibrary/contract';
import { api as sessionApi } from '$lib/session.svelte';
import {
  activeFilters, boardNames, browseLibrary, loadFacets, rangeProblem, readFilters, rowOfItem, rowOfResult, searchLibrary, writeFilters,
  type Filters, type Row,
} from '$lib/library';

type Api = (path: string, init?: RequestInit) => Promise<Response>;

/** The library home's data and actions (spec §5.1). Construct it in the route's script so its effects belong to the page. */
export class LibraryModel {
  facets = $state<Facets | null>(null);
  results = $state<SearchResult[]>([]);
  items = $state<ItemSummary[]>([]);
  counts = $state<OutcomeCounts | null>(null);
  next = $state<string | null>(null);
  loading = $state(true);
  error = $state<string | null>(null);
  /** The search box's words; submitted into the address. */
  words = $state('');

  readonly #params: () => URLSearchParams;
  readonly #navigate: (href: string) => unknown;
  readonly #api: Api;
  #loads = 0;
  /** The cursor of the last request, so a retry resumes there. */
  #tried: string | null = null;

  readonly filters: Filters = $derived(readFilters(this.#params()));
  readonly searching = $derived(this.filters.q.trim() !== '');
  readonly boards = $derived(boardNames(this.facets));
  readonly rows: Row[] = $derived(this.searching ? this.results.map((r) => rowOfResult(r, this.boards)) : this.items.map((i) => rowOfItem(i, this.boards)));
  readonly activeCount = $derived(activeFilters(this.filters));
  readonly listLabel = $derived(this.searching ? 'Search results' : 'Library');
  readonly summary = $derived(
    this.searching
      ? this.rows.length === 25 ? 'The 25 best matches' : `${this.rows.length} match${this.rows.length === 1 ? '' : 'es'}`
      : `${this.rows.length}${this.next ? '+' : ''} item${this.rows.length === 1 ? '' : 's'}, most recent activity first`,
  );
  /** The status line: blank on an error, which says itself. */
  readonly status = $derived(this.loading ? 'Loading…' : this.error ? '' : this.summary);
  readonly empty = $derived<'none' | 'no-match' | 'nothing-yet'>(this.error || this.loading || this.rows.length ? 'none' : this.searching ? 'no-match' : 'nothing-yet');

  constructor(params: () => URLSearchParams, navigate: (href: string) => unknown, api: Api = sessionApi) {
    this.#params = params;
    this.#navigate = navigate;
    this.#api = api;
    $effect(() => { untrack(() => void this.#loadFacets()); });
    $effect(() => { const f = this.filters; untrack(() => { this.words = f.q; void this.load(f); }); });
  }

  async #loadFacets() { const f = await loadFacets(this.#api); if (f.ok) this.facets = f.value; }   // a failure leaves the menus empty, as today

  setFilters(f: Filters) { const qs = writeFilters(f); return this.#navigate(qs ? `/?${qs}` : '/'); }
  submit() { return this.setFilters({ ...this.filters, q: this.words }); }
  retry() { return this.load(this.filters, this.#tried); }
  more() { return this.load(this.filters, this.next); }

  async load(f: Filters, cursor: string | null = null) {
    const mine = ++this.#loads;
    this.#tried = cursor;
    this.loading = true;
    this.error = null;
    if (rangeProblem(f)) { this.results = []; this.items = []; this.next = null; this.loading = false; return; }
    if (f.q.trim()) {
      const r = await searchLibrary(this.#api, f);
      if (mine !== this.#loads) return;
      if (r.ok) { this.results = r.value.results; this.next = null; } else this.error = r.message;
    } else {
      const r = await browseLibrary(this.#api, f, cursor);
      if (mine !== this.#loads) return;
      if (r.ok) { this.items = cursor ? [...this.items, ...r.value.items] : r.value.items; this.next = r.value.next; if (!cursor) this.counts = r.value.counts; } else this.error = r.message;
    }
    this.loading = false;
  }
}
```

- [ ] **Step 4: Write the sections**

`apps/web/src/lib/sections/SearchForm.svelte`:

```svelte
<script lang="ts">
  import type { LibraryModel } from '$lib/screens/library.svelte';
  let { model, labelVisible = false }: { model: LibraryModel; labelVisible?: boolean } = $props();
</script>

<form class="searchbar" role="search" onsubmit={(e) => { e.preventDefault(); void model.submit(); }}>
  <label class={labelVisible ? 'searchbar-label' : 'visually-hidden'} for="q">Search the library</label>
  <input id="q" type="search" name="q" placeholder="Search the library" bind:value={model.words} />
  <button type="submit">Search</button>
</form>
```

`apps/web/src/lib/sections/LibraryStatus.svelte`:

```svelte
<script lang="ts">
  import type { LibraryModel } from '$lib/screens/library.svelte';
  let { model }: { model: LibraryModel } = $props();
</script>

<p class="muted sl-status" role="status">{model.status}</p>
```

`apps/web/src/lib/sections/LibraryResults.svelte` (the error, the two empty states, the rows and More; every sentence as today):

```svelte
<script lang="ts">
  import Button from '$kit/Button.svelte';
  import EmptyState from '$kit/EmptyState.svelte';
  import ResultList from '$lib/ResultList.svelte';
  import type { LibraryModel } from '$lib/screens/library.svelte';
  let { model }: { model: LibraryModel } = $props();
</script>

{#if model.error}
  <p class="error" role="alert">{model.error}</p>
  <button type="button" onclick={() => model.retry()}>Try again</button>
{:else if model.empty === 'no-match'}
  <EmptyState title="Nothing matches." body="Try other words, or clear the filters." />
{:else if model.empty === 'nothing-yet'}
  <EmptyState title="Nothing here yet" body="Upload a file or a folder, or link one from an agent's station.">
    {#snippet action()}<Button variant="primary" href="/upload">Upload</Button>{/snippet}
  </EmptyState>
{/if}
{#if model.rows.length}
  <ResultList rows={model.rows} label={model.listLabel} />
  {#if model.next}<button type="button" class="sl-more" disabled={model.loading} onclick={() => model.more()}>{model.loading ? 'Loading…' : 'More'}</button>{/if}
{/if}
```

`apps/web/src/lib/sections/results/ResultsCards.svelte` (today's rows, plus the maker's face, decorative inside the link):

```svelte
<script lang="ts">
  import { Face } from '@superjackfruit/vibekit';
  import OutcomeBadge from '$kit/OutcomeBadge.svelte';
  import { outcomeVar } from '$kit/outcome';
  import type { Row } from '$lib/library';
  import { moodOf } from '$lib/vibe/faces';
  let { rows, label }: { rows: Row[]; label: string } = $props();
</script>

<ul class="results results--cards" aria-label={label}>
  {#each rows as r (r.id)}
    <li class="result" style:--o={outcomeVar(r.outcome)}>
      <a class="result-link" href={`/a/${r.id}`}>
        <span class="result-title">{#if r.maker}<span class="result-face" aria-hidden="true"><Face id={r.maker.id} label={r.maker.label} mood={moodOf(r.outcome)} size={24} /></span>{/if}<span>{r.title}</span></span>
        <span class="result-meta"><OutcomeBadge outcome={r.outcome} /><small>{r.line}</small>{#if r.visibility}<small>{r.visibility}</small>{/if}</span>
        {#if r.snippet}<span class="snippet">{r.snippet}</span>{/if}
      </a>
      {#if r.supersededBy}<a class="replaced" href={`/a/${r.supersededBy}`}>See what replaced it</a>{/if}
    </li>
  {/each}
</ul>
```

`apps/web/src/lib/ResultList.svelte` becomes the picker (its existing test, a title with markup shown as text, keeps passing):

```svelte
<!-- apps/web/src/lib/ResultList.svelte: one list of results, drawn the way the vibe draws rows (registry ROWS). -->
<script lang="ts">
  import type { Component } from 'svelte';
  import type { Row } from '$lib/library';
  import { ROWS, type RowVariant } from '$lib/layouts/rows';
  import { look } from '$lib/vibe/appearance.svelte';
  import ResultsCards from '$lib/sections/results/ResultsCards.svelte';

  let { rows, label, variant }: { rows: Row[]; label: string; variant?: RowVariant } = $props();
  // Phases 2 to 4 add index, table and plain. Until then a vibe's rows fall back to cards.
  const SHAPES: Partial<Record<RowVariant, Component<{ rows: Row[]; label: string }>>> = { cards: ResultsCards };
  const Shape = $derived(SHAPES[variant ?? ROWS[look.appearance.vibe]] ?? ResultsCards);
</script>

<Shape {rows} {label} />
```

- [ ] **Step 5: Write the Daylight layout** `apps/web/src/lib/layouts/library/LibraryDaylight.svelte`

```svelte
<!-- Daylight: the library as a sunlit room. The sky band holds the greeting, the heading, Upload and the search. -->
<script lang="ts">
  import { Sky, greeting } from '@superjackfruit/vibekit';
  import Button from '$kit/Button.svelte';
  import FilterBar from '$lib/FilterBar.svelte';
  import type { LibraryModel } from '$lib/screens/library.svelte';
  import LibraryResults from '$lib/sections/LibraryResults.svelte';
  import LibraryStatus from '$lib/sections/LibraryStatus.svelte';
  import SearchForm from '$lib/sections/SearchForm.svelte';
  import { look } from '$lib/vibe/appearance.svelte';
  let { model }: { model: LibraryModel } = $props();
</script>

<div class="sl-day-hero">
  <Sky phase={look.phase}>
    {#if look.appearance.timeStrength !== 'off'}<p class="sl-greeting">{greeting(look.phase, look.appearance.vibe)}</p>{/if}
    <div class="heading"><h1>Library</h1><Button variant="primary" href="/upload">Upload</Button></div>
    <SearchForm {model} />
  </Sky>
</div>
<div class="sl-day-card sl-day-filters"><FilterBar filters={model.filters} facets={model.facets} onchange={(f) => void model.setFilters(f)} /></div>
<LibraryStatus {model} />
<LibraryResults {model} />
```

`apps/web/src/lib/layouts/daylight.css` (unscoped: the other vibes use these layouts until theirs arrive, in their own tokens):

```css
/* Daylight layouts (spec §5). Classes, not [data-vibe] rules: a vibe without its own layout borrows these. */
.sl-day-hero { margin: 0 0 var(--vk-space-4); }
.sl-day-hero .vk-sky { border-radius: var(--vk-radius-lg); }
.sl-day-hero .heading { flex-wrap: wrap; }
.sl-day-hero h1 { margin: 0; font-size: var(--vk-text-xl); }
.sl-greeting { margin: 0 0 var(--vk-space-2); font: 600 var(--vk-text-md)/1.3 var(--vk-font-display); }
.sl-day-hero .searchbar { margin: var(--vk-space-4) 0 0; padding: var(--vk-space-1); border-radius: var(--vk-radius-pill); background: var(--vk-color-surface); box-shadow: 0 var(--vk-lift) 0 var(--vk-color-ground); }
.sl-day-hero .searchbar input { border-color: transparent; border-radius: var(--vk-radius-pill); background: transparent; }
.sl-day-hero .searchbar button { border-radius: var(--vk-radius-pill); }
.sl-day-card, .sl-card { margin: 0 0 var(--vk-space-4); padding: 0 var(--vk-space-4) var(--vk-space-4); min-width: 0; border-radius: var(--vk-radius-lg); background: var(--vk-color-surface); box-shadow: inset 0 0 0 1px var(--vk-color-line); }
.sl-day-filters { padding-bottom: 0; }
.sl-day-filters .filters { margin: 0; border-bottom: 0; }
.results--cards { display: grid; gap: var(--vk-space-3); max-width: 760px; }
.results--cards .result { padding: var(--vk-space-3) var(--vk-space-4); border-bottom: 0; border-left: 4px solid var(--o); border-radius: var(--vk-radius-md); background: var(--vk-color-surface); box-shadow: inset 0 0 0 1px var(--vk-color-line), 0 var(--vk-lift) 0 var(--vk-color-ground); transition: transform var(--vk-motion-fast) var(--vk-motion-easing); }
.results--cards .result:hover { transform: translateY(-1px); }
.results--cards .outcome { padding: 2px var(--vk-space-2); border-radius: var(--vk-radius-pill); box-shadow: inset 0 0 0 1px var(--o); }
.result-title { display: flex; align-items: center; gap: var(--vk-space-2); }
.result-face { display: inline-flex; flex: none; }
.sl-more { margin: 0 0 var(--vk-space-5); }
```

Import it in `+layout.svelte` after `app.css`: `import '$lib/layouts/daylight.css';`.

- [ ] **Step 6: The route and the registry**

`apps/web/src/routes/+page.svelte` becomes:

```svelte
<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import { LAYOUTS } from '$lib/layouts/registry';
  import { LibraryModel } from '$lib/screens/library.svelte';
  import VibeLayout from '$lib/vibe/VibeLayout.svelte';

  const model = new LibraryModel(() => page.url.searchParams, (href) => goto(href, { replaceState: true, keepFocus: true, noScroll: true }));
</script>

<svelte:head><title>Library · Superlibrary</title></svelte:head>
<VibeLayout layouts={LAYOUTS.library} {model} />
```

`registry.ts`: import `type { Component } from 'svelte'`, `type { Layouts } from '$lib/vibe/layout'`, `type { LibraryModel } from '$lib/screens/library.svelte'`, `LibraryDaylight from './library/LibraryDaylight.svelte'`, and replace `LAYOUTS` (the type imports of the models are type-only, so the registry adds no runtime cycle):

```ts
type Of<M> = Layouts<Component<{ model: M }>>;
export const LAYOUTS = {
  library: { daylight: LibraryDaylight } satisfies Of<LibraryModel>,
};
```

- [ ] **Step 7: Run the tests**

Run: `pnpm -C apps/web test && pnpm -C apps/web typecheck`
Expected: the model test passes (4); `routes/page.svelte.test.ts` still passes (`.heading a[href="/upload"]` is the kit primary button; Try again resumes the cursor); everything else passes.

- [ ] **Step 8: Commit**

```bash
git add -A apps/web/src
git commit -m "Library home: one view model, shared sections, and the Daylight layout under a sky" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8"
```

---

### Task 9: The item page's view model

**Files:**
- Create: `apps/web/src/lib/screens/item.svelte.ts`, `apps/web/src/lib/screens/item.svelte.test.ts`
- Modify: `apps/web/src/lib/ItemView.svelte` (script replaced by the model; markup reads `model.*`)

**Interfaces:**
- Consumes: everything `ItemView.svelte` imports today, plus `look` and `makerOf`.
- Produces `class ItemModel`, constructor `(props: () => { itemId: string; version?: number }, api?: Api)`:
  - state: `phase`, `refusal`, `item`, `versions`, `shown`, `frameError`, `record`, `removed`, `notice`, `copied`, `expires`, `expiryError`, `saving`, `pending: Pending | null`, `busy`, `dialogError`, `noticeEl` (bound by the route's Toast)
  - derived: `itemId`, `me`, `manage`, `current`, `latestLive`, `canRetryRefusal`, `showLatestOffer`, `details: Row[]`, `detailsHeading`, `provenance: Row[]`, `visibility`, `versionWords`, `deleteWords`, `maker`, `createdByWords`, `kindWords`, `headerActions: ToolbarItem[]`, `expiryHeading`, `tabTitle`, `hasSpec`, `entryCount`, `tomorrow`
  - attachments: `viewer`, `refusalAnchor`, `removedAnchor`
  - actions: `load()`, `showUrl(n)`, `followVersion(n)`, `pick(n, e)`, `showLatest()`, `retryViewer()`, `copy(text, what, el)`, `revokeVersion(e, n)`, `revokeItem(e)`, `confirmPending(reason)`, `cancelPending()`, `saveExpiry(clear)`, `dismissNotice()`, `moderated(notice)`, `removedNow()`
  - exports `UNREACHABLE`, `tomorrowLocal(now?)`, types `ItemPhase`, `Pending`

- [ ] **Step 1: Write the failing test** at `apps/web/src/lib/screens/item.svelte.test.ts`

```ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';

const mounts: Array<{ el: HTMLElement; destroyed: boolean }> = [];
vi.mock('@superlibrary/embed', async (orig) => ({
  ...(await orig<object>()),
  mountArtifact: async (el: HTMLElement) => { const m = { el, destroyed: false }; mounts.push(m); return { destroy() { m.destroyed = true; }, setTheme() {}, setVersion: async () => true }; },
}));
vi.mock('$app/navigation', () => ({ replaceState: vi.fn(), goto: vi.fn() }));
let reply: (path: string, init?: RequestInit) => Response = () => Response.json({});
vi.mock('$lib/session.svelte', () => ({
  session: { me: { principalId: 'prn_000000000000000000a2', org: 'org_1', workspaceId: 'wks_1', role: 'owner' } },
  api: async (p: string, i?: RequestInit) => reply(p, i),
}));
import { ItemModel, UNREACHABLE } from './item.svelte';

const ID = 'itm_00000000000000a1';
const item = { id: ID, kind: 'artifact', title: 'Report', scope: 'workspace', outcome: 'completed', createdBy: 'prn_000000000000000000a2', createdAt: '2026-10-01T00:00:00.000Z', latestVersion: 2, expiresAt: null, revokedAt: null };
const v = (n: number, extra: object = {}) => ({ version: n, entry: 'a.md', view: 'markdown', mediaType: 'text/markdown', totalBytes: 10, fileCount: 1, sha256: 'a'.repeat(64), createdAt: '2026-10-01T00:00:00.000Z', revokedAt: null, scanOverride: false, files: [], ...extra });
const settle = async () => { for (let i = 0; i < 6; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); } };
let stop: (() => void) | null = null;
afterEach(() => { stop?.(); stop = null; mounts.length = 0; });
const make = (props: { itemId: string; version?: number }) => { let m!: ItemModel; stop = $effect.root(() => { m = new ItemModel(() => props); }); return m; };

describe('the item page model', () => {
  it('reads the item and says its facts', async () => {
    reply = () => Response.json({ item, versions: [v(2), v(1)] });
    const m = make({ itemId: ID });
    await settle();
    expect(m.phase).toBe('ok');
    expect(m.manage).toBe(true);
    expect(m.versionWords).toBe('v2 (latest)');
    expect(m.detailsHeading).toBe('Details · version 2');
    expect(m.visibility).toBe('Everyone in the workspace');
    expect(m.headerActions.map((a) => a.label)).toEqual(['Upload a new version']);
    expect(m.tabTitle).toBe('Report');
  });

  it('a bad id is refused without asking; an unreachable library offers Try again', async () => {
    const calls: string[] = [];
    reply = (p) => { calls.push(p); throw new TypeError('offline'); };
    const bad = make({ itemId: 'not-an-id' });
    await settle();
    expect(bad.refusal).toBe('Nothing here, or you cannot see it.');
    expect(bad.canRetryRefusal).toBe(false);
    expect(calls).toEqual([]);
    stop!();
    const off = make({ itemId: ID });
    await settle();
    expect(off.refusal).toBe(UNREACHABLE);
    expect(off.canRetryRefusal).toBe(true);
  });

  it('mounts one viewer on the attached element; a new element replaces it', async () => {
    reply = () => Response.json({ item, versions: [v(1)] });
    const m = make({ itemId: ID });
    await settle();
    const a = document.createElement('div');
    const detach = m.viewer(a) as () => void;
    await settle();
    expect(mounts.map((x) => x.el)).toEqual([a]);
    detach();
    const b = document.createElement('div');
    m.viewer(b);
    await settle();
    expect(mounts[0]!.destroyed).toBe(true);
    expect(mounts.map((x) => x.el)).toEqual([a, b]);
  });

  it('revoking a version asks first, then says so', async () => {
    let revoked = false;
    reply = (p) => {
      if (p.endsWith('/versions/2/revoke')) { revoked = true; return Response.json({}); }
      return Response.json({ item, versions: revoked ? [v(2, { revokedAt: '2026-10-02T00:00:00.000Z' }), v(1)] : [v(2), v(1)] });
    };
    const m = make({ itemId: ID });
    await settle();
    m.revokeVersion(new MouseEvent('click'), 2);
    expect(m.pending?.action).toBe('Revoke version 2');
    await m.confirmPending('');
    await settle();
    expect(revoked).toBe(true);
    expect(m.pending).toBeNull();
    expect(m.notice).toBe('Version 2 was revoked.');
  });

  it('a delete date must be after today', async () => {
    reply = () => Response.json({ item, versions: [v(1)] });
    const m = make({ itemId: ID });
    await settle();
    m.expires = '2000-01-01';
    await m.saveExpiry(false);
    expect(m.expiryError).toBe('Choose a date after today.');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm -C apps/web exec vitest run src/lib/screens/item.svelte.test.ts`
Expected: FAIL (`./item.svelte` cannot be resolved).

- [ ] **Step 3: Implement** `apps/web/src/lib/screens/item.svelte.ts`

```ts
import { tick, untrack } from 'svelte';
import type { Attachment } from 'svelte/attachments';
import { replaceState } from '$app/navigation';
import type { ItemSummary, VersionSummary, WorkRecordView } from '@superlibrary/contract';
import { mountArtifact, visibilityWords, type Mounted } from '@superlibrary/embed';
import type { ToolbarItem } from '$kit/Toolbar.svelte';
import {
  ItemError, askRevokeItem, askRevokeVersion, change, day, embedUrlGetter, explain, mayManage, provenanceRows, readItem,
  scopeSetter, shareInfoGetter, shownVersion, versionRows, versionsGetter, type Ask, type Row,
} from '$lib/item';
import { api as sessionApi, session } from '$lib/session.svelte';
import { deleteOnToIso } from '$lib/upload';
import { specRows, timelineOf } from '$lib/record';
import { look } from '$lib/vibe/appearance.svelte';
import { makerOf, type Maker } from '$lib/vibe/faces';

type Api = (path: string, init?: RequestInit) => Promise<Response>;
export type ItemPhase = 'loading' | 'ok' | 'expired' | 'refused';
export type Pending = Ask & { opener: HTMLElement | null; run: (reason: string) => Promise<string | null> };
export const UNREACHABLE = 'The library could not be reached. Check your connection and try again.';

/** Tomorrow in the person's own time zone (iOS's date picker does not enforce `min`). */
export function tomorrowLocal(now: Date = new Date()): string {
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const anchor = (set: (el: HTMLElement | null) => void): Attachment<HTMLElement> => (el) => { set(el); return () => set(null); };

/** The item page's data and actions (spec §5.2): what ItemView.svelte held, so every vibe's layout can draw it. */
export class ItemModel {
  phase = $state<ItemPhase>('loading');
  refusal = $state('');
  item = $state<ItemSummary | null>(null);
  versions = $state<VersionSummary[]>([]);
  /** The version the viewer shows: the route's, then the person's choice; undefined is the newest live one. */
  shown = $state<number | undefined>(undefined);
  frameError = $state<string | null>(null);
  record = $state<WorkRecordView | null>(null);
  removed = $state(false);
  notice = $state<string | null>(null);
  copied = $state<string | null>(null);
  expires = $state('');
  expiryError = $state<string | null>(null);
  saving = $state(false);
  pending = $state<Pending | null>(null);
  busy = $state(false);
  dialogError = $state<string | null>(null);
  /** The route's Toast binds this; focus goes there when a dialog's opener is gone. */
  noticeEl = $state.raw<HTMLElement | null>(null);
  readonly tomorrow = tomorrowLocal();

  readonly #props: () => { itemId: string; version?: number };
  readonly #api: Api;
  #frame = $state.raw<HTMLElement | null>(null);
  /** Bumped to mount the viewer again (after a version is revoked, or on Try again). */
  #mountKey = $state(0);
  #mounted: Mounted | null = null;
  #loads = 0;
  #refusalEl: HTMLElement | null = null;
  #removedEl: HTMLElement | null = null;

  readonly itemId = $derived(this.#props().itemId);
  readonly me = $derived(session.me);
  readonly manage = $derived(this.item !== null && this.me !== null && mayManage(this.me, this.item));
  readonly current = $derived(shownVersion(this.versions, this.shown));
  readonly latestLive = $derived(this.versions.find((v) => !v.revokedAt)?.version);
  readonly canRetryRefusal = $derived(this.refusal === UNREACHABLE);
  readonly showLatestOffer = $derived(this.shown !== undefined && this.latestLive !== undefined && this.shown !== this.latestLive);
  readonly details: Row[] = $derived(this.current ? versionRows(this.current) : []);
  readonly detailsHeading = $derived(`Details${this.current ? ` · version ${this.current.version}` : ''}`);
  readonly provenance: Row[] = $derived(this.item ? provenanceRows(this.item, this.me) : []);
  readonly visibility = $derived(this.item ? visibilityWords({ scope: this.item.scope, canWiden: false, boardVisible: this.item.audience === 'board' }) : '');
  readonly versionWords = $derived(this.current ? `v${this.current.version}${this.current.version === this.latestLive ? ' (latest)' : ''}` : null);
  readonly deleteWords = $derived(this.item?.expiresAt ? `deleted on ${day(this.item.expiresAt)}` : null);
  readonly maker: Maker | null = $derived(this.item ? makerOf(this.item.source, this.item.createdBy) : null);
  readonly createdByWords = $derived(this.provenance[0]?.value ?? '');
  readonly kindWords = $derived(this.item?.kind === 'work-record' ? 'Work record' : 'Artifact');
  readonly headerActions: ToolbarItem[] = $derived(this.manage && this.item?.kind === 'artifact' ? [{ label: 'Upload a new version', icon: 'upload', href: `/upload?item=${this.itemId}`, primary: true }] : []);
  readonly expiryHeading = $derived(this.item?.expiresAt ? `To be deleted on ${day(this.item.expiresAt)}` : 'Delete on a date');
  readonly tabTitle = $derived(this.item ? this.item.title : this.phase === 'expired' ? 'Expired' : 'Item');
  /** Work records: whether there is a spec to show, and how many timeline entries (summaries and tiles). */
  readonly hasSpec = $derived(this.record ? specRows(this.record.record.spec).length > 0 : false);
  readonly entryCount = $derived(this.record ? timelineOf(this.record.record).length : 0);

  /** Where the viewer mounts. Any layout attaches it: `<div class="viewer" {@attach model.viewer}></div>`. */
  readonly viewer: Attachment<HTMLElement> = (el) => { this.#frame = el; return () => { if (this.#frame === el) this.#frame = null; }; };
  readonly refusalAnchor = anchor((el) => { this.#refusalEl = el; });
  readonly removedAnchor = anchor((el) => { this.#removedEl = el; });

  constructor(props: () => { itemId: string; version?: number }, api: Api = sessionApi) {
    this.#props = props;
    this.#api = api;
    // A new item or route version: start again.
    $effect(() => {
      const { itemId, version } = this.#props();
      void itemId;
      untrack(() => { this.shown = version; this.phase = 'loading'; this.notice = null; this.removed = false; void this.load(); });
    });
    // A change of theme reaches the open viewer.
    $effect(() => { const t = look.theme; this.#mounted?.setTheme(t); });
    // The app is one more host of the embed (spec §9 of the product spec). A mount still pending when
    // this runs again (or the page goes) is destroyed when it resolves.
    $effect(() => {
      const el = this.#frame;
      void this.#mountKey;
      if (!el || this.phase !== 'ok' || this.item?.kind !== 'artifact') return;
      const id = this.itemId;
      const [v, title] = untrack(() => [this.shown, this.item?.title] as const);
      let live = true;
      let mine: Mounted | null = null;
      this.frameError = null;
      mountArtifact(el, {
        itemId: id, ...(v !== undefined ? { version: v } : {}), ...(title ? { title } : {}), appUrl: window.location.origin, theme: untrack(() => look.theme),
        getEmbedUrl: embedUrlGetter(this.#api), getVersions: versionsGetter(this.#api), getShareInfo: shareInfoGetter(this.#api, () => session.me), setScope: scopeSetter(this.#api),
        onVersionChange: (n) => this.followVersion(n),
        onScopeChange: () => { this.notice = 'Everyone in the workspace can now see it.'; void this.load(); },
      })
        .then((m) => { if (!live) { m.destroy(); return; } mine = m; this.#mounted = m; })
        .catch((e: unknown) => {
          if (!live) return;
          const code = e instanceof ItemError ? e.code : '';
          this.frameError = code === 'revoked' && v !== undefined ? `Version ${v} was revoked.` : code ? explain(code) : 'The viewer could not be loaded.';
        });
      return () => { live = false; mine?.destroy(); if (this.#mounted === mine) this.#mounted = null; };
    });
  }

  async load(): Promise<void> {
    const mine = ++this.#loads;
    const itemId = this.itemId;
    let r: Awaited<ReturnType<typeof readItem>>;
    try { r = await readItem(this.#api, itemId); } catch { r = { state: 'refused', code: 'unreachable' }; }
    if (mine !== this.#loads) return;
    if (r.state === 'ok') {
      this.item = r.item;
      this.versions = r.versions;
      if (r.item.kind === 'work-record') {
        let rec: WorkRecordView | null = null;
        try {
          const res = await this.#api(`/api/v1/items/${itemId}/record`);
          if (res.ok) rec = (await res.json()) as WorkRecordView;
        } catch { /* unreachable, or not JSON: the record could not be loaded */ }
        if (mine !== this.#loads) return;
        this.record = rec;
      } else this.record = null;
      this.phase = 'ok';
      return;
    }
    this.item = null;
    this.versions = [];
    this.phase = r.state;
    this.refusal = r.state === 'refused' ? (r.code === 'unreachable' ? UNREACHABLE : explain(r.code)) : '';
  }

  showUrl = (n: number | undefined) => (n === undefined ? `/a/${this.itemId}` : `/a/${this.itemId}/v/${n}`);
  followVersion(n: number | undefined) { this.shown = n; replaceState(this.showUrl(n), {}); }
  /** A plain click on a version switches the viewer in place; a modified click opens the link as usual. */
  async pick(n: number, e: MouseEvent) {
    if (!this.#mounted || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    if (await this.#mounted.setVersion(n)) this.followVersion(n);
  }
  showLatest() { this.followVersion(undefined); this.#mountKey++; }
  retryViewer() { this.#mountKey++; }

  async copy(text: string, what: string, el: HTMLElement | null) {
    try { await navigator.clipboard.writeText(text); this.copied = `${what} copied.`; } catch {
      this.copied = `Could not copy. The ${what} is selected; copy it by hand.`;
      if (el) window.getSelection()?.selectAllChildren(el);
    }
  }

  #ask(e: MouseEvent, a: Ask, run: (reason: string) => Promise<string | null>) {
    this.dialogError = null;
    this.pending = { ...a, opener: e.currentTarget instanceof HTMLElement ? e.currentTarget : null, run };
  }
  revokeVersion = (e: MouseEvent, n: number) => this.#ask(e, askRevokeVersion(n), async () => {
    const err = await change(this.#api, `/api/v1/items/${this.itemId}/versions/${n}/revoke`, 'POST', {});
    if (err) return err;
    this.notice = `Version ${n} was revoked.`;
    if (this.current?.version === n) this.followVersion(undefined);
    await this.load();
    this.#mountKey++; // the toolbar's version menu and, if it was shown, the frame
    return null;
  });
  revokeItem = (e: MouseEvent) => this.#ask(e, askRevokeItem(this.item?.title ?? 'this item'), async (reason) => {
    const err = await change(this.#api, `/api/v1/items/${this.itemId}/revoke`, 'POST', reason ? { reason } : {});
    if (err) return err;
    await this.load();
    return null;
  });
  async confirmPending(reason: string) {
    if (!this.pending || this.busy) return;
    this.busy = true;
    this.dialogError = null;
    const err = await this.pending.run(reason);
    this.busy = false;
    if (err) { this.dialogError = err; return; }
    this.pending = null;
    await tick();
    // The control that opened it may be gone (a revoked version has no Revoke button; a revoked item has no page): say what happened there.
    if (document.activeElement === document.body) (this.noticeEl ?? this.#refusalEl)?.focus();
  }
  cancelPending() { if (!this.busy) this.pending = null; }

  async saveExpiry(clear: boolean) {
    this.expiryError = null;
    if (!clear && (!this.expires || Date.parse(deleteOnToIso(this.expires)) <= Date.now())) { this.expiryError = 'Choose a date after today.'; return; }
    this.saving = true;
    const at = clear ? null : deleteOnToIso(this.expires);
    const err = await change(this.#api, `/api/v1/items/${this.itemId}`, 'PATCH', { expiresAt: at });
    this.saving = false;
    if (err) { this.expiryError = err; return; }
    this.expires = '';
    this.notice = at ? `It will be deleted on ${day(at)}.` : 'It will be kept, with no delete date.';
    await this.load();
  }

  dismissNotice() { this.notice = null; }
  /** ModerationPanel's `onchanged`. */
  moderated(n: string) { this.notice = n; void this.load(); }
  /** ModerationPanel's `onremoved`: the heading takes focus. */
  async removedNow() { this.removed = true; await tick(); this.#removedEl?.focus(); }
}
```

- [ ] **Step 4: Point ItemView at the model (same markup)**

In `apps/web/src/lib/ItemView.svelte` replace the whole `<script>` with:

```svelte
<script lang="ts">
  import { formatBytes } from '@superlibrary/embed';
  import ConfirmDialog from '$kit/ConfirmDialog.svelte';
  import Toast from '$kit/Toast.svelte';
  import Button from '$kit/Button.svelte';
  import ItemHeader from '$lib/ItemHeader.svelte';
  import WorkRecordView from '$lib/WorkRecordView.svelte';
  import RelatedList from '$lib/RelatedList.svelte';
  import AddToCollection from '$lib/AddToCollection.svelte';
  import ModerationPanel from '$lib/ModerationPanel.svelte';
  import { when } from '$lib/item';
  import { ItemModel } from '$lib/screens/item.svelte';

  let { itemId, version }: { itemId: string; version?: number } = $props();
  const model = new ItemModel(() => ({ itemId, version }));
</script>
```

and in the markup make these mechanical replacements (nothing else changes; Task 10 replaces this markup):
- every bare `phase`, `item`, `versions`, `current`, `latestLive`, `shown`, `frameError`, `record`, `removed`, `notice`, `copied`, `expires`, `expiryError`, `saving`, `pending`, `busy`, `dialogError`, `manage`, `me`, `tomorrow`, `refusal` → `model.<name>`;
- `bind:value={expires}` → `bind:value={model.expires}`; `bind:this={frame}` → `{@attach model.viewer}`; `bind:this={removedHeading}` → `{@attach model.removedAnchor}`; `bind:this={refusalEl}` → `{@attach model.refusalAnchor}`; `bind:el={noticeEl}` → `bind:el={model.noticeEl}`;
- `saveExpiry(…)`, `load`, `showUrl(…)`, `followVersion(…)`, `pick(…)`, `copy(…)`, `revokeVersion(…)`, `revokeItem` → `model.…`; `mountKey++` → `model.retryViewer()` (and the Show-the-latest link's handler → `model.showLatest()`);
- `{#if refusal.startsWith('The library could not')}` → `{#if model.canRetryRefusal}`;
- `<ModerationPanel … onchanged={(n) => model.moderated(n)} onremoved={() => model.removedNow()} />`;
- ConfirmDialog: `onconfirm={(r) => model.confirmPending(r)} oncancel={() => model.cancelPending()}`;
- `<svelte:head><title>{model.tabTitle} · Superlibrary</title></svelte:head>`;
- the expiry snippet's heading for managers: `{@render expiryForm(model.expiryHeading)}`; the ItemHeader `actions={model.headerActions}`.

- [ ] **Step 5: Run the tests**

Run: `pnpm -C apps/web test && pnpm -C apps/web typecheck`
Expected: `item.svelte.test.ts` 5 passed; `ItemView.svelte.test.ts` (heading focus after removal, next item on route change) still passes; all else passes.

- [ ] **Step 6: Commit**

```bash
git add -A apps/web/src
git commit -m "Item page: one view model; the viewer mounts on whatever element a layout attaches" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8"
```

---

### Task 10: Item sections, the shared states, and the Daylight item layout

**Files:**
- Create in `apps/web/src/lib/sections/`: `VersionsSection.svelte`, `DetailsSection.svelte`, `ProvenanceSection.svelte`, `FrameError.svelte`, `ExpiryForm.svelte`, `ManageSection.svelte`, `RecordLine.svelte`, `SpecRows.svelte`, `Timeline.svelte`, `LinkedArtifacts.svelte`, `RecordFailed.svelte`
- Create: `apps/web/src/lib/layouts/item/ItemStates.svelte`, `apps/web/src/lib/layouts/item/ItemDaylight.svelte`
- Modify: `apps/web/src/lib/ItemView.svelte` (markup replaced), `apps/web/src/lib/ItemHeader.svelte` (maker), `apps/web/src/lib/WorkRecordView.svelte` (composes the record sections), `apps/web/src/lib/RelatedList.svelte` and `apps/web/src/lib/AddToCollection.svelte` (content only, no own `section`/`h2`), `apps/web/src/lib/ModerationPanel.svelte` (`level` prop), `apps/web/src/lib/layouts/registry.ts`, `apps/web/src/lib/layouts/daylight.css`

**Interfaces:**
- Consumes: `ItemModel` (Task 9).
- Produces (all take `{ model: ItemModel }` unless said):
  - `VersionsSection { model; variant?: 'list' }` (Studio adds `'table'`, Quiet `'plain'`), `DetailsSection { model }`, `ProvenanceSection { model }`, `FrameError { model }`, `ExpiryForm { model; heading: string; level?: 2 | 3 }`, `ManageSection { model; level?: 2 | 3 }`, `RecordFailed { model }`
  - `RecordLine { view: WorkRecordView }`, `SpecRows { view }`, `Timeline { view; variant?: 'bubbles' }` (later `'letters' | 'log' | 'plain'`; always `<ol class="timeline …">`), `LinkedArtifacts { view }`
  - `WorkRecordView { view: WorkRecordView; timeline?: TimelineVariant }` (= RecordLine, Spec h2 + SpecRows, Timeline h2 + Timeline, Artifacts h2 + LinkedArtifacts)
  - `RelatedList { itemId }`, `AddToCollection { itemId }`: content only; the layout supplies `<section aria-labelledby><h2 id>`
  - `ModerationPanel { item; onchanged; onremoved; level?: 2 | 3 }`
  - `ItemHeader { item; version?; latest?; actions?; maker?: Maker | null; band?: boolean }`
  - `ItemStates { model }`: removed, loading, expired, refused
  - `LAYOUTS.item = { daylight: ItemDaylight }`

- [ ] **Step 1: Write the sections** (each is today's markup from `ItemView.svelte`, moved; keep every class, word and attribute)

`VersionsSection.svelte`:

```svelte
<script lang="ts">
  import { formatBytes } from '@superlibrary/embed';
  import { when } from '$lib/item';
  import type { ItemModel } from '$lib/screens/item.svelte';
  let { model, variant = 'list' }: { model: ItemModel; variant?: 'list' } = $props();
  const files = (n: number) => `${n} file${n === 1 ? '' : 's'}`;
</script>

{#if variant === 'list'}
  <ul class="versions">
    {#each model.versions as v (v.version)}
      <li class:current={model.current?.version === v.version}>
        <div class="vline">
          {#if v.revokedAt}
            <span class="vname">v{v.version}</span>
          {:else}
            <a class="vname" href={model.showUrl(v.version)} aria-current={model.current?.version === v.version ? 'true' : undefined} onclick={(e) => model.pick(v.version, e)}>v{v.version}</a>
          {/if}
          <small class="muted">{when(v.createdAt)} · {formatBytes(v.totalBytes)} · {files(v.fileCount)}</small>
          <span class="badges">
            {#if model.current?.version === v.version}<span class="badge">Shown</span>{/if}
            {#if v.version === model.latestLive}<span class="badge">Latest</span>{/if}
            {#if v.revokedAt}<span class="badge danger-text">Revoked</span>{/if}
            {#if v.scanOverride}<span class="badge">Secret scan overridden</span>{/if}
          </span>
        </div>
        {#if model.manage && !v.revokedAt}
          <button type="button" class="danger-outline" onclick={(e) => model.revokeVersion(e, v.version)}>Revoke<span class="visually-hidden"> version {v.version}</span></button>
        {/if}
      </li>
    {/each}
  </ul>
{/if}
```

(The `variant` branches added by phases 3 and 4 sit next to `list` in this one file, so a version's fields are written in one place per shape and checked by the parity test.)

`DetailsSection.svelte`:

```svelte
<script lang="ts">
  import type { ItemModel } from '$lib/screens/item.svelte';
  let { model }: { model: ItemModel } = $props();
</script>

{#if model.current}
  <dl class="rows">
    <dt>Item</dt><dd>{model.kindWords}</dd>
    {#each model.details as r (r.label)}
      <dt>{r.label}</dt>
      <dd>
        {#if r.copy}
          <code class="hash" id={`row-${r.label}`}>{r.value}</code>
          {#if r.note}<small class="muted"> ({r.note})</small>{/if}
          <button type="button" class="copy" onclick={() => model.copy(r.value, r.label, document.getElementById(`row-${r.label}`))}>Copy<span class="visually-hidden"> {r.label}</span></button>
        {:else if r.mono}<code>{r.value}</code>{:else}{r.value}{/if}
      </dd>
    {/each}
  </dl>
  <p class="muted" role="status">{model.copied ?? ''}</p>
{:else}
  <p class="muted">No version of this item can be viewed.</p>
{/if}
```

`ProvenanceSection.svelte`:

```svelte
<script lang="ts">
  import type { ItemModel } from '$lib/screens/item.svelte';
  let { model }: { model: ItemModel } = $props();
</script>

<dl class="rows">
  {#each model.provenance as r (r.label)}<dt>{r.label}</dt><dd>{#if r.mono}<code>{r.value}</code>{:else}{r.value}{/if}</dd>{/each}
</dl>
```

`FrameError.svelte`:

```svelte
<script lang="ts">
  import type { ItemModel } from '$lib/screens/item.svelte';
  let { model }: { model: ItemModel } = $props();
</script>

{#if model.frameError}
  <div class="frame-error">
    <p class="error" role="alert">{model.frameError}</p>
    <div class="actions">
      {#if model.showLatestOffer}<a class="button" href={model.showUrl(undefined)} onclick={(e) => { e.preventDefault(); model.showLatest(); }}>Show the latest version</a>{/if}
      <button type="button" onclick={() => model.retryViewer()}>Try again</button>
    </div>
  </div>
{/if}
```

`ExpiryForm.svelte` (today's `expiryForm` snippet):

```svelte
<script lang="ts">
  import type { ItemModel } from '$lib/screens/item.svelte';
  let { model, heading, level = 2 }: { model: ItemModel; heading: string; level?: 2 | 3 } = $props();
</script>

<!-- novalidate: the page says why in words, the same on every browser (iOS does not enforce min). -->
<form class="stack" novalidate onsubmit={(e) => { e.preventDefault(); void model.saveExpiry(false); }}>
  <svelte:element this={`h${level}`}>{heading}</svelte:element>
  <label class="field">Delete on <input name="expires" type="date" min={model.tomorrow} bind:value={model.expires} disabled={model.saving} /></label>
  {#if model.expiryError}<p class="error" role="alert">{model.expiryError}</p>{/if}
  <div class="actions">
    <button type="submit" disabled={model.saving || !model.expires}>Set the delete date</button>
    {#if model.item?.expiresAt || model.phase === 'expired'}<button type="button" disabled={model.saving} onclick={() => model.saveExpiry(true)}>Keep it (no delete date)</button>{/if}
  </div>
</form>
```

`ManageSection.svelte` (the three manager panels; the layout supplies the "Manage" heading):

```svelte
<script lang="ts">
  import ModerationPanel from '$lib/ModerationPanel.svelte';
  import type { ItemModel } from '$lib/screens/item.svelte';
  import ExpiryForm from './ExpiryForm.svelte';
  let { model, level = 2 }: { model: ItemModel; level?: 2 | 3 } = $props();
</script>

{#if model.manage && model.item}
  <ModerationPanel item={model.item} {level} onchanged={(n) => model.moderated(n)} onremoved={() => model.removedNow()} />
  <div class="panel"><ExpiryForm {model} heading={model.expiryHeading} {level} /></div>
  <div class="panel">
    <svelte:element this={`h${level}`}>Revoke</svelte:element>
    <p class="muted">Nobody will be able to view it again. The record of it stays.</p>
    <button type="button" class="danger" onclick={(e) => model.revokeItem(e)}>Revoke this item</button>
  </div>
{/if}
```

`ModerationPanel.svelte`: add `level = 2` to its props (`level?: 2 | 3`) and replace `<h2 id="moderate-h">Moderate</h2>` with `<svelte:element this={`h${level}`} id="moderate-h">Moderate</svelte:element>`. Nothing else changes.

`RecordFailed.svelte`:

```svelte
<script lang="ts">
  import type { ItemModel } from '$lib/screens/item.svelte';
  let { model }: { model: ItemModel } = $props();
</script>

<p class="error" role="alert">The record could not be loaded.</p>
<p><button type="button" onclick={() => model.load()}>Try again</button></p>
```

Split `WorkRecordView.svelte` into `RecordLine` (the board/stage line, the Superpipeline link, the two info toasts), `SpecRows` (the `dl` of `specRows`), `Timeline` (the `ol.timeline` and its entries) and `LinkedArtifacts` (the list or "No artifacts linked that you can see."), each taking `{ view: WorkRecordView }` and containing exactly today's markup for that part. `Timeline` takes `variant = 'bubbles'` and renders `<ol class="timeline timeline--{variant}">`; in the `bubbles` variant each `li` also gets, before `<strong>`, `{#if e.who}<span class="tl-face" aria-hidden="true"><Face id={e.who} label={e.who} size={28} /></span>{/if}` (vibekit `Face`). `WorkRecordView.svelte` becomes:

```svelte
<!-- apps/web/src/lib/WorkRecordView.svelte -->
<script lang="ts">
  import type { WorkRecordView } from '@superlibrary/contract';
  import { specRows } from '$lib/record';
  import LinkedArtifacts from '$lib/sections/LinkedArtifacts.svelte';
  import RecordLine from '$lib/sections/RecordLine.svelte';
  import SpecRows from '$lib/sections/SpecRows.svelte';
  import Timeline from '$lib/sections/Timeline.svelte';
  let { view, timeline = 'bubbles' }: { view: WorkRecordView; timeline?: 'bubbles' } = $props();
  const hasSpec = $derived(specRows(view.record.spec).length > 0);
</script>

<section class="record" aria-labelledby="timeline-h">
  <RecordLine {view} />
  {#if hasSpec}<div class="sl-brief"><span class="sl-pin" aria-hidden="true">Brief</span><h2>Spec</h2><SpecRows {view} /></div>{/if}
  <h2 id="timeline-h">Timeline</h2>
  <Timeline {view} variant={timeline} />
  <h2>Artifacts</h2>
  <LinkedArtifacts {view} />
</section>
```

`RelatedList.svelte` and `AddToCollection.svelte`: delete their outer `<section …>` element and their `<h2>`; keep everything inside (states, list, form, messages). `AddToCollection`'s inner wrapper becomes `<div class="sl-collect">`.

`ItemHeader.svelte`: add props `maker = null` (`Maker | null`) and `band = false`; the `header` gets `class="item-header"` plus `class:sl-band={band}`; the meta line starts with `{#if maker}<span class="item-face" aria-hidden="true"><Face id={maker.id} label={maker.label} mood={moodOf(item.outcome)} size={24} /></span>{/if}` before the `OutcomeBadge`. (Its test still passes: the meta words are unchanged.)

- [ ] **Step 2: Write** `apps/web/src/lib/layouts/item/ItemStates.svelte` (every vibe; today's markup)

```svelte
<script lang="ts">
  import Button from '$kit/Button.svelte';
  import type { ItemModel } from '$lib/screens/item.svelte';
  import ExpiryForm from '$lib/sections/ExpiryForm.svelte';
  let { model }: { model: ItemModel } = $props();
</script>

{#if model.removed}
  <h1 tabindex="-1" {@attach model.removedAnchor}>Removed from memory</h1>
  <p role="status">It is gone from the library and from search. The audit log keeps your reason.</p>
  <p><Button href="/">Back to the library</Button></p>
{:else if model.phase === 'loading'}
  <p class="muted" role="status">Loading…</p>
{:else if model.phase === 'expired'}
  <h1>This has expired</h1>
  <p>It is no longer shown to anyone, and it will be deleted soon. The person who uploaded it, or an owner of the workspace, can keep it by choosing a new delete date or none.</p>
  <div class="panel sl-needs"><ExpiryForm {model} heading="Keep it" /></div>
  <p><a href="/">Back to the library</a></p>
{:else if model.phase === 'refused'}
  <p class="error" role="alert" tabindex="-1" {@attach model.refusalAnchor}>{model.refusal}</p>
  <div class="actions"><a class="button" href="/">Back to the library</a>{#if model.canRetryRefusal}<button type="button" onclick={() => model.load()}>Try again</button>{/if}</div>
{/if}
```

- [ ] **Step 3: Write** `apps/web/src/lib/layouts/item/ItemDaylight.svelte` (spec §5.2 Daylight; order is the parity order)

```svelte
<!-- Daylight: the item in a product-coloured band, the content right under it, then cards. -->
<script lang="ts">
  import AddToCollection from '$lib/AddToCollection.svelte';
  import ItemHeader from '$lib/ItemHeader.svelte';
  import RelatedList from '$lib/RelatedList.svelte';
  import WorkRecordView from '$lib/WorkRecordView.svelte';
  import type { ItemModel } from '$lib/screens/item.svelte';
  import DetailsSection from '$lib/sections/DetailsSection.svelte';
  import FrameError from '$lib/sections/FrameError.svelte';
  import ManageSection from '$lib/sections/ManageSection.svelte';
  import ProvenanceSection from '$lib/sections/ProvenanceSection.svelte';
  import RecordFailed from '$lib/sections/RecordFailed.svelte';
  import VersionsSection from '$lib/sections/VersionsSection.svelte';
  let { model }: { model: ItemModel } = $props();
  const item = $derived(model.item!);
</script>

<ItemHeader {item} version={model.current?.version} latest={model.latestLive} maker={model.maker} actions={model.headerActions} band />

{#if item.kind === 'artifact'}
  <div class="viewer" {@attach model.viewer}></div>
  <FrameError {model} />
  <div class="item-grid">
    <section class="sl-card" aria-labelledby="versions-h"><h2 id="versions-h">Versions</h2><VersionsSection {model} /></section>
    <section class="sl-card" aria-labelledby="details-h"><h2 id="details-h">{model.detailsHeading}</h2><DetailsSection {model} /></section>
  </div>
{:else if model.record}
  <div class="sl-card sl-record"><WorkRecordView view={model.record} timeline="bubbles" /></div>
{:else}
  <RecordFailed {model} />
{/if}

<section class="sl-card" aria-labelledby="provenance-h"><h2 id="provenance-h">Provenance</h2><ProvenanceSection {model} /></section>
<div class="item-grid">
  <section class="sl-card" aria-labelledby="related-h"><h2 id="related-h">Related</h2><RelatedList itemId={item.id} /></section>
  <section class="sl-card" aria-labelledby="collect-h"><h2 id="collect-h">Collections</h2><AddToCollection itemId={item.id} /></section>
</div>

{#if model.manage}
  <section class="manage" aria-labelledby="manage-h">
    <h2 id="manage-h" class="visually-hidden">Manage</h2>
    <ManageSection {model} level={2} />
  </section>
{/if}
```

Append to `daylight.css`:

```css
/* The item band: the product colour, the title and its facts, then the content right under it (130px / 170px budget). */
.item-header.sl-band { padding: var(--vk-space-2) var(--vk-space-3); border-radius: var(--vk-radius-lg); background: var(--vk-product-superlibrary-bg); color: var(--vk-product-superlibrary-fg); }
.item-header.sl-band .item-meta, .item-header.sl-band .kit-toolbar-item { color: inherit; }
/* The outcome word keeps a checked ground (surface), not the product chip. */
.item-header.sl-band .outcome { padding: 2px var(--vk-space-2); border-radius: var(--vk-radius-pill); background: var(--vk-color-surface); }
@media (min-width: 768px) {
  .item-header.sl-band { display: grid; grid-template-columns: minmax(0, 1fr) auto; align-items: start; gap: var(--vk-space-1) var(--vk-space-4); padding: var(--vk-space-4); }
  .item-header.sl-band .kit-toolbar-wrap { grid-column: 2; grid-row: 1 / span 2; }
}
.item-face, .tl-face { display: inline-flex; flex: none; }
.viewer { margin: var(--vk-space-2) 0 var(--vk-space-4); }
.sl-brief { position: relative; margin: 0 0 var(--vk-space-4); padding: var(--vk-space-1) var(--vk-space-4) var(--vk-space-3); border-radius: var(--vk-radius-md); background: var(--vk-color-raised); }
.sl-pin { position: absolute; top: calc(-1 * var(--vk-space-2)); right: var(--vk-space-4); padding: 2px var(--vk-space-2); border-radius: var(--vk-radius-pill); background: var(--vk-color-primary); color: var(--vk-color-primary-fg); font-size: var(--vk-text-sm); }
.timeline--bubbles { padding-left: 0; border-left: 0; }
.timeline--bubbles li { display: grid; grid-template-columns: auto 1fr; column-gap: var(--vk-space-2); margin: 0 0 var(--vk-space-3); padding: var(--vk-space-3); border-radius: var(--vk-radius-md); background: var(--vk-color-raised); box-shadow: inset 4px 0 0 var(--o, var(--vk-color-line)); }
.timeline--bubbles li::before { display: none; }
.timeline--bubbles li > :not(.tl-face) { grid-column: 2; }
```

- [ ] **Step 4: The screen entry** — `ItemView.svelte`'s markup becomes:

```svelte
<svelte:head><title>{model.tabTitle} · Superlibrary</title></svelte:head>

{#if model.notice}<Toast message={model.notice} onclose={() => model.dismissNotice()} bind:el={model.noticeEl} />{/if}

{#if model.removed || model.phase !== 'ok' || !model.item}
  <ItemStates {model} />
{:else}
  <VibeLayout layouts={LAYOUTS.item} {model} />
{/if}

{#if model.pending}
  <ConfirmDialog title={model.pending.title} message={model.pending.message} action={model.pending.action} reason={model.pending.reason ?? false} busy={model.busy}
    error={model.dialogError} opener={model.pending.opener} onconfirm={(r) => model.confirmPending(r)} oncancel={() => model.cancelPending()} />
{/if}
```

with the script importing only `ConfirmDialog`, `Toast`, `ItemModel`, `VibeLayout`, `LAYOUTS` and `ItemStates`. Add `item: { daylight: ItemDaylight } satisfies Of<ItemModel>,` to `LAYOUTS`.

- [ ] **Step 5: Run the tests**

Run: `pnpm -C apps/web test && pnpm -C apps/web typecheck`
Expected: all pass, including `ItemView.svelte.test.ts`, `ItemHeader.svelte.test.ts`, `WorkRecordView.svelte.test.ts` (three `ol.timeline > li`), `ModerationPanel.svelte.test.ts`, `AddToCollection.svelte.test.ts` (if it queried the `h2` or the `section`, query the form and messages instead; the region now belongs to the layout).

- [ ] **Step 6: Commit**

```bash
git add -A apps/web/src
git commit -m "Item page: shared sections own every field; the Daylight layout arranges them" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8"
```

---

### Task 11: Collections: two view models and the Daylight layouts

**Files:**
- Create: `apps/web/src/lib/screens/collections.svelte.ts`, `apps/web/src/lib/screens/collections.svelte.test.ts`, `apps/web/src/lib/sections/CollectionCreate.svelte`, `apps/web/src/lib/sections/CollectionList.svelte`, `apps/web/src/lib/sections/CollectionActions.svelte`, `apps/web/src/lib/sections/CollectionEntries.svelte`, `apps/web/src/lib/layouts/collections/CollectionsDaylight.svelte`, `apps/web/src/lib/layouts/collections/CollectionDaylight.svelte`
- Modify: `apps/web/src/routes/collections/+page.svelte`, `apps/web/src/routes/collections/[id]/+page.svelte`, `apps/web/src/lib/layouts/registry.ts`, `apps/web/src/lib/layouts/daylight.css`

**Interfaces:**
- Produces:
  - `countWords(n): string` ("1 item", "3 items")
  - `class CollectionsModel(go: (href: string) => unknown, api?)`: state `list`, `loading`, `error`, `name`, `description`, `creating`, `createError`; `load()`, `create(e?)`.
  - `class CollectionModel(id: () => string, go, api?)`: state `c`, `error`, `notice`, `editing`, `name`, `description`, `editError`, `deleting: HTMLElement | null`, `busy`, `dialogError`; derived `id`, `meta`, `ask`; attachment `renameAnchor`; `load()`, `startEdit()`, `stopEditing()`, `save(e)`, `remove(itemId, title)`, `askDelete(e)`, `confirmDelete()`, `cancelDelete()`, `dismissNotice()`.
  - Sections: `CollectionCreate { model: CollectionsModel }`, `CollectionList { model: CollectionsModel; variant?: 'cards' }`, `CollectionActions { model: CollectionModel }`, `CollectionEntries { model: CollectionModel; variant?: 'cards' }`.
  - `LAYOUTS.collections`, `LAYOUTS.collection`.

- [ ] **Step 1: Write the failing test** at `apps/web/src/lib/screens/collections.svelte.test.ts`

```ts
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { flushSync } from 'svelte';

let reply: (path: string, init?: RequestInit) => Response = () => Response.json({ collections: [] });
vi.mock('$lib/session.svelte', () => ({ api: async (p: string, i?: RequestInit) => reply(p, i) }));
import { CollectionModel, CollectionsModel, countWords } from './collections.svelte';

const settle = async () => { for (let i = 0; i < 6; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); } };
let stop: (() => void) | null = null;
afterEach(() => { stop?.(); stop = null; });
const detail = { id: 'col_0123456789abcdef', name: 'Week 41', description: '', createdBy: 'p', createdAt: '2026-10-01T00:00:00.000Z', updatedAt: '2026-10-01T00:00:00.000Z', itemCount: 1, canEdit: true, entries: [] };

describe('collections', () => {
  it('counts in words', () => { expect(countWords(1)).toBe('1 item'); expect(countWords(3)).toBe('3 items'); });

  it('creating needs a name, then opens the new collection', async () => {
    const go = vi.fn();
    reply = (p, i) => (i?.method === 'POST' ? Response.json({ ...detail, id: 'col_00000000000000c9' }) : Response.json({ collections: [] }));
    let m!: CollectionsModel;
    stop = $effect.root(() => { m = new CollectionsModel(go); });
    await settle();
    await m.create();
    expect(m.createError).toBe('Give the collection a name.');
    m.name = 'Week 42';
    await m.create();
    expect(go).toHaveBeenCalledWith('/collections/col_00000000000000c9');
  });

  it('a bad id is refused without asking, and the meta line is in words', async () => {
    const calls: string[] = [];
    reply = (p) => { calls.push(p); return Response.json(detail); };
    let bad!: CollectionModel;
    stop = $effect.root(() => { bad = new CollectionModel(() => 'nope', vi.fn()); });
    await settle();
    expect(bad.error).toBe('Nothing here, or you cannot see it.');
    expect(calls).toEqual([]);
    stop!();
    let m!: CollectionModel;
    stop = $effect.root(() => { m = new CollectionModel(() => detail.id, vi.fn()); });
    await settle();
    expect(m.meta).toMatch(/^1 item · created /);
    expect(m.ask?.action).toBe('Delete collection');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm -C apps/web exec vitest run src/lib/screens/collections.svelte.test.ts`
Expected: FAIL (module missing).

- [ ] **Step 3: Implement** `apps/web/src/lib/screens/collections.svelte.ts` (today's two pages' logic, moved)

```ts
import { tick, untrack } from 'svelte';
import type { Attachment } from 'svelte/attachments';
import { COLLECTION_ID, type CollectionDetail, type CollectionSummary } from '@superlibrary/contract';
import { askDeleteCollection, createCollection, deleteCollection, getCollection, listCollections, removeFromCollection, updateCollection } from '$lib/collections';
import { when } from '$lib/item';
import { api as sessionApi } from '$lib/session.svelte';

type Api = (path: string, init?: RequestInit) => Promise<Response>;
export const countWords = (n: number) => `${n} item${n === 1 ? '' : 's'}`;

/** /collections (spec §5.3). */
export class CollectionsModel {
  list = $state<CollectionSummary[]>([]);
  loading = $state(true);
  error = $state<string | null>(null);
  name = $state('');
  description = $state('');
  creating = $state(false);
  createError = $state<string | null>(null);
  readonly #go: (href: string) => unknown;
  readonly #api: Api;

  constructor(go: (href: string) => unknown, api: Api = sessionApi) {
    this.#go = go;
    this.#api = api;
    $effect(() => { untrack(() => void this.load()); });
  }
  async load() {
    this.loading = true;
    const r = await listCollections(this.#api);
    this.loading = false;
    if (r.ok) { this.list = r.value.collections; this.error = null; } else this.error = r.message;
  }
  async create(e?: SubmitEvent) {
    e?.preventDefault();
    if (!this.name.trim()) { this.createError = 'Give the collection a name.'; return; }
    this.creating = true;
    this.createError = null;
    const r = await createCollection(this.#api, this.name.trim(), this.description.trim());
    this.creating = false;
    if (!r.ok) { this.createError = r.message; return; }
    await this.#go(`/collections/${r.value.id}`);
  }
}

/** /collections/[id] (spec §5.4). */
export class CollectionModel {
  c = $state<CollectionDetail | null>(null);
  error = $state<string | null>(null);
  notice = $state<string | null>(null);
  editing = $state(false);
  name = $state('');
  description = $state('');
  editError = $state<string | null>(null);
  /** The Delete button that opened the dialog (focus goes back to it), or null when closed. */
  deleting = $state.raw<HTMLElement | null>(null);
  busy = $state(false);
  dialogError = $state<string | null>(null);
  readonly #id: () => string;
  readonly #go: (href: string) => unknown;
  readonly #api: Api;
  #renameEl: HTMLElement | null = null;

  readonly id = $derived(this.#id());
  readonly meta = $derived(this.c ? `${countWords(this.c.itemCount)} · created ${when(this.c.createdAt)}` : '');
  readonly ask = $derived(this.c ? askDeleteCollection(this.c.name) : null);
  /** On "Rename or describe", so focus returns there after editing. */
  readonly renameAnchor: Attachment<HTMLElement> = (el) => { this.#renameEl = el; return () => { if (this.#renameEl === el) this.#renameEl = null; }; };

  constructor(id: () => string, go: (href: string) => unknown, api: Api = sessionApi) {
    this.#id = id;
    this.#go = go;
    this.#api = api;
    $effect(() => { void this.id; untrack(() => void this.load()); });
  }
  async load() {
    if (!COLLECTION_ID.test(this.id)) { this.error = 'Nothing here, or you cannot see it.'; return; }
    const r = await getCollection(this.#api, this.id);
    if (r.ok) { this.c = r.value; this.error = null; } else this.error = r.message;
  }
  startEdit() { this.name = this.c!.name; this.description = this.c!.description; this.editError = null; this.editing = true; }
  async stopEditing() { this.editing = false; await tick(); this.#renameEl?.focus(); }
  async save(e: SubmitEvent) {
    e.preventDefault();
    if (!this.name.trim()) { this.editError = 'Give the collection a name.'; return; }
    const err = await updateCollection(this.#api, this.id, { name: this.name.trim(), description: this.description.trim() });
    if (err) { this.editError = err; return; }
    this.notice = 'Saved.';
    await this.load();
    await this.stopEditing();
  }
  async remove(itemId: string, title: string) {
    const err = await removeFromCollection(this.#api, this.id, itemId);
    this.notice = err ?? `Removed “${title}” from the collection.`;
    await this.load();
  }
  askDelete(e: MouseEvent) { this.dialogError = null; this.deleting = e.currentTarget as HTMLElement; }
  async confirmDelete() {
    this.busy = true;
    this.dialogError = null;
    const err = await deleteCollection(this.#api, this.id);
    this.busy = false;
    if (err) { this.dialogError = err; return; }
    this.deleting = null;
    await this.#go('/collections');
  }
  cancelDelete() { if (!this.busy) this.deleting = null; }
  dismissNotice() { this.notice = null; }
}
```

- [ ] **Step 4: Sections and layouts** (today's markup, moved; every class and sentence kept)

`CollectionCreate.svelte`:

```svelte
<script lang="ts">
  import Button from '$kit/Button.svelte';
  import type { CollectionsModel } from '$lib/screens/collections.svelte';
  let { model }: { model: CollectionsModel } = $props();
</script>

<form class="inline-form" novalidate onsubmit={(e) => model.create(e)}>
  <label class="field">Name <input bind:value={model.name} maxlength="120" /></label>
  <label class="field">Description (optional) <input bind:value={model.description} maxlength="1000" /></label>
  <Button variant="primary" type="submit" disabled={model.creating}>{model.creating ? 'Creating…' : 'Create collection'}</Button>
</form>
{#if model.createError}<p class="error" role="alert">{model.createError}</p>{/if}
```

`CollectionList.svelte`:

```svelte
<script lang="ts">
  import { countWords, type CollectionsModel } from '$lib/screens/collections.svelte';
  let { model, variant = 'cards' }: { model: CollectionsModel; variant?: 'cards' } = $props();
</script>

{#if model.loading}
  <p class="muted" role="status">Loading…</p>
{:else if model.error}
  <p class="error" role="alert">{model.error}</p>
  <button type="button" onclick={() => model.load()}>Try again</button>
{:else if model.list.length === 0}
  <p>No collections yet. Create the first one above.</p>
{:else if variant === 'cards'}
  <ul class="items sl-collection-cards" aria-label="Collections">
    {#each model.list as c (c.id)}
      <li><a href={`/collections/${c.id}`}><span class="title">{c.name}</span><small>{countWords(c.itemCount)}{c.description ? ` · ${c.description}` : ''}</small></a></li>
    {/each}
  </ul>
{/if}
```

`CollectionActions.svelte`:

```svelte
<script lang="ts">
  import Button from '$kit/Button.svelte';
  import type { CollectionModel } from '$lib/screens/collections.svelte';
  let { model }: { model: CollectionModel } = $props();
</script>

{#if model.c?.canEdit}
  {#if model.editing}
    <form class="inline-form" novalidate onsubmit={(e) => model.save(e)}>
      <label class="field">Name <input bind:value={model.name} maxlength="120" /></label>
      <label class="field">Description <input bind:value={model.description} maxlength="1000" /></label>
      <Button variant="primary" type="submit">Save</Button>
      <button type="button" onclick={() => model.stopEditing()}>Cancel</button>
    </form>
    {#if model.editError}<p class="error" role="alert">{model.editError}</p>{/if}
  {:else}
    <div class="actions collection-actions">
      <button type="button" {@attach model.renameAnchor} onclick={() => model.startEdit()}>Rename or describe</button>
      <Button variant="danger" onclick={(e) => model.askDelete(e)}>Delete collection</Button>
    </div>
  {/if}
{/if}
```

`CollectionEntries.svelte`:

```svelte
<script lang="ts">
  import OutcomeBadge from '$kit/OutcomeBadge.svelte';
  import { outcomeVar } from '$kit/outcome';
  import { when } from '$lib/item';
  import type { CollectionModel } from '$lib/screens/collections.svelte';
  let { model, variant = 'cards' }: { model: CollectionModel; variant?: 'cards' } = $props();
</script>

{#if model.c}
  {#if model.c.entries.length === 0}
    <p>Nothing in it yet. Open an item and choose <strong>Add to collection</strong>.</p>
  {:else if variant === 'cards'}
    <ul class="results results--cards" aria-label="Items in this collection">
      {#each model.c.entries as e (e.item.id)}
        <li class="result entry" style:--o={outcomeVar(e.item.outcome)}>
          <a class="result-link" href={`/a/${e.item.id}`}>
            <span class="result-title">{e.item.title}</span>
            <span class="result-meta"><OutcomeBadge outcome={e.item.outcome} /><small>added {when(e.addedAt)}</small></span>
            {#if e.note}<span class="snippet">{e.note}</span>{/if}
          </a>
          <button type="button" onclick={() => model.remove(e.item.id, e.item.title)}><span>Remove<span class="visually-hidden"> “{e.item.title}”</span> from collection</span></button>
        </li>
      {/each}
    </ul>
  {/if}
{/if}
```

`CollectionsDaylight.svelte`:

```svelte
<script lang="ts">
  import type { CollectionsModel } from '$lib/screens/collections.svelte';
  import CollectionCreate from '$lib/sections/CollectionCreate.svelte';
  import CollectionList from '$lib/sections/CollectionList.svelte';
  let { model }: { model: CollectionsModel } = $props();
</script>

<h1>Collections</h1>
<p class="muted">Named sets of items, put together by people. An artifact in a collection is kept however old it is.</p>
<div class="sl-day-card sl-create"><CollectionCreate {model} /></div>
<CollectionList {model} variant="cards" />
```

`CollectionDaylight.svelte`:

```svelte
<script lang="ts">
  import type { CollectionModel } from '$lib/screens/collections.svelte';
  import CollectionActions from '$lib/sections/CollectionActions.svelte';
  import CollectionEntries from '$lib/sections/CollectionEntries.svelte';
  let { model }: { model: CollectionModel } = $props();
  const c = $derived(model.c!);
</script>

<header class="sl-day-card sl-collection-head">
  <h1>{c.name}</h1>
  {#if c.description}<p class="body">{c.description}</p>{/if}
  <p class="muted">{model.meta}</p>
  <CollectionActions {model} />
</header>
<CollectionEntries {model} variant="cards" />
```

Append to `daylight.css`:

```css
.sl-create { padding-top: var(--vk-space-3); }
.sl-collection-cards { display: grid; gap: var(--vk-space-3); grid-template-columns: minmax(0, 1fr); }
@media (min-width: 768px) { .sl-collection-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (min-width: 1024px) { .sl-collection-cards { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
.sl-collection-cards li { border-bottom: 0; }
.sl-collection-cards a { height: 100%; box-sizing: border-box; padding: var(--vk-space-3) var(--vk-space-4); border-radius: var(--vk-radius-md); background: var(--vk-color-surface); box-shadow: inset 0 0 0 1px var(--vk-color-line), 0 var(--vk-lift) 0 var(--vk-color-ground); }
.sl-collection-head { padding-top: var(--vk-space-2); }
.sl-collection-head h1 { margin-bottom: var(--vk-space-1); }
```

- [ ] **Step 5: Routes and registry**

`routes/collections/+page.svelte`:

```svelte
<script lang="ts">
  import { goto } from '$app/navigation';
  import { LAYOUTS } from '$lib/layouts/registry';
  import { CollectionsModel } from '$lib/screens/collections.svelte';
  import VibeLayout from '$lib/vibe/VibeLayout.svelte';
  const model = new CollectionsModel((href) => goto(href));
</script>

<svelte:head><title>Collections · Superlibrary</title></svelte:head>
<VibeLayout layouts={LAYOUTS.collections} {model} />
```

`routes/collections/[id]/+page.svelte`:

```svelte
<script lang="ts">
  import { goto } from '$app/navigation';
  import { page } from '$app/state';
  import Button from '$kit/Button.svelte';
  import ConfirmDialog from '$kit/ConfirmDialog.svelte';
  import Toast from '$kit/Toast.svelte';
  import { LAYOUTS } from '$lib/layouts/registry';
  import { CollectionModel } from '$lib/screens/collections.svelte';
  import VibeLayout from '$lib/vibe/VibeLayout.svelte';
  const model = new CollectionModel(() => page.params.id ?? '', (href) => goto(href));
</script>

<svelte:head><title>{model.c ? model.c.name : 'Collection'} · Superlibrary</title></svelte:head>
{#if model.notice}<Toast message={model.notice} onclose={() => model.dismissNotice()} />{/if}
{#if model.error}
  <p class="error" role="alert">{model.error}</p>
  <p><Button href="/collections">All collections</Button></p>
{:else if !model.c}
  <p class="muted" role="status">Loading…</p>
{:else}
  <VibeLayout layouts={LAYOUTS.collection} {model} />
{/if}
{#if model.deleting && model.ask}
  <ConfirmDialog title={model.ask.title} message={model.ask.message} action={model.ask.action} busy={model.busy} error={model.dialogError} opener={model.deleting}
    onconfirm={() => model.confirmDelete()} oncancel={() => model.cancelDelete()} />
{/if}
```

Add `collections: { daylight: CollectionsDaylight } satisfies Of<CollectionsModel>,` and `collection: { daylight: CollectionDaylight } satisfies Of<CollectionModel>,` to `LAYOUTS`.

- [ ] **Step 6: Run the tests**

Run: `pnpm -C apps/web test && pnpm -C apps/web typecheck`
Expected: `collections.svelte.test.ts` 3 passed; `routes/collections/collection.svelte.test.ts` (text not markup, rename/delete only for editors, focus back to Rename) and `routes/collections` list test still pass.

- [ ] **Step 7: Commit**

```bash
git add -A apps/web/src
git commit -m "Collections: view models, shared sections and the Daylight layouts" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8"
```

---

### Task 12: The adaptive screens and each vibe's flavour of the shell

**Files:**
- Create: `apps/web/src/lib/vibe/vibes.css`
- Modify: `apps/web/src/routes/+layout.svelte` (import; `sl-needs` on the not-enabled notice), `apps/web/src/routes/login/+page.svelte` (on the sky), `apps/web/src/app.css` (sign-in panel)

**Interfaces:**
- Consumes: `--vk-*`, `--sl-*`, `look`, vibekit `Sky`.
- Produces: per-vibe CSS on `[data-vibe]` for the shell, headings, buttons and Outcomes tabs; Paper's page tint (`--sl-tint`).

- [ ] **Step 1: Write** `apps/web/src/lib/vibe/vibes.css`

```css
/* Each vibe's flavour on the shell and the adaptive screens (spec §4.1, §5.5). Structure lives in app.css and
   kit.css; layouts' own classes in lib/layouts/*.css. Only vibekit and product variables. */

/* Daylight: chips, pills, a little lift. */
[data-vibe="daylight"] .suite-shell-brand .mark { box-sizing: content-box; padding: 6px; border-radius: var(--vk-radius-sm); background: var(--vk-product-superlibrary-bg); }
[data-vibe="daylight"] .suite-shell-nav a { border-radius: var(--vk-radius-pill); }
[data-vibe="daylight"] .suite-shell-nav a[aria-current='page'] { background: var(--vk-color-surface); color: var(--vk-color-text); box-shadow: 0 var(--vk-lift) 0 var(--vk-color-ground); }
[data-vibe="daylight"] .kit-tabs a { border-radius: var(--vk-radius-pill); }

/* Paper: rules and serif headings; the page takes the tint of the hour. */
[data-vibe="paper"] .suite-shell { border-bottom: 1px solid var(--vk-color-text); }
[data-vibe="paper"] .suite-shell-nav a[aria-current='page'] { box-shadow: none; color: var(--vk-color-text); text-decoration: underline; text-underline-offset: 6px; }
[data-vibe="paper"] .kit-tabs a { border-radius: 0; border-width: 0 0 2px; }
[data-phase="dawn"] { --sl-tint: var(--vk-sky-dawn-top); }
[data-phase="morning"] { --sl-tint: var(--vk-sky-morning-top); }
[data-phase="noon"] { --sl-tint: var(--vk-sky-noon-top); }
[data-phase="golden"] { --sl-tint: var(--vk-sky-golden-top); }
[data-phase="dusk"] { --sl-tint: var(--vk-sky-dusk-top); }
[data-phase="night"] { --sl-tint: var(--vk-sky-night-top); }
[data-vibe="paper"][data-time="strong"] body { background: var(--sl-tint, var(--vk-color-bg)); }
[data-vibe="paper"][data-time="subtle"] body { background: color-mix(in oklch, var(--sl-tint, var(--vk-color-bg)) 50%, var(--vk-color-bg)); }

/* Studio: a dense instrument; mono labels (CSS only: the words are unchanged). */
[data-vibe="studio"] .suite-shell { padding: var(--vk-space-1) var(--vk-space-3); border-bottom: 0; border-radius: var(--vk-radius-sm); background: var(--vk-color-raised); }
[data-vibe="studio"] .suite-shell-nav a { font: 500 var(--vk-text-sm)/1 var(--vk-font-mono); letter-spacing: 0.06em; text-transform: uppercase; }
[data-vibe="studio"] .suite-shell-nav a[aria-current='page'] { box-shadow: inset 0 -2px 0 var(--vk-color-primary); }
[data-vibe="studio"] h2 { font: 600 var(--vk-text-sm)/1.3 var(--vk-font-mono); letter-spacing: 0.08em; text-transform: uppercase; }
[data-vibe="studio"] .kit-tabs a { border-radius: var(--vk-radius-sm); font-family: var(--vk-font-mono); }

/* Quiet: plain text, underlined links, no shadow, no motion. */
[data-vibe="quiet"] .suite-shell-nav a { text-decoration: underline; }
[data-vibe="quiet"] .suite-shell-nav a[aria-current='page'] { box-shadow: none; color: var(--vk-color-text); font-weight: 700; }
[data-vibe="quiet"] .kit-button:not(.kit-button--primary):not(.kit-button--danger), [data-vibe="quiet"] button:not([class]) { box-shadow: inset 0 0 0 2px var(--vk-color-text); }
[data-vibe="quiet"] .kit-tabs a { border-radius: var(--vk-radius-sm); }
```

Import it in `+layout.svelte` after `daylight.css`: `import '$lib/vibe/vibes.css';`. (Paper's tint uses vibekit's Paper sky tops, which are near the page colour and carry Paper's text colour, checked by vibekit's contrast test on every sky stop.)

- [ ] **Step 2: Signal where the person must act; sign-in on the sky**

In `+layout.svelte` the not-enabled `<main class="notice">` becomes `<main class="notice"><div class="panel sl-needs sl-notice-panel">…existing h1 and p…</div></main>`. `routes/login/+page.svelte`: import `{ Sky }` from vibekit and `{ look }` from `$lib/vibe/appearance.svelte`; wrap the existing `<main class="notice">…</main>` content as `<main class="notice"><Sky phase={look.phase}><div class="sl-signin">…the existing Mark, h1, p, button and error…</div></Sky></main>`. Add to `app.css`:

```css
.sl-signin { display: grid; justify-items: center; gap: var(--vk-space-2); padding: var(--vk-space-5) var(--vk-space-4); }
.sl-signin .mark-hero { box-sizing: content-box; padding: var(--vk-space-3); border-radius: var(--vk-radius-lg); background: var(--vk-product-superlibrary-bg); }
.sl-notice-panel { max-width: 560px; margin: 0 auto; padding: var(--vk-space-4); }
```

(`installable.spec.ts` asserts the mark inside `main`: it still is.)

- [ ] **Step 3: Run the tests**

Run: `pnpm -C apps/web test && pnpm -C apps/web typecheck`
Expected: all pass.

- [ ] **Step 4: Look at every screen in every vibe**

With the dev stack running, set each cookie (`document.cookie = 'vk_appearance=<vibe>.<light|dark>.strong.0; Path=/'`, reload) and open `/`, `/outcomes`, `/collections`, a collection, an artifact, a work record, `/upload`, `/login` at 390px and 1280px. Every screen renders in that vibe's type and colours; nothing scrolls sideways; focus rings show on Tab.

- [ ] **Step 5: Commit**

```bash
git add -A apps/web/src
git commit -m "Each vibe's flavour on the shell and adaptive screens; the signal only where a person must act" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8"
```

---
### Task 13: The parity test: the inventory, in every vibe

**Files:**
- Create: `apps/web/src/lib/screens/parity.fixture.ts`, `apps/web/src/lib/layouts/parity.svelte.test.ts`

**Interfaces:**
- Produces: `FIX` (API fixture: `me`, `respond(path, init)`, ids), `PARITY: Record<'library' | 'artifact' | 'record' | 'collections' | 'collection', readonly Need[]>` where `type Need = string | { css: string; what: string }`. Every later layout task runs this test; it covers a vibe's own layout as soon as the registry lists it.

- [ ] **Step 1: Write the fixture and the lists** at `apps/web/src/lib/screens/parity.fixture.ts`

The data has every optional field the inventory shows: an agent maker, a folder version with a secret-scan override, a revoked version, a delete date, a caption, a superseded row, a work record with spec, redactions, truncation, a failed attempt with no time, a comment, a gate, an archive, and a linked artifact; the person is an owner, so every manager control shows.

```ts
/** The inventory (spec §6) as data, and an API that answers with all of it. Used only by tests. */
export type Need = string | { css: string; what: string };

const AGENT = 'prn_00000000000000000a9a';
const BOARD = 'brd_00000000000000b1';
const ARTIFACT = {
  id: 'itm_00000000000000f1', kind: 'artifact', title: 'Parity report', scope: 'workspace', audience: 'workspace', outcome: 'completed',
  createdBy: AGENT, createdAt: '2026-10-01T09:00:00.000Z', latestVersion: 2, expiresAt: '2026-12-01T00:00:00.000Z', revokedAt: null,
  caption: 'A caption for search', supersededBy: null,
  source: { agent: true, agentPrincipal: AGENT, sourceKind: 'agentpod', station: 'stn_00000000000000s1', stationName: 'docs', path: 'out/report', board: BOARD, card: 'card_00000000000000c1', stage: 'review', run: 'run_00000000000000r1' },
};
const VERSIONS = [
  { version: 2, entry: 'index.md', view: 'markdown', mediaType: 'text/markdown', totalBytes: 2048, fileCount: 2, sha256: 'b'.repeat(64), createdAt: '2026-10-02T09:00:00.000Z', revokedAt: null, scanOverride: true, files: [] },
  { version: 1, entry: 'index.md', view: 'markdown', mediaType: 'text/markdown', totalBytes: 512, fileCount: 1, sha256: 'c'.repeat(64), createdAt: '2026-10-01T09:00:00.000Z', revokedAt: '2026-10-02T10:00:00.000Z', scanOverride: false, files: [] },
];
const RECORD_ITEM = {
  id: 'itm_00000000000000f2', kind: 'work-record', title: 'Parity card', scope: `board:${BOARD}`, audience: 'board', outcome: 'rejected',
  createdBy: 'source:superpipeline', createdAt: '2026-10-01T09:00:00.000Z', latestVersion: 0, expiresAt: null, revokedAt: null,
  supersededBy: ARTIFACT.id, caption: 'Replaced by the report',
  source: { sourceUrl: 'https://app.superpipeline.dev/b/x/c/y', board: BOARD, stage: 'review', card: 'card_00000000000000c2' },
};
const RECORD_VIEW = {
  item: RECORD_ITEM, boardName: 'Parity board', artifacts: [ARTIFACT],
  record: {
    schema: 'work-record/1', boardId: BOARD, cardId: 'card_00000000000000c2', title: 'Parity card', spec: { goal: 'Ship the parity check' }, state: 'rejected', stage: 'review',
    archivedAt: '2026-10-05T00:00:00.000Z', createdAt: '2026-10-01T09:00:00.000Z', updatedAt: '2026-10-05T00:00:00.000Z',
    handoffs: [
      { runId: 'run_1', stage: 'draft', agent: AGENT, startedAt: '2026-10-02T09:00:00.000Z', endedAt: null, attempt: 1, status: 'completed', handoff: { summary: 'Draft ready' }, failureReason: null },
      { runId: 'run_2', stage: 'review', agent: null, startedAt: null, endedAt: null, attempt: 2, status: 'failed', handoff: null, failureReason: 'tests failed' },
    ],
    comments: [{ id: 'c1', author: { kind: 'human', name: 'A reviewer' }, body: 'Needs work', createdAt: '2026-10-03T09:00:00.000Z' }],
    gates: [{ id: 'g1', stage: 'review', decision: 'approve', resolvedAt: '2026-10-04T09:00:00.000Z' }],
    references: [], supersededByCard: null, outcome: 'rejected', redactions: [{ field: 'comments[0].body', rule: 'github-token' }], truncated: true,
  },
};
const COLLECTION = { id: 'col_0123456789abcdef', name: 'Parity set', description: 'Things to keep', createdBy: AGENT, createdAt: '2026-10-01T09:00:00.000Z', updatedAt: '2026-10-01T09:00:00.000Z', itemCount: 2, canEdit: true };
const DETAIL = { ...COLLECTION, entries: [
  { item: ARTIFACT, addedBy: AGENT, addedAt: '2026-10-03T09:00:00.000Z', note: 'Keep this one' },
  { item: RECORD_ITEM, addedBy: AGENT, addedAt: '2026-10-03T10:00:00.000Z', note: null },
] };
const RELATED = { itemId: 'itm_00000000000000f3', kind: 'artifact', title: 'Related note', outcome: 'approved', scope: 'workspace', provenance: {}, snippet: 'A related snippet', url: '', score: 1, supersededBy: null, wrapped: '', tokens: 1 };

export const FIX = {
  me: { principalId: 'prn_000000000000000000a2', org: 'org_1', workspaceId: 'wks_1', role: 'owner' as const },
  artifactId: ARTIFACT.id, recordId: RECORD_ITEM.id, collectionId: COLLECTION.id,
  respond(path: string, init?: RequestInit): Response {
    const method = init?.method ?? 'GET';
    if (path === '/api/v1/facets') return Response.json({ boards: [{ id: BOARD, name: 'Parity board' }], agents: [AGENT], stations: [{ id: 'stn_00000000000000s1', name: 'docs' }] });
    if (path === '/api/v1/browse') return Response.json({ items: [ARTIFACT, RECORD_ITEM], next: 'cursor1', counts: { approved: 0, completed: 1, 'in-progress': 0, superseded: 0, rejected: 1, failed: 0, abandoned: 0 } });
    if (path === '/api/v1/search') return Response.json({ results: [] });
    if (path === '/api/v1/related') return Response.json({ items: [RELATED] });
    if (path === '/api/v1/collections' && method === 'GET') return Response.json({ collections: [COLLECTION] });
    if (path === `/api/v1/collections/${COLLECTION.id}`) return Response.json(DETAIL);
    if (path === `/api/v1/items/${ARTIFACT.id}`) return Response.json({ item: ARTIFACT, versions: VERSIONS });
    if (path === `/api/v1/items/${RECORD_ITEM.id}`) return Response.json({ item: RECORD_ITEM, versions: [] });
    if (path === `/api/v1/items/${RECORD_ITEM.id}/record`) return Response.json(RECORD_VIEW);
    return Response.json({ error: 'not_found' }, { status: 404 });
  },
};

const OUTCOME_WORDS = ['Approved', 'Completed', 'In progress', 'Superseded', 'Rejected', 'Failed', 'Abandoned'];
const ITEM_COMMON: Need[] = [
  'Provenance', 'Created by', 'Created', 'Visible to', 'Outcome', 'Board', 'Stage', 'Card',
  'Related', 'Related note', 'A related snippet', { css: '[aria-label="Related items"]', what: 'the related list' },
  'Collections', 'Add to collection', { css: 'select', what: 'the collection picker' },
  'Remove from memory', 'Delete on', 'Set the delete date', 'Revoke', 'Nobody will be able to view it again. The record of it stays.', 'Revoke this item',
];

export const PARITY: Record<'library' | 'artifact' | 'record' | 'collections' | 'collection', readonly Need[]> = {
  library: [
    'Library', 'Upload', 'Search the library', 'Search', 'Filters',
    'Kind', 'Everything', 'Artifacts', 'Work records', 'Board', 'Every board', 'Parity board', 'Agent', 'Anyone', AGENT, 'Station', 'Any station', 'docs',
    'Active', 'Any time', 'This week', 'This month', 'Last 30 days', 'Between dates…', 'Outcome', ...OUTCOME_WORDS,
    '2+ items, most recent activity first',
    // R3 is checked by its parts: Studio shows kind, board, station and path in their own columns.
    'Parity report', 'Artifact', 'out/report', 'Everyone in the workspace', 'A caption for search',
    'Parity card', 'Work record', 'This board', 'Replaced by the report', 'See what replaced it', 'More',
    { css: '[aria-label="Library"]', what: 'the list named Library' },
    { css: `a[href="/a/${ARTIFACT.id}"]`, what: 'a row links to its item' },
    { css: `a[href="/a/${ARTIFACT.id}"].replaced, a.replaced[href="/a/${ARTIFACT.id}"]`, what: 'the replaced-by link' },
    { css: 'input[type="search"]#q', what: 'the search box' },
  ],
  artifact: [
    'Parity report', 'Completed', 'v2 (latest)', 'Everyone in the workspace', 'deleted on', 'Upload a new version',
    { css: '.viewer', what: 'the viewer' }, { css: 'h1', what: 'a heading' },
    'Versions', 'v1', 'Shown', 'Latest', 'Revoked', 'Secret scan overridden', 'Revoke version 2',
    'Details · version 2', 'Item', 'Artifact', 'Kind', 'Folder, opens on a Markdown', 'Media type', 'text/markdown', 'Size', 'bytes)', 'Files', 'Opens on', 'index.md',
    'SHA-256', "of the folder's file list", 'Copy', 'Uploaded', 'Secret scan', 'Overridden by the uploader, recorded',
    `An agent (${AGENT})`, 'Station', 'stn_00000000000000s1', 'Source path', 'out/report', BOARD, 'review', 'card_00000000000000c1', 'Run', 'run_00000000000000r1', 'completed',
    'Moderate', 'Caption', 'Shown with the item and used by search. Most useful for images.', 'Save caption', 'Replaced by', 'Mark as superseded', 'To be deleted on',
    ...ITEM_COMMON,
  ],
  record: [
    'Parity card', 'Rejected', 'This board', 'Parity board', 'Now at review', 'Open the card in Superpipeline',
    'Some text was hidden because it looked like a secret.', 'This record is long: its oldest comments and handoffs were shortened.',
    'Spec', 'goal', 'Ship the parity check', 'Timeline', 'Card created', 'draft · attempt 1 · completed', 'Draft ready', 'review · attempt 2 · failed', 'Failed: tests failed',
    'Time not recorded', 'Comment', 'A reviewer', 'Needs work', 'Gate at review: approved', 'Archived', 'Artifacts', 'Parity report', 'v2',
    'Show to everyone in the workspace', 'Delete on a date', 'Superseded by', 'the item that replaced it', 'Undo superseded',
    { css: 'ol.timeline', what: 'the timeline list' }, { css: 'a[target="_blank"][rel="noopener noreferrer"]', what: 'the card link opens safely' },
    ...ITEM_COMMON,
  ],
  collections: [
    'Collections', 'Named sets of items, put together by people. An artifact in a collection is kept however old it is.',
    'Name', 'Description (optional)', 'Create collection', 'Parity set', '2 items', 'Things to keep',
    { css: '[aria-label="Collections"]', what: 'the list named Collections' }, { css: `a[href="/collections/${COLLECTION.id}"]`, what: 'a collection links to itself' },
  ],
  collection: [
    'Parity set', 'Things to keep', '2 items · created', 'Rename or describe', 'Delete collection',
    'Parity report', 'Completed', 'added', 'Keep this one', 'Parity card', 'Rejected', 'Remove “Parity report” from collection',
    { css: '[aria-label="Items in this collection"]', what: 'the list named Items in this collection' }, { css: `a[href="/a/${ARTIFACT.id}"]`, what: 'an entry links to its item' },
  ],
};
```

- [ ] **Step 2: Write the test** at `apps/web/src/lib/layouts/parity.svelte.test.ts`

```ts
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { VIBES } from '@superjackfruit/vibekit';

vi.mock('$lib/session.svelte', async () => {
  const { FIX } = await import('$lib/screens/parity.fixture');
  return { session: { me: FIX.me, notEnabled: null }, api: async (path: string, init?: RequestInit) => FIX.respond(path, init) };
});
vi.mock('$app/navigation', () => ({ goto: vi.fn(), replaceState: vi.fn() }));
vi.mock('$app/state', () => ({ page: { url: new URL('http://localhost/'), params: { id: 'col_0123456789abcdef' } } }));
vi.mock('@superlibrary/embed', async (orig) => ({ ...(await orig<object>()), mountArtifact: async () => ({ destroy() {}, setTheme() {}, setVersion: async () => true }) }));

import { FIX, PARITY, type Need } from '$lib/screens/parity.fixture';
import { look } from '$lib/vibe/appearance.svelte';
import ItemView from '$lib/ItemView.svelte';
import LibraryPage from '../../routes/+page.svelte';
import CollectionsPage from '../../routes/collections/+page.svelte';
import CollectionPage from '../../routes/collections/[id]/+page.svelte';

const settle = async () => { for (let i = 0; i < 10; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); } };
/** Open every disclosure: what a person can open, the test opens. */
function openAll() {
  for (const d of document.querySelectorAll('details')) d.open = true;
  for (const b of document.querySelectorAll<HTMLButtonElement>('button.sl-enclosure-toggle[aria-expanded="false"]')) b.click();
  flushSync();
}
/** The page's text, leaving out anything inside [hidden] (a closed disclosure does not count as shown). */
function visibleText(): string {
  const out: string[] = [];
  const walk = (n: Node) => {
    if (n instanceof HTMLElement && n.hidden) return;
    if (n.nodeType === Node.TEXT_NODE) out.push(n.textContent ?? '');
    n.childNodes.forEach(walk);
  };
  walk(document.body);
  return out.join('').replace(/\s+/g, ' ');
}
function missing(needs: readonly Need[]): string[] {
  const text = visibleText();
  return needs.flatMap((n) => {
    if (typeof n === 'string') return text.includes(n) ? [] : [`text: ${n}`];
    const el = document.querySelector<HTMLElement>(n.css);
    return el && !el.closest('[hidden]') ? [] : [`element: ${n.what} (${n.css})`];
  });
}

const SCREENS = [
  ['the library home', () => mount(LibraryPage, { target: document.body }), PARITY.library],
  ['an artifact', () => mount(ItemView, { target: document.body, props: { itemId: FIX.artifactId } }), PARITY.artifact],
  ['a work record', () => mount(ItemView, { target: document.body, props: { itemId: FIX.recordId } }), PARITY.record],
  ['collections', () => mount(CollectionsPage, { target: document.body }), PARITY.collections],
  ['one collection', () => mount(CollectionPage, { target: document.body }), PARITY.collection],
] as const;

beforeEach(() => {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
});

describe.each([...VIBES])('%s keeps everything visible today (spec §6)', (vibe) => {
  let c: ReturnType<typeof mount> | null = null;
  beforeEach(() => { look.appearance = { ...look.appearance, vibe }; });
  afterEach(() => { if (c) unmount(c); c = null; document.body.innerHTML = ''; });

  it.each(SCREENS)('%s', async (_name, open, needs) => {
    c = open();
    await settle();
    openAll();
    await settle();
    expect(missing(needs)).toEqual([]);
  });
});
```

- [ ] **Step 3: Run it**

Run: `pnpm -C apps/web exec vitest run src/lib/layouts/parity.svelte.test.ts`
Expected: PASS, 20 tests (4 vibes × 5 screens; in phase 1 every vibe draws the Daylight layouts). If a need is missing, the failure names it: fix the layout or section, never the list. (A need that is genuinely not on today's screen for this data means the fixture is wrong: check the inventory before changing it, and say why in the commit.)

- [ ] **Step 4: Prove the guard can fail**

Temporarily delete `<ProvenanceSection {model} />` from `ItemDaylight.svelte`, run the test, see `text: Station` etc. listed for every vibe, then restore it. (Do not commit the deletion.)

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/screens/parity.fixture.ts apps/web/src/lib/layouts/parity.svelte.test.ts
git commit -m "Parity: every inventory item, checked on every key screen in every vibe" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8"
```

---

### Task 14: End to end: first paint, the picker, axe and parity per vibe

**Files:**
- Create: `apps/web/e2e/vibes.ts`, `apps/web/e2e/appearance.spec.ts`, `apps/web/e2e/vibes.spec.ts`, `apps/web/e2e/parity.spec.ts`
- Modify: `apps/web/package.json` (devDependency `@axe-core/playwright` `4.13.0`), `apps/web/e2e/responsive.spec.ts` (title budget per vibe), `.github/workflows/ci.yml` (upload the screens), `.gitignore` (`apps/web/vibe-screens/`), `pnpm-lock.yaml`

**Interfaces:**
- Consumes: `e2e/helpers.ts` (`APP`, `DEV`, `devWorkspace`, `expectNoSideways`, `seedWorkRecordLocal`, `shortControls`, `uploadViaApi`).
- Produces: `useAppearance(context, vibe, theme, strength?)`, `VIBES_E2E`, `openEnclosures(page)`, `seedCollection(request, name, itemId)`.

- [ ] **Step 1: Add axe**

```bash
pnpm --filter @superlibrary/web add -D @axe-core/playwright@4.13.0
printf '\n# Screens from e2e/vibes.spec.ts, uploaded by CI\napps/web/vibe-screens/\n' >> .gitignore
```

- [ ] **Step 2: Write** `apps/web/e2e/vibes.ts`

```ts
import type { APIRequestContext, BrowserContext, Page } from '@playwright/test';
import { APP, DEV } from './helpers';

export const VIBES_E2E = ['daylight', 'paper', 'studio', 'quiet'] as const;
export type VibeName = (typeof VIBES_E2E)[number];
const API = 'http://localhost:8787';

/** The person's appearance, as the vk_appearance cookie the head script reads. */
export async function useAppearance(context: BrowserContext, vibe: VibeName, theme: 'sun' | 'light' | 'dark', strength: 'strong' | 'subtle' | 'off' = 'strong') {
  await context.addCookies([{ name: 'vk_appearance', value: `${vibe}.${theme}.${strength}.0`, url: APP }]);
}

/** Open every Paper enclosure and every <details>: what a person can open, the test opens. */
export async function openEnclosures(page: Page) {
  for (const b of await page.locator('button.sl-enclosure-toggle[aria-expanded="false"]').all()) await b.click();
  await page.evaluate(() => { for (const d of document.querySelectorAll('details')) d.open = true; });
}

export async function seedCollection(request: APIRequestContext, name: string, itemId: string): Promise<string> {
  const made = await request.post(`${API}/api/v1/collections`, { headers: DEV, data: { name, description: 'For the vibe checks' } });
  if (!made.ok()) throw new Error(`collection: ${made.status()} ${await made.text()}`);
  const { id } = (await made.json()) as { id: string };
  const added = await request.post(`${API}/api/v1/collections/${id}/items`, { headers: DEV, data: { itemId } });
  if (!added.ok()) throw new Error(`add: ${added.status()} ${await added.text()}`);
  return id;
}
```

- [ ] **Step 3: Write** `apps/web/e2e/appearance.spec.ts`

```ts
import { expect, test } from '@playwright/test';
import { useAppearance } from './vibes';

test.describe('the person’s appearance', () => {
  test('the head script alone paints the vibe: the first frame is already right', async ({ page, context }) => {
    await useAppearance(context, 'paper', 'dark');
    // No app JavaScript at all: only the inline head script can set these.
    await page.route('**/*', (r) => (r.request().resourceType() === 'script' ? r.abort() : r.continue()));
    await page.goto('/');
    const html = page.locator('html');
    await expect(html).toHaveAttribute('data-vibe', 'paper');
    await expect(html).toHaveAttribute('data-theme', 'dark');
    await expect(html).toHaveAttribute('data-time', 'strong');
    await expect(html).toHaveAttribute('data-phase', /^(dawn|morning|noon|golden|dusk|night)$/);
  });

  test('with the app running, the page is in that vibe on the first animation frame', async ({ page, context }) => {
    await useAppearance(context, 'studio', 'light');
    await page.addInitScript(() => {
      requestAnimationFrame(() => { (window as unknown as { __first: string | undefined }).__first = document.documentElement.dataset.vibe; });
    });
    await page.goto('/');
    await expect(page.locator('h1').first()).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __first: string | undefined }).__first)).toBe('studio');
  });

  test('the picker changes vibe and theme at once, saves them, and keyboard works', async ({ page, context }) => {
    await page.clock.setFixedTime(new Date('2026-10-11T12:00:00'));
    await page.goto('/');
    await page.getByRole('button', { name: 'Account' }).click();
    await page.getByRole('button', { name: 'Appearance' }).click();
    const dialog = page.getByRole('dialog', { name: 'Appearance' });
    await expect(dialog.getByRole('radio', { name: /Daylight/ })).toBeFocused();
    await page.keyboard.press('ArrowDown');   // native radios: arrows move and choose
    await expect(page.locator('html')).toHaveAttribute('data-vibe', 'paper');
    await dialog.getByRole('radio', { name: /Studio/ }).check();
    await expect(page.locator('html')).toHaveAttribute('data-vibe', 'studio');
    await dialog.getByRole('radio', { name: 'Dark', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect((await context.cookies()).find((c) => c.name === 'vk_appearance')?.value).toBe('studio.dark.strong.0');
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Account' })).toBeFocused();
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-vibe', 'studio');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  });

  test('Quiet starts with the time of day off', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Account' }).click();
    await page.getByRole('button', { name: 'Appearance' }).click();
    await page.getByRole('dialog', { name: 'Appearance' }).getByRole('radio', { name: /Quiet/ }).check();
    await expect(page.locator('html')).toHaveAttribute('data-time', 'off');
  });

  test('reduced motion skips the view transition; otherwise a change uses one', async ({ page }) => {
    await page.addInitScript(() => {
      const w = window as unknown as { __vt: number };
      w.__vt = 0;
      const start = document.startViewTransition?.bind(document);
      if (start) document.startViewTransition = ((cb: () => void) => { w.__vt++; return start(cb); }) as typeof document.startViewTransition;
    });
    const pick = async (name: RegExp) => {
      await page.getByRole('button', { name: 'Account' }).click();
      await page.getByRole('button', { name: 'Appearance' }).click();
      await page.getByRole('dialog', { name: 'Appearance' }).getByRole('radio', { name }).check();
      await page.getByRole('button', { name: 'Done' }).click();
    };
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await pick(/Paper/);
    expect(await page.evaluate(() => (window as unknown as { __vt: number }).__vt)).toBe(0);
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await pick(/Quiet/);
    const hasVT = await page.evaluate(() => 'startViewTransition' in document);
    expect(await page.evaluate(() => (window as unknown as { __vt: number }).__vt)).toBe(hasVT ? 1 : 0);
  });

  test('an old Light or Dark choice carries over', async ({ page, context }) => {
    await context.addInitScript(() => { if (!document.cookie.includes('vk_appearance')) localStorage.setItem('superlibrary:theme', 'dark'); });
    await page.goto('/');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect((await context.cookies()).find((c) => c.name === 'vk_appearance')?.value).toBe('daylight.dark.strong.0');
  });
});
```

- [ ] **Step 4: Write** `apps/web/e2e/vibes.spec.ts`

```ts
import AxeBuilder from '@axe-core/playwright';
import { mkdirSync } from 'node:fs';
import { expect, test } from '@playwright/test';
import { devWorkspace, expectNoSideways, seedWorkRecordLocal, shortControls, uploadViaApi } from './helpers';
import { VIBES_E2E, seedCollection, useAppearance } from './vibes';

/** Every key screen in every vibe and theme: accessible, no sideways scroll, 44px targets, a screenshot to look at. */
const THEMES = ['light', 'dark'] as const;
const SCREENS = 'vibe-screens';
let paths: Array<[string, string]> = [];

test.describe.configure({ mode: 'serial' });
test.beforeAll(async ({ request }) => {
  const ws = await devWorkspace(request);
  const art = await uploadViaApi(request, [{ path: 'v.md', body: '# Vibe check\n\nA paragraph.' }], { title: 'Vibe check artifact' });
  const rec = seedWorkRecordLocal({ ws, title: 'Vibe check record', text: 'vibe check', outcome: 'approved' });
  const col = await seedCollection(request, `Vibe check ${Date.now()}`, art.itemId);
  paths = [['home', '/'], ['artifact', `/a/${art.itemId}`], ['record', `/a/${rec}`], ['collections', '/collections'], ['collection', `/collections/${col}`]];
  mkdirSync(SCREENS, { recursive: true });
});

for (const vibe of VIBES_E2E) {
  for (const theme of THEMES) {
    test(`${vibe} ${theme}`, async ({ page, context }, info) => {
      test.skip(info.project.name !== 'chromium', 'one engine is enough for the matrix; WebKit runs the phone specs');
      await useAppearance(context, vibe, theme);
      await page.clock.setFixedTime(new Date('2026-10-11T12:00:00'));
      for (const [name, path] of paths) {
        for (const width of [390, 1280]) {
          await page.setViewportSize({ width, height: 900 });
          await page.goto(path);
          await expect(page.locator('h1').first()).toBeVisible();
          await expect(page.locator('html')).toHaveAttribute('data-vibe', vibe);
          await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
          await page.waitForLoadState('networkidle');
          const where = `${vibe}/${theme} ${name} ${width}px`;
          await expectNoSideways(page, where);
          if (width === 390) expect(await shortControls(page, 3), where).toEqual([]);
          if (name === 'artifact') {
            const title = (await page.locator('h1').first().boundingBox())!;
            const viewer = (await page.locator('.viewer').boundingBox())!;
            expect(viewer.y - title.y, `${where}: the content starts right under the title`).toBeLessThan(width < 768 ? 170 : 130);
          }
          const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa']).exclude('iframe.sl-frame').analyze();
          expect(axe.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`), where).toEqual([]);
          await page.screenshot({ path: `${SCREENS}/${vibe}-${theme}-${name}-${width}.png`, fullPage: true });
          if (process.env.PW_VISUAL) {
            await expect(page).toHaveScreenshot(`${vibe}-${theme}-${name}-${width}.png`, { fullPage: true, mask: [page.locator('iframe.sl-frame'), page.locator('.sl-readout, .sl-dateline, .sl-greeting')] });
          }
        }
      }
    });
  }
}
```

- [ ] **Step 5: Write** `apps/web/e2e/parity.spec.ts`

```ts
import { expect, test } from '@playwright/test';
import { uploadViaApi } from './helpers';
import { VIBES_E2E, openEnclosures, seedCollection, useAppearance } from './vibes';

/** The real stack, per vibe: the key screens keep their words and their controls work (spec §6, §8.2). */
for (const vibe of VIBES_E2E) {
  test(`${vibe}: the key screens keep their words and controls`, async ({ page, context, request }, info) => {
    test.skip(info.project.name !== 'chromium');
    await useAppearance(context, vibe, 'light');
    const art = await uploadViaApi(request, [{ path: 'p.md', body: '# Parity' }], { title: `Parity ${vibe} ${Date.now()}` });
    const col = await seedCollection(request, `Parity ${vibe} ${Date.now()}`, art.itemId);

    await page.goto('/');
    await expect(page.getByLabel('Search the library')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Search', exact: true })).toBeVisible();
    await expect(page.locator('summary', { hasText: 'Filters' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Upload' }).first()).toBeVisible();
    await expect(page.locator('[aria-label="Library"]').getByRole('link', { name: new RegExp(`Parity ${vibe}`) }).first()).toBeVisible();

    await page.goto(`/a/${art.itemId}`);
    await openEnclosures(page);
    await expect(page.locator('.viewer')).toBeVisible();
    for (const h of ['Versions', 'Details · version 1', 'Provenance', 'Related', 'Collections', 'Moderate', 'Revoke']) {
      await expect(page.getByRole('heading', { name: new RegExp(`^${h}`) }).first(), h).toBeVisible();
    }
    await expect(page.getByRole('link', { name: 'Upload a new version' })).toBeVisible();
    for (const b of ['Save caption', 'Mark as superseded', 'Remove from memory', 'Set the delete date', 'Revoke this item', 'Add to collection']) {
      await expect(page.getByRole('button', { name: b, exact: true }), b).toBeVisible();
    }
    const revoke = page.getByRole('button', { name: 'Revoke this item' });
    await revoke.click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(revoke).toBeFocused();

    await page.goto(`/collections/${col}`);
    await expect(page.getByRole('button', { name: 'Rename or describe' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Remove .*from collection/ })).toBeVisible();
    await page.getByRole('button', { name: 'Delete collection' }).click();
    await expect(page.getByRole('alertdialog')).toBeVisible();
    await page.keyboard.press('Escape');
  });
}
```

- [ ] **Step 6: The title budget in every vibe, and CI uploads the screens**

In `apps/web/e2e/responsive.spec.ts` nothing changes in phase 1 (it runs with no cookie, Daylight); `vibes.spec.ts` now holds the per-vibe title budget. In `.github/workflows/ci.yml`, in the `e2e` job, after the existing `if: failure()` upload step, add:

```yaml
      # Every vibe × theme × key screen, for a person to look at (spec D10). Pixel comparison is PW_VISUAL=1, later.
      - if: always()
        uses: actions/upload-artifact@v4
        with:
          name: vibe-screens
          path: apps/web/vibe-screens/
          if-no-files-found: ignore
          retention-days: 14
```

- [ ] **Step 7: Run the whole e2e suite**

Run: `pnpm --filter @superlibrary/web exec playwright install chromium webkit && pnpm --filter @superlibrary/web e2e`
Expected: every existing spec passes unchanged; `appearance.spec.ts` 6 passed; `vibes.spec.ts` 8 passed (chromium; skipped on webkit); `parity.spec.ts` 4 passed. If axe reports a colour-contrast violation, the fix is a token-backed style (a product rule using a checked pair), never an exclusion. If `waitForLoadState('networkidle')` hangs because the app polls, replace it with `await expect(page.locator('[role="status"]').first()).not.toHaveText('Loading…')`.

- [ ] **Step 8: Commit**

```bash
git add -A apps/web/e2e apps/web/package.json .github/workflows/ci.yml .gitignore pnpm-lock.yaml
git commit -m "e2e: first paint from the head script, the picker, and axe, layout and parity checks in every vibe and theme" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8"
```

---

### Task 15: Ship phase 1

**Files:** none new.

- [ ] **Step 1: Everything CI runs, locally**

```bash
pnpm install --frozen-lockfile
pnpm typecheck && pnpm test && pnpm --filter @superlibrary/web e2e
pnpm --filter @superlibrary/web build
du -sh apps/web/build/_app/immutable/chunks && find apps/web/build -name '*.js' -exec gzip -c {} \; | wc -c
```
Expected: all green. Compare the gzipped JS total with the same command on `origin/main` (checkout in a temp worktree): the increase is at most 60 KB (spec §8.1). Record both numbers in the PR description.

- [ ] **Step 2: Push the branch and open the PR**

```bash
git push -u origin design/vibes
gh pr create --title "Superlibrary on vibekit: phase 1 (vibekit, appearance, Daylight layouts)" --body "$(cat <<'EOF'
Phase 1 of docs/superpowers/plans/2026-10-11-vibes-redesign.md (spec: docs/superpowers/specs/2026-10-11-vibes-redesign-design.md).

- vibekit 0.0.1 vendored (apps/web/vendor, checksum recorded); IBM Plex, design/tokens.toml and its generator, the Ink parent and the hexagon mark retired
- the vk_appearance cookie and the inline head script paint the person's vibe on the first frame; Account › Appearance picks vibe, light or dark, time of day and location
- one view model per key screen; Daylight layouts of every screen; Paper, Studio and Quiet are selectable and use the Daylight layouts in their own tokens until phases 2–4
- parity test: every inventory item on every key screen in every vibe; e2e: first paint, the picker, axe + no sideways scroll + 44px per vibe × theme, screenshots uploaded as the `vibe-screens` artifact
- JS gzipped: <before> → <after>

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8
EOF
)"
gh pr checks --watch
```
Expected: `test` and `e2e` green. Branch protection is not enforced, so do not merge a red PR. Download the `vibe-screens` artifact and look at all 80 screenshots before asking for the merge.

- [ ] **Step 3: Merge and watch the deploy**

After the operator merges (or says to merge): `gh run watch` on the `push` run for `main`; `deploy-api`, `deploy-content` and `deploy-web` must succeed (`deploy-web` runs `wrangler pages deploy … --project-name=superlibrary-web --branch=main`).

- [ ] **Step 4: Live check** (spec §9.1)

```bash
curl -s https://app.superlibrary.dev/ | grep -c 'vk_appearance'        # 1
curl -s https://app.superlibrary.dev/ | grep -c 'fonts.googleapis'     # 0
```
Then in a browser (and on the iPhone): the home shows the Daylight sky and greeting; Account › Appearance › Paper and Dark repaint at once; a reload keeps them; DevTools › Application › Cookies shows `vk_appearance` on `app.superlibrary.dev` (no Domain attribute, Secure); an artifact opens in the viewer and its toolbar follows the theme; nothing scrolls sideways at phone width.

---
# Phase 2: Paper (a letter with enclosures)

Phases 2, 3 and 4 are independent: after phase 1 merges, each can be built on its own branch
(`design/vibes-paper`, `-studio`, `-quiet`) from `main` and shipped alone. Each touches only its own
layout files, its own branch in each section's `variant`, its own CSS file, `rows.ts` (one value) and
`registry.ts` (one line per screen). The parity test (Task 13) covers each new layout the moment the
registry lists it; `vibes.spec.ts` and `parity.spec.ts` already run every vibe.

### Task 16: Paper library home

**Files:**
- Create: `apps/web/src/lib/sections/results/ResultsIndex.svelte`, `apps/web/src/lib/layouts/library/LibraryPaper.svelte`, `apps/web/src/lib/layouts/paper.css`, `apps/web/src/lib/layouts/library/LibraryPaper.svelte.test.ts`
- Modify: `apps/web/src/lib/ResultList.svelte` (`SHAPES.index`), `apps/web/src/lib/layouts/rows.ts` (`paper: 'index'`), `apps/web/src/lib/layouts/registry.ts` (`library.paper`), `apps/web/src/lib/FilterBar.svelte` (`openFrom` prop), `apps/web/src/routes/+layout.svelte` (import `paper.css`)

**Interfaces:**
- Produces: `FilterBar` prop `openFrom?: number` (default `768`; `0` = open at every width). `ResultsIndex { rows; label }`. `LibraryPaper { model: LibraryModel }`.

- [ ] **Step 1: Write the failing test** `LibraryPaper.svelte.test.ts` (structure only; the parity test checks the words)

```ts
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
vi.mock('$lib/session.svelte', async () => { const { FIX } = await import('$lib/screens/parity.fixture'); return { session: { me: FIX.me, notEnabled: null }, api: async (p: string, i?: RequestInit) => FIX.respond(p, i) }; });
vi.mock('$app/navigation', () => ({ goto: vi.fn(), replaceState: vi.fn() }));
import { look } from '$lib/vibe/appearance.svelte';
import Page from '../../../routes/+page.svelte';

let c: ReturnType<typeof mount> | null = null;
const settle = async () => { for (let i = 0; i < 8; i++) { await new Promise((r) => setTimeout(r, 0)); flushSync(); } };
beforeEach(() => { window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia; look.appearance = { ...look.appearance, vibe: 'paper' }; });
afterEach(() => { if (c) unmount(c); c = null; document.body.innerHTML = ''; });

describe('Paper: the library as a front page', () => {
  it('a masthead, the filters beside the results, and the rows as an index', async () => {
    c = mount(Page, { target: document.body });
    await settle();
    expect(document.querySelector('.sl-masthead h1')!.textContent).toBe('Library');
    expect(document.querySelector('.sl-paper-side details.filters')).not.toBeNull();
    expect(document.querySelector('.sl-paper-side [role="status"]')).not.toBeNull();
    const list = document.querySelector('ul.results--index[aria-label="Library"]')!;
    expect(list.querySelectorAll(':scope > li')).toHaveLength(2);
    expect(list.querySelector('blockquote.snippet')!.textContent).toBe('A caption for search');
    expect(document.querySelector('.vk-sky')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm -C apps/web exec vitest run src/lib/layouts/library/LibraryPaper.svelte.test.ts`
Expected: FAIL (no `.sl-masthead`: Paper still borrows the Daylight layout).

- [ ] **Step 3: Implement**

`FilterBar.svelte`: add `openFrom = 768` to the props (`openFrom?: number`) and change the mount line to `onMount(() => { open = openFrom === 0 || window.matchMedia(\`(min-width: ${openFrom}px)\`).matches; });`.

`ResultsIndex.svelte`:

```svelte
<script lang="ts">
  import { Face } from '@superjackfruit/vibekit';
  import OutcomeBadge from '$kit/OutcomeBadge.svelte';
  import { outcomeVar } from '$kit/outcome';
  import type { Row } from '$lib/library';
  let { rows, label }: { rows: Row[]; label: string } = $props();
</script>

<ul class="results results--index" aria-label={label}>
  {#each rows as r (r.id)}
    <li class="result" style:--o={outcomeVar(r.outcome)}>
      <a class="result-link" href={`/a/${r.id}`}><span class="result-title">{r.title}</span></a>
      <p class="sl-byline">{#if r.maker}<span class="result-face" aria-hidden="true"><Face id={r.maker.id} label={r.maker.label} size={24} /></span>{/if}<em>{r.line}</em></p>
      <p class="result-meta"><OutcomeBadge outcome={r.outcome} />{#if r.visibility}<span>{r.visibility}</span>{/if}</p>
      {#if r.snippet}<blockquote class="snippet">{r.snippet}</blockquote>{/if}
      {#if r.supersededBy}<a class="replaced" href={`/a/${r.supersededBy}`}>See what replaced it</a>{/if}
    </li>
  {/each}
</ul>
```

`ResultList.svelte`: import it and set `SHAPES = { cards: ResultsCards, index: ResultsIndex }`. `rows.ts`: `paper: 'index'`.

`LibraryPaper.svelte`:

```svelte
<!-- Paper: a front page. Masthead and dateline, the search, then the index of entries; the filters sit beside it on wide screens. -->
<script lang="ts">
  import Button from '$kit/Button.svelte';
  import FilterBar from '$lib/FilterBar.svelte';
  import type { LibraryModel } from '$lib/screens/library.svelte';
  import LibraryResults from '$lib/sections/LibraryResults.svelte';
  import LibraryStatus from '$lib/sections/LibraryStatus.svelte';
  import SearchForm from '$lib/sections/SearchForm.svelte';
  import { look } from '$lib/vibe/appearance.svelte';
  import { dateline } from '$lib/vibe/copy';
  let { model }: { model: LibraryModel } = $props();
</script>

<header class="sl-masthead">
  {#if look.appearance.timeStrength !== 'off'}<p class="sl-dateline">{dateline(look.now, look.phase)}</p>{/if}
  <div class="heading"><h1>Library</h1><Button href="/upload">Upload</Button></div>
</header>
<div class="sl-underline"><SearchForm {model} /></div>
<div class="sl-paper-columns">
  <div class="sl-paper-side">
    <FilterBar filters={model.filters} facets={model.facets} onchange={(f) => void model.setFilters(f)} openFrom={1024} />
    <LibraryStatus {model} />
  </div>
  <div class="sl-paper-main"><LibraryResults {model} /></div>
</div>
```

`paper.css` (import in `+layout.svelte` after `daylight.css`):

```css
/* Paper layouts (spec §5): rules, not cards; Newsreader for titles and the agent's voice. */
.sl-masthead { margin: 0 0 var(--vk-space-4); padding-bottom: var(--vk-space-3); border-bottom: 2px solid var(--vk-color-text); }
.sl-masthead h1 { margin: 0; font: 500 var(--vk-text-xl)/1.1 var(--vk-font-display); }
.sl-masthead .heading { flex-wrap: wrap; }
.sl-dateline { margin: 0 0 var(--vk-space-1); color: var(--vk-color-muted); font-size: var(--vk-text-sm); font-style: italic; }
.sl-underline input:not([type=checkbox]):not([type=radio]) { border-width: 0 0 2px; border-radius: 0; background: transparent; }
.sl-paper-columns { display: grid; gap: var(--vk-space-4); }
@media (min-width: 1024px) {
  .sl-paper-columns { grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: var(--vk-space-6); }
  .sl-paper-main { grid-column: 1; grid-row: 1; }
  .sl-paper-side { grid-column: 2; grid-row: 1; align-self: start; position: sticky; top: var(--vk-space-4); }
  .sl-paper-side .filter-grid { grid-template-columns: minmax(0, 1fr); }
}
.results--index .result { padding: var(--vk-space-3) 0; border-left: 0; border-bottom: 1px solid var(--vk-color-line); }
.results--index .result-title { font: 500 var(--vk-text-lg)/1.25 var(--vk-font-display); }
.results--index .result-meta { margin: var(--vk-space-1) 0 0; }
.sl-byline { display: flex; flex-wrap: wrap; align-items: center; gap: var(--vk-space-2); margin: 0; color: var(--vk-color-muted); }
.results--index .snippet { display: block; margin: var(--vk-space-2) 0 0; padding-left: var(--vk-space-3); border-left: 2px solid var(--vk-color-line); font-family: var(--vk-font-display); -webkit-line-clamp: unset; }
[data-vibe="paper"] .sl-more { display: flex; margin-inline: auto; }
```

`registry.ts`: `library: { daylight: LibraryDaylight, paper: LibraryPaper } satisfies Of<LibraryModel>,`.

- [ ] **Step 4: Run the tests**

Run: `pnpm -C apps/web test && pnpm -C apps/web typecheck`
Expected: the Paper test passes; `parity.svelte.test.ts` passes for `paper › the library home` with its own layout; all else passes.

- [ ] **Step 5: Commit**

```bash
git add -A apps/web/src
git commit -m "Paper: the library home as a front page, rows as an index" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8"
```

---

### Task 17: Paper item page: a letter with enclosures

**Files:**
- Create: `apps/web/src/lib/sections/Enclosure.svelte`, `apps/web/src/lib/sections/Enclosure.svelte.test.ts`, `apps/web/src/lib/layouts/item/ItemPaper.svelte`
- Modify: `apps/web/src/lib/sections/Timeline.svelte` (variant `letters`), `apps/web/src/lib/layouts/registry.ts` (`item.paper`), `apps/web/src/lib/layouts/paper.css`

**Interfaces:**
- Produces: `Enclosure { id: string; title: string; summary?: string; open?: boolean (bindable); openFrom?: number | null; children: Snippet }` rendering `section.sl-enclosure[aria-labelledby]` > `h2` > `button.sl-enclosure-toggle[aria-expanded][aria-controls]`, and the body `div[hidden]` when closed. `Timeline` accepts `variant: 'bubbles' | 'letters'` (letters: no faces).

- [ ] **Step 1: Write the failing test** `Enclosure.svelte.test.ts`

```ts
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createRawSnippet, flushSync, mount, unmount } from 'svelte';
import Enclosure from './Enclosure.svelte';

let c: ReturnType<typeof mount> | null = null;
const body = createRawSnippet(() => ({ render: () => '<p>Inside</p>' }));
beforeEach(() => { window.matchMedia = ((q: string) => ({ matches: q.includes('1024'), media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia; });
afterEach(() => { if (c) unmount(c); c = null; document.body.innerHTML = ''; });

describe('an enclosure', () => {
  it('is a region named by its heading, whose button opens and closes it', () => {
    c = mount(Enclosure, { target: document.body, props: { id: 'v', title: 'Versions', summary: '2 versions', children: body } });
    flushSync();
    const region = document.querySelector('section.sl-enclosure')!;
    expect(document.getElementById(region.getAttribute('aria-labelledby')!)!.tagName).toBe('H2');
    const b = document.querySelector<HTMLButtonElement>('h2 > button.sl-enclosure-toggle')!;
    const panel = document.getElementById(b.getAttribute('aria-controls')!)!;
    expect(b.getAttribute('aria-expanded')).toBe('false');
    expect(panel.hidden).toBe(true);
    expect(b.textContent).toContain('2 versions');   // the closed state says what is inside
    b.click(); flushSync();
    expect(b.getAttribute('aria-expanded')).toBe('true');
    expect(panel.hidden).toBe(false);
  });
  it('opens by itself from a width, when asked', () => {
    c = mount(Enclosure, { target: document.body, props: { id: 'd', title: 'Details', openFrom: 1024, children: body } });
    flushSync();
    expect(document.querySelector('button.sl-enclosure-toggle')!.getAttribute('aria-expanded')).toBe('true');
  });
});
```

- [ ] **Step 2: Run it to see it fail**

Run: `pnpm -C apps/web exec vitest run src/lib/sections/Enclosure.svelte.test.ts` → FAIL (missing).

- [ ] **Step 3: Implement** `Enclosure.svelte`

```svelte
<!-- An enclosure: a disclosure in the accessible accordion pattern (a heading holding a button). The closed state shows its summary. -->
<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  let { id, title, summary = '', open = $bindable(false), openFrom = null, children }: {
    id: string; title: string; summary?: string; open?: boolean; openFrom?: number | null; children: Snippet;
  } = $props();
  onMount(() => { if (openFrom !== null && window.matchMedia(`(min-width: ${openFrom}px)`).matches) open = true; });
</script>

<section class="sl-enclosure" aria-labelledby={`${id}-h`}>
  <h2 id={`${id}-h`}>
    <button type="button" class="sl-enclosure-toggle" aria-expanded={open} aria-controls={`${id}-body`} onclick={() => (open = !open)}>
      <span class="sl-enclosure-title">{title}</span>{#if summary}<span class="sl-enclosure-sum">{summary}</span>{/if}
    </button>
  </h2>
  <div class="sl-enclosure-body" id={`${id}-body`} hidden={!open}>{@render children()}</div>
</section>
```

`Timeline.svelte`: the variant type becomes `'bubbles' | 'letters'`; faces only for `bubbles` (`{#if variant === 'bubbles' && e.who}`). Same `ol.timeline` and entry markup otherwise.

`ItemPaper.svelte`:

```svelte
<!-- Paper: the item as a letter. Letterhead and byline, the content as the sheet, then the enclosures. -->
<script lang="ts">
  import { Face } from '@superjackfruit/vibekit';
  import Button from '$kit/Button.svelte';
  import OutcomeBadge from '$kit/OutcomeBadge.svelte';
  import AddToCollection from '$lib/AddToCollection.svelte';
  import RelatedList from '$lib/RelatedList.svelte';
  import type { ItemModel } from '$lib/screens/item.svelte';
  import DetailsSection from '$lib/sections/DetailsSection.svelte';
  import Enclosure from '$lib/sections/Enclosure.svelte';
  import FrameError from '$lib/sections/FrameError.svelte';
  import LinkedArtifacts from '$lib/sections/LinkedArtifacts.svelte';
  import ManageSection from '$lib/sections/ManageSection.svelte';
  import ProvenanceSection from '$lib/sections/ProvenanceSection.svelte';
  import RecordFailed from '$lib/sections/RecordFailed.svelte';
  import RecordLine from '$lib/sections/RecordLine.svelte';
  import SpecRows from '$lib/sections/SpecRows.svelte';
  import Timeline from '$lib/sections/Timeline.svelte';
  import VersionsSection from '$lib/sections/VersionsSection.svelte';
  let { model }: { model: ItemModel } = $props();
  const item = $derived(model.item!);
  const n = $derived(model.versions.length);
  const versionsSum = $derived(`${n} version${n === 1 ? '' : 's'}${model.latestLive !== undefined ? ` · v${model.latestLive} latest` : ''}`);
  const detailsSum = $derived(model.details.filter((r) => r.label === 'Kind' || r.label === 'Size').map((r) => r.value.replace(/ \(.*\)$/, '')).join(' · '));
  const artifactsSum = $derived(model.record ? `${model.record.artifacts.length} linked` : '');
</script>

<header class="item-header sl-letterhead">
  <div class="sl-letterhead-top">
    <p class="sl-kicker">Superlibrary · {model.kindWords}</p>
    {#each model.headerActions as a (a.label)}<Button href={a.href} icon={a.icon}>{a.label}</Button>{/each}
  </div>
  <h1>{item.title}</h1>
  <p class="item-meta sl-byline">
    {#if model.maker}<span class="item-face" aria-hidden="true"><Face id={model.maker.id} label={model.maker.label} size={24} /></span>{/if}
    <span>From {model.createdByWords}</span>
    <OutcomeBadge outcome={item.outcome} />
    {#if model.versionWords}<span>{model.versionWords}</span>{/if}
    <span>{model.visibility}</span>
    {#if model.deleteWords}<span>{model.deleteWords}</span>{/if}
  </p>
</header>

{#if item.kind === 'artifact'}
  <div class="viewer sl-sheet" {@attach model.viewer}></div>
  <FrameError {model} />
{:else if model.record}
  <div class="sl-letter-col">
    <RecordLine view={model.record} />
    {#if model.hasSpec}<section class="sl-letter" aria-labelledby="spec-h"><h2 id="spec-h">Spec</h2><SpecRows view={model.record} /></section>{/if}
  </div>
{:else}
  <RecordFailed {model} />
{/if}

<div class="sl-letter-col">
  <h2 class="sl-enclosed-h">Enclosed</h2>
  {#if item.kind === 'work-record' && model.record}
    <Enclosure id="timeline" title="Timeline" summary={`${model.entryCount} entries`} open><Timeline view={model.record} variant="letters" /></Enclosure>
    <Enclosure id="artifacts" title="Artifacts" summary={artifactsSum} open><LinkedArtifacts view={model.record} /></Enclosure>
  {/if}
  {#if item.kind === 'artifact'}
    <Enclosure id="versions" title="Versions" summary={versionsSum} open><VersionsSection {model} /></Enclosure>
    <Enclosure id="details" title={model.detailsHeading} summary={detailsSum} openFrom={1024}><DetailsSection {model} /></Enclosure>
  {/if}
  <Enclosure id="provenance" title="Provenance" summary={model.createdByWords} openFrom={1024}><ProvenanceSection {model} /></Enclosure>
  <Enclosure id="related" title="Related" openFrom={1024}><RelatedList itemId={item.id} /></Enclosure>
  <Enclosure id="collect" title="Collections" openFrom={1024}><AddToCollection itemId={item.id} /></Enclosure>
  {#if model.manage}
    <section class="manage sl-postscript" aria-labelledby="manage-h"><h2 id="manage-h">Manage</h2><ManageSection {model} level={3} /></section>
  {/if}
</div>
```

Append to `paper.css`:

```css
.sl-letterhead { margin: 0 0 var(--vk-space-2); }
.sl-letterhead-top { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: var(--vk-space-2); }
.sl-kicker { margin: 0; color: var(--vk-color-muted); font-size: var(--vk-text-sm); font-variant-caps: all-small-caps; letter-spacing: 0.06em; }
.sl-letterhead h1 { margin: var(--vk-space-1) 0; font: 500 var(--vk-text-lg)/1.2 var(--vk-font-display); overflow-wrap: anywhere; }
.viewer.sl-sheet { box-shadow: inset 0 0 0 1px var(--vk-color-line); border-radius: var(--vk-radius-sm); background: var(--vk-color-surface); }
.sl-letter-col { max-width: 720px; }
.sl-letter dl.rows { grid-template-columns: minmax(0, 1fr); }
.sl-letter dt { font-weight: 700; color: var(--vk-color-text); }
.sl-enclosed-h { margin: var(--vk-space-5) 0 var(--vk-space-2); font: 500 var(--vk-text-md)/1.2 var(--vk-font-display); font-style: italic; }
.sl-enclosure { border-top: 1px solid var(--vk-color-line); }
.sl-enclosure h2 { margin: 0; font-size: inherit; }
.sl-enclosure-toggle { display: flex; width: 100%; justify-content: space-between; gap: var(--vk-space-3); min-height: var(--vk-target-min); padding: var(--vk-space-2) 0; border: 0; border-radius: 0; background: transparent; box-shadow: none; text-align: left; font: 500 var(--vk-text-md)/1.3 var(--vk-font-display); }
.sl-enclosure-toggle::after { content: "+" / ""; color: var(--vk-color-muted); }
.sl-enclosure-toggle[aria-expanded="true"]::after { content: "−" / ""; }
.sl-enclosure-sum { margin-left: auto; color: var(--vk-color-muted); font: 400 var(--vk-text-sm)/1.3 var(--vk-font-body); }
.sl-enclosure-body { padding: 0 0 var(--vk-space-4); animation: sl-fade var(--vk-motion-base) var(--vk-motion-easing); }
@keyframes sl-fade { from { opacity: 0; } to { opacity: 1; } }
.sl-postscript { display: grid; gap: var(--vk-space-4); margin-top: var(--vk-space-5); padding-top: var(--vk-space-3); border-top: 2px solid var(--vk-color-text); }
.timeline--letters { padding-left: 0; border-left: 0; }
.timeline--letters li { padding: var(--vk-space-3) 0; border-bottom: 1px solid var(--vk-color-line); }
.timeline--letters li::before { display: none; }
.timeline--letters .when { font-style: italic; }
.timeline--letters .body { padding-left: var(--vk-space-3); border-left: 2px solid var(--o, var(--vk-color-line)); font-family: var(--vk-font-display); }
```

`registry.ts`: `item: { daylight: ItemDaylight, paper: ItemPaper } satisfies Of<ItemModel>,`.

- [ ] **Step 4: Run the tests**

Run: `pnpm -C apps/web test && pnpm -C apps/web typecheck`
Expected: Enclosure 2 passed; parity passes for Paper's artifact and work record (the test opens every enclosure; everything listed is then outside `[hidden]`).

- [ ] **Step 5: e2e for Paper**

Run: `pnpm --filter @superlibrary/web exec playwright test e2e/vibes.spec.ts e2e/parity.spec.ts -g paper --project=chromium`
Expected: pass (axe, no sideways scroll, 44px, the title budget, the controls).

- [ ] **Step 6: Commit**

```bash
git add -A apps/web/src
git commit -m "Paper: the item page as a letter, with its fields as enclosures" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8"
```

---

### Task 18: Paper collections

**Files:**
- Create: `apps/web/src/lib/layouts/collections/CollectionsPaper.svelte`, `apps/web/src/lib/layouts/collections/CollectionPaper.svelte`
- Modify: `apps/web/src/lib/sections/CollectionList.svelte` (`variant: 'toc'`), `apps/web/src/lib/sections/CollectionEntries.svelte` (`variant: 'numbered'`), `apps/web/src/lib/layouts/registry.ts`, `apps/web/src/lib/layouts/paper.css`

- [ ] **Step 1: Add the variants** (beside `cards`, same sentences, same names)

`CollectionList.svelte`, new branch:

```svelte
{:else if variant === 'toc'}
  <ol class="items sl-toc" aria-label="Collections">
    {#each model.list as c (c.id)}
      <li>
        <a href={`/collections/${c.id}`}><span class="title">{c.name}</span><span class="sl-leader" aria-hidden="true"></span><span class="sl-toc-count">{countWords(c.itemCount)}</span></a>
        {#if c.description}<p class="sl-toc-desc"><em>{c.description}</em></p>{/if}
      </li>
    {/each}
  </ol>
```

`CollectionEntries.svelte`, new branch (the Remove button's markup is the same as `cards`):

```svelte
{:else if variant === 'numbered'}
  <ol class="results sl-numbered" aria-label="Items in this collection">
    {#each model.c.entries as e (e.item.id)}
      <li class="result entry" style:--o={outcomeVar(e.item.outcome)}>
        <a class="result-link" href={`/a/${e.item.id}`}><span class="result-title">{e.item.title}</span></a>
        <p class="sl-byline"><OutcomeBadge outcome={e.item.outcome} /><em>added {when(e.addedAt)}</em></p>
        {#if e.note}<blockquote class="snippet">{e.note}</blockquote>{/if}
        <button type="button" onclick={() => model.remove(e.item.id, e.item.title)}><span>Remove<span class="visually-hidden"> “{e.item.title}”</span> from collection</span></button>
      </li>
    {/each}
  </ol>
```

(Widen both `variant` prop types to include the new value.)

- [ ] **Step 2: The layouts**

`CollectionsPaper.svelte`:

```svelte
<script lang="ts">
  import type { CollectionsModel } from '$lib/screens/collections.svelte';
  import CollectionCreate from '$lib/sections/CollectionCreate.svelte';
  import CollectionList from '$lib/sections/CollectionList.svelte';
  import { look } from '$lib/vibe/appearance.svelte';
  import { dateline } from '$lib/vibe/copy';
  let { model }: { model: CollectionsModel } = $props();
</script>

<header class="sl-masthead">
  {#if look.appearance.timeStrength !== 'off'}<p class="sl-dateline">{dateline(look.now, look.phase)}</p>{/if}
  <h1>Collections</h1>
</header>
<p class="sl-standfirst">Named sets of items, put together by people. An artifact in a collection is kept however old it is.</p>
<div class="sl-underline sl-letter-col"><CollectionCreate {model} /></div>
<div class="sl-letter-col"><CollectionList {model} variant="toc" /></div>
```

`CollectionPaper.svelte`:

```svelte
<script lang="ts">
  import type { CollectionModel } from '$lib/screens/collections.svelte';
  import CollectionActions from '$lib/sections/CollectionActions.svelte';
  import CollectionEntries from '$lib/sections/CollectionEntries.svelte';
  let { model }: { model: CollectionModel } = $props();
  const c = $derived(model.c!);
</script>

<div class="sl-letter-col">
  <header class="sl-letterhead">
    <p class="sl-kicker">Superlibrary · Collection</p>
    <h1>{c.name}</h1>
    <p class="sl-dateline">{model.meta}</p>
  </header>
  {#if c.description}<p class="body sl-letter-body">{c.description}</p>{/if}
  <CollectionActions {model} />
  <CollectionEntries {model} variant="numbered" />
</div>
```

Append to `paper.css`:

```css
.sl-standfirst { max-width: 720px; margin: 0 0 var(--vk-space-4); font: italic 400 var(--vk-text-md)/1.5 var(--vk-font-display); color: var(--vk-color-muted); }
.sl-toc { list-style: none; padding: 0; }
.sl-toc li { border-bottom: 0; }
.sl-toc a { flex-direction: row; align-items: baseline; gap: var(--vk-space-2); }
.sl-toc .title { font: 500 var(--vk-text-md)/1.3 var(--vk-font-display); }
.sl-leader { flex: 1; border-bottom: 1px dotted var(--vk-color-faint); }
.sl-toc-desc { margin: 0 0 var(--vk-space-2); color: var(--vk-color-muted); }
.sl-letter-body { font: 400 var(--vk-text-md)/1.6 var(--vk-font-display); }
.sl-numbered { padding-left: var(--vk-space-5); list-style: decimal; }
.sl-numbered .result { padding: var(--vk-space-3) 0; border-left: 0; border-bottom: 1px solid var(--vk-color-line); }
.sl-numbered .snippet { display: block; margin: var(--vk-space-2) 0; padding-left: var(--vk-space-3); border-left: 2px solid var(--vk-color-line); font-family: var(--vk-font-display); }
```

`registry.ts`: `collections: { daylight: CollectionsDaylight, paper: CollectionsPaper }`, `collection: { daylight: CollectionDaylight, paper: CollectionPaper }`.

- [ ] **Step 3: Run the tests**

Run: `pnpm -C apps/web test && pnpm -C apps/web typecheck && pnpm --filter @superlibrary/web exec playwright test e2e/vibes.spec.ts e2e/parity.spec.ts -g paper --project=chromium`
Expected: all pass.

- [ ] **Step 4: Commit**

```bash
git add -A apps/web/src
git commit -m "Paper: collections as a table of contents, a collection as numbered enclosures" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8"
```

---

### Task 19: Ship phase 2

- [ ] **Step 1:** `pnpm typecheck && pnpm test && pnpm --filter @superlibrary/web e2e` all green.
- [ ] **Step 2:** Push the branch, open the PR "Superlibrary on vibekit: phase 2 (Paper layouts)" with the same body shape as Task 15 (PR body ending with the Claude Code lines), `gh pr checks --watch`, look at the `vibe-screens` artifact's `paper-*` screenshots.
- [ ] **Step 3:** After the merge: `gh run watch`; live check: Account › Appearance › Paper on https://app.superlibrary.dev shows the masthead on `/`, the letter and enclosures on an item, the table of contents on `/collections`; on the phone too.

---

# Phase 3: Studio (a dashboard)

### Task 20: Studio library home: tiles and the results table

**Files:**
- Create: `apps/web/src/lib/sections/Tiles.svelte`, `apps/web/src/lib/sections/results/ResultsTable.svelte`, `apps/web/src/lib/layouts/library/LibraryStudio.svelte`, `apps/web/src/lib/layouts/library/LibraryStudio.svelte.test.ts`, `apps/web/src/lib/layouts/studio.css`
- Modify: `ResultList.svelte` (`SHAPES.table`), `rows.ts` (`studio: 'table'`), `registry.ts` (`library.studio`), `+layout.svelte` (import `studio.css`)

**Interfaces:**
- Produces: `Tiles { label: string; tiles: Array<{ key: string; value: string; tone?: string }> }` rendering `dl.sl-tiles[aria-label]` > `div.sl-tile` > `dt` + `dd` (`tone` is a CSS colour expression set as `--o`). `ResultsTable { rows; label }`.

- [ ] **Step 1: Write the failing test** `LibraryStudio.svelte.test.ts` (same mocks and setup as `LibraryPaper.svelte.test.ts`, with `vibe: 'studio'`)

```ts
describe('Studio: the library as a dashboard', () => {
  it('tiles for what is shown and each outcome, and the rows as a table with every part in its column', async () => {
    c = mount(Page, { target: document.body });
    await settle();
    const tiles = [...document.querySelectorAll('.sl-tiles .sl-tile')].map((t) => `${t.querySelector('dt')!.textContent}=${t.querySelector('dd')!.textContent}`);
    expect(tiles).toEqual(['Shown=2+', 'Filters on=0', 'Approved=0', 'Completed=1', 'In progress=0', 'Superseded=0', 'Rejected=1', 'Failed=0', 'Abandoned=0']);
    const table = document.querySelector('table.results[aria-label="Library"]')!;
    expect([...table.querySelectorAll('thead th')].map((th) => th.textContent!.trim())).toEqual(['Status', 'Title', 'Outcome', 'Kind', 'Board', 'Station', 'Source path', 'Visible to', 'Excerpt', 'Replaced by']);
    const first = [...table.querySelectorAll('tbody tr')[0]!.querySelectorAll('td')].map((td) => td.textContent!.trim());
    expect(first).toEqual(['', 'Parity report', 'Completed', 'Artifact', 'Parity board', 'docs', 'out/report', 'Everyone in the workspace', 'A caption for search', '']);
    expect(table.querySelector('tbody tr:nth-child(2) a.replaced')!.textContent).toBe('See what replaced it');
    for (const el of table.querySelectorAll('tr')) expect(el.getAttribute('role')).toBe('row');
  });
});
```

- [ ] **Step 2: Run it to see it fail** → FAIL (no tiles).

- [ ] **Step 3: Implement**

`Tiles.svelte`:

```svelte
<script lang="ts">
  let { label, tiles }: { label: string; tiles: Array<{ key: string; value: string; tone?: string }> } = $props();
</script>

<dl class="sl-tiles" aria-label={label}>
  {#each tiles as t (t.key)}<div class="sl-tile" style:--o={t.tone}><dt>{t.key}</dt><dd>{t.value}</dd></div>{/each}
</dl>
```

`ResultsTable.svelte` (explicit roles keep table semantics when CSS stacks it):

```svelte
<script lang="ts">
  import OutcomeBadge from '$kit/OutcomeBadge.svelte';
  import { outcomeVar } from '$kit/outcome';
  import type { Row } from '$lib/library';
  let { rows, label }: { rows: Row[]; label: string } = $props();
  const COLS = ['Status', 'Title', 'Outcome', 'Kind', 'Board', 'Station', 'Source path', 'Visible to', 'Excerpt', 'Replaced by'];
</script>

<table class="results sl-table sl-table--wide" role="table" aria-label={label}>
  <thead role="rowgroup"><tr role="row">{#each COLS as h, i (h)}<th role="columnheader" scope="col">{#if i === 0}<span class="visually-hidden">{h}</span>{:else}{h}{/if}</th>{/each}</tr></thead>
  <tbody role="rowgroup">
    {#each rows as r (r.id)}
      <tr class="result" role="row" style:--o={outcomeVar(r.outcome)}>
        <td role="cell" data-label="Status"><span class="sl-led" class:sl-led--live={r.outcome === 'in-progress'} aria-hidden="true"></span></td>
        <td role="cell" data-label="Title"><a class="result-link" href={`/a/${r.id}`}>{r.title}</a></td>
        <td role="cell" data-label="Outcome"><OutcomeBadge outcome={r.outcome} /></td>
        <td role="cell" data-label="Kind">{r.kindWord}</td>
        <td role="cell" data-label="Board">{r.board ?? ''}</td>
        <td role="cell" data-label="Station">{r.station ?? ''}</td>
        <td role="cell" data-label="Source path">{#if r.path}<code>{r.path}</code>{/if}</td>
        <td role="cell" data-label="Visible to">{r.visibility ?? ''}</td>
        <td role="cell" data-label="Excerpt">{#if r.snippet}<span class="snippet">{r.snippet}</span>{/if}</td>
        <td role="cell" data-label="Replaced by">{#if r.supersededBy}<a class="replaced" href={`/a/${r.supersededBy}`}>See what replaced it</a>{/if}</td>
      </tr>
    {/each}
  </tbody>
</table>
```

(The test's `'Status'` header text is the visually hidden span's text; `textContent` reads it.)

`LibraryStudio.svelte`:

```svelte
<!-- Studio: the library as an instrument. Readout, tiles, one dense control row, the table. -->
<script lang="ts">
  import Button from '$kit/Button.svelte';
  import { OUTCOME_ORDER, OUTCOME_WORDS, outcomeVar } from '$kit/outcome';
  import FilterBar from '$lib/FilterBar.svelte';
  import type { LibraryModel } from '$lib/screens/library.svelte';
  import LibraryResults from '$lib/sections/LibraryResults.svelte';
  import LibraryStatus from '$lib/sections/LibraryStatus.svelte';
  import SearchForm from '$lib/sections/SearchForm.svelte';
  import Tiles from '$lib/sections/Tiles.svelte';
  import { look } from '$lib/vibe/appearance.svelte';
  import { readout } from '$lib/vibe/copy';
  let { model }: { model: LibraryModel } = $props();
  const tiles = $derived([
    { key: 'Shown', value: `${model.rows.length}${model.next ? '+' : ''}` },
    { key: 'Filters on', value: String(model.activeCount) },
    ...(model.searching || !model.counts ? [] : OUTCOME_ORDER.map((o) => ({ key: OUTCOME_WORDS[o], value: String(model.counts![o] ?? 0), tone: outcomeVar(o) }))),
  ]);
</script>

<div class="heading sl-studio-head">
  <h1>Library</h1>
  {#if look.appearance.timeStrength !== 'off'}<p class="sl-readout" aria-hidden="true"><span class="sl-led sl-led--sun"></span>{readout(look.now, look.phase)}</p>{/if}
  <Button variant="primary" href="/upload">Upload</Button>
</div>
{#if !model.error && !(model.loading && model.rows.length === 0)}<Tiles label="Summary" {tiles} />{/if}
<div class="sl-studio-bar">
  <SearchForm {model} />
  <FilterBar filters={model.filters} facets={model.facets} onchange={(f) => void model.setFilters(f)} openFrom={1024} />
</div>
<LibraryStatus {model} />
<LibraryResults {model} />
```

`studio.css`:

```css
/* Studio layouts (spec §5): dense, mono labels, status lights. The words are unchanged; capitals are CSS. */
.sl-studio-head { flex-wrap: wrap; }
.sl-studio-head h1 { margin: 0; }
.sl-readout { display: inline-flex; align-items: center; gap: var(--vk-space-2); margin: 0 auto 0 0; font: 500 var(--vk-text-sm)/1 var(--vk-font-mono); letter-spacing: 0.08em; text-transform: uppercase; color: var(--vk-color-muted); }
.sl-led { display: inline-block; width: 10px; height: 10px; border-radius: 50%; background: var(--o, var(--vk-color-faint)); }
.sl-led--sun { background: var(--vk-sky-noon-sun); }
[data-phase="dawn"] .sl-led--sun { background: var(--vk-sky-dawn-sun); }
[data-phase="morning"] .sl-led--sun { background: var(--vk-sky-morning-sun); }
[data-phase="golden"] .sl-led--sun { background: var(--vk-sky-golden-sun); }
[data-phase="dusk"] .sl-led--sun { background: var(--vk-sky-dusk-sun); }
[data-phase="night"] .sl-led--sun { background: var(--vk-sky-night-sun); }
[data-time="subtle"] .sl-led--sun { display: none; }
.sl-led--live { animation: sl-blink 1.6s ease-in-out infinite; }
@keyframes sl-blink { 50% { opacity: 0.4; } }
.sl-tiles { display: grid; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); gap: var(--vk-space-2); margin: var(--vk-space-3) 0; }
.sl-tile { margin: 0; padding: var(--vk-space-2) var(--vk-space-3); border-radius: var(--vk-radius-sm); background: var(--vk-color-surface); box-shadow: inset 0 0 0 1px var(--vk-color-line), inset 3px 0 0 var(--o, var(--vk-color-line)); }
.sl-tile dt { font: 500 var(--vk-text-sm)/1.2 var(--vk-font-mono); letter-spacing: 0.06em; text-transform: uppercase; color: var(--vk-color-muted); }
.sl-tile dd { margin: var(--vk-space-1) 0 0; font: 600 var(--vk-text-lg)/1 var(--vk-font-mono); }
.sl-studio-bar { display: grid; gap: var(--vk-space-2); margin: 0 0 var(--vk-space-3); }
@media (min-width: 1024px) { .sl-studio-bar .filter-grid { grid-template-columns: repeat(4, minmax(0, 1fr)); } }
.sl-table { width: 100%; table-layout: fixed; border-collapse: collapse; margin: 0 0 var(--vk-space-4); font-size: var(--vk-text-sm); }
.sl-table th { padding: var(--vk-space-2); text-align: left; font: 500 var(--vk-text-sm)/1.2 var(--vk-font-mono); letter-spacing: 0.06em; text-transform: uppercase; color: var(--vk-color-muted); border-bottom: 1px solid var(--vk-color-line); }
.sl-table td { padding: var(--vk-space-2); vertical-align: top; border-bottom: 1px solid var(--vk-color-line); overflow-wrap: anywhere; }
.sl-table--wide th:first-child, .sl-table--wide td:first-child { width: 24px; }
.sl-table .snippet { -webkit-line-clamp: 2; line-clamp: 2; }
.sl-table .result-link { min-height: var(--vk-target-min); display: inline-flex; align-items: center; }
/* Stacked below the width the table needs (ten columns: 1024px; others: 768px). Roles in the markup keep the semantics. */
@media (max-width: 1023px) {
  .sl-table--wide, .sl-table--wide tbody, .sl-table--wide tr, .sl-table--wide td { display: block; }
  .sl-table--wide thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  .sl-table--wide tr { padding: var(--vk-space-2) 0; border-bottom: 1px solid var(--vk-color-line); }
  .sl-table--wide td { display: grid; grid-template-columns: 8rem minmax(0, 1fr); gap: var(--vk-space-2); padding: 2px 0; border: 0; }
  .sl-table--wide td::before { content: attr(data-label) / ""; color: var(--vk-color-muted); font: 500 var(--vk-text-sm)/1.4 var(--vk-font-mono); text-transform: uppercase; }
  .sl-table--wide td:first-child { width: auto; }
}
@media (max-width: 767px) {
  .sl-table--stack, .sl-table--stack tbody, .sl-table--stack tr, .sl-table--stack td { display: block; }
  .sl-table--stack thead { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
  .sl-table--stack tr { padding: var(--vk-space-2) 0; border-bottom: 1px solid var(--vk-color-line); }
  .sl-table--stack td { display: grid; grid-template-columns: 7rem minmax(0, 1fr); gap: var(--vk-space-2); padding: 2px 0; border: 0; }
  .sl-table--stack td::before { content: attr(data-label) / ""; color: var(--vk-color-muted); font: 500 var(--vk-text-sm)/1.4 var(--vk-font-mono); text-transform: uppercase; }
}
```

`ResultList.svelte`: `SHAPES.table = ResultsTable`. `rows.ts`: `studio: 'table'`. `registry.ts`: `library.studio = LibraryStudio`.

- [ ] **Step 4: Run the tests**

Run: `pnpm -C apps/web test && pnpm -C apps/web typecheck && pnpm --filter @superlibrary/web exec playwright test e2e/vibes.spec.ts e2e/parity.spec.ts -g studio --project=chromium`
Expected: all pass, including no sideways scroll at 390px and 1280px with the stacked table.

- [ ] **Step 5: Commit**

```bash
git add -A apps/web/src
git commit -m "Studio: the library home as a dashboard, with tiles and a results table" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8"
```

---

### Task 21: Studio item page

**Files:**
- Create: `apps/web/src/lib/layouts/item/ItemStudio.svelte`
- Modify: `apps/web/src/lib/sections/VersionsSection.svelte` (`variant: 'table'`), `apps/web/src/lib/sections/Timeline.svelte` (`variant: 'log'`), `apps/web/src/lib/layouts/registry.ts`, `apps/web/src/lib/layouts/studio.css`

- [ ] **Step 1: The table variant of Versions** (same fields and words as `list`)

```svelte
{:else if variant === 'table'}
  <table class="sl-table sl-table--stack" role="table" aria-label="Versions">
    <thead role="rowgroup"><tr role="row"><th role="columnheader" scope="col">Version</th><th role="columnheader" scope="col">Uploaded</th><th role="columnheader" scope="col">Size</th><th role="columnheader" scope="col">Files</th><th role="columnheader" scope="col">Flags</th><th role="columnheader" scope="col"><span class="visually-hidden">Action</span></th></tr></thead>
    <tbody role="rowgroup">
      {#each model.versions as v (v.version)}
        <tr role="row" class:current={model.current?.version === v.version}>
          <td role="cell" data-label="Version">{#if v.revokedAt}<span class="vname">v{v.version}</span>{:else}<a class="vname" href={model.showUrl(v.version)} aria-current={model.current?.version === v.version ? 'true' : undefined} onclick={(e) => model.pick(v.version, e)}>v{v.version}</a>{/if}</td>
          <td role="cell" data-label="Uploaded">{when(v.createdAt)}</td>
          <td role="cell" data-label="Size">{formatBytes(v.totalBytes)}</td>
          <td role="cell" data-label="Files">{files(v.fileCount)}</td>
          <td role="cell" data-label="Flags"><span class="badges">
            {#if model.current?.version === v.version}<span class="badge">Shown</span>{/if}
            {#if v.version === model.latestLive}<span class="badge">Latest</span>{/if}
            {#if v.revokedAt}<span class="badge danger-text">Revoked</span>{/if}
            {#if v.scanOverride}<span class="badge">Secret scan overridden</span>{/if}
          </span></td>
          <td role="cell" data-label="Action">{#if model.manage && !v.revokedAt}<button type="button" class="danger-outline" onclick={(e) => model.revokeVersion(e, v.version)}>Revoke<span class="visually-hidden"> version {v.version}</span></button>{/if}</td>
        </tr>
      {/each}
    </tbody>
  </table>
```

`Timeline.svelte`: variant type adds `'log'` (no faces; CSS draws it as rows).

- [ ] **Step 2: Write** `ItemStudio.svelte`

```svelte
<!-- Studio: the item as an instrument. Readout bar, title and chips, the content, tiles, then dense panels. -->
<script lang="ts">
  import OutcomeBadge from '$kit/OutcomeBadge.svelte';
  import Toolbar from '$kit/Toolbar.svelte';
  import { outcomeVar } from '$kit/outcome';
  import AddToCollection from '$lib/AddToCollection.svelte';
  import RelatedList from '$lib/RelatedList.svelte';
  import { when } from '$lib/item';
  import type { ItemModel } from '$lib/screens/item.svelte';
  import DetailsSection from '$lib/sections/DetailsSection.svelte';
  import FrameError from '$lib/sections/FrameError.svelte';
  import LinkedArtifacts from '$lib/sections/LinkedArtifacts.svelte';
  import ManageSection from '$lib/sections/ManageSection.svelte';
  import ProvenanceSection from '$lib/sections/ProvenanceSection.svelte';
  import RecordFailed from '$lib/sections/RecordFailed.svelte';
  import RecordLine from '$lib/sections/RecordLine.svelte';
  import SpecRows from '$lib/sections/SpecRows.svelte';
  import Tiles from '$lib/sections/Tiles.svelte';
  import Timeline from '$lib/sections/Timeline.svelte';
  import VersionsSection from '$lib/sections/VersionsSection.svelte';
  import { look } from '$lib/vibe/appearance.svelte';
  import { readout } from '$lib/vibe/copy';
  let { model }: { model: ItemModel } = $props();
  const item = $derived(model.item!);
  const row = (label: string) => model.details.find((r) => r.label === label)?.value ?? '';
  const tiles = $derived(item.kind === 'artifact'
    ? [
        { key: 'Version', value: model.current ? `v${model.current.version} of ${model.versions.length}${model.current.version === model.latestLive ? ', latest' : ''}` : '—' },
        { key: 'Size', value: row('Size').replace(/ \(.*\)$/, '') || '—' },
        { key: 'Files', value: model.current ? String(model.current.fileCount) : '—' },
        { key: 'Kind', value: row('Kind') || '—' },
        { key: 'Uploaded', value: model.current ? when(model.current.createdAt) : '—' },
      ]
    : [
        { key: 'Stage', value: model.record?.record.stage ?? '—' },
        { key: 'Timeline entries', value: String(model.entryCount) },
        { key: 'Artifacts linked', value: String(model.record?.artifacts.length ?? 0) },
      ]);
</script>

<div class="sl-readout-bar">
  <span class="sl-k">{model.kindWords}</span><code>{item.id}</code>
  <span class="sl-led" style:--o={outcomeVar(item.outcome)} class:sl-led--live={item.outcome === 'in-progress'} aria-hidden="true"></span><OutcomeBadge outcome={item.outcome} />
  {#if look.appearance.timeStrength !== 'off'}<span class="sl-readout" aria-hidden="true"><span class="sl-led sl-led--sun"></span>{readout(look.now, look.phase)}</span>{/if}
</div>
<header class="item-header sl-studio-item">
  <h1>{item.title}</h1>
  <p class="item-meta">{#if model.versionWords}<span class="sl-chip">{model.versionWords}</span>{/if}<span class="sl-chip">{model.visibility}</span>{#if model.deleteWords}<span class="sl-chip">{model.deleteWords}</span>{/if}</p>
  {#if model.headerActions.length}<Toolbar label="Item" items={model.headerActions} />{/if}
</header>

{#if item.kind === 'artifact'}
  <div class="viewer" {@attach model.viewer}></div>
  <FrameError {model} />
{/if}
<Tiles label="Facts" {tiles} />

<div class="sl-panels">
  {#if item.kind === 'artifact'}
    <section class="sl-panel" aria-labelledby="versions-h"><h2 id="versions-h">Versions</h2><VersionsSection {model} variant="table" /></section>
    <section class="sl-panel" aria-labelledby="details-h"><h2 id="details-h">{model.detailsHeading}</h2><DetailsSection {model} /></section>
  {:else if model.record}
    <section class="sl-panel" aria-labelledby="record-h"><h2 id="record-h" class="visually-hidden">Record</h2><RecordLine view={model.record} />{#if model.hasSpec}<h2>Spec</h2><SpecRows view={model.record} />{/if}</section>
    <section class="sl-panel sl-panel--wide" aria-labelledby="timeline-h"><h2 id="timeline-h">Timeline</h2><Timeline view={model.record} variant="log" /></section>
    <section class="sl-panel" aria-labelledby="artifacts-h"><h2 id="artifacts-h">Artifacts</h2><LinkedArtifacts view={model.record} /></section>
  {:else}
    <RecordFailed {model} />
  {/if}
  <section class="sl-panel" aria-labelledby="provenance-h"><h2 id="provenance-h">Provenance</h2><ProvenanceSection {model} /></section>
  <section class="sl-panel" aria-labelledby="related-h"><h2 id="related-h">Related</h2><RelatedList itemId={item.id} /></section>
  <section class="sl-panel" aria-labelledby="collect-h"><h2 id="collect-h">Collections</h2><AddToCollection itemId={item.id} /></section>
</div>
{#if model.manage}
  <section class="manage sl-panels sl-command" aria-labelledby="manage-h"><h2 id="manage-h" class="visually-hidden">Manage</h2><ManageSection {model} level={2} /></section>
{/if}
```

Append to `studio.css`:

```css
.sl-readout-bar { display: flex; flex-wrap: wrap; align-items: center; gap: var(--vk-space-2); margin: 0 0 var(--vk-space-2); padding: var(--vk-space-1) var(--vk-space-3); border-radius: var(--vk-radius-sm); background: var(--vk-color-raised); font: 500 var(--vk-text-sm)/1.4 var(--vk-font-mono); }
.sl-readout-bar .sl-readout { margin-left: auto; }
.sl-k { text-transform: uppercase; letter-spacing: 0.08em; color: var(--vk-color-muted); }
.sl-studio-item { display: grid; gap: var(--vk-space-1) var(--vk-space-4); }
@media (min-width: 768px) { .sl-studio-item { grid-template-columns: minmax(0, 1fr) auto; } .sl-studio-item .kit-toolbar-wrap { grid-column: 2; grid-row: 1 / span 2; } }
.sl-studio-item h1 { margin: 0; }
.sl-chip { padding: 2px var(--vk-space-2); border-radius: var(--vk-radius-sm); box-shadow: inset 0 0 0 1px var(--vk-color-line); font-family: var(--vk-font-mono); font-size: var(--vk-text-sm); }
.sl-panels { display: grid; gap: var(--vk-space-3); grid-template-columns: minmax(0, 1fr); margin: var(--vk-space-3) 0; }
@media (min-width: 800px) { .sl-panels { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (min-width: 1280px) { .sl-panels { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
.sl-panel { min-width: 0; padding: 0 var(--vk-space-3) var(--vk-space-3); border-radius: var(--vk-radius-sm); background: var(--vk-color-surface); box-shadow: inset 0 0 0 1px var(--vk-color-line); }
.sl-panel--wide { grid-column: 1 / -1; }
.sl-panel .rows dt { font: 500 var(--vk-text-sm)/1.4 var(--vk-font-mono); text-transform: uppercase; letter-spacing: 0.04em; }
.sl-command .danger, .sl-command .kit-button--danger { justify-self: end; }
.timeline--log { padding-left: 0; border-left: 0; }
.timeline--log li { display: grid; grid-template-columns: 12px minmax(0, 1fr); column-gap: var(--vk-space-2); padding: var(--vk-space-2) 0; border-bottom: 1px solid var(--vk-color-line); }
.timeline--log li::before { position: static; grid-row: 1 / span 3; width: 10px; height: 10px; margin-top: 5px; border: 0; background: var(--o, var(--vk-color-faint)); }
.timeline--log .when { font-family: var(--vk-font-mono); }
```

`registry.ts`: `item.studio = ItemStudio`.

- [ ] **Step 3: Run the tests**

Run: `pnpm -C apps/web test && pnpm -C apps/web typecheck && pnpm --filter @superlibrary/web exec playwright test e2e/vibes.spec.ts e2e/parity.spec.ts -g studio --project=chromium`
Expected: all pass (parity: every field of the artifact and the record, in Studio's own layout; the title budget holds: the tiles sit under the viewer).

- [ ] **Step 4: Commit**

```bash
git add -A apps/web/src
git commit -m "Studio: the item page as a dashboard: readout, tiles, a versions table and a log" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8"
```

---

### Task 22: Studio collections

**Files:**
- Create: `apps/web/src/lib/layouts/collections/CollectionsStudio.svelte`, `apps/web/src/lib/layouts/collections/CollectionStudio.svelte`
- Modify: `CollectionList.svelte` (`variant: 'table'`), `CollectionEntries.svelte` (`variant: 'table'`), `registry.ts`, `studio.css`

- [ ] **Step 1: The table variants** (stacked below 768px)

`CollectionList.svelte`:

```svelte
{:else if variant === 'table'}
  <table class="sl-table sl-table--stack" role="table" aria-label="Collections">
    <thead role="rowgroup"><tr role="row"><th role="columnheader" scope="col">Name</th><th role="columnheader" scope="col">Items</th><th role="columnheader" scope="col">Description</th></tr></thead>
    <tbody role="rowgroup">
      {#each model.list as c (c.id)}
        <tr role="row"><td role="cell" data-label="Name"><a class="result-link" href={`/collections/${c.id}`}>{c.name}</a></td><td role="cell" data-label="Items">{countWords(c.itemCount)}</td><td role="cell" data-label="Description">{c.description}</td></tr>
      {/each}
    </tbody>
  </table>
```

`CollectionEntries.svelte`:

```svelte
{:else if variant === 'table'}
  <table class="sl-table sl-table--stack" role="table" aria-label="Items in this collection">
    <thead role="rowgroup"><tr role="row"><th role="columnheader" scope="col">Title</th><th role="columnheader" scope="col">Outcome</th><th role="columnheader" scope="col">Added</th><th role="columnheader" scope="col">Note</th><th role="columnheader" scope="col"><span class="visually-hidden">Action</span></th></tr></thead>
    <tbody role="rowgroup">
      {#each model.c.entries as e (e.item.id)}
        <tr role="row" class="result entry" style:--o={outcomeVar(e.item.outcome)}>
          <td role="cell" data-label="Title"><a class="result-link" href={`/a/${e.item.id}`}>{e.item.title}</a></td>
          <td role="cell" data-label="Outcome"><OutcomeBadge outcome={e.item.outcome} /></td>
          <td role="cell" data-label="Added">added {when(e.addedAt)}</td>
          <td role="cell" data-label="Note">{e.note ?? ''}</td>
          <td role="cell" data-label="Action"><button type="button" onclick={() => model.remove(e.item.id, e.item.title)}><span>Remove<span class="visually-hidden"> “{e.item.title}”</span> from collection</span></button></td>
        </tr>
      {/each}
    </tbody>
  </table>
```

- [ ] **Step 2: The layouts**

`CollectionsStudio.svelte`:

```svelte
<script lang="ts">
  import type { CollectionsModel } from '$lib/screens/collections.svelte';
  import CollectionCreate from '$lib/sections/CollectionCreate.svelte';
  import CollectionList from '$lib/sections/CollectionList.svelte';
  import { look } from '$lib/vibe/appearance.svelte';
  import { readout } from '$lib/vibe/copy';
  let { model }: { model: CollectionsModel } = $props();
</script>

<div class="heading sl-studio-head">
  <h1>Collections</h1>
  {#if look.appearance.timeStrength !== 'off'}<p class="sl-readout" aria-hidden="true"><span class="sl-led sl-led--sun"></span>{readout(look.now, look.phase)}</p>{/if}
</div>
<p class="muted">Named sets of items, put together by people. An artifact in a collection is kept however old it is.</p>
<div class="sl-panel sl-command-bar"><CollectionCreate {model} /></div>
<CollectionList {model} variant="table" />
```

`CollectionStudio.svelte`:

```svelte
<script lang="ts">
  import { when } from '$lib/item';
  import { countWords, type CollectionModel } from '$lib/screens/collections.svelte';
  import CollectionActions from '$lib/sections/CollectionActions.svelte';
  import CollectionEntries from '$lib/sections/CollectionEntries.svelte';
  import Tiles from '$lib/sections/Tiles.svelte';
  let { model }: { model: CollectionModel } = $props();
  const c = $derived(model.c!);
</script>

<div class="sl-readout-bar"><span class="sl-k">Collection</span><code>{c.id}</code></div>
<h1>{c.name}</h1>
{#if c.description}<p class="body">{c.description}</p>{/if}
<p class="muted">{model.meta}</p>
<Tiles label="Facts" tiles={[{ key: 'Items', value: countWords(c.itemCount) }, { key: 'Created', value: when(c.createdAt) }]} />
<div class="sl-command"><CollectionActions {model} /></div>
<CollectionEntries {model} variant="table" />
```

(The meta line stays as a sentence and is also restated by the tiles; the parity list needs "2 items · created".)

Append to `studio.css`: `.sl-command-bar { padding-top: var(--vk-space-3); margin: 0 0 var(--vk-space-3); }`. Registry: `collections.studio`, `collection.studio`.

- [ ] **Step 3: Run the tests** (unit, typecheck, `-g studio` e2e) → all pass.

- [ ] **Step 4: Commit**

```bash
git add -A apps/web/src
git commit -m "Studio: collections and a collection as tables with a command bar" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8"
```

---

### Task 23: Ship phase 3

As Task 19, for Studio: all green locally, PR "Superlibrary on vibekit: phase 3 (Studio layouts)", CI green, look at the `studio-*` screenshots (390px: tables stacked, nothing sideways), merge, `gh run watch`, live check in Studio on desktop and phone.

---

# Phase 4: Quiet (a clear printed page)

### Task 24: Quiet library home

**Files:**
- Create: `apps/web/src/lib/sections/results/ResultsPlain.svelte`, `apps/web/src/lib/layouts/library/LibraryQuiet.svelte`, `apps/web/src/lib/layouts/quiet.css`, `apps/web/src/lib/layouts/library/LibraryQuiet.svelte.test.ts`
- Modify: `ResultList.svelte` (`SHAPES.plain`), `rows.ts` (`quiet: 'plain'`), `registry.ts`, `+layout.svelte` (import `quiet.css`)

- [ ] **Step 1: Write the failing test** (same setup as Task 16's, `vibe: 'quiet'`)

```ts
describe('Quiet: the library as a printed page', () => {
  it('a visible search label, filters open, plain rows that say their facts in words, no faces and no sky', async () => {
    c = mount(Page, { target: document.body });
    await settle();
    expect(document.querySelector('label[for="q"]')!.classList.contains('visually-hidden')).toBe(false);
    expect(document.querySelector<HTMLDetailsElement>('details.filters')!.open).toBe(true);
    const first = document.querySelector('ul.results--plain[aria-label="Library"] > li')!;
    expect(first.querySelector('.sl-facts-line')!.textContent!.replace(/\s+/g, ' ').trim()).toBe('Outcome: Completed. Artifact · Parity board · docs · out/report. Visible to: Everyone in the workspace.');
    expect(document.querySelector('.vk-face, .vk-sky')).toBeNull();
  });
});
```

- [ ] **Step 2: Run it to see it fail** → FAIL.

- [ ] **Step 3: Implement**

`ResultsPlain.svelte`:

```svelte
<script lang="ts">
  import OutcomeBadge from '$kit/OutcomeBadge.svelte';
  import { outcomeVar } from '$kit/outcome';
  import type { Row } from '$lib/library';
  let { rows, label }: { rows: Row[]; label: string } = $props();
</script>

<ul class="results results--plain" aria-label={label}>
  {#each rows as r (r.id)}
    <li class="result" style:--o={outcomeVar(r.outcome)}>
      <a class="result-link" href={`/a/${r.id}`}><span class="result-title">{r.title}</span></a>
      <p class="sl-facts-line">Outcome: <OutcomeBadge outcome={r.outcome} />. {r.line}.{#if r.visibility} Visible to: {r.visibility}.{/if}</p>
      {#if r.snippet}<p class="snippet">{r.snippet}</p>{/if}
      {#if r.supersededBy}<p><a class="replaced" href={`/a/${r.supersededBy}`}>See what replaced it</a></p>{/if}
    </li>
  {/each}
</ul>
```

`LibraryQuiet.svelte`:

```svelte
<!-- Quiet: the library as a printed page. Everything open, labels visible, no decoration. -->
<script lang="ts">
  import Button from '$kit/Button.svelte';
  import FilterBar from '$lib/FilterBar.svelte';
  import type { LibraryModel } from '$lib/screens/library.svelte';
  import LibraryResults from '$lib/sections/LibraryResults.svelte';
  import LibraryStatus from '$lib/sections/LibraryStatus.svelte';
  import SearchForm from '$lib/sections/SearchForm.svelte';
  import { look } from '$lib/vibe/appearance.svelte';
  import { timeLine } from '$lib/vibe/copy';
  let { model }: { model: LibraryModel } = $props();
</script>

<div class="sl-quiet">
  <h1>Library</h1>
  {#if look.appearance.timeStrength !== 'off'}<p class="muted">{timeLine(look.phase)}</p>{/if}
  <p><Button href="/upload">Upload</Button></p>
  <SearchForm {model} labelVisible />
  <FilterBar filters={model.filters} facets={model.facets} onchange={(f) => void model.setFilters(f)} openFrom={0} />
  <LibraryStatus {model} />
  <LibraryResults {model} />
</div>
```

`quiet.css`:

```css
/* Quiet layouts (spec §5): one column, everything open, visible labels, no decoration, no motion. */
.sl-quiet { max-width: 720px; }
.searchbar-label { display: block; margin: 0 0 var(--vk-space-1); font-weight: 700; }
.sl-quiet .searchbar { flex-wrap: wrap; }
.sl-quiet .searchbar-label { flex-basis: 100%; }
.results--plain .result { padding: var(--vk-space-3) 0; border-left: 0; border-bottom: 1px solid var(--vk-color-line); }
.results--plain .result-link { text-decoration: underline; }
.results--plain .snippet { display: block; -webkit-line-clamp: unset; }
.sl-facts-line { margin: var(--vk-space-1) 0; }
.sl-facts-line .outcome::before { display: none; }
.sl-back { display: inline-flex; align-items: center; min-height: var(--vk-target-min); }
.sl-facts { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 2px var(--vk-space-3); margin: var(--vk-space-2) 0; }
.sl-facts dt { font-weight: 700; }
.sl-facts dd { margin: 0; }
```

`ResultList.svelte`: `SHAPES.plain = ResultsPlain`; `rows.ts`: `quiet: 'plain'`; `registry.ts`: `library.quiet = LibraryQuiet`.

- [ ] **Step 4: Run the tests** (unit, typecheck, `-g quiet` e2e) → all pass.

- [ ] **Step 5: Commit**

```bash
git add -A apps/web/src
git commit -m "Quiet: the library home as a printed page" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8"
```

---

### Task 25: Quiet item page

**Files:**
- Create: `apps/web/src/lib/layouts/item/ItemQuiet.svelte`
- Modify: `VersionsSection.svelte` (`variant: 'plain'`), `Timeline.svelte` (`variant: 'plain'`), `registry.ts`, `quiet.css`

- [ ] **Step 1: The plain variant of Versions** (same fields and words)

```svelte
{:else if variant === 'plain'}
  <ul class="versions versions--plain">
    {#each model.versions as v (v.version)}
      <li class:current={model.current?.version === v.version}>
        <p class="vline">
          {#if v.revokedAt}<span class="vname">v{v.version}</span>{:else}<a class="vname" href={model.showUrl(v.version)} aria-current={model.current?.version === v.version ? 'true' : undefined} onclick={(e) => model.pick(v.version, e)}>v{v.version}</a>{/if}
          <span>{when(v.createdAt)} · {formatBytes(v.totalBytes)} · {files(v.fileCount)}</span>
          <span class="badges">{[model.current?.version === v.version ? 'Shown' : '', v.version === model.latestLive ? 'Latest' : '', v.revokedAt ? 'Revoked' : '', v.scanOverride ? 'Secret scan overridden' : ''].filter(Boolean).join(', ')}</span>
        </p>
        {#if model.manage && !v.revokedAt}<button type="button" class="danger-outline" onclick={(e) => model.revokeVersion(e, v.version)}>Revoke<span class="visually-hidden"> version {v.version}</span></button>{/if}
      </li>
    {/each}
  </ul>
```

`Timeline.svelte`: variant type adds `'plain'` (no faces).

- [ ] **Step 2: Write** `ItemQuiet.svelte`

```svelte
<!-- Quiet: the item on one plain page. Facts as a list, the content, then every section open with its heading. -->
<script lang="ts">
  import Button from '$kit/Button.svelte';
  import OutcomeBadge from '$kit/OutcomeBadge.svelte';
  import AddToCollection from '$lib/AddToCollection.svelte';
  import RelatedList from '$lib/RelatedList.svelte';
  import type { ItemModel } from '$lib/screens/item.svelte';
  import DetailsSection from '$lib/sections/DetailsSection.svelte';
  import FrameError from '$lib/sections/FrameError.svelte';
  import LinkedArtifacts from '$lib/sections/LinkedArtifacts.svelte';
  import ManageSection from '$lib/sections/ManageSection.svelte';
  import ProvenanceSection from '$lib/sections/ProvenanceSection.svelte';
  import RecordFailed from '$lib/sections/RecordFailed.svelte';
  import RecordLine from '$lib/sections/RecordLine.svelte';
  import SpecRows from '$lib/sections/SpecRows.svelte';
  import Timeline from '$lib/sections/Timeline.svelte';
  import VersionsSection from '$lib/sections/VersionsSection.svelte';
  let { model }: { model: ItemModel } = $props();
  const item = $derived(model.item!);
</script>

<div class="sl-quiet">
  <p><a class="sl-back" href="/">← Library</a></p>
  <h1>{item.title}</h1>
  <dl class="sl-facts item-meta">
    <dt>Outcome</dt><dd><OutcomeBadge outcome={item.outcome} /></dd>
    {#if model.versionWords}<dt>Version</dt><dd>{model.versionWords}</dd>{/if}
    <dt>Visible to</dt><dd>{model.visibility}</dd>
    {#if model.deleteWords}<dt>Delete date</dt><dd>{model.deleteWords}</dd>{/if}
  </dl>

  {#if item.kind === 'artifact'}
    <div class="viewer" {@attach model.viewer}></div>
    <FrameError {model} />
    {#each model.headerActions as a (a.label)}<p><Button href={a.href} icon={a.icon}>{a.label}</Button></p>{/each}
    <section aria-labelledby="versions-h"><h2 id="versions-h">Versions</h2><VersionsSection {model} variant="plain" /></section>
    <section aria-labelledby="details-h"><h2 id="details-h">{model.detailsHeading}</h2><DetailsSection {model} /></section>
  {:else if model.record}
    <RecordLine view={model.record} />
    {#if model.hasSpec}<section aria-labelledby="spec-h"><h2 id="spec-h">Spec</h2><SpecRows view={model.record} /></section>{/if}
    <section aria-labelledby="timeline-h"><h2 id="timeline-h">Timeline</h2><Timeline view={model.record} variant="plain" /></section>
    <section aria-labelledby="artifacts-h"><h2 id="artifacts-h">Artifacts</h2><LinkedArtifacts view={model.record} /></section>
  {:else}
    <RecordFailed {model} />
  {/if}

  <section aria-labelledby="provenance-h"><h2 id="provenance-h">Provenance</h2><ProvenanceSection {model} /></section>
  <section aria-labelledby="related-h"><h2 id="related-h">Related</h2><RelatedList itemId={item.id} /></section>
  <section aria-labelledby="collect-h"><h2 id="collect-h">Collections</h2><AddToCollection itemId={item.id} /></section>
  {#if model.manage}
    <section class="sl-quiet-manage" aria-labelledby="manage-h"><h2 id="manage-h">Manage</h2><ManageSection {model} level={3} /></section>
  {/if}
</div>
```

Append to `quiet.css`:

```css
.versions--plain li { align-items: flex-start; }
.versions--plain .vline { margin: 0; }
.sl-quiet .panel { box-shadow: none; padding: 0; background: transparent; }
.sl-quiet-manage { display: grid; gap: var(--vk-space-3); }
.timeline--plain li::before { display: none; }
.timeline--plain { padding-left: var(--vk-space-5); border-left: 0; list-style: decimal; }
```

`registry.ts`: `item.quiet = ItemQuiet`.

- [ ] **Step 3: Run the tests** (unit, typecheck, `-g quiet` e2e) → all pass, including the title budget at 390px.

- [ ] **Step 4: Commit**

```bash
git add -A apps/web/src
git commit -m "Quiet: the item on one plain page, every section open" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8"
```

---

### Task 26: Quiet collections

**Files:**
- Create: `apps/web/src/lib/layouts/collections/CollectionsQuiet.svelte`, `apps/web/src/lib/layouts/collections/CollectionQuiet.svelte`
- Modify: `CollectionList.svelte` (`variant: 'plain'`), `CollectionEntries.svelte` (`variant: 'plain'`), `registry.ts`

- [ ] **Step 1: The plain variants**

`CollectionList.svelte`:

```svelte
{:else if variant === 'plain'}
  <ul class="items items--plain" aria-label="Collections">
    {#each model.list as c (c.id)}
      <li><a href={`/collections/${c.id}`}><span class="title">{c.name}</span><small>{countWords(c.itemCount)}{c.description ? ` · ${c.description}` : ''}</small></a></li>
    {/each}
  </ul>
```

`CollectionEntries.svelte`:

```svelte
{:else if variant === 'plain'}
  <ul class="results results--plain" aria-label="Items in this collection">
    {#each model.c.entries as e (e.item.id)}
      <li class="result entry" style:--o={outcomeVar(e.item.outcome)}>
        <a class="result-link" href={`/a/${e.item.id}`}><span class="result-title">{e.item.title}</span></a>
        <p class="sl-facts-line">Outcome: <OutcomeBadge outcome={e.item.outcome} />. <span>added {when(e.addedAt)}</span></p>
        {#if e.note}<p class="snippet">{e.note}</p>{/if}
        <button type="button" onclick={() => model.remove(e.item.id, e.item.title)}><span>Remove<span class="visually-hidden"> “{e.item.title}”</span> from collection</span></button>
      </li>
    {/each}
  </ul>
```

(Keep today's lower-case "added <date>": D2 keeps the words, and the parity list checks them.)

- [ ] **Step 2: The layouts**

`CollectionsQuiet.svelte`:

```svelte
<script lang="ts">
  import type { CollectionsModel } from '$lib/screens/collections.svelte';
  import CollectionCreate from '$lib/sections/CollectionCreate.svelte';
  import CollectionList from '$lib/sections/CollectionList.svelte';
  let { model }: { model: CollectionsModel } = $props();
</script>

<div class="sl-quiet">
  <h1>Collections</h1>
  <p>Named sets of items, put together by people. An artifact in a collection is kept however old it is.</p>
  <CollectionCreate {model} />
  <CollectionList {model} variant="plain" />
</div>
```

`CollectionQuiet.svelte`:

```svelte
<script lang="ts">
  import type { CollectionModel } from '$lib/screens/collections.svelte';
  import CollectionActions from '$lib/sections/CollectionActions.svelte';
  import CollectionEntries from '$lib/sections/CollectionEntries.svelte';
  let { model }: { model: CollectionModel } = $props();
  const c = $derived(model.c!);
</script>

<div class="sl-quiet">
  <p><a class="sl-back" href="/collections">← Collections</a></p>
  <h1>{c.name}</h1>
  {#if c.description}<p class="body">{c.description}</p>{/if}
  <p class="muted">{model.meta}</p>
  <CollectionActions {model} />
  <CollectionEntries {model} variant="plain" />
</div>
```

Registry: `collections.quiet`, `collection.quiet`.

- [ ] **Step 3: Run the tests** (unit, typecheck, `-g quiet` e2e) → all pass.

- [ ] **Step 4: Commit**

```bash
git add -A apps/web/src
git commit -m "Quiet: collections and a collection as plain lists" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01XwhK8QQtRh5hPEfqY5Arp8"
```

---

### Task 27: Ship phase 4, and close the loop

- [ ] **Step 1:** As Task 19 for Quiet: all green, PR "Superlibrary on vibekit: phase 4 (Quiet layouts)", CI green, look at `quiet-*` screenshots, merge, `gh run watch`, live check in Quiet (desktop and phone; the time of day off by default; keyboard only: Tab through home, an item and a collection without a trap).
- [ ] **Step 2:** With all four phases live, the registry reads `{ daylight, paper, studio, quiet }` for all four screens and `ROWS` is `{ cards, index, table, plain }`: confirm with `grep -n "daylight:" apps/web/src/lib/layouts/registry.ts`.
- [ ] **Step 3:** Follow-ups to record in the product backlog (not this plan): Linux screenshot baselines and `PW_VISUAL=1` in CI (spec D10/R6); passing the vibe to the content viewer (`/_view`, R4); the appearance in the Accounts profile and a `.superjackfruit.com` cookie when the products move under it (R9); per-vibe wordings through a reviewed copy catalogue (D2).

---

## CI and deploy notes

- **Must be green on every PR:** `test` (`pnpm install --frozen-lockfile`, `pnpm typecheck`, `pnpm test` across packages) and `e2e` (Playwright chromium + webkit against the real local stack). Branch protection is not enforced on `main`, so check `gh pr checks` before merging.
- **Lockfile:** Tasks 1, 5 and 14 change `pnpm-lock.yaml` (vibekit tarball and its npm dependencies, smol-toml removed, axe added). CI installs with `--frozen-lockfile`; commit the lockfile with the task that changes it.
- **Deploy:** a push to `main` (the merge) runs `deploy-api` → `deploy-web` (and `deploy-content`) only after `test` and `e2e` pass; `deploy-web` builds `apps/web` and runs `wrangler pages deploy apps/web/build --project-name=superlibrary-web --branch=main` from a neutral directory. No manual step. A newer push to `main` makes an older run skip its deploy (the "fresh" guard).
- **Verify live:** spec §9.1 (curl for `vk_appearance` and no Google Fonts; then the browser and the iPhone).
- **Rollback:** revert the merge commit on `main`; CI redeploys the previous web build. The cookie is harmless to the old app (it ignores it); the old app's `superlibrary:theme` key may have been removed by the migration, so a person who had chosen Light or Dark sees the old default (System) until they choose again.

## Self-review (done while writing)

- **Spec coverage:** goals §1 → Tasks 1–27; decisions D1 (Task 3 migration, Task 6 options), D2 (Global Constraints; parity lists use today's words), D3/D4 (Tasks 2, 4, 12), D5 (Task 2), D6 (Task 3), D7 (Task 3 `chooseVibe`), D8 (Task 7 `makerOf`), D9 (Tasks 8, 10, 11 sections), D10 (Task 14), D11 (Task 5), D12 (accepted; Review Focus 2 covers the viewer). Screens §5.1–5.5 → Tasks 8, 10, 11, 12 (Daylight and adaptive), 16–18 (Paper), 20–22 (Studio), 24–26 (Quiet). Parity §6 → Task 13 (+ every later task). Tests §8.2 → Tasks 1–3, 6–11, 13, 14, 16, 17, 20, 24. Rollout §9 → Tasks 15, 19, 23, 27.
- **Type consistency:** `LibraryModel`, `ItemModel`, `CollectionsModel`, `CollectionModel` are the only `model` types layouts take; `Layouts<C>` and `pickLayout` are defined once (Task 7); `ROWS`/`RowVariant` live in `rows.ts` and are re-exported by the registry; section `variant` unions grow by one value per phase and default to the Daylight value.
- **Known judgement calls for the implementer:** the exact pixel values in the CSS are starting points (the tokens, the targets, the budgets and the no-sideways rule are not); if axe or the title budget fails, adjust spacing, never the threshold or the parity list.
