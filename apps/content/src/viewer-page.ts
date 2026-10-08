import type { ViewerData } from '@superlibrary/contract';

const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** The /_view document. Data travels in a JSON data block, which CSP does not execute. */
export function viewerPage(d: ViewerData): string {
  const data = JSON.stringify(d).replace(/</g, '\\u003c');
  return (
    '<!doctype html>\n<html lang="en"><head><meta charset="utf-8">' +
    '<meta name="viewport" content="width=device-width, initial-scale=1">' +
    `<title>${escapeHtml(d.name)}</title><link rel="stylesheet" href="/_viewer/viewer.css"></head>` +
    `<body><main id="app"></main><script id="sl-data" type="application/json">${data}</script>` +
    '<script type="module" src="/_viewer/viewer.js"></script></body></html>'
  );
}
