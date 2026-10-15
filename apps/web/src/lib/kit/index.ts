// apps/web/src/lib/kit/index.ts
/** The kit: the suite design system's first instance (operator direction A). Import from `$kit`. */
export { default as Button } from './Button.svelte';
export { default as Tabs } from './Tabs.svelte';
export { default as Toolbar, type ToolbarItem } from './Toolbar.svelte';
export { default as Icon, type IconName } from './Icon.svelte';
export { default as Toast } from './Toast.svelte';
export { default as EmptyState } from './EmptyState.svelte';
export { default as OutcomeBadge } from './OutcomeBadge.svelte';
export { default as ConfirmDialog } from './ConfirmDialog.svelte';
export { OUTCOME_ORDER, OUTCOME_WORDS, outcomeVar } from './outcome';
export { holdModal } from './modal';
