import type { Product } from '@superjackfruit/vibekit';

/** The suite around Superlibrary. Colours come from vibekit (--vk-product-<key>-bg/fg); an entry with no address is not listed. */
export const PARENT = { name: 'Super Jackfruit Labs', href: 'https://superjackfruit.com' } as const;
export const PRODUCTS: ReadonlyArray<{ key: Product; name: string; url: string }> = [
  { key: 'agentpod', name: 'AgentPod', url: 'https://console.agentpod.dev' },
  { key: 'superpipeline', name: 'Superpipeline', url: 'https://app.superpipeline.dev' },
  { key: 'superwitness', name: 'Superwitness', url: '' },
  { key: 'supermessage', name: 'Supermessage', url: '' },
  { key: 'superlibrary', name: 'Superlibrary', url: 'https://app.superlibrary.dev' },
];
