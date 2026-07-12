# Slatebase — Tech Stack & Dependencies

## Architecture

Monorepo: `backend/` + `frontend/`. Separate `package.json` + `node_modules` each. No workspace tooling.

## Backend

- **Runtime**: Node.js ≥ 22 (dev: v24, `tsx watch`; prod: `tsc` build)
- **Language**: TypeScript strict, ES2022, ESNext modules, `.js` extensions
- **Framework**: Hono (`@hono/node-server`)
- **Validation**: Zod
- **Logging**: Pino (structured JSON)
- **Test**: Vitest
- **Module**: ESM (`"type": "module"`)

## Frontend

- **Framework**: React 19, functional components
- **Build**: Vite 8
- **Language**: TypeScript ~6.0
- **State**: useReducer + Context (no external lib)
- **Icons**: Lucide React
- **Styling**: CSS Custom Properties (Design Tokens), Dark Mode
- **Markdown**: unified + remark-parse + remark-gfm + remark-frontmatter + custom Obsidian plugins
- **Test**: Vitest + Testing Library + Playwright (e2e)
- **Lint**: ESLint (react-hooks, react-refresh)
- **Proxy**: Vite → `http://localhost:3000`

## Commands

```bash
# Backend
npm run dev          # tsx watch (hot reload)
npm run build        # tsc → dist/
npm run test         # vitest --run

# Frontend
npm run dev          # Vite (port 5173)
npm run build        # Type-check + production build
npm run test         # vitest --run
npm run test:e2e     # Playwright
npm run lint         # ESLint
```

## Terminal-Regeln

- **Keine zusammengesetzten Befehle** (`&&`, `;`, `&`). Jeden Befehl einzeln ausführen.
- Statt `cd <dir> && <cmd>` den `cwd`-Parameter des Tools nutzen.
- Unabhängige Befehle als parallele Tool-Calls, nicht als Kette.

## Dependencies

### Backend
| Package | Purpose |
|---------|---------|
| hono | HTTP framework |
| zod | Schema validation |
| pino | Structured logging |
| tsx | Dev server |
| argon2 | Password hashing (argon2id) |
| adm-zip | ZIP extraction (plugin upload) |

### Frontend
| Package | Purpose |
|---------|---------|
| react / react-dom | UI framework |
| vite / vitest | Build + test |
| @testing-library/react | Component testing |
| playwright | E2E testing |
| unified / remark-parse / remark-gfm / remark-frontmatter | Markdown (MDAST) |
| micromark / mdast-util-from-markdown / mdast-util-to-markdown | Obsidian plugins (transitive, used directly) |
| unist-util-visit | Callout transformer (transitive, used directly) |
| yaml | Frontmatter display |
| highlight.js | Syntax highlighting |
| lucide-react | Icons |
| jszip | ZIP export (Firefox fallback) |
| d3-force | Knowledge graph layout |
| mermaid | Diagram rendering (lazy-loaded) |

### Geplant
- **better-sqlite3** — SQLite für Graph-Index (erst bei Performance-Bedarf, >10k Dateien)

## Dependency-Regeln

- **Pinned Versions** (exakt, kein `^`/`~`)
- Vor Installation: Downloads, Maintainer, letztes Update, Lizenz (MIT/Apache/BSD), `npm audit`
- Frage: Kann das mit Vorhandenem gelöst werden?
- `package-lock.json` immer committen

## Verbotene Dependencies

Kein Express/Fastify/Koa, kein Redux/Zustand, kein ORM, kein DI-Container, kein Tailwind/CSS-Framework, kein Mocking-Framework (Backend), kein JWT/Passport, kein Next.js, kein shadcn/ui, kein Framer Motion, kein CouchDB als interner Store.
