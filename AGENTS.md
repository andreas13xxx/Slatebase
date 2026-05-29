# AGENTS.md — Slatebase

Instructions for AI assistants working on this project.

## Project Overview

Slatebase is a self-hosted Knowledge-Context-Server for Markdown vaults. Monorepo with two independent packages: `backend/` (Node.js/Hono REST API) and `frontend/` (React/Vite SPA). No shared workspace tooling — each package has its own `package.json` and `node_modules`.

## Language

- **Code, comments, identifiers, JSDoc:** English
- **UI labels:** German
- **Requirements, specs, documentation:** German

## Architecture

### Backend (Layered, Interface-Driven)

```
Config → Logger → Vault (Data Access) → Business → API (Controller)
```

- Each layer exposes an `I*` interface
- Composition root in `src/index.ts` — manual DI, no container
- Custom error classes per layer, mapped to HTTP status codes in the controller
- ESM with `.js` extensions on all relative imports

### Frontend (React + useReducer)

- Separate reducers for separate concerns (`appReducer`, `tabReducer`, `chatReducer`, `syncReducer`)
- Action creators are standalone async functions (not hooks)
- `IApiClient` interface with fetch implementation
- Relative URLs — Vite proxy forwards `/api` to the backend

## Conventions

### Naming

| Category | Pattern | Example |
|----------|---------|---------|
| Interface | `I` prefix | `IVaultReader`, `ILogger` |
| Error class | `Error` suffix | `VaultNotFoundError` |
| Factory | `create` prefix | `createLogger()`, `createRouter()` |
| Mock factory | `createMock` prefix | `createMockVaultManager()` |
| Action type | SCREAMING_SNAKE_CASE | `'VAULTS_LOADED'` |

### Imports & Exports

- **Backend:** `.js` extension on relative imports (Node.js ESM requirement)
- **Frontend:** No extension (Vite resolves)
- Barrel exports via `index.ts` per module
- No default exports — always use named exports

### Error Handling

- Backend: Domain errors → `instanceof` check in controller → HTTP status
- API error format: `{ code: string, message: string, timestamp: string }`
- Frontend: API client throws `{ code, message }`, normalized via `toAppError()`
- Graceful degradation: log errors and skip rather than crash

## Testing

- **Framework:** Vitest (both packages)
- **Co-located:** `*.test.ts` next to source file
- **Backend mocks:** Hand-written factories (`createMockLogger()`, etc.) — no mocking library
- **Frontend mocks:** `vi.fn()` for API client methods
- **Integration tests:** Real filesystem with temp directories, cleanup in `afterAll`
- **Commands:** `npm run test` (single run), `npm run test:watch` (watch mode)

## Key Rules

1. **Always interface first** — then implementation
2. **No HTTP concerns** in business or vault layer
3. **`validateFilePath()`** before every vault file access (path traversal protection)
4. **Atomic writes** — write to temp file, then `rename()` to target
5. **No DI framework** — manual wiring is intentional
6. **No external state manager** — useReducer + Context is sufficient
7. **TypeScript strict** with `noUncheckedIndexedAccess` and `exactOptionalPropertyTypes`

## Common Pitfalls

- Forgetting `.js` extension on backend imports → runtime error
- `noUncheckedIndexedAccess` → array/object accesses need null checks
- `exactOptionalPropertyTypes` → `undefined` must be explicitly assigned for optional props
- Vite proxy → backend must be running on port 3000 for frontend dev
- Vault IDs are deterministic SHA-256 hashes (first 12 hex characters), not random

## Commands

### Backend (`cd backend`)

```bash
npm run dev          # Dev server with hot reload (tsx watch)
npm run start        # Production (Node.js native TS stripping)
npm run test         # Run tests once
npm run test:watch   # Run tests in watch mode
```

### Frontend (`cd frontend`)

```bash
npm run dev          # Vite dev server (port 5173)
npm run build        # Type-check + production build
npm run test         # Run unit tests once
npm run test:e2e     # Playwright E2E tests
npm run lint         # ESLint
```

## API Routes

All under `/api/v1`:

| Method | Path | Purpose |
|--------|------|---------|
| GET | /vaults | List all vaults |
| POST | /vaults | Create a new vault |
| DELETE | /vaults/:vaultId | Delete a vault |
| GET | /vaults/:vaultId/tree | Get directory tree |
| GET | /vaults/:vaultId/files?path= | Read file content |
| PUT | /vaults/:vaultId/files | Save file content |
| POST | /vaults/:vaultId/import/file | Import a single file |
| POST | /vaults/:vaultId/import/folder | Import a folder |
| DELETE | /vaults/:vaultId/content?path= | Delete file/folder |
| POST | /vaults/:vaultId/sync/config | Create sync configuration |
| GET | /vaults/:vaultId/sync/config | Get sync configuration |
| PUT | /vaults/:vaultId/sync/config | Update sync configuration |
| DELETE | /vaults/:vaultId/sync/config | Remove sync configuration |
| PUT | /vaults/:vaultId/sync/config/disable | Disable sync |
| PUT | /vaults/:vaultId/sync/config/enable | Enable sync |
| POST | /vaults/:vaultId/sync/trigger | Trigger manual sync |
| POST | /vaults/:vaultId/sync/analyze | Start analysis mode |
| GET | /vaults/:vaultId/sync/log | Get sync log (paginated) |
| GET | /vaults/:vaultId/sync/conflicts | Get open conflicts |
| POST | /vaults/:vaultId/sync/conflicts/:path/resolve | Resolve conflict |

### MCP (Model Context Protocol)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST/GET/DELETE | /api/v1/mcp | Bearer Token | MCP Streamable HTTP transport |
| GET | /api/v1/mcp/tokens | Session | List user's API tokens |
| POST | /api/v1/mcp/tokens | Session + CSRF | Create new API token |
| DELETE | /api/v1/mcp/tokens/:tokenId | Session + CSRF | Revoke a token |
| GET | /.well-known/mcp.json | None | MCP discovery metadata |

## Data Storage

- Filesystem-based, no database
- Vault data: `backend/data/vaults/<vaultId>/`
- Vault registry: `backend/data/vaults.json`
- Sync data: `backend/data/sync/<vaultId>/` (config, checkpoint, conflicts, log)
- MCP data: `backend/data/mcp/tokens/` (API tokens, per-user index)
- Config: `backend/config/default.json` + `SLATEBASE_*` env vars
