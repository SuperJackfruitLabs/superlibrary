<!-- apps/web/src/lib/kit/SuiteFooter.svelte -->
<script lang="ts">
  import ParentMark from './ParentMark.svelte';
  import { PARENT } from './suite.generated';
  /** Decision O8: the parent's address, to confirm with the operator. */
  let { parentHref = 'https://superjackfruit.com' }: { parentHref?: string } = $props();
</script>

<footer class="suite-shell-footer"><a href={parentHref}><ParentMark size={20} /><span>{PARENT.name}</span></a></footer>
