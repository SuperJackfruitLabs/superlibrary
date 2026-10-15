/**
 * The pack's logo animation (static/brand/logo-motion.js, translucent-v2), loaded on demand.
 *
 * The bundle is a generated classic script that sets `window.SJLLogoMotion`; it is served as a
 * static file and added with a script tag once, so the server render never touches it.
 */
export interface LogoMotionInstance {
  play(): Promise<{ status: 'finished' | 'cancelled' | 'static' | 'destroyed' }>;
  stop(): void;
  destroy(): void;
}
export interface LogoMotionLib {
  create(el: Element, productId: string): LogoMotionInstance;
}

declare global {
  interface Window {
    SJLLogoMotion?: LogoMotionLib;
  }
}

export const LOGO_MOTION_SRC = '/brand/logo-motion.js';
let loading: Promise<LogoMotionLib> | undefined;

export function loadLogoMotion(): Promise<LogoMotionLib> {
  if (window.SJLLogoMotion) return Promise.resolve(window.SJLLogoMotion);
  loading ??= new Promise<LogoMotionLib>((resolve, reject) => {
    const s = document.createElement('script');
    s.src = LOGO_MOTION_SRC;
    s.async = true;
    s.onload = () => (window.SJLLogoMotion ? resolve(window.SJLLogoMotion) : reject(new Error('logo-motion.js did not load')));
    s.onerror = () => {
      loading = undefined;
      reject(new Error('logo-motion.js did not load'));
    };
    document.head.appendChild(s);
  });
  return loading;
}

/** The person asked for less motion: the OS setting, or the app's own `data-motion="reduce"`. */
export function motionReduced(el: Element): boolean {
  return Boolean(globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches) || el.closest('[data-motion="reduce"]') !== null;
}

/** The first-load animation plays once per page session, never again on a later loading screen. */
let introPlayed = false;
export function claimIntro(): boolean {
  if (introPlayed) return false;
  introPlayed = true;
  return true;
}
/** Tests only. */
export function resetIntroForTest(): void {
  introPlayed = false;
  loading = undefined;
}
