# Slatebase — Lessons Learned & Konventionen

Kompakte Referenz für nicht-offensichtliche Erkenntnisse aus der Entwicklung. Grundregeln (Naming, CSS, Security) leben in `quality.md`/`tech.md`/`structure.md` — hier stehen nur die Gotchas.

## Architektur-Patterns

- **Keine Insellösungen:** Fixes und Features immer so implementieren, dass sie generisch wirken — nicht nur den einen gemeldeten Fall lösen. Beispiel: Wenn `this.tags` bei Dataview nicht funktioniert, nicht nur Tags fixen, sondern die gesamte MetadataCache-Pipeline (Frontmatter, Tags, Links) korrekt implementieren, damit auch `this.author`, `this.file.links`, etc. sofort funktionieren. Vor dem Fix fragen: "Welche ähnlichen Fälle gibt es noch, und löst mein Ansatz die alle mit?"
- **Module-Level Bridge:** `Set<Callback>` für Cross-Provider-Events (`onX()`/`dispatchX()`) — z.B. `realtimeVaultBridge.ts`, `realtimeSyncBridge.ts`, `tabViewBridge.ts`
- **Atomare Writes:** `<target>.${crypto.randomBytes(8).toString('hex')}.tmp` → `rename()` — nie direkt die Zieldatei überschreiben
- **Validierung ZWEI Schichten:** Zod (Controller) + Business-Validierung. Bei Änderungen IMMER beide prüfen.
- **Action Creators:** Standalone async (kein Hook), nehmen `dispatch` + `apiClient`

## Frontend State

Provider-Hierarchie:
```
AuthProvider → I18nBridge → FeatureProvider → RealtimeBridge → AppProvider → SearchProvider → TabProvider → ContextPanelProvider → SidebarPanelProvider → AppContent
```

- `vaultTrees: Record<string, DirectoryTree | null>` (Multi-Vault), Expanded-Paths: `${vaultId}::${path}`
- `useTranslation()` Fallback-Deutsch ohne Provider (Tests brauchen keinen Wrapper)
- Module-Level Singletons (`apiClient`, `dailyNoteService`): Bleiben in `App.tsx` — Race-Condition-frei dank synchronem Token-Restore
- `AppPage`-Typ nur in `App.tsx` definieren und exportieren — nie lokal duplizieren
- **Vault-Wechsel-Race**: `TREE_LOADED` (legacy) schreibt beim Dispatch-Zeitpunkt in `vaultTrees[state.selectedVaultId]` — nicht in den Vault, für den ursprünglich gefetcht wurde. Bei schnellem Vault-Wechsel (A→B bevor A geantwortet hat) landet A's Baum unter B's Cache-Eintrag. `VAULT_TREE_LOADED` (payload trägt `vaultId`) ist dagegen sicher. Jeder `fetchVaultTree()`-Call in einem Effekt, der bei Vault-Wechsel neu feuert, braucht einen `cancelled`-Guard (siehe `useWorkspaceRestore.ts`/`App.tsx`) — sonst überschreibt eine späte Antwort den inzwischen aktiven Vault.
- **localStorage-Token-Zugriff**: Immer `getStoredAuthToken()`/`getStoredCsrfToken()` aus `state/authContext.ts` nutzen, nie `localStorage.getItem('slatebase_token'/'slatebase_csrf')` direkt — auch nicht in `plugins/compat/**`, das die Werte für eigene proxied Fetches braucht. Der Key-Name ist dort als exportierte Konstante (`STORAGE_KEY_TOKEN`/`STORAGE_KEY_CSRF`) verfügbar, falls eine Stelle (z.B. ein in einen Blob-URL-Modul-Kontext injizierter String-Template wie in `plugin-loader.ts`) den Wert zur Build-Zeit interpolieren statt importieren muss.

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
- **`createEl`/`createDiv` String-Argument**: In Obsidian setzt `createDiv("className")` die CSS-Klasse. NICHT textContent! Beide Stellen fixen: `setting-tab.ts` (synchron) UND `obsidian-api-extensions.ts` (async re-register)
- **`--text-faint` Dark Mode**: `#484f58` ist zu dunkel auf dunklem Hintergrund. Muss `#7a8088` oder heller sein damit Kanban-Icons/Texte sichtbar bleiben.
- **CSS-Scoping braucht ZWEI Formen pro Regel**: `[data-plugin-id] sel` (Descendant) trifft nur Elemente unterhalb eines geschopten Ancestors. Plugins, die ihre UI in geteiltes Workspace-DOM einhängen (Toolbars, Popovers), haben keinen solchen Ancestor — dort trifft nur die Self-Form `sel[data-plugin-id]` auf dem Element selbst. `scopeSingleSelector()` emittiert beide; die Self-Form hängt das Attribut an den führenden Compound (bis zum ersten Kombinator außerhalb von Klammern/Quotes, siehe `splitLeadingCompound()`).
- **`data-plugin-id` beim Erzeugen setzen, nicht beim Einhängen**: Die Self-Form oben funktioniert nur, wenn `createEl`/`createDiv` das Attribut direkt beim `document.createElement` mitgeben — der aktuell laufende Plugin-Kontext ist beim späteren `appendChild` nicht mehr bekannt. Deshalb der Tag in BEIDEN `createEl`-Einstiegspunkten in `install-globals.ts` (global + `HTMLElement.prototype`).
- **Ambienter Plugin-Kontext überlebt kein `await`**: `withPluginContext(id, fn)` (Module-Level-Variable mit Save/Restore) ist nur für SYNCHRONE Verschachtelung korrekt. Ein async `onload()`, das vor `workspace.onLayoutReady(...)` etwas awaited, läuft weiter, nachdem der Kontext längst auf `null` zurückgesetzt wurde — schlimmer noch, fremde Plugins können ihn zwischenzeitlich gesetzt haben. Wenn die pluginId vorab bekannt ist (pro-Plugin-gebundene Objekte wie `app.workspace`), stattdessen `scopeForPlugin(obj, id, ['on', 'onLayoutReady'])` verwenden: bindet die ID einmal in eine Closure und wrappt auch die übergebenen Callbacks, damit deren SPÄTERE Ausführung den Kontext noch trägt. Gleiches Prinzip im `EventSystem`: die pluginId wird bei `on()` am Listener gespeichert und bei `trigger()` wiederhergestellt.
- **Obsidian liefert den kompletten Lucide-Satz mit**: `setIcon(el, 'chevron-down')` funktioniert dort für jeden Lucide-Namen, nicht nur für per `addIcon()` registrierte. Ohne Auflösung rendern Plugin-Buttons als leere Pillen. `lucide-icons.ts` nutzt die per-Icon-Dynamic-Import-Map von `lucide-react` (schon Dependency) statt ~1500 Icons vorab zu bundeln. Obsidian-Eigennamen mit `-glyph`-Suffix treffen meist nach Strippen den Lucide-Namen; nur wo das fehlschlägt, braucht es einen Eintrag in `EXPLICIT_ALIASES`. Bewusst NICHT gemappt: `logo-crystal` und `switch` (kein ehrliches Lucide-Pendant → lieber leer als irreführend).

