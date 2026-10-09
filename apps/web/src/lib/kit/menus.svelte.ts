/** One header menu open at a time (the account menu and the suite switcher share this). */
export const menus = $state<{ open: string | null }>({ open: null });

/**
 * Wire a menu: Escape anywhere closes it and returns focus to its trigger; a click outside closes it.
 * Call inside an $effect; returns the cleanup.
 */
export function watchMenu(id: string, trigger: () => HTMLElement | null, panel: () => HTMLElement | null): () => void {
  if (menus.open !== id) return () => {};
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { menus.open = null; trigger()?.focus(); } };
  const onDoc = (e: MouseEvent) => {
    const t = e.target as Node;
    if (!panel()?.contains(t) && !trigger()?.contains(t)) menus.open = null;
  };
  document.addEventListener('keydown', onKey);
  document.addEventListener('click', onDoc, true);
  return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('click', onDoc, true); };
}
