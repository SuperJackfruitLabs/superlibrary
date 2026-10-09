import type { View } from '@superlibrary/contract';

export type TextEncoding = 'utf-8' | 'utf-16le' | 'utf-16be';
export interface Sniffed { mediaType: string; view: View; text: boolean; encoding: TextEncoding | null }

const at = (b: Uint8Array, off: number, sig: number[]) => sig.every((x, i) => b[off + i] === x);
const ascii = (b: Uint8Array, off: number, s: string) => at(b, off, [...s].map((c) => c.charCodeAt(0)));
const bin = (mediaType: string, view: View): Sniffed => ({ mediaType, view, text: false, encoding: null });

function binary(b: Uint8Array): Sniffed | null {
  if (at(b, 0, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return bin('image/png', 'image');
  if (at(b, 0, [0xff, 0xd8, 0xff])) return bin('image/jpeg', 'image');
  if (ascii(b, 0, 'GIF87a') || ascii(b, 0, 'GIF89a')) return bin('image/gif', 'image');
  if (ascii(b, 0, 'RIFF') && ascii(b, 8, 'WEBP')) return bin('image/webp', 'image');
  if (ascii(b, 0, 'RIFF') && ascii(b, 8, 'WAVE')) return bin('audio/wav', 'audio');
  if (ascii(b, 4, 'ftyp')) {
    const brand = String.fromCharCode(...b.slice(8, 12));
    if (brand === 'avif' || brand === 'avis') return bin('image/avif', 'image');
    if (brand === 'M4A ') return bin('audio/mp4', 'audio');
    if (brand === 'qt  ') return bin('video/quicktime', 'video');
    if (brand.startsWith('hei') || brand === 'mif1') return bin('image/heic', 'download');
    return bin('video/mp4', 'video');
  }
  if (ascii(b, 0, '%PDF-')) return bin('application/pdf', 'pdf');
  if (at(b, 0, [0x1a, 0x45, 0xdf, 0xa3])) return bin('video/webm', 'video');
  if (ascii(b, 0, 'ID3') || at(b, 0, [0xff, 0xfb]) || at(b, 0, [0xff, 0xf3]) || at(b, 0, [0xff, 0xf2])) return bin('audio/mpeg', 'audio');
  if (ascii(b, 0, 'OggS')) return bin('audio/ogg', 'audio');
  if (ascii(b, 0, 'fLaC')) return bin('audio/flac', 'audio');
  if (at(b, 0, [0, 0x61, 0x73, 0x6d])) return bin('application/wasm', 'download');
  if (ascii(b, 0, 'wOFF')) return bin('font/woff', 'download');
  if (ascii(b, 0, 'wOF2')) return bin('font/woff2', 'download');
  if (ascii(b, 0, 'OTTO')) return bin('font/otf', 'download');
  if (at(b, 0, [0, 1, 0, 0, 0])) return bin('font/ttf', 'download');
  if (at(b, 0, [0x50, 0x4b, 0x03, 0x04])) {
    // Office files are zips; their part names sit in the local headers and the central directory.
    const window = String.fromCharCode(...b.slice(0, 65536)) + String.fromCharCode(...b.slice(Math.max(0, b.length - 65536)));
    if (window.includes('word/')) return bin('application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'download');
    if (window.includes('xl/')) return bin('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'download');
    if (window.includes('ppt/')) return bin('application/vnd.openxmlformats-officedocument.presentationml.presentation', 'download');
    return bin('application/zip', 'download');
  }
  return null;
}

export function decodeText(b: Uint8Array, encoding: TextEncoding): string {
  const bomLength = encoding === 'utf-8' ? (at(b, 0, [0xef, 0xbb, 0xbf]) ? 3 : 0) : 2;
  return new TextDecoder(encoding, { fatal: true, ignoreBOM: true }).decode(b.subarray(bomLength));
}

function encodingOf(b: Uint8Array): TextEncoding | null {
  if (at(b, 0, [0xff, 0xfe])) return 'utf-16le';
  if (at(b, 0, [0xfe, 0xff])) return 'utf-16be';
  if (b.subarray(0, 8192).includes(0)) return null;
  try {
    new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(b);
    return 'utf-8';
  } catch {
    return null;
  }
}

/** Text views the extension may choose. Never html, svg, pdf, image or media. */
const BY_EXTENSION: Record<string, [View, string]> = {
  md: ['markdown', 'text/markdown'], markdown: ['markdown', 'text/markdown'],
  csv: ['csv', 'text/csv'], tsv: ['tsv', 'text/tab-separated-values'],
  yaml: ['yaml', 'application/yaml'], yml: ['yaml', 'application/yaml'], toml: ['toml', 'application/toml'],
  mmd: ['mermaid', 'text/plain'], mermaid: ['mermaid', 'text/plain'],
  dot: ['graphviz', 'text/vnd.graphviz'], gv: ['graphviz', 'text/vnd.graphviz'],
  js: ['code', 'text/javascript'], mjs: ['code', 'text/javascript'], cjs: ['code', 'text/javascript'],
  css: ['code', 'text/css'], json: ['code', 'text/plain'],
  txt: ['text', 'text/plain'], log: ['text', 'text/plain'],
};
const CODE = new Set(['ts', 'tsx', 'jsx', 'py', 'rb', 'go', 'rs', 'java', 'kt', 'swift', 'c', 'h', 'cc', 'cpp', 'hpp', 'cs', 'php', 'sh', 'bash', 'zsh', 'fish', 'sql', 'lua', 'r', 'scala', 'svelte', 'vue', 'html', 'htm', 'xml', 'ini', 'cfg', 'conf', 'diff', 'patch', 'dockerfile', 'makefile', 'swift', 'zig', 'ex', 'exs', 'erl', 'hs', 'ml', 'dart', 'tf', 'proto', 'graphql']);

/** WHATWG whitespace bytes (TAB, LF, FF, CR, SPACE); the decoder has already dropped any BOM. */
const LEADING_WS = /^[\t\n\f\r ]+/;
/**
 * WHATWG MIME Sniffing §7.1, the "HTML" rows: one of these, case-insensitive, then a
 * tag-terminating byte. The standard's terminators are SPACE and '>'; the other whitespace bytes
 * are accepted too, since a tag name ends at any of them (`<html\nlang="en">` is a page).
 * Spec §9: the bytes decide, never the extension, so these hold for a `.txt` or a `.png` alike.
 */
const HTML_START = /^(?:<!doctype html|<html|<head|<script|<iframe|<h1|<div|<font|<table|<a|<style|<title|<b|<body|<br|<p|<!--)[\t\n\f\r >]/;
/** An SVG root, optionally after an XML declaration, comments and an SVG doctype. */
const SVG_START = /^(?:(?:<\?xml[^>]*\?>|<!--[\s\S]*?-->|<!doctype svg[^>]*>)[\t\n\f\r ]*)*<svg[\t\n\f\r />]/;

function extOf(path: string): string {
  const name = (path.split('/').pop() ?? '').toLowerCase();
  if (name === 'dockerfile' || name === 'makefile') return name;
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i + 1) : '';
}

export function sniff(b: Uint8Array, path: string): Sniffed {
  const known = binary(b);
  if (known) return known;
  const encoding = encodingOf(b);
  if (!encoding) return bin('application/octet-stream', 'download');
  const charset = `; charset=${encoding}`;
  const t = (view: View, type: string): Sniffed => ({ mediaType: `${type}${charset}`, view, text: true, encoding });
  let content: string;
  try {
    content = decodeText(b, encoding);
  } catch {
    return bin('application/octet-stream', 'download');
  }
  const head = content.slice(0, 1024).replace(LEADING_WS, '').toLowerCase();
  // SVG first: a comment-led SVG would otherwise match the HTML `<!--` pattern.
  if (SVG_START.test(head) || (head.startsWith('<?xml') && head.includes('<svg'))) return { mediaType: 'image/svg+xml', view: 'svg', text: true, encoding };
  if (HTML_START.test(head)) return t('html', 'text/html');
  if (head.startsWith('{') || head.startsWith('[')) {
    try {
      const v = JSON.parse(content) as unknown;
      const nb = v && typeof v === 'object' && !Array.isArray(v) && typeof (v as { nbformat?: unknown }).nbformat === 'number' && Array.isArray((v as { cells?: unknown }).cells);
      return nb ? t('ipynb', 'application/x-ipynb+json') : t('json', 'application/json');
    } catch {
      // not JSON after all: fall through to the extension
    }
  }
  const ext = extOf(path);
  const mapped = BY_EXTENSION[ext];
  if (mapped) return t(mapped[0], mapped[1]);
  if (CODE.has(ext)) return t('code', 'text/plain');
  return t('text', 'text/plain');
}
