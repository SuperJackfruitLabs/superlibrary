const BY_EXT: Record<string, string> = {
  ts: 'typescript', tsx: 'typescript', js: 'javascript', mjs: 'javascript', cjs: 'javascript', jsx: 'javascript',
  py: 'python', rb: 'ruby', go: 'go', rs: 'rust', java: 'java', kt: 'kotlin', swift: 'swift', c: 'c', h: 'c',
  cc: 'cpp', cpp: 'cpp', hpp: 'cpp', cs: 'csharp', php: 'php', sh: 'bash', bash: 'bash', zsh: 'bash', sql: 'sql',
  lua: 'lua', r: 'r', scala: 'scala', css: 'css', html: 'xml', htm: 'xml', xml: 'xml', svelte: 'xml', vue: 'xml',
  svg: 'xml', json: 'json', ipynb: 'json', yaml: 'yaml', yml: 'yaml', toml: 'ini', ini: 'ini', diff: 'diff', patch: 'diff',
  md: 'markdown', markdown: 'markdown', dockerfile: 'dockerfile', makefile: 'makefile', graphql: 'graphql',
};

export function languageFor(path: string): string | null {
  const name = (path.split('/').pop() ?? '').toLowerCase();
  if (name === 'dockerfile' || name === 'makefile') return name;
  const i = name.lastIndexOf('.');
  return i > 0 ? (BY_EXT[name.slice(i + 1)] ?? null) : null;
}
