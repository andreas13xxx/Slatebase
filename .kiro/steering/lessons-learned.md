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
- Block Refs: Transformer + Serializer (parst `^block-id` Markers aus Paragraphen)
- Breaks: Reiner Transformer (soft→hard line breaks, Obsidian Default)
- Embeds: 3 Typen (image/pdf/note), Pipe-Separator
- `extractPlainText()` bei neuen Inline-Nodes erweitern
- `preserve-table-code-escapes.ts`: Inline-Code in GFM-Tabellen vor Pipe-Unescaping schützen
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
- **VaultAdapterShim**: `vault-adapter-shim.ts` implementiert Obsidians `DataAdapter`-API (exists, read, write, list, stat, mkdir, remove, rename) — Plugins die `app.vault.adapter` direkt nutzen statt der VaultShim-Methoden brauchen das.
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
- **`onLayoutReady()` synchron aufrufen, nicht deferren**: Obsidians dokumentierte Semantik ist "callback when layout is ready, or immediately if it already is". Bei uns laden Plugins nach FCP, das Layout ist also immer bereit — der Callback muss im selben Tick laufen. Ein Deferral (Microtask/`setTimeout`) öffnet ein Zeitfenster, das echtes Obsidian nicht hat: Ein Plugin, das sich direkt vor dem Aufruf einen Container merkt und im Callback hineinbaut, findet ihn ersetzt/entfernt vor, weil dazwischen React-Re-Renders oder andere Plugin-Loads laufen durften.
- **`getOrCreateEmptyLeaf()` statt `null` überall**: Wo wir einem Plugin sonst ein blankes `null`-Leaf gäben, kommt ein Leaf mit View-Typ `empty` zurück (siehe auch den `activeLeaf`-Punkt oben). Echtes `null` nur, wenn gar keine Leaf-Infrastruktur existiert (keine ViewRegistry/App).
- **View-Lifecycle: `load()` vor `onOpen()`**: Entspricht Obsidians Component → View → ItemView-Kette (WorkspaceLeaf ruft `view.load()`, das `_loaded` setzt und `onload()` auslöst, VOR `onOpen()`). Echte Component-basierte Plugin-Views haben `load()`; unsere leichtgewichtigen In-Repo-Mocks (für Tests) nur das No-Op `onload()` — deshalb Fallback auf direkten `onload()`-Aufruf plus eigenes `_loaded`-Setzen.
- **`workspace.leftRibbon`/`rightRibbon` als Stub**: Slatebase hat keine Ribbon-Leiste, aber `hide()`/`show()`/`toggle()` müssen existieren, sonst crasht z.B. Editing Toolbars "Workplace Fullscreen" an `undefined.hide()`.
- **`app.plugins` an `window.app.plugins` delegieren**: AppShims sind pro Plugin, `window.app` ist eins für alle. Ohne Delegation sieht `app.plugins.getPlugin(id)` — womit Plugins ihre eigene oder eine fremde Instanz/Settings holen (Excalidraw) — je nach Aufrufweg eine andere Registry.
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

### Core Commands (`editor:*`, `workspace:*`, `app:*`, …)
- **Obsidian bringt eigene Built-in-Commands mit, und Plugins rufen sie auf**: `app.commands.executeCommandById('editor:toggle-code')` ist der übliche Weg, Obsidians Formatierungslogik wiederzuverwenden statt sie nachzubauen. Unsere `CommandRegistry` kannte nur, was Plugins selbst per `addCommand` registrieren — der Aufruf lieferte still `false` und der Button tat nichts, ohne Fehlermeldung. `core-commands.ts` (nur `IEditor`-Dokument-API) + `core-commands-app.ts` (braucht React-State: Tabs, ApiClient, Panels) registrieren jetzt beide Hälften.
- **Der Split verläuft entlang der Kontextgrenze, nicht entlang der ID-Präfixe**: Ein paar `editor:*`-Commands (save-file, follow-link, toggle-source, open-search) brauchen App-Kontext und liegen deshalb trotz Präfix in `core-commands-app.ts`. Die vault-scoped Plugin-Shims kommen an React-State nicht heran — `CommandPaletteContainer` schon, deshalb registriert der die App-Hälfte einmal und hält sie über ein Ref frisch (gleiches Ref-Indirection-Idiom wie `EditMode`s `onSaveRef`, kein Stale-Closure-Risiko).
- **Fehlendes Feature ⇒ registrierter No-Op, nicht "gar nicht registriert"**: Für Dinge ohne Slatebase-Pendant (Fensterverwaltung, PDF-Export, Quick Switcher, Code-Folding) wird der Command trotzdem angelegt, als literaler No-Op. In echtem Obsidian existiert ein Command auch dann, wenn er gerade nicht ausführbar ist — ein Plugin, das die ID nur auflöst, um sie in ein Menü einzuhängen, bekommt so das erwartete Ergebnis statt eines stillen Fehlschlags.

