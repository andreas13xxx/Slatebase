# Obsidian Plugin Compatibility — Slatebase

**Datum:** 2026-08-12
**Scope:** Obsidian Community-Plugin-Kompatibilitätsschicht (`frontend/src/plugins/compat/`, `backend/src/plugin*`)
**Methodik:** Quellcode-Audit der Shim-Implementierung + statische Bundle-Analyse der 100 meistheruntergeladenen Community-Plugins (Obsidians offizieller `community-plugin-stats.json`-Feed) + Abgleich mit real getesteten Plugins aus der Entwicklungshistorie + Wartungsstatus-Audit der 100 GitHub-Repos (Stand 2026-08-15, siehe [Wartungsstatus der Top-100-Plugins](#wartungsstatus-der-top-100-plugins-upstream-pflege))

---

## Zusammenfassung

Slatebase emuliert eine Teilmenge der Obsidian-Plugin-API (`App`, `Vault`, `Workspace`, `MetadataCache`, `FileManager`, Command-Palette, Event-System) im Browser, damit echte Obsidian-Community-Plugins im Web-Frontend laufen — ohne Electron, ohne Node.js, ohne lokales Dateisystem. Der Layer gilt weiterhin als **⚠️ experimentell**.

Von den 100 meistheruntergeladenen Community-Plugins:

| Kompatibilität | Anzahl | Anteil |
|---|---:|---:|
| Voll kompatibel | 70 | 70 % |
| Teilweise kompatibel | 19 | 19 % |
| Nicht unterstützt (Desktop-only) | 11 | 11 % |

11 der 100 Plugins wurden zusätzlich manuell mit ihrem echten, aus GitHub geladenen Bundle in der laufenden App getestet (nicht nur statisch analysiert) — siehe [Manuell getestete Plugins](#manuell-getestete-plugins).

**Update 2026-08-12:** Mehrere zuvor unemulierte API-Methoden wurden ergänzt — echte Implementierungen für `metadataCache.getBacklinksForFile`, `metadataCache.isUserIgnored`, `fileManager.createNewFile`; als graceful-degradation-Stub „grün" geschaltet: `workspace.iterateCodeMirrors`, `workspace.protocolHandlers`/`protocolHandler`, `workspace.getActiveFileView`; und die Plugin-Verwaltungs-API `app.plugins.loadManifests`/`requestSaveConfig`/`enablePluginAndSave`/`disablePluginAndSave`. Bewusst **nicht** emuliert bleiben `app.plugins.installPlugin` und `getPluginFolder` (siehe [Was wird nicht unterstützt](#was-wird-nicht-unterstützt)). Die Tabellen-Zeilen unten wurden entsprechend neu abgeglichen — mechanisch anhand der bereits dokumentierten Befunde, nicht durch erneutes Laden der echten GitHub-Bundles.

**Update 2026-08-15 — zwei unabhängige Aktualitäts-Lücken gefunden:**
1. **Die emulierte API-Version 1.8.7 war selbst veraltet — inzwischen behoben.** Echtes Obsidian Desktop stand bei **1.13.7** (Release 2026-08-12), fünf Minor-Versionen weiter, inklusive der „Bases"-Core-Funktion (seit 1.9.0). Konkreter Treffer war **Templater** (Platz 2 der Tabelle), das ab Release 2.25.0 `minAppVersion: 1.13.0` verlangt — über der damals emulierten Version. **Status 2026-08-16:** `OBSIDIAN_API_VERSION` steht jetzt auf **1.13.2**, mit tatsächlich implementierten APIs bis einschließlich 1.13.1 (u. a. ConfirmationModal, DisplayValueComponent, `SliderComponent.setDisplayFormat()`, SearchComponent-`setStatus()`). Templater, Excalidraw und Tasks liegen damit wieder unterhalb der emulierten Version. Zwei Bereiche aus diesem Versionsband sind bewusst **typisiert, aber nicht funktional** umgesetzt — als nicht-abstürzende No-Ops, nicht als stille Lücken: **Bases** (1.10.x, keine Formel-Engine, kein `.base`-Rendering) und der **Desktop-CLI-Handler** (1.12.2, in einer Web-App existiert keine CLI). Der `compatibility-analyzer` stuft jedes Plugin, das diese referenziert, als „teilweise" statt „voll" ein. Die Downloads-Rangliste wurde gegen die live `community-plugin-stats.json` geprüft und stimmt weiterhin.
2. **Separat davon, unabhängig von Slatebases eigener API-Version:** ein Wartungsstatus-Audit der 100 GitHub-Repos ergab, dass 24 der 100 Plugins seit über 12 Monaten keinen Commit mehr hatten (teils archiviert/umbenannt) — bei 4 davon gibt es bestätigte GitHub-Issues, dass sie bereits unter aktuellem, echtem Obsidian nicht mehr funktionieren. Ein kaputtes Upstream-Plugin bleibt kaputt, egal wie aktuell Slatebases Emulation ist. Details: [Wartungsstatus der Top-100-Plugins](#wartungsstatus-der-top-100-plugins-upstream-pflege). **Unverändert offen** — der API-Bump oben ändert daran nichts.

---

## Architektur (Kurzüberblick)

```
Plugin-Verwaltungsseite / Command Palette (UI)
        │
PluginLoader (Bundle laden, Lifecycle: onload/onunload, 10s-Timeout)
        │
PluginSandbox (Netzwerk-Allowlist, Storage-Namespacing, Cross-Vault-Schutz)
        │
API-Shim-Layer (App, Vault, Workspace, MetadataCache, FileManager, Commands)
        │
Event-System (on/off/trigger, EventRef)
        │
Slatebase API-Client / State
        │
Backend Plugin-Store (REST-API, dateibasierte Persistenz pro Vault)
```

- **Proxy-basiertes API-Shimming**: Nicht emulierte Property-/Methodenzugriffe auf Shim-Objekten liefern `undefined`/No-Op zurück statt zu crashen, mit einer einmaligen `console.warn` pro Property und Plugin-Instanz.
- **Kein Web Worker**: Plugins erwarten synchronen DOM-Zugriff; die Sandbox arbeitet über API-Interception und Monitoring, nicht über Worker-Isolation.
- **Vault-scoped Instanzen**: Jedes Plugin bekommt pro Vault eine eigene `AppShim`. Bei Vault-Wechsel: unload → neu instanziieren → load.
- **Emulierte API-Version**: `1.13.2` (Stand 2026-08-16; APIs bis einschließlich 1.13.1 sind implementiert). Plugins mit höherer `minAppVersion` gelten als inkompatibel. Bases (1.10.x) und der Desktop-CLI-Handler (1.12.2) sind bewusst nur typisiert, nicht funktional — Plugins, die sie referenzieren, stuft der `compatibility-analyzer` als „teilweise" ein.
- **Lazy Loading**: Plugins laden asynchron nach dem ersten Rendering (First Contentful Paint), um die Ladezeit nicht zu beeinträchtigen.

---

## Was wird unterstützt

### Vault
`read`, `modify`, `create`, `createFolder`, `delete`, `rename`, `trash`, `copy`, `process`, `append`, `exists`, `cachedRead`, `getAbstractFileByPath` (+ `Insensitive`), `getFileByPath`, `getFolderByPath`, `getMarkdownFiles`, `getFiles`, `getAllLoadedFiles`, `getAllFolders`, `getRoot`, `getName`, `getConfig`, `getAvailablePath(ForAttachments)`, `getResourcePath`, `createBinary`/`readBinary`/`modifyBinary`, Events (`on`/`off`/`offref`/`trigger`). `vault.adapter` implementiert Obsidians `DataAdapter`-API (`exists`, `read`, `write`, `list`, `stat`, `mkdir`, `remove`, `rename`) für Plugins, die direkt am Adapter statt an der Vault-API vorbeigehen.

### MetadataCache
`getFileCache`, `getCache`, `getFirstLinkpathDest`, `resolvedLinks`, `unresolvedLinks`, `fileToLinktext`, `getTags`, `blockCache`, `getBacklinksForFile`, `isUserIgnored`, Events. `CachedMetadata` wird vollständig befüllt: `frontmatter`, `tags`, `links`, `blocks`, `headings`, `embeds`, `sections`, `listItems`, `footnotes`/`footnoteRefs`, `referenceLinks`, `frontmatterLinks`. Parsing läuft synchron on-demand nach jedem `vault.read()`. `getBacklinksForFile` invertiert dieselbe Link-Auflösung wie `resolvedLinks` und liefert `{ data: Map<Quellpfad, LinkCache[]>, count() }`. `isUserIgnored` liefert immer `false` — Slatebase hat kein "Excluded files"-Setting, was exakt Obsidians eigenem Default bei leerer Ausschlussliste entspricht.

### Workspace / Leaf-API
Tabs und Sidebar-Panels bilden Obsidians Leaf-Konzept ab: `getLeaf`, `getLeavesOfType`, `getActiveViewOfType`, `getActiveFileView`, `getMostRecentLeaf`, `revealLeaf`, `detachLeavesOfType`, `getActiveLeaf`, `setActiveLeaf`, `getRightLeaf`/`getLeftLeaf`, `openLinkText`, `getUnpinnedLeaf`, `iterateAllLeaves`/`iterateRootLeaves`, `onLayoutReady`, `registerHoverLinkSource`, Events (`active-leaf-change`, `layout-change`, `file-open`, `editor-change`, `resize`). Plugin-Views laufen als eigene Tabs im Hauptbereich (virtueller Pfad `__view::{viewType}`) oder als Sections im rechten Context Panel. `getActiveFileView` ist eine echte (undokumentierte, aber stabile) Obsidian-Internal-API und liefert dieselbe View wie `getActiveViewOfType(FileView)` — keine Degradation.

**Graceful Degradation statt Fehler**: Methoden, für die Slatebase keine echte Entsprechung hat, aber deren Ersatzverhalten offensichtlich und harmlos ist, gelten als *unterstützt* und loggen zur Laufzeit, was sie stattdessen tun — kein Kompatibilitäts-Warnhinweis vor der Installation:
- `createLeafBySplit`/`splitActiveLeaf` → neuer Tab statt echtem Split
- `getLeftLeaf` → wird wie `getRightLeaf` behandelt (siehe [Was wird nicht unterstützt](#was-wird-nicht-unterstützt))
- `openPopoutLeaf` → normaler Tab statt Popout-Fenster
- `getLayout`/`rootSplit`/`leftSplit`/`rightSplit`/`floatingSplit` → Stub-Objekte
- `leftRibbon`/`rightRibbon` → Stubs mit no-op `hide()`/`show()`/`toggle()`
- `iterateCodeMirrors` → Callback wird nie aufgerufen (kein CM5 in Slatebase)
- `protocolHandlers`/`protocolHandler` → echte, beschreibbare `Map`/Feld, aber nie aufgerufen (Web-App kann kein `obsidian://`-URI-Scheme vom OS empfangen)

### FileManager
`renameFile`, `processFrontMatter`, `generateMarkdownLink`, `getNewFileParent`, `createNewMarkdownFile`, `createNewFile`, `promptForFileDeletion`, `trashFile`, `getAvailablePathForAttachment`. `createNewFile` erlaubt beliebige Extensions (nicht nur `.md`); `createNewMarkdownFile` ruft es intern nur noch mit `'md'` auf. `promptForFileRename` loggt eine Konsolenmeldung und lässt die Datei unangetastet (kein Rename-Dialog in Slatebase).

### Plugin-Verwaltung (`app.plugins`)
`getPlugin`, `plugins`, `enabledPlugins`, `manifests`, `loadManifests`, `requestSaveConfig`, `enablePluginAndSave`, `disablePluginAndSave`. `loadManifests()` fragt `manifest.json` für alle installierten Plugins neu vom Backend ab (derselbe Refresh, den der Vault-Start ohnehin macht). `requestSaveConfig()` wartet auf ausstehende Registry-Writes — die selbst schon bei jeder Status-/Permission-Änderung sofort ans Backend persistiert werden, hier also ein ehrlicher Flush statt eines Leerlauf-Stubs. `enablePluginAndSave`/`disablePluginAndSave` delegieren 1:1 an denselben Pfad wie der Settings-Seiten-Toggle — **inklusive** eines unbedingten `window.location.reload()` nach jedem Disable (Workaround für Plugins wie LiveSync, die nach einem Unload nicht sauber innerhalb derselben Session neu starten können). Das gilt für **jeden** Aufruf von `disablePluginAndSave`, unabhängig davon, welches Plugin es aufruft oder welche ID übergeben wird — es gibt keine Scope-Beschränkung auf das aufrufende Plugin selbst.

### Commands, Hotkeys & Core-Commands
`addCommand`/`removeCommand`, Command-ID-Namespacing (`<pluginId>:<commandId>`), Suche (case-insensitive, 50 Treffer-Limit). Obsidians eingebaute Commands (`editor:*`, `workspace:*`, `app:*`, `file-explorer:*`, `theme:*`) sind unter ihrer echten ID registriert, damit `executeCommandById()` funktioniert. Commands ohne Slatebase-Entsprechung (Fensterverwaltung, PDF-Export, Quick Switcher, Code-Folding) existieren als expliziter No-Op statt gar nicht zu existieren. `app.commands` und `app.hotkeyManager.customKeys` sind echte, iterierbare Registries (keine leeren Platzhalter).

### Events, Scope & Keymap
`on`/`off`/`trigger`/`offref` mit garantierter Registrierungsreihenfolge und Exception-Isolation pro Callback. `Scope`/`Keymap` sind echt (nicht nur Attrappen): `app.keymap.pushScope`/`popScope` verwalten einen fenster-globalen Scope-Stack, `Scope.handleKey()` matcht Modifier+Taste gegen registrierte Handler.

### Settings & Persistenz
`loadData`/`saveData` (Round-Trip, max. 1 MB, pro Plugin + Vault isoliert). Deklarative Settings-API (`getSettingDefinitions()`, ab Obsidian 1.13) wird automatisch gerendert (`group`, `list`, `page`, alle Standard-Controls). `Plugin.onExternalSettingsChange` ist über SSE End-to-End verdrahtet — eine Einstellungsänderung in einem Tab/Gerät erreicht die anderen live.

### CSS
Plugin-`styles.css` (max. 512 KB) wird beim Aktivieren injiziert und beim Deaktivieren vollständig entfernt, alle Selektoren automatisch auf `[data-plugin-id="…"]` gescoped (Descendant- und Self-Form). `body.theme-dark`/`theme-light` und Plattform-Klassen (`is-mobile`, `mod-macos`) werden synchronisiert, damit Plugin-Dark-Mode-CSS und Runtime-Theme-Checks funktionieren.

### Sicherheit / Sandbox
Deny-by-default-Permissions (Netzwerk, Dateisystem-Schreibzugriff, DOM-Manipulation — alle `false` bei Neuinstallation). Cross-Origin-Requests laufen über einen Backend-Proxy mit Domain-Allowlist. Bundle-Integritätsprüfung lehnt `eval(`, `new Function(`, `document.write(` ab. Main-Thread-Blockierung >5s deaktiviert ein Plugin automatisch. Eine `ErrorBoundary` um den Plugin-Provider verhindert, dass ein Plugin-Fehler wie ein App-Absturz aussieht.

### Sonstiges
Globale Obsidian-Prototype-Erweiterungen (`Array.prototype.remove/first/last`, `Element.prototype.find/findAll`, `String.prototype.contains`, `Math.clamp/square`, u.a.), vollständige Lucide-Icon-Auflösung (`setIcon`/`getIcon`, kein hartes `null` für gelistete IDs), `requestUrl()`, CodeMirror-6-Extensions (echte `@codemirror/*`-Module, kein Stub), `SuggestModal`/`FuzzySuggestModal`, `Notice`.

---

## Was wird nicht unterstützt

- **Desktop-only-Plugins** (`manifest.json`: `isDesktopOnly: true`): Nutzen Node.js/Electron-APIs (Dateisystem, Kindprozesse, native Module), die im Browser nicht existieren. Der Community-Plugin-Store blendet für diese Plugins den Install-Button aus. Ein manueller ZIP-Upload ist technisch nicht blockiert, das Plugin wird aber als „Nicht unterstützt" markiert und wird in aller Regel beim Laden fehlschlagen. 11 der Top-100-Plugins sind betroffen.
- **Echtes Split-Pane-/Fenster-Layout**: Slatebase hat ein flaches Tab-System, keinen Baum aus Splits. `createLeafBySplit`/`splitActiveLeaf` erzeugen einen neuen Tab statt eines echten Splits; `getLayout()`/`rootSplit` etc. sind Stubs ohne reale Baumstruktur. Plugins, die den Split-Baum aktiv inspizieren oder umbauen, funktionieren nicht wie in Obsidian.
- **Popout-Fenster / Multi-Window**: `openPopoutLeaf`/`moveLeafToPopout` öffnen kein separates Browser-Fenster — sie fallen auf einen normalen Tab zurück bzw. sind gar nicht emuliert.
- **Eigene linke Sidebar für Plugin-Views**: Slatebase hat kein separates linkes Plugin-Panel. `getLeftLeaf()` liefert technisch ein Leaf, das aber — wie `getRightLeaf()` — im *rechten* Context Panel landet. Zwei nebeneinander gedachte Sidebar-Views (Obsidian: links + rechts getrennt) verschmelzen in Slatebase zu Tabs im selben Panel.
- **Direkter DOM-Zugriff auf den Datei-Explorer** (`fileExplorer.view.fileItems[path]`, `titleEl` je Datei-/Ordner-Zeile): nicht emuliert. Reales Obsidian gibt Plugins über `workspace.getLeavesOfType('file-explorer')` Zugriff auf ein DOM-Element pro Datei-/Ordner-Zeile im Dateibaum; Slatebases Dateibaum ist React-gerendert und exponiert keine solche Struktur. Betrifft namentlich **Iconize** (`obsidian-icon-folder`) — dessen Kernfunktion, Dateien/Ordnern ein Icon zuzuweisen, hängt exakt an diesem Pfad (`fileExplorer.view.fileItems[path]` → `getFileItemTitleEl(fileItem)` → `titleEl.querySelector('.iconize-icon')`, belegt durch statische Analyse des realen main.js v2.14.7) — und vermutlich weitere Datei-Explorer-Erweiterungen (z. B. File Explorer Note Count, Folder notes). Unabhängig davon lädt Iconize die meisten Icon-Packs (Boxicons, Feather, Simple Icons, Tabler, …) ohnehin per `requestUrl()` als ZIP von GitHub nach — selbst mit diesem DOM-Hook blieben solche Icons von der Netzwerk-Allowlist des Backend-Proxys abhängig, nicht vom Obsidian-Icon-Namensmapping.
- **`app.plugins.installPlugin`**: Lädt in echtem Obsidian ein Plugin direkt von einem beliebigen GitHub-Repo herunter und führt es aus (die Grundlage von BRAT). Bewusst **nicht** emuliert, aus Sicherheitsgründen statt technischer Unmöglichkeit: Slatebases echter Install-Pfad (`apiClient.installFromStore`) läuft absichtlich backend-vermittelt über einen kuratierten Plugin-Store. Ein plugin-aufrufbares `installPlugin` würde diesen Trust-Boundary umgehen — jedes installierte Plugin könnte dann selbständig und ohne Nutzerbestätigung weitere Plugins nachladen.
- **`app.plugins.getPluginFolder`**: nicht emuliert — Slatebase hat kein Dateisystem-Konzept pro Plugin (`.obsidian/plugins/<id>/`), ein zurückgegebener Pfad wäre reine Fiktion.
- **`app.plugins.checkForUpdates`** und **`app.plugins.updates`** (Update-Status-Registry): nicht emuliert — Slatebase hat einen eigenen Update-Mechanismus im Plugin-Store.
- **`vault.setConfig()`**: Schreibzugriff auf Obsidians App-Einstellungen (z. B. `readableLineLength`) ist nicht emuliert, nur der Lesezugriff (`getConfig()`).
- **Native Datei-/Ordner-Löschdialoge** (`fileManager.promptForDeletion`/`promptForFolderDeletion`), `fileManager.createNewFolder` und `fileManager.createAndOpenMarkdownFile`: nicht emuliert (Alternativen: `promptForFileDeletion`, `vault.createFolder`, `createNewMarkdownFile` + manuelles Öffnen).
- **Legacy-Workspace-Aliase** (`workspace.iterateLeaves`, `workspace.onLayoutChange`) und **Drag&Drop-Reordering von Leaves**: nicht emuliert (Alternativen: `iterateAllLeaves`/`iterateRootLeaves`, das `layout-change`-Event).
- **`metadataCache.inProgressTaskCount`**, **`metadataCache.onCleanCache`**, **`metadataCache.initialized`**: nicht emuliert — Slatebase indiziert synchron on-demand, es gibt keinen asynchronen Indexierungsfortschritt zu melden.
- **Obsidians natives Link-Kontextmenü-Hook** und **`fileManager.iterateAllRefs()`** (Referenz-Iteration über den ganzen Vault): nicht emuliert.
- **Automatisches Umschreiben interner Links** (`updateInternalLinks`): nicht emuliert.
- **`workspace.hoverLinkSources`** (Lesezugriff auf die Registry) und **`workspace.getGroupLeaves`**: nicht emuliert (Alternative für Ersteres: `registerHoverLinkSource`/`unregisterHoverLinkSource`, die schreibend funktionieren).
- **Tab-Pinning**: Slatebase hat kein Pinning-Konzept; `getUnpinnedLeaf()` erstellt einfach ein neues Leaf.
- **Deferred Leaves** (`WorkspaceLeaf.isDeferred`/`loadIfDeferred`, seit Obsidian 1.7.2): immer `false`/No-Op, weil `setViewState()` in Slatebase Views immer synchron-eager erstellt — es gibt nie einen „deferred" Zustand zu melden.
- **Obsidian Sync / Publish**: proprietäre Obsidian-Dienste, kein Bestandteil der Plugin-API-Emulation.
- **Vim-Keybindings im Editor**: Slatebase hat keine eigene Vim-Keymap-Engine (`@replit/codemirror-vim`). `window.CodeMirrorAdapter.Vim` existiert nur als No-Op-Stub (`defineAction`/`handleEx`/`enterInsertMode`/`mapCommand`), damit Plugins, die optional daran andocken (z. B. Outliner, s. o.), nicht mit `console.error` abbrechen — echte Vim-Normalmodus-Befehle laufen dadurch aber nicht.

**Geplant, aber noch nicht implementiert:** Server-seitige Ausführung von Desktop-only-Plugins in einer Node.js-VM-Sandbox steht auf der Roadmap, würde aber Dateisystem-/Prozess-APIs serverseitig statt im Browser bereitstellen — bis dahin bleiben Desktop-only-Plugins vollständig außen vor.

---

## Kompatibilitäts-Klassifizierung

Jedes Plugin wird beim Installieren/Hochladen statisch analysiert (`compatibility-analyzer.ts`) und in eines von vier Levels eingeordnet — dieselbe Logik wurde für die Tabelle unten verwendet:

1. **Manifest-Gate**: `isDesktopOnly: true` → sofort **Nicht unterstützt**, keine weitere Analyse.
2. **Node.js-Modul-Erkennung**: `require()`/`import` von Node-Builtins (`fs`, `child_process`, `electron`, …) wird erkannt, führt aber *nicht* automatisch zu „Nicht unterstützt" — viele Bundler ziehen solche Referenzen tot oder optional ein, wenn das Plugin selbst nicht `isDesktopOnly` deklariert (starkes Signal: läuft es auf Obsidian Mobile, läuft es ohne Node.js).
3. **API-Zugriffsmuster-Analyse**: Regex-Erkennung von `this.app.<namespace>.<methode>`-Zugriffen, klassifiziert gegen eine Positivliste vollständig emulierter Methoden.
4. **Level-Berechnung**:
   - **Voll kompatibel**: alle erkannten API-Zugriffe sind emuliert (oder keine Zugriffe erkannt).
   - **Teilweise kompatibel**: mindestens ein nicht-emulierter, aber nicht lifecycle-kritischer Zugriff.
   - **Nicht unterstützt**: ein lifecycle-kritischer Zugriff (`onload`, `onunload`, `Plugin.registerEvent`, `vault.read`, `vault.modify`) ist nicht emuliert, oder `isDesktopOnly: true`.
   - **Unbekannt**: Bundle leer/stark obfuskiert, Analyse nicht möglich.

Die UI-Badges in der Plugin-Verwaltung heißen entsprechend „Voll kompatibel", „Teilweise kompatibel", „Nicht unterstützt", „Unbekannt".

---

## Manuell getestete Plugins

Die statische Analyse prüft nur, *welche* API-Methoden ein Bundle aufruft — nicht, ob das Plugin damit tatsächlich funktioniert. Ein Teil der Härtungsarbeit an der Compat-Schicht entstand ausschließlich durchs Laufenlassen echter, aus GitHub geladener Plugin-Bundles in der laufenden App (nicht aus der API-Dokumentation ableitbar):

| Plugin | Was der Test aufgedeckt hat |
|---|---|
| **Excalidraw** | Icons, die beim Modul-Load in einen vDOM-Baum eingefroren werden, brauchten Vorab-Auflösung statt asynchronem Nachfüllen; `theme-dark`-Klasse auf `document.body` nötig für den Canvas-Hintergrund |
| **Templater** | Deklarative Settings (v2.23+) statt `display()`; `getActiveViewOfType(MarkdownView)` braucht eine echte Klassenkette für `instanceof` |
| **Dataview** | Löste den vollständigen MetadataCache-Umbau aus: `outlinks`/`inlinks` statt `links`, PrefixIndex braucht echten Root-`TFolder`, `getFileCache()` darf nie `null` für existierende Dateien liefern, `syntaxTree`-Wrapper für Inline-Query-Ranges |
| **Kanban** | Läuft als Datei-Ansicht statt eigenem Tab; Preact/`MarkdownDomRenderer`-Lifecycle-Kette (`_loaded`, `addChild`) |
| **Tasks** (obsidian-tasks) | Profitierte von der allgemeinen Bundle-Härtung, keine plugin-spezifischen Sonderfälle |
| **Git** (obsidian-git) | `Buffer`/`path`-Shim müssen vor Bundle-Evaluation stehen (isomorphic-git referenziert sie auf Modul-Top-Level) |
| **Day Planner** | `ItemView.containerEl` positioneller Zwei-Kind-Vertrag (Header, dann `contentEl`) |
| **Iconize** (obsidian-icon-folder) | `getIcon()` darf nie `null` für gelistete IDs liefern |
| **Self-hosted LiveSync** | `noticeEl.isShown()`-Patch, `adapter.mkdir()` No-Op, Proxy-Timeout bei Long-Poll |
| **Editing Toolbar** | `app.commands`/`hotkeyManager.customKeys` als echte Registries, Ribbon-Stubs mit `hide()`/`show()`/`toggle()` |
| **Calendar** | `Array.prototype.first()`, `vault.create()` als create-or-get |
| **Outliner** (obsidian-outliner) | Prüft `window.CodeMirrorAdapter.Vim` (Obsidians `@replit/codemirror-vim`-Global) für sein optionales „Vim `o`/`O`-Verhalten überschreiben"-Feature und loggt sonst `console.error("Vim adapter not found")` — harmlos (Plugin lädt und der Rest funktioniert normal), aber jetzt als No-Op-Stub emuliert statt als Fehler sichtbar zu sein |

Die ES5-Downlevel-Basisklassen-Kompatibilität (`_super.call(this, …)`-Aufrufform statt `super()`), die synchrone Icon-Vorab-Auflösung, der `Buffer`/`path`-Shim und die `ErrorBoundary` um den Plugin-Provider gelten für **alle** Plugins, nicht nur die oben genannten — sie wurden nur durch diese sieben entdeckt.

---

## Top 100 Community-Plugins nach Downloads

**Datenquelle:** `community-plugin-stats.json` + `community-plugins.json` (`obsidianmd/obsidian-releases`, Obsidians eigener aggregierter Download-Feed — derselbe, den Slatebases Plugin-Store selbst nutzt), abgerufen 2026-08-11. „Downloads" ist die kumulative Zähler-Summe über alle Versionen laut diesem Feed.

**Methodik pro Zeile:** `manifest.json` und `main.js` des jeweils *neuesten* GitHub-Release wurden geladen und mit derselben Analyzer-Logik wie `compatibility-analyzer.ts` klassifiziert (Regex-Positivlisten-Abgleich, identische Kopie der Klassifizierungstabellen). Für die 11 Plugins in der Tabelle oben liegt zusätzlich echte manuelle Testerfahrung vor (Spalte „Manuell getestet").

**Caveats:**
- Statische Analyse ist eine Annäherung, kein Ausführungstest — „Voll kompatibel" heißt „keine bekannte Lücke in den *erkannten* API-Aufrufen", nicht „funktioniert garantiert wie in Obsidian".
- „Neuestes Release" auf GitHub ist nicht immer der Haupt-Plugin-Build — bei Repos mit mehreren Release-Kanälen (z. B. Begleitprozesse) kann das zu keinem `main.js` im erwarteten Release führen; in diesem Fall wurde ausschließlich über das Manifest klassifiziert.
- `vault.copy()` ist in Slatebase tatsächlich implementiert, fehlt aber noch in der Positivliste des Analyzers — die zwei betroffenen Zeilen sind als bekannte Analyzer/Shim-Diskrepanz markiert, nicht als echte Lücke.
- „Installierbar" bezieht sich auf den Community-Plugin-Store-Browser (Install-Button). Ein manueller ZIP-Upload ist bei Desktop-only-Plugins nicht hart blockiert, aber praktisch nicht lauffähig.

| # | Plugin | Downloads | Autor | Desktop-only | Installierbar | Kompatibilität | Wartungsstatus | Manuell getestet | Bekannte Einschränkungen |
|---:|---|---:|---|:---:|:---:|---|:---:|:---:|---|
| 1 | [Excalidraw](https://github.com/zsviczian/obsidian-excalidraw-plugin) (`obsidian-excalidraw-plugin`) | 7.133.794 | zsviczian | Nein | Ja | Voll kompatibel | Aktiv | ✅ Ja (echtes Bundle) | Icons, die beim Modul-Load in einen vDOM-Baum eingefroren werden (`ICONS = { … }`), werden vorab aufgelöst, sonst bleiben sie leer. `theme-dark`-Klasse auf `document.body` nötig für den Canvas-Hintergrund. `activeLeaf` ist nie `null` (leerer `empty`-View statt), da `isUnwantedLeaf()` das voraussetzt. |
| 2 | [Templater](https://github.com/silentvoid13/Templater) (`templater-obsidian`) | 5.212.156 | silentvoid13 | Nein | Ja | Voll kompatibel | Aktiv | ✅ Ja (echtes Bundle) | Deklarative Settings (`getSettingDefinitions()`, ab v2.23) werden gerendert statt `display()`. `getActiveViewOfType(MarkdownView)` liefert eine echte `instanceof`-Instanz aus der Klassenkette Component→View→ItemView→FileView→MarkdownView. |
| 3 | [Dataview](https://github.com/blacksmithgu/obsidian-dataview) (`dataview`) | 4.744.717 | blacksmithgu | Nein | Ja | Voll kompatibel | Aktiv | ✅ Ja (echtes Bundle) | Treiber hinter dem vollständigen MetadataCache-Umbau: `this.file.links` existiert real in Obsidian nicht — richtig heißt es `outlinks`/`inlinks`; der Dataview-Worker parst Tags/Frontmatter nicht selbst, sondern verlangt beides fertig von der MetadataCache; `getAbstractFileByPath("")`/`"/"` muss den Root-`TFolder` liefern (PrefixIndex); `getFileCache()` darf für existierende Dateien nie `null` liefern, sonst wird die Datei beim Indexieren übersprungen. Inline-Queries brauchen einen `syntaxTree`-Wrapper, der `InlineCode`-Node-Ranges an Obsidians Backtick-Konvention anpasst. |
| 4 | [Tasks](https://github.com/obsidian-tasks-group/obsidian-tasks) (`obsidian-tasks-plugin`) | 3.999.320 | obsidian-tasks-group | Nein | Ja | Voll kompatibel | Aktiv | ✅ Ja (echtes Bundle) | Profitiert von der allgemeinen Bundle-Härtung (ES5-`_super.call()`-Basisklassen, synchrone Icon-Auflösung). Keine plugin-spezifischen Sonderfälle dokumentiert. |
| 5 | [Advanced Tables](https://github.com/tgrosinger/advanced-tables-obsidian) (`table-editor-obsidian`) | 3.097.039 | Tony Grosinger | Nein | Ja | Voll kompatibel | Aktiv | – Nur statische Analyse | Statische Analyse: alle erkannten API-Zugriffe vollständig emuliert. |
| 6 | [Calendar](https://github.com/liamcain/obsidian-calendar-plugin) (`calendar`) | 2.988.843 | Liam Cain | Nein | Ja | Voll kompatibel | ⚠️ Inaktiv seit 2024 | ✅ Ja (echtes Bundle) | `Array.prototype.first()` (globale Prototype-Extension) wird genutzt. `vault.create()` verhält sich create-or-get, da Calendar kein Reject bei existierender Datei erwartet. |
| 7 | [Git](https://github.com/vinzent03/obsidian-git) (`obsidian-git`) | 2.980.609 | Vinzent | Nein | Ja | Voll kompatibel | Aktiv | ✅ Ja (echtes Bundle) | `Buffer` und ein browser-sicherer POSIX-`path`-Shim müssen vor der Bundle-Evaluation stehen (isomorphic-git referenziert sie auf Modul-Top-Level). Atomare Backend-Writes wiederholen bei transienten `EPERM`/`EACCES` (Windows/OneDrive). |
| 8 | [Style Settings](https://github.com/obsidian-community/obsidian-style-settings) (`obsidian-style-settings`) | 2.572.712 | obsidian-community | Nein | Ja | Voll kompatibel | Aktiv | – Nur statische Analyse | Statische Analyse: alle erkannten API-Zugriffe vollständig emuliert. |
| 9 | [Kanban](https://github.com/obsidian-community/obsidian-kanban) (`obsidian-kanban`) | 2.517.175 | obsidian-community | Nein | Ja | Voll kompatibel | Aktiv | ✅ Ja (echtes Bundle) | Läuft als Datei-Ansicht (TextFileView), nicht als eigener Tab. Laut aktuellem Stand rendern Board/Lanes korrekt; Lane-Titel/Karten-Text hingen zuletzt an einer Preact/MarkdownDomRenderer-Lifecycle-Lücke (`_loaded`/`addChild`-Kette) — als bekannte Einschränkung dokumentiert. |
| 10 | [Iconize](https://github.com/florianwoelki/obsidian-iconize) (`obsidian-icon-folder`) | 2.163.669 | florianwoelki | Nein | Ja | Voll kompatibel | Aktiv | ✅ Ja (echtes Bundle) | `getIcon()` darf für gelistete Icon-IDs nie `null` liefern (Icon-Pack-Scan dereferenziert ungeprüft) — fehlgeschlagene Auflösung fällt auf ein Platzhalter-Icon zurück statt `null`. |
| 11 | [Remotely Save](https://github.com/remotely-save/remotely-save) (`remotely-save`) | 2.131.499 | remotely-save | Nein | Ja | Voll kompatibel | ⚠️ Inaktiv seit 2024 | – Nur statische Analyse | Statische Analyse: alle erkannten API-Zugriffe vollständig emuliert. |
| 12 | [QuickAdd](https://github.com/chhoumann/quickadd) (`quickadd`) | 1.976.743 | chhoumann | Nein | Ja | Voll kompatibel | Aktiv | – Nur statische Analyse | Statische Analyse: alle erkannten API-Zugriffe vollständig emuliert. |
| 13 | [Minimal Theme Settings](https://github.com/kepano/obsidian-minimal-settings) (`obsidian-minimal-settings`) | 1.732.008 | kepano | Nein | Ja | Voll kompatibel | Aktiv | – Nur statische Analyse | Statische Analyse: alle erkannten API-Zugriffe vollständig emuliert. |
| 14 | [Editing Toolbar](https://github.com/pkm-er/obsidian-editing-toolbar) (`editing-toolbar`) | 1.726.740 | pkm-er | Nein | Ja | Voll kompatibel | Aktiv | ✅ Ja (echtes Bundle) | `app.commands`/`app.hotkeyManager.customKeys` müssen echte, iterierbare Objekte sein (Plugin migriert Command-IDs beim Start). `leftRibbon`/`rightRibbon` als Stub mit `hide()`/`show()`/`toggle()`, sonst Crash bei "Workplace Fullscreen". |
| 15 | [Omnisearch](https://github.com/scambier/obsidian-omnisearch) (`omnisearch`) | 1.724.246 | Simon Cambier | Nein | Ja | Voll kompatibel | Aktiv | – Nur statische Analyse | Statische Analyse: alle erkannten API-Zugriffe vollständig emuliert. (Vormals „Teilweise" wegen `isUserIgnored()` — seit 2026-08-12 emuliert.) |
| 16 | [Claudian](https://github.com/yishentu/claudian) (`realclaudian`) | 1.722.530 | Yishen Tu | Ja | Nein (Store blockiert Install-Button) | Nicht unterstützt | Aktiv | – Nur statische Analyse | Desktop-only (`manifest.json`: `isDesktopOnly: true`) — Node.js/Electron-APIs nicht im Browser verfügbar. Installation über den Plugin Store ist blockiert (kein Install-Button). |
| 17 | [Copilot](https://github.com/logancyang/obsidian-copilot) (`copilot`) | 1.657.537 | Logan Yang | Nein | Ja | Voll kompatibel | Aktiv | – Nur statische Analyse | Statische Analyse: alle erkannten API-Zugriffe vollständig emuliert. (Vormals „Teilweise" wegen `getBacklinksForFile` — seit 2026-08-12 emuliert.) |
| 18 | [Importer](https://github.com/obsidianmd/obsidian-importer) (`obsidian-importer`) | 1.513.333 | Obsidian | Nein | Ja | Voll kompatibel | Aktiv | – Nur statische Analyse | Statische Analyse: alle erkannten API-Zugriffe vollständig emuliert. |
| 19 | [Outliner](https://github.com/vslinko/obsidian-outliner) (`obsidian-outliner`) | 1.340.550 | vslinko | Nein | Ja | Voll kompatibel | Aktiv | – Nur statische Analyse | Statische Analyse: alle erkannten API-Zugriffe vollständig emuliert. |
| 20 | [Homepage](https://github.com/mirnovov/obsidian-homepage) (`homepage`) | 1.266.646 | mirnovov | Nein | Ja | Voll kompatibel | Aktiv | – Nur statische Analyse | Statische Analyse: alle erkannten API-Zugriffe vollständig emuliert. (Vormals „Teilweise" wegen `fileManager.createNewFile()` — seit 2026-08-12 emuliert.) |
| 21 | [Recent Files](https://github.com/tgrosinger/recent-files-obsidian) (`recent-files-obsidian`) | 1.149.567 | Tony Grosinger | Nein | Ja | Voll kompatibel | Aktiv | – Nur statische Analyse | Statische Analyse: alle erkannten API-Zugriffe vollständig emuliert. |
| 22 | [Smart Connections](https://github.com/brianpetro/obsidian-smart-connections) (`smart-connections`) | 1.141.681 | 🌴 Brian | Nein | Ja | Teilweise kompatibel | Aktiv | – Nur statische Analyse | `plugins.installPlugin` ist nicht emuliert (bewusst, siehe [Was wird nicht unterstützt](#was-wird-nicht-unterstützt)). (Vormals zusätzlich `requestSaveConfig`/`loadManifests`, `protocolHandlers`, `getActiveFileView()` — seit 2026-08-12 alle emuliert.) |
| 23 | [Tag Wrangler](https://github.com/pjeby/tag-wrangler) (`tag-wrangler`) | 1.025.748 | pjeby | Nein | Ja | Voll kompatibel | Aktiv | – Nur statische Analyse | Statische Analyse: alle erkannten API-Zugriffe vollständig emuliert. |
| 24 | [Linter](https://github.com/platers/obsidian-linter) (`obsidian-linter`) | 1.013.436 | platers | Nein | Ja | Voll kompatibel | Aktiv | – Nur statische Analyse | Statische Analyse: alle erkannten API-Zugriffe vollständig emuliert. |
| 25 | [Admonition](https://github.com/ebullient/obsidian-admonition) (`obsidian-admonition`) | 945.792 | ebullient | Nein | Ja | Teilweise kompatibel | Aktiv | – Nur statische Analyse | `app.plugins.getPluginFolder()` (Dateisystempfad-Auskunft) ist nicht emuliert — Slatebase hat kein lokales Dateisystem für Plugins. (Vormals zusätzlich `iterateCodeMirrors` — seit 2026-08-12 emuliert.) |
| 26 | [BRAT](https://github.com/tfthacker/obsidian42-brat) (`obsidian42-brat`) | 943.538 | tfthacker | Nein | Ja | Teilweise kompatibel | Aktiv | – Nur statische Analyse | `plugins.installPlugin` (Beta-Installation direkt von einem GitHub-Repo, BRATs Kernfunktion) ist bewusst nicht emuliert, siehe [Was wird nicht unterstützt](#was-wird-nicht-unterstützt). (Vormals zusätzlich das programmatische An-/Abschalten anderer Plugins — seit 2026-08-12 emuliert, ändert aber nichts an der Einstufung, da `installPlugin` weiterhin fehlt.) |
| 27 | [TaskNotes](https://github.com/callumalpass/tasknotes) (`tasknotes`) | 939.206 | callumalpass | Nein | Ja | Voll kompatibel | Aktiv | – Nur statische Analyse | Statische Analyse: alle erkannten API-Zugriffe vollständig emuliert. |
| 28 | [Mind Map](https://github.com/lynchjames/obsidian-mind-map) (`obsidian-mind-map`) | 869.529 | lynchjames | Nein | Ja | Voll kompatibel | ⚠️ Kaputt (bestätigt) | – Nur statische Analyse | Statische Analyse: alle erkannten API-Zugriffe vollständig emuliert. |
| 29 | [Day Planner](https://github.com/ivan-lednev/obsidian-day-planner) (`obsidian-day-planner`) | 855.083 | ivan-lednev | Nein | Ja | Voll kompatibel | Aktiv | ✅ Ja (echtes Bundle) | `ItemView.containerEl` hat einen positionellen Zwei-Kind-Vertrag (Header, dann `contentEl`) — Timeline/TimeTracker lesen das per Index, nicht per Selektor. |
| 30 | [Self-hosted LiveSync](https://github.com/vrtmrz/obsidian-livesync) (`obsidian-livesync`) | 851.999 | vrtmrz | Nein | Ja | Voll kompatibel | Aktiv | ✅ Ja (echtes Bundle) | `noticeEl.isShown()` gepatcht, `adapter.mkdir()` ist No-Op (Backend legt Verzeichnisse rekursiv an), Proxy-Timeout 30s kann bei Long-Poll-Sync knapp werden. "Plugin initialisation was cancelled by a module" ist normal bei unkonfiguriertem Plugin. |
| 31 | [make.md](https://github.com/make-md/makemd) (`make-md`) | 851.093 | make-md | Nein | Ja | Teilweise kompatibel | Aktiv | – Nur statische Analyse | `workspace.iterateLeaves()` (Legacy-Alias) ist nicht emuliert — `iterateAllLeaves`/`iterateRootLeaves` nutzen. Legacy-Layout-Change-Hook ist nicht emuliert (`workspace.on("layout-change", …)` als Event nutzen). |
| 32 | [Notebook Navigator](https://github.com/johansan/notebook-navigator) (`notebook-navigator`) | 838.390 | Johan Sanneblad | Nein | Ja | Teilweise kompatibel | Aktiv | – Nur statische Analyse | **Hinweis:** `vault.copy()` ist in Slatebase tatsächlich implementiert; die statische Analyse führt die Methode nur (noch) nicht in ihrer Positivliste, daher fälschlich als „teilweise" markiert. |
| 33 | [Advanced Slides](https://github.com/mszturc/obsidian-advanced-slides) (`obsidian-advanced-slides`) | 833.152 | mszturc | Ja | Nein (Store blockiert Install-Button) | Nicht unterstützt | ⚠️ Inaktiv seit 2024 | – Nur statische Analyse | Desktop-only (`manifest.json`: `isDesktopOnly: true`) — Node.js/Electron-APIs nicht im Browser verfügbar. Installation über den Plugin Store ist blockiert (kein Install-Button). |
| 34 | [Periodic Notes](https://github.com/liamcain/obsidian-periodic-notes) (`periodic-notes`) | 735.568 | Liam Cain | Nein | Ja | Voll kompatibel | ⚠️ Kaputt (bestätigt) | – Nur statische Analyse | Statische Analyse: alle erkannten API-Zugriffe vollständig emuliert. |
| 35 | [Advanced Canvas](https://github.com/developer-mike/obsidian-advanced-canvas) (`advanced-canvas`) | 724.860 | mika-dev | Nein | Ja | Voll kompatibel | Aktiv | – Nur statische Analyse | Statische Analyse: alle erkannten API-Zugriffe vollständig emuliert. (Vormals „Teilweise" wegen `getBacklinksForFile` — seit 2026-08-12 emuliert.) |
| 36 | [Highlightr](https://github.com/chetachiezikeuzor/Highlightr-Plugin) (`highlightr-plugin`) | 696.665 | chetachiezikeuzor | Nein | Ja | Voll kompatibel | ⚠️ Kaputt (bestätigt) | – Nur statische Analyse | Statische Analyse: alle erkannten API-Zugriffe vollständig emuliert. |
| 37 | [PDF++](https://github.com/ryotaushio/obsidian-pdf-plus) (`pdf-plus`) | 679.335 | ryotaushio | Nein | Ja | Teilweise kompatibel | Aktiv | – Nur statische Analyse | `workspace.hoverLinkSources` ist nicht emuliert. `workspace.getGroupLeaves` ist nicht emuliert. `metadataCache.onCleanCache` ist nicht emuliert. (Vormals zusätzlich `getBacklinksForFile` — seit 2026-08-12 emuliert.) |
| 38 | [Local REST API with MCP](https://github.com/coddingtonbear/obsidian-local-rest-api) (`obsidian-local-rest-api`) | 653.801 | Adam Coddington | Ja | Nein (Store blockiert Install-Button) | Nicht unterstützt | Aktiv | – Nur statische Analyse | Desktop-only (`manifest.json`: `isDesktopOnly: true`) — Node.js/Electron-APIs nicht im Browser verfügbar. Installation über den Plugin Store ist blockiert (kein Install-Button). |
| 39 | [Advanced URI](https://github.com/vinzent03/obsidian-advanced-uri) (`obsidian-advanced-uri`) | 629.492 | Vinzent | Nein | Ja | Teilweise kompatibel | Aktiv | – Nur statische Analyse | Update-Check über `app.plugins` ist nicht emuliert (Slatebase hat einen eigenen Update-Mechanismus im Plugin-Store). Update-Status über `app.plugins.updates` ist nicht emuliert. (Vormals zusätzlich das programmatische An-/Abschalten anderer Plugins — seit 2026-08-12 emuliert.) |
| 40 | [Commander](https://github.com/jsmorabito/obsidian-commander) (`cmdr`) | 615.844 | jsmorabito | Nein | Ja | Voll kompatibel | Aktiv | – Nur statische Analyse | Statische Analyse: alle erkannten API-Zugriffe vollständig emuliert. |
| 41 | [Better Word Count](https://github.com/lukeleppan/better-word-count) (`better-word-count`) | 602.051 | lukeleppan | Nein | Ja | Voll kompatibel | ⚠️ Inaktiv seit 2025 | – Nur statische Analyse | Statische Analyse: alle erkannten API-Zugriffe vollständig emuliert. |
| 42 | [Annotator](https://github.com/elias-sundqvist/obsidian-annotator) (`obsidian-annotator`) | 589.345 | elias-sundqvist | Nein | Ja | Voll kompatibel | ⚠️ Inaktiv seit 2024 | – Nur statische Analyse | Statische Analyse: alle erkannten API-Zugriffe vollständig emuliert. |
| 43 | [Markmind](https://github.com/markmindckm/obsidian-markmind) (`obsidian-markmind`) | 584.471 | markmindckm | Nein | Ja | Teilweise kompatibel | Aktiv | – Nur statische Analyse | `app.plugins.getPluginFolder()` (Dateisystempfad-Auskunft) ist nicht emuliert — Slatebase hat kein lokales Dateisystem für Plugins. |
| 44 | [Spaced Repetition](https://github.com/st3v3nmw/obsidian-spaced-repetition) (`obsidian-spaced-repetition`) | 576.380 | st3v3nmw | Nein | Ja | Voll kompatibel | Aktiv | – Nur statische Analyse | Statische Analyse: alle erkannten API-Zugriffe vollständig emuliert. |
| 45 | [Text Generator](https://github.com/nhaouari/obsidian-textgenerator-plugin) (`obsidian-textgenerator-plugin`) | 566.508 | nhaouari | Nein | Ja | Teilweise kompatibel | Aktiv | – Nur statische Analyse | Popout-Fenster existieren in Slatebase nicht (Browser-Tab-System statt Multi-Window). (Vormals zusätzlich das programmatische An-/Abschalten anderer Plugins — seit 2026-08-12 emuliert.) |
| 46 | [Various Complements](https://github.com/tadashi-aikawa/obsidian-various-complements-plugin) (`various-complements`) | 554.458 | tadashi-aikawa | Nein | Ja | Voll kompatibel | Aktiv | – Nur statische Analyse | Statische Analyse: alle erkannten API-Zugriffe vollständig emuliert. |
| 47 | [Hover Editor](https://github.com/nothingislost/obsidian-hover-editor) (`obsidian-hover-editor`) | 545.798 | nothingislost | Nein | Ja | Teilweise kompatibel | Aktiv | – Nur statische Analyse | `workspace.iterateLeaves()` (Legacy-Alias) ist nicht emuliert — `iterateAllLeaves`/`iterateRootLeaves` nutzen. Drag&Drop-Reordering von Leaves ist nicht emuliert (kein Split-/Fenstersystem). |
| 48 | [Pandoc Plugin](https://github.com/oliverbalfour/obsidian-pandoc) (`obsidian-pandoc`) | 542.232 | oliverbalfour | Ja | Nein (Store blockiert Install-Button) | Nicht unterstützt | ⚠️ Inaktiv seit 2024 | – Nur statische Analyse | Desktop-only (`manifest.json`: `isDesktopOnly: true`) — Node.js/Electron-APIs nicht im Browser verfügbar. Installation über den Plugin Store ist blockiert (kein Install-Button). |
| 49 | [Zotero Integration](https://github.com/obsidian-community/obsidian-zotero-integration) (`obsidian-zotero-desktop-connector`) | 532.313 | obsidian-community | Ja | Nein (Store blockiert Install-Button) | Nicht unterstützt | Aktiv | – Nur statische Analyse | Desktop-only (`manifest.json`: `isDesktopOnly: true`) — Node.js/Electron-APIs nicht im Browser verfügbar. Installation über den Plugin Store ist blockiert (kein Install-Button). |
| 50 | [Latex Suite](https://github.com/artisticat1/obsidian-latex-suite) (`obsidian-latex-suite`) | 526.719 | artisticat | Nein | Ja | Voll kompatibel | Aktiv | – Nur statische Analyse | Statische Analyse: alle erkannten API-Zugriffe vollständig emuliert. |
| 51 | [Natural Language Dates](https://github.com/obsidian-community/nldates) (`nldates-obsidian`) | 502.978 | obsidian-community | Nein | Ja | Voll kompatibel | Aktiv | – Nur statische Analyse | Statische Analyse: alle erkannten API-Zugriffe vollständig emuliert. |
| 52 | [Image Converter](https://github.com/xryul/obsidian-image-converter) (`image-converter`) | 494.356 | xryul | Nein | Ja | Voll kompatibel | Aktiv | – Nur statische Analyse | Statische Analyse: alle erkannten API-Zugriffe vollständig emuliert. |
| 53 | [Emoji Toolbar](https://github.com/oliveryh/obsidian-emoji-toolbar) (`obsidian-emoji-toolbar`) | 486.112 | oliveryh | Nein | Ja | Voll kompatibel | Aktiv | – Nur statische Analyse | Statische Analyse: alle erkannten API-Zugriffe vollständig emuliert. |
| 54 | [Paste URL into selection](https://github.com/denolehov/obsidian-url-into-selection) (`url-into-selection`) | 483.459 | denolehov | Nein | Ja | Voll kompatibel | Aktiv | – Nur statische Analyse | Statische Analyse: alle erkannten API-Zugriffe vollständig emuliert. |
| 55 | [Meta Bind](https://github.com/mprojectscode/obsidian-meta-bind-plugin) (`obsidian-meta-bind-plugin`) | 465.616 | Moritz Jung | Nein | Ja | Voll kompatibel | Aktiv | – Nur statische Analyse | Statische Analyse: alle erkannten API-Zugriffe vollständig emuliert. |
| 56 | [Checklist](https://github.com/delashum/obsidian-checklist-plugin) (`obsidian-checklist-plugin`) | 454.727 | delashum | Nein | Ja | Voll kompatibel | ⚠️ Inaktiv seit 2025 | – Nur statische Analyse | Statische Analyse: alle erkannten API-Zugriffe vollständig emuliert. |
| 57 | [Full Calendar](https://github.com/obsidian-community/obsidian-full-calendar) (`obsidian-full-calendar`) | 450.525 | obsidian-community | Nein | Ja | Voll kompatibel | ⚠️ Archiviert | – Nur statische Analyse | Statische Analyse: alle erkannten API-Zugriffe vollständig emuliert. |
| 58 | [Hider](https://github.com/kepano/obsidian-hider) (`obsidian-hider`) | 439.736 | kepano | Nein | Ja | Voll kompatibel | Aktiv | – Nur statische Analyse | Statische Analyse: alle erkannten API-Zugriffe vollständig emuliert. |
| 59 | [Quick Switcher++](https://github.com/darlal/obsidian-switcher-plus) (`darlal-switcher-plus`) | 430.148 | darlal | Nein | Ja | Voll kompatibel | Aktiv | – Nur statische Analyse | Statische Analyse: alle erkannten API-Zugriffe vollständig emuliert. |
| 60 | [Enhancing Export](https://github.com/mokeyish/obsidian-enhancing-export) (`obsidian-enhancing-export`) | 430.092 | mokeyish | Ja | Nein (Store blockiert Install-Button) | Nicht unterstützt | Aktiv | – Nur statische Analyse | Desktop-only (`manifest.json`: `isDesktopOnly: true`) — Node.js/Electron-APIs nicht im Browser verfügbar. Installation über den Plugin Store ist blockiert (kein Install-Button). |
| 61 | [Buttons](https://github.com/shabegom/buttons) (`buttons`) | 429.790 | shabegom | Nein | Ja | Voll kompatibel | Aktiv | – Nur statische Analyse | Statische Analyse: alle erkannten API-Zugriffe vollständig emuliert. |
| 62 | [Thino](https://github.com/quorafind/Obsidian-Thino) (`obsidian-memos`) | 400.549 | Boninall | Nein | Ja | Voll kompatibel | Aktiv | – Nur statische Analyse | Statische Analyse: alle erkannten API-Zugriffe vollständig emuliert. |
| 63 | [Folder notes](https://github.com/lostpaul/obsidian-folder-notes) (`folder-notes`) | 399.920 | lostpaul | Nein | Ja | Teilweise kompatibel | Aktiv | – Nur statische Analyse | Native Lösch-Bestätigungsdialoge von Obsidian (`promptForDeletion`/`promptForFolderDeletion`) sind nicht emuliert. `fileManager.createNewFolder()` ist nicht emuliert (`vault.createFolder()` als Alternative nutzen). (Vormals zusätzlich `workspace.getActiveFileView()` — seit 2026-08-12 emuliert.) |
| 64 | [Terminal](https://github.com/polyipseity/obsidian-terminal) (`terminal`) | 385.706 | polyipseity | Nein | Ja | Voll kompatibel | Aktiv | – Nur statische Analyse | Statische Analyse: alle erkannten API-Zugriffe vollständig emuliert. |
| 65 | [Auto Link Title](https://github.com/zolrath/obsidian-auto-link-title) (`obsidian-auto-link-title`) | 373.758 | zolrath | Nein | Ja | Voll kompatibel | ⚠️ Kaputt (bestätigt) | – Nur statische Analyse | Statische Analyse: alle erkannten API-Zugriffe vollständig emuliert. |
| 66 | [Media Extended](https://github.com/aidenlx/media-extended) (`media-extended`) | 359.796 | Aiden Liu | Ja | Nein (Store blockiert Install-Button) | Nicht unterstützt | Aktiv | – Nur statische Analyse | Desktop-only (`manifest.json`: `isDesktopOnly: true`) — Node.js/Electron-APIs nicht im Browser verfügbar. Installation über den Plugin Store ist blockiert (kein Install-Button). |
| 67 | [Tracker](https://github.com/pyrochlore/obsidian-tracker) (`obsidian-tracker`) | 356.856 | pyrochlore | Nein | Ja | Voll kompatibel | Aktiv | – Nur statische Analyse | Statische Analyse: alle erkannten API-Zugriffe vollständig emuliert. |
| 68 | [Image in Editor](https://github.com/ozntel/oz-image-in-editor-obsidian) (`oz-image-plugin`) | 352.286 | ozntel | Nein | Ja | Voll kompatibel | ⚠️ Inaktiv seit 2024 | – Nur statische Analyse | Statische Analyse: alle erkannten API-Zugriffe vollständig emuliert. |
| 69 | [File Tree Alternative](https://github.com/ozntel/file-tree-alternative) (`file-tree-alternative`) | 344.950 | ozntel | Nein | Ja | Teilweise kompatibel | ⚠️ Inaktiv seit 2024 | – Nur statische Analyse | **Hinweis:** `vault.copy()` ist in Slatebase tatsächlich implementiert; die statische Analyse führt die Methode nur (noch) nicht in ihrer Positivliste, daher fälschlich als „teilweise" markiert. |
| 70 | [Banners](https://github.com/noatpad/obsidian-banners) (`obsidian-banners`) | 342.089 | noatpad | Nein | Ja | Voll kompatibel | ⚠️ Inaktiv seit 2024 | – Nur statische Analyse | Statische Analyse: alle erkannten API-Zugriffe vollständig emuliert. |
| 71 | [Note Refactor](https://github.com/lynchjames/note-refactor-obsidian) (`note-refactor-obsidian`) | 338.702 | lynchjames | Nein | Ja | Voll kompatibel | ⚠️ Inaktiv seit 2024 | – Nur statische Analyse | Statische Analyse: alle erkannten API-Zugriffe vollständig emuliert. |
| 72 | [Easy Typing](https://github.com/yaozhuwa/easy-typing-obsidian) (`easy-typing-obsidian`) | 332.716 | yaozhuwa | Nein | Ja | Voll kompatibel | Aktiv | – Nur statische Analyse | Statische Analyse: alle erkannten API-Zugriffe vollständig emuliert. |
| 73 | [ExcaliBrain](https://github.com/zsviczian/excalibrain) (`excalibrain`) | 329.887 | zsviczian | Nein | Ja | Teilweise kompatibel | Aktiv | – Nur statische Analyse | `metadataCache.inProgressTaskCount` (Indexierungs-Fortschritt) ist nicht emuliert — Slatebase indiziert synchron on-demand. (Vormals zusätzlich das programmatische An-/Abschalten anderer Plugins — seit 2026-08-12 emuliert.) |
| 74 | [Mermaid Tools](https://github.com/dartungar/obsidian-mermaid) (`mermaid-tools`) | 323.493 | Daniel Nikolaev | Nein | Ja | Voll kompatibel | Aktiv | – Nur statische Analyse | Statische Analyse: alle erkannten API-Zugriffe vollständig emuliert. |
| 75 | [Fantasy Statblocks](https://github.com/obsidian-ttrpg-community/fantasy-statblocks) (`obsidian-5e-statblocks`) | 319.139 | obsidian-ttrpg-community | Nein | Ja | Voll kompatibel | Aktiv | – Nur statische Analyse | Statische Analyse: alle erkannten API-Zugriffe vollständig emuliert. |
| 76 | [Quiet Outline](https://github.com/guopenghui/obsidian-quiet-outline) (`obsidian-quiet-outline`) | 316.867 | guopenghui | Nein | Ja | Teilweise kompatibel | Aktiv | – Nur statische Analyse | Automatisches Umschreiben interner Links (`updateInternalLinks`) ist nicht emuliert. `fileManager.iterateAllRefs()` (Referenz-Iteration über den ganzen Vault) ist nicht emuliert. (Vormals zusätzlich `workspace.getActiveFileView()` — seit 2026-08-12 emuliert.) |
| 77 | [Text Extractor](https://github.com/scambier/obsidian-text-extractor) (`text-extractor`) | 316.782 | Simon Cambier | Nein | Ja | Voll kompatibel | Aktiv | – Nur statische Analyse | Statische Analyse: alle erkannten API-Zugriffe vollständig emuliert. |
| 78 | [Charts](https://github.com/phibr0/obsidian-charts) (`obsidian-charts`) | 316.216 | phibr0 | Nein | Ja | Voll kompatibel | ⚠️ Inaktiv seit 2024 | – Nur statische Analyse | Statische Analyse: alle erkannten API-Zugriffe vollständig emuliert. |
| 79 | [Reminder](https://github.com/uphy/obsidian-reminder) (`obsidian-reminder-plugin`) | 313.898 | uphy | Nein | Ja | Voll kompatibel | Aktiv | – Nur statische Analyse | Statische Analyse: alle erkannten API-Zugriffe vollständig emuliert. |
| 80 | [Datacore](https://github.com/blacksmithgu/datacore) (`datacore`) | 311.856 | blacksmithgu | Nein | Ja | Voll kompatibel | Aktiv | – Nur statische Analyse | Statische Analyse: alle erkannten API-Zugriffe vollständig emuliert. |
| 81 | [Better Export PDF](https://github.com/l1xnan/obsidian-better-export-pdf) (`better-export-pdf`) | 308.989 | l1xnan | Ja | Nein (Store blockiert Install-Button) | Nicht unterstützt | Aktiv | – Nur statische Analyse | Desktop-only (`manifest.json`: `isDesktopOnly: true`) — Node.js/Electron-APIs nicht im Browser verfügbar. Installation über den Plugin Store ist blockiert (kein Install-Button). |
| 82 | [Metadata Menu](https://github.com/mdelobelle/metadatamenu) (`metadata-menu`) | 306.291 | mdelobelle | Nein | Ja | Teilweise kompatibel | Aktiv | – Nur statische Analyse | `metadataCache.inProgressTaskCount` (Indexierungs-Fortschritt) ist nicht emuliert — Slatebase indiziert synchron on-demand. |
| 83 | [Leaflet](https://github.com/javalent/obsidian-leaflet) (`obsidian-leaflet-plugin`) | 301.953 | javalent | Nein | Ja | Voll kompatibel | ⚠️ Inaktiv seit 2025 | – Nur statische Analyse | Statische Analyse: alle erkannten API-Zugriffe vollständig emuliert. |
| 84 | [Note Toolbar](https://github.com/chrisgurney/obsidian-note-toolbar) (`note-toolbar`) | 300.668 | chrisgurney | Nein | Ja | Teilweise kompatibel | Aktiv | – Nur statische Analyse | `vault.setConfig()` (Schreibzugriff auf Obsidians App-Settings, z.B. `readableLineLength`) ist nicht emuliert — nur lesend über `getConfig()`. |
| 85 | [LanguageTool Integration](https://github.com/clemens-e/obsidian-languagetool-plugin) (`obsidian-languagetool-plugin`) | 298.983 | clemens-e | Nein | Ja | Teilweise kompatibel | Aktiv | – Nur statische Analyse | `vault.setConfig()` (Schreibzugriff auf Obsidians App-Settings, z.B. `readableLineLength`) ist nicht emuliert — nur lesend über `getConfig()`. |
| 86 | [File Explorer Note Count](https://github.com/ozntel/file-explorer-note-count) (`file-explorer-note-count`) | 285.506 | ozntel | Nein | Ja | Voll kompatibel | Aktiv | – Nur statische Analyse | Statische Analyse: alle erkannten API-Zugriffe vollständig emuliert. |
| 87 | [Dice Roller](https://github.com/obsidian-ttrpg-community/dice-roller) (`obsidian-dice-roller`) | 277.103 | obsidian-ttrpg-community | Nein | Ja | Voll kompatibel | ⚠️ Inaktiv seit 2025 | – Nur statische Analyse | Statische Analyse: alle erkannten API-Zugriffe vollständig emuliert. |
| 88 | [Breadcrumbs](https://github.com/michaelpporter/breadcrumbs) (`breadcrumbs`) | 275.522 | Michael Porter | Nein | Ja | Teilweise kompatibel | Aktiv | – Nur statische Analyse | Obsidians natives Link-Kontextmenü-Hook ist nicht emuliert. `metadataCache.initialized`-Flag ist nicht emuliert. |
| 89 | [Colored Text](https://github.com/erincayaz/obsidian-colored-text) (`colored-text`) | 269.404 | erincayaz | Nein | Ja | Voll kompatibel | Aktiv | – Nur statische Analyse | Statische Analyse: alle erkannten API-Zugriffe vollständig emuliert. |
| 90 | [Custom Frames](https://github.com/ellpeck/ObsidianCustomFrames) (`obsidian-custom-frames`) | 253.639 | Ell | Nein | Ja | Voll kompatibel | Aktiv | – Nur statische Analyse | Statische Analyse: alle erkannten API-Zugriffe vollständig emuliert. |
| 91 | [Pretty Properties](https://github.com/anareaty/pretty-properties) (`pretty-properties`) | 252.458 | Reaty | Nein | Ja | Voll kompatibel | Aktiv | – Nur statische Analyse | Statische Analyse: alle erkannten API-Zugriffe vollständig emuliert. |
| 92 | [TagFolder](https://github.com/vrtmrz/obsidian-tagfolder) (`obsidian-tagfolder`) | 244.245 | vrtmrz | Nein | Ja | Teilweise kompatibel | Aktiv | – Nur statische Analyse | `fileManager.createAndOpenMarkdownFile()` ist nicht emuliert (`createNewMarkdownFile` + manuelles Öffnen als Alternative). |
| 93 | [Readwise Official](https://github.com/readwiseio/obsidian-readwise) (`readwise-official`) | 239.728 | readwiseio | Nein | Ja | Voll kompatibel | Aktiv | – Nur statische Analyse | Statische Analyse: alle erkannten API-Zugriffe vollständig emuliert. |
| 94 | [cMenu](https://github.com/chetachiezikeuzor/cMenu-Plugin) (`cmenu-plugin`) | 235.117 | chetachiezikeuzor | Ja | Nein (Store blockiert Install-Button) | Nicht unterstützt | ⚠️ Inaktiv seit 2022 | – Nur statische Analyse | Desktop-only (`manifest.json`: `isDesktopOnly: true`) — Node.js/Electron-APIs nicht im Browser verfügbar. Installation über den Plugin Store ist blockiert (kein Install-Button). |
| 95 | [Enhancing Mindmap](https://github.com/markmindckm/obsidian-enhancing-mindmap) (`obsidian-enhancing-mindmap`) | 233.704 | markmindckm | Nein | Ja | Voll kompatibel | Aktiv | – Nur statische Analyse | Statische Analyse: alle erkannten API-Zugriffe vollständig emuliert. |
| 96 | [Citations](https://github.com/hans/obsidian-citation-plugin) (`obsidian-citation-plugin`) | 231.512 | hans | Ja | Nein (Store blockiert Install-Button) | Nicht unterstützt | ⚠️ Inaktiv seit 2024 | – Nur statische Analyse | Desktop-only (`manifest.json`: `isDesktopOnly: true`) — Node.js/Electron-APIs nicht im Browser verfügbar. Installation über den Plugin Store ist blockiert (kein Install-Button). |
| 97 | [Code Styler](https://github.com/mayurankv/Obsidian-Code-Styler) (`code-styler`) | 226.388 | mayurankv | Nein | Ja | Voll kompatibel | ⚠️ Inaktiv seit 2025 | – Nur statische Analyse | Statische Analyse: alle erkannten API-Zugriffe vollständig emuliert. |
| 98 | [Book Search](https://github.com/anpigon/obsidian-book-search-plugin) (`obsidian-book-search-plugin`) | 225.723 | anpigon | Nein | Ja | Voll kompatibel | ⚠️ Inaktiv seit 2024 | – Nur statische Analyse | Statische Analyse: alle erkannten API-Zugriffe vollständig emuliert. |
| 99 | [Agent Client](https://github.com/rait-09/obsidian-agent-client) (`agent-client`) | 224.225 | rait-09 | Ja | Nein (Store blockiert Install-Button) | Nicht unterstützt | Aktiv | – Nur statische Analyse | Desktop-only (`manifest.json`: `isDesktopOnly: true`) — Node.js/Electron-APIs nicht im Browser verfügbar. Installation über den Plugin Store ist blockiert (kein Install-Button). |
| 100 | [Dictionary](https://github.com/phibr0/obsidian-dictionary) (`obsidian-dictionary-plugin`) | 223.158 | phibr0 | Nein | Ja | Voll kompatibel | ⚠️ Verwaist | – Nur statische Analyse | Statische Analyse: alle erkannten API-Zugriffe vollständig emuliert. |

---

## Wartungsstatus der Top-100-Plugins (Upstream-Pflege)

**Datum:** 2026-08-15
**Warum das eine eigene Achse ist:** Die Kompatibilitäts-Klassifizierung oben (voll/teilweise/nicht unterstützt) prüft nur, ob Slatebase die vom Plugin genutzten API-Aufrufe emuliert. Sie sagt nichts darüber aus, ob das Plugin *upstream*, also unter echtem, aktuellem Obsidian, überhaupt noch fehlerfrei läuft. Ein als „Voll kompatibel" eingestuftes Plugin ist wertlos, wenn es bereits im echten Obsidian kaputt ist — Slatebase kann ein upstream-defektes Plugin nicht heil emulieren.

**Methodik:** Für alle 100 Repos wurde per GitHub-API (`archived`, `pushed_at`) der letzte Commit-Zeitpunkt geprüft (Stichtag 2026-08-15). Als **auffällig** gilt: `archived: true`, ein umbenanntes/verwaistes Repo, oder kein Push seit mehr als ~12 Monaten (vor 2025-08). Für jeden auffälligen Treffer wurde zusätzlich in den Issues nach expliziten „funktioniert nicht mehr"/Versions-Beschwerden gesucht. Plugins mit Aktivität in den letzten Monaten wurden nicht weiter untersucht.

**Wichtiger Vorbehalt:** Inaktivität ist ein Risikosignal, kein Beweis für Bruch. Von den 24 auffälligen Repos liegt nur bei 4 ein konkretes GitHub-Issue vor, das eine tatsächliche Fehlfunktion unter aktuellem Obsidian bestätigt. Bei den übrigen 20 wurde keine Bruchmeldung gefunden — sie könnten weiterhin fehlerfrei laufen, tragen aber ohne aktiven Maintainer ein erhöhtes Risiko, bei der nächsten Obsidian-Version stillschweigend zu brechen.

### Bestätigt kaputt unter aktuellem Obsidian (4)

| # | Plugin | Repo | Befund |
|---:|---|---|---|
| 36 | Highlightr | [chetachiezikeuzor/Highlightr-Plugin](https://github.com/chetachiezikeuzor/Highlightr-Plugin) | Letzter Push 2023-11-15 (~2,75 Jahre). Issue #112 (08/2026): Settings-Tab (Farbwähler/Save-Button) rendert nicht unter **Obsidian 1.13.x**. Seit #91 (2024) offene Maintainer-Suche. |
| 34 | Periodic Notes | [liamcain/obsidian-periodic-notes](https://github.com/liamcain/obsidian-periodic-notes) | Letzter Push 2024-08-23 (~2 Jahre). Issue #249 (02/2025): „Obsidian Community Plugin Version Too Old". |
| 65 | Auto Link Title | [zolrath/obsidian-auto-link-title](https://github.com/zolrath/obsidian-auto-link-title) | Letzter Push 2024-12-15 (~20 Monate). Issue #163 (09/2025): „Not working with the latest Obsidian version". Zusätzlich #177 (08/2026): Sicherheitsproblem (Malvertising im versteckten Browser-Fenster) — unabhängig vom Kompatibilitätsthema, aber ein weiterer Grund zur Vorsicht. |
| 28 | Mind Map | [lynchjames/obsidian-mind-map](https://github.com/lynchjames/obsidian-mind-map) | Letzter Push 2024-02-25 (~2,5 Jahre). #117 (04/2025): „Doesn't work in latest version"; #119 (09/2025): „Obsidian update." |

### Formal aufgegeben (2)

| # | Plugin | Repo | Status |
|---:|---|---|---|
| 57 | Full Calendar | [obsidian-community/obsidian-full-calendar](https://github.com/obsidian-community/obsidian-full-calendar) | **Repo archiviert** (GitHub `archived: true`), letzter Push 2024-11-08. Keine Fixes mehr möglich, unabhängig vom aktuellen Fehlerstatus. |
| 100 | Dictionary | [phibr0/obsidian-dictionary](https://github.com/phibr0/obsidian-dictionary) | Repo umbenannt/verwaist, letzter Push ~2024-02 (~2,5 Jahre). Keine versionsspezifische Bruchmeldung gefunden. |

### Über 12 Monate inaktiv, keine bestätigte Bruchmeldung (18)

| # | Plugin | Repo | Letzter Push |
|---:|---|---|---|
| 6 | Calendar | liamcain/obsidian-calendar-plugin | 2024-06-22 (~2 Jahre) |
| 11 | Remotely Save | remotely-save/remotely-save | 2024-11-10 (~21 Monate) |
| 33 | Advanced Slides | mszturc/obsidian-advanced-slides | 2024-06-29 (~2 Jahre) |
| 41 | Better Word Count | lukeleppan/better-word-count | 2025-06-20 (~14 Monate) |
| 42 | Annotator | elias-sundqvist/obsidian-annotator | 2024-01-08 (~2,5 Jahre) |
| 48 | Pandoc Plugin | oliverbalfour/obsidian-pandoc | 2024-05-15 (~2,25 Jahre) |
| 56 | Checklist | delashum/obsidian-checklist-plugin | 2025-01-11 (~19 Monate) |
| 68 | Image in Editor | ozntel/oz-image-in-editor-obsidian | 2024-02-10 (~2,5 Jahre) |
| 69 | File Tree Alternative | ozntel/file-tree-alternative | 2024-06-22 (~2 Jahre) |
| 70 | Banners | noatpad/obsidian-banners | 2024-01-18 (~2,5 Jahre) |
| 71 | Note Refactor | lynchjames/note-refactor-obsidian | 2024-01-22 (~2,5 Jahre) |
| 78 | Charts | phibr0/obsidian-charts | 2024-06-19 (~2 Jahre) |
| 83 | Leaflet | javalent/obsidian-leaflet | 2025-07-09 (~13 Monate) |
| 87 | Dice Roller | obsidian-ttrpg-community/dice-roller | 2025-03-24 (~17 Monate) |
| 94 | cMenu | chetachiezikeuzor/cMenu-Plugin | 2022-09-05 (~4 Jahre, älteste im gesamten Set) |
| 96 | Citations | hans/obsidian-citation-plugin | 2024-06-13 (~2 Jahre) |
| 97 | Code Styler | mayurankv/Obsidian-Code-Styler | 2025-02-16 (~18 Monate) |
| 98 | Book Search | anpigon/obsidian-book-search-plugin | 2024-10-16 (~22 Monate); Issues nur zu API-Rate-Limits, nicht versionsbezogen |

**Zusammenfassung:** 24 von 100 auffällig (1 archiviert, 1 verwaist/umbenannt, 22 mit ≥12 Monaten ohne Commit), davon 4 mit bestätigter Fehlfunktion unter aktuellem Obsidian. Die übrigen 76 zeigen Aktivität innerhalb der letzten Monate. Diese Liste ist unabhängig vom in der Zusammenfassung dokumentierten Befund zur veralteten emulierten API-Version (1.8.7 vs. real 1.13.7) — beide Lücken sollten separat behoben bzw. in der Plugin-Store-UI als Warnhinweis sichtbar gemacht werden, bevor Nutzer eines der 24 Plugins installieren.

---

*Dieses Dokument wurde aus dem aktuellen Stand der Compat-Schicht (`frontend/src/plugins/compat/compatibility-analyzer.ts`), den Projekt-Steering-Docs (`.kiro/steering/product.md`, `.kiro/steering/lessons-learned.md`) und einer automatisierten Analyse der 100 meistheruntergeladenen Community-Plugins erzeugt. Bei Abweichungen zwischen diesem Dokument und dem tatsächlichen Verhalten der App gilt der Code als Quelle der Wahrheit.*
