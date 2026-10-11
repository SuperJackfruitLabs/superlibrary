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

import { formatBytes } from '@superlibrary/embed';
import { when } from '$lib/item';
import { FIX, PARITY, VERSIONS, type Need } from '$lib/screens/parity.fixture';
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

// ---- What a person can see, read the way a browser reads it -------------------------------------
// jsdom has no layout, so every element boundary counts as a break between words: a browser lays
// these out as separate boxes (flex items, the absolutely positioned visually-hidden helper), so
// "Revoke" + <span class="visually-hidden">version 2</span> reads "Revoke version 2", as the e2e
// specs see it, and an outcome pill beside "Artifact" does not read "CompletedArtifact".
const norm = (s: string) => s.replace(/\s+/g, ' ').trim();
/** The text a person can see in `root`, normalised (anything inside [hidden] does not count). */
function textOf(root: Node, { skipControls = false } = {}): string {
  const out: string[] = [];
  const walk = (n: Node) => {
    if (n instanceof HTMLElement && n.hidden) return;
    if (n.nodeType === Node.TEXT_NODE) { out.push(n.textContent ?? ''); return; }
    if (!(n instanceof Element)) return;
    if (skipControls && n.matches('input, select, textarea')) return;
    out.push(' ');
    n.childNodes.forEach(walk);
    out.push(' ');
  };
  walk(root);
  return norm(out.join(''));
}
const WORD = /[\p{L}\p{N}_]/u;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** Whether `phrase` is in `text` as whole words: "Run" is not in "Running", "Item" is not in "Items". */
function has(text: string, phrase: string): boolean {
  const p = norm(phrase);
  const re = new RegExp(`${WORD.test(p[0]!) ? '(?<![\\p{L}\\p{N}_])' : ''}${esc(p)}${WORD.test(p[p.length - 1]!) ? '(?![\\p{L}\\p{N}_])' : ''}`, 'u');
  return re.test(text);
}
const shown = (el: Element) => el.closest('[hidden]') === null;

/** An element's accessible name, enough of the algorithm for this app's markup. */
function nameOf(el: Element): string {
  const by = el.getAttribute('aria-labelledby');
  if (by) return norm(by.split(/\s+/).map((id) => { const t = document.getElementById(id); return t ? textOf(t) : ''; }).join(' '));
  const label = el.getAttribute('aria-label');
  if (label) return norm(label);
  if (el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) {
    if (el.labels?.length) return norm([...el.labels].map((l) => textOf(l, { skipControls: true })).join(' '));
    if (el instanceof HTMLInputElement && ['submit', 'button'].includes(el.type)) return norm(el.value);
    return norm(el.getAttribute('title') ?? el.getAttribute('placeholder') ?? '');
  }
  if (el instanceof HTMLFieldSetElement) { const legend = el.querySelector(':scope > legend'); return legend ? textOf(legend) : ''; }
  return textOf(el);
}
const ROLE_OF: Record<string, string> = {
  button: 'button, input[type="submit"], input[type="button"], summary, [role="button"]',
  link: 'a[href], [role="link"]',
  combobox: 'select:not([multiple]), [role="combobox"]',
  searchbox: 'input[type="search"], [role="searchbox"]',
  checkbox: 'input[type="checkbox"], [role="checkbox"]',
  group: 'fieldset, [role="group"]',
  heading: 'h1, h2, h3, h4, h5, h6, [role="heading"]',
  /** Any form field (input of any type, select, textarea), by its label. */
  field: 'input:not([type="hidden"]), select, textarea',
};
const byRole = (role: string, name: string) => [...document.querySelectorAll(ROLE_OF[role] ?? `[role="${role}"]`)].filter((el) => shown(el) && nameOf(el) === norm(name));

