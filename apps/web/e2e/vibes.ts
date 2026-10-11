import { expect, type APIRequestContext, type BrowserContext, type Page } from '@playwright/test';
import { APP, DEV } from './helpers';

export const VIBES_E2E = ['daylight', 'paper', 'studio', 'quiet'] as const;
export type VibeName = (typeof VIBES_E2E)[number];
const API = 'http://localhost:8787';

/**
 * The person's appearance, as the vk_appearance cookie the head script reads. Host-only (no Domain) and
 * not Secure: Playwright's WebKit rejects Secure cookies over http://localhost.
 */
export async function useAppearance(context: BrowserContext, vibe: VibeName, theme: 'sun' | 'light' | 'dark', strength: 'strong' | 'subtle' | 'off' = 'strong') {
  await context.addCookies([{ name: 'vk_appearance', value: `${vibe}.${theme}.${strength}.0`, url: APP }]);
}

/** Open every Paper enclosure and every <details>: what a person can open, the test opens. */
export async function openEnclosures(page: Page) {
  // The locator is live: each click takes one out of the set, so always click the first (`.all()` would index past the end).
  const closed = page.locator('button.sl-enclosure-toggle[aria-expanded="false"]');
  for (let n = await closed.count(); n > 0; n--) await closed.first().click();
  await expect(closed).toHaveCount(0);
  await page.evaluate(() => { for (const d of document.querySelectorAll('details')) d.open = true; });
  // Paper fades an opened enclosure in: measure what a person reads once it has settled, not a half-faded frame.
  await page.evaluate(() => Promise.all(document.getAnimations().filter((a) => a.effect?.getComputedTiming().iterations !== Infinity).map((a) => a.finished.catch(() => undefined))));
}

export async function seedCollection(request: APIRequestContext, name: string, itemId: string): Promise<string> {
  const made = await request.post(`${API}/api/v1/collections`, { headers: DEV, data: { name, description: 'For the vibe checks' } });
  if (!made.ok()) throw new Error(`collection: ${made.status()} ${await made.text()}`);
  const { id } = (await made.json()) as { id: string };
  const added = await request.post(`${API}/api/v1/collections/${id}/items`, { headers: DEV, data: { itemId } });
  if (!added.ok()) throw new Error(`add: ${added.status()} ${await added.text()}`);
  return id;
}
