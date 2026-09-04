# AGENTS.md — Slatebase

Instructions for AI assistants working on this project. For detailed rules, see `.kiro/steering/`.

## Project Overview

Self-hosted Knowledge-Context-Server for Markdown vaults. Monorepo: `backend/` (Node.js/Hono REST API, ESM) and `frontend/` (React/Vite SPA). Each package has its own `package.json` — no shared workspace tooling.

## Language

- Code, comments, identifiers, JSDoc: **English**
- UI labels: **German**
- Specs, docs: **German**

## Architecture

**Backend:** `Config → Logger → Vault (Data) → Business → API (Controller)`. Interface-driven (`I*`), manual DI in `src/index.ts`, custom error classes mapped to HTTP in controllers. ESM with `.js` extensions.

**Frontend:** React 19 + useReducer/Context. Separate providers per concern. Action creators are standalone async functions. Singleton `IApiClient`.

## Key Rules

1. Interface first, then implementation
2. `.js` extension on backend relative imports
3. `validateFilePath()` before every vault file access
4. Atomic writes: temp file → `rename()`
5. No DI framework, no external state lib, no JWT
6. TypeScript strict: `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`
7. Named exports only (no default exports)
8. JSDoc on public methods/interfaces
9. Barrel exports via `index.ts` per module

## Naming

| Category | Pattern |
|----------|---------|
| Interface | `I` prefix (`IVaultReader`) |
| Error class | `Error` suffix (`VaultNotFoundError`) |
| Factory | `create` prefix |
| Test mock | `createMock` prefix |
| Action type | SCREAMING_SNAKE_CASE |

## Testing

- Vitest, co-located (`*.test.ts`)
- Backend: hand-written mock factories, no mocking lib
- Frontend: `vi.fn()` for API client
- Commands: `npm run test` (single), `npm run test:watch`, `npm run test:coverage`
- CI runs `test:coverage` — thresholds are a regression baseline; raise them as coverage grows, never lower them to get a build through

## Commands

```bash
# Backend
cd backend && npm run dev            # Hot reload
cd backend && npm run test           # Tests
cd backend && npm run test:coverage  # Tests + coverage thresholds (as in CI)

# Frontend
cd frontend && npm run dev            # Vite (port 5173, proxies /api)
cd frontend && npm run test           # Unit tests
cd frontend && npm run test:coverage  # Tests + coverage thresholds (as in CI)
cd frontend && npm run lint           # ESLint
```

## Data Storage

Filesystem-based, no database. All under `backend/data/`:
- `vaults.json` + `vaults/<id>/` — Vault registry + files
- `vaults/<id>/.slatebase/` — Per-vault internal data (trash, versions, link-index, config, property types)
- `users/`, `sessions/`, `shares.json` — Auth data
- `audit/` — Append-only JSONL (daily rotation)
- `chat/`, `mcp/tokens/`, `plugins/<vaultId>/`, `snippets/<vaultId>/`, `features.json`
- `server-config.json` — admin overrides from `PUT /admin/config`. Precedence: `config/default.json` < this file < `SLATEBASE_*` env
- `users/<userId>-preferences.json` — recent files, bookmarks (`favorites`), keybindings, `uiSettings` (account-wide), `vaultSettings[vaultId]` (per user *and* vault)
- Encrypted secrets, AES-256-GCM per value: plugins in `plugins/<vaultId>/<pluginId>/secrets.json` (key from `SLATEBASE_PLUGIN_SECRET_KEY`, else `data/.plugin-secret-key`); git-sync and mail-import credentials in `module-secrets/<vaultId>/<moduleId>/secrets.json`

## Common Pitfalls

