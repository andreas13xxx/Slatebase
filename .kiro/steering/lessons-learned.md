# Slatebase — Lessons Learned & Konventionen

Kompakte Referenz aus der bisherigen Entwicklung.

## Architektur

- **Interface-First:** `I*`-Interface definieren, dann implementieren
- **Manuelle DI:** Composition Root in `src/index.ts`, kein Framework
- **Separate Reducer:** Pro Feature ein eigener Provider/Reducer
- **Filesystem statt DB:** Interface-Abstraktion hält Tür für DB offen
- **Atomare Writes:** `<target>.${crypto.randomBytes(8).toString('hex')}.tmp` → `rename()`
- **Module-Level Bridge:** `Set<Callback>` für Cross-Provider-Events (`onX()`/`dispatchX()`)

## Code-Konventionen

- Backend: `.js`-Extension bei relativen Imports (ESM)
- Frontend: keine Extension (Vite)
- Barrel-Exports `index.ts`, keine Default-Exports
- Naming: `I`-Prefix, `Error`-Suffix, `create`-Prefix, `createMock`-Prefix, `SCREAMING_SNAKE_CASE` (Actions)
- Sprache: Code = Englisch, UI = Deutsch, Docs = Deutsch
- API-Errors: `{ code, message, timestamp }`
- Action Creators: Standalone async (kein Hook), nehmen `dispatch` + `apiClient`
- Validierung: ZWEI Schichten (Zod Controller + Business). Bei Änderungen IMMER beide prüfen.

## Frontend State

Provider-Hierarchie:
```
AuthProvider → I18nBridge → FeatureProvider → RealtimeBridge → AppProvider → SearchProvider → TabProvider → ContextPanelProvider → AppContent
```

- `RealtimeBridge` → Module-Level-Bridges für App/Tab-State
- `vaultTrees: Record<string, DirectoryTree | null>` (Multi-Vault)
- Expanded-Paths: `${vaultId}::${path}`
- `useTranslation()` Fallback-Deutsch ohne Provider (Tests brauchen keinen Wrapper)

## CSS

- Design Tokens in `index.css` — nie hartcodierte Farben
- Dark Mode: `:root[data-theme="dark"]` UND `@media (prefers-color-scheme: dark)`
- `appearance: none` + `disabled` → `opacity: 1`
- Dropdowns: `position: fixed` + JS (nicht abs in `overflow: hidden`)
- `--bg-primary` existiert NICHT → `--bg-base`, `--bg-surface`, `--bg-elevated`
- Feature-Farben als Token-Gruppe mit Prefix
- Broken Links: `underline dashed` (nie `line-through`)
- SVG-Text: nie in `scale()` — native Auflösung

## Realtime (SSE)

- Events: `chat:message`, `chat:unread`, `presence:update/init`, `vault:change`, `sync:conflict`, `notification:toast`, `server:shutdown`
- SSE ist immer aktiv wenn authentifiziert (kein Feature-Toggle, kein Fallback-Modus)
- `ConnectionStatus`: `'connected' | 'connecting' | 'disconnected'` (kein `'fallback'`)
- `RealtimeProvider` braucht nur `token` (kein `featureEnabled` Prop)
- `ConnectionIndicator` immer sichtbar (kein `visible` Prop)
- Tree nur refreshen wenn `vaultTrees[id] !== undefined`
- Tab-Content nur reloaden wenn `editBuffer === null`; bei `deleted` → Tab schließen
- Reconnect: Exponential Backoff 1s→60s (×2, ±500ms Jitter), 5 Fehler → `disconnected`
- Reconnect von `disconnected` → `connected` triggert `onReconnect` (Full Refresh)
- Neue Events: Bridge in `state/realtime*Bridge.ts`
- Tests: `EventSource` Mock in `test-setup.ts` (jsdom hat kein natives EventSource)
- **SSE-Auth**: Client holt Einmal-Ticket via `POST /auth/sse-ticket` (30s TTL), verbindet mit `?ticket=`. Fallback auf `?token=` wenn Ticket-Fetch fehlschlägt. Session-Token nie in URL.
- **SSE-Endpoint als HTTP-Intercept**: `/api/v1/events` MUSS im `createHttpServer`-Callback abgefangen werden, BEVOR der Request an Hono gelangt. Grund: `@hono/node-server` versucht nach Handler-Return immer `writeHead()` auf die Response — bei einer offenen SSE-Verbindung, die bereits `res.writeHead(200)` gerufen hat, wirft das `ERR_HTTP_HEADERS_SENT` und bricht die Verbindung ab. Die `sseRoutes.ts` (Hono-Route) ist dead code — der Intercept in `index.ts` ist die Single Source of Truth für SSE.
- **EventBus Subscriber**: `eventBus.subscribe(type | '*', callback)` für Cross-Cutting-Concerns (z.B. Cache-Invalidierung). Nie `eventBus.publish` monkey-patchen.

## Obsidian Markdown Plugins

- Pattern: `syntax.ts` → `mdast-util.ts` → `plugin.ts`
- Callouts: Transformer (kein Token, transformiert `blockquote`)
- `this.buffer()` vergiftet Stack — nur wenn `resume()` nötig
- `Effects`-Typ direkt importieren
- Embeds: 3 Typen (image/pdf/note), Pipe-Separator, beide Render-Pfade synchron halten
- `extractPlainText()` bei neuen Inline-Nodes erweitern
- Transitive Deps (`micromark`, `mdast-util-*`, `unist-util-visit`) direkt nutzbar

## Obsidian Plugin Compat