### Body-Klassen & Tooltips (unsichtbare Abhängigkeiten der Plugin-UI)
- **`theme-dark`/`theme-light` auf `document.body`**: Obsidian markiert dort Theme und Plattform, und sowohl Plugin-CSS (`.theme-dark .my-panel {…}`) als auch Plugin-JS (`document.body.classList.contains('theme-dark')`) hängen daran. Slatebase führt seinen Zustand als `data-theme` am `<html>` — ohne Übersetzung war jede Dark-Mode-Regel eines Plugins tote CSS und jeder Runtime-Theme-Check nahm still den Light-Zweig (sichtbar an Excalidraws weiß bleibender Canvas). `body-classes.ts` synchronisiert beides; Plattform-Klassen (`is-mobile`, `mod-macos`) leiten sich aus `detectPlatform()` ab, damit sie mit dem übereinstimmen, was `Platform` den Plugins meldet.
- **`aria-label` ist in Obsidian der Tooltip-Mechanismus**: Der Host rendert die Bubble, Plugins setzen nur das Attribut (unser `setTooltip()` ebenso). Browser tun das nur für `title` — ohne `GlobalTooltip` war jeder aria-label-Tooltip der App unsichtbar, Core-UI eingeschlossen. Einmal nahe der Wurzel gemountet, unabhängig von Vault-/Auth-State.

### Klassenhierarchie statt paralleler Shims
- **Eine echte Prototypenkette schlägt mehrere Lookalikes**: `suggest-modal.ts`, `shims/suggest-modal-shim.ts` und `shims/markdown-view-shim.ts` definierten dieselben Klassen mehrfach und überschrieben einander in Registrierungsreihenfolge (mit Kommentaren, die genau das beklagten). Jetzt existiert nur noch eine Kette in `install-globals.ts`: Component → View → ItemView → FileView → MarkdownView bzw. Modal → SuggestModal → FuzzySuggestModal. `getActiveViewOfType` konstruiert daraus einen echten `instanceof MarkdownView` mit funktionierendem `registerEvent`/`addChild` — Templater und Editing Toolbar kommen so über den Standardweg an den Editor.
- **`extends`-Ausdruck darf den eigenen Typparameter nicht referenzieren** (TS2562): `class Foo<T> extends (X as unknown as { new(): { getItems(): T[] } })` ist verboten. Da die betreffenden Methoden ohnehin in der Subklasse überschrieben werden, ist der Cast unnötig — auf die bereits typisierte Basisklassen-Variable vereinfachen.
- **Constructor-Parameter-Properties sind unter `erasableSyntaxOnly` verboten** (TS1294): `constructor(private readonly view: EditorView)` in einer CM6-`ViewPlugin.fromClass`-Klasse muss als explizites Feld + Zuweisung im Konstruktor geschrieben werden.

