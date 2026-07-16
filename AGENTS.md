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
- Commands: `npm run test` (single), `npm run test:watch`

## Commands

```bash
# Backend
cd backend && npm run dev       # Hot reload
cd backend && npm run test      # Tests

# Frontend
cd frontend && npm run dev      # Vite (port 5173, proxies /api)
cd frontend && npm run test     # Unit tests
cd frontend && npm run lint     # ESLint
```

## Data Storage

Filesystem-based, no database. All under `backend/data/`:
- `vaults.json` + `vaults/<id>/` — Vault registry + files
- `vaults/<id>/.slatebase/` — Per-vault internal data (trash, versions, link-index, config)
- `users/`, `sessions/`, `shares.json` — Auth data
- `audit/` — Append-only JSONL (daily rotation)
- `chat/`, `sync/<vaultId>/`, `mcp/tokens/`, `plugins/<vaultId>/`

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