- Proxy-basiert (kein Worker — braucht DOM)
- Pro Plugin pro Vault eine AppShim (Vault-Wechsel: unload → neu → load)
- Emulierte Version: `1.4.0`
- Post-FCP Loading (`requestIdleCallback`/`setTimeout(50)`)
- ZIP: Root + Subdirectory-Layout (auto-detect)
- `savePlugin()` überschreibt nie `data.json`
- `isDesktopOnly` = Primärindikator
- CSS Scoping: `[data-plugin-id="<id>"]`, max 512 KB
- Command Palette: Ctrl+P/Cmd+P in `CommandPaletteContainer` (NICHT in PluginProvider)
- Command Palette immer aktiv (unabhängig von `obsidian-plugin-compat` Toggle)
- Plugin-Commands nur wenn `obsidian-plugin-compat` aktiviert, Built-in-Commands immer
- Editor-Commands via CustomEvent `slatebase:editor-command` (EditMode lauscht)
- Legacy-Event `slatebase:open-command-palette` weiterhin unterstützt (Backward-Compat)
- **Registry-Persistenz**: `loading` ist reiner Laufzeit-Status — wird nie dauerhaft gespeichert. `persistToBackend()` normalisiert `loading` defensiv zu `active`. Schreibvorgänge sind über Promise-Queue serialisiert (Snapshot bei Mutation, FIFO-Reihenfolge). Verwaiste `loading`-Einträge werden beim Laden automatisch zu `active` migriert.
- **Plugin-Aktivierung/Deaktivierung**: Toggle in PluginManagementPage nutzt `pluginContext.setPluginEnabled()` für echten Lifecycle (load bundle → activate / deactivate → unload). Reload erzeugt eine frische Instanz (`unloadPlugin` + `setPluginEnabled(true)`).
- **Cleanup bei Deaktivierung**: `cleanupPluginRegistrations(pluginId)` entfernt Commands, Settings, Views UND Ribbon-Icons. Wird bei `deactivated` und `error` Status aufgerufen. View-Detach ist async und wird awaited.
- **Vault-Wechsel-Guards**: `pluginSystemVaultIdRef` + `isCurrentContext()`-Check vor jedem async Schritt in `setPluginEnabled` und `loadPluginsForVault`. Registrierungs-Callbacks (`addCommand`, `addSettingTab`, `registerView`) prüfen ebenfalls die Vault-Generation.
- **WorkspaceShim `layoutReady`**: Property ist `true` (Plugins laden nach FCP, Layout ist immer ready). Plugins die `workspace.layoutReady` prüfen (Calendar) statt `onLayoutReady(cb)` brauchen diese Property.
- **ItemView-Shim**: Muss `registerEvent(ref)` und `register(cb)` bereitstellen (Views erben von Component). `addAction()` als No-Op-Stub.
- **Compatibility-Analyse**: Schreibt KEINE vollständigen Registry-Snapshots mehr. Aktualisiert nur `compatibilityLevel` lokal im Display-State — kein Backend-Write, der den Aktivierungsstatus überschreiben könnte.
- **Plugin-Sidebar-Tabs im Context Panel**: Plugin-Views werden inline in der `ContextPanelTabBar` gerendert (nach den eingebauten Tabs), im selben Icon-only-Stil. `draggable={false}` — sie nehmen aktuell NICHT am DnD-Reorder teil. Die Reducer-gesteuerte `tabOrder` enthält nur `ContextPanelViewId` (fester Union-Typ). Für volle DnD-Integration müsste `ContextPanelViewId` zu einem Template-Literal/generischen String erweitert werden (~2–3h Aufwand, betrifft ~15 Stellen + Persistenz-Validierung + Plugin-Deaktivierungs-Cleanup im Reducer).
- **Icon-Auflösung**: Obsidian-Icon-Namen (kebab-case) werden über `OBSIDIAN_ICON_MAP` + generische kebab→PascalCase-Konvertierung zu Lucide-React-Komponenten aufgelöst (`resolvePluginIcon()` in `ContextPanelTabBar.tsx`).
- **CodeMirror 6 Stubs**: `StateField`, `EditorView`, `ViewPlugin`, `Decoration`, `Prec`, `Compartment` etc. sind als No-op-Stubs auf `window.obsidian` + `window.__codemirrorState`/`window.__codemirrorView` bereitgestellt. Plugins die CM6-Extensions nutzen (Kanban Inline-Editor, Tasks) können laden, aber CM6-Features sind nicht funktional. **WICHTIG**: Beim Implementieren der Spec `live-preview-editor` (echtes CodeMirror 6) müssen diese Stubs durch die echten `@codemirror/*` Module ersetzt werden — dann funktionieren Plugin-CM6-Extensions automatisch mit.
- **TextFileView**: Basis-Klasse für datei-gekoppelte Views (Kanban). Erbt von `ItemView`, bietet `file`, `data`, `loadFile`/`onLoadFile`/`onUnloadFile`, `getViewData`/`setViewData`/`clear`, `requestSave` (2s debounce). `WorkspaceLeaf.setViewState` erkennt `state.state.file` und routet an `TextFileView.setState`.
- **Bundle-Loader require()**: Unterstützt `'obsidian'`, `'obsidian-daily-notes-interface'`, `'moment'`, `'@codemirror/state'`, `'@codemirror/view'`, `'@codemirror/language'`, `'@lezer/lr'`, `'@lezer/common'`, `'@lezer/highlight'`. Neue Module hier ergänzen wenn Plugins andere `require()`-Targets haben.
- **Globale Obsidian-Variablen**: `activeWindow` (= `window`), `activeDocument` (= `document`), `Component` (Lifecycle-Basisklasse), `Platform` (isMobile=false, isDesktop=true), `Menu`, `ViewState`, `HoverPopover`, `FileSystemAdapter`, `BaseComponent`, `ValueComponent`.
- **DOM-Prototype-Extensions (synchron)**: `addClass`, `removeClass`, `toggleClass`, `hasClass`, `setText`, `getText`, `appendText`, `setAttr`, `setAttrs`, `getAttr`, `show`, `hide`, `detach`, `empty`, `createEl`, `createDiv`, `createSpan` — MÜSSEN synchron in `setting-tab.ts` registriert werden (vor Plugin-Bundle-Evaluation). Die async-Version in `obsidian-api-extensions.ts` ist nur Fallback.
- **Custom Icon Registry**: `window.__obsidianCustomIcons` (Map<string, string>) — synchron in `setting-tab.ts`. Plugins rufen `addIcon(id, svgContent)` beim Load. `PluginRibbonIcon.tsx` prüft diese Map zuerst. SVG-Content ohne `<svg>`-Wrapper wird in 100x100-viewBox-SVG gewrapped.
- **Icon-Auflösung (Ribbon)**: 3-stufig in `PluginRibbonIcon.tsx`: 1) Custom-SVG-Registry (`__obsidianCustomIcons`), 2) `OBSIDIAN_ICON_MAP` (180+ Einträge) + kebab→PascalCase gegen vollständige `lucide-react/icons`, 3) Puzzle-Fallback mit `console.warn`. Unbekannte Icons werden geloggt, nie still verschluckt.
- **Plugin.addChild/removeChild**: Plugin-Klasse hat eigene `_children`-Liste + `load()`/`unload()`. Muss existieren — Plugins wie Dataview nutzen `this.addChild()` für Lifecycle-Management.
- **Modal-Shim**: Hat `containerEl`, `modalEl`, `titleEl`, `contentEl`, `scope`. `onOpen()` wird in try/catch gewrapped — Fehler werden direkt im Modal angezeigt statt silent zu failen. Kein Auto-Close leerer Modals (versteckt Fehler).
- **SettingPage**: Neue Basis-Klasse (Obsidian 1.13+) mit `rootEl`, `titlebarEl`, `containerEl`, `display()`, `hide()`. Templater erweitert diese.
- **ConfirmationModal**: Erweitert Modal. Templater nutzt es für Bestätigungsdialoge.
- **MarkdownRenderChild**: Erweitert Component mit `containerEl`. Dataview-Kernklasse.
- **requireApiVersion**: Gibt immer `true` zurück (wir emulieren 1.4.0).
- **getLanguage**: Gibt Browser-Locale zurück (`navigator.language.split('-')[0]`). Excalidraw braucht es.
- **CodeMirror 5 Legacy**: `window.CodeMirror` mit `defineMode`, `defineMIME`, etc. Templater nutzt es für Syntax-Highlighting.
- **StreamLanguage.define**: In `@codemirror/language`-Stub. Templater nutzt es.
- **RangeValue/RangeSet**: In `@codemirror/state`-Stub. Dataview erweitert `RangeValue`.
- **EditorView.decorations.compute**: Muss neben `.of()` auch `.compute()` bereitstellen.
- **FileSystemAdapter**: Stub-Klasse auf `window.obsidian`. LiveSync prüft `vault.adapter instanceof FileSystemAdapter`.
- **Plugin.registerCliHandler**: No-Op (Obsidian 1.12+ Desktop-CLI). Templater ruft es auf.
- **Keine Silent Failures**: Fehlende API-Methoden dürfen NIE still `undefined` zurückgeben. Entweder implementieren oder Fehler sichtbar machen (console.warn, Error im Modal). Der Grundsatz: Fehler aufdecken statt kaschieren.
- **Plugin CSS Injection**: `CssInjector` in `plugin-context.ts` integriert. Bei Plugin-Aktivierung: `apiClient.loadStyles()` → `cssInjector.inject(pluginId, css)`. Bei Deaktivierung: `cssInjector.remove(pluginId)`. Fire-and-forget (non-blocking). Ohne diese Integration werden Plugin-`styles.css` nie geladen — das war der Hauptgrund warum LiveSync-Settings kein Layout hatten.
- **Settings-Container `data-plugin-id`**: Das native Settings-UI (`plugin-settings-native` div in PluginManagementPage) MUSS `data-plugin-id={pluginId}` haben, sonst greifen die gescoped CSS-Selektoren des Plugins nicht (`[data-plugin-id="..."] .class`).
- **CSS-Scoping `body`-Selektor**: `scopeSingleSelector()` in `css-injector.ts` ersetzt `body` durch den Scope-Selector (wie `:root`). Vorher wurde `body` als Descendant geprefixed (`[scope] body { }` — matcht nie). Jetzt: `body` → `[scope]`, `body.class` → `[scope].class`, `body .child` → `[scope] .child`.
- **Document-Guard in DOM-Prototype-Patches**: `Node.prototype.createEl/createDiv/createSpan` prüfen `this.nodeType === 9` (Document) und überspringen `appendChild`. Grund: Plugins greifen auf `containerEl.doc.createEl(...)` zu — `doc` gibt `ownerDocument` zurück, und `document.appendChild(el)` wirft `DOMException: Cannot have more than one Element child`. Gleiches gilt für `appendText`.
- **`Element.prototype.doc` / `.win`**: Obsidian-spezifische Getter. `doc` → `this.ownerDocument`, `win` → `this.ownerDocument.defaultView ?? window`. Plugins (LiveSync) nutzen `containerEl.doc` um Elemente im richtigen Document zu erzeugen.
- **Obsidian CSS-Variablen (Dark Mode)**: `obsidian-compat.css` muss im Dark-Mode-Block ALLE relevanten Variablen überschreiben (`--background-primary`, `--background-secondary-alt`, `--text-normal`, `--interactive-normal`, etc.) — nicht nur `--color-base-*`. Referenziert Slatebase Design Tokens via `var(--bg-base, #fallback)` für automatische Theme-Synchronisation.
- **Obsidian Sizing-Variablen**: `--size-4-*` (Spacing-Scale), `--radius-s/m/l/xl`, `--clickable-icon-size`, `--input-height`, `--font-ui-smaller/small/medium/large`, `--font-semibold`, `--line-height-tight` in `obsidian-compat.css` definieren. Plugins wie LiveSync referenzieren diese.

## Workspace Leaf Compat

