/**
 * The toolbar's stylesheet, injected once per document. Every rule is under `.sl-embed`, and the
 * colours come from host hooks (`--sl-host-bg`, `-fg`, `-muted`, `-line`, `-hover`, `-accent`,
 * `-accent-content`, `-danger`, each also with `-dark`, and `--sl-host-font`) with neutral fallbacks.
 */
const CSS = `
.sl-embed{--sl-bg:var(--sl-host-bg,#fff);--sl-fg:var(--sl-host-fg,#1f2328);--sl-muted:var(--sl-host-muted,#59636e);--sl-line:var(--sl-host-line,#d1d9e0);--sl-hover:var(--sl-host-hover,#f0f2f4);--sl-accent:var(--sl-host-accent,#0969da);--sl-accent-content:var(--sl-host-accent-content,#fff);--sl-danger:var(--sl-host-danger,#cf222e);
  container-type:inline-size;display:flex;flex-direction:column;background:var(--sl-bg);color:var(--sl-fg);border:1px solid var(--sl-line);border-radius:8px;overflow:hidden;
  font:14px/1.4 var(--sl-host-font,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif);color-scheme:light}
.sl-embed[data-theme=dark]{--sl-bg:var(--sl-host-bg-dark,#0d1117);--sl-fg:var(--sl-host-fg-dark,#e6edf3);--sl-muted:var(--sl-host-muted-dark,#9198a1);--sl-line:var(--sl-host-line-dark,#3d444d);--sl-hover:var(--sl-host-hover-dark,#1f242c);--sl-accent:var(--sl-host-accent-dark,#4493f8);--sl-accent-content:var(--sl-host-accent-content-dark,#0d1117);--sl-danger:var(--sl-host-danger-dark,#f85149);color-scheme:dark}
@media (prefers-color-scheme:dark){.sl-embed:not([data-theme=light]){--sl-bg:var(--sl-host-bg-dark,#0d1117);--sl-fg:var(--sl-host-fg-dark,#e6edf3);--sl-muted:var(--sl-host-muted-dark,#9198a1);--sl-line:var(--sl-host-line-dark,#3d444d);--sl-hover:var(--sl-host-hover-dark,#1f242c);--sl-accent:var(--sl-host-accent-dark,#4493f8);--sl-accent-content:var(--sl-host-accent-content-dark,#0d1117);--sl-danger:var(--sl-host-danger-dark,#f85149);color-scheme:dark}}
.sl-embed [hidden]{display:none!important}
.sl-embed *,.sl-embed *::before,.sl-embed *::after{box-sizing:border-box}
.sl-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:2px;padding:4px;border-bottom:1px solid var(--sl-line)}
.sl-spacer{flex:1 1 0;min-width:0}
.sl-btn,.sl-select{position:relative;display:inline-flex;align-items:center;gap:6px;min-height:36px;min-width:36px;padding:0 10px;border:0;border-radius:6px;
  background:transparent;color:inherit;font:inherit;text-decoration:none;cursor:pointer;white-space:nowrap}
.sl-btn:hover,.sl-select:hover{background:var(--sl-hover)}
.sl-btn:focus-visible,.sl-select:focus-within,.sl-panel button:focus-visible,.sl-link:focus-visible,.sl-more-item:focus-visible,.sl-more-field select:focus-visible{outline:2px solid var(--sl-accent);outline-offset:-2px}
.sl-btn[aria-pressed=true],.sl-btn[aria-expanded=true]{background:var(--sl-hover);color:var(--sl-accent)}
.sl-icon{flex:none;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round}
.sl-select select{position:absolute;inset:0;width:100%;height:100%;opacity:0;cursor:pointer;font:inherit;-webkit-appearance:none;appearance:none}
.sl-version{font-weight:600;font-variant-numeric:tabular-nums}
.sl-caret{width:14px;height:14px;margin-left:-2px;color:var(--sl-muted)}
.sl-error{margin:0;padding:6px 10px;color:var(--sl-danger);border-bottom:1px solid var(--sl-line)}
.sl-panel{padding:10px 12px;border-bottom:1px solid var(--sl-line);display:flex;flex-direction:column;gap:8px}
.sl-panel p{margin:0}
.sl-visibility strong{font-weight:600}
.sl-row{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.sl-panel button{min-height:36px;padding:0 12px;border:1px solid var(--sl-line);border-radius:6px;background:var(--sl-bg);color:inherit;font:inherit;cursor:pointer}
.sl-panel button:hover{background:var(--sl-hover)}
.sl-panel button.sl-primary{background:var(--sl-accent);border-color:var(--sl-accent);color:var(--sl-accent-content)}
.sl-link{width:100%;min-height:36px;padding:0 8px;border:1px solid var(--sl-line);border-radius:6px;background:var(--sl-hover);color:inherit;font:13px ui-monospace,SFMono-Regular,Menlo,monospace}
.sl-muted,.sl-status{color:var(--sl-muted);font-size:13px}
.sl-status:empty{display:none}
.sl-files-panel{max-height:min(320px,50vh);overflow:auto;padding:4px}
.sl-files-panel ul{list-style:none;margin:0;padding:0}
.sl-panel .sl-file{display:flex;width:100%;gap:12px;justify-content:space-between;align-items:center;border:0;text-align:left;background:transparent}
.sl-panel .sl-file[aria-current=true]{background:var(--sl-hover);color:var(--sl-accent);font-weight:600}
.sl-file-path{overflow-wrap:anywhere}
.sl-file-size{flex:none;color:var(--sl-muted);font-size:12px;font-variant-numeric:tabular-nums}
.sl-frame{display:block;width:100%;border:0;background:var(--sl-bg)}
.sl-embed:fullscreen,.sl-embed.sl-overlay{border:0;border-radius:0}
.sl-embed:-webkit-full-screen{border:0;border-radius:0;width:100%;height:100%}
.sl-embed.sl-overlay{position:fixed;inset:0;z-index:2147483647;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)}
.sl-embed:fullscreen .sl-frame,.sl-embed.sl-overlay .sl-frame{flex:1 1 auto;height:auto!important;min-height:0}
.sl-embed:-webkit-full-screen .sl-frame{flex:1 1 auto;height:auto!important;min-height:0}
.sl-more-toggle{display:none!important}
.sl-more-list{display:flex;flex-direction:column;gap:6px}
.sl-panel .sl-more-item{display:flex;align-items:center;min-height:44px;padding:0 12px;border:1px solid var(--sl-line);border-radius:6px;background:var(--sl-bg);color:inherit;text-decoration:none;font:inherit;cursor:pointer}
.sl-more-field{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:44px}
.sl-more-field select{min-height:44px;font:inherit;font-size:max(16px,1em)}
@container (max-width:640px){.sl-toolbar .sl-secondary{display:none}.sl-more-toggle{display:inline-flex!important}.sl-btn,.sl-select{padding:0 8px}}
@media (pointer:coarse){.sl-btn,.sl-select,.sl-panel button,.sl-link{min-height:44px;min-width:44px}}
`;

const ID = 'sl-embed-style';

export function injectStyle(doc: Document, nonce?: string): void {
  if (doc.getElementById(ID)) return;
  const style = doc.createElement('style');
  style.id = ID;
  if (nonce) style.nonce = nonce;
  style.textContent = CSS;
  doc.head.append(style);
}
