/** Pure pieces of the toolbar: the frame URL, the visibility words, sizes, the remembered theme. */
import { isTheme, type EmbedGrant, type Scope, type Theme } from '@superlibrary/contract';

/** What the frame shows: one file of the grant's version, rendered or as source, in a theme. */
export interface FrameView {
  path: string;
  source: boolean;
  theme: Theme;
}

/**
 * The frame URL for a view. The token signs only item, version, expiry and host, so `path`,
 * `source` and `theme` are plain `/_view` parameters and need no new grant. The entry has no
 * `path`; `system` has no `theme` (it is the frame's default).
 */
export function frameUrl(grant: EmbedGrant, view: FrameView): string {
  const u = new URL(grant.url);
  if (view.path !== grant.entry) u.searchParams.set('path', view.path);
  if (view.source) u.searchParams.set('source', '1');
  if (view.theme !== 'system') u.searchParams.set('theme', view.theme);
  return u.toString();
}

/** What the host knows about who can see the item (the API's `ItemSummary.scope`, plus its rules). */
export interface ShareInfo {
  scope: Scope;
  /**
   * Phase 3: the API reports that the board's readers see a `board:` item. Phase 1 never sets it:
   * a board item is visible only to its uploader until then (plan D11).
   */
  boardVisible?: boolean;
  /** This person may widen it to the workspace: a person (never an agent), the uploader or an owner. */
  canWiden: boolean;
  /** For the system share sheet. */
  title?: string;
}

/** Ruling T14: the words are mapped from the API, honestly for phase 1. */
export function visibilityWords(info: ShareInfo): string {
  if (info.scope === 'workspace') return 'Everyone in the workspace';
  return info.boardVisible ? 'This board' : 'Only you';
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export const THEME_KEY = 'superlibrary:theme';

/** The person's choice on this device. Storage can be missing or throw (private mode, blocked site data). */
export function storedTheme(): Theme | null {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return isTheme(t) ? t : null;
  } catch {
    return null;
  }
}

export function storeTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch {
    // Not remembered; the choice still applies to this mount.
  }
}
