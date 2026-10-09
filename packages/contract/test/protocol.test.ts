import { describe, expect, it } from 'vitest';
import { MAX_FRAME_HEIGHT, SOURCE_VIEWS, TEXT_VIEWS, VIEWS, isExpiredMessage, isOpenMessage, isResizeMessage, isThemeMessage, isWebUrl } from '../src/index';

describe('frame protocol guards (spec §9, Embedding)', () => {
  it('a resize carries a finite, non-negative height', () => {
    expect(isResizeMessage({ type: 'superlibrary:resize', height: 640 })).toBe(true);
    expect(isResizeMessage({ type: 'superlibrary:resize', height: 0 })).toBe(true);
    for (const bad of [null, 'superlibrary:resize', { type: 'superlibrary:resize' }, { type: 'superlibrary:resize', height: '640' }, { type: 'superlibrary:resize', height: -1 }, { type: 'superlibrary:resize', height: Infinity }, { type: 'superlibrary:resize', height: NaN }, { type: 'superlibrary:theme', height: 1 }]) {
      expect(isResizeMessage(bad), JSON.stringify(bad)).toBe(false);
    }
    expect(MAX_FRAME_HEIGHT).toBe(20000);
  });

  it('a theme is light, dark or system, and nothing else', () => {
    for (const theme of ['light', 'dark', 'system']) expect(isThemeMessage({ type: 'superlibrary:theme', theme })).toBe(true);
    for (const bad of [null, 'superlibrary:theme', { type: 'superlibrary:theme' }, { type: 'superlibrary:theme', theme: 'purple' }, { type: 'superlibrary:resize', theme: 'dark' }]) {
      expect(isThemeMessage(bad), JSON.stringify(bad)).toBe(false);
    }
  });

  it('view source covers every text-backed kind, HTML included, and nothing that has no text', () => {
    expect([...SOURCE_VIEWS].sort()).toEqual([...TEXT_VIEWS, 'html'].sort());
    for (const v of VIEWS) if (['image', 'pdf', 'audio', 'video', 'download'].includes(v)) expect(SOURCE_VIEWS.has(v), v).toBe(false);
  });

  it('an expired message names the file whose URL ran out', () => {
    expect(isExpiredMessage({ type: 'superlibrary:expired', path: 'docs/a.md' })).toBe(true);
    expect(isExpiredMessage({ type: 'superlibrary:expired', path: '' })).toBe(true);
    for (const bad of [null, 'superlibrary:expired', { type: 'superlibrary:expired' }, { type: 'superlibrary:expired', path: 3 }, { type: 'superlibrary:open', path: 'a' }]) {
      expect(isExpiredMessage(bad), JSON.stringify(bad)).toBe(false);
    }
  });

  it('an open message carries a URL string; only http(s) URLs are web URLs', () => {
    expect(isOpenMessage({ type: 'superlibrary:open', url: 'https://example.com/' })).toBe(true);
    for (const bad of [null, { type: 'superlibrary:open' }, { type: 'superlibrary:open', url: 1 }, { type: 'superlibrary:expired', url: 'https://x.test' }]) {
      expect(isOpenMessage(bad), JSON.stringify(bad)).toBe(false);
    }
    expect(isWebUrl('https://example.com/a?b#c')).toBe(true);
    expect(isWebUrl('http://example.com')).toBe(true);
    for (const bad of ['javascript:alert(1)', 'JAVASCRIPT:alert(1)', ' javascript:alert(1)', 'data:text/html,<p>x', 'vbscript:x', 'file:///etc/passwd', 'mailto:a@b.test', '/relative', 'notes.md', '//example.com', 'blob:https://x.test/1', '']) {
      expect(isWebUrl(bad), bad).toBe(false);
    }
  });
});
