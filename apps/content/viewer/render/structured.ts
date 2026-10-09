import YAML from 'yaml';
import { parse as parseToml } from 'smol-toml';
import type { ViewerData } from '@superlibrary/contract';
import { h, header } from '../dom';
import { tree } from '../tree';

/** Spec §9: "The readable structured view, plus raw." */
export function renderStructured(el: HTMLElement, d: ViewerData): void {
  const text = d.text ?? '';
  let value: unknown;
  let failure: string | null = null;
  try {
    value = d.view === 'json' ? JSON.parse(text) : d.view === 'yaml' ? YAML.parse(text) : parseToml(text);
  } catch (e) {
    failure = e instanceof Error ? e.message : String(e);
  }
  const raw = h('pre', { class: 'raw' }, text);
  if (failure !== null) {
    el.replaceChildren(header(d), h('p', { class: 'note' }, `This file could not be parsed as ${d.view.toUpperCase()}: ${failure}. Showing it as text.`), raw);
    return;
  }
  const structured = tree(value);
  raw.hidden = true;
  const toggle = h('button', { type: 'button', class: 'toggle' }, 'Show raw');
  toggle.addEventListener('click', () => {
    raw.hidden = !raw.hidden;
    structured.hidden = !raw.hidden;
    toggle.textContent = raw.hidden ? 'Show raw' : 'Show structured';
  });
  el.replaceChildren(header(d), toggle, structured, raw);
}
