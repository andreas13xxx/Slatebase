# Slatebase — Tech Stack & Dependencies

## Architecture

Monorepo: `backend/` + `frontend/`. Separate `package.json` + `node_modules` each. No workspace tooling.

## Backend

- **Runtime**: Node.js ≥ 22 (dev: v24, `tsx watch`; prod: `tsc` build)
- **Language**: TypeScript strict, ES2022, ESNext modules, `.js` extensions
- **Framework**: Hono (`@hono/node-server`)
- **Validation**: Zod
- **Logging**: Pino (structured JSON)
- **Test**: Vitest (+ `@vitest/coverage-v8`, thresholds enforced in CI)
- **Module**: ESM (`"type": "module"`)

## Frontend

- **Framework**: React 19, functional components
- **Build**: Vite 8
- **Language**: TypeScript ~6.0, `erasableSyntaxOnly` (no constructor parameter properties, `enum` or namespaces — type syntax must be strippable)
- **State**: useReducer + Context (no external lib)
- **Icons**: Lucide React
- **Styling**: CSS Custom Properties (Design Tokens), Dark Mode
- **Markdown**: unified + remark-parse + remark-gfm + remark-frontmatter + custom Obsidian plugins
- **Test**: Vitest (+ `@vitest/coverage-v8`) + Testing Library + Playwright (e2e)
- **Lint**: ESLint (react-hooks, react-refresh, jsx-a11y)
- **Proxy**: Vite → `http://localhost:3000`

## Commands

```bash
# Backend
npm run dev            # tsx watch (hot reload)
npm run build          # tsc → dist/
npm run test           # vitest --run
npm run test:coverage  # vitest --run --coverage (enforces thresholds — what CI runs)

# Frontend
npm run dev            # Vite (port 5173)
npm run build          # Type-check + production build
npm run test           # vitest --run
npm run test:coverage  # vitest --run --coverage (enforces thresholds — what CI runs)
npm run test:e2e       # Playwright
npm run lint           # ESLint
```

CI runs `test:coverage`, not `test` — a coverage-threshold miss fails the build like a failing
test. Config: `backend/vitest.config.ts` and the `test.coverage` block in `frontend/vite.config.ts`.

## Terminal-Regeln

- **Keine zusammengesetzten Befehle** (`&&`, `;`, `&`). Jeden Befehl einzeln ausführen.
- Statt `cd <dir> && <cmd>` den `cwd`-Parameter des Tools nutzen.
- Unabhängige Befehle als parallele Tool-Calls, nicht als Kette.

## Dependencies

### Backend
| Package | Purpose |
|---------|---------|
| hono | HTTP framework |
| @hono/node-server | Node.js adapter for Hono |
| @modelcontextprotocol/sdk | MCP SDK (Streamable HTTP transport) |
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
| vitest-axe | Automated accessibility testing (axe-core for Vitest) |
| eslint-plugin-jsx-a11y-x | Static JSX accessibility lint rules (ESLint 10 compat fork) |
| unified / remark-parse / remark-gfm / remark-frontmatter | Markdown (MDAST) |
| micromark / mdast-util-from-markdown / mdast-util-to-markdown | Obsidian plugins (transitive, used directly) |
| unist-util-visit | Callout transformer (transitive, used directly) |
| yaml | Frontmatter display |
| highlight.js | Syntax highlighting |
| lucide-react | Icons |
| jszip | ZIP export (Firefox fallback) |
| d3-force | Knowledge graph layout |
| mermaid | Diagram rendering (lazy-loaded) |
| @codemirror/view | CodeMirror 6 editor view layer |
| @codemirror/state | CodeMirror 6 editor state |
| @codemirror/commands | CodeMirror 6 standard commands |
| @codemirror/language | CodeMirror 6 language support infrastructure |
| @codemirror/lang-markdown | CodeMirror 6 Markdown language |
| @codemirror/language-data | CodeMirror 6 code-block language registry |
| @codemirror/autocomplete | CodeMirror 6 autocompletion |
| @codemirror/search | CodeMirror 6 search/replace |
| @codemirror/lint | CodeMirror 6 lint infrastructure |
| @lezer/highlight | Lezer syntax highlighting primitives |
| @lezer/lr | Lezer LR parser runtime |
| @react-symbols/icons | File type icons (file explorer) |
| moment | Date/time formatting (Calendar plugin compat) |
| buffer | Node `Buffer` polyfill for plugin bundles (obsidian-git/isomorphic-git reference it at module top level) |
| dompurify | Sanitizes raw HTML blocks before they are rendered as real DOM (reading view) |
| zod | Schema validation (canvas parser, frontend-side) |

