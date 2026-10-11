<script lang="ts">
  import { page } from '$app/state';
  import Mark from './Mark.svelte';
  import SuiteHeader from '$kit/SuiteHeader.svelte';
  import SuiteSwitcher from '$kit/SuiteSwitcher.svelte';
  import { PRODUCTS } from '$lib/vibe/suite';
  import AppearanceDialog from '$lib/vibe/AppearanceDialog.svelte';
  import type { Me } from './api';

  let { me, onsignout }: { me: Me; onsignout: () => void } = $props();
  let appearanceFrom = $state<HTMLElement | null>(null);
  const at = (href: string) => (href === '/' ? page.url.pathname === '/' || page.url.pathname.startsWith('/a/') : page.url.pathname.startsWith(href));
  const nav = $derived([['/', 'Library'], ['/outcomes', 'Outcomes'], ['/collections', 'Collections'], ['/upload', 'Upload']].map(([href, label]) => ({ href: href!, label: label!, current: at(href!) })));
</script>

{#snippet mark()}<Mark />{/snippet}
{#snippet suite()}<SuiteSwitcher products={PRODUCTS} current="superlibrary" />{/snippet}
<SuiteHeader product="Superlibrary" home="/" {mark} {suite} {nav} {onsignout} onappearance={(el) => (appearanceFrom = el)}
  account={{ label: 'Account', detail: `${me.role === 'owner' ? 'An owner' : 'A member'} of this workspace · ${me.principalId}` }}/>
{#if appearanceFrom}<AppearanceDialog opener={appearanceFrom} onclose={() => (appearanceFrom = null)} />{/if}
