import { describe, expect, it } from 'vitest';
import { decodeText, sniff } from '../src/guard/sniff';

const bytes = (...xs: number[]) => new Uint8Array(xs);
const text = (s: string) => new TextEncoder().encode(s);
const PNG = bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13);
const PDF = text('%PDF-1.7\n%âãÏÓ\n');

describe('sniff beats extension', () => {
  it('PNG bytes named .html are an image', () => expect(sniff(PNG, 'evil.html')).toMatchObject({ mediaType: 'image/png', view: 'image', text: false }));
  it('HTML bytes named .png are HTML', () => expect(sniff(text('<!doctype html><title>x</title>'), 'photo.png')).toMatchObject({ view: 'html', mediaType: 'text/html; charset=utf-8' }));
  it('PDF bytes named .md are a PDF', () => expect(sniff(PDF, 'notes.md')).toMatchObject({ view: 'pdf', mediaType: 'application/pdf' }));
  it('text named .pdf is text', () => expect(sniff(text('hello'), 'report.pdf')).toMatchObject({ view: 'text', text: true }));
  it('SVG markup named .txt is SVG; a .svg that is not SVG markup is text', () => {
    expect(sniff(text('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), 'a.txt')).toMatchObject({ view: 'svg', mediaType: 'image/svg+xml' });
    expect(sniff(text('just words'), 'a.svg')).toMatchObject({ view: 'text' });
  });
});

// WHATWG MIME Sniffing §7.1, the "HTML" rows: after optional whitespace (and a BOM, which the
// decoder drops), one of these, case-insensitive, then a tag-terminating byte (space or '>').
describe('HTML is recognised by the WHATWG patterns, whatever the extension', () => {
  it('the live case: an index.html that opens with <title> then <style>, no doctype or <html>', () => {
    const page = '<title>Suite audit</title>\n<style>body { margin: 0 }</style>\n<h1>Audit</h1>\n';
    expect(sniff(text(page), 'index.html')).toMatchObject({ view: 'html', mediaType: 'text/html; charset=utf-8' });
  });
  const PATTERNS = ['<!DOCTYPE HTML', '<HTML', '<HEAD', '<SCRIPT', '<IFRAME', '<H1', '<DIV', '<FONT', '<TABLE', '<A', '<STYLE', '<TITLE', '<B', '<BODY', '<BR', '<P', '<!--'];
  it.each(PATTERNS.flatMap((p) => [[p, ' '], [p, '>'], [p.toLowerCase(), '>'], [p.toLowerCase(), ' ']]))('%s followed by "%s"', (p, tt) => {
    expect(sniff(text(`${p}${tt}rest`), 'page.txt')).toMatchObject({ view: 'html', mediaType: 'text/html; charset=utf-8' });
  });
  it('after leading whitespace and a BOM', () => {
    expect(sniff(text(' \t\r\n\f<p>hi'), 'a')).toMatchObject({ view: 'html' });
    expect(sniff(new Uint8Array([0xef, 0xbb, 0xbf, ...text('\n<title>x</title>')]), 'a')).toMatchObject({ view: 'html' });
  });
  it('a tag name ends at any HTML whitespace, so <html\\n lang> still counts', () => {
    expect(sniff(text('<html\nlang="en">'), 'a')).toMatchObject({ view: 'html' });
  });
  it.each(['<a', '<pre>', '<bold>', '<brick>', '<header>', '<p_', '<!---', '<divx>', '<!doctype htmlx', 'x<p>', '<?php echo 1; ?>'])('%s is not an HTML start', (s) => {
    expect(sniff(text(s), 'notes.txt')).toMatchObject({ view: 'text' });
  });
  it('SVG stays an image, also after an XML declaration, a comment or an SVG doctype', () => {
    for (const s of [
      '<svg xmlns="http://www.w3.org/2000/svg"/>',
      '<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"/>',
      '<!-- made by hand -->\n<svg xmlns="http://www.w3.org/2000/svg"/>',
      '<?xml version="1.0"?>\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "x.dtd">\n<svg/>',
    ]) expect(sniff(text(s), 'a.html')).toMatchObject({ view: 'svg', mediaType: 'image/svg+xml' });
  });
  it('an HTML page opening with a comment and holding an inline <svg> is HTML', () => {
    expect(sniff(text('<!-- page -->\n<div><svg width="1"></svg></div>'), 'a.html')).toMatchObject({ view: 'html' });
  });
  it('spec §9, sniff beats extension: HTML bytes in a .txt render as HTML; PNG bytes in a .html never do', () => {
    expect(sniff(text('<title>x</title>'), 'notes.txt')).toMatchObject({ view: 'html' });
    expect(sniff(PNG, 'page.html')).toMatchObject({ view: 'image', mediaType: 'image/png' });
  });
});

describe('binary kinds', () => {
  it.each([
    [bytes(0xff, 0xd8, 0xff, 0xe0), 'image/jpeg', 'image'],
    [text('GIF89a'), 'image/gif', 'image'],
    [bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50), 'image/webp', 'image'],
    [bytes(0, 0, 0, 0x1c, 0x66, 0x74, 0x79, 0x70, 0x61, 0x76, 0x69, 0x66), 'image/avif', 'image'],
    [bytes(0, 0, 0, 0x1c, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d), 'video/mp4', 'video'],
    [bytes(0x1a, 0x45, 0xdf, 0xa3), 'video/webm', 'video'],
    [text('ID3\u0004'), 'audio/mpeg', 'audio'],
    [text('OggS'), 'audio/ogg', 'audio'],
    [bytes(0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45), 'audio/wav', 'audio'],
    [text('fLaC'), 'audio/flac', 'audio'],
    [bytes(0, 0x61, 0x73, 0x6d, 1, 0, 0, 0), 'application/wasm', 'download'],
    [text('wOF2xxxx'), 'font/woff2', 'download'],
  ])('%#: %s', (b, mediaType, view) => expect(sniff(b, 'x.bin')).toMatchObject({ mediaType, view, text: false }));

  it('Office files are recognised inside the zip; any other zip is a zip; all download', () => {
    const zipWith = (name: string) => new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...text(`....[Content_Types].xml....${name}document.xml`)]);
    expect(sniff(zipWith('word/'), 'a.docx')).toMatchObject({ mediaType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', view: 'download' });
    expect(sniff(zipWith('xl/'), 'a.xlsx')).toMatchObject({ mediaType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', view: 'download' });
    expect(sniff(zipWith('ppt/'), 'a.pptx')).toMatchObject({ mediaType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation', view: 'download' });
    expect(sniff(new Uint8Array([0x50, 0x4b, 0x03, 0x04, 1, 2]), 'a.docx')).toMatchObject({ mediaType: 'application/zip', view: 'download' });
  });
});

describe('text', () => {
  it('UTF-16 with a BOM is text', () => {
    const le = new Uint8Array([0xff, 0xfe, ...new Uint8Array(new Uint16Array([...'hi'].map((c) => c.charCodeAt(0))).buffer)]);
    expect(sniff(le, 'a.txt')).toMatchObject({ view: 'text', text: true, encoding: 'utf-16le', mediaType: 'text/plain; charset=utf-16le' });
  });
  it('invalid UTF-8 (a Windows-1252 CSV) is binary: a download card, never mojibake', () => {
    expect(sniff(new Uint8Array([0x63, 0x61, 0x66, 0xe9, 0x2c, 0x31]), 'prices.csv')).toMatchObject({ view: 'download', text: false, mediaType: 'application/octet-stream' });
  });
  it('a NUL byte makes it binary', () => expect(sniff(new Uint8Array([0x61, 0, 0x62]), 'a.txt')).toMatchObject({ text: false }));
  it('an empty file is empty text', () => expect(sniff(new Uint8Array(), 'empty.md')).toMatchObject({ view: 'markdown', text: true }));
  it('JSON, and a notebook, are recognised from content', () => {
    expect(sniff(text('{"a":1}'), 'data.txt')).toMatchObject({ view: 'json', mediaType: 'application/json; charset=utf-8' });
    expect(sniff(text('{"nbformat":4,"cells":[]}'), 'n.json')).toMatchObject({ view: 'ipynb' });
    expect(sniff(text('{not json'), 'x.json')).toMatchObject({ view: 'code' });
  });
  it.each([
    ['a.md', 'markdown', 'text/markdown; charset=utf-8'],
    ['a.csv', 'csv', 'text/csv; charset=utf-8'],
    ['a.tsv', 'tsv', 'text/tab-separated-values; charset=utf-8'],
    ['a.yaml', 'yaml', 'application/yaml; charset=utf-8'],
    ['a.toml', 'toml', 'application/toml; charset=utf-8'],
    ['a.mmd', 'mermaid', 'text/plain; charset=utf-8'],
    ['a.dot', 'graphviz', 'text/vnd.graphviz; charset=utf-8'],
    ['app.js', 'code', 'text/javascript; charset=utf-8'],
    ['app.mjs', 'code', 'text/javascript; charset=utf-8'],
    ['site.css', 'code', 'text/css; charset=utf-8'],
    ['main.py', 'code', 'text/plain; charset=utf-8'],
    ['run.log', 'text', 'text/plain; charset=utf-8'],
    ['frag.html', 'code', 'text/plain; charset=utf-8'],
  ])('%s → %s', (path, view, mediaType) => expect(sniff(text('plain words\n'), path)).toMatchObject({ view, mediaType }));
});

// Ruling T11: this file runs in workerd, so it answers whether its TextDecoder knows utf-16be.
describe('decodeText in the Workers runtime', () => {
  const s = 'héllo ✓ 𝄞 – done\n';
  const utf16 = (bom: number[], order: 'le' | 'be') => {
    const b = new Uint8Array(2 + s.length * 2);
    b.set(bom);
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      b.set(order === 'le' ? [c & 0xff, c >> 8] : [c >> 8, c & 0xff], 2 + i * 2);
    }
    return b;
  };
  it('round-trips UTF-16LE, dropping the BOM', () => expect(decodeText(utf16([0xff, 0xfe], 'le'), 'utf-16le')).toBe(s));
  it('round-trips UTF-16BE, dropping the BOM', () => expect(decodeText(utf16([0xfe, 0xff], 'be'), 'utf-16be')).toBe(s));
  it('round-trips UTF-8 with and without a BOM', () => {
    expect(decodeText(new Uint8Array([0xef, 0xbb, 0xbf, ...text(s)]), 'utf-8')).toBe(s);
    expect(decodeText(text(s), 'utf-8')).toBe(s);
  });
  it('sniff and decodeText agree on a UTF-16BE file', () => {
    const b = utf16([0xfe, 0xff], 'be');
    const k = sniff(b, 'a.txt');
    expect(k).toMatchObject({ text: true, encoding: 'utf-16be', mediaType: 'text/plain; charset=utf-16be' });
    expect(decodeText(b, k.encoding!)).toBe(s);
  });
});
