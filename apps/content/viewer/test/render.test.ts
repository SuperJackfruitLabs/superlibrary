import { describe, expect, it } from 'vitest';
import type { ViewerData } from '@superlibrary/contract';
import { render } from '../render';

const base = { name: 'f', mediaType: 'text/plain', bytes: 1, sha256: 'a'.repeat(64), rawUrl: 'https://c.test/s/t/f', baseUrl: 'https://c.test/s/t/', host: 'https://app.test' };
const mount = async (d: Partial<ViewerData>) => {
  const el = document.createElement('main');
  await render(el, { ...base, path: 'f', view: 'text', ...d } as ViewerData);
  return el;
};

describe('render, part 1', () => {
  it('code is highlighted and paged at 2,000 lines', async () => {
    const el = await mount({ view: 'code', path: 'a.ts', text: Array.from({ length: 2500 }, (_, i) => `const x${i} = ${i};`).join('\n') });
    expect(el.querySelector('code.hljs')).not.toBeNull();
    expect(el.querySelector('code')!.textContent!.split('\n')).toHaveLength(2000);
    const more = el.querySelector<HTMLButtonElement>('button.more')!;
    expect(more.hidden).toBe(false);
    more.click();
    expect(el.querySelector('code')!.textContent!.split('\n')).toHaveLength(2500);
    expect(more.hidden).toBe(true);
  });

  it('text that looks like HTML stays text', async () => {
    const el = await mount({ view: 'text', text: '<script>alert(1)</script>' });
    expect(el.querySelector('script')).toBeNull();
    expect(el.textContent).toContain('<script>alert(1)</script>');
  });

  it('JSON, YAML and TOML have a structured view and a raw view; a parse error falls back to raw', async () => {
    for (const [view, text] of [['json', '{"a":[1,2]}'], ['yaml', 'a:\n  - 1\n  - 2\n'], ['toml', 'a = [1, 2]\n']] as const) {
      const el = await mount({ view, text });
      expect(el.querySelector('.tree'), view).not.toBeNull();
      expect(el.querySelector('pre.raw')!.textContent).toBe(text);
    }
    const toml = await mount({ view: 'toml', text: 'when = 1979-05-27T07:32:00Z\nday = 1979-05-27\n' });
    expect([...toml.querySelectorAll('.leaf.date')].map((e) => e.textContent)).toEqual(['1979-05-27T07:32:00.000Z', '1979-05-27']);
    const bad = await mount({ view: 'yaml', text: 'a: [' });
    expect(bad.querySelector('.tree')).toBeNull();
    expect(bad.textContent).toContain('could not be parsed');
  });

  it('CSV is a sortable table of at most 5,000 rows, saying how many were left out', async () => {
    const text = ['n,name', ...Array.from({ length: 6000 }, (_, i) => `${i},row${i}`)].join('\n');
    const el = await mount({ view: 'csv', text });
    expect(el.querySelectorAll('tbody tr')).toHaveLength(5000);
    expect(el.textContent).toContain('Showing the first 5,000 of 6,000 rows');
    el.querySelector<HTMLElement>('th')!.click();
    el.querySelector<HTMLElement>('th')!.click();
    expect(el.querySelector('tbody tr td')!.textContent).toBe('4999');
  });

  it('images zoom; SVG is an <img> with its source, never inline markup; media get native players', async () => {
    const img = await mount({ view: 'image', path: 'p.png' });
    const i = img.querySelector('img')!;
    expect(i.getAttribute('src')).toBe(base.rawUrl);
    i.click();
    expect(i.classList.contains('zoomed')).toBe(true);
    const svg = await mount({ view: 'svg', path: 'd.svg', text: '<svg onload="alert(1)"></svg>' });
    expect(svg.querySelector('svg')).toBeNull();
    expect(svg.querySelector('img')!.getAttribute('src')).toBe(base.rawUrl);
    expect(svg.querySelector('pre')!.textContent).toContain('<svg onload');
    expect((await mount({ view: 'audio' })).querySelector('audio[controls]')).not.toBeNull();
    expect((await mount({ view: 'video' })).querySelector('video[controls]')).not.toBeNull();
  });

  it('anything else is a download card with type, size and hash', async () => {
    const el = await mount({ view: 'download', name: 'a.docx', mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', bytes: 2048 });
    expect(el.textContent).toContain('2.0 KB');
    expect(el.textContent).toContain('a'.repeat(64));
    expect(el.textContent).toContain('wordprocessingml');
  });
});

describe('view source (operator)', () => {
  it('shows the raw text of any text-backed kind as highlighted code, whatever its view', async () => {
    const page = '<!doctype html><script>alert(1)</script><p onclick="x()">hi</p>';
    const html = await mount({ view: 'html', source: true, path: 'site/index.html', text: page });
    expect(html.querySelector('script, p')).toBeNull();
    expect(html.querySelector('code.hljs.language-xml')!.textContent).toBe(page);
    const csv = await mount({ view: 'csv', source: true, path: 'd.csv', text: 'a,b\n1,2' });
    expect(csv.querySelector('table')).toBeNull();
    expect(csv.querySelector('code.hljs')!.textContent).toBe('a,b\n1,2');
    const json = await mount({ view: 'json', source: true, path: 'x.json', text: '{"a":1}' });
    expect(json.querySelector('.tree')).toBeNull();
    expect(json.querySelector('code.hljs.language-json')).not.toBeNull();
    const svg = await mount({ view: 'svg', source: true, path: 'd.svg', text: '<svg onload="alert(1)"></svg>' });
    expect(svg.querySelector('svg, img')).toBeNull();
    expect(svg.querySelector('code.hljs.language-xml')!.textContent).toBe('<svg onload="alert(1)"></svg>');
    const nb = await mount({ view: 'ipynb', source: true, path: 'n.ipynb', text: '{"cells":[]}' });
    expect(nb.querySelector('code.hljs.language-json')).not.toBeNull();
  });
});
