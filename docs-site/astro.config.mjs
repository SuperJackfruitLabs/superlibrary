// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import sjlDocs from '@superjackfruit/docs-theme';

export default defineConfig({
  site: 'https://docs.superlibrary.dev',
  integrations: [
    starlight({
      title: 'SuperLibrary',
      description:
        'The memory of the stack: what agents make and what work has been done, labelled with how each turned out, for agents to consult and people to browse.',
      // The suite's docs theme: vibekit's plum, the faces, the street, status badges, the footers,
      // the 404, the edit link and llms.txt. See @superjackfruit/docs-theme's README.
      plugins: [
        sjlDocs({
          product: 'superlibrary',
          status: 'lights on',
          // /llms.txt, /llms-full.txt and /llms-small.txt, for agents reading these docs.
          llms: {
            description:
              'SuperLibrary is the memory of the stack. It keeps artifacts (uploaded or agent-linked ' +
              'files and folders, versioned) and work records (SuperPipeline cards), each labelled with ' +
              'an outcome: approved, completed, in-progress, superseded, rejected, failed or abandoned. ' +
              'Uploads pass path rules, size limits and a secret scan. Search fuses full-text and vector ' +
              'results and ranks by outcome, within what the caller may see. People use the web app and ' +
              'the suli CLI; agents use an MCP server with three read-only tools; products use the HTTP ' +
              'API and an embeddable viewer. It runs on Cloudflare Workers, signs in through the ' +
              'SuperJackfruit account service, and is MIT licensed.',
          },
        }),
      ],
      favicon: '/favicon.svg',
      head: [
        // The link preview, copied from landing/public/og.png so this host serves its own.
        // Absolute URLs: several unfurlers ignore a relative og:image.
        { tag: 'meta', attrs: { property: 'og:image', content: 'https://docs.superlibrary.dev/og.png' } },
        { tag: 'meta', attrs: { property: 'og:image:width', content: '1200' } },
        { tag: 'meta', attrs: { property: 'og:image:height', content: '630' } },
        { tag: 'meta', attrs: { property: 'og:image:alt', content: 'SuperLibrary — the memory of the stack' } },
        { tag: 'meta', attrs: { name: 'twitter:image', content: 'https://docs.superlibrary.dev/og.png' } },
      ],
      social: [{ icon: 'github', label: 'GitHub', href: 'https://github.com/SuperJackfruitLabs/superlibrary' }],
      // The suite's five groups, in the order a reader needs them.
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
          ],
        },
        {
          label: 'Build on it',
          items: [
            { label: 'The suli CLI', slug: 'build/cli' },
            { label: 'MCP tools', slug: 'build/mcp' },
            { label: 'HTTP API', slug: 'build/api' },
            { label: 'Embed', slug: 'build/embed' },
          ],
        },
        {
          label: 'Run it',
          items: [{ label: 'Retention and operations', slug: 'use/retention-and-operations' }],
        },
        {
          label: 'Reference',
          items: [
            { label: 'CLI: signing in', slug: 'build/cli/session' },
            { label: 'CLI: artifacts', slug: 'build/cli/artifacts' },
            { label: 'CLI: finding and curating', slug: 'build/cli/library' },
            { label: 'Licences', slug: 'build/licences' },
          ],
        },
      ],
    }),
  ],
});