### Shim-Spezifika
- `requestUrl` Response: MUSS `{ status, headers, text, json, arrayBuffer }` haben — `arrayBuffer` ist Pflicht
- `loadData()` gibt `null` bei Plugins ohne `data.json` — Plugin-Bug wenn sie das nicht abfangen
- `modalEl` ist Fenster-Element (nicht `containerEl`). Plugins rufen `this.modalEl.addClass(...)` auf
- Notice: `noticeEl`, `messageEl`, `setMessage(msg): this`, `hide()` nötig (LiveSync nutzt `setMessage()` wiederholt)
- `Workspace.viewStateReceivers`: Array-Stub mit `.remove()` No-Op (Kanban)
- `VaultShim.create()` = create-or-get (Calendar erwartet kein Reject bei existierender Datei)
- `VaultShim.getName()` gibt `"${name}-${vaultId}"` zurück (verhindert IndexedDB-Kollision)
- `VaultShim.getAbstractFileByPath("")` und `"/"` müssen den Root-TFolder zurückgeben (Dataview PrefixIndex)
- `process`-Shim im Bundle-Wrapper: `{ platform: 'linux', env: {} }` (LiveSync/octagonal-wheels)
- **MetadataCacheShim**: `getFileCache()` darf für existierende Dateien nie `null` zurückgeben — Dataview überspringt sonst die Datei komplett beim Indexieren
- **MetadataCacheShim**: On-Demand-Parsing via `populateFromContent(path, content)` — VaultShim ruft das nach `read()` auf, MetadataCacheShim parst Frontmatter/Tags/Links synchron für den nächsten `getFileCache()`-Aufruf
- **MetadataCacheShim**: CRLF normalisieren BEVOR Frontmatter/Tag-Parsing (Windows-Zeilenenden brechen `[...]`-Array-Erkennung)
- **MetadataCacheShim**: Code-Block-Fence-Tracking mit Fence-Length (nicht simples Toggle) — verschachtelte Fences (`````markdown` innerhalb ````) sonst falsch-positiv für Tags/Links
- **syntaxTree-Wrapper**: `InlineCode`-Nodes im Standard-Lezer-Parser inkludieren Backticks in `from`/`to`. Obsidian's Parser nicht. Wrapper auf `window.__codemirrorLanguage.syntaxTree` adjustiert per Proxy die Node-Ranges für alle `iterate()`-Aufrufe.
- **`MarkdownView.containerEl` MUSS echtes, eingehängtes DOM sein**: Ein detachtes `document.createElement('div')` ist für Plugins nicht von "kein Einstiegspunkt gefunden" unterscheidbar — sie suchen darin per `querySelector('.markdown-source-view')` eine Einhängestelle und geben still auf. `CodeMirrorEditor` markiert beim Mount den Parent des Wrappers mit `.markdown-source-view` und meldet dessen Parent als containerEl (`setActiveEditorContainerEl`). Die Marker-Klasse bewusst NICHT auf `.cm-editor-wrapper` selbst: dessen `overflow: hidden` würde eine absolut positionierte Toolbar abschneiden.
- **`activeLeaf.view.containerEl` als Getter, nicht als Snapshot**: Plugins lesen das vor ODER nach dem Editor-Mount (React-Effekt-Reihenfolge ist relativ zu `setActiveFile()` nicht garantiert). Ein zum Zeitpunkt des Leaf-Baus eingefrorener Wert zeigt sonst dauerhaft auf einen toten Knoten.
- **Ein zweiter Versuch für DOM-abhängige Plugin-UI**: Plugins bauen ihre UI in `onload`/`onLayoutReady` — also bevor der CM6-Editor gemountet ist. Der erste Versuch schlägt still fehl, und unser Shim feuert Leaf-Events nur bei echtem Datei-/Leaf-Wechsel, der evtl. nie wieder kommt. `WorkspaceShim` registriert deshalb via `setEditorContainerMountedListener()` ein Re-Fire von `layout-change` + `active-leaf-change`, sobald ein Container tatsächlich mountet.
- **`activeLeaf` ist in echtem Obsidian (fast) nie `null`**: Ohne offene Datei existiert dort ein Leaf mit View-Typ `empty`. Plugins verlassen sich darauf (Excalidraws `isUnwantedLeaf()` macht `e.view?.getViewType()` — optional chaining auf `view`, aber NICHT auf `e`). `setActiveFile(null)` liefert deshalb einen "empty"-Leaf statt `null`; echtes `null` nur, wenn in der Session noch nie ein Leaf existierte.
- **`getActiveViewOfType` muss die Basisklassen mit abdecken**: Echtes `MarkdownView` erbt von `FileView` ⊂ `ItemView`, also proben Plugins gern generisch (Editing Toolbar nutzt `ItemView`, um Canvas/Excalidraw mit abzudecken). Unsere Shim-Klassen teilen keine Prototypen-Kette — der Check läuft deshalb per Identitätsvergleich gegen die `window.obsidian`-Globals, nicht per `instanceof`.
- **`Plugin.addCommand()` gibt das Command zurück**: Plugins stashen die Referenz (`this.forceSaveCommand = this.addCommand(...)`). Ein `void`-Return macht daraus stillschweigend `undefined` und crasht später beim Zugriff. Gilt auch für den Guard-Pfad in `plugin-context.ts` (Vault-Wechsel): dort ein Command-förmiges Objekt zurückgeben, nicht früh `return`.
- **`app.commands` / `app.hotkeyManager` gegen die echte Registry**: Ein leeres `{}` reicht nicht — Plugins iterieren und migrieren darüber Command-IDs beim Start (Editing Toolbar via `findCommand()`, Excalidraw via `addDefaultHotkeys`). `commands` ist ein Getter über die `CommandRegistry`. `hotkeyManager.customKeys` MUSS als Objekt existieren, auch wenn immer leer (Slatebase hat keine Hotkey-Customization-UI): Plugins indizieren direkt (`customKeys[id]`) und crashen sonst an `undefined[id]`.
- **`ButtonComponent.setClass()`: eigene Klasse ans ENDE**: Plugins nutzen Attribut-Selektoren wie `[class^=editingToolbarCommandsubItem]`, die nur greifen, wenn ihre Klasse das ERSTE Token ist. Echtes Obsidian schiebt nie eine eigene Klasse davor — unser `setting-button`-Hook muss also nach der Plugin-Klasse einsortiert werden (`remove` + `add` nach dem `add(cls)`).