- **Virtual Path Convention**: Plugin-View-Tabs nutzen `__view::{viewType}` als Pfad im Tab-System (konsistent mit `__graph__`)
- **ViewRegistry**: Plugin-Ownership per Registration (`pluginId`). `unregisterAllForPlugin()` räumt bei Deaktivierung auf.
- **LeafLocation**: `'main' | 'right-sidebar'`. Beide Sidebar-Locations (left/right) werden im Context Panel gerendert (kein separates Left Panel).
- **ItemView DOM**: `containerEl` hat CSS-Klasse `view-content`, `contentEl` ist Kind mit `plugin-view-content`. React rendert nur den Container, View manipuliert DOM direkt (Obsidian-Muster).
- **TabViewBridge**: Module-Level-Bridge (`onOpenPluginViewTab`/`dispatchOpenPluginViewTab` etc.) — folgt dem `realtimeVaultBridge`-Pattern. ViewRegistry → TabProvider ohne React-Context-Dependency.
- **Tab-Deduplication**: Vor OPEN_TAB prüfen ob Tab mit gleichem `__view::{viewType}` existiert → dann ACTIVATE_TAB statt neuen Tab.
- **Plugin-View-Tab in TabContent**: `filePath.startsWith('__view::')` → imperativer DOM-Append von `containerEl` via ref-Callback. Keine React-Render-Schleife. WICHTIG: `key={`plugin-view-${activeTab.id}`}` auf dem Root-div setzen — ohne Key recycled React das DOM-Element beim Tab-Wechsel (gleicher Tag an gleicher Position) und der imperativ eingefügte `containerEl` bleibt als Geister-DOM erhalten.
- **Sidebar-Views im Context Panel**: `sidebarViews` Map in PluginContext. Dynamische Tabs/Sections mit imperativem `containerEl`-Mount.
- **getActiveFile() bei Plugin-Tab**: Gibt `null` zurück wenn aktiver Tab `__view::` Prefix hat (Req 3.7).
- **Lifecycle-Fehler-Isolation**: `onOpen()`/`onClose()` Exceptions werden geloggt (`console.error`), blockieren aber nie den Cleanup. Per-Leaf try/catch bei Plugin-Deaktivierung und Vault-Wechsel.
- **openLinkText**: Nutzt bestehenden `resolveWikilinkTarget()` aus `link-resolver.ts`. Unresolved → `console.warn` + No-Op.
- **Iteration**: `iterateAllLeaves` (alle Locations), `iterateRootLeaves` (nur main). Exception in einem Callback blockiert nicht die restlichen.
- **Compatibility Analyzer**: 15 Workspace-Leaf-Methoden von `UNSUPPORTED_METHODS` nach `SUPPORTED_METHODS` verschoben. Sets MÜSSEN disjunkt bleiben.

## Vault Sync

- `SLATEBASE_SYNC_SECRET` ≠ `SLATEBASE_CSRF_SECRET` (getrennt!)
- SyncLock: In-Memory Map, single-threaded → kein TOCTOU
- Checkpoint nur bei Erfolg updaten, atomar schreiben
- Konflikterkennung: mtime Check gegen Checkpoint-mtime
- Owner-Only (kein Admin-Bypass)
- **Sync-Exclusions**: `.slatebase/trash/`, `.slatebase/versions/`, `.slatebase/link-index.json`, `.trash/`, `.mobile/` — nicht gesynct
- **Sync-Included**: `.slatebase/config.json`, `.obsidian/` (via `i:`/`ps:`-Prefixes), reguläre Dateien
- **CouchDB `_`-Limitation**: Top-Level-Dateien mit `_`-Prefix können nicht gesynct werden (CouchDB reserviert `_` für `_design/`, `_local/`). Subdirectory-Dateien mit `_` sind kein Problem.
- **Conflict-Kategorisierung**: 4 Typen (content_conflict, local_deleted, remote_deleted, rename_conflict). ConflictCategorizer ist pure Function, SyncEngine ruft bei Pull auf.
- **Conflict-Resolution Rollback**: ConflictResolver: Backup → Write → Push → bei CouchDB-Fehler Rollback. Batch max 100, per-item Error Isolation.
- **Auto-Resolution**: `AutoResolutionEngine.evaluate()` pure Function. Config in `data/sync/<vaultId>/auto-resolution.json`. Strategies: newer_wins, remote_wins, local_wins, skip.
- **Scheduler Pause/Resume**: Wizard pausiert Scheduler bei Mount (`pauseSyncScheduler`), resumed bei Unmount. Set<string> für paused vaults, Timer bleibt registriert.
- **SSE sync:conflict Event**: Backend publiziert bei neuen Konflikten mit `category`-Feld. Frontend: Module-Level-Bridge `realtimeSyncBridge.ts` (`onRealtimeSyncConflict`/`dispatchRealtimeSyncConflict`).
- **SyncService EventBus Integration**: `setEventBus()` + `vaultOwnerResolver` als optionale Setter (Dependency-Order Problem in Composition Root). Events nur an Vault-Owner targeted.

## .slatebase/ Verzeichnis

- Analog zu `.obsidian/` — zentrale Ablage für Slatebase-interne Vault-Daten
- Pfad: `<vaultPath>/.slatebase/`
- Enthält: `config.json`, `link-index.json`, `trash/`, `versions/`
- Automatisch versteckt (Dot-Prefix-Regel) aus Tree, Search, Statistics, Link-Index
- Wird teilweise gesynct: `config.json` ja, `trash/`+`versions/`+`link-index.json` nein
- Services verwenden statische Konstanten für den Pfad (z.B. `TrashService.TRASH_DIR`, `VersionService.VERSIONS_DIR`)
- `fs.mkdir(dir, { recursive: true })` in persist-Methoden erstellt `.slatebase/` automatisch

## File Visibility (wie Obsidian)

- **Dot-Prefix** (`.obsidian/`, `.slatebase/`, `.hidden`): versteckt aus Tree, Search, Statistics, Link-Index
- **Underscore-Prefix** (`_drafts/`, `_notes.md`): normal sichtbar, durchsuchbar, indexiert, gesynct (außer Top-Level wegen CouchDB)
- VaultReader.scanDirectory: filtert `entry.name.startsWith('.')` (sowohl Dateien als auch Verzeichnisse)
- statistics-service: filtert `entry.name.startsWith('.')`
- link-index findMarkdownFiles: filtert `.`-Prefix Dirs und Files
- search-service: kein eigenes Filtering (arbeitet mit VaultService-Files die schon gefiltert sind)
- sync-engine: eigene `isExcludedPath()`-Funktion für differenziertes Sync-Verhalten

## MCP

- Bearer Token: SHA-256-Hash, Klartext nur bei Erstellung
- `StreamableHTTPServerTransport` verwenden
- Write-Tools über `VaultService`, nie direkt Filesystem
- `onUserInvalidated` invalidiert alle Tokens

## Docker

- Production: `tsc`-Build (nicht `--experimental-strip-types`)
- `SLATEBASE_HOST=0.0.0.0` im Container
- Trusted Proxies: Proxy-Subnet setzen
- Healthcheck: 401 = healthy, `start_period: 10s`
- Templates in `assets/` (nicht `data/`) — Volume-Mount auf `/app/data` überschreibt keine statischen Templates

## i18n

- `TranslationShape` (rekursiver Mapped Type) für neue Sprachen
- `TranslateFn`-Typ für Hilfsfunktionen
- `en.ts` importiert `type { de }` direkt

## Häufige Stolperfallen

