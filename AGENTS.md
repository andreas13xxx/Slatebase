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

**Operating model:** Slatebase runs as a single process — see README.md's "Operating Model" section. In-memory state (session store, SSE connections, rate limiters, caches, mutexes serializing JSON-file writes, etc.) is normal and expected; it does not need to work across instances, and no PR should be designed around eventually supporting horizontal scaling.

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
10. Single-instance only: in-memory state never needs cross-instance coordination

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
- `vaults/<id>/.slatebase/` — Per-vault internal data (trash, versions, link-index, config, property types, `spellcheck-words.json` — the vault's personal spellcheck words; like `config.json` and `property-types.json` it is exempt in the Git Sync `.gitignore` block and so travels with the vault)
- CSS snippets are vault content like themes: `<vault>/.obsidian/snippets/<id>.css`, enabled ones in `enabledCssSnippets` of `.obsidian/appearance.json` (edit it only through `shared/appearance-file.ts`, which holds the per-vault lock and refuses to overwrite invalid JSON). The old `snippets/<vaultId>/` under `data/` is migrated at startup and no longer written
- `users/`, `sessions/`, `shares.json` — Auth data
- `audit/` — Append-only JSONL (daily rotation)
- `chat/`, `mcp/tokens/`, `plugins/<vaultId>/`, `features.json`
- About `plugins/<vaultId>/` — server-side plugin data only: `_registry.json` (permissions, compatibility, approval). Plugin secrets are not there any more: they live in the vault keychain (`module-secrets/<vaultId>/keychain/`). The plugins themselves are vault content like themes: `<vault>/.obsidian/plugins/<id>/` (files + `data.json`), enabled ones in `<vault>/.obsidian/community-plugins.json`. A plugin runs only while approved in `_registry.json` **and** listed there; never make a plugin that merely appears in the vault start on its own. The old plugin files under `plugins/<vaultId>/<id>/` are migrated at startup and no longer read
- `server-config.json` — admin overrides from `PUT /admin/config`. Precedence: `config/default.json` < this file < `SLATEBASE_*` env
- `users/<userId>-preferences.json` — recent files, bookmarks (`favorites`), keybindings, `uiSettings` (account-wide), `vaultSettings[vaultId]` (per user *and* vault)
- Encrypted secrets, AES-256-GCM per value, key from `SLATEBASE_MODULE_SECRET_KEY`, else `data/.module-secret-key`: `module-secrets/<vaultId>/<moduleId>/secrets.json` for git-sync, mail-import and the vault keychain (`moduleId` `keychain`; IDs `[a-z0-9]` with single hyphens; names are shared by all plugins of the vault). `SLATEBASE_PLUGIN_SECRET_KEY` / `.plugin-secret-key` only decrypt the former per-plugin files once, in `keychain/legacy-migration.ts`

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
- `shared-contracts/` is installed into `backend/` and `frontend/` as a *copy* (`file:`), not a symlink — after editing it, `npm run build` there and `npm install` in both consumers, or they keep compiling against the stale copy. The Bases parser/expression engine lives there (shared with the MCP `query_base` tool), not in `frontend/src/bases/`

**Frontend**
- `noUncheckedIndexedAccess` → null-check array/object access
- `erasableSyntaxOnly` is on: no constructor parameter properties, no `enum`, no namespaces
- Use `state.vaultTrees[vaultId]`; expanded paths are scoped `${vaultId}::${path}`
- Vite proxy requires backend on port 3000
- Frontend uses Zod 4, backend Zod 3 — the versions are not shared
- User settings are server-backed, never `localStorage`-only: account-wide through `state/userSettingsStore`, per-vault through `state/vaultSettingsStore`. `localStorage` is a cache, not the source of truth
- Where Obsidian keeps a setting in the vault there is no per-user copy (this also holds for the template folder and the daily-note folder/template: `templates.json`, `daily-notes.json`, no longer `.slatebase/config.json`): `readableLineLength`, `showLineNumber`, `spellcheck` (on/off), `attachmentFolderPath` and the other `app.json` keys live in `<vault>/.obsidian/app.json` (`obsidian-config/`, `state/vaultAppConfigStore`), the same for everyone who opens the vault, changing them needs write access. Don't add such a value to `vaultSettings`
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

**Themes**
- Obsidian themes are vault content (`<vault>/.obsidian/themes/<id>/`), the active one is `cssTheme` in `.obsidian/appearance.json` (shared by everyone using the vault) — not `data/`, not a user preference. Writing `appearance.json` must preserve its other fields and never overwrite a file that is not valid JSON
- `plugins/appearance/theme-bridge.css` derives Slatebase tokens from Obsidian variables only behind `:root[data-obsidian-theme]`, declared on `body` (themes set variables there; compat variables sit on `:root`, which is also why there is no cycle). Never bind Obsidian variables in base CSS — their defaults differ from ours and the look without a theme must not change
- The editor carries Obsidian marker classes next to its own (`mod-cm6`, `is-live-preview`, `is-readable-line-width` on the area in `CodeMirrorEditor.tsx`; `cm-s-obsidian`; `HyperMD-*`/`cm-inline-code`/`cm-highlight`/`cm-hashtag`/`cm-formatting` on the Live Preview decorations). They are for themes and plugin CSS only: no app CSS may select them (`CodeMirrorEditor.obsidianClasses.test.tsx` enforces it). Workspace, tab, ribbon and title-bar classes are deliberately not aligned (measured: no effect) — see `.kiro/specs/obsidian-themes-structure/`
- The theme store (`backend/src/theme-store/`, behind the `obsidian-theme-store` toggle) fetches only from `raw.githubusercontent.com` plus one fixed statistics URL (`releases.obsidian.md/stats/theme`, download counts, own allowlist, 1 MB limit; a failed statistics request never blocks the catalog) through `shared/guarded-fetch.ts` (host allowlist re-checked on every redirect, streaming size limit, **no credentials — never send `SLATEBASE_GITHUB_TOKEN` there**). Never build a URL from a `repo` that is not both `isValidRepo` and in the catalog (`../x` matches the plugin store's weaker pattern). Installed themes map to catalog entries by `manifest.name`; a failed lookup is a warning, never "up to date", and an install must drop the vault's cached update check. The theme CSS limit is 6 MB in three places (backend `MAX_THEME_CSS_SIZE`, `themeImport.ts`, `ThemeInjector`) — change them together
- `--text-muted` belongs to the Obsidian compat layer; Slatebase's dimmed text is `--text-subtle`. Don't reintroduce `--text-muted` in app CSS

**Plugin compat**
- Obsidian's view/modal class chain lives only in `plugins/compat/install-globals.ts` — never add a parallel definition in a second module
- `CachedMetadata` is produced only by `plugins/compat/metadata-parser.ts` — extend it there, not in `metadata-cache-shim.ts`
- Console output goes through `plugins/compat/log.ts` (`debug*` = intended trade-off, `warn*` = real gap, `*Once` for render/event paths)
- Core Obsidian command IDs are registered in `core-commands.ts` (editor-only) and `core-commands-app.ts` (needs React state, wired by `CommandPaletteContainer`)
- `OBSIDIAN_API_VERSION` (`obsidian-api-extensions.ts`) may only be raised once the APIs of that version are actually implemented
- Base classes plugins extend must survive ES5-downlevel `_super.call(this)` as well as native `super()` — see the `new.target` wrapper in `install-globals.ts`

**Tooling**
- A `.githooks/pre-commit` hook runs lint + `tsc` for both packages before every commit