### Proxy & Netzwerk
- Cross-Origin-Requests über `/api/v1/proxy` routen (sandbox.ts `createFetchProxy`/`createXHRProxy`)
- Backend-Proxy strippt nur `Bearer`-Auth (lässt `Basic` durch für CouchDB)
- Body als `Buffer.from(body, 'utf-8')` senden (Node.js `fetch` überschreibt sonst Content-Type)
- localStorage-Keys: `slatebase_token` / `slatebase_csrf` (NICHT `auth_token`)
- `window.fetch` Override: `__slatebaseProxyFetch` (Cross-Origin → Proxy, Same-Origin → Original)
- `requestUrl` Shim: Primär in `setting-tab.ts`, Fallback in `fallback-shims.ts` (nur relevant falls ersteres nicht lädt)

### Workspace Leaf
- Virtual Path: `__view::{viewType}` — Tab-Deduplication vor OPEN_TAB prüfen
- DOM-Append via ref-Callback mit `key={`plugin-view-${activeTab.id}`}` (verhindert Geister-DOM)
- `getActiveFile()` gibt `null` bei Plugin-Tabs
- `onOpen()`/`onClose()` Exceptions geloggt, blockieren nie Cleanup
- Plugin-View-Tabs `dispatchOpenPluginViewTab` mit `setTimeout(0)` (React braucht State-Commit)
- **TextFileView-basierte Views** (Kanban): Werden NICHT als Plugin-View-Tab geöffnet — sie rendern im bestehenden File-Tab via `file-view-registry.ts`
- **`onViewActivated`-Callback**: TextFileView-basierte Views NICHT in `activeViews`-Map aufnehmen — sonst raubt `PluginViewPanel` den `containerEl` aus dem TabContent-DOM
- **`data-plugin-id`-Attribut**: MUSS auf dem TabContent-Container für Plugin-File-Views gesetzt werden (`fileViewMatch.pluginId`) — ohne das greifen die geschopten Plugin-CSS-Regeln nicht
- **View Lifecycle**: `_loaded = true` direkt auf View setzen VOR `onOpen()` — nicht `view.load()` aufrufen (triggert `onload()` was bei manchen Plugins kollidiert). `addChild()` prüft `_loaded` und ruft `child.load()` nur auf wenn true.
- **`Component._loaded`**: Instance-Property, nicht Prototype. TextFileView erbt es NICHT automatisch — muss im `setViewState` explizit auf dem View-Objekt gesetzt werden.