### Event-Deregistrierung
- **`offref()` war ein No-Op unter der Annahme, Unload räume alles ab**: Deckt aber genau den Fall nicht ab, für den Plugins es benutzen — Abmelden während das Plugin geladen bleibt (View schließt, Feature per Settings aus). Der Listener feuerte den Rest der Session weiter. Ein `WeakMap<EventRef, EventSystem>` merkt sich die Herkunft, ohne ein internes Feld an den Ref zu hängen (das Plugins sehen könnten und Obsidians echter EventRef nicht hat). Gibt `false` zurück, wenn der Ref nicht von einem EventSystem stammt, damit Aufrufer die Lücke melden statt still nichts zu tun.

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
- **Cross-Tab-Sync über das `storage`-Event**: Jeder Tab liest localStorage nur einmal (in `initialize`). Ein lange offener Tab mit veraltetem In-Memory-`currentState` überschreibt sonst irgendwann den neueren Schreibvorgang eines anderen Tabs mit seiner eigenen alten Kopie — sichtbar daran, dass ein anderswo geschlossener Tab wieder auftaucht. Der Listener übernimmt den eingehenden State nur, wenn **kein** eigener Debounce-Write ansteht: lokale unpersistierte Änderungen sind neuer als das, was gerade in Storage gelandet ist, und sollen gewinnen.

## Asynchrone Races im UI

- **Mehrere Handler, die unabhängig „fetch-then-dispatch" machen, brauchen einen Sequenz-Guard**: Im FileExplorer laden Delete, Rename, Move, Create, Drag&Drop und Lazy-Load je für sich einen frischen Tree. Löst eine ältere Anfrage nach einer neueren auf (Lazy-Load-Expand rennt gegen ein Delete), überschreibt sie den aktuellen State mit veralteten Daten — sichtbares Symptom: eine gelöschte Datei taucht im Explorer wieder auf. `vaultTreeRequestSeq` ist bewusst **modul-scoped statt `useRef`**: Ein Ref, das aus render-time-Closures (dem Context-Menu-Action-Switch) gelesen/mutiert wird, verstößt bei jedem transitiven Call Site gegen die Compiler-Safety-Regeln von `eslint-plugin-react-hooks`.
- **Aufräumen vor dem Round-Trip, nicht im `.then()`**: Tab-IDs sind deterministisch (`vaultId::filePath`). Wird eine Datei am selben Pfad neu angelegt (Daily Note für denselben Tag), reaktiviert `OPEN_TAB` einen noch offenen alten Tab mit dessen veraltetem Inhalt, statt die neue Datei zu laden. Tabs schließen und Favoriten entfernen deshalb synchron beim Delete-Auslösen — das schließt das Zeitfenster unabhängig vom Netzwerk-Timing.

## Logging-Severity als Vertrag

- `plugins/compat/log.ts` unterscheidet bewusst: `debug*` = bewusster Kompatibilitäts-Kompromiss (erwartet, nicht handlungsbedürftig), `warn*` = echte Lücke (etwas, das ein Plugin wollte und wir nicht können, oder abgelehnter Input). `console.error` bleibt an der Aufrufstelle für Exceptions.
- **`*Once`-Varianten mit explizitem Key für Render-/Event-Pfade**: Aufrufstellen, die pro Tastendruck, pro Proxy-Request oder pro Property-Zugriff feuern, fluten die Konsole sonst so, dass die eine relevante Meldung untergeht. Ein Auslöser = eine Zeile pro Session. Gilt auch außerhalb des Compat-Layers (z.B. SSE-Parse-Fehler in `useEventSource` — ein kaputter Stream produziert davon viele).

## Raw-HTML: Allowlist statt Alles-oder-Nichts