1. `.js`-Extension vergessen → Runtime-Error
2. Singleton `apiClient` verwenden — nie `new ApiClient()` in Komponenten
3. `vite.config.ts`: `defineConfig` aus `vitest/config` (nicht `vite`)
4. Vault-IDs: deterministisch (SHA-256, 12 Hex), nicht random
5. Dot-Prefix-Dateien/Verzeichnisse aus Tree, Search, Statistics, Link-Index gefiltert (wie Obsidian)
6. Hono: `/users/search` VOR `/users/me` registrieren
7. Client ≠ Server Filesystem (Export braucht Download-Endpoint)
8. `showDirectoryPicker`: nur Chromium, JSZip-Fallback
9. `EADDRINUSE`: 5–10s warten
10. Windows: kein `head`, `tail`, `grep` in Hooks
11. `PublicUserInfo`-Erweiterungen: `toPublicInfo()` + Login-Response + Mocks synchron
12. `__dirname` nach tsc prüfen (relative Pfade verschieben sich)
13. Debounced API-Calls: IMMER AbortController (Race Conditions)
14. `Ctrl+Shift+F`: `e.preventDefault()` für Browser-Suche
15. `.slatebase/` enthält alle internen Daten (trash/, versions/, link-index.json, config.json). Dot-Prefix-Regel versteckt es automatisch aus Tree/Search/Stats.
16. DropZone + internes DnD: `stopPropagation()` im internen Handler, damit DropZone-Overlay nicht triggert
17. Favorites-Store: Zustandsänderungen erzwingen Re-Render über Counter-State (Store ist kein React-State)
18. Image Paste: nur `image/*` MIME-Typen abfangen, Text-Paste NICHT intercepten (`preventDefault` nur bei Bild)
19. `EventSource` existiert nicht in jsdom — Mock in `test-setup.ts` erforderlich für Tests die RealtimeProvider rendern
20. Command Palette Ctrl+P: lebt in `CommandPaletteContainer` (nicht in PluginProvider). Editor-Commands via `window.dispatchEvent(new CustomEvent('slatebase:editor-command', { detail: { action } }))` — EditMode lauscht darauf
21. Link-Index Persistenz v2: Tags + Properties werden neben forwardLinks gespeichert. v1→v2 Auto-Migration beim Laden (rebuild triggers). Schema-Feld `version: 2` als Diskriminator. Gespeichert unter `.slatebase/link-index.json`.
22. GraphNode hat jetzt `id` (unique) + `type` ('file'|'tag'|'property') + optionales `path`. Frontend SimNode nutzt `node.id` als Identifier, `node.path ?? node.id` für File-Öffnung.
23. Tag-Extraction: CSS Hex-Farben (`#fff`, `#bb7739`) werden als Tags erkannt — bekannter Edge-Case. Regex erfordert Buchstabe nach `#`, aber Hex `a-f` qualifiziert.
24. GraphSettingsPanel: `position: absolute` im Container. Search-Container braucht `right: 48px` (statt 12px) um Platz für Settings-Toggle zu lassen.
25. `AppPage`-Typ nur in `App.tsx` definieren und exportieren. Andere Dateien (SidebarToolbar, UserMenu) importieren ihn — nie lokal duplizieren, sonst bricht `tsc -b`.
26. `extractErrorMessage(err, fallback)` aus `utils/error.ts` verwenden — nie inline `err as { message }` Pattern. Fallback ist der i18n-String für den konkreten Kontext.
27. EventBus NIE monkey-patchen (`eventBus.publish = ...`). Stattdessen `eventBus.subscribe('vault:change', cb)` für Cross-Cutting-Concerns (Cache-Invalidierung, Audit-Hooks).
28. `X-Request-Id` Header: Middleware generiert UUID pro Request, loggt im Error-Handler mit. Eingehender Header von Upstream-Proxy wird wiederverwendet (max 128 Zeichen).
29. SSE-Endpoint + MCP-Endpoint: beide als HTTP-Intercept in `createHttpServer`, NICHT via Hono-Route. `@hono/node-server` finalisiert Response nach Handler-Return → bricht offene Streams. Ticket-Auth dort manuell implementieren (Ticket-First, Token-Fallback).
30. Sync-Conflict-Resolution: `ConflictWizard` nutzt `useAppContext()` für `apiClient` — braucht keinen expliziten `apiClient`-Prop. SSE-Bridge `realtimeSyncBridge.ts` folgt dem Module-Level-Pattern wie `realtimeVaultBridge.ts`.
31. Plugin-View-Tabs: Virtual Path `__view::{viewType}` — Tab-Deduplication vor OPEN_TAB prüfen. `getActiveFile()` gibt `null` bei Plugin-Tabs. DOM-Append via ref-Callback (imperativ, nicht React-managed). `layout-change` Event bei Plugin-View open/close emittieren.
32. Status Bar: Module-Level-Store mit `useSyncExternalStore` (nicht `useState`) — mehrere Konsumenten (App.tsx + AppearanceSection) müssen synchron reagieren. `useStatusBar()` nutzt Subscriber-Pattern wie `favoritesStore`.
33. `checkSessionAlive()` in App.tsx: Neues `IApiClient`-Methode. Leichtgewichtiger HEAD-Request gegen Session-Endpoint. Tests MÜSSEN diese Methode im MockApiClient bereitstellen (sonst `is not a function` Error). Default im Test: `mockResolvedValue(true)`.
34. Settings Sections: `appearance` Section unter account hinzugefügt (Status Bar Toggle). Total ist jetzt 16 Sections (8 account + 3 vault + 5 admin). Tests die feste Zahlen prüfen, müssen bei neuer Section angepasst werden.
35. Welcome Vault v2 Route: eigene `welcomeVaultRoutes.ts` (nicht in adminRoutes). Rate-Limit 3/h pro User separat von Login-Rate-Limit. `createWelcomeVault()` in IApiClient hinzufügen — Tests brauchen Mock.
36. Workspace Store `initialize()` MUSS auf Module-Level laufen (nicht im useEffect). Sonst lesen useState-Initializer den Default-State statt den persistierten. Der „Persist tabs"-Effekt braucht einen `isRestoringRef`-Guard, sonst überschreibt er die gespeicherten Tabs mit `[]` beim ersten Render.
37. Plugin-Shim DOM-Extensions MÜSSEN synchron registriert werden (in `setting-tab.ts`, vor Plugin-Bundle-Evaluation). Async-Import (`obsidian-api-extensions.ts`) reicht NICHT — Plugins evaluieren ihre Klassen-Definitionen sofort beim `import()` und brauchen `addClass`, `createEl` etc. zu diesem Zeitpunkt. Gleiches gilt für die Custom-Icon-Registry (`window.__obsidianCustomIcons`), `addIcon`, `getIcon`.
38. Plugin-Klasse `addRibbonIcon`: Im plugin-loader.ts Inline-Fallback gibt ein No-Op-Stub ein leeres div zurück OHNE die Registry aufzurufen. Das ist akzeptabel — die echte Version in `setting-tab.ts` wird beim tatsächlichen Plugin-`onload()` genutzt (Plugins werden erst nach Shim-Registration geladen).
39. Plugin-Icon-Auflösung: Plugins registrieren custom SVGs via `addIcon(id, svgInnerContent)` (OHNE `<svg>`-Wrapper, implizites 100x100 viewBox). `PluginRibbonIcon.tsx` muss prüfen: 1) Custom-SVG-Registry, 2) Lucide-Mapping, 3) kebab→PascalCase-Fallback. SVG-Content ohne `<svg>`-Tag muss gewrapped werden mit viewBox 0 0 100 100 + stroke=currentColor.
40. Plugin-`loadData()` gibt `null` zurück bei frisch installierten Plugins ohne `data.json`. Plugins die `this.settings = await this.loadData()` statt `Object.assign({}, DEFAULT, await this.loadData())` machen, crashen bei Settings-Zugriff. Das ist ein Plugin-Bug, kein Shim-Bug.
41. Plugin-Modal: `modalEl` ist das eigentliche Fenster-Element (innerhalb von `containerEl`). Plugins rufen `this.modalEl.addClass(...)` auf. Obsidian-Modals haben zusätzlich `titleEl`, `scope`, `setTitle()`, `setContent()`. Fehlt `modalEl` → "can't access property 'addClass', o is undefined".
42. Plugin-CSS wird NICHT automatisch geladen — `CssInjector` muss explizit in `plugin-context.ts` aufgerufen werden (`apiClient.loadStyles()` → `cssInjector.inject()`). Ohne das hat ein Plugin kein Styling (war der Grund warum LiveSync-Settings vertikal statt horizontal waren).
43. `Node.prototype.createEl/createDiv` auf `document` aufrufen → `DOMException`. Lösung: Document-Guard (`nodeType === 9` → skip `appendChild`). Plugins kommen über `containerEl.doc.createEl(...)` oder `activeDocument.createDiv(...)` dahin.
44. CSS-Scoping von `body`-Selektoren: `[data-plugin-id="x"] body {}` matcht nie (body ist Ancestor, kein Descendant). `body` muss wie `:root` durch den Scope-Selector ersetzt werden.
45. **Proxy CORS-Bypass für Plugins**: `sandbox.ts` `createFetchProxy` routet Cross-Origin-Requests über `/api/v1/proxy`. Gleiches für XHR (`createXHRProxy`). `isCrossOrigin()` + `fetchViaProxy()` als Module-Level-Helper. Same-Origin-Requests gehen direkt durch.
46. **localStorage-Key für Auth**: `slatebase_token` und `slatebase_csrf` — NICHT `auth_token`. Alle Plugin-Compat-Dateien (sandbox.ts, setting-tab.ts, plugin-loader.ts, vault-shim.ts) müssen die korrekten Keys verwenden.
47. **Proxy Authorization-Header**: Backend-Proxy (`proxyRoutes.ts`) strippt nur `Bearer`-Auth-Headers (Slatebase-Session), lässt `Basic`-Auth durch (Plugin-Credentials für CouchDB etc.).
48. **Proxy Content-Type + Body**: Node.js `fetch` mit String-Body setzt automatisch `Content-Type: text/plain` und überschreibt manuelle Header. Fix: Body als `Buffer.from(body, 'utf-8')` senden. Zusätzlich: `content-type` aus der headers-Map entfernen und nur den expliziten `Content-Type` über `effectiveContentType` setzen.
49. **Plugin `window.fetch` Override**: Im Bundle-Wrapper wird `window.fetch` auf `__slatebaseProxyFetch` gesetzt (Cross-Origin → Proxy, Same-Origin → Original). `window.__slatebaseOriginalFetch` wird einmalig gesichert (idempotent bei Multi-Plugin-Load). LiveSync nutzt `compatGlobal.fetch.bind(compatGlobal)` — fängt den Override korrekt ab.
50. **`requestUrl` Shim — zwei Implementierungen**: `setting-tab.ts` (Primär, wird zuerst geladen) und `plugin-loader.ts` Bundle-Shim (Fallback, via `if (!obs.requestUrl)`). Die `setting-tab.ts`-Version gewinnt immer. Änderungen an `requestUrl` MÜSSEN in `setting-tab.ts` gemacht werden. Die Bundle-Version ist Dead Code wenn `setting-tab.ts` vor dem Plugin läuft.
51. **`requestUrl` Response-Format**: MUSS `{ status, headers, text, json, arrayBuffer }` zurückgeben. `arrayBuffer` ist PFLICHT — LiveSync's `nativeFetch` erstellt `new Response(r.arrayBuffer, ...)`. Ohne `arrayBuffer` → leerer Body → PouchDB parse error → "Unexpected synchronization exception".
52. **Workspace `viewStateReceivers`**: Array-Stub mit `.remove()` No-Op auf WorkspaceShim. Kanban ruft `this.app.workspace.viewStateReceivers.remove(...)` in `onunload()`. Obsidian erweitert Arrays mit `.remove()` Methode.
53. **Plugin loadData/saveData**: In `onPluginInstantiated` auf die SettingsManager-Instanz patchen: `instance.loadData = () => settingsManager.loadData(pluginId)`. Ohne das gibt `loadData()` immer `null` zurück → LiveSync bleibt unkonfiguriert → DB-Init wird übersprungen.
54. **SSE vault:change → VaultShim Events**: `plugin-event-bridge.ts` subscribed `onRealtimeVaultChange` und triggert `vault.trigger('modify'/'create'/'delete')`. Loop-Prevention via `markPluginWrite(path)` — Events innerhalb 500ms für gleichen Pfad nach Plugin-Write werden ignoriert.
55. **Plugin-View-Tabs `dispatchOpenPluginViewTab`**: MUSS in `onViewActivated` aufgerufen werden (mit `setTimeout(0)` damit React den `activeViews`-State committen kann bevor TabContent rendert). Ohne das öffnet sich der Tab aber zeigt leeren Inhalt.
56. **`app.commands.executeCommandById`**: LiveSync ruft `app.commands.executeCommandById('app:reload')` auf. Stub muss `window.location.reload()` aufrufen. Fehlte im AppShim → `TypeError: not a function`.
57. **Notice-Klasse Vollständigkeit**: `setting-tab.ts` Notice MUSS `noticeEl`, `messageEl`, `containerEl`, `setMessage(msg): this`, `hide()` haben. LiveSync speichert Notice-Instanzen und ruft `notice.setMessage()` wiederholt auf (Log-Aggregation).
58. **Plugin `addRibbonIcon` Verdrahtung**: In `onPluginInstantiated` überschreiben (wie `addCommand`). ABER: Wenn die `setting-tab.ts` Plugin-Klasse schon eine funktionierende `addRibbonIcon`-Methode hat UND das Bundle `obs.Plugin` von dort erbt, ist das Instance-Override doppelt. Trotzdem sicher (Instance-Property > Prototype).
59. **Workspace-Store Cleanup bei Vault-Löschung**: `deleteVault()` muss `expandedVaults`, `expandedPaths`, und `tabs` im workspaceStore bereinigen. Sonst fetcht der FileExplorer beim nächsten Load den Tree gelöschter Vaults → 404.
60. **Binary-File-Support (createBinary/modifyBinary)**: Multipart-Upload an `/api/v1/vaults/:id/upload` mit `targetDir` Form-Feld (Verzeichnis) + `file` (Blob/File mit Filename). CSRF-Token im Header. Kein Base64-in-saveFile — das war der alte kaputte Ansatz.
61. **Frontmatter-Tags (Obsidian-kompatibel)**: `extractFrontmatterTags(properties)` in `link-index-service.ts` liest `tags`/`tag` aus Frontmatter-Properties, strippt optionalen `#`-Prefix. Wird in `rebuild()`, `updateFile()`, `renameFile()` nach `extractProperties()` aufgerufen und mit Inline-Tags zu einem dedupierten Set gemergt. Ohne das fehlen Frontmatter-Tags in Tags-Panel + Graph.
62. **CRLF in Frontmatter-Parsing**: `extractFrontmatterBlock()` im Property-Extractor MUSS `\r\n` → `\n` normalisieren BEVOR Delimiter-Suche und Zeilensplitting. JavaScript `.` (Dot) in Regex matcht KEIN `\r` — Zeilen mit `\r` am Ende brechen `/^\s+-\s+(.+)$/` (Dash-Array-Pattern). Welcome-Vault-Templates und alle auf Windows erstellten Dateien sind betroffen.
63. **setState-Updater nie für Seiteneffekte**: In React 19 werden `setState`-Updater-Funktionen potenziell während des Render-Zyklus ausgeführt. `dispatch()` (anderer Provider) innerhalb eines `setX(prev => { dispatch(...); return next })` Callbacks löst "Cannot update component X while rendering Y" aus. Lösung: Seiteneffekte (dispatch, fetch) AUS dem Updater herausziehen und danach platzieren. `const wasX = state.has(id)` vor `setX(...)`, dann Bedingungscheck danach.
64. **Plugin-View DOM-Persistenz bei Tab-Wechsel**: Imperativ per `el.appendChild(containerEl)` eingefügte Plugin-DOM-Elemente in `TabContent.tsx` bleiben beim Tab-Wechsel erhalten, weil React das äußere `<div>` recycled (gleicher Tag an gleicher Position → nur className mutiert, imperative Kinder bleiben). Fix: `key={`plugin-view-${activeTab.id}`}` bzw. `key={`plugin-file-view-${activeTab.id}`}` auf den betroffenen Branches setzen — erzwingt Unmount+Remount bei Tab-Wechsel.

