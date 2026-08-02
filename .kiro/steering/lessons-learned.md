# Slatebase — Lessons Learned & Konventionen

Kompakte Referenz für nicht-offensichtliche Erkenntnisse aus der Entwicklung. Grundregeln (Naming, CSS, Security) leben in `quality.md`/`tech.md`/`structure.md` — hier stehen nur die Gotchas.

## Architektur-Patterns

- **Module-Level Bridge:** `Set<Callback>` für Cross-Provider-Events (`onX()`/`dispatchX()`) — z.B. `realtimeVaultBridge.ts`, `realtimeSyncBridge.ts`, `tabViewBridge.ts`
- **Atomare Writes:** `<target>.${crypto.randomBytes(8).toString('hex')}.tmp` → `rename()` — nie direkt die Zieldatei überschreiben
- **Validierung ZWEI Schichten:** Zod (Controller) + Business-Validierung. Bei Änderungen IMMER beide prüfen.
- **Action Creators:** Standalone async (kein Hook), nehmen `dispatch` + `apiClient`

## Frontend State

Provider-Hierarchie:
```
AuthProvider → I18nBridge → FeatureProvider → RealtimeBridge → AppProvider → SearchProvider → TabProvider → ContextPanelProvider → AppContent
```

- `vaultTrees: Record<string, DirectoryTree | null>` (Multi-Vault), Expanded-Paths: `${vaultId}::${path}`
- `useTranslation()` Fallback-Deutsch ohne Provider (Tests brauchen keinen Wrapper)
- Module-Level Singletons (`apiClient`, `dailyNoteService`): Bleiben in `App.tsx` — Race-Condition-frei dank synchronem Token-Restore
- `AppPage`-Typ nur in `App.tsx` definieren und exportieren — nie lokal duplizieren

## Realtime (SSE)

- Events: `chat:message`, `chat:unread`, `presence:update/init`, `vault:change`, `sync:conflict`, `notification:toast`, `server:shutdown`
- SSE immer aktiv wenn authentifiziert (kein Feature-Toggle)
- **SSE-Endpoint als HTTP-Intercept**: `/api/v1/events` MUSS im `createHttpServer`-Callback abgefangen werden, BEVOR der Request an Hono gelangt. `@hono/node-server` finalisiert Response nach Handler-Return → bricht offene Streams.
- **SSE-Auth**: Einmal-Ticket via `POST /auth/sse-ticket` (30s TTL). Session-Token nie in URL.
- **MCP-Endpoint**: Ebenfalls HTTP-Intercept (gleicher Grund).
- Reconnect: Exponential Backoff 1s→60s (×2, ±500ms Jitter), 5 Fehler → `disconnected`
- Tree nur refreshen wenn `vaultTrees[id] !== undefined`; Tab nur reloaden wenn `editBuffer === null`
- EventBus NIE monkey-patchen — `eventBus.subscribe(type, cb)` verwenden

## Obsidian Markdown Plugins

- Pattern: `syntax.ts` → `mdast-util.ts` → `plugin.ts`
- Callouts: Transformer (kein Token, transformiert `blockquote`)
- Embeds: 3 Typen (image/pdf/note), Pipe-Separator
- `extractPlainText()` bei neuen Inline-Nodes erweitern
- Transitive Deps (`micromark`, `mdast-util-*`, `unist-util-visit`) direkt nutzbar

## Obsidian Plugin Compat — Gotchas

### Lifecycle & Isolation
- Pro Plugin pro Vault eine AppShim (Vault-Wechsel: unload → neu → load)
- `pluginSystemVaultIdRef` + `isCurrentContext()`-Check vor jedem async Schritt
- `cleanupPluginRegistrations(pluginId)` entfernt Commands, Settings, Views, Ribbon-Icons
- Plugin-Deaktivierung → `window.location.reload()` (LiveSync kann nicht re-init)
- `loading` Status nie persistent speichern — `persistToBackend()` normalisiert zu `active`

