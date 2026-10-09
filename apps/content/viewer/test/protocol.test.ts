import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyTheme, listenForLinks, listenForTheme, reportExpiredMedia, reportHeight, themeFromQuery } from '../protocol';
import { announceExpired } from '../expired';

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

describe('links in rendered files open through the host (PR 3 review: the sandbox has no allow-popups)', () => {
  const BASE = 'https://itm-00000000000000a1.content.test/s/T/';
  const click = (a: Element, init: MouseEventInit = {}) => {
    const ev = new MouseEvent('click', { bubbles: true, cancelable: true, ...init });
    a.dispatchEvent(ev);
    return ev;
  };
  const setup = (html: string) => {
    document.body.innerHTML = `<main id="app">${html}</main>`;
    const post = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => {});
    const stop = listenForLinks(HOST, document.getElementById('app')!);
    return { post, stop };
  };

  it('an http(s) link is posted to the signed host, not followed', () => {
    const { post, stop } = setup('<article class="markdown"><p><a href="https://example.com/x?y=1"><em>go</em></a> <a href="http://example.org">b</a></p></article>');
    const ev = click(document.querySelector('em')!);
    expect(ev.defaultPrevented).toBe(true);
    expect(post).toHaveBeenCalledWith({ type: 'superlibrary:open', url: 'https://example.com/x?y=1' }, HOST);
    click(document.querySelectorAll('a')[1]!, { button: 1 });
    expect(post).toHaveBeenLastCalledWith({ type: 'superlibrary:open', url: 'http://example.org/' }, HOST);
    stop();
  });

  it('a Graphviz node URL (an SVG <a>) is posted the same way', () => {
    const { post, stop } = setup('<figure class="diagram"><svg xmlns="http://www.w3.org/2000/svg"><a href="https://example.com/node"><text>n</text></a><a xlink:href="https://example.com/old" xmlns:xlink="http://www.w3.org/1999/xlink"><text>o</text></a></svg></figure>');
    click(document.querySelector('text')!);
    expect(post).toHaveBeenCalledWith({ type: 'superlibrary:open', url: 'https://example.com/node' }, HOST);
    click(document.querySelectorAll('text')[1]!);
    expect(post).toHaveBeenLastCalledWith({ type: 'superlibrary:open', url: 'https://example.com/old' }, HOST);
    stop();
  });

  it('javascript:, data: and other schemes are neither posted nor followed; in-page anchors and relative links are left alone', () => {
    const { post, stop } = setup('<a id="j" href="javascript:alert(1)">j</a><a id="d" href="data:text/html,x">d</a><a id="m" href="mailto:a@b.test">m</a><a id="h" href="#part">h</a><a id="r" href="other.md">r</a>');
    for (const id of ['j', 'd', 'm']) expect(click(document.getElementById(id)!).defaultPrevented, id).toBe(true);
    for (const id of ['h', 'r']) expect(click(document.getElementById(id)!).defaultPrevented, id).toBe(false);
    expect(post).not.toHaveBeenCalled();
    stop();
  });

  it('a link outside the rendered file is not its business', () => {
    document.body.innerHTML = '<main id="app"></main><a id="out" href="https://example.com/">x</a>';
    const post = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => {});
    const stop = listenForLinks(HOST, document.getElementById('app')!);
    expect(click(document.getElementById('out')!).defaultPrevented).toBe(false);
    expect(post).not.toHaveBeenCalled();
    stop();
  });

  it('a media element whose signed file fails reports the file as expired, decoded; others are ignored', () => {
    document.body.innerHTML = '<main id="app"></main>';
    const post = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => {});
    const stop = reportExpiredMedia(HOST, { baseUrl: BASE });
    const app = document.getElementById('app')!;
    const img = app.appendChild(document.createElement('img'));
    img.src = `${BASE}docs/a%20b.png?x=1`;
    img.dispatchEvent(new Event('error'));
    expect(post).toHaveBeenCalledWith({ type: 'superlibrary:expired', path: 'docs/a b.png' }, HOST);
    const video = app.appendChild(document.createElement('video'));
    video.src = `${BASE}clip.mp4`;
    video.dispatchEvent(new Event('error'));
    expect(post).toHaveBeenLastCalledWith({ type: 'superlibrary:expired', path: 'clip.mp4' }, HOST);
    // Chromium never fails a media element whose range request is refused: Opaque Response
    // Blocking hides the 403, it retries, and only reports 'stalled' (measured on the dev Worker).
    post.mockClear();
    const audio = app.appendChild(document.createElement('audio'));
    audio.src = `${BASE}tone.wav`;
    audio.dispatchEvent(new Event('stalled'));
    expect(post).toHaveBeenCalledWith({ type: 'superlibrary:expired', path: 'tone.wav' }, HOST);
    img.dispatchEvent(new Event('stalled'));
    expect(post).toHaveBeenCalledTimes(1);
    post.mockClear();
    const cdn = app.appendChild(document.createElement('img'));
    cdn.src = 'https://cdn.jsdelivr.net/x.png';
    cdn.dispatchEvent(new Event('error'));
    const script = app.appendChild(document.createElement('script'));
    script.dispatchEvent(new Event('error'));
    expect(post).not.toHaveBeenCalled();
    stop();
  });

  it('the expired page tells the signed host which file ran out', () => {
    document.body.innerHTML = '<script id="sl-expired" type="application/json">{"host":"https://app.superlibrary.dev","path":"docs/a b.html"}</script>';
    const post = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => {});
    announceExpired();
    expect(post).toHaveBeenCalledWith({ type: 'superlibrary:expired', path: 'docs/a b.html' }, HOST);
  });
});
