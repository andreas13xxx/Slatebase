# Slatebase — Tech Stack & Build

## Architecture

Monorepo with two independent packages: `backend/` and `frontend/`. No shared workspace tooling — each package has its own `package.json` and `node_modules`.

## Backend

- **Runtime**: Node.js ≥ 22 (uses native `--experimental-strip-types` for production)
- **Language**: TypeScript (strict mode, ES2022 target, ESNext modules)
- **Framework**: Hono (lightweight HTTP framework with `@hono/node-server`)
- **Validation**: Zod (config schemas, request validation)
- **Logging**: Pino (structured JSON logging)
- **Dev server**: tsx (watch mode with `--env-file=.env`)
- **Test runner**: Vitest
- **Module system**: ESM (`"type": "module"`, `.js` extensions in imports)

## Frontend

- **Framework**: React 19 (functional components, hooks)
- **Build tool**: Vite 8
- **Language**: TypeScript (~6.0)
- **State management**: useReducer + Context (no external state library)
- **Icons**: Lucide React (SVG-based, tree-shakeable)
- **Fonts**: Inter (Google Fonts, loaded in index.html)
- **Styling**: Custom CSS with Design Tokens (CSS Custom Properties), Dark Mode via `prefers-color-scheme`
- **Markdown**: unified + remark-parse + remark-gfm + remark-frontmatter + custom Obsidian plugins (Wikilinks, Embeds, Callouts, Tags)
- **Testing**: Vitest + Testing Library (jsdom environment) + Playwright (e2e)
- **Property-Based Testing**: fast-check (both packages, devDependency)
- **Linting**: ESLint with react-hooks and react-refresh plugins
- **Dev proxy**: Vite proxies `/api` to `http://localhost:3000`

## Common Commands

### Backend (`cd backend`)

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start dev server with hot reload (tsx watch) |
| `npm run start` | Start with Node.js native TS stripping |
| `npm run build` | Compile TypeScript to `dist/` |
| `npm run test` | Run tests once (vitest --run) |
| `npm run test:watch` | Run tests in watch mode |

### Frontend (`cd frontend`)

| Command | Purpose |
|---------|---------|
| `npm run dev` | Start Vite dev server (port 5173) |
| `npm run build` | Type-check + Vite production build |
| `npm run test` | Run unit tests once (vitest --run) |
| `npm run test:watch` | Run tests in watch mode |
| `npm run test:e2e` | Run Playwright end-to-end tests |
| `npm run lint` | ESLint check |

## Configuration

- Backend config: `backend/config/default.json` (defaults), overridden by `SLATEBASE_*` env vars from `backend/.env`
- Frontend proxy config: `frontend/vite.config.ts`

## Key Dependencies

- **hono** — HTTP routing and middleware
- **zod** — Schema validation
- **pino** — Structured logging
- **react / react-dom** — UI framework
- **lucide-react** — Icon library (SVG-based, consistent design)
- **vite** — Build tooling and dev server
- **vitest** — Test runner (both packages)
- **highlight.js** — Syntax highlighting in Markdown code blocks
- **unified / remark-parse / remark-gfm** — Markdown parsing (MDAST)
- **jszip** — Client-side ZIP creation (vault export fallback for Firefox)
