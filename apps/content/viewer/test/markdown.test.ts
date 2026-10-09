import { describe, expect, it } from 'vitest';
import type { ViewerData } from '@superlibrary/contract';
import { markdownHtml, renderMarkdown, resolveRelative } from '../render/markdown';

describe('resolveRelative', () => {
  it('resolves against the file’s folder, refuses to leave the root, and leaves absolute links alone', () => {
    expect(resolveRelative('docs/guide.md', 'img/a b.png')).toBe('docs/img/a b.png');
    expect(resolveRelative('docs/guide.md', '../logo.svg')).toBe('logo.svg');
    expect(resolveRelative('docs/guide.md', './x%20y.png')).toBe('docs/x y.png');
    expect(resolveRelative('guide.md', '../../etc/passwd')).toBeNull();
    for (const abs of ['https://example.com/a.png', '//cdn.test/a.png', 'data:image/png;base64,AA', '#top']) expect(resolveRelative('a.md', abs)).toBeNull();
  });
});

describe('markdown (spec §9: tables, task lists, code, Mermaid, images from the same folder)', () => {
  it('is sanitized: no script, no event handlers, no javascript: links', () => {
    const html = markdownHtml('<script>alert(1)</script>\n\n<img src=x onerror="alert(1)">\n\n[x](javascript:alert(1))');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('onerror');
    expect(html).not.toContain('javascript:');
  });

  it('renders GFM tables and task lists', () => {
    const html = markdownHtml('| a | b |\n|---|---|\n| 1 | 2 |\n\n- [x] done\n- [ ] todo\n');
    expect(html).toContain('<table>');
    expect(html).toMatch(/<input[^>]*checked[^>]*type="checkbox"|<input[^>]*type="checkbox"[^>]*checked/);
  });

  it('a relative image with a space resolves to the signed base, segment-encoded', async () => {
    const el = document.createElement('main');
    // Angle brackets let a Markdown link destination hold a space; %23 is the file's own '#'.
    const d = { view: 'markdown', path: 'docs/guide.md', name: 'guide.md', mediaType: 'text/markdown', bytes: 1, sha256: 'a'.repeat(64), rawUrl: '', baseUrl: 'https://c.test/s/T/', host: 'https://app.test', text: '![logo](<img/a b%231.png>)\n\n```ts\nconst x = 1;\n```\n' } as ViewerData;
    await renderMarkdown(el, d);
    expect(el.querySelector('img')!.getAttribute('src')).toBe('https://c.test/s/T/docs/img/a%20b%231.png');
    expect(el.querySelector('pre code.hljs')).not.toBeNull();
  });
});

describe('markdown details', () => {
  const base = { view: 'markdown', path: 'docs/guide.md', name: 'guide.md', mediaType: 'text/markdown', bytes: 1, sha256: 'a'.repeat(64), rawUrl: '', baseUrl: 'https://c.test/s/T/', host: 'https://app.test' } as const;

  it('leaves absolute and above-the-root images as written, and escapes a block in an unknown language', async () => {
    const el = document.createElement('main');
    await renderMarkdown(el, { ...base, text: '![a](https://cdn.jsdelivr.net/x.png) ![b](../../up.png)\n\n```nolang\n<b>x</b>\n```\n' } as ViewerData);
    const srcs = [...el.querySelectorAll('img')].map((i) => i.getAttribute('src'));
    expect(srcs).toEqual(['https://cdn.jsdelivr.net/x.png', '../../up.png']);
    expect(el.querySelector('pre code b')).toBeNull();
    expect(el.querySelector('pre code.hljs')!.textContent).toBe('<b>x</b>\n');
  });

  it('a Mermaid block that cannot be drawn stays as source with the reason; the rest of the document shows', async () => {
    const el = document.createElement('main');
    await renderMarkdown(el, { ...base, text: '# Doc\n\n```mermaid\nnot a diagram at all\n```\n\nafter\n' } as ViewerData);
    expect(el.querySelector('h1')!.textContent).toBe('Doc');
    expect(el.querySelector('.note')!.textContent).toMatch(/^This diagram could not be drawn: /);
    expect(el.querySelector('pre code.language-mermaid')!.textContent).toBe('not a diagram at all\n');
    expect(el.textContent).toContain('after');
  });
});
