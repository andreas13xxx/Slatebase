# Contributing to Slatebase

Thanks for your interest in contributing! This document covers everything from development setup to code conventions and deployment details.

## Issues First

Before starting work on a feature or bugfix, please open an [issue](https://github.com/andreas13xxx/Slatebase/issues) to discuss scope and approach.

Exception: Small typo fixes or obvious bugfixes can be submitted directly as a PR.

---

## Development Setup

### Prerequisites

- Node.js ≥ 22 (recommended: v24)
- npm (ships with Node.js)
- Git

### Getting Started

```bash
git clone https://github.com/andreas13xxx/Slatebase.git
cd Slatebase

# Backend
cd backend
npm install
cp .env.example .env
npm run dev

# Frontend (new terminal)
cd frontend
npm install
npm run dev
```

The frontend runs on `http://localhost:5173` and proxies `/api` requests to the backend (`localhost:3000`).

**Default login:** `admin` / `admin` (password change is enforced on first login).

### Commands

#### Backend (`cd backend`)

| Command | Purpose |
|---------|---------|
| `npm run dev` | Dev server with hot reload (tsx watch) |
| `npm run start` | Production start (Node.js native TS stripping) |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run test` | Run tests once (vitest --run) |
| `npm run test:watch` | Run tests in watch mode |

#### Frontend (`cd frontend`)

| Command | Purpose |
|---------|---------|
| `npm run dev` | Vite dev server (port 5173) |
| `npm run build` | Type-check + Vite production build |
| `npm run test` | Run unit tests once |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:e2e` | Playwright E2E tests |
| `npm run lint` | ESLint check |

---

## Project Structure

Slatebase is a monorepo with two independent packages — each has its own `package.json` and `node_modules`. No workspace-level tooling.

```
backend/           — Node.js REST API (Hono + TypeScript, ESM)
├── src/           — Source code (layered architecture)
│   ├── config/    — Zod-validated configuration
│   ├── logger/    — Pino structured logging
│   ├── vault/     — Data access (filesystem)
│   ├── business/  — Business logic orchestration
│   ├── auth/      — Authentication, sessions, CSRF
│   ├── user/      — User management, roles
│   ├── api/       — HTTP controllers + routes
│   ├── chat/      — Messaging system
│   ├── sync/      — CouchDB synchronization
│   ├── mcp/       — MCP server (AI integration)
│   ├── search/    — Full-text search + replace
│   ├── link-index/— Knowledge graph indexing
│   ├── plugin/    — Obsidian plugin store
│   ├── feature-toggle/ — Feature flag system
│   ├── realtime/  — SSE connections + event bus
│   ├── audit/     — Audit logging
│   └── import/    — File/folder import
├── config/        — Default configuration (default.json)
└── data/          — Runtime data (created at startup)

frontend/          — React SPA (Vite + TypeScript)
├── src/
│   ├── components/  — React components
│   ├── state/       — Reducers, contexts, action creators
│   ├── plugins/     — Markdown plugins + Obsidian compat layer
│   ├── i18n/        — Internationalization (de, en)
│   ├── api/         — API client (IApiClient interface)
│   └── utils/       — Shared utilities
└── public/        — Static assets
```

### Architecture

**Backend:** Layered, interface-driven design.

```
Config → Logger → Vault (Data Access) → Business → API (Controller)
```

- Every layer exposes an `I*` interface
- Composition root in `src/index.ts` — manual DI, no container
- Custom error classes per layer → mapped to HTTP status codes in controllers
- ESM with `.js` extensions on relative imports

**Frontend:** React with useReducer + Context.

- Separate providers per concern (App, Tab, Auth, Chat, Sync, Search, Realtime, ContextPanel, Feature)
- Action creators are standalone async functions (not hooks)
- Singleton `IApiClient` — never instantiate in components

---

## Code Conventions

### Language

| Context | Language |
|---------|----------|
| Code, comments, identifiers, JSDoc | English |
| UI labels | German |
| Issues, PRs, documentation | English or German |

### TypeScript

- Strict mode (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)
- No `any` — use explicit types or `unknown`
- No default exports — always named exports
- JSDoc on all public methods and interfaces

### Naming

| Category | Pattern | Example |
|----------|---------|---------|
| Interface | `I` prefix | `IVaultReader`, `ILogger` |
| Error class | `Error` suffix | `VaultNotFoundError` |
| Factory function | `create` prefix | `createLogger()` |
| Mock factory | `createMock` prefix | `createMockVaultManager()` |
| Action type | SCREAMING_SNAKE_CASE | `'VAULTS_LOADED'` |

### Imports

- **Backend:** Always `.js` extension on relative imports (Node.js ESM)
- **Frontend:** No extension (Vite resolves)
- Barrel exports via `index.ts` per module

### Styling

- CSS Custom Properties (design tokens) in `frontend/src/index.css`
- No hardcoded colors — always `var(--token-name)`
- Dark mode tokens in `:root[data-theme="dark"]` AND `@media (prefers-color-scheme: dark)`
- No Tailwind, no CSS framework

---

## Branching & Commits

1. Create a feature branch: `git checkout -b feature/short-description` (or `fix/...`)
2. Commit messages with Conventional Commits prefix:
   - `feat:` — New feature
   - `fix:` — Bugfix
   - `refactor:` — Restructuring without behavior change
   - `docs:` — Documentation only
   - `test:` — Tests only
   - `chore:` — Build, dependencies, tooling
3. Short title (max 70 characters), optional body after blank line
4. Stage specific files (`git add <file>`) rather than `git add .`
5. Never push directly to `main`

---

## Testing

Vitest is used in both packages. Tests are co-located (`*.test.ts` next to source).

```bash
cd backend && npm test
cd frontend && npm test
cd frontend && npm run test:e2e  # (backend must be running)
```

### Conventions

- Backend mocks: hand-written factories (`createMockLogger()`, etc.) — no mocking library
- Frontend mocks: `vi.fn()` for API client methods
- Test both success and error paths
- Integration tests: real filesystem with temp dirs, cleanup in `afterAll`

### Before Submitting a PR

- [ ] `npm test` passes in both `backend/` and `frontend/`
- [ ] `npm run build` succeeds in `frontend/`
- [ ] `npx tsc --noEmit` succeeds in `backend/`
- [ ] `npm run lint` passes in `frontend/`
- [ ] No `console.log` — use the logger

---

## Pull Requests

- PR title: short and descriptive (max 70 characters)
- Description: what changed, why, what was tested
- One logical change per PR
- Reference the related issue

---

## Architecture Principles

These decisions are intentional and should be preserved:

| Principle | Rationale |
|-----------|-----------|
| Interface-first design | Enables testing without mocking libraries |
| Manual DI (no container) | Explicit wiring, easy to follow |
| Filesystem-based storage | No DB dependency, easy backups, plain files |
| Atomic writes (temp → rename) | Crash-safe, no partial writes |
| Opaque tokens (no JWT) | Server-side session control, instant revocation |
| useReducer + Context | No external state lib needed |
| ESM throughout | Modern Node.js, tree-shakeable |

---

## Dependencies

- **Pinned versions** (exact, no `^` or `~`)
- Before adding: Does something in the project already solve this?
- Check: downloads, maintainer, last update, license (MIT/Apache/BSD preferred)
- Run `npm audit` after adding

### What NOT to introduce

Express/Fastify, Redux/Zustand, ORMs, DI containers, Tailwind/CSS frameworks, JWT, Passport.js, Next.js, mocking libraries (backend).

---

## Security Checklist

- [ ] `validateFilePath()` before every vault file access
- [ ] Zod validation on all new endpoints (controller layer)
- [ ] No secrets in logs or API responses
- [ ] No `eval()` or dynamic code execution with user input
- [ ] File size limits enforced before reading
- [ ] Atomic writes for all persistent data

---

## Configuration Reference

Backend configuration via `backend/config/default.json`, overridden by `SLATEBASE_*` environment variables (from `backend/.env` in dev, `docker.env` in Docker).

| Variable | Default | Description |
|----------|---------|-------------|
| `SLATEBASE_PORT` | `3000` | Server port |
| `SLATEBASE_HOST` | `127.0.0.1` | Bind address (`0.0.0.0` in Docker) |
| `SLATEBASE_LOG_LEVEL` | `info` | debug / info / warn / error |
| `SLATEBASE_MAX_FILE_SIZE` | `5242880` | Max file size in bytes (5 MB) |
| `SLATEBASE_ALLOWED_ORIGINS` | `http://localhost:5173` | CORS origins (comma-separated) |
| `SLATEBASE_TRUSTED_PROXIES` | *(empty)* | Trusted reverse proxy IPs/CIDRs |
| `SLATEBASE_CSRF_SECRET` | *(random)* | Persistent CSRF secret |
| `SLATEBASE_SYNC_SECRET` | *(random)* | AES-256-GCM key for sync credentials |
| `SLATEBASE_MCP_ENABLED` | `true` | Enable MCP server |
| `SLATEBASE_MCP_MAX_FILE_SIZE` | `5242880` | Max file size for MCP reads |
| `SLATEBASE_MCP_RATE_LIMIT` | `60` | MCP requests per minute per token |
| `SLATEBASE_EXTERNAL_PORT` | `8080` | Host port (Docker Compose only) |

---

## Docker Development Build

To build images locally (instead of using pre-built GHCR images):

```bash
docker compose -f docker-compose.dev.yml up -d --build
```

This uses the Dockerfiles in `backend/` and `frontend/` to build from source.

---

## Reverse Proxy

Slatebase is designed to run behind a reverse proxy for TLS termination. The frontend container serves the SPA via Nginx and proxies `/api/` to the backend internally.

### Nginx Proxy Manager

1. Add the NPM network to your compose setup:

```yaml
networks:
  slatebase-net:
    driver: bridge
  npm-net:
    external: true
    name: nginx-proxy-manager_default
```

2. Add `npm-net` to the frontend service and remove `ports:`:

```yaml
  frontend:
    networks:
      - slatebase-net
      - npm-net
    expose:
      - "80"
```

3. Set environment in `docker.env`:

```env
SLATEBASE_ALLOWED_ORIGINS=https://slatebase.example.com
SLATEBASE_TRUSTED_PROXIES=172.19.0.0/16
```

4. Create a Proxy Host in NPM pointing to `slatebase-frontend` on port `80`, enable SSL.

### Caddy

```
slatebase.example.com {
    reverse_proxy localhost:8080
}
```

### Traefik (Docker labels)

```yaml
services:
  frontend:
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.slatebase.rule=Host(`slatebase.example.com`)"
      - "traefik.http.routers.slatebase.tls.certresolver=letsencrypt"
      - "traefik.http.services.slatebase.loadbalancer.server.port=80"
```

### Trusted Proxies

Without `SLATEBASE_TRUSTED_PROXIES`, the backend ignores `X-Forwarded-For` headers and logs the proxy's internal IP. With it configured, audit logs show actual client addresses.

Formats: exact IP (`172.19.0.2`), CIDR (`172.19.0.0/16`), wildcard (`*` — not recommended).

---

## Data Storage

All data is filesystem-based under `backend/data/`:

```
data/
├── vaults.json           — Vault registry
├── vaults/<vaultId>/     — Vault files (Markdown, images, etc.)
├── users/                — User accounts (one JSON per user)
├── sessions/             — Active sessions
├── shares.json           — Vault sharing
├── audit/                — Append-only audit logs (JSONL, daily rotation)
├── chat/                 — Conversations, messages, unread counts
├── sync/<vaultId>/       — Sync config, checkpoints, conflicts, logs
├── mcp/tokens/           — API tokens (SHA-256 hashes)
└── plugins/<vaultId>/    — Plugin files (manifest, bundle, styles, settings)
```

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Sessions invalidated after restart | Set `SLATEBASE_CSRF_SECRET` in `docker.env` |
| 502 Bad Gateway | Backend not ready yet — wait ~10s for healthcheck |
| File upload fails (413) | Nginx `client_max_body_size` is 512 MB; adjust in `frontend/nginx.conf` |
| `EADDRINUSE` in dev | Previous process still bound — wait 5–10s |
| Backend import error | Check `.js` extension on relative imports |

---

## License

Slatebase is licensed under the [GNU Affero General Public License v3.0](LICENSE). By contributing, you agree that your code will be published under the same license.

---

Questions? Open an [issue](https://github.com/andreas13xxx/Slatebase/issues) or start a [discussion](https://github.com/andreas13xxx/Slatebase/discussions).
