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
- `vaults/<id>/.slatebase/` — Per-vault internal data (trash, versions, link-index, config)
- `users/`, `sessions/`, `shares.json` — Auth data
- `audit/` — Append-only JSONL (daily rotation)
- `chat/`, `mcp/tokens/`, `plugins/<vaultId>/`, `features.json`

## Common Pitfalls

- Missing `.js` extension in backend imports → runtime error
- `noUncheckedIndexedAccess` → null-check array/object access
- Vault IDs are deterministic SHA-256 (12 hex chars), not random
- Dot-prefixed files/dirs hidden from tree, search, stats (like Obsidian)
- Underscore-prefixed files/dirs are normal user content (like Obsidian)
- Internal vault data in `.slatebase/` (trash, versions, link-index, config)
- Use `state.vaultTrees[vaultId]` (not legacy `directoryTree`)
- Expanded paths scoped: `${vaultId}::${path}`
- Vite proxy requires backend on port 3000
- `useHistoryStack` hook removed — CM6 handles undo/redo natively
- `LineNumbers.tsx` removed — CM6 renders line numbers natively
- Backend `event-replay-buffer.ts` (not `replay-buffer.ts`)
- New remark plugins: `block-ref/`, `breaks/`, `preserve-table-code-escapes.ts`
- `@modelcontextprotocol/sdk` is a backend dependency (MCP transport)
- Frontend uses Zod 4 (`zod@4.4.3`), backend uses Zod 3 (`zod@^3.24.0`)
- Obsidian's view/modal classes live only in `plugins/compat/install-globals.ts` — the separate `suggest-modal*.ts` / `markdown-view-shim.ts` modules are gone; don't reintroduce a parallel definition
- Console output in the compat layer goes through `plugins/compat/log.ts` (`debug*` = intended trade-off, `warn*` = real gap, `*Once` for render/event paths) — `no-op-warning.ts` is gone
- Core Obsidian command IDs are registered in `core-commands.ts` (editor-only) and `core-commands-app.ts` (needs React state, wired by `CommandPaletteContainer`)
- Raw HTML is allowlist-only (`plugins/inline-html.ts`), shared by Live Preview and reading view — never widen it on one side alone
- `erasableSyntaxOnly` is on in the frontend: no constructor parameter properties, no `enum`, no namespaces
- A `.githooks/pre-commit` hook runs lint + `tsc` for both packages before every commit
- `CachedMetadata` is produced only by `plugins/compat/metadata-parser.ts` — extend it there, not in `metadata-cache-shim.ts`
- `OBSIDIAN_API_VERSION` (`obsidian-api-extensions.ts`) may only be raised once the APIs of that version are actually implemented
- Only a server 401 ends a session: a failed read (backend) or a failed request (frontend) is "unknown", never "gone"
- New modals/dialogs MUST use `useFocusTrap` from `src/hooks/useFocusTrap.ts` (no manual document-keydown + focus management)
- New interactive elements on non-button tags need `role="button"`, `tabIndex={0}`, `onKeyDown` (Enter/Space)
- `vitest-axe` is installed; new core components should have a co-located `*.a11y.test.tsx`
- `eslint-plugin-jsx-a11y-x` active in lint (ESLint 10 fork of jsx-a11y); 8 rules at `warn`, rest at `error`