### CM6 Stubs → Echte Module
- CM6-Stubs (`StateField`, `EditorView`, etc.) auf `window.__codemirrorState`/`View` sind durch echte `@codemirror/*` Module ersetzt seit Live Preview Editor. Plugin-CM6-Extensions funktionieren automatisch mit.
- `window.__codemirrorLanguage.syntaxTree` ist ein Proxy-Wrapper der `InlineCode`-Nodes adjustiert (from/to ohne Backticks). Plugins die `syntaxTree().iterate()` nutzen bekommen Obsidian-kompatible Ranges.
- `refreshPluginExtensions()` dispatcht am Ende `{selection: view.state.selection}` — triggert ViewPlugin-Updates für Plugins die nur auf `selectionSet` reagieren (z.B. Dataview Inline-Rendering).

## Workspace State Persistence

- `initializeWorkspace()` MUSS vor dem ersten React-Render laufen (Module-Level in App.tsx)
- Tab-Persist `isRestoringRef`-Guard (sonst überschreibt erster Render mit `[]`)
- `OPEN_TAB` setzt nur `loading: true` — danach `fetchFileContent()` + `TAB_CONTENT_LOADED`
- Expanded Vaults: `fetchVaultTree()` explizit beim Restore (nicht nur bei User-Click)
- Logout: `clearWorkspace()` + `beforeunload` → `flushWorkspace()`
- Vault-Löschung: workspaceStore `expandedVaults`/`expandedPaths`/`tabs` bereinigen

## Editor-Toolbar → Plugin-Ökosystem

