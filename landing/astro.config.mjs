// @ts-check
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://superlibrary.dev',
  // /sitemap-index.xml; the 404 page is not a real address, so it is left out.
  integrations: [sitemap({ filter: (page) => !page.includes('/404') })],
});
