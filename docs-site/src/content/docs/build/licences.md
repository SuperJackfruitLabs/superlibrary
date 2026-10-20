---
title: Licences
description: Superlibrary's MIT licence, and the licences of the libraries each part ships with.
---

Superlibrary is released under the
[MIT licence](https://github.com/SuperJackfruitLabs/superlibrary/blob/main/LICENSE).

## What each part ships with

The runtime dependencies named in each package's `package.json`, and their licences as their own
packages declare them:

| Part | Dependency | Licence |
|---|---|---|
| API Worker | `@modelcontextprotocol/sdk` | MIT |
| API Worker | `jose` | MIT |
| API Worker, contract | `zod` | MIT |
| content Worker | `dompurify` | MPL-2.0 or Apache-2.0 |
| content Worker | `highlight.js` | BSD-3-Clause |
| content Worker | `marked` | MIT |
| content Worker | `mermaid` | MIT |
| content Worker | `pdfjs-dist` | Apache-2.0 |
| content Worker | `smol-toml` | BSD-3-Clause |
| content Worker | `viz.js` | MIT |
| content Worker | `yaml` | ISC |
| web app | `svelte`, `@sveltejs/kit` | MIT |
| web app | `fflate` | MIT |
| web app | `@superjackfruit/vibekit` | SuperJackfruit's own design kit, vendored as a tarball; its package declares `UNLICENSED` |
| `suli` CLI, embed | only the workspace's own `@superlibrary/contract` | MIT, with this repository |

The table lists direct dependencies, not everything they pull in. Build and test tools, such as
Wrangler, Vite, Vitest, Playwright and jsdom, are not part of anything shipped. The same goes for
the npm packages that build superlibrary.dev and this documentation site.

`suli` is compiled with Bun into a single binary; the release carries only that binary, the
installer and `SHA256SUMS`.
