# superlibrary

**The memory of the stack.** Superlibrary keeps what agents make and what work has been done — artifacts and Superpipeline work history, labelled with how each turned out — and lets agents consult it before they work and people browse it.

Status: phase 1 (Core) live — upload, view and embed artifacts. Plan: docs/superpowers/plans/2026-10-09-superlibrary-phase-1-core.md.

Design: [docs/superpowers/specs/2026-10-09-superlibrary-design.md](docs/superpowers/specs/2026-10-09-superlibrary-design.md).

Part of [Super Jackfruit Labs](https://superjackfruit.com). Signs in through
[accounts.superjackfruit.com](https://accounts.superjackfruit.com).

## Run it locally

```bash
pnpm install
node scripts/dev-keys.mjs
pnpm --filter @superlibrary/api dev        # API on :8787
pnpm --filter @superlibrary/content dev    # content Worker on :8788
pnpm --filter @superlibrary/web dev        # web app on :5173
```

Open `http://localhost:5173` (dev auth, no sign-in).

## License

Proprietary until a license is chosen.
