import { LIMITS, type ViewerData } from '@superlibrary/contract';
import { h, header } from '../dom';
import { parseDelimited, sortRows } from '../csv';

/** Spec §9: "Sortable table (first 5,000 rows), plus download" (the download is the host toolbar's). */
export function renderTable(el: HTMLElement, d: ViewerData): void {
  const all = parseDelimited(d.text ?? '', d.view === 'tsv' ? '\t' : ',');
  const [head = [], ...rest] = all;
  const shownRows = rest.slice(0, LIMITS.csvRows);
  const tbody = h('tbody');
  const fill = (rows: string[][]) => tbody.replaceChildren(...rows.map((r) => h('tr', {}, ...r.map((c) => h('td', {}, c)))));
  let sortCol = -1;
  let dir: 1 | -1 = 1;
  const ths = head.map((name, i) => {
    const th = h('th', { scope: 'col', tabindex: '0' }, name);
    const sort = () => {
      dir = sortCol === i ? ((-dir) as 1 | -1) : 1;
      sortCol = i;
      for (const other of ths) other.removeAttribute('aria-sort');
      th.setAttribute('aria-sort', dir === 1 ? 'ascending' : 'descending');
      fill(sortRows(shownRows, i, dir));
    };
    th.addEventListener('click', sort);
    th.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); sort(); }
    });
    return th;
  });
  fill(shownRows);
  const note = rest.length > LIMITS.csvRows
    ? h('p', { class: 'note' }, `Showing the first ${LIMITS.csvRows.toLocaleString('en')} of ${rest.length.toLocaleString('en')} rows. Download the file for all of them.`)
    : null;
  el.replaceChildren(header(d), ...(note ? [note] : []), h('div', { class: 'table-wrap' }, h('table', {}, h('thead', {}, h('tr', {}, ...ths)), tbody)));
}
