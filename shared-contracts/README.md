# @slatebase/shared-contracts

AP10 feasibility proof for a shared API contract between `backend/` and
`frontend/`. Not an npm workspace (AGENTS.md deliberately keeps the two
packages independent) — each side depends on this via a plain `file:`
dependency in its own `package.json`.

## What's here

Zod schemas for the vault routes only (`GET /vaults`, `GET /vaults/:id/tree`,
`GET`/`PUT /vaults/:id/files`): `src/vault.ts`. The backend validates the
`PUT /files` request body against `putFileBodySchema`
(`backend/src/api/index.ts`); both sides derive their TypeScript types via
`z.infer<>` instead of hand-maintaining parallel interfaces.

## Why a `file:` dependency instead of a relative import

A plain relative import (`../../shared-contracts/src/vault.ts`) would need
each side's `rootDir`/`include` widened to reach outside its own `src/`,
which reshapes `tsc`'s output layout (`backend`'s `outDir` is keyed to
`rootDir: "./src"`, and `start:dist` assumes `dist/index.js`) — a much
bigger blast radius than this AP's scope. A `file:` dependency keeps this
package's source *and* build output entirely outside both `tsc`
compilation units; each side just imports `@slatebase/shared-contracts`
like any other npm package.

## The cost this approach adds

`npm install` alone is not enough to make a fresh clone work — this
package needs its own `npm install` once, and its compiled `dist/` (not
committed, gitignored like every other `dist/` in this repo) has to exist
before `tsc`/`vitest`/`vite` resolve the import. `predev`/`prebuild`/
`pretest`/`pretest:coverage` hooks in both `backend/package.json` and
`frontend/package.json` run `npm run build --prefix ../shared-contracts`
automatically, so `npm run dev|build|test|test:coverage` all "just work" —
but a workflow that calls `tsc`/`vitest`/`vite` directly, bypassing those
npm scripts, will get a module-not-found error until someone builds this
package by hand. This is the direct cost of avoiding an npm-workspace
restructure; a real workspace would make this transparent via hoisted
`node_modules` symlinks with no separate build step required.

## What rolling this out further would cost

See the AP10 PR description for the full writeup (repo-search
`shared-contracts` in the release notes / PR history). Summary: ~100
routes remain hand-typed; migrating them at this same pace is mechanical
but not free — each route needs its response and request schemas
reverse-engineered from the current controller code (drift already found
in this first pass: the frontend's `FileContent`/`FileSaveResult` types
were missing the `etag` field the backend has always sent). Whether
`@hono/zod-openapi` (generated OpenAPI spec + generated client) is worth
adopting instead of continuing to hand-write shared Zod schemas per route
is an open decision for the maintainer — not made here.