### DOM & CSS
- DOM-Prototype-Extensions MÜSSEN synchron in `setting-tab.ts` registriert werden (vor Bundle-Evaluation)
- Custom Icon Registry (`window.__obsidianCustomIcons`) ebenfalls synchron
- CSS-Scoping `body`-Selektor: `body` durch Scope-Selector ersetzen (nicht als Descendant prefixen)
- `Node.prototype.createEl` auf `document` → Document-Guard (`nodeType === 9` → skip `appendChild`)
- `Element.prototype.doc`/`.win`: Obsidian-spezifische Getter für ownerDocument/defaultView
- Settings-Container braucht `data-plugin-id={pluginId}` für CSS-Scope
- Plugin CSS wird NICHT automatisch geladen — `CssInjector` explizit in `plugin-context.ts`

### Shim-Spezifika
- `requestUrl` Response: MUSS `{ status, headers, text, json, arrayBuffer }` haben — `arrayBuffer` ist Pflicht
- `loadData()` gibt `null` bei Plugins ohne `data.json` — Plugin-Bug wenn sie das nicht abfangen
- `modalEl` ist Fenster-Element (nicht `containerEl`). Plugins rufen `this.modalEl.addClass(...)` auf
- Notice: `noticeEl`, `messageEl`, `setMessage(msg): this`, `hide()` nötig (LiveSync nutzt `setMessage()` wiederholt)
- `Workspace.viewStateReceivers`: Array-Stub mit `.remove()` No-Op (Kanban)
- `VaultShim.create()` = create-or-get (Calendar erwartet kein Reject bei existierender Datei)
- `VaultShim.getName()` gibt `"${name}-${vaultId}"` zurück (verhindert IndexedDB-Kollision)
- `process`-Shim im Bundle-Wrapper: `{ platform: 'linux', env: {} }` (LiveSync/octagonal-wheels)

### Proxy & Netzwerk
- Cross-Origin-Requests über `/api/v1/proxy` routen (sandbox.ts `createFetchProxy`/`createXHRProxy`)
- Backend-Proxy strippt nur `Bearer`-Auth (lässt `Basic` durch für CouchDB)
- Body als `Buffer.from(body, 'utf-8')` senden (Node.js `fetch` überschreibt sonst Content-Type)
- localStorage-Keys: `slatebase_token` / `slatebase_csrf` (NICHT `auth_token`)
- `window.fetch` Override: `__slatebaseProxyFetch` (Cross-Origin → Proxy, Same-Origin → Original)
- `requestUrl` Shim: Primär in `setting-tab.ts`, Fallback in `plugin-loader.ts` (dead code wenn ersteres lädt)

### Workspace Leaf
- Virtual Path: `__view::{viewType}` — Tab-Deduplication vor OPEN_TAB prüfen
- DOM-Append via ref-Callback mit `key={`plugin-view-${activeTab.id}`}` (verhindert Geister-DOM)
- `getActiveFile()` gibt `null` bei Plugin-Tabs
- `onOpen()`/`onClose()` Exceptions geloggt, blockieren nie Cleanup
- Plugin-View-Tabs `dispatchOpenPluginViewTab` mit `setTimeout(0)` (React braucht State-Commit)

### CM6 Stubs → Echte Module
- CM6-Stubs (`StateField`, `EditorView`, etc.) auf `window.__codemirrorState`/`View` sind durch echte `@codemirror/*` Module ersetzt seit Live Preview Editor. Plugin-CM6-Extensions funktionieren automatisch mit.

## Vault Sync

- `SLATEBASE_SYNC_SECRET` ≠ `SLATEBASE_CSRF_SECRET` (getrennt!)
- Checkpoint nur bei Erfolg updaten, atomar schreiben
- Owner-Only (kein Admin-Bypass)
- **Sync-Exclusions**: `.slatebase/trash/`, `.slatebase/versions/`, `.slatebase/link-index.json`, `.trash/`, `.mobile/`
- **CouchDB `_`-Limitation**: Top-Level-Dateien mit `_`-Prefix nicht synctbar
- ConflictResolver: Backup → Write → Push → bei CouchDB-Fehler Rollback. Batch max 100.
- Scheduler: Wizard pausiert bei Mount, resumed bei Unmount
- `SyncService.setEventBus()` + `vaultOwnerResolver` als optionale Setter (Dependency-Order)

## Workspace State Persistence

