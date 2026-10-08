import { h } from './dom';

/** A read-only structured view. Strings are set as text, never as markup. */
export function tree(value: unknown, key?: string, depth = 0): HTMLElement {
  const label = key !== undefined ? h('span', { class: 'key' }, key) : null;
  // TOML dates are Date objects: a value, not a node of zero keys.
  if (value !== null && typeof value === 'object' && !(value instanceof Date)) {
    const entries = Array.isArray(value) ? value.map((v, i) => [String(i), v] as const) : Object.entries(value);
    const count = Array.isArray(value) ? `[${entries.length}]` : `{${entries.length}}`;
    const details = h('details', { class: depth === 0 ? 'tree' : 'node', open: depth < 2 });
    details.append(h('summary', {}, label, label ? ' ' : '', count));
    for (const [k, v] of entries) details.append(tree(v, k, depth + 1));
    return details;
  }
  const type = value === null ? 'null' : value instanceof Date ? 'date' : typeof value;
  // A TOML date's toISOString keeps the file's own form (offset, local, date or time only).
  const text = typeof value === 'string' ? JSON.stringify(value) : value instanceof Date && !Number.isNaN(value.getTime()) ? value.toISOString() : String(value);
  return h('div', { class: depth === 0 ? 'tree' : 'row' }, label, label ? ': ' : '', h('span', { class: `leaf ${type}` }, text));
}
