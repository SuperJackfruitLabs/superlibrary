import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** A client-only SPA on Cloudflare Pages; index.html answers every route (Pages' SPA mode). */
export default { preprocess: vitePreprocess(), kit: { adapter: adapter({ fallback: 'index.html' }), alias: { $kit: 'src/lib/kit' } } };
