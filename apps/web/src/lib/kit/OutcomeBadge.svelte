<!-- apps/web/src/lib/kit/OutcomeBadge.svelte -->
<script lang="ts">
  import type { Outcome } from '@superlibrary/contract';
  import { OUTCOME_WORDS, outcomeVar } from './outcome';
  let { outcome }: { outcome: Outcome } = $props();
</script>

<span class="outcome" style:--o={outcomeVar(outcome)}>{OUTCOME_WORDS[outcome]}</span>