- Ursprünglich als Idee verworfen (XSS-Risiko, siehe implementation-plan.md). Umgesetzt ist jetzt eine **enge Allowlist** (`plugins/inline-html.ts`): erlaubte Tags → erlaubte Attribute, alles andere (inkl. sämtlicher `on*`-Handler, `script`, `iframe`) bleibt literaler Text. Kein generisches HTML-Rendering.
- **Eine Allowlist, zwei Renderpfade**: Live Preview (CM6) und Reading View müssen übereinstimmen, was sicher ist — sonst zeigt eine Ansicht Formatierung, die die andere als Text ausgibt. Deshalb liegen Allowlist und Attribut-Parsing in einem gemeinsamen Modul, das beide importieren. Unterschiedlich bleibt nur das Ergebnis: CM6 kann kein echtes `<font>`-Element aus einer Mark-Decoration erzeugen und wickelt in ein gestyltes `<span>`; ViewMode rendert das semantische Element.
- **Inline-Tags vs. HTML-Blocks parsen verschieden**: Lezer liefert `<font>` als getrennte `HTMLTag`-Open/Close-Nodes (Paarbildung in `inline-decorations.ts`), `<center>…</center>` dagegen als **einen** opaken `HTMLBlock`-Node — der wird wie ein Blockquote per Zeilen-CSS-Klasse behandelt und die Tag-Zeilen versteckt.

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
46. **`Content-Disposition: attachment` schützt nur Top-Level-Navigation**: Der Raw-File-Endpoint liefert SVG/HTML jetzt mit `attachment` statt `inline`, um Script-Ausführung beim direkten Öffnen (geteilter Link, neuer Tab) zu verhindern. Das wirkt NICHT bei `<img src="...">`-Einbettung (Browser führen dort ohnehin kein `<script>` in SVGs aus) — Disposition ändert nur, wie eine direkte Navigation gehandhabt wird. Bei Security-Fixes an Datei-Endpoints immer den tatsächlichen Konsum-Kontext (direkte Navigation vs. `<img>`/`<iframe>`/`<object>`) durchdenken, nicht pauschal "ein Header behebt alles" annehmen.
47. **Remark-Plugins ohne syntax.ts**: `block-ref/` und `breaks/` nutzen reine Transformer (kein micromark-Tokenizer), weil ihre Syntax entweder am Zeilenende lebt (Block Ref: `^block-id` als Marker nach letztem Inhalt) oder eine Standardfunktion überschreibt (Breaks: Soft→Hard Line-Break, Obsidians Default). Nicht jedes Plugin braucht `syntax.ts → mdast-util.ts → plugin.ts` — ein reiner MDAST-Transformer reicht wenn kein neuer Token nötig ist.
48. **EventReplayBuffer statt ReplayBuffer**: Backend-Realtime-Modul benennt die Klasse `EventReplayBuffer` in `event-replay-buffer.ts` (nicht `ReplayBuffer` in `replay-buffer.ts`). Konsistent mit dem bestehenden `event-bus.ts`-Naming.
49. **Fremdbestimmte IDs aus Dateiinhalten auf den Lookup-Key normalisieren**: `manifest.json` eines Plugins ist Upstream-/Angreifer-kontrollierter Inhalt, und sein `id`-Feld kann von der pluginId abweichen, unter der wir tatsächlich installiert haben (Community-Store-Eintrag vs. ID im heruntergeladenen Release). Jeder andere Lookup (Bundle, Styles, Settings, Aktivieren, Löschen) geht über den Verzeichnisnamen — Caller, die `manifest.id` aus `listPlugins()`/`getManifest()` weiterverwenden, laufen sonst in 404s. `loadManifest()` überschreibt `id` deshalb mit dem Verzeichnisnamen. Merkregel: Wenn ein persistiertes Objekt eine ID mitbringt, die auch als Lookup-Key dient, entscheidet der Key — nicht die Selbstauskunft der Datei.
50. **Vault-Template-Assets per `.gitattributes` auf LF pinnen**: `backend/assets/templates/**` wird byte-für-byte an den Browser ausgeliefert und von Plugin-Regexes geparst, die Unix-Zeilenenden voraussetzen (Excalidraws `DRAWING_REG` braucht ein literales `\n` um seine ```json-Fences). Mit `core.autocrlf=true` unter Windows schleicht sich CRLF bei jeder Bearbeitung still wieder ein und bricht das Parsing erneut — `text eol=lf` erzwingt LF unabhängig von der Checkout-Plattform. Gilt für jede Datei, die als Inhalt (nicht als Quellcode) ausgeliefert und maschinell geparst wird.
51. **Reducer-State doppelt gehalten = doppelt pflegen**: `mustChangePassword` lebte sowohl flach im `AuthState` als auch im `user`-Objekt. `PASSWORD_CHANGED` setzte nur das flache Flag zurück — jede Komponente, die stattdessen `user.mustChangePassword` liest, sah den Passwortwechsel nie. Bei redundanten Feldern entweder beide im selben Case aktualisieren oder die Redundanz auflösen.
52. **Zwei Injection-Stellen für dasselbe Feld = die spätere gewinnt, still**: `Plugin.scope` wurde sowohl bei Instanziierung (`plugin-context.ts`, `onPluginInstantiated`) als auch direkt vor `onload()` (`plugin-loader.ts`, als Guard gegen bundler-Class-Field-Initializer die es überschreiben) gesetzt — mit ZWEI verschiedenen Dummy-Formen (`keys` als Funktion vs. als Array). Die erste war seit ihrer Einführung toter Code, weil die zweite sie immer überschreibt, bevor `onload()` läuft; niemand hat es bemerkt, weil beide Formen "nicht crashen" erfüllten. Bei mehreren Schreibstellen für dasselbe Feld immer die zeitlich LETZTE als die tatsächlich wirksame behandeln und dort fixen — nicht die naheliegendste.
53. **"Fehler beim Lesen" ist nicht "existiert nicht"**: Der SessionStore hat einen fehlgeschlagenen Datei-Read als Beweis behandelt, dass die Session weg ist, und den Token deindiziert. Unter Windows sperren Virenscanner und synchronisierende Ordner (OneDrive) Dateien aber sporadisch (EPERM/EBUSY), und ein Read mitten in einem nicht-atomaren Write liefert kaputtes JSON — in allen drei Fällen existiert die Session weiterhin, aber die Zuordnung Token→Session war unwiederbringlich weg bis zum Prozess-Neustart. Jetzt gilt nur ENOENT oder "parst, aber verletzt das Schema" als beweisbar weg; alles andere heißt "gerade nicht lesbar", Mapping bleibt. Merkregel: Bei Filesystem-Persistenz jeden Fehlerpfad danach klassifizieren, ob er die Abwesenheit BEWEIST — sonst löscht man bei transienten I/O-Problemen echte Daten.
54. **Nur ein 401 vom Server beweist, dass die Session tot ist**: Der Session-Probe beim App-Start hat jeden fehlgeschlagenen Request als „ausgeloggt" gewertet. Ein 5xx, ein 429 oder ein abgelehnter `fetch` sagen aber nichts über die Session — der häufigste Auslöser ist der Reload nach einem Plugin-Toggle, bei dem das Backend noch neu startet. Das Ergebnis ist deshalb dreiwertig (`alive`/`dead`/`unknown`); bei `unknown` wird mit Retries gewartet und die Session behalten, statt den Nutzer für einen Zwei-Sekunden-Aussetzer auf die Login-Seite zu werfen.
55. **Gleichzeitige 401er müssen sich EINEN Probe teilen**: Ein Seitenaufbau feuert viele Requests parallel. Räumt der erste 401 sofort den Token ab, gehen alle bereits eingereihten Requests ohne `Authorization`-Header raus, kommen ihrerseits mit 401 zurück — und ein einzelner Ausrutscher lawiniert in einen garantierten Logout. Der In-Flight-Probe wird deshalb geteilt. Gleiches Muster überall, wo ein Fehler global aufräumt: erst den geteilten Klärungsschritt, dann den Teardown.
56. **CSRF-Fehler und tote Session sind clientseitig nicht unterscheidbar**: Ein 403 `CSRF_INVALID` kann ein abgelaufenes CSRF-Token ODER eine beendete Session sein. Vor jedem Teardown den Server fragen, welches von beidem — sonst wirft ein reiner Token-Refresh-Fall die Anmeldung weg.
57. **Ein periodischer Cleanup muss auch tatsächlich jemand starten**: `cleanup()` existierte, wurde aber von nichts aufgerufen — `findByToken()` räumte nur die eine Session ab, nach der gerade gefragt wurde. Sessions, nach denen nie wieder jemand fragt (verwaister Tab), blieben für immer liegen und verlangsamten jeden `findByUserId()`, den auch der Liveness-Probe des Frontends trifft. Der Sweep hängt am Composition Root (`startCleanup()`/`stopCleanup()`, `timer.unref()` damit der Prozess trotzdem beenden kann), nicht am `ISessionStore`-Interface — wie `loadIndex()`. Merkregel: Eine `cleanup()`-Methode ohne Aufrufer ist kein Cleanup, sondern totes Gewissen.

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

## Obsidian Plugin Compat — API-Versions-Audit (`OBSIDIAN_API_VERSION`, 2026-08)

- **`OBSIDIAN_API_VERSION`** (`obsidian-api-extensions.ts`) speist `requireApiVersion()` — ein Feld hier gehört erst angehoben, wenn die zugehörige API WIRKLICH implementiert ist. War lange auf `1.4.14` gepinnt (letzte vom `obsidian`-npm-Typings-Paket dokumentierte 1.4.x-Version); jetzt `1.8.7` nach vollständigem Audit.
- **Audit-Quelle**: `obsidianmd/obsidian-api`s `CHANGELOG.md` (GitHub) ist maßgeblich für Plugin-API-Änderungen — der offizielle Desktop-Changelog (`obsidian.md/changelog/...`) ist UI-fokussiert und dokumentiert API-Zusätze fast nie. Das CHANGELOG ist selbst lückenhaft (viele Minor-Versionen ohne Eintrag, weil sie schlicht keine API-Änderung hatten) — kein Vollständigkeits-Ersatz, aber die beste verfügbare Quelle.
- **Nicht-offiziell dokumentierte Felder brauchen trotzdem eine Quelle**: `footnoteRefs`/`referenceLinks`/`loadLocalStorage` (1.8.7) stehen NICHT im offiziellen Changelog, sondern kommen aus community-gepflegten Typings (`obsidian-typings`). Bei Diskrepanz zwischen Quellen: beide im Code-Kommentar nennen, nicht stillschweigend eine bevorzugen.
- **`Scope`/`Keymap` waren Attrappen ohne echten Dispatch**: `register()`/`unregister()` sammelten Handler, aber nichts rief sie je auf; `pushScope`/`popScope` waren No-Ops. Für `View.scope` (1.5.7, public gemacht) real gemacht: `Scope.handleKey(evt)` matcht Modifier+Key und ruft Handler auf (rückwärts, zuletzt registriert zuerst); `Keymap.pushScope`/`popScope` verwalten einen MODUL-LEVEL Stack (geteilt über alle `Keymap`-Instanzen — Hotkey-Scoping ist fenstergobal, nicht pro-App); ein einziger globaler `window.addEventListener('keydown', dispatchKeydownToScopeStack)` in `install-globals.ts` dispatcht hindurch. Inert bis ein Plugin tatsächlich `app.keymap.pushScope(this.scope)` aufruft — sicher, mit Slatebases eigenen Shortcuts koexistent.
- **`app.keymap` fehlte komplett**: Ohne das crasht jedes Plugin, das dem Standard-Pattern `app.keymap.pushScope(this.scope)` in `onOpen()` folgt (Kanban, Excalidraw, viele Suggest-Modals). Jetzt `readonly keymap = new Keymap()` auf `AppShim` (muss auch in dessen Proxy-`emulatedProperties`-Set stehen, sonst greift der Non-Emulated-Gap-Pfad).
- **`Plugin.onExternalSettingsChange` (1.5.7) ist eine Full-Stack-Funktion, kein reiner Frontend-Stub**: Braucht ein echtes "von woanders geändert"-Signal. Neues SSE-Event `plugin-settings:change` (broadcast, Payload `{vaultId, pluginId}`) von `PluginService.saveSettings()` publiziert; Frontend-Bridge (`pluginSettingsChangeBridge.ts`, Modul-Level-`Set<Callback>`-Pattern wie `realtimeVaultBridge.ts`) leitet an `plugin-context.ts` weiter, das die passende `PluginInstance` aus dem Loader holt. Loop-Prevention wie bei `markPluginWrite()`: `settings-manager.ts` merkt sich eigene Writes 2s lang (`wasRecentSettingsWrite()`), sonst meldet sich ein Plugin sein eigenes `saveData()` als "extern" zurück.
- **`Workspace.ensureSideLeaf`/`WorkspaceLeaf.isDeferred`+`loadIfDeferred` (1.7.2)**: `ensureSideLeaf` matcht existierende Leaves über `view.getViewType()`, nicht über den Registrierungs-Key — ein Test-View, der `getViewType()` nicht überschreibt, wird nie gefunden. `isDeferred` ist bei Slatebase immer `false`/`loadIfDeferred()` ein No-Op, weil `setViewState()` die View immer synchron eager erstellt — es gibt nie einen deferred Zustand zu melden.
- **Ein Persistenz-Schema, das ein Feld wegwirft, ist eine stille Datenquelle-Falle**: `_registry.json` hat kein `manifest`-Feld, Zod strippt es bei jedem Save. Beim Auto-Load nach Reload bekamen Plugins deshalb einen Platzhalter mit `version: "0.0.0"` und der id als Namen über sich selbst zu lesen — sichtbar an Excalidraws Dialog "version recorded by Obsidian is 0.0.0". Fix ist NICHT, das Schema zu erweitern (ein zweiter Manifest-Snapshot veraltet, sobald das Plugin auf der Platte aktualisiert wird), sondern `hydrateManifests()` aus dem `GET /plugins`-Response: `manifest.json` bleibt einzige Wahrheit. Merkregel: Wenn ein Feld beim Persistieren verloren geht, prüfen, ob es überhaupt persistiert gehört — oft ist die Quelle noch da und nur der Rehydrierungs-Schritt fehlt.

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
- **CachedMetadata-Felder komplett**: Bis 2026-08 gab es genau EINEN Pfad, der `CachedMetadata` für echte Plugin-Nutzung erzeugte (`MetadataCacheShim.parseContentToMetadata()` via `populateFromContent()`), und der befüllte nur `frontmatter`/`tags`/`links`/`blocks` — obwohl `types.ts` schon lange `headings`, `embeds`, `sections`, `listItems`, `footnotes` (1.6.6), `footnoteRefs`/`referenceLinks` (1.8.7) und `frontmatterLinks` (1.4.0) deklarierte. `updateFileCache()`/`buildInitialCache()`, die theoretisch den Rest hätten liefern können, wurden nirgends außerhalb von Tests aufgerufen. Typ-Deklaration ≠ Implementierung — vor dem Abhaken eines API-Felds immer den tatsächlichen Producer-Pfad prüfen, nicht nur `types.ts`. Fix: `metadata-parser.ts` (neues Modul, `parseMetadata()`) parst jetzt ALLE Felder in einem Durchlauf; `parseContentToMetadata()` delegiert nur noch dorthin. `sections`/`listItems` sind Best-effort-CommonMark-Annäherungen wie `parseBlocks`/`scanFencedCodeBlocks` vorher — `ListItemCache.parent` nutzt eine vereinfachte Konvention (Zeilennummer des unmittelbaren Eltern-Listenelements, `-1` für Top-Level) statt Obsidians undokumentierter negativer Section-Zeilennummer für Root-Items.
- **`changed` Event-Signatur**: `trigger('changed', file, '', metadata)` — 3 Args (file, raw-data-string, cache). Obsidian übergibt den Rohtext als zweiten Parameter.
- **Per-File `resolve` Event**: Emittiert in `updateFileCache()` nach `changed`.

## Obsidian Plugin Compat — Utility-Funktionen & Events

- `arrayBufferToBase64`, `base64ToArrayBuffer`, `hexToArrayBuffer`, `arrayBufferToHex`: Encoding-Utilities auf `window.obsidian`.
- `parseFrontMatterAliases(frontmatter)`: Extrahiert `aliases`/`alias` Feld als `string[]`.
- `setTooltip(el, text)` / `displayTooltip(el, text)`: Setzt `aria-label` + `title`.
- `stripHeading(heading)` / `stripHeadingForLink(heading)`: Normalisierung für Link-Matching.
- **Workspace `resize` Event**: Bridged via `window.addEventListener('resize', ...)`.
- **Workspace `editor-change` Event**: Bridged via MutationObserver auf `.cm-content` + `input`-Event.
