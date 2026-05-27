# Contributing to Slatebase

Thanks for your interest in contributing to Slatebase! This document describes the workflow and conventions for contributions.

## Issues First

Before starting work on a feature or bugfix, please open an [issue](https://github.com/andreas13xxx/Slatebase/issues). This lets us discuss whether the change fits the project and how to best implement it.

Exception: Small typo fixes or obvious bugfixes can be submitted directly as a PR.

## Development Setup

### Prerequisites

- Node.js ≥ 22
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

## Project Structure

Slatebase is a monorepo with two independent packages:

- `backend/` — Node.js REST API (Hono, TypeScript, ESM)
- `frontend/` — React SPA (Vite, TypeScript)

Each package has its own `package.json` and `node_modules`. There is no workspace-level tooling.

## Code Conventions

### Language

| Context | Language |
|---------|----------|
| Code, comments, identifiers, JSDoc | English |
| UI labels | German |
| Issues, PRs, documentation | English or German |

### TypeScript

- Strict mode is active (`noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`)
- No `any` types
- No default exports — always use named exports
- JSDoc on all public methods and interfaces

### Naming

| Category | Pattern | Example |
|----------|---------|---------|
| Interface | `I` prefix | `IVaultReader`, `ILogger` |
| Error class | `Error` suffix | `VaultNotFoundError` |
| Factory function | `create` prefix | `createLogger()` |
| Mock factory (tests) | `createMock` prefix | `createMockVaultManager()` |
| Action type | SCREAMING_SNAKE_CASE | `'VAULTS_LOADED'` |

### Imports

- **Backend:** Always use `.js` extension on relative imports (Node.js ESM requirement)
- **Frontend:** No extension (Vite resolves)
- Barrel exports via `index.ts` per module

### Styling (Frontend)

- CSS Custom Properties (design tokens) defined in `index.css`
- No hardcoded color values in components — always use `var(--token-name)`
- No Tailwind, no CSS framework

## Branching & Commits

1. Create a feature branch: `git checkout -b feature/short-description`
2. Commit messages with a type prefix:
   - `feat:` — New feature
   - `fix:` — Bugfix
   - `refactor:` — Code restructuring without behavior change
   - `docs:` — Documentation
   - `test:` — Adding or modifying tests
   - `chore:` — Build, dependencies, tooling
3. Short title (max 70 characters), optional body after a blank line

## Tests

We use [Vitest](https://vitest.dev/) in both packages.

```bash
# Backend tests
cd backend && npm test

# Frontend tests
cd frontend && npm test

# E2E tests (backend must be running)
cd frontend && npm run test:e2e
```

### Test Conventions

- Co-located: `*.test.ts` next to the source file
- Backend mocks: Hand-written factories (`createMockLogger()`, etc.) — no mocking library
- Frontend mocks: `vi.fn()` for API client methods
- Test both success and error paths

### Before Submitting a PR

- [ ] `npm test` passes in both `backend/` and `frontend/`
- [ ] `npm run build` succeeds in `frontend/` (type-check + build)
- [ ] `npx tsc --noEmit` succeeds in `backend/` (type-check)
- [ ] No `console.log` statements (use the logger instead)

## Pull Requests

- PR title: short and descriptive (max 70 characters)
- Description: What changed, why, and what was tested
- One PR per logical change (no mega-PRs with 5 features)
- Direct pushes to `main` are not allowed

## Architecture Principles

These decisions are intentional and should be preserved:

- **Interface-first design** — Every layer exposes an `I*` interface
- **Manual DI** — No DI container; all dependencies are wired in the composition root (`src/index.ts`)
- **Filesystem-based** — No database; all data stored as JSON/Markdown on disk
- **Atomic writes** — Write to temp file → `rename()` to target
- **Opaque tokens** — No JWT; server-side session management
- **useReducer + Context** — No external state management library

## Dependencies

- Use pinned versions (exact version, no `^` or `~`)
- Before adding: Do we really need this? Does something in the project already solve it?
- No packages that duplicate an already-solved problem (see `backend/package.json` and `frontend/package.json`)

## Security

- Call `validateFilePath()` before every vault file access (path traversal protection)
- Validate input with Zod on new endpoints
- No secrets in logs or API responses
- No `eval()` or dynamic code execution with user input

## License

Slatebase is licensed under the [GNU Affero General Public License v3.0](LICENSE). By contributing, you agree that your code will be published under the same license.

---

Questions? Open an [issue](https://github.com/andreas13xxx/Slatebase/issues) or start a [discussion](https://github.com/andreas13xxx/Slatebase/discussions).