## Multi-User & Vault-Besitz

- Lösch-Kette: Freigaben → Vault → Account
- Transfer: nur an EINEN, vorher ALLE Freigaben widerrufen
- Optimistisches Concurrency (ETag), kein Locking
- Sperrung ≠ Löschung; letzter Admin unantastbar
- **Rate-Limiting**: Composite Key `username:ip` — verhindert Account-Lockout-Angriffe (Angreifer von IP A kann User von IP B nicht aussperren)
- **SessionStore**: Sekundärer Index `Map<userId, Set<sessionId>>` für O(1) `findByUserId`. Bei `create`/`invalidate`/`cleanup` immer beide Indexes pflegen.

## Testing

- Co-located, keine externe Mocking-Lib (Backend)
- Keine PBT-Tests (entfernt). Gründliche Unit Tests mit Edge Cases.
- Integration: echtes Filesystem, Temp-Dirs, Cleanup `afterAll`
- ESLint vor Commit: `npx eslint . --quiet` im Frontend

## User Preferences & Store-Sync-Pattern

- Server-Persistenz pro User: `data/users/<userId>-preferences.json`
- Frontend-Stores (`recentFilesStore`, `favoritesStore`, `keybindingsStore`): Module-Level State + localStorage Cache + Backend-Sync
- Lifecycle: `initialize(apiClient)` bei Login/App-Mount, `disconnect()` bei Session-Expiry
- Merge-Strategie: Server-Daten gewinnen bei Konflikten, lokale Einträge füllen leere Slots
- Debounced Sync: 2s Timeout, keine doppelten Requests (`syncInProgress` Flag)
- Neue Stores brauchen: `initialize()` in AppContent `useEffect`, `disconnect()` in `onSessionExpired`
- Per-Vault Config: `.slatebase/config.json` im Vault-Verzeichnis, Owner-only write, read für alle mit Zugang
- Keybindings: `matchesShortcut(commandId, event)` statt manueller `e.ctrlKey && e.key ===` Checks
- Keybindings `Mod` = plattformabhängig (Ctrl auf Win/Linux, Meta auf Mac)

## Welcome Vault

- `WelcomeVaultService` hat Never-Throw-Garantie (Top-Level try/catch)
- Integration via `onUserCreated` Callback (nicht direkte Kopplung an UserService)
- Mutable-Reference-Pattern in Composition Root (wie `mcpTokenInvalidator`) wegen Dependency-Order
- Template-Verzeichnis: `assets/templates/welcome-vault/` (DE) und `assets/templates/welcome-vault-en/` (EN) — Admins können Inhalte ohne Code-Änderung anpassen
- `serverConfig.templatesDir` (Default `./assets/templates`, Env: `SLATEBASE_TEMPLATES_DIR`) — entkoppelt von `dataDir`
- Einzelne Datei-Fehler isoliert (partielle Kopie besser als keine)
- Feature-Toggle: `welcome-vault` (hot, default: true)
- Config: `serverConfig.welcomeVault.name` ist jetzt `{ de: "Willkommen", en: "Welcome" }`
- Sprache bei Nutzererstellung: `CreateUserData.preferredLanguage` (optional, Default = Admin-Sprache)
- `OnUserCreatedFn(userId, language)` reicht Sprache an WelcomeVaultService weiter
- Template-Verzeichnis-Auswahl: `WelcomeVaultService.TEMPLATE_DIRS` Map (de→`welcome-vault`, en→`welcome-vault-en`)
- **Templates-Verzeichnis**: Default `"Templates"` (normales sichtbares Verzeichnis, kein Underscore-Prefix mehr)

### Welcome Vault v2 (nachträgliches Hinzufügen)

- `POST /api/v1/welcome-vault` als dedizierte Route (nicht in adminRoutes oder userRoutes)
- Namens-Deduplication: bestehende Vault-Namen des Users prüfen, Suffix `(2)` bis `(99)`, dann Timestamp-Fallback
- Rate-Limiting: eigene In-Memory Map (3 req/h pro User), nicht der globale rateLimitMiddleware
- Link-Index-Rebuild als fire-and-forget nach Erstellung (kein await, Fehler isoliert)
- Frontend-Integration: Settings-Button UND Command-Palette-Befehl nutzen dieselbe `apiClient.createWelcomeVault()` Methode
- Nach Erfolg: `REFRESH_VAULT_TREES` dispatch + Toast (Vault-Name im Text)
- Feature-Toggle-Check: 403 mit `FEATURE_DISABLED` Code — Frontend zeigt passende Toast-Message
- Template-Inhalt: 35+ Guides pro Sprache (Grundlagen, Features, Fortgeschritten, Praxis, Vorlagen, Screenshots). Admins können Inhalte ohne Code-Änderung anpassen.
- Settings-Section: `WelcomeVaultSection.tsx` als eigenständige Komponente in `settings/`
- **Template-Inhalte Source/Live-Preview-Terminologie**: `Editor und Viewer.md` (DE+EN) beschreibt Source-Modus und Live-Preview-Modus (beide editierbar) — nicht mehr das alte "Edit/View"-Modell. Info-Callout mit Link zur `Features/Live Preview Editor` Seite. `Tags und Properties.md` (DE+EN) enthält echte verschachtelte Inline-Tags im Fließtext (nicht nur Code-Blöcke), damit sie im Tags-Panel der Sidebar als Baumstruktur erscheinen.

## Obsidian Canvas

