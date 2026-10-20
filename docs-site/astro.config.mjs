// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import starlightLlmsTxt from 'starlight-llms-txt';

export default defineConfig({
  site: 'https://docs.superlibrary.dev',
  integrations: [
    starlight({
      title: 'SuperLibrary',
      description:
        'The memory of the stack: what agents make and what work has been done, labelled with how each turned out, for agents to consult and people to browse.',
      // /llms.txt, /llms-full.txt and /llms-small.txt, for agents reading these docs. The
      // full file carries every page, reference pages included; the small one drops asides
      // and <details> but keeps every page too, since nothing here is noise.
      plugins: [
        starlightLlmsTxt({
          projectName: 'SuperLibrary',
          description:
            'SuperLibrary is the memory of the stack. It keeps artifacts (uploaded or agent-linked ' +
            'files and folders, versioned) and work records (SuperPipeline cards), each labelled with ' +
            'an outcome: approved, completed, in-progress, superseded, rejected, failed or abandoned. ' +
            'Uploads pass path rules, size limits and a secret scan. Search fuses full-text and vector ' +
            'results and ranks by outcome, within what the caller may see. People use the web app and ' +
            'the suli CLI; agents use an MCP server with three read-only tools; products use the HTTP ' +
            'API and an embeddable viewer. It runs on Cloudflare Workers, signs in through the ' +
            'SuperJackfruit account service, and is MIT licensed.',
          optionalLinks: [
            { label: 'SuperLibrary', url: 'https://superlibrary.dev', description: 'The product site.' },
            { label: 'Source', url: 'https://github.com/SuperJackfruitLabs/superlibrary', description: 'The SuperLibrary repository on GitHub.' },
          ],
        }),
      ],
      // The mark beside the name, as on the landing page. See the component for why it
      // replaces Starlight's own rather than using the `logo` option.
      components: { SiteTitle: './src/components/SiteTitle.astro' },
      // The landing page's palette and faces; see src/styles/theme.css for each value.
      customCss: ['./src/styles/theme.css'],
      favicon: '/favicon.svg',
      head: [
        { tag: 'link', attrs: { rel: 'preconnect', href: 'https://fonts.googleapis.com' } },
        { tag: 'link', attrs: { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: true } },
        {
          tag: 'link',
          attrs: {
            rel: 'stylesheet',
            href:
              'https://fonts.googleapis.com/css2?family=Newsreader:opsz,wght@6..72,600' +
              '&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;500;600&display=swap',
          },
        },
        // The link preview, copied from landing/public/og.png so this host serves its own.
        // Absolute URLs: several unfurlers ignore a relative og:image.
        { tag: 'meta', attrs: { property: 'og:image', content: 'https://docs.superlibrary.dev/og.png' } },
        { tag: 'meta', attrs: { property: 'og:image:width', content: '1200' } },
        { tag: 'meta', attrs: { property: 'og:image:height', content: '630' } },
        { tag: 'meta', attrs: { property: 'og:image:alt', content: 'SuperLibrary — the memory of the stack' } },
        { tag: 'meta', attrs: { name: 'twitter:image', content: 'https://docs.superlibrary.dev/og.png' } },
      ],
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/SuperJackfruitLabs/superlibrary' }],
      // Three sections, in the order a reader needs them: what it is and how to stand it
      // up, then using it, then building on it.
      sidebar: [
        {
          label: 'Start',
          items: [
            { label: 'What SuperLibrary is', slug: 'what-it-is' },
            { label: 'Install', slug: 'install' },
            { label: 'Concepts', slug: 'concepts' },
          ],
        },
        {
          label: 'Use it',
          items: [
            { label: 'The app', slug: 'use/the-app' },
            { label: 'Uploading', slug: 'use/uploading' },
            { label: 'Search', slug: 'use/search' },
            { label: 'Collections', slug: 'use/collections' },
            { label: 'With SuperPipeline and AgentPod', slug: 'use/with-superpipeline-and-agentpod' },
            { label: 'Retention and operations', slug: 'use/retention-and-operations' },
          ],
        },
        {
          label: 'Build on it',
          items: [
            { label: 'The suli CLI', slug: 'build/cli' },
            { label: 'CLI: signing in', slug: 'build/cli/session' },
            { label: 'CLI: artifacts', slug: 'build/cli/artifacts' },
            { label: 'CLI: finding and curating', slug: 'build/cli/library' },
            { label: 'MCP tools', slug: 'build/mcp' },
            { label: 'HTTP API', slug: 'build/api' },
            { label: 'Embed', slug: 'build/embed' },
            { label: 'Licences', slug: 'build/licences' },
          ],
        },
      ],
    }),
  ],
});
