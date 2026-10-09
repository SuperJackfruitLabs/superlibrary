/**
 * An in-page modal (the app never uses the browser's confirm or prompt): the rest of the page is
 * inert, Tab and Shift+Tab wrap inside, Escape is the caller's, and focus goes back to the control
 * that opened it. The dialog stays where Svelte rendered it; every sibling on the way up to <body>
 * is made inert instead, as the embed does for full screen.
 */
const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function holdModal(dialog: HTMLElement, onEscape: () => void, returnTo: HTMLElement | null = null): () => void {
  const doc = dialog.ownerDocument;
  // Safari does not focus a button on click, so the caller names it; otherwise whatever had focus.
  const active = doc.activeElement instanceof HTMLElement && doc.activeElement !== doc.body ? doc.activeElement : null;
  const opener = returnTo ?? active;
  const inerted: Element[] = [];
  for (let node: HTMLElement | null = dialog; node && node !== doc.body; node = node.parentElement) {
    for (const sib of node.parentElement?.children ?? []) {
      if (sib !== node && !sib.hasAttribute('inert')) { sib.setAttribute('inert', ''); inerted.push(sib); }
    }
  }
  const focusables = () => [...dialog.querySelectorAll<HTMLElement>(FOCUSABLE)];
  const start = () => (dialog.querySelector<HTMLElement>('[data-autofocus]:not([disabled])') ?? focusables()[0] ?? dialog).focus();
  start();

  const onKey = (e: KeyboardEvent) => {
    if (!dialog.isConnected) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      onEscape();
      return;
    }
    if (e.key !== 'Tab') return;
    // Every Tab is moved here, not only at the ends: WebKit without full keyboard access skips
    // buttons, so its own next stop after Cancel would be <body>, outside the dialog.
    e.preventDefault();
    const f = focusables();
    if (f.length === 0) return;
    const i = f.indexOf(doc.activeElement as HTMLElement);
    const next = e.shiftKey ? (i <= 0 ? f.length - 1 : i - 1) : (i === -1 || i === f.length - 1 ? 0 : i + 1);
    f[next]!.focus();
  };
  // Focus can still land outside (a click on the backdrop in WebKit, a screen reader): bring it back.
  const onFocusIn = (e: FocusEvent) => { if (dialog.isConnected && e.target instanceof Node && !dialog.contains(e.target)) start(); };
  doc.addEventListener('keydown', onKey, true);
  doc.addEventListener('focusin', onFocusIn);

  return () => {
    doc.removeEventListener('keydown', onKey, true);
    doc.removeEventListener('focusin', onFocusIn);
    for (const el of inerted) el.removeAttribute('inert');
    if (opener?.isConnected) opener.focus();
  };
}
