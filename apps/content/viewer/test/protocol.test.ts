import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyTheme, listenForTheme, reportHeight, themeFromQuery } from '../protocol';

const HOST = 'https://app.superlibrary.dev';
afterEach(() => vi.restoreAllMocks());

describe('frame protocol (spec §9, Embedding)', () => {
  it('reports its height to the signed host origin only', () => {
    (window as unknown as { ResizeObserver: unknown }).ResizeObserver = class { observe() {} disconnect() {} };
    const post = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => {});
    reportHeight(HOST);
    expect(post).toHaveBeenCalledWith({ type: 'superlibrary:resize', height: expect.any(Number) }, HOST);
    expect(post.mock.calls.every(([, target]) => (target as unknown) === HOST)).toBe(true);
  });

  it('reports the height of the content, not of the frame it was given, so a frame can shrink', () => {
    (window as unknown as { ResizeObserver: unknown }).ResizeObserver = class { observe() {} disconnect() {} };
    const post = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => {});
    const root = document.documentElement;
    // A frame the host grew to 20,000px for the last file: scrollHeight is never less than the viewport.
    vi.spyOn(root, 'scrollHeight', 'get').mockReturnValue(20000);
    vi.spyOn(root, 'getBoundingClientRect').mockReturnValue({ height: 300.2 } as DOMRect);
    reportHeight(HOST);
    expect(post).toHaveBeenLastCalledWith({ type: 'superlibrary:resize', height: 301 }, HOST);
  });

  it('applies a theme from the host and ignores every other origin and every malformed message', () => {
    const apply = vi.fn();
    listenForTheme(HOST, apply);
    window.dispatchEvent(new MessageEvent('message', { origin: 'https://evil.test', data: { type: 'superlibrary:theme', theme: 'dark' } }));
    window.dispatchEvent(new MessageEvent('message', { origin: HOST, data: { type: 'superlibrary:theme', theme: 'purple' } }));
    window.dispatchEvent(new MessageEvent('message', { origin: HOST, data: 'superlibrary:theme' }));
    expect(apply).not.toHaveBeenCalled();
    window.dispatchEvent(new MessageEvent('message', { origin: HOST, data: { type: 'superlibrary:theme', theme: 'dark' } }));
    expect(apply).toHaveBeenCalledWith('dark');
    window.dispatchEvent(new MessageEvent('message', { origin: HOST, data: { type: 'superlibrary:theme', theme: 'system' } }));
    expect(apply).toHaveBeenLastCalledWith('system');
  });
});

describe('theme (operator: light, dark, or the system’s)', () => {
  it('light and dark pin the theme; system hands it back to prefers-color-scheme', () => {
    const root = document.documentElement;
    applyTheme('dark');
    expect(root.dataset.theme).toBe('dark');
    applyTheme('light');
    expect(root.dataset.theme).toBe('light');
    applyTheme('system');
    expect(root.hasAttribute('data-theme')).toBe(false);
  });

  it('an initial theme may ride on the frame URL; anything else is ignored', () => {
    expect(themeFromQuery('?sig=x&theme=dark')).toBe('dark');
    expect(themeFromQuery('?sig=x&theme=system')).toBe('system');
    expect(themeFromQuery('?sig=x&theme=purple')).toBeNull();
    expect(themeFromQuery('?sig=x')).toBeNull();
  });

  it('with no theme set, the stylesheet follows the system', () => {
    const css = readFileSync(resolve('viewer/viewer.css'), 'utf8') // vitest runs from apps/content;
    // The page's own colours turn dark with the system unless the host pinned light.
    expect(css).toMatch(/@media \(prefers-color-scheme: dark\) \{ :root:not\(\[data-theme='light'\]\) \{ --fg: #f5f5f7; --bg: #1c1c1e;/);
  });
});