### Geplant
- **better-sqlite3** — SQLite für Graph-Index (erst bei Performance-Bedarf, >10k Dateien)

## Dependency-Regeln

- **Pinned Versions** (exakt, kein `^`/`~`)
- Vor Installation: Downloads, Maintainer, letztes Update, Lizenz (MIT/Apache/BSD), `npm audit`
- Frage: Kann das mit Vorhandenem gelöst werden?
- `package-lock.json` immer committen

## Verbotene Dependencies

Kein Express/Fastify/Koa, kein Redux/Zustand, kein ORM, kein DI-Container, kein Tailwind/CSS-Framework, kein Mocking-Framework (Backend), kein JWT/Passport, kein Next.js, kein shadcn/ui, kein Framer Motion, kein CouchDB als interner Store.

## Obsidian Plugin Compat — Architektur-Entscheidungen

### requestUrl → Backend-Proxy mit Allowlist
- Obsidian nutzt Electron's Node.js-Prozess für CORS-freie Requests.
- Slatebase ist eine Web-App → Browser-CORS gilt.
- Lösung: `POST /api/v1/proxy` leitet Requests serverseitig weiter.
- Sicherheit: SSRF-Schutz (private IPs blockiert), URL-Allowlist via `SLATEBASE_PROXY_ALLOWED_ORIGINS` Env-Var (kommasepariert, Wildcard-Prefix `*.domain.com` unterstützt). Leer = alles erlaubt.
- Limits: 30s Timeout, 10MB Request, 50MB Response.

### CodeBlockProcessor → Gemeinsame Registry, zwei Konsumenten
- `CodeBlockProcessorRegistry` (Module-Level-Singleton in `code-block-processor-registry.ts`).
- Plugins registrieren via `registerCodeBlockProcessor(language, handler, pluginId)`.
- **ViewMode**: `useEffect` nach Render → `processCodeBlocks(containerEl)` scannt DOM nach `<pre><code class="language-xxx">`, ersetzt durch Plugin-Container, ruft Handler auf.
- **Live Preview**: CM6 Widget-Decoration ruft denselben Handler auf (über CodeMirror-Extension).
- Lifecycle: `MarkdownRenderChild` pro gerenderten Block, `cleanupRenderChildren()` bei Unmount.

### EditorShim → CM6-Backend-First
- Priority: CM6 EditorView > Textarea > Internal Buffer.
- `setEditorViewAccessor(getActiveEditorView)` verdrahtet einmal bei Vault-Init.
- CM6-Operationen laufen über `view.dispatch()` → korrekte Undo-History, Extension-Awareness.
- `undo()`/`redo()`/`exec()` nutzen dynamic `import('@codemirror/commands')` um Top-Level-Import-Kosten zu vermeiden.
- Position-Konvertierung: Obsidian ist 0-indexed (line/ch), CM6 ist offset-basiert mit 1-indexed Zeilen.

### tokenClassNodeProp + syntaxTree-Wrapper
- `@codemirror/language` v6.x hat `tokenClassNodeProp` entfernt — Obsidian exportiert es noch.
- `token-class-node-prop.ts` definiert Singleton `NodeProp<string>` + Mapping (InlineCode→"inline-code", CodeMark→"inline-code formatting formatting-code", etc.)
- Parser wird in `CodeMirrorEditor.tsx` via `markdownLanguage.parser.configure({props: [tokenClassNodePropSource]})` konfiguriert.
- **InlineCode-Range-Problem**: Standard-Lezer inkludiert Backticks in `node.from/to`, Obsidian nicht. Fix: `createObsidianCompatSyntaxTree()` in `setting-tab.ts` wrapped `syntaxTree()` mit Proxy der `iterate()`-Callbacks für `InlineCode`-Nodes adjustierte from/to liefert (CodeMark-Children-basiert).
- Wichtig: Werte werden nach dem Callback wiederhergestellt (Tree-Navigation bleibt intakt).

