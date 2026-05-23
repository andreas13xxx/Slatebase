# Slatebase — Project Structure

## Top-Level Layout

```
backend/          — Node.js REST API server
frontend/         — React SPA (Vite)
.kiro/specs/      — Feature specifications and design docs
.kiro/steering/   — Steering rules for AI assistants
```

## Backend (`backend/`)

```
src/
├── index.ts              — Composition root (DI wiring, server startup)
├── config/index.ts       — Zod-validated config (file + env overlay)
├── logger/index.ts       — Pino logger with ILogger interface
├── vault/
│   ├── index.ts          — VaultReader, VaultManager, path utilities, data models
│   └── registry.ts       — VaultRegistry (persistent vault metadata in vaults.json)
├── business/
│   ├── index.ts          — VaultService (business logic, orchestrates vault operations)
│   └── validation.ts     — Vault name validation rules
├── api/index.ts          — VaultController, route modules, error mapping
├── import/index.ts       — ImportService (file/folder import logic)
└── integration.test.ts   — Integration tests
config/
└── default.json          — Default server configuration
data/
├── vaults.json           — Persistent vault registry
└── vaults/<id>/          — Vault storage directories (one per vault)
```

## Frontend (`frontend/`)

```
src/
├── main.tsx              — React entry point
├── App.tsx               — Root component, layout, data fetching
├── App.css               — Global styles
├── types.ts              — Shared TypeScript interfaces (VaultInfo, DirectoryTree, etc.)
├── api/index.ts          — ApiClient (IApiClient interface + fetch implementation)
├── state/index.ts        — AppProvider, appReducer, action creators (useReducer + Context)
├── components/
│   ├── VaultList.tsx     — Vault selector/manager UI
│   ├── FileExplorer.tsx  — Directory tree navigation
│   └── FileViewer.tsx    — File content display
├── assets/               — Static images (hero, logos)
└── test-setup.ts         — Vitest/Testing Library setup
```

## Architectural Patterns

- **Layered backend**: Config → Logger → Vault (data access) → Business → API (controller)
- **Composition root**: All dependencies wired in `backend/src/index.ts` (manual DI, no container)
- **Interface-driven**: Each layer exposes an `I*` interface (IVaultReader, IVaultService, ILogger, etc.)
- **Custom error classes**: Domain errors (VaultNotFoundError, PathTraversalError, etc.) mapped to HTTP status codes in the controller layer
- **Frontend state**: Single reducer with discriminated union actions, async action creators that call ApiClient then dispatch
- **Co-located tests**: Test files sit next to their source files (`*.test.ts` / `*.test.tsx`)

## API Routes

All routes are prefixed with `/api/v1`:

| Method | Path | Purpose |
|--------|------|---------|
| GET | /vaults | List all vaults |
| POST | /vaults | Create a new vault |
| DELETE | /vaults/:vaultId | Delete a vault |
| GET | /vaults/:vaultId/tree | Get directory tree |
| GET | /vaults/:vaultId/files?path= | Get file content |
| POST | /vaults/:vaultId/import/file | Import single file |
| POST | /vaults/:vaultId/import/folder | Import folder |
| DELETE | /vaults/:vaultId/content?path= | Delete file/folder |

## Data Storage

Vaults are stored on disk under `backend/data/vaults/<vaultId>/`. The vault registry (`data/vaults.json`) maps vault IDs to names and storage paths. No database — all persistence is filesystem-based.