- `initializeWorkspace()` MUSS vor dem ersten React-Render laufen (Module-Level in App.tsx)
- Tab-Persist `isRestoringRef`-Guard (sonst überschreibt erster Render mit `[]`)
- `OPEN_TAB` setzt nur `loading: true` — danach `fetchFileContent()` + `TAB_CONTENT_LOADED`
- Expanded Vaults: `fetchVaultTree()` explizit beim Restore (nicht nur bei User-Click)
- Logout: `clearWorkspace()` + `beforeunload` → `flushWorkspace()`
- Vault-Löschung: workspaceStore `expandedVaults`/`expandedPaths`/`tabs` bereinigen

## CodeMirror 6 (Live Preview)

- Compartments für dynamische Rekonfiguration (Vim, Theme, Plugin-Extensions, Read-Only)
- EditorView in `useRef` (nie `useState`). `onContentChange` in Ref speichern.
- Per-Tab-State via Module-Level-Map (CM6 ist Source of Truth, nicht React)
- Compartment-Stale bei Remount: Immer `EditorState.create()` mit frischen Extensions (History geht verloren)
- `.tab-content--edit`: `display: flex; flex-direction: column; overflow: hidden`
- `lineWrapping` MUSS in Extensions sein. `max-width` auf Wrapper (nicht `.cm-content`)
- Block-Widgets NICHT `block: true` (bricht Height-Map bei dynamischen Höhen)
- Deferred Cursor-Reveal: Erst nach erstem `tr.selection`-Event
- `syntaxTree(tr.state) !== syntaxTree(tr.startState)` im StateField prüfen (Lezer parsed async)
- Link-Click: Capture-Phase `mousedown` auf `view.dom`, `preventDefault` + `stopPropagation`
- Callout Fold: Toggle-Set (invertiert Default aus Markdown-Marker)
- Feature-Toggle `live-preview` Backend-Registrierung: `featureRegistry.register(...)` in index.ts

## Obsidian Canvas

- Parser/Serializer Frontend-only. Zod + Passthrough (Forward-Compat, Round-Trip).
- `.canvas-node { user-select: none }` — Formularfelder brauchen explizit `user-select: text`
- Wheel-Handler: `target.closest('.canvas-node')` → abort (Node scrollt statt zu zoomen)
- Kontextmenü: Capture-Phase + `window blur` (cross-origin iframes)
- Editor-Fokus: `requestAnimationFrame` nach Kontextmenü-Entry
- File-Node: Zwei Aktionen (Inhalt bearbeiten vs. Pfad ändern) — nie verwechseln
- Link-Nodes: min 300×220, iframe nur wenn selektiert `pointer-events: auto`

## Häufige Stolperfallen

1. `.js`-Extension vergessen → Runtime-Error
2. Singleton `apiClient` verwenden — nie `new ApiClient()` in Komponenten
3. `vite.config.ts`: `defineConfig` aus `vitest/config` (nicht `vite`)
4. Vault-IDs: deterministisch (SHA-256, 12 Hex), nicht random
5. Hono: spezifische Routes VOR parametrisierten registrieren (`/users/search` VOR `/users/me`)
6. Client ≠ Server Filesystem (Export braucht Download-Endpoint)
7. `showDirectoryPicker`: nur Chromium, JSZip-Fallback
8. Debounced API-Calls: IMMER AbortController (Race Conditions)
9. `Ctrl+Shift+F`: `e.preventDefault()` für Browser-Suche
10. DropZone + internes DnD: `stopPropagation()` im internen Handler
11. Image Paste: nur `image/*` MIME-Typen abfangen, Text-Paste NICHT intercepten
12. `EventSource` existiert nicht in jsdom — Mock in `test-setup.ts`
13. Command Palette (Ctrl+P): lebt in `CommandPaletteContainer`. Editor-Commands via CustomEvent `slatebase:editor-command`
14. Link-Index v2: Tags + Properties. v1→v2 Auto-Migration. `.slatebase/link-index.json`
15. GraphNode: `id` (unique) + `type` ('file'|'tag'|'property') + optionales `path`
16. Tag-Extraction: CSS Hex-Farben (`#fff`) als Tags — bekannter Edge-Case
17. `extractErrorMessage(err, fallback)` aus `utils/error.ts` — nie inline `err as { message }`
18. `X-Request-Id`: Middleware generiert UUID, Incoming reused (max 128 Zeichen)
19. `PublicUserInfo`-Erweiterungen: `toPublicInfo()` + Login-Response + Mocks synchron halten
20. `checkSessionAlive()`: Tests MÜSSEN diese Methode mocken (`mockResolvedValue(true)`)
21. Favorites-Store: Counter-State erzwingt Re-Render (Store ist kein React-State)
22. Status Bar: `useSyncExternalStore` (nicht `useState`) — Subscriber-Pattern
23. `setState`-Updater nie für Seiteneffekte (React 19: Updater kann im Render laufen)
24. Frontmatter-Tags: `extractFrontmatterTags(properties)` nach `extractProperties()` aufrufen
25. CRLF normalisieren BEVOR Frontmatter-Parsing (JS `.` matcht kein `\r`)
26. Binary-Upload: Multipart an `/upload` mit `targetDir` + `file`. Kein Base64-in-saveFile.
27. `tsc --noEmit` ≠ `tsc -b`: Prod-Build (`tsc -b`) strenger. Immer `npm run build` als Validierung.
28. Plugin-Event-Bridge: `markPluginWrite(path)` → Events 500ms ignorieren (Loop-Prevention)
29. Welcome Vault v2: eigene Route, eigenes Rate-Limit (3/h), Namens-Deduplication `(2)`–`(99)`