- Parser/Serializer im Frontend (`src/canvas/`), kein Backend-Modell. Zod-Validierung + Passthrough unbekannter Felder (Forward-Compat, Round-Trip).
- State: eigener `CanvasProvider`/`useCanvasContext` mit Undo/Redo-Stacks + 2s-Debounce-Autosave.
- Node-Renderer-Muster: gemeinsamer `.canvas-node`-Container + `useNodeDrag`/`useNodeResize`. `.canvas-node { user-select: none }` fürs Ziehen — Formularfelder (`textarea`/`input`) brauchen explizit `user-select: text`, sonst nicht editierbar.
- **Wheel-Handler** (`CanvasView`): bricht ab, wenn `target.closest('.canvas-node')` — so scrollen Nodes statt zu zoomen. Link-iframe nur im selektierten Zustand `pointer-events: auto` (sonst kein Mausrad-Scroll).
- **Link-Node iframe**: Vorschau erst ab `width≥200 && height≥150` → neue Link-Nodes mit 300×220 anlegen, sonst bleibt die Seite unsichtbar. Viele Seiten verbieten Einbettung (X-Frame-Options/CSP) — dann bleibt sie leer, kein Bug.
- **Kontextmenü Outside-Click**: Listener MUSS in der **Capture-Phase** registriert werden (`addEventListener('mousedown', h, true)`). Sonst blockiert das `e.stopPropagation()` aus `useNodeDrag` (React-19-Root-Delegation ruft `nativeEvent.stopPropagation()`) das Event, bevor es `document` erreicht. Zusätzlich `window`-`blur` schließen (Klicks in cross-origin-iframes erreichen das Parent-Dokument nicht).
- **Editor-Fokus**: beim Eintritt in den Edit-Modus via Kontextmenü das Feld per `requestAnimationFrame` fokussieren — sonst verliert `focus()` das Rennen gegen das im selben Commit unmountende Menü (Portal), Eingaben landen dann beim globalen Canvas-Keyhandler.
- **File-Node**: `handleMouseDown` im Edit-Modus früh beenden (sonst blockiert `onDragStart`→`preventDefault` den Text-Cursor). Markdown-File-Node hat zwei Aktionen: „Bearbeiten" (Inhalt → `onFileSave`) vs. „Dateipfad ändern" (Pfad → `onFilePathChange`). Niemals Inhalt als Pfad committen. Enter committet nur im einzeiligen Pfad-Editor, nicht im Inhalts-Textarea.
- **Datei-Suche im Pfad-Editor**: `directoryTree` flach in Dateipfade auflösen, Teilstring-Filter, Dropdown via `position: absolute` + `.canvas-node--editing-path { overflow: visible }` (Node hat sonst `overflow: hidden`). Suggestion-Klick mit `onMouseDown` + `preventDefault`, damit das Input nicht vorher blurrt.

## Conflict Wizard (Frontend)

- Eigener `useReducer` (kein Provider) — `ConflictWizardState` + `ConflictWizardAction` in `types.ts`
- 3-Step Flow: Overview (Kategorien mit Badges) → CategoryDetail (Liste mit Checkboxen, Pagination 50/Page) → Resolution (DiffView/MergePreview)
- `diff-utils.ts`: Myers-Diff (pure, keine Deps). `computeDiff()` → `DiffHunk[]`, `groupHunks()` für Collapsed Sections (3 Kontext-Zeilen).
- DiffView: Side-by-Side (4-Column Grid) + Unified (mit +/- Prefix). Collapsed Sections expandierbar. Design Tokens `--diff-added-bg`/`--diff-removed-bg`.
- MergePreview: Textarea + Preview-Toggle. Confirm → `resolveConflictMerge()` API. Cancel → zurück.
- BatchActions: Confirmation Dialog + Limit 100 + Result Summary mit Error-Details (expandierbar).
- Live-Updates via `realtimeSyncBridge`: Wizard refresht Conflict-Liste bei neuen SSE-Events.
- DiffView-Modus (side-by-side/unified) in localStorage persistiert (`slatebase_diff_view_mode`).
- `ConflictResolutionView.tsx` deprecated — nicht löschen, wird noch importiert in alten Tests.

## CodeMirror 6 (Live Preview Editor)

- **Compartments für dynamische Rekonfiguration**: Jede dynamisch schaltbare Extension (Vim, Theme, Plugin-Extensions, Read-Only) lebt in einem eigenen `Compartment`. Rekonfiguration via `view.dispatch({ effects: compartment.reconfigure(...) })` — nie die gesamte State neu erzeugen.
- **EditorView in `useRef`, nicht `useState`**: EditorView ist ein mutable DOM-Objekt mit eigenem Lifecycle. In `useState` speichern verursacht unnötige Re-Renders und Stale-Closure-Probleme. `useRef` + `useEffect`-Cleanup (`view.destroy()`).
- **`onContentChange`-Ref-Pattern**: Save-Callbacks in einer Ref speichern und im `updateListener` auslesen. So bleibt der Listener stabil (kein Compartment-Reconfigure bei jedem Render), aber greift immer auf die aktuelle Closure zu.
- **Per-Tab-State via Module-Level-Map**: `Map<tabId, { doc, selection, scrollPos }>`. Beim Tab-Wechsel: aktuellen State serialisieren, neuen State aus Map laden oder frisch erzeugen. Kein React-State — CM6 ist Source of Truth.
- **Cursor-Reveal via DecorationSet-Filtering**: Live-Preview-Decorations (die Markdown-Syntax verstecken) werden in `cursor-filter.ts` dynamisch gefiltert: Decorations die den aktiven Cursor-Range berühren, werden entfernt → Marker werden sichtbar. `DecorationSet.update()` + `RangeSet.between()` für performante Range-Checks.
- **Plugin-Extensions je eigenes Compartment**: Jedes Plugin bekommt ein dediziertes Compartment (`pluginCompartments: Map<pluginId, Compartment>`). Ermöglicht Isolation — fehlerhafte Extension eines Plugins kann per `reconfigure([])` entfernt werden, ohne den Editor neu zu laden.
- **EditorShim 1-indexed Pos**: Der Legacy-EditorShim (für Commands + Plugin-Compat) arbeitet mit 1-indexed Zeilen/Spalten. CM6 intern ist 0-indexed. Konvertierung in `editor-shim.ts` — nie CM6-Offsets direkt nach außen geben.
- **Performance-Gate**: Dateien >50.000 Zeichen schalten automatisch auf Source-Only (Live-Preview-Decorations deaktiviert). Notice-Banner informiert den User. Schwelle konfigurierbar über Feature-Config (nicht Feature-Toggle).
- **Feature-Toggle `live-preview`**: Hot-Toggle (default: true). Wenn deaktiviert: CM6 läuft weiterhin als Source-Editor, nur die Live-Preview-Decorations + Toggle-Button werden ausgeblendet.
- **Tab-Modus steuert Live Preview (Variante 1)**: `mode === 'edit'` → CM6 Source (livePreview=false), `mode === 'view'` → CM6 editierbarer Live Preview (livePreview=true). EditMode bekommt `livePreviewMode` + `livePreviewOptions` Props. ViewMode wird nicht mehr für Markdown gerendert.
- **Compartment-Stale-Bug bei Remount**: Wenn React eine Komponente unmountet/remountet (Mode-Toggle), werden `useRef(new Compartment())` frisch erzeugt — aber der gespeicherte EditorState enthält die ALTEN Compartment-Instanzen. Fix: Bei State-Restore NIE `stored.state` direkt verwenden, sondern `EditorState.create({ doc: stored.state.doc, selection: stored.state.selection, extensions: buildExtensions() })` — so matchen die Compartments immer die aktuellen Refs. Tradeoff: Undo-History geht bei Mode-Toggle verloren.
- **`.tab-content--edit` braucht `display: flex`**: Ohne explizites `display: flex; flex-direction: column` auf dem Tab-Content-Container propagiert das Flex-Layout nicht — CM6 kollabiert auf 0px Höhe. Auch `overflow: hidden` statt `overflow: auto` (CM6 managed eigenes Scrolling via `.cm-scroller`).
- **CM6 Theme Height**: `'&': { height: '100%' }` + `.cm-scroller: { overflow: 'auto' }` im Theme nötig, damit CM6 den Container ausfüllt. Zusätzlich `.cm-editor-wrapper .cm-editor { flex: 1; min-height: 0 }` in CSS.
- **Feature-Toggle Backend-Registrierung**: `live-preview` Feature muss in `backend/src/index.ts` explizit im FeatureRegistry registriert werden (`featureRegistry.register(...)`) — sonst liefert `/api/v1/features` es nicht aus und Frontend `isEnabled('live-preview')` gibt false zurück.
- **buildDecorations-Verdrahtung**: `buildInlineDecorations`, `buildLinkDecorations` und `buildWidgetDecorations` müssen ALLE in `buildDecorations()` aufgerufen und ihre Ergebnisse gemergt werden — sonst greifen die Decorations nicht.
- **GFM-Parser-Extension**: `import { GFM } from '@lezer/markdown'` + `markdown({ ..., extensions: GFM })` in CodeMirrorEditor. Ohne GFM erkennt Lezer keine Tabellen, Strikethrough oder Task-Lists im Syntax-Tree.
- **EditorView.lineWrapping**: MUSS in den Extensions sein — ohne bricht CM6 keine Zeilen um und Content überläuft horizontal. Obsidian-artiges Verhalten erfordert lineWrapping + max-width auf dem Wrapper.
- **Readable Line Length**: `max-width` auf `.cm-editor-wrapper` (800px, `margin: auto`). NICHT auf `.cm-content` oder `.cm-scroller` setzen — das bricht CM6's Cursor-Koordinaten-Berechnung. Der Wrapper ist die äußere React-Div, CM6 rechnet nur innerhalb seines eigenen `.cm-editor`.
- **Block-Widgets NICHT `block: true`**: `Decoration.replace({ widget, block: true })` bricht CM6's Height-Map wenn Widgets dynamische Höhen haben (async-Bilder, Mermaid). Ohne `block: true` behandelt CM6 die Widgets inline und misst DOM-Höhe direkt.
- **Deferred Cursor-Reveal**: Beim initialen Öffnen einer Datei werden ALLE Decorations ohne Cursor-Filtering gerendert (alles formatiert). Cursor-aware Reveal aktiviert sich erst nach dem ersten `tr.selection`-Event (User-Interaktion). Das verhindert, dass die erste Zeile beim Öffnen "unformatiert" aussieht (Cursor steht initial bei 0).
- **Syntax-Tree-Update im StateField**: `update()` muss auch auf `syntaxTree(tr.state) !== syntaxTree(tr.startState)` prüfen — Lezer parsed asynchron, ohne diesen Check werden Decorations nach dem initialen Parse nie aktualisiert.
- **Link-Click im Live-Preview**: Capture-Phase `mousedown`-Listener auf `view.dom` (nicht `EditorView.domEventHandlers`). `preventDefault` + `stopPropagation` verhindert CM6's Cursor-Platzierung. Wikilinks werden mit `resolveWikilinkTarget()` aufgelöst (fügt `.md` hinzu).
- **Compartment-Rekonfiguration mit Click-Handler**: `useEffect` bei `livePreviewOptions`-Änderung muss `[createLivePreviewField(options), createLivePreviewClickHandler(options)]` rekonfigurieren — nicht nur das Field, sonst geht der Click-Handler verloren.
- **Callout Fold-State als Toggle-Set**: `foldedCallouts: Set<string>` speichert Keys deren Fold-Status vom Default **invertiert** wurde. Default kommt aus Markdown-Marker (`-` = folded, `+` = open). Click toggelt den Key (add/delete), nicht fold:true/false.
- **Frontmatter-Erkennung**: Lezer hat keinen Frontmatter-Node. Regex-basierte Erkennung am Dokumentanfang (`---\n...\n---`). HR-Handler muss Nodes innerhalb `frontmatterEndPos` skippen (sonst rendert `---` als `<hr>`).
- **Callout `todo`-Typ**: Eigene Tokens (`--callout-todo-bg/border/icon`), Icon (Checkmark), CSS-Regel. Fallback auf `note` ist nicht sichtbar genug in Dark Mode — jeder genutzte Callout-Typ braucht explizite Tokens.