### MetadataCacheShim → On-Demand-Parsing
- Obsidian's MetadataCache wird automatisch vom internen Parser befüllt. In Slatebase fehlt dieser Parser.
- Lösung: `VaultShim.read()` ruft `onFileRead` Callback → `MetadataCacheShim.populateFromContent(path, content)` → synchrones Parsing (Frontmatter, Tags, Links).
- `getFileCache()` prüft: expliziter Cache → contentStore on-demand-Parse → Tree-Fallback `{}` → `null`.
- Dataview's Worker bekommt `metadata` von `getFileCache()` und liest daraus Tags + Frontmatter (parst den Content-Body NICHT für diese Felder).

### Plugin-Fehler-Isolation
- `onLayoutReady`: try/catch für synchrone throws + `.catch()` für async rejections.
- `iterateAllLeaves`: Überspringt Leaves ohne view/containerEl.
- `activatePlugin`: 10s Timeout, Error → Plugin-Status `error`, nächstes Plugin wird geladen.
- Plugin-Registrierungs-Callbacks (addCommand, registerView, registerExtensions): Vault-Generation-Guard verhindert Registrierungen nach Vault-Wechsel.

### Plugin-Ausführungskontext → `data-plugin-id` beim Erzeugen
- Problem: `CssInjector` schopt Plugin-CSS über `[data-plugin-id]`. Plugins, die UI in geteiltes Workspace-DOM einhängen (Toolbars, Popovers), haben keinen geschopten Ancestor — ihr CSS greift dort nie.
- Lösung, zwei Hälften: (1) `plugin-execution-context.ts` verfolgt, welches Plugin gerade läuft; `createEl`/`createDiv` taggen jedes erzeugte Element damit. (2) `scopeSingleSelector()` emittiert pro Regel zusätzlich eine Self-Form (`sel[data-plugin-id="x"]`) neben der Descendant-Form.
- Kontext-Propagierung: synchron via `withPluginContext()` (Save/Restore, reentrant-sicher); über `await`-Grenzen hinweg via `scopeForPlugin()` (Proxy, bindet die ID in eine Closure und wrappt übergebene Callbacks). `EventSystem` speichert die ID am Listener und stellt sie beim `trigger()` wieder her.
- Bewusst kein `AsyncLocalStorage`-Äquivalent: alle Plugins laufen im selben JS-Realm ohne Iframes/Worker, und die Call-Sites mit bekannter pluginId sind abzählbar.

### Icon-Auflösung → lucide-react Dynamic-Import-Map
- Obsidian bundlet den kompletten Lucide-Satz; `setIcon(el, 'chevron-down')` funktioniert dort für jeden Namen. Unsere `addIcon()`-Registry allein ließ Plugin-Buttons leer.
- `lucide-icons.ts` nutzt `lucide-react/dynamicIconImports` (Dependency ist ohnehin da) — lazy pro Icon, kein Vorab-Bundle von ~1500 Icons, keine neue Dependency.
- Obsidian-Eigennamen (`*-glyph`) treffen meist nach Strippen des Suffix; Rest über `EXPLICIT_ALIASES`.

### Plugin-Store-Statistiken → aggregierter CDN-Feed statt API-Fanout
- `community-plugin-stats.json` (Obsidians eigene Aggregation: Downloads + Last-Updated pro Plugin-ID) statt `releases/latest` pro Repo.
- Ein CDN-Request ohne Rate-Limit, unabhängig von der Plugin-Anzahl — der Fanout hätte das geteilte GitHub-Limit bei ~6000 Plugins sofort erschöpft.
- Fehlerpfad: Fallback auf Stale-Cache, sonst `UpstreamError`.

### Plugin File-View Rendering (TextFileView-Plugins wie Kanban)
- `file-view-registry.ts`: Matcher-basiertes Routing (Frontmatter-Check für `.md`-Dateien, Extension-Check für andere)
- `TabContent.tsx`: Plugin-File-View Branch MUSS `mode !== 'edit'` prüfen, sonst ist Edit-Mode unerreichbar
- Container MUSS `data-plugin-id={pluginId}` Attribut haben (CSS-Scoping)
- `onViewActivated`-Callback: TextFileView-basierte Views NICHT in `activeViews` aufnehmen (sonst DOM-Raub durch PluginViewPanel)
- `view-registry.ts setViewState()`: `_loaded = true` direkt auf View setzen VOR `onOpen()` (kein `view.load()` — triggert unerwünschtes `onload()`)
- `TextFileView.addChild()`: MUSS `if (this._loaded) child.load()` aufrufen (nicht No-Op)
- `createEl(tag, stringArg)`: String-Argument ist className, NICHT textContent (Obsidian-Konvention)