**Backend**
- Missing `.js` extension in backend imports → runtime error
- Vault IDs are deterministic SHA-256 (12 hex chars), not random
- Dot-prefixed files/dirs are hidden from tree, search, stats (like Obsidian); underscore-prefixed ones are normal user content
- Internal vault data lives in `.slatebase/` (trash, versions, link-index, config, property types)
- Windows file locking (OneDrive, antivirus) makes EPERM/EACCES routine: retry atomic writes, never treat a failed read as "file gone"
- Only a server 401 ends a session — a failed read (backend) or a failed request (frontend) is "unknown", never "gone"
- New per-file/per-key JSON persistence goes through `shared/json-file-store.ts`, not a hand-rolled copy
- `@modelcontextprotocol/sdk` is a backend dependency (MCP transport)

**Frontend**
- `noUncheckedIndexedAccess` → null-check array/object access
- `erasableSyntaxOnly` is on: no constructor parameter properties, no `enum`, no namespaces
- Use `state.vaultTrees[vaultId]`; expanded paths are scoped `${vaultId}::${path}`
- Vite proxy requires backend on port 3000
- Frontend uses Zod 4, backend Zod 3 — the versions are not shared
- User settings are server-backed, never `localStorage`-only: account-wide through `state/userSettingsStore`, per-vault through `state/vaultSettingsStore`. `localStorage` is a cache, not the source of truth
- A store's `initialize()` must treat an empty server response as authoritative *unless* `hasSyncedBefore()` is false (`state/preferenceSync.ts`)
- Preference writes publish `preferences:change` over SSE carrying the writer's `X-Client-Id` as `originId`, so the originating tab skips its own echo
- A feature-gated settings section needs `feature:` in `state/settingsRegistry.ts` — nav and content area both derive the gate from there; `App.tsx`'s standalone page routes are a separate path
- Vault write operations must patch the local `directoryTree` immediately — the synchronous lookup APIs cannot await the realtime round-trip
- New modals/dialogs MUST use `useFocusTrap` (`src/hooks/useFocusTrap.ts`)
- Interactive elements on non-button tags need `role="button"`, `tabIndex={0}`, `onKeyDown` (Enter/Space)
- `vitest-axe` is installed; new core components should have a co-located `*.a11y.test.tsx`. `eslint-plugin-jsx-a11y-x` (ESLint 10 fork) is active in lint

**Editor & rendering**
- CM6 handles undo/redo and line numbers natively — don't add a history stack or a line-number component
- Raw HTML is allowlist-only (`plugins/inline-html.ts`), shared by Live Preview and reading view — never widen it on one side alone
- Remark plugins live in `block-ref/`, `breaks/`, `preserve-table-code-escapes.ts`, `math/`
- Spellcheck is Slatebase's own (`editor/spellcheck/`), not the browser's — the editor owns the context menu and no browser exposes its suggestions to JS. `contentDOM` is therefore always `spellcheck="false"`; don't "fix" that back
- Hunspell dictionaries are served as static assets from `/dictionaries/` by the `spellcheckDictionaries()` plugin in `vite.config.ts`, never imported. A new language needs an entry there **and** in `SPELLCHECK_LANGUAGES` (`editor/spellcheck/protocol.ts`)

**Plugin compat**
- Obsidian's view/modal class chain lives only in `plugins/compat/install-globals.ts` — never add a parallel definition in a second module
- `CachedMetadata` is produced only by `plugins/compat/metadata-parser.ts` — extend it there, not in `metadata-cache-shim.ts`
- Console output goes through `plugins/compat/log.ts` (`debug*` = intended trade-off, `warn*` = real gap, `*Once` for render/event paths)
- Core Obsidian command IDs are registered in `core-commands.ts` (editor-only) and `core-commands-app.ts` (needs React state, wired by `CommandPaletteContainer`)
- `OBSIDIAN_API_VERSION` (`obsidian-api-extensions.ts`) may only be raised once the APIs of that version are actually implemented
- Base classes plugins extend must survive ES5-downlevel `_super.call(this)` as well as native `super()` — see the `new.target` wrapper in `install-globals.ts`

**Tooling**
- A `.githooks/pre-commit` hook runs lint + `tsc` for both packages before every commit