## Dev-Umgebung

- Git-Proxy: `git -c http.proxy="" push`
- Node.js v24, `tsx watch` Dev, `tsc` Prod

## Workspace State Persistence

- **workspaceStore.ts**: Module-Level-Store in `state/workspaceStore.ts`. Schema-Version 1 für Forward-Compat. Debounced localStorage (500ms). `initialize()` → `getState()` → `update/updateTabs/updateLayout/updateExpandedState` → `clear()` → `flush()`.
- **Synchrones Initialize auf Module-Level**: `initializeWorkspace()` MUSS vor dem ersten React-Render laufen (Module-Level in App.tsx, wie Token-Restore). Grund: `useState`-Initializer lesen `getWorkspaceState()` synchron — läuft initialize erst im useEffect, lesen sie den Default-State.
- **Tab-Persist Race Condition**: Der „Persist tabs"-Effekt würde beim ersten Render `updateWorkspaceTabs([], null)` aufrufen und den gespeicherten State überschreiben. Fix: `isRestoringRef` Guard, der erst nach dem Restore-Effekt auf `false` gesetzt wird.
- **Content-Fetch bei Tab-Restore**: `OPEN_TAB` allein setzt nur `loading: true`. Man MUSS danach `fetchFileContent()` aufrufen und `TAB_CONTENT_LOADED` dispatchen. Virtuelle Tabs (`__graph__`, `__view::*`) bekommen sofort leeren Content.
- **Expanded Vaults Tree-Loading**: Beim Restore expandierter Vaults muss `fetchVaultTree()` explizit aufgerufen werden — der Toggle-Handler (User-Click) macht das normalerweise, aber nicht der Restore-Effekt.
- **Per-Vault Tab Memory**: `vaultTabsCacheRef` (In-Memory Map) speichert Tabs beim Vault-Wechsel. Überlebt keinen Page-Reload (nicht nötig — der Store deckt das ab). Beim Zurückwechseln werden gecachte Tabs wiederhergestellt inkl. Content-Fetch.
- **Logout Cleanup**: `clearWorkspace()` im Logout-Handler + `beforeunload` → `flushWorkspace()`.
- **restoreState.ts ist Dead Code**: Die alte Session-Expiry-Restore-Logik (5-Min-TTL) ist vollständig durch den workspaceStore ersetzt. Datei kann gelöscht werden.

## Frontend-Refactoring-Erkenntnisse

- **Error-Utility**: `extractErrorMessage(err, fallback)` in `utils/error.ts` — IMMER nutzen statt inline `err as { message }` Pattern
- **Inline Styles verboten**: Auch "temporäre" `CSSProperties`-Objekte wandern nicht in Code. Stattdessen CSS-Klassen mit Design Tokens (Dark Mode funktioniert sonst nicht)
- **ErrorBoundary**: Um `TabContent` (in App.tsx), `GraphView` und `CanvasView` (in TabContent) — schützt Sidebar/Navigation bei Render-Fehlern in riskanten Komponenten
- **AppPage-Typ**: Ist KEIN "Settings"-System — es ist die aktive Tab-Navigation für Feature-Pages (Chat, Admin, Sync, etc.). `SettingsPanel` (Ctrl+,) ist ein separates Overlay nur für Einstellungen. Typ exportiert aus `App.tsx`.
- **Module-Level Singletons** (`apiClient`, `dailyNoteService`): Bleiben in `App.tsx` — Race-Condition-frei dank synchronem Token-Restore. Kein Provider-Wrapping nötig (SSR nicht geplant, HMR funktioniert).
- **Komponenten-Extraktion**: Nur extrahieren wenn eigenständige Logik (UserMenu: eigener State + Effects). Tightly-coupled Sub-Teile (DnD-Handler, Vault-Form) in der Parent-Datei lassen — Extraktion ohne echte Entkopplung schafft nur Import-Overhead.
- **`file-explorer/` Modul**: Shared Types (`DragState`, `InlineInputState` etc.) + `TreeNode` als eigene Dateien. Barrel-Export `index.ts`. FileExplorer importiert daraus.
- **SidebarToolbar AppPage**: Hatte lokale Type-Kopie → Muss die exportierte aus `App.tsx` importieren, sonst Type-Mismatch bei `tsc -b` (Vite-Dev schluckt es, Prod-Build nicht)
- **`tsc --noEmit` ≠ `tsc -b`**: Dev-Check (`--noEmit`) ist permissiver. Prod-Build (`tsc -b`) prüft strenger (project references, declaration emit). Immer `npm run build` als finale Validierung.
- **Session-Verifikation**: App.tsx prüft nach Auth-Restore via `checkSessionAlive()` ob Token noch gültig (zeigt Loading-Spinner bis bestätigt). Tests MÜSSEN `checkSessionAlive` mocken (`mockResolvedValue(true)`) — sonst rendert die App nie über den Spinner hinaus.
- **VaultShim.create() = create-or-get**: Gibt existierende Datei zurück statt zu rejecten (Obsidian-Plugin-Erwartung, z.B. Calendar). Kein API-Call wenn Datei im Tree existiert.
- **Compatibility-Analyzer PARTIAL_METHODS**: Set ist leer — alle vormals partial-klassifizierten Methoden (`workspace.trigger`, `vault.trigger`) sind jetzt `SUPPORTED_METHODS`. Tests die `'partial'` erwarten, müssen bei Migration angepasst werden.
- **Imperatives DOM in React + Key-Pflicht**: Wenn `containerEl` per `ref`-Callback imperativ in ein React-div gehängt wird, MUSS das div einen eindeutigen `key` haben (z.B. `key={`plugin-view-${activeTab.id}`}`). Ohne Key recycled React das DOM-Element beim Branch-Wechsel (gleicher Tag+Position) — imperative Kinder bleiben als Geister-Nodes erhalten und erscheinen im falschen Tab.

## Obsidian Plugin Compat — Erweiterte API (Tier 1–3)

