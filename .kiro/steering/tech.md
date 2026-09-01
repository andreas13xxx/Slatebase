# Slatebase — Tech Stack & Dependencies

## Architecture

Monorepo: `backend/` + `frontend/`. Separate `package.json` + `node_modules` each. No workspace tooling.

## Backend

- **Runtime**: Node.js ≥ 22 (dev: v24, `tsx watch`; prod: `tsc` build)
- **Language**: TypeScript strict, ES2022, ESNext modules, `.js` extensions
- **Framework**: Hono (`@hono/node-server`)
- **Validation**: Zod
- **Logging**: Pino (structured JSON)
- **Test**: Vitest (+ `@vitest/coverage-v8`, thresholds enforced in CI) + fast-check (property-based testing, `.pbt.test.ts` files)
- **Module**: ESM (`"type": "module"`)

## Frontend

- **Framework**: React 19, functional components
- **Build**: Vite 8
- **Language**: TypeScript ~6.0, `erasableSyntaxOnly` (no constructor parameter properties, `enum` or namespaces — type syntax must be strippable)
- **State**: useReducer + Context (no external lib)
- **Icons**: Lucide React
- **Styling**: CSS Custom Properties (Design Tokens), Dark Mode
- **Markdown**: unified + remark-parse + remark-gfm + remark-frontmatter + custom Obsidian plugins
- **Test**: Vitest (+ `@vitest/coverage-v8`) + Testing Library + Playwright (e2e) + fast-check (property-based testing, `.pbt.test.ts` files, e.g. `navigationHistoryState.pbt.test.ts`)
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
| zod | Schema validation (v3 — frontend uses v4, versions are not shared across the two packages) |
| pino | Structured logging |
| tsx | Dev server |
| argon2 | Password hashing (argon2id) |
| adm-zip | ZIP extraction (plugin upload) |
| fast-check | Property-based testing (devDependency, `.pbt.test.ts` files) |