## Multi-User & Vault-Besitz

- Lösch-Kette: Freigaben → Vault → Account
- Transfer: nur an EINEN, vorher ALLE Freigaben widerrufen
- Rate-Limiting: Composite Key `username:ip` (verhindert Account-Lockout)
- SessionStore: Sekundärer Index `Map<userId, Set<sessionId>>` für O(1) `findByUserId`

## User Preferences & Store-Sync-Pattern

- Frontend-Stores (`recentFilesStore`, `favoritesStore`, `keybindingsStore`): Module-Level State + localStorage Cache + Backend-Sync
- Lifecycle: `initialize(apiClient)` bei Login/App-Mount, `disconnect()` bei Session-Expiry
- Merge: Server gewinnt bei Konflikten. Debounced Sync (2s, `syncInProgress` Flag)
- Keybindings: `matchesShortcut(commandId, event)` — `Mod` = plattformabhängig

## Docker & Dev

- Production: `tsc`-Build, `SLATEBASE_HOST=0.0.0.0`
- Templates in `assets/` (nicht `data/`) — Volume-Mount überschreibt nicht
- Healthcheck: 401 = healthy, `start_period: 10s`
- Git-Proxy: `git -c http.proxy="" push`
- Node.js v24, `tsx watch` Dev

## i18n

- `TranslationShape` (rekursiver Mapped Type) für neue Sprachen
- `en.ts` importiert `type { de }` direkt
- Keine hartcodierten deutschen Strings — `t('section.key')` verwenden

## LiveSync Plugin Compat (v1.0.0)

- `noticeEl.isShown()`: DOM-Element-Method patchen (`this.noticeEl.isShown = () => this._shown`)
- `adapter.mkdir()` = No-Op (Backend mkdir recursive bei saveFile)
- `readBinary` URL: `GET /vaults/:vaultId/files?path=...&raw=true` (Query-Param)
- `WorkspaceShim.containerEl`: Verstecktes Off-Screen-div (nicht `document.body`)
- Proxy-Timeout 30s + Buffering: Für OneShot-Sync OK, LiveSync Long-Poll potenziell zu kurz
- "Plugin initialisation was cancelled by a module": Normal bei unkonfiguriertem Plugin

## Obsidian Plugin Compat — Declarative Settings (1.13+)