- **EditorShim mit CM6-Backend**: Priority CM6 > Textarea > Buffer. `setEditorViewAccessor(getActiveEditorView)` in plugin-context.ts verdrahtet. EditorShim liest aktiven EditorView via Module-Level-Getter. 30+ Methoden (getCursor, replaceRange, undo, redo, exec, processLines, scrollIntoView, hasFocus, somethingSelected etc.). CM6-Positionen sind 1-indexed (Zeilen), Obsidian 0-indexed → Konvertierung in `cm6PosToOffset`/`cm6OffsetToPos`.
- **MarkdownView-Stub**: `workspace.getActiveViewOfType(MarkdownView)` gibt synthetische Instanz mit `editor` (EditorShim) + `file` (aktives TFile). Registriert auf `window.obsidian.MarkdownView` via `registerMarkdownViewGlobal()`. Auch im require()-Shim als Klasse definiert.
- **editorCallback/editorCheckCallback**: CommandRegistry erweitert mit `EditorContextResolver`. Priority bei `executeCommand`: editorCheckCallback > editorCallback > checkCallback > callback. Resolver über `workspace.activeEditor` verdrahtet.
- **MarkdownRenderer.render()**: Standalone unified/remark Pipeline in `shims/markdown-renderer-shim.ts`. MDAST→HTML Serializer (escapeHtml, inline+block nodes). Registriert auf `window.obsidian.MarkdownRenderer`. Fallback im require()-Shim für Plugins die vor der Registration laden.
- **Notice → Toast Bridge**: `window.__slatebaseShowNotice(msg, duration)` Bridge-Funktion in plugin-context.ts. Notice-Klasse im require()-Shim ruft diese auf. Dynamic import von `ToastNotification.showToast('info', msg)`.
- **requestUrl() Backend-Proxy**: `POST /api/v1/proxy` Route. SSRF-Schutz (private IPs blockiert), URL-Allowlist via `SLATEBASE_PROXY_ALLOWED_ORIGINS` env (kommasepariert). 30s Timeout, 10MB Request / 50MB Response Limit. Frontend-Shim in require()-Blob: `fetch('/api/v1/proxy', { body: JSON.stringify({url, method, headers, body}) })`. Binary-Responses als Base64.
- **registerExtensions funktional**: `registerExtensionsForPlugin(exts, viewType, pluginId)` in `file-view-registry.ts`. Registriert Extension→ViewType Mapping + automatischer FileViewMatcher (Extension-basiert). Gepatcht im `onPluginInstantiated`-Hook.
- **CodeBlockProcessorRegistry**: Module-Level-Singleton in `code-block-processor-registry.ts`. `registerCodeBlockProcessor(language, handler, pluginId)` + `registerPostProcessor(processor, pluginId)`. ViewMode Integration via `useEffect` nach Render (DOM-Query `pre > code[class*="language-"]`, replace mit Plugin-Container). Lifecycle via `MarkdownRenderChild`. Gepatcht in `onPluginInstantiated` für `registerMarkdownCodeBlockProcessor` + `registerMarkdownPostProcessor`.
- **SuggestModal / FuzzySuggestModal**: DOM-basierte modale Overlays (nicht React). Suchfeld, Keyboard-Navigation (Arrow/Enter/Escape), Fuzzy-Matching (substring), Backdrop-Close. Registriert auf `window.obsidian`. `registerSuggestModalGlobals()` in plugin-context.ts.
- **getAllTags(cache)**: Funktionale Implementierung im require()-Shim. Extrahiert inline-Tags (`cache.tags[].tag`) + frontmatter-Tags (`cache.frontmatter.tags`/`cache.frontmatter.tag`). Gibt `string[]` mit `#`-Prefix oder `null` zurück.
- **debounce()**: Vollständige Obsidian-kompatible Implementierung im require()-Shim mit `cancel()` und `run()` Methoden.
- **App.loadLocalStorage/saveLocalStorage**: Per-Vault-localStorage-Wrapper mit Prefix `slatebase-vault-${vaultName}-${key}`. In AppShim `emulatedProperties`.
- **App.isMobile / App.appId / App.secretStorage**: `isMobile: false`, `appId: 'slatebase-${vaultName}'`, `secretStorage` als In-Memory-Map-Stub. Alle in `emulatedProperties`.
- **Vault.copy()**: Read + Create Delegation. Kopiert Textdateien (Binary-Copy erfordert readBinary+createBinary).
- **MetadataCache.getCachedFiles()**: Gibt alle gecachten Pfade als `string[]` zurück. Excalidraw braucht es.
- **CachedMetadata erweitert**: Types für `SectionCache`, `ListItemCache`, `BlockCache`, `frontmatterPosition` hinzugefügt. Felder sind optional (`undefined` wenn nicht geparst). Volles Parsing bei Bedarf implementierbar.
- **Obsidian-CSS-Variablen**: `obsidian-compat.css` mit 100+ Variablen (harte Hex-Werte, keine var()-Referenzen). `--background-primary`, `--text-normal`, `--color-base-XX`, `--mono-rgb-X` für alpha-Manipulation, `--interactive-accent-rgb`. Dark-Mode-Overrides inkl. Import via `setting-tab.ts` (Side-Effect, vor Plugin-Load).
- **Globale Funktionen**: `sleep(ms)`, `nextFrame()` auf `window` registriert (synchron in setting-tab.ts).
- **window.obsidian.Workspace**: Dummy-Klasse deren `.prototype` Plugins patchen können (Templater monkey-patches `getActiveViewOfType`).
- **onLayoutReady Error-Isolation**: Fängt sowohl synchrone throws als auch async rejections (Promise-Return). Loggt als `console.warn` statt Unhandled-Rejection.
- **iterateAllLeaves Null-Guard**: Überspringt Leaves ohne `view` oder ohne `view.containerEl` (verhindert Crash wenn Leaf noch kein View hat).


## LiveSync Plugin Compat (Self-hosted LiveSync v1.0.0)

- **Notice-Shim `noticeEl.isShown()`**: LiveSync ruft `notice.noticeEl?.isShown()` auf dem DOM-Element auf (nicht auf der Notice-Instanz). In Obsidian ist `noticeEl` ein erweitertes HTMLElement. Fix: `this.noticeEl.isShown = () => this._shown` im Konstruktor beider Notice-Shims (`setting-tab.ts` + `plugin-loader.ts`).
- **`process`-Shim im Bundle-Wrapper**: LiveSync's `isValidPath()` (aus `octagonal-wheels`) referenziert `process.platform`. Fix: `var process = { platform: 'linux', env: {}, ... }` am Anfang des `wrappedBundle`-Strings in `plugin-loader.ts`. `platform: 'linux'` passt zu Slatebase Forward-Slash-Pfaden.
- **`adapter.mkdir()` als No-Op**: Backend erstellt Elternverzeichnisse automatisch bei `saveFile` (`fs.mkdir(dir, { recursive: true })`). Der alte Placeholder-Hack (`.slatebase-mkdir-placeholder`) schlug bei fehlenden Ordnern mit ENOENT fehl. Fix: `mkdir()` ist ein No-Op in `vault-adapter-shim.ts`.
- **`readBinary` URL-Format**: Backend-Route ist `GET /vaults/:vaultId/files?path=...&raw=true` (Query-Param). Shims hatten fälschlich `/files/${encodeURIComponent(path)}?binary=true` (Path-Segment → 404). Fix in `vault-adapter-shim.ts`, `vault-shim.ts` (`readBinary` + `getResourcePath`).
- **`VaultShim.getName()` mit Vault-ID**: LiveSync benennt seine IndexedDB nach `vault.getName()`. Bei gleichnamigen Vaults oder Vault-Wechsel kollidieren die PouchDB-Datenbanken. Fix: `getName()` gibt `"${vaultName}-${vaultId}"` zurück. Alte IndexedDB muss einmal manuell gelöscht werden.
- **Plugin-Deaktivierung → Page-Reload**: LiveSync kann nicht innerhalb derselben Session nach `onunload()` erneut initialisieren (PouchDB-Locks, globale Patches). Fix: `window.location.reload()` in `setPluginEnabled(id, false)` (`plugin-context.ts`).
- **`WorkspaceShim.containerEl` Off-Screen**: War `document.body` → LiveSync mountete Log-View direkt in den sichtbaren Body-Bereich. Fix: Verstecktes `<div>` mit `position:fixed;left:-9999px` + Stub-Kinder (`.status-bar`, `.workspace-split.mod-root`). Zusätzlich globales `.status-bar`-Element auf `document.body` für `document.querySelector('.status-bar')`.
- **`adjustStatusDivPosition` Container undefined**: LiveSync sucht ein spezifisches DOM-Element für sein Status-Icon. Falls der Selektor nicht gefunden wird, bricht die Initialisierung ab (`AllHandler onSettingLoaded treated error as failure!`). Noch offen: exakten Selektor per DevTools-Debugger ermitteln und als Stub bereitstellen.
- **LiveSync `Plugin initialisation was cancelled by a module`**: Normaler Zustand bei unkonfiguriertem Plugin (keine `data.json`). Setup-URI über Settings eingeben. Auch nach IndexedDB-Löschung erwartet.
- **LiveSync i18n-Keys als Klartext**: LiveSync nutzt ein eigenes Übersetzungssystem (YAML-basiert). Unübersetzte Keys erscheinen als Rohtext (`obsidianLiveSyncSettingTab.btnApply`). Kein Bug — System lädt Übersetzungsdatei asynchron.
- **Proxy-Limitierungen für CouchDB-Replikation**: Backend-Proxy (`proxyRoutes.ts`) hat 30s-Timeout und vollständiges Response-Buffering. Für OneShot-Sync ausreichend, für LiveSync-Modus (Long-Poll `_changes`) potenziell zu kurz. LiveSync-Einstellung „Use timeouts instead of heartbeats" aktivieren hilft.
- **Binary-Sync Folgefehler**: `Error processing X.png with action update-db` nach `mkdir`-Fehler. Binärdateien wurden nie geschrieben → beim nächsten Scan will LiveSync sie vom Storage lesen → 404. Lösung: Nach `mkdir`-Fix einmal Rebuild oder Fetch.
