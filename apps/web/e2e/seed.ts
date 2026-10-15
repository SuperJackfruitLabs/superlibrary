/**
 * The catch-up seed (2026-10-15 audit): a library as full and as awkward as a real one, so the
 * loading, fit and motion specs measure real shapes, not an empty test board.
 *
 * 206 items: one with 41 versions, six awkward ones (a 199-character title, a 120-character word
 * with no break in it, `{{y}}`, `<script>`, an Arabic right-to-left title, a 140-character nested
 * file name) and 199 ordinary ones; 205 collections, one holding the awkward items.
 *
 * Idempotent: the "Catch-up seed" collection marks a seeded store (locally the e2e store persists
 * between runs), and a second call reads the ids back instead of uploading again.
 */
import type { APIRequestContext } from '@playwright/test';
import { DEV, uploadViaApi } from './helpers';

const API = 'http://localhost:8787';
export const SEED_COLLECTION = 'Catch-up seed';

export const LONG_TITLE = `${'A quarterly review of every pipeline run, its handoffs, its gates and what each agent made, '.repeat(3)}`.slice(0, 199);
export const LONG_WORD = 'Unbrokenword'.repeat(10);
export const TEMPLATE_TITLE = 'Release notes for {{y}} and {{ version }}';
export const SCRIPT_TITLE = '<script>alert("x")</script> Injection check';
export const ARABIC_TITLE = 'تقرير المراجعة الأسبوعية لخط الإنتاج والوكلاء';
export const NESTED_PATH = `${'reports/quarterly/pipeline-review/agents/handoffs/'.repeat(3)}summary.md`.slice(-140);
export const MANY_VERSIONS_TITLE = 'Design notes, revised forty-one times';

export interface Seed {
  collection: string;
  /** The item with 41 versions. */
  many: string;
  longTitle: string;
  longWord: string;
  template: string;
  script: string;
  arabic: string;
  nested: string;
}

async function json<T>(res: { ok(): boolean; status(): number; text(): Promise<string>; json(): Promise<unknown> }, what: string): Promise<T> {
  if (!res.ok()) throw new Error(`${what}: ${res.status()} ${await res.text()}`);
  return (await res.json()) as T;
}

async function inParallel<T>(n: number, jobs: (() => Promise<T>)[]): Promise<T[]> {
  const out: T[] = new Array(jobs.length);
  let next = 0;
  await Promise.all(Array.from({ length: n }, async () => {
    while (next < jobs.length) { const i = next++; out[i] = await jobs[i]!(); }
  }));
  return out;
}

function fromCollection(id: string, entries: { item: { id: string; title: string } }[]): Seed {
  const by = (t: string) => {
    const e = entries.find((x) => x.item.title === t);
    if (!e) throw new Error(`seed: "${t.slice(0, 30)}" is missing from the seed collection`);
    return e.item.id;
  };
  return {
    collection: id, many: by(MANY_VERSIONS_TITLE), longTitle: by(LONG_TITLE), longWord: by(`${LONG_WORD} notes`), template: by(TEMPLATE_TITLE),
    script: by(SCRIPT_TITLE), arabic: by(ARABIC_TITLE), nested: by('A file deep in its folders'),
  };
}

export async function seedCatchUp(request: APIRequestContext): Promise<Seed> {
  const list = await json<{ collections: { id: string; name: string }[] }>(await request.get(`${API}/api/v1/collections`, { headers: DEV }), 'collections');
  const marked = list.collections.find((c) => c.name === SEED_COLLECTION);
  if (marked) {
    const c = await json<{ entries: { item: { id: string; title: string } }[] }>(await request.get(`${API}/api/v1/collections/${marked.id}`, { headers: DEV }), 'seed collection');
    return fromCollection(marked.id, c.entries);
  }

  // The item with 41 versions: one upload, then forty new versions of it.
  const many = await uploadViaApi(request, [{ path: 'notes.md', body: '# Design notes\n\nVersion 1.' }], { title: MANY_VERSIONS_TITLE });
  for (let v = 2; v <= 41; v++) await uploadViaApi(request, [{ path: 'notes.md', body: `# Design notes\n\nVersion ${v}.` }], { item: many.itemId, title: MANY_VERSIONS_TITLE });

  const awkward = await inParallel(3, [
    () => uploadViaApi(request, [{ path: 'review.md', body: `# ${LONG_TITLE}\n\nThe longest title a person might type.` }], { title: LONG_TITLE }),
    () => uploadViaApi(request, [{ path: 'word.md', body: `# ${LONG_WORD}\n\n${LONG_WORD}` }], { title: `${LONG_WORD} notes` }),
    () => uploadViaApi(request, [{ path: 'template.md', body: '# {{y}}\n\nA template left unfilled.' }], { title: TEMPLATE_TITLE }),
    () => uploadViaApi(request, [{ path: 'script.md', body: '# <script>alert("x")</script>\n\nMarkup as text.' }], { title: SCRIPT_TITLE }),
    () => uploadViaApi(request, [{ path: 'arabic.md', body: `# ${ARABIC_TITLE}\n\nنص عربي.` }], { title: ARABIC_TITLE }),
    () => uploadViaApi(request, [{ path: NESTED_PATH, body: '# Deep\n\nA file deep in its folders.' }], { title: 'A file deep in its folders' }),
  ]);

  // 199 ordinary items: 206 in all.
  const topics = ['Launch checklist', 'Onboarding guide', 'Pipeline retrospective', 'Agent handoff summary', 'Design review', 'Incident write-up', 'Board digest', 'Research notes'];
  await inParallel(6, Array.from({ length: 199 }, (_, i) => () => uploadViaApi(request, [{ path: `doc-${i}.md`, body: `# ${topics[i % topics.length]} ${i + 1}\n\nSeeded.` }], { title: `${topics[i % topics.length]} ${i + 1}` })));

  // 205 collections: the seed's own (with the awkward items and the many-versioned one), and 204 more.
  const made = await json<{ id: string }>(await request.post(`${API}/api/v1/collections`, { headers: DEV, data: { name: SEED_COLLECTION, description: 'Awkward titles and many versions, for the layout checks.' } }), 'seed collection');
  for (const id of [many.itemId, ...awkward.map((a) => a.itemId)]) {
    await json(await request.post(`${API}/api/v1/collections/${made.id}/items`, { headers: DEV, data: { itemId: id } }), 'add to seed collection');
  }
  await inParallel(6, Array.from({ length: 204 }, (_, i) => async () => {
    await json(await request.post(`${API}/api/v1/collections`, { headers: DEV, data: { name: `Seeded collection ${String(i + 1).padStart(3, '0')}`, description: i % 3 === 0 ? 'Gathered for the weekly review of what the agents made and how it went.' : '' } }), 'collection');
  }));

  const c = await json<{ entries: { item: { id: string; title: string } }[] }>(await request.get(`${API}/api/v1/collections/${made.id}`, { headers: DEV }), 'seed collection');
  return fromCollection(made.id, c.entries);
}