- **Templater v2.23+** nutzt `getSettingDefinitions()` statt `display()`. Leeres Settings-Panel = deklarative API nicht implementiert.
- `PluginSettingTab.getSettingDefinitions()`: Wenn non-empty Array, rendert Framework die Settings automatisch (kein `display()`-Aufruf nötig)
- `getControlValue(key)` / `setControlValue(key, value)`: Lesen/Schreiben von Plugin-Settings. Plugins überschreiben diese Methoden für Custom Storage.
- `update()`: Re-render der deklarativen Settings. Plugins rufen das nach State-Changes auf die `visible`/`disabled` Prädikate beeinflussen.
- Renderer-Datei: `declarative-settings-renderer.ts` (dynamisch importiert, eigener Chunk)
- SettingDefinitionItem-Typen: `group` (Heading + Items), `list` (Add/Delete/Reorder/EmptyState), `page` (Sub-Navigation oder Factory), Controls (toggle/text/number/dropdown/folder/file/slider/color/secret)
- Sub-Pages: Ersetzen `containerEl`-Inhalt komplett + Zurück-Button. `page()` Factory erstellt `SettingPage`-Instanzen.
- `PluginManagementPage.openSettings()`: Prüft `getSettingDefinitions()` → non-empty → declarative Renderer. Sonst `display()`.
- `SettingTab` als Alias für `PluginSettingTab` auf `window.obsidian` registriert.

## Obsidian Plugin Compat — Global Prototype Extensions

- **`Array.prototype.remove(target)`**: Kritischster fehlender Patch. Plugins nutzen `arr.remove(item)` statt `splice`. Silent Failure (TypeError) ohne den Patch.
- **`Array.prototype.first()`/`.last()`**: Calendar nutzt `files.first()`.
- **`Element.prototype.find()`/`.findAll()`**: Kurzform für `querySelector`/`querySelectorAll`.
- **`HTMLElement.prototype.isShown()`**: Prüft `offsetParent !== null || getClientRects().length > 0`.
- Alle globalen Extensions in `global-extensions.ts` — importiert als Side-Effect in `setting-tab.ts` (synchron, vor Plugin-Load).
- `createSvg()` auf `window` — Obsidian-Pendant zu `createEl` für SVG-Elemente.
- `Object.isEmpty()`, `Object.each()`: Obsidian-spezifische statische Object-Methoden.
- `Math.clamp()`, `Math.square()`: Obsidian patcht diese auf Math.
- `String.prototype.contains()`: Alias für `includes()`. Manche ältere Plugins nutzen das.
- `Node.prototype.insertAfter()`, `Node.prototype.indexOf()`: DOM-Manipulation.
- `fish()`/`fishAll()`: Globale querySelector-Shortcuts.

## Obsidian Plugin Compat — Vault & MetadataCache Erweiterungen

- **`TAbstractFile.vault` Property**: Obsidian setzt auf jedem `TFile`/`TFolder` eine `.vault`-Referenz. Dataview nutzt `file.vault.read(file)`. Module-Level `activeVaultShimRef` in `vault-shim.ts`, gesetzt im VaultShim-Konstruktor.
- **`MetadataCache.unresolvedLinks`**: Getter der alle Links aufsammelt die `resolveWikilinkTarget()` nicht auflösen kann. Dataview, Backlinks-Plugins brauchen das.
- **CachedMetadata-Felder**: `footnotes` (1.6.6), `footnoteRefs` (1.8.7), `referenceLinks` (1.8.7), `frontmatterLinks` (1.4.0) — Typen in `types.ts`.
- **`changed` Event-Signatur**: `trigger('changed', file, '', metadata)` — 3 Args (file, raw-data-string, cache). Obsidian übergibt den Rohtext als zweiten Parameter.
- **Per-File `resolve` Event**: Emittiert in `updateFileCache()` nach `changed`.

## Obsidian Plugin Compat — Utility-Funktionen & Events

- `arrayBufferToBase64`, `base64ToArrayBuffer`, `hexToArrayBuffer`, `arrayBufferToHex`: Encoding-Utilities auf `window.obsidian`.
- `parseFrontMatterAliases(frontmatter)`: Extrahiert `aliases`/`alias` Feld als `string[]`.
- `setTooltip(el, text)` / `displayTooltip(el, text)`: Setzt `aria-label` + `title`.
- `stripHeading(heading)` / `stripHeadingForLink(heading)`: Normalisierung für Link-Matching.
- **Workspace `resize` Event**: Bridged via `window.addEventListener('resize', ...)`.
- **Workspace `editor-change` Event**: Bridged via MutationObserver auf `.cm-content` + `input`-Event.
