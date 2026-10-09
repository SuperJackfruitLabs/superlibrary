<!-- apps/web/src/lib/kit/Icon.svelte -->
<script lang="ts" module>
  export type IconName = 'upload' | 'link' | 'external' | 'more' | 'check' | 'close';
</script>
<script lang="ts">
  const PATHS: Record<IconName, string> = {
    upload: 'M12 16V4M7 9l5-5 5 5M4 20h16',
    link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
    external: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
    more: 'M5 12h.01M12 12h.01M19 12h.01',
    check: 'M5 12l5 5 9-10',
    close: 'M6 6l12 12M18 6L6 18',
  };
  let { name, size = 18 }: { name: IconName; size?: number } = $props();
</script>

<svg class="kit-icon" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d={PATHS[name]} /></svg>
