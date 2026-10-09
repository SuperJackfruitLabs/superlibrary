/** RFC 4180, with the separator chosen by the caller. */
export function parseDelimited(text: string, sep: ',' | '\t'): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i]!;
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (c === '"') quoted = false;
      else field += c;
    } else if (c === '"' && field === '') quoted = true;
    else if (c === sep) { row.push(field); field = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += c;
  }
  if (field !== '' || row.length > 0) { row.push(field); rows.push(row); }
  return rows;
}

const num = (s: string) => (s.trim() !== '' && Number.isFinite(Number(s)) ? Number(s) : null);

export function sortRows(rows: string[][], col: number, dir: 1 | -1): string[][] {
  return [...rows].sort((a, b) => {
    const x = a[col] ?? '';
    const y = b[col] ?? '';
    const nx = num(x);
    const ny = num(y);
    const c = nx !== null && ny !== null ? nx - ny : x.localeCompare(y);
    return c * dir;
  });
}