- Die native Formatierungsleiste in `EditMode.tsx` ist entfernt. Formatierung läuft über die Command Palette (Ctrl+P) oder eine Obsidian-kompatible Plugin-Toolbar (Editing Toolbar). Grund: Eine zweite, fest verdrahtete Leiste über der Plugin-Toolbar ist doppelte UI für dieselbe Funktion — und die Plugin-Variante ist konfigurierbar. `formatting.ts` und die `EditorFormattingAction`-Typen bleiben, sie werden weiter von der Command Palette bedient.
- `livePreviewMode` ist dadurch ein Pflicht-Prop von `EditMode` (vorher optional mit localStorage-Fallback) — der Tab-Modus ist die einzige Quelle. Der localStorage-Key `slatebase_editor_live_preview` ist weggefallen.
- `.edit-mode-editor-area` musste von `flex-direction: row` auf `column`: Bei genau einem Kind (CodeMirror) egal, aber sobald ein Plugin eine Toolbar als Geschwister einhängt, quetscht `row` sie daneben statt sie darüber zu stapeln.

## CodeMirror 6 (Live Preview)

- Compartments für dynamische Rekonfiguration (Theme, Plugin-Extensions, Read-Only)
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
30. Dataview `this.file.links` existiert NICHT — das Feld heißt `this.file.outlinks` (ausgehend) / `this.file.inlinks` (eingehend)
31. Dataview-Worker bekommt `metadata` von MetadataCache — parst Tags/Frontmatter NICHT selbst aus dem Content. MetadataCache MUSS diese Felder liefern.
32. Dataview PrefixIndex nutzt `vault.getAbstractFileByPath("/")` für Root-Folder — muss `TFolder` mit `children` zurückgeben, sonst sind alle `FROM ""`-Queries leer.
33. **Kanban Plugin File-View**: TabContent rendert Plugin-File-Views VOR dem Edit-Mode-Branch. `fileViewMatch`-Check MUSS `mode !== 'edit'` enthalten, sonst ist Edit-Mode unerreichbar.
34. **Plugin-File-View CSS**: Container braucht `data-plugin-id={pluginId}` UND CSS-Regel `.tab-content--plugin-file-view { flex: 1; overflow: auto; min-height: 0 }`.
35. **Kanban MarkdownDomRenderer**: Nutzt Preact-Lifecycle für `Component.load()` → `onload()` → `render()` → `MarkdownRenderer.render()`. Funktioniert nur wenn `_loaded = true` auf Parent-View UND `TextFileView.addChild()` korrekt `child.load()` aufruft.
36. **TextFileView.addChild Override**: Die `TextFileView`-Klasse in `setting-tab.ts` darf `addChild` NICHT als No-Op (`return child`) überschreiben — muss `_loaded`-Check + `child.load()` enthalten, sonst werden Kanban's MarkdownDomRenderer-Children nie geladen.
37. **Verwaiste Extraktionen**: Vor neuem State/neuer Logik in einer Komponente per Grep prüfen, ob ein Action-Creator/Hook/Component dafür schon existiert (z.B. `featureActions.ts`, `TabBar.tsx` waren fertig implementiert, aber ungenutzt — Call-Sites hatten die Logik parallel inline reimplementiert). `knip` (`npx --yes knip`) findet solche Leichen zuverlässig.
38. **Hand-gebautes Markdown→HTML vor `dangerouslySetInnerHTML`**: Reines `&`/`<`/`>`-Escaping reicht nicht. URLs brauchen eine Schema-Allowlist (http/https/mailto; alles andere inkl. `javascript:` → `#`) UND Anführungszeichen-Escaping vor dem Einsetzen in `href`/`src`/`alt` — sonst Attribut-Breakout via `[x]("onmouseover="...)`. Siehe `PluginDetailPanel.tsx` (README-Rendering für Community-Plugins, per Definition nicht vertrauenswürdiger Content).
39. **Generischer Store + in-place-mutierender Caller = Corruption-Falle**: `JsonFileStore`/`KeyedJsonFileStore` (`shared/json-file-store.ts`) geben bei fehlender/kaputter Datei einen `defaultValue` zurück. Caller-Code, der im imperativen Stil mutiert (`index.entries.push(...)` statt `{...current, ...}`), würde bei naiver Implementierung das GETEILTE `defaultValue`-Objekt selbst mutieren und es für alle künftigen Reads (auch für andere Keys!) verunreinigen. Fix: `readJsonFile()` liefert bei jedem Miss `structuredClone(defaultValue)`, nie die Originalreferenz. Gilt für jeden selbstgebauten Cache/Store mit einem Default-Objekt als Fallback.
40. **`KeyedMutex` sperrt einen Key, nicht eine Datei**: Wenn eine Operation mehr als eine Datei anfasst (Filesystem-Move + Index-Update, siehe `TrashService`), muss der Lock die GESAMTE Methode umschließen, nicht nur den Index-Write. Ein Lock nur um `updateIndex()` hätte die eigentliche Race (Cleanup-Job löscht ein Verzeichnis, aus dem gerade parallel restored wird) nicht verhindert — nur die Reihenfolge der `_index.json`-Writes.
41. **Bulk-Rename via `replace_all` kollidiert bei Substring-Namen**: Ein `replace_all` von `IPluginStore` → `IInstalledPluginStore` trifft ungewollt auch `IPluginStoreService`/`IPluginStoreCache` (Substring-Match). Vor jedem mechanischen Rename mit `grep` auf exakte Wortgrenzen (`\bName\b`) prüfen, welche Symbole WIRKLICH getroffen werden, bevor `replace_all` läuft — insbesondere wenn ein kurzer Name Präfix eines längeren, unverwandten Namens ist (hier: zwei bewusst ähnlich benannte, aber fachlich getrennte Module `plugin/` vs. `plugin-store/`).
42. **Pro-Element-Fanout gegen ein rate-limitiertes API ist fast nie der richtige Weg**: Der Plugin-Store holte Download-Zahlen per `api.github.com/repos/{repo}/releases/latest` — eine rate-limitierte Anfrage PRO Plugin, bei ~6000 Plugins also aussichtslos (Batching + Early-Stop bei niedrigem Limit kaschierten nur, dass die Liste nie vollständig wurde). Obsidians eigener Plugin-Browser lädt stattdessen eine einzige vorab-aggregierte Datei: `community-plugin-stats.json` vom CDN (kein Rate-Limit, ein Request unabhängig von der Plugin-Anzahl). Vor dem Bauen einer Batching-/Concurrency-Lösung prüfen, ob der Upstream einen aggregierten Feed anbietet.
43. **Coverage-Provider v8 scannt „all files" — `include` explizit setzen**: Reines `exclude` reicht nicht. Backend zieht sich sonst das gitignorete `data/` mit rein (hochgeladene Vaults, installierte Plugin-Bundles wie Excalidraw/Kanban `main.js` samt vendored Deps), Frontend das `scripts/`-Verzeichnis — beides existiert im frischen CI-Checkout nicht, also driften lokale und CI-Zahlen auseinander. Schwellen sind als Regressions-Baseline gesetzt (gemessener Stand minus kleiner Puffer), nicht als Zielwert.
44. **Vitest 4 excludet `dist/` nicht mehr per Default**: Nach einem lokalen `npm run build` sammelt der nächste Testlauf die kompilierten Kopien aller Tests aus `dist/` mit ein — Testanzahl verdoppelt sich (63 → 127 Dateien), Coverage wird gegen `dist/` statt `src/` attribuiert. CI merkt das nie, weil dort `build` NACH `test:coverage` läuft; genau deshalb muss `test.exclude` in beiden Configs explizit `dist/**` listen. Gilt doppelt fürs Frontend, wo `exclude` in `vite.config.ts` die Defaults komplett ersetzt.
45. **`@vitest/coverage-v8` v4: Branch-/Function-Zahlen brechen ein, ohne dass sich etwas verschlechtert hat**: Bei identischen Tests fiel Backend-Branches von 84% auf 42% und Functions von 79% auf 53%, während Statements/Lines gleich blieben. Ursache ist AST-aware Remapping als neuer Default — v3 hat Branches/Functions gutgeschrieben, die die Tests nie erreichen. Die neuen Zahlen sind die ehrlichen. Nach einem Coverage-Provider-Major also neu baselinen statt die alten Schwellen „wiederherstellen" zu wollen. Merkregel: Statements/Lines stabil + Branches/Functions eingebrochen = Messverfahren geändert, nicht die Testqualität.
44. **`Content-Disposition: attachment` schützt nur Top-Level-Navigation**: Der Raw-File-Endpoint liefert SVG/HTML jetzt mit `attachment` statt `inline`, um Script-Ausführung beim direkten Öffnen (geteilter Link, neuer Tab) zu verhindern. Das wirkt NICHT bei `<img src="...">`-Einbettung (Browser führen dort ohnehin kein `<script>` in SVGs aus) — Disposition ändert nur, wie eine direkte Navigation gehandhabt wird. Bei Security-Fixes an Datei-Endpoints immer den tatsächlichen Konsum-Kontext (direkte Navigation vs. `<img>`/`<iframe>`/`<object>`) durchdenken, nicht pauschal "ein Header behebt alles" annehmen.

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