### Frontend
| Package | Purpose |
|---------|---------|
| react / react-dom | UI framework |
| vite / vitest | Build + test |
| @testing-library/react | Component testing |
| @playwright/test | E2E testing |
| obsidian (dev) | Official Obsidian API type declarations (`obsidian.d.ts`, MIT) — ground truth for auditing `plugins/compat/` against, instead of hand-written shapes. Types only, never imported at runtime. It peer-deps on older `@codemirror/state`/`@codemirror/view` patch versions; an npm `overrides` entry pins those to the versions the app already uses (rather than `--legacy-peer-deps`), so plugin CM6 types resolve to one copy instead of a second, incompatible one |
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
| katex | LaTeX math rendering (lazy-loaded, same pattern as mermaid) |
| @codemirror/view | CodeMirror 6 editor view layer |
| @codemirror/state | CodeMirror 6 editor state |
| @codemirror/commands | CodeMirror 6 standard commands |
| @codemirror/language | CodeMirror 6 language support infrastructure |
| @codemirror/lang-markdown | CodeMirror 6 Markdown language |
| @codemirror/language-data | CodeMirror 6 code-block language registry |
| @codemirror/autocomplete | CodeMirror 6 autocompletion |
| @codemirror/search | CodeMirror 6 search/replace |
| @codemirror/lint | CodeMirror 6 lint infrastructure — re-exported to plugins (`window.__codemirrorLint`) **and** used by the core editor to draw the spellchecker's underlines |
| nspell | Hunspell-compatible spell checker (MIT), runs in the spellcheck Web Worker |
| dictionary-de | German Hunspell dictionary, 1.1 MB (GPL-2.0 OR GPL-3.0 — compatible with Slatebase's AGPL-3.0; an MIT project could not ship it) |
| dictionary-en | English Hunspell dictionary, 0.5 MB (MIT AND BSD) |
| @lezer/highlight | Lezer syntax highlighting primitives |
| @lezer/lr | Lezer LR parser runtime |
| @react-symbols/icons | File type icons (file explorer) |
| moment | Date/time formatting (Calendar plugin compat) |
| buffer | Node `Buffer` polyfill for plugin bundles (obsidian-git/isomorphic-git reference it at module top level) |
| dompurify | Sanitizes raw HTML blocks before they are rendered as real DOM (reading view) |
| zod | Schema validation (canvas parser, frontend-side; v4 — backend uses v3, versions are not shared across the two packages) |
| fast-check | Property-based testing (devDependency, `.pbt.test.ts` files, e.g. `chatState.bugfix.test.ts`, `chatState.preservation.test.ts`) |

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

### Rechtschreibprüfung → Web Worker + statische Wörterbücher
- **Nicht die Browser-Prüfung.** Der Editor ersetzt das native Kontextmenü durch ein eigenes (`editor-context-menu.ts`), und kein Browser gibt seine Rechtschreibvorschläge an JavaScript heraus — die native Prüfung könnte also nur unterringeln, nie korrigieren. `contentDOM` bekommt deshalb unbedingt `spellcheck="false"`, sonst stünden zwei verschiedene Unterringelungen unter denselben Wörtern.
- **Worker, nicht Main Thread**: Der Wörterbuchaufbau dauert gemessen ~817 ms (Deutsch). `spellcheck.worker.ts` besitzt die nspell-Instanz; der Main Thread schickt nur Wortlisten und bekommt die unbekannten zurück.
- **Wörterbücher als statische Assets**, nicht als Import: `dictionary-de@3` liest seine Daten mit `node:fs` (im Browser nicht auflösbar) und sperrt über `"exports": "./index.js"` den Deep Import der rohen `.aff`/`.dic`. Das `spellcheckDictionaries()`-Plugin in `vite.config.ts` liefert sie unter `/dictionaries/<lang>.{aff,dic}` aus — in Dev per Middleware, im Build per `emitFile` (inkl. GPL-Lizenztexten). Effekt: 1,6 MB bleiben aus dem JS-Bundle, der Browser cacht sie separat.
- **nginx** (`frontend/nginx.conf`) deklariert `.aff`/`.dic` als `text/plain`, damit `gzip_types` greift (sonst `application/octet-stream`, ungzippt). Cache bewusst 7 Tage statt `immutable`: die Dateinamen sind nicht content-hashed.
- **Nur der Haupteditor.** Die sieben `<textarea>`-Oberflächen (Canvas-Knoten, Canvas-Source, Snippet-Editor, Git-Sync-Felder, Plugin-Settings, Chat-Eingabe) haben keine Prüfung — sie sind bewusst keine CM6-Instanzen.
- **CSP:** Das ausgelieferte Frontend-Dokument hat aktuell keine Content-Security-Policy (nginx setzt nur `X-Frame-Options`/`X-Content-Type-Options`/`Referrer-Policy`; die CSP in `backend/src/index.ts` gilt nur für die Backend-Antworten selbst). Falls das Frontend je eine bekommt: der Modul-Worker braucht `worker-src 'self' blob:` (bzw. Fallback über `script-src`) und der Wörterbuch-Abruf `connect-src 'self'`.
- **Neue Sprache hinzufügen:** Eintrag in `SPELLCHECK_DICTIONARIES` (`vite.config.ts`) **und** in `SPELLCHECK_LANGUAGES`/`SPELLCHECK_LANGUAGE_LABELS` (`editor/spellcheck/protocol.ts`), plus je ein Core-Command in `core-commands.ts`/`core-command-i18n.ts`. Die Compound-Zerlegung (`compound.ts`) ist deutschspezifisch und wird über `compoundSplitting` nur für `de` aktiviert — für andere Sprachen mit produktiver Komposition müsste das explizit freigeschaltet werden.

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
- Ausnahme vom Scoping: Obsidians Host-Marker-Klassen (`theme-dark`, `is-mobile`, `mod-macos`, … aus `OBSIDIAN_HOST_BODY_CLASSES` in `body-classes.ts`) sitzen auf `<body>` und bleiben deshalb als Prefix *vor* dem Scope stehen — in den Scope gefaltet ergeben sie einen Selektor, der von einem Element verlangt, gleichzeitig Body und Plugin-Element zu sein, und der nie matcht. Der Prefix muss auf jede erzeugte Alternative (Self- **und** Descendant-Form), sonst greift eine Dark-Mode-Regel auch im Light-Mode.

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
