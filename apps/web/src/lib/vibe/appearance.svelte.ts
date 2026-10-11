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
    // Numbers only: Math.abs(null) is 0 and Math.abs("12") is 12, so a junk place would pass a range check alone.
    if (p && Number.isFinite(p.latitude) && Number.isFinite(p.longitude) && Math.abs(p.latitude) <= 90 && Math.abs(p.longitude) <= 180) return { latitude: p.latitude, longitude: p.longitude };
  } catch { /* junk: no place */ }
  return undefined;
}

export function phaseFor(a: Appearance, now: Date): Phase {
  const p = a.useLocation ? place() : undefined;
  return phaseAt(now, p ? { place: p } : { timeZone: timeZone() });
}

function saveCookie(doc: Document, a: Appearance): void {
  try { // Host-only (no domain) on this product's host; Secure only on https.
    doc.cookie = appearanceCookie(a, { secure: doc.location?.protocol === 'https:' }); } catch { /* cookies blocked: this page only */ }
}

/** The model: what the page should look like. Updated at once, never inside a view transition. */
function decide(a: Appearance, now: Date): Record<string, string> {
  const phase = phaseFor(a, now);
  const attrs = htmlAttributes(a, phase);
  look.appearance = a;
  look.phase = phase;
  look.theme = attrs['data-theme'];
  look.now = now;
  return attrs;
}

/** The DOM: the data-* attributes on <html>, and the browser chrome colour. */
function draw(doc: Document, attrs: Record<string, string>): void {
  for (const [k, v] of Object.entries(attrs)) doc.documentElement.setAttribute(k, v);
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
    }
  }
  draw(doc, decide(appearance, now()));
  // Another tab may have changed the cookie: follow it.
  const tick = () => { const c = fromCookie(doc); draw(doc, decide(c.present ? c.appearance : look.appearance, now())); };
  const timer = setInterval(tick, 60_000);
  const onVisible = () => { if (doc.visibilityState === 'visible') tick(); };
  doc.addEventListener('visibilitychange', onVisible);
  return () => { clearInterval(timer); doc.removeEventListener('visibilitychange', onVisible); };
}

export function setAppearance(next: Appearance, doc: Document = document): void {
  saveCookie(doc, next);
  // The model and the cookie change at once; only the paint waits for a view transition, so a quick
  // second choice cannot be undone by the first one's pending paint.
  const attrs = decide(next, new Date());
  const apply = () => draw(doc, attrs);
  const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const start = (doc as Document & { startViewTransition?: (cb: () => void) => unknown }).startViewTransition;
  if (start && !reduce) start.call(doc, apply);
  else apply();
}

export const chooseVibe = (vibe: Vibe) => setAppearance({ ...look.appearance, vibe, timeStrength: defaultTimeStrength(vibe) });
export const chooseTheme = (theme: ThemePreference) => setAppearance({ ...look.appearance, theme });
export const chooseStrength = (timeStrength: TimeStrength) => setAppearance({ ...look.appearance, timeStrength });

let locationAsk = 0;
/**
 * Turn the location on (asks the browser once) or off. Resolves whether it is on afterwards, or null when a later
 * choice superseded this one (the caller must then leave the screen alone). A later
 * choice wins: an answer that arrives after the person chose again is dropped, so unchecking while
 * the prompt is open cannot be undone by a late "allow".
 */
export async function chooseLocation(on: boolean): Promise<boolean | null> {
  const ask = ++locationAsk;
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
  if (ask !== locationAsk) return null;
  if (got) write(PLACE_KEY, JSON.stringify(got));
  setAppearance({ ...look.appearance, useLocation: got !== null });
  return got !== null;
}
