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
├── auth/
│   ├── index.ts          — AuthService, SessionStore, interfaces, error classes
│   └── middleware.ts     — authMiddleware, csrfMiddleware, rateLimitMiddleware
├── user/
│   ├── index.ts          — UserService, UserRepository, RoleService, interfaces
│   └── validation.ts     — Profile/password validation (Zod schemas)
├── audit/
│   └── index.ts          — AuditService, AuditLogger, interfaces
├── api/
│   ├── index.ts          — VaultController, route modules, error mapping
│   ├── authRoutes.ts     — AuthController + login/logout/session routes
│   ├── userRoutes.ts     — UserController + profile/password routes
│   └── adminRoutes.ts    — AdminController + user management/config routes
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
| PUT | /vaults/:vaultId/files | Save file content |
| POST | /vaults/:vaultId/import/file | Import single file |
| POST | /vaults/:vaultId/import/folder | Import folder |
| DELETE | /vaults/:vaultId/content?path= | Delete file/folder |
| POST | /auth/login | Authenticate user |
| POST | /auth/logout | End session |
| GET | /auth/sessions | List own sessions |
| DELETE | /auth/sessions/:sessionId | Invalidate session |
| DELETE | /auth/sessions | Invalidate all other sessions |
| GET | /users/me | Get own profile |
| PUT | /users/me | Update own profile |
| PUT | /users/me/password | Change own password |
| DELETE | /users/me | Delete own account |
| GET | /admin/users | List users (admin) |
| POST | /admin/users | Create user (admin) |
| DELETE | /admin/users/:userId | Delete user (admin) |
| PUT | /admin/users/:userId/role | Change role (admin) |
| PUT | /admin/users/:userId/password | Reset password (admin) |
| PUT | /admin/users/:userId/suspend | Suspend user (admin) |
| PUT | /admin/users/:userId/unsuspend | Unsuspend user (admin) |
| GET | /admin/config | Get server config (admin) |
| PUT | /admin/config | Update server config (admin) |
| POST | /admin/restart | Restart server (admin) |
| GET | /admin/audit | Get audit log (admin) |
| GET | /vaults/:vaultId/shares | List vault shares (owner) |
| POST | /vaults/:vaultId/shares | Create share (owner) |
| DELETE | /vaults/:vaultId/shares/:userId | Revoke share (owner) |
| PUT | /vaults/:vaultId/shares/:userId | Update permission (owner) |
| POST | /vaults/:vaultId/transfer | Transfer ownership (owner) |

## Data Storage

Vaults are stored on disk under `backend/data/vaults/<vaultId>/`. The vault registry (`data/vaults.json`) maps vault IDs to names and storage paths. No database — all persistence is filesystem-based.

### Auth & User Data

```
data/
├── users/
│   ├── _index.json           — Username → userId mapping (fast lookup)
│   └── <userId>.json         — Individual user records (one file per user)
├── sessions/
│   └── <sessionId>.json      — Individual session records (one file per session)
├── shares.json               — Vault share entries (all shares in one file)
└── audit/
    └── YYYY-MM-DD.jsonl      — Append-only audit log (one file per day, JSONL format)
```

- **Users**: One JSON file per user, atomic writes (temp → rename). Index file for username lookups.
- **Sessions**: One JSON file per session. In-memory `Map<token, sessionId>` for fast validation, filesystem as source of truth.
- **Shares**: Single JSON file with all vault share entries. Atomic writes.
- **Audit**: Append-only JSONL files rotated daily. Never overwritten or deleted.