/** What of `needs` the page does not show; each entry says what and how it was looked for. */
function missing(needs: readonly Need[]): string[] {
  const text = textOf(document.body);
  return needs.flatMap((n): string[] => {
    if (typeof n === 'string') return has(text, n) ? [] : [`text: ${n}`];
    if ('css' in n) { const el = document.querySelector(n.css); return el && shown(el) ? [] : [`element: ${n.what} (${n.css})`]; }
    if ('heading' in n) {
      const ok = byRole('heading', n.heading).some((h) => n.level === undefined || h.tagName === `H${n.level}` || h.getAttribute('aria-level') === String(n.level));
      return ok ? [] : [`heading${n.level ? ` (h${n.level})` : ''}: ${n.heading}`];
    }
    if ('role' in n) {
      const els = byRole(n.role, n.name);
      if (!els.length) return [`${n.role}: ${n.name}`];
      const lacking = (n.options ?? []).filter((o) => !els.some((el) => [...el.querySelectorAll('option')].some((op) => norm(op.textContent ?? '') === norm(o))));
      return lacking.map((o) => `${n.role} ${n.name}: option ${o}`);
    }
    if ('label' in n) {
      // A label element whose whole text is the label, with the value in the element right after it
      // (a <dt> and its <dd>, a <th> and its <td>, a label span and its value span).
      const ok = [...document.body.querySelectorAll('*')].some((el) => shown(el) && textOf(el) === norm(n.label) && el.nextElementSibling !== null && shown(el.nextElementSibling) && has(textOf(el.nextElementSibling), n.value));
      return ok ? [] : [`row: ${n.label} → ${n.value}`];
    }
    if ('plain' in n) {
      // There as text, and not a link: the element whose whole text it is has no link around it.
      const ok = [...document.body.querySelectorAll('*')].some((el) => shown(el) && textOf(el) === norm(n.plain) && !el.closest('a[href], [role="link"]'));
      return ok && !byRole('link', n.plain).length ? [] : [`plain text (not a link): ${n.plain}`];
    }
    // Phrases that belong together: one element matching `in` shows every one of them. Only the
    // innermost matches count: a wrapper holding several rows is not one row.
    const rows = [...document.querySelectorAll(n.in)].filter((el) => !el.querySelector(n.in));
    const ok = rows.some((el) => shown(el) && n.together.every((p) => has(textOf(el), p)));
    return ok ? [] : [`together in ${n.in}: ${n.together.join(' | ')}`];
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

// The by-parts fixture rows (Studio's table) must not hide a regression of the joined wording the list variant promises.
describe.each(['daylight', 'paper'] as const)('%s: a version row reads uploaded, size and files as one line', (vibe) => {
  let c: ReturnType<typeof mount> | null = null;
  beforeEach(() => { look.appearance = { ...look.appearance, vibe }; });
  afterEach(() => { if (c) unmount(c); c = null; document.body.innerHTML = ''; });
  it('v2 and v1', async () => {
    c = mount(ItemView, { target: document.body, props: { itemId: FIX.artifactId } });
    await settle(); openAll(); await settle();
    const text = document.body.textContent?.replace(/\s+/g, ' ') ?? '';
    expect(text).toContain(`${when(VERSIONS[0]!.createdAt)} · ${formatBytes(2048)} · 2 files`);
    expect(text).toContain(`${when(VERSIONS[1]!.createdAt)} · ${formatBytes(512)} · 1 file`);
  });
});

// The guard itself: a page that drops one thing must be named, however short the word (revert-proof).
describe('the parity check fails when something is dropped', () => {
  let c: ReturnType<typeof mount> | null = null;
  beforeEach(() => { look.appearance = { ...look.appearance, vibe: 'daylight' }; });
  afterEach(() => { if (c) unmount(c); c = null; document.body.innerHTML = ''; });
  const openScreen = async (i: number) => { c = SCREENS[i]![1](); await settle(); openAll(); await settle(); };
  const els = (css: string, text: string) => [...document.querySelectorAll(css)].filter((e) => e.textContent?.trim() === text);

  it('whole words only: "Item" is not in "Items", "Run" is not in "Running", "Revoke" is not in "Revoked"', () => {
    expect(has('Items here', 'Item')).toBe(false);
    expect(has('Running', 'Run')).toBe(false);
    expect(has('Revoked', 'Revoke')).toBe(false);
    expect(has('v12', 'v1')).toBe(false);
    expect(has('Size 2.0 KB (2,048 bytes)', 'bytes)')).toBe(true);
    expect(has('the Item, then', 'Item')).toBe(true);
  });

  it('the artifact page passes as drawn', async () => {
    await openScreen(1);
    expect(missing(PARITY.artifact)).toEqual([]);
  });

  it('a dropped short label (the Kind and Run rows) is named, though the words appear elsewhere', async () => {
    await openScreen(1);
    for (const dt of [...els('dt', 'Kind'), ...els('dt', 'Run')]) dt.remove();
    expect(missing(PARITY.artifact)).toEqual(['row: Kind → Folder, opens on a Markdown', 'row: Run → run_00000000000000r1']);
  });

  it('a value moved away from its label is named', async () => {
    await openScreen(1);
    const dd = els('dt', 'Item')[0]!.nextElementSibling!;
    dd.parentElement!.append(dd);
    expect(missing(PARITY.artifact)).toEqual(['row: Item → Artifact']);
  });

  it('a dropped heading (Versions, and Revoke while "Revoke this item" stays) is named', async () => {
    await openScreen(1);
    for (const h of [...els('h2', 'Versions'), ...els('h2', 'Revoke')]) h.remove();
    expect(missing(PARITY.artifact)).toEqual(['heading: Versions', 'heading: Revoke']);
  });

  it('a heading turned into plain text is named', async () => {
    await openScreen(1);
    const h = els('h2', 'Provenance')[0]!;
    const p = document.createElement('p');
    p.textContent = h.textContent;
    h.replaceWith(p);
    expect(missing(PARITY.artifact)).toEqual(['heading: Provenance']);
  });

  it('a hidden part counts as dropped', async () => {
    await openScreen(1);
    (els('button', 'Save caption')[0] as HTMLElement).hidden = true;
    expect(missing(PARITY.artifact)).toEqual(['button: Save caption']);
  });

  it('a filter that loses its label, or an option, is named', async () => {
    await openScreen(0);
    const kind = [...document.querySelectorAll('label')].find((l) => l.firstChild?.textContent?.trim() === 'Kind')!;
    kind.firstChild!.textContent = '';
    [...document.querySelectorAll('option')].find((o) => o.textContent === 'This week')!.remove();
    expect(missing(PARITY.library)).toEqual(['combobox: Kind', 'combobox Active: option This week']);
  });

  it('a timeline entry whose detail moves to another entry is named', async () => {
    await openScreen(2);
    const detail = [...document.querySelectorAll('ol.timeline p')].find((p) => p.textContent === 'Draft ready')!;
    document.querySelector('ol.timeline > li')!.append(detail);
    expect(missing(PARITY.record)).toEqual([expect.stringMatching(/^together in ol\.timeline > li: draft · attempt 1 · completed \| /)]);
  });

  it('header facts dropped from the header are named, though Provenance and the delete-date panel still say them', async () => {
    await openScreen(1);
    const meta = document.querySelector('h1')!.parentElement!;
    for (const s of [...meta.querySelectorAll('span')].filter((e) => e.textContent === 'Everyone in the workspace' || e.textContent?.startsWith('deleted on'))) s.remove();
    expect(missing(PARITY.artifact)).toEqual([expect.stringMatching(/^together in :has\(> h1\): Parity report \| Completed \| v2 \(latest\) \| Everyone in the workspace \| deleted on /)]);
  });

  it('a wrapper around several rows is not one row: "Revoked" moved to v2 is named', async () => {
    await openScreen(1);
    const list = document.querySelector('ul.versions')!;
    const wrap = document.createElement('ol');
    const outer = document.createElement('li');
    list.replaceWith(wrap);
    wrap.append(outer);
    outer.append(list);
    const [v2, v1] = [...list.querySelectorAll(':scope > li')];
    v2!.append(els('span', 'Revoked')[0]!);
    expect(v1!.textContent).not.toContain('Revoked');
    expect(missing(PARITY.artifact)).toEqual([expect.stringMatching(/^together in li, tr: v1 \| /)]);
  });

  it('a wrong size and a revoked version shown as a link are named', async () => {
    await openScreen(1);
    const size = els('dt', 'Size')[0]!.nextElementSibling!;
    size.textContent = size.textContent!.replace('2,048', '2048');
    const v1 = els('span', 'v1')[0]!;
    const a = document.createElement('a');
    a.href = '/a/x?v=1';
    v1.replaceWith(a);
    a.append(v1);
    expect(missing(PARITY.artifact)).toEqual(['plain text (not a link): v1', expect.stringMatching(/^row: Size → /)]);
  });

  it('a collection entry with the wrong added date, or without its record link, is named', async () => {
    await openScreen(4);
    const small = [...document.querySelectorAll('small')].find((e) => e.textContent?.startsWith('added'))!;
    small.textContent = 'added Oct 3, 2026';
    document.querySelector(`a[href="/a/${FIX.recordId}"]`)!.removeAttribute('href');
    const out = missing(PARITY.collection);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatch(/^together in .*: Parity report \| Completed \| added /);
    expect(out[1]).toBe(`element: the record entry links to its item (a[href="/a/${FIX.recordId}"])`);
  });
});
