---
title: Licences
description: SuperLibrary's MIT licence, and the licences of the libraries each part ships with.
---

You should be able to answer “what may we ship?” without conducting archaeology through lockfiles.
SuperLibrary itself is released under the
[MIT licence](https://github.com/SuperJackfruitLabs/superlibrary/blob/main/LICENSE); the table below
names the direct runtime dependencies each part ships with and the licences those packages declare.

## What each part ships with

Here is that boundary in one place:

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

That distinction keeps the answer useful: runtime cargo belongs in the table; the scaffolding that
builds and tests it does not quietly climb aboard.

`suli` is compiled with Bun into a single binary; the release carries only that binary, the
installer and `SHA256SUMS`.

So the CLI release has a pleasantly short packing list—and `SHA256SUMS` is there to prove the
binary you unpacked is the one the release packed.
