# Slatebase — Lessons Learned & Konventionen

Erkenntnisse aus der bisherigen Entwicklung, die in zukünftigen Sessions beachtet werden sollten.

## Architektur-Entscheidungen

### Auth: Opake Tokens statt JWT
- Serverseitige Invalidierung sofort wirksam (kein Token-Refresh, kein Warten auf Expiry)
- Session-Daten als einzelne JSON-Dateien pro Session (`data/sessions/<sessionId>.json`)
- In-Memory-Index (`Map<token, sessionId>`) für schnelle Lookups, Filesystem als Source of Truth
- Token-Format: 64 Bytes hex-encoded (128 Zeichen) via `crypto.randomBytes`

### Auth: argon2id für Passwort-Hashing
- Modernerer Algorithmus als bcrypt, memory-hard, OWASP-empfohlen
- Timing-Attack-Schutz eingebaut (konstante Vergleichszeit)
- Parameter: memoryCost 64 MB, timeCost 3, parallelism 4
- Library: `argon2` (npm) — Node.js-Bindings für Referenz-Implementierung

### Auth: Middleware-Chain statt Controller-Logik
- Auth-Prüfung als Hono-Middleware (`createAuthMiddleware`)
- CSRF-Prüfung als separate Middleware (`createCsrfMiddleware`)
- Rate-Limiting als separate Middleware (`createRateLimitMiddleware`)
- Saubere Trennung: Controller kennt nur authentifizierte Requests

### Interface-First Design zahlt sich aus
- Jede Schicht exponiert ein `I*`-Interface (`IVaultReader`, `IVaultService`, `ILogger`, etc.)
- Das ermöglicht einfaches Mocking in Tests ohne externe Mocking-Libraries
- Neue Implementierungen können eingesetzt werden, ohne abhängigen Code zu ändern
- **Regel:** Immer zuerst das Interface definieren, dann implementieren

### Manuelle DI statt Container
- Alle Dependencies werden explizit im Composition Root (`src/index.ts`) verdrahtet
- Das hält den Dependency-Graph transparent und nachvollziehbar
- **Kein** DI-Framework einführen — die manuelle Verdrahtung ist bewusst gewählt

### Separate Reducer für separate Concerns
- `appReducer` für globalen App-State (Vaults, Tree, Loading)
- `tabReducer` für Tab-spezifischen State (offene Tabs, Modi, Edit-Buffer)
- `authReducer` für Auth-State (Token, User, mustChangePassword, isLoading, error)
- `chatReducer` für Chat-State (Konversationen, Nachrichten, Unread)
- `syncReducer` für Sync-State (Config, Log, Konflikte, Analyse)
- **Nicht** alles in einen Mega-Reducer packen — lieber neue Provider/Reducer für neue Feature-Bereiche

### Filesystem statt Datenbank — bewusste Entscheidung
- **Warum kein DB-Wechsel zum jetzigen Zeitpunkt:**
  - Architektur-Konsistenz mit Obsidian (Plain Files = 1:1 Kompatibilität)
  - Deployment-Einfachheit für Self-Hoster (kein DB-Setup, kein Connection-Pooling, kein Schema-Migration-Tooling)
  - Datenvolumen ist überschaubar (typische Vaults: hunderte bis wenige tausend Dateien)
  - Atomare Schreiboperationen (temp → rename) geben Crash-Safety ohne WAL
  - Marketing-Argument: "Keine Datenbank, keine Magie"
- **Wann eine DB sinnvoll würde:** Volltextsuche über alle Vaults bei vielen gleichzeitigen Nutzern, hunderte gleichzeitige Nutzer (File-Locking wird Bottleneck), Audit-Log-Abfragen mit komplexen Filtern, Echtzeit-Collaboration (CRDT/OT)
- **Interface-Abstraktion hält die Tür offen:** Durch `I*`-Interfaces kann jederzeit eine DB-Implementierung dahinter geschoben werden, ohne Business-Logik anzufassen
- **Regel:** Keine DB-Migration ohne konkreten, messbaren Performance-Engpass

### SQLite als ergänzender Index (nicht als Ersatz)
- **Anwendungsfall:** Knowledge Graph Link-Index, optional Volltextsuche (FTS5), Metadaten-Cache (Tags, Wortanzahl)
- **Warum SQLite statt CouchDB:**
  - Embedded — keine separate Instanz, kein Container, kein Netzwerk-Overhead
  - Self-Hoster-Aufwand: Null (eine Datei im Data-Verzeichnis)
  - Recursive CTEs für Graph-Traversierung (Pfade, Backlinks mit Tiefenbegrenzung)
  - ~2 MB Library vs. ~200 MB CouchDB-Container
  - Backup = eine Datei kopieren
- **CouchDB bleibt externer Sync-Partner** — nicht als interner Datenspeicher verwenden (würde Deployment-Komplexität verdoppeln und "keine DB"-Versprechen brechen)
- **Speicherort:** `data/vaults/<vaultId>/_index.sqlite` — pro Vault, jederzeit aus Markdown-Dateien regenerierbar
- **Library:** `better-sqlite3` (synchron, schnell, kein Connection-Pool nötig)
- **Zeitpunkt:** Erst einführen wenn In-Memory-Index (JSON-persistiert) nicht mehr ausreicht — voraussichtlich bei Vaults mit 10.000+ Dateien oder wenn Graph-Queries >2–3s dauern
- **Regel:** SQLite ist ein abgeleiteter Index, NICHT die Source of Truth. Geht die Datei verloren → beim nächsten Start aus Vault-Dateien regenerieren

## Code-Konventionen

### Imports
- **Backend:** Immer `.js`-Extension bei relativen Imports (`import { X } from './module/index.js'`)
- **Frontend:** Keine Extension (Vite/Bundler löst auf)
- **Barrel-Exports:** Jedes Modul hat ein `index.ts` das alle öffentlichen Typen und Implementierungen exportiert
- **Keine Default-Exports** — immer Named Exports verwenden

### Naming
- Interfaces: `I`-Prefix (`IVaultReader`, `IApiClient`)
- Error-Klassen: `Error`-Suffix (`VaultNotFoundError`, `PathTraversalError`)
- Factory-Funktionen: `create`-Prefix (`createLogger()`, `createRouter()`)
- Mock-Factories in Tests: `createMock`-Prefix (`createMockLogger()`, `createMockVaultManager()`)
- Action-Types: `SCREAMING_SNAKE_CASE` (`'VAULTS_LOADED'`, `'LOADING_STARTED'`)

### Sprache
- **UI-Labels:** Deutsch (z.B. "Laden…", "Fehler", "Tresor erstellen")
- **Requirements & Specs:** Deutsch
- **Code, Kommentare, Identifier:** Englisch
- **JSDoc:** Englisch, auf allen öffentlichen Methoden

## Error Handling

### Backend: Domain-Errors → HTTP-Mapping
- Jede Schicht definiert eigene Error-Klassen mit sprechenden Namen
- Der Controller mappt via `instanceof`-Checks auf HTTP-Status-Codes
- **Niemals** HTTP-Concerns in Business- oder Vault-Layer leaken lassen
- API-Error-Format: `{ code: string, message: string, timestamp: string }`

### Frontend: Strukturierte Fehler
- API-Client wirft `{ code, message }`-Objekte (kein `new Error()`)
- `toAppError()` normalisiert unbekannte Fehler zu `AppError`
- Action Creators fangen Fehler und dispatchen `ERROR_OCCURRED`

### Graceful Degradation
- Beim Startup: Fehler loggen und überspringen statt crashen
- Fehlende Config-Datei → Zod-Defaults greifen
- Unlesbare Vault → als "error"-Status markieren, andere Vaults laden

## Testing

### Mocking-Strategie
- **Keine externe Mocking-Library** für Backend-Dependencies
- Hand-geschriebene Mock-Factories die das `I*`-Interface implementieren
- Mocks haben Tracking-Properties (`addedVaults: []`, `removedIds: []`, `shouldFailOnAdd: boolean`)
- Frontend nutzt `vi.fn()` für API-Client-Methoden

### Test-Struktur
- Co-located: `*.test.ts` neben der Source-Datei
- `describe`-Blöcke pro Methode/Feature
- `it`-Blöcke pro Verhalten (Success + Error-Pfade testen)
- Reducer-Tests: Pure State-Transitions ohne Mocking
- Action-Creator-Tests: Dispatch-Sequenz verifizieren

### Integration Tests
- Echtes Filesystem mit Temp-Directories
- Cleanup in `afterAll` (nicht `afterEach` — Performance)
- Separate Datei: `integration.test.ts`

### Property-Based Tests (PBT) — Entfernt (Entscheidung Juni 2026)
- PBT-Tests wurden aus dem Projekt entfernt (chat + plugin-compat Specs)
- **Grund:** Unverhältnismäßiger Aufwand für den Mehrwert in diesem Projektkontext
  - PBT-Tests sind rechenintensiv (viele Iterationen, große Eingaben) und verlangsamen den Entwicklungszyklus
  - Die Implementierungen haben bereits co-located Unit Tests die alle Requirements abdecken
  - fast-check-basierte Tests waren oft redundant zu den handgeschriebenen Unit Tests
  - Der Wartungsaufwand für PBT-Tests bei API-Änderungen ist hoch
- **Gelöschte Dateien:**
  - `backend/src/chat/chat.pbt.test.ts` (Properties 1–8: Session, Message, Access Control)
  - `backend/src/chat/chat-validation.pbt.test.ts` (Properties 9–16: Filtering, Rate Limiter, Validation)
  - Alle PBT-Tasks aus `obsidian-plugin-compat` tasks.md (18 Tasks entfernt)
- **Was bleibt:** Reguläre Unit Tests (`*.test.ts`) und Integration Tests decken alle Anforderungen ab
- **Regel:** Keine neuen PBT-Tests schreiben. Stattdessen gründliche Unit Tests mit Edge Cases.
- **Ausnahme:** Falls ein Bug auftritt der nur durch randomisierte Eingaben reproduzierbar ist, kann ein gezielter PBT-Test geschrieben werden

## Filesystem & Persistenz

### Atomare Schreiboperationen
- Pattern: In Temp-Datei schreiben → `rename()` zum Ziel
- Verhindert korrupte Dateien bei Crashes
- Angewendet bei: `vaults.json`, File-Saves, `users/<userId>.json`, `users/_index.json`, `sessions/<sessionId>.json`, `shares.json`
- Temp-Datei-Naming: `<target>.${crypto.randomBytes(8).toString('hex')}.tmp`

### Path Traversal Protection
- `validateFilePath()` prüft: URL-Decode → Normalize → Reject absolute → Resolve → Prefix-Check
- Null-Bytes werden explizit abgelehnt
- **Immer** `validateFilePath()` verwenden bevor auf Vault-Dateien zugegriffen wird

### Binary Detection
- Erste 8 KB nach Null-Bytes scannen
- Binary-Dateien: `content: ""`, `isBinary: true`
- Frontend zeigt BinaryViewer (Bild-Preview oder "nicht darstellbar"-Hinweis)

## Frontend State

### Action Creators sind keine Hooks
- Standalone async Funktionen: `loadVaults(dispatch, apiClient)`
- Nehmen `dispatch` und `apiClient` als Parameter
- Pattern: `dispatch(LOADING_STARTED)` → API-Call → `dispatch(SUCCESS | ERROR_OCCURRED)`
- **Nicht** als Custom Hooks implementieren — das erschwert Testing

### Context-Provider Hierarchie
- `AuthProvider` → Auth-State (Token, User, mustChangePassword) — äußerster Wrapper
- `AppProvider` → globaler State (Vaults, Tree) — nur wenn authentifiziert
- `TabProvider` → Tab-State (innerhalb Content-Area)
- Custom Hooks (`useAuthContext()`, `useAppContext()`, `useTabContext()`) werfen Error außerhalb des Providers

## API Design

### Konsistente Patterns
- Alle Routes unter `/api/v1/` (Versionierung von Anfang an)
- Path-Parameter für Resource-IDs: `/vaults/:vaultId`
- Query-Parameter für Datei-Pfade: `?path=...` (URL-encoded)
- FormData für File-Uploads, JSON für alles andere
- `201` für Create-Operationen, `204` für Delete, `200` für Reads

### CORS
- Explizite `allowedOrigins` aus Config (nicht `*`)
- Nur benötigte Methods erlaubt

## Frontend Styling

### Design-Token-System (CSS Custom Properties)
- `index.css` definiert alle Design Tokens als CSS Custom Properties in `:root`
- Kategorien: Farben (bg, text, border, accent, danger, success, warning), Schatten, Radien, Transitions, Fonts
- Dark Mode: Kompletter Override aller Tokens in `@media (prefers-color-scheme: dark)` Block
- `App.css` verwendet ausschließlich `var(--token-name)` — keine hartcodierten Farbwerte mehr
- **Regel:** Neue Farben immer als Token in `index.css` definieren, nie direkt in Komponenten-CSS

### Sidebar mit dunklem Theme
- Sidebar hat eigene Token-Gruppe: `--sidebar-bg`, `--sidebar-text`, `--sidebar-text-active`, `--sidebar-hover`, `--sidebar-active`, `--sidebar-border`
- Dunkler Hintergrund (`#1e1b4b` light / `#0d0b1e` dark) für visuellen Kontrast zum Content-Bereich
- Sidebar-Elemente (VaultList, FileExplorer, Toolbar) nutzen Sidebar-Tokens statt globaler Tokens

### 3-Spalten-Layout mit Resize
- Layout: Sidebar | Toolbar | Content | (optional) Right Panel
- Resize-Handles zwischen Panels: 4px breit, `cursor: col-resize`, Akzent-Farbe bei Hover
- `useResize(initialWidth, min, max, side)` Hook für Maus-Drag-Resize
- Panels haben `min-width` und `max-width` Constraints
- Right Panel ist optional (Toggle-Button unten rechts)

### Inter Font via Google Fonts
- Eingebunden in `index.html` mit `preconnect` für Performance
- `--font-sans: 'Inter', system-ui, -apple-system, sans-serif` als Fallback-Chain
- `--font-mono: ui-monospace, 'Cascadia Code', 'Fira Code', Consolas, monospace` für Code

### Lucide React Icons
- `lucide-react` (pinned: 0.511.0) für alle Icons im Frontend
- Konsistente Größen: 12px (Buttons), 13-14px (Menü-Items), 15px (Toolbar), 18px (Feature-Icons)
- Icons als React-Komponenten: `<Upload size={14} />`, `<Trash2 size={12} />`
- Ersetzt alle Unicode-Zeichen (▼, ▶, ×, ✏️, 👁️) durch Lucide-Äquivalente

### Custom Checkboxen (Task Lists)
- Browser-Default-Checkboxen mit `appearance: none` + `disabled` werden in manchen Browsern unsichtbar
- **Immer** `opacity: 1` explizit auf `:disabled` setzen wenn `appearance: none` verwendet wird
- Custom Checkbox-Pattern: `appearance: none` → eigene `width/height/border/border-radius/background` → `:checked` mit Accent-Farbe → `::after` Pseudo-Element als Häkchen
- Checked-Items: `text-decoration: line-through` + `color: var(--text-muted)` für visuelle Unterscheidung (wie Obsidian)
- Task-Listen brauchen eine eigene Klasse auf dem Parent-`<ul>` (`view-mode-task-list`) mit `list-style: none` und reduziertem Padding — nur `list-style: none` auf dem `<li>` reicht nicht (Bullet-Platz bleibt)
- Content nach der Checkbox in einen `<span>`-Wrapper packen damit `line-through` nur den Text betrifft, nicht die Checkbox

## Häufige Stolperfallen

1. **`.js`-Extension vergessen** bei Backend-Imports → Runtime-Error unter Node.js ESM
2. **`noUncheckedIndexedAccess`** ist aktiv → Array/Object-Zugriffe brauchen Null-Checks
3. **`exactOptionalPropertyTypes`** ist aktiv → `undefined` muss explizit zugewiesen werden bei optionalen Properties
4. **Top-Level `await`** im Composition Root → funktioniert nur mit ESM
5. **Vite Proxy** leitet `/api` an `localhost:3000` weiter → Backend muss laufen für Frontend-Dev
6. **React.createElement** statt JSX in State/Context-Dateien (kein JSX-Transform dort)
7. **Vault-IDs** sind SHA-256-Hashes (erste 12 Hex-Zeichen) des normalisierten Pfads — deterministisch, nicht zufällig
8. **Singleton ApiClient** — `TabContent` und andere Komponenten müssen den shared `apiClient` aus `AppContext` nutzen, NICHT `new ApiClient()` erstellen (sonst fehlt der Token → 401 bei Speichern)
9. **`vite.config.ts` Build** — `defineConfig` muss aus `vitest/config` importiert werden (nicht aus `vite`), damit der `test`-Block erkannt wird
10. **Test-Dateien im Build** — `tsconfig.app.json` muss `"exclude": ["src/**/*.test.ts", "src/**/*.test.tsx"]` haben, sonst blockieren Test-Typ-Fehler den Production-Build
11. **Vault-Ownership** — `createVault` im Backend muss `ownerId` aus der Session setzen, sonst funktionieren Sharing-Endpoints nicht (403 "Only the vault owner can manage shares")
12. **Client vs. Server Filesystem** — Bei Features die auf das lokale Dateisystem des Users zugreifen (Export, Download), NIEMALS einen Backend-Endpoint verwenden der auf dem Server-Filesystem schreibt. Der Browser kann remote auf den Server zugreifen → Client- und Server-Filesystem sind unterschiedlich. Stattdessen Browser-APIs nutzen (File System Access API, Download via Blob, etc.)
13. **File System Access API** — `showDirectoryPicker` ist nur in Chromium-Browsern verfügbar (Chrome, Edge, Brave). Firefox unterstützt es nicht und wird es absehbar nicht. Immer einen Fallback bereitstellen (z.B. ZIP-Download via JSZip).
14. **mdast-util `this.buffer()` vergiftet den Stack** — Nach `this.buffer()` ist `this.stack[this.stack.length - 1]` ein leerer String, nicht der zuletzt gepushte Node. `exitHandler` die per Stack-Index auf den Node zugreifen, finden ihn nicht mehr. Nur `buffer()` verwenden wenn `resume()` den gesammelten Text braucht.
15. **Broken Links sehen aus wie Strikethrough** — `text-decoration: line-through` auf unresolved Links wird von Benutzern als `~~durchgestrichen~~` interpretiert. Immer `underline dashed` verwenden.
16. **Embed-Syntax ohne Pipe-Support** — Obsidian-Embeds unterstützen `![[file|size]]` und `![[file|alt]]`. Der Embed-Tokenizer muss den Pipe-Character (`|`, Code 124) als Separator erkennen, sonst wird `|300` als Teil des Dateinamens interpretiert und die Datei nicht gefunden.
17. **EADDRINUSE nach Prozess-Kill** — Nach abruptem Beenden des Backend-Dev-Servers (tsx watch) bleiben TCP-Verbindungen im TIME_WAIT-Status. Nächster Start schlägt mit `EADDRINUSE` fehl. Lösung: 5–10s warten, dann erneut starten. Nicht sofort Code-Änderungen vermuten.
18. **Wiederverwendete Background-Prozesse** — Wenn ein Dev-Server-Prozess "reused" wird, kann der Output vom vorherigen Lauf stammen. Bei unerklärlichen Fehlern: Prozess explizit stoppen und frisch starten.
19. **`_`-Prefix-Dateien im Vault** — Dateien mit `_`-Prefix (z.B. `_link-index.json`) werden von `VaultReader.scanDirectory()` aus dem Directory Tree gefiltert. Wenn eine interne Datei im Explorer auftaucht, fehlt der Filter oder der Dateiname hat keinen `_`-Prefix.
20. **`state.directoryTree` vs. `state.vaultTrees`** — `directoryTree` ist Legacy (einzelner Tree für den ausgewählten Vault). Neue Komponenten sollten `state.vaultTrees[vaultId]` verwenden. Beide werden synchron gehalten durch den Reducer.
21. **FileExplorer expandedPaths mit Vault-Scope** — Folder-Expand-Keys sind `${vaultId}::${path}`, nicht nur `path`. Ohne Vault-Prefix kollidieren identische Ordnernamen in verschiedenen Vaults.
22. **`--bg-primary` existiert nicht** — Wird in vielen Stellen in `App.css` referenziert, ist aber in `index.css` nirgends definiert. Resultat: `var(--bg-primary)` evaluiert zu nichts (transparent). Korrekte Tokens: `--bg-base` (Seiten-Hintergrund), `--bg-surface` (Panel-Hintergrund), `--bg-elevated` (Karten/Inputs, weiß im Light Mode). Bei neuen Styles immer prüfen ob der Token in `index.css` tatsächlich definiert ist.
23. **PDF-Embeds als Note-Embed behandelt** — `detectEmbedType()` kannte nur `'image'` und `'note'`. PDFs (`![[datei.pdf]]`) wurden als Markdown-Notiz geladen → Binär-Müll oder Fehler. Lösung: Dritten Typ `'pdf'` einführen mit eigenem Rendering-Pfad (`PdfViewer`-Komponente). Betrifft BEIDE Render-Pfade: `renderEmbedNode()` und `renderTextWithEmbeds()`.

## Vault-Besitz & Löschregeln

### Abhängigkeitskette bei Löschungen
- **Account löschen** → nur möglich wenn Benutzer keine Vaults besitzt
- **Vault löschen** → nur möglich wenn Vault nicht geteilt wird
- **Freigabe aufheben** → jederzeit durch Besitzer möglich
- Diese Kette erzwingt einen geordneten Abbau: Erst Freigaben aufheben, dann Vault löschen/übertragen, dann Account löschen

### Vault-Besitz-Transfer
- Übertragung nur an genau EINEN Benutzer möglich
- Vor der Übertragung müssen ALLE anderen Freigaben (außer an den Empfänger) widerrufen sein
- Nach Übertragung: Neuer Besitzer hat volle Kontrolle, alter Besitzer verliert jeglichen Zugriff
- Kein "Co-Ownership" — ein Vault hat immer genau einen Besitzer

### Lösch-Workflow bei geteilten Vaults
- Nur read-Freigaben → Besitzer kann alle widerrufen und löschen
- Write-Freigaben vorhanden → Warnung + zwei Optionen: (a) alle Freigaben beenden + löschen, (b) Besitz übertragen
- Frontend muss einen geführten Workflow bereitstellen (kein einfacher "Löschen"-Button bei geteilten Vaults)

## Multi-Session & Konflikterkennung

### Gleichzeitige Sessions
- Mehrere Sessions desselben Benutzers sind erlaubt (Multi-Device)
- Mehrere verschiedene Benutzer gleichzeitig angemeldet — unabhängig voneinander
- Session-Verwaltung: Benutzer sieht eigene Sessions (Gerät, letzte Aktivität), kann einzelne oder alle invalidieren
- Admin kann Sessions beliebiger Benutzer einsehen und invalidieren

### Datei-Konflikte bei gleichzeitiger Bearbeitung
- ETag/Versions-Mechanismus: Jede Datei hat eine Version (z.B. Content-Hash oder Timestamp)
- Beim Speichern: Client sendet die Version mit, die er beim Laden erhalten hat
- Server prüft: Stimmt die Version noch? Falls nein → 409 Conflict
- **Kein** Echtzeit-Locking, kein CRDT — optimistisches Concurrency-Control
- Der zweite Schreiber muss die aktuelle Version neu laden und seine Änderungen manuell zusammenführen

### Account-Sperrung vs. Löschung
- Sperrung: Account bleibt erhalten, Vaults und Freigaben bleiben intakt, Login wird blockiert
- Löschung: Account wird entfernt, alle Sessions invalidiert — nur möglich wenn keine Vaults vorhanden
- Letzter Admin kann weder gesperrt noch gelöscht werden

## Auth-Integration im Frontend

### AuthProvider als äußerster Wrapper
- `AuthProvider` umschließt die gesamte App (vor `AppProvider` und `TabProvider`)
- `AuthGuard`-Komponente entscheidet: LoginPage vs. ChangePasswordPage vs. Main App
- Token und CSRF-Token werden in-memory im `authReducer` gehalten — kein localStorage
- ApiClient bekommt Token/CSRF via `setToken()`/`setCsrfToken()` nach Login

### ApiClient: Token-Management und 401-Interceptor
- `setOnSessionExpired(callback)` — entkoppelt API-Client von React-State
- Bei 401: Token löschen + Callback aufrufen → dispatcht `SESSION_EXPIRED`
- Login-Endpoint sendet KEINEN Authorization-Header (noch kein Token vorhanden)
- CSRF-Token nur bei POST/PUT/DELETE mitsenden (nicht bei GET)

### Optionale Dependencies für Audit-Logging
- Services akzeptieren `auditService?: IAuditService` als optionalen Constructor-Parameter
- Audit-Calls via Optional Chaining: `this.auditService?.log({...})`
- Services funktionieren auch ohne Audit-Service (Tests brauchen ihn nicht)
- IP-Adresse: Services ohne HTTP-Kontext verwenden `'0.0.0.0'` als Platzhalter

### Composition Root: Reihenfolge bei Auth-Wiring
1. Config + Logger
2. Data Layer (UserRepository, SessionStore, AuditLogger, VaultShareRegistry)
3. Business Layer (AuditService, AuthService, UserService, RoleService, VaultAccessControlService)
4. VaultService (mit optionalen shareRegistry + userRepository)
5. Controllers + Route Modules
6. Middleware-Registrierung (auth → CSRF → rate-limit → mustChangePassword)
7. Startup: `sessionStore.loadIndex()` → `ensureDefaultAdmin()` → `vaultService.initializeVaults()`

### CSRF-Secret
- Aus Env-Var `SLATEBASE_CSRF_SECRET` lesen, Fallback: `crypto.randomBytes(32).toString('hex')`
- Bei Neustart ohne persistiertes Secret: alle bestehenden Sessions werden ungültig (CSRF-Tokens stimmen nicht mehr)
- **Empfehlung:** Secret in `.env` setzen für Persistenz über Neustarts

## Entwicklungsumgebung & Netzwerk

### Git-Proxy auf localhost:3128
- Globale Git-Config hat `http.proxy = http://127.0.0.1:3128` gesetzt
- Wenn der lokale Proxy (z.B. Squid, Clash, v2ray) nicht läuft, schlägt `git push` fehl mit "Failed to connect to github.com port 443 via 127.0.0.1"
- **Workaround:** `git -c http.proxy="" push origin master` — überschreibt den Proxy nur für diesen einen Befehl
- **Alternative:** `git config --global --unset http.proxy` → Push → Proxy wieder setzen
- **Langfristig:** Proxy nur für bestimmte Hosts konfigurieren oder sicherstellen dass er immer läuft

### Gitignore-Pflege bei neuen Tools
- `.kiro/settings/` (lokale MCP-Config) muss in `.gitignore` stehen — ist maschinenspezifisch
- `.kiro/specs/` und `.kiro/steering/` gehören ins Repo (Projekt-Dokumentation)
- Root-Level-Screenshots (`/*.png`, `/*.jpg`) ausschließen — entstehen durch Playwright-MCP und Debug-Sessions
- `skills-lock.json` und `**/skills-lock.json` ausschließen — auto-generiert durch Kiro Skills
- `.agents/` und `.kiro/skills/` ausschließen — auto-generiert, maschinenspezifisch
- `frontend/.kiro/` wird durch die Regel für Unterverzeichnisse abgedeckt
- **Regel:** Bei Einführung neuer Tools/Workflows prüfen ob `.gitignore`-Einträge fehlen

## Frontend UX-Patterns

### Keine Browser-Popups (window.alert / window.confirm / window.prompt)
- Warnmeldungen, Bestätigungen und Eingabeaufforderungen direkt in der Oberfläche lösen (Inline-Banner, Modals, Toast-Notifications)
- **Kein** `window.alert()`, `window.confirm()`, `window.prompt()` verwenden
- Akzeptable Ausnahmen: native Browser-Dialoge die nicht ersetzbar sind (z.B. `<input type="file">`, `showDirectoryPicker`, Download-Speicherort)
- **Regel:** Für Bestätigungen eigene Confirm-Komponente (Modal/Inline) nutzen, für Warnungen Toast oder Banner

### Auto-Save statt expliziter Save-Buttons
- Debounced Auto-Save (1,5s Inaktivität) mit Ctrl+S als Sofort-Shortcut
- Status-Indikator am unteren Rand: `● Ungespeichert` → `Speichern…` → `✓ Gespeichert` → `✗ Fehler`
- `onSave`-Callback bleibt als Prop (wird vom Debounce-Timer und Ctrl+S aufgerufen)
- `onCancel` bleibt für Modus-Wechsel (Edit → View), wird aber nicht als Button exponiert
- **Kein** expliziter Save-Button nötig — reduziert kognitive Last

### CSS-Klassen statt Inline-Styles für wiederverwendbare Komponenten
- Inline-Styles sind ok für einmalige Layout-Container (`TabContent`, `emptyStyle`, etc.)
- Wiederverwendbare UI-Elemente (TabBar, Buttons) brauchen CSS-Klassen wegen:
  - Hover/Focus-States (`:hover`, `:focus-visible`)
  - Pseudo-Elemente (`::before`, `::after`)
  - Media Queries (Dark Mode, Responsive)
  - Transitions/Animations
- **Regel:** Wenn ein Element interaktive States hat → CSS-Klasse in `App.css`

### Tab-State bei Vault-Wechsel aufräumen
- `CLEAR_ALL_TABS` Action im `tabReducer` → setzt auf `initialTabState` zurück
- Dispatched in `App.tsx` wenn `selectedVaultId` sich ändert (nur wenn vorheriger Vault existierte)
- Verhindert verwaiste Tabs die auf Dateien eines anderen Vaults zeigen
- **Regel:** Bei Kontext-Wechseln (Vault, Workspace) immer abhängigen State aufräumen

### Scroll-Verhalten: Tabs fixiert, Content scrollt
- `app-content` als Flex-Column mit `overflow: hidden`
- TabBar: `flex-shrink: 0` (bleibt immer sichtbar)
- Content-Area: `flex: 1` + `overflow-y: auto` (scrollt unabhängig)
- **Kein** Scroll auf dem gesamten Content-Bereich — nur der Dateiinhalt scrollt

### Tab-Labels kürzen bei vielen Tabs
- `max-width: 180px` + `text-overflow: ellipsis` auf Tab-Labels
- `flex: 0 1 auto` — Tabs schrumpfen bei Platzmangel, wachsen nicht über max-width
- `overflow: hidden` auf dem Tab-Bar-Container (kein horizontales Scrollen)
- Unsaved-Indikator: `● ` Prefix im Label wenn `editBuffer !== content`
- **Tooltip:** Immer den vollen Dateipfad als `title`-Attribut anzeigen (nicht nur bei Duplikaten)

### Einstellungsseiten als Tabs
- Settings-Seiten (Profil, Sitzungen, Admin-Seiten) öffnen sich als schließbare Tabs
- Eigene `SettingsTabBar` über dem Content-Bereich (getrennt von Datei-Tabs)
- Mehrere Settings-Seiten können gleichzeitig offen sein
- File Explorer bleibt sichtbar wenn Settings aktiv (kein "Zurück"-Button nötig)
- Settings-Tabs haben Icons (Lucide) + Label + Close-Button

### Letzter Vault wiederherstellen
- `localStorage` Key `slatebase_last_vault` speichert die zuletzt gewählte Vault-ID
- Nach Login: Vault automatisch wiederherstellen wenn er noch existiert
- Bei Logout: Key aus localStorage entfernen

### Draggable Toolbar
- Vertikale Toolbar links vom File Explorer (zwischen Sidebar-Resize und Content)
- Buttons per Drag-and-Drop umsortierbar (HTML5 Drag API)
- Buttons zeigen Tooltip (`title`) bei Hover
- Vault-spezifische Buttons (Import, Sharing) sind disabled wenn kein Vault ausgewählt
- Admin-Buttons nur sichtbar wenn `user.role === 'admin'`

### Editor-Toolbar
- Horizontale Toolbar über dem Textarea im EditMode
- Aktionen: H1, H2, H3, Fett, Kursiv, Durchgestrichen, Code, Link, Aufzählung, Nummerierte Liste, Aufgabe, Zitat, Trennlinie, Tabelle
- Separatoren (`edit-toolbar-separator`) zwischen logischen Gruppen
- Toolbar-Buttons setzen Markdown-Syntax an der Cursor-Position ein
- Nach Einfügen: Cursor wird korrekt positioniert via `requestAnimationFrame` + `setSelectionRange`

## Markdown-Rendering

### Frontmatter-Parsing braucht explizites Plugin
- `remark-parse` allein erkennt YAML-Frontmatter (`---`) NICHT
- Benötigt: `remark-frontmatter` Plugin (erzeugt `yaml`-Node im AST)
- Für Darstellung: separater YAML-Parser (`yaml` Package) → Key-Value-Tabelle
- Fallback bei Parse-Fehler: als Code-Block rendern
- **Dependencies:** `remark-frontmatter` + `yaml`

### Collapsible Headings: CSS statt Browser-Default
- `<details open>` + `<summary>` für collapsible Sections
- Browser-Default-Marker (`::marker` / `list-style`) ist inkonsistent positioniert
- Lösung: `list-style: none` + `summary::before { content: '▼' }` (bzw. `'▶'` wenn collapsed)
- `display: flex` + `align-items: baseline` auf `<summary>` → Icon und Heading auf einer Linie
- Heading-Element (`h1`–`h6`) innerhalb `<summary>`: `display: inline` + `margin: 0` + `line-height: 1.4`
- Verhindert Zeilenüberlappung bei langen Überschriften


## Vault-Zugriffskontrolle & Sharing

### Vault-Liste ist benutzergefiltert
- `GET /api/v1/vaults` gibt nur Vaults zurück, die der User besitzt ODER die mit ihm geteilt sind
- Jeder Vault hat ein `permission`-Feld: `'owner'`, `'read'` oder `'write'`
- Admins können `?all=true` anhängen, um alle Vaults ungefiltert zu sehen
- `ownerName` wird vom Backend aufgelöst (UserRepository.findById) und mitgeliefert

### createShare akzeptiert Username ODER userId
- Backend versucht zuerst `findById(targetUserId)`, dann `findByUsername(targetUserId)` als Fallback
- Speichert immer die aufgelöste `userId` im Share-Eintrag
- Prüft Self-Share auch nach Auflösung (falls Username des Owners übergeben wird)

### User-Suche für Autocomplete
- `GET /api/v1/users/search?q=...` — für alle authentifizierten User zugänglich (nicht nur Admins)
- Sucht case-insensitive nach Username-Prefix, gibt bis zu 10 `PublicUserInfo`-Ergebnisse zurück
- Route muss VOR `/users/me` registriert werden (Hono matcht sonst `search` als Parameter)
- Frontend: Debounced (300ms) mit Dropdown, Keyboard-Navigation, ARIA-Combobox-Pattern

### Freigabe-Verwaltung in "Meine Vaults" integriert
- Kein separater "Freigaben"-Button in der Toolbar mehr
- Pro Vault ein aufklappbares Panel mit: bestehende Shares (Permission-Dropdown + Widerrufen) + Add-Form
- Share-Button zeigt Zähler-Badge wenn Shares existieren
- Beim Löschen eines geteilten Vaults: explizite Warnung mit Anzahl der betroffenen Personen

### Vault-Besitz-Transfer im Frontend
- Button mit ArrowRightLeft-Icon pro eigenem Vault
- `window.prompt` für neuen Besitzer (Username oder ID)
- Bestätigungsdialog mit Warnung über Zugriffsverlust
- Backend: `POST /vaults/:vaultId/transfer` mit `{ newOwnerId: string }`

### Read-Only-Modus für geteilte Vaults
- Wenn `vault.permission === 'read'`: Editor zeigt gelbes Banner statt Toolbar
- Textarea ist `readOnly` — kein Tippen möglich, aber Quellcode sichtbar
- Auto-Save und Toolbar-Aktionen sind deaktiviert
- Mode-Toggle (View ↔ Edit) bleibt verfügbar — Read-Only betrifft nur den Edit-Modus

### Default-Modus beim Öffnen: View statt Edit
- `TAB_CONTENT_LOADED` setzt `mode: 'view'` für alle Dateien (auch Text)
- User kann manuell in den Editor wechseln via Mode-Toggle-Button im Tab
- Binary-Dateien haben keinen Mode-Toggle-Button (nur View)

## CSS-Patterns

### overflow: hidden schneidet Dropdowns ab
- Listen-Container (`.my-vaults-list`) dürfen KEIN `overflow: hidden` haben wenn sie Elemente mit absolut positionierten Dropdowns enthalten (Autocomplete, Kontextmenüs)
- Stattdessen: `border-radius` direkt auf `:first-child` / `:last-child` setzen
- **Regel:** Vor dem Setzen von `overflow: hidden` prüfen ob Kinder absolute Positionierung nutzen

### Admin-Seiten: Card-basiertes Layout
- Sektionen in Cards (`.admin-config-card`) mit Titel, optionalem Grid für Felder
- Gefahrenzone: eigene Card mit rotem Rahmen (`--danger` Tokens)
- Buttons mit Icons (Lucide) + Text, Primary/Danger-Varianten

### appearance: none + disabled = unsichtbar
- `appearance: none` entfernt den Browser-Default-Style komplett
- `disabled`-Attribute setzt in manchen Browsern `opacity: 0.4` oder blendet das Element aus
- Kombination: Element wird unsichtbar wenn kein explizites `opacity: 1` auf `:disabled` gesetzt ist
- **Regel:** Bei jedem `appearance: none` auf einem `disabled`-Element immer `opacity: 1` explizit setzen
- Betrifft: Checkboxen, Radio-Buttons, Select-Elemente mit Custom-Styling

## Vault Import/Export

### Export-Strategie: Progressive Enhancement
- **Chromium (Chrome, Edge, Brave):** File System Access API (`showDirectoryPicker`) → User wählt Zielordner, Dateien werden direkt mit Ordnerstruktur geschrieben
- **Firefox (Fallback):** JSZip im Browser → alle Dateien per fetch laden, clientseitig zu ZIP packen, als einzelne Datei downloaden
- Kein Backend-Endpoint nötig — nutzt bestehende `/vaults/:vaultId/tree` und `/vaults/:vaultId/files?path=...&raw=true` Endpunkte
- `exportVault()` ist ein Action Creator in `frontend/src/state/index.ts` (wie `importFile`/`importFolder`)
- JSZip wird per dynamischem `import('jszip')` geladen (nur wenn Fallback gebraucht wird → kein Bundle-Overhead für Chrome-User)
- ZIP-Dateiname: `<vault-name>-export.zip`
- Vor dem ZIP-Fallback: `window.confirm` mit Hinweis dass Chrome besser funktioniert

### Import nutzt Browser-native APIs
- `<input type="file">` für Einzeldatei-Import
- `<input type="file" webkitdirectory>` für Ordner-Import (funktioniert in allen modernen Browsern)
- Kein Backend-seitiges Lesen vom Client-Filesystem möglich (Remote-Zugriff!)

## Internationalisierung (i18n)

### Eigener leichtgewichtiger i18n-Context
- Kein `react-i18next` oder ähnliches Framework — eigener Provider mit `useTranslation()` Hook
- Sprachdateien als TypeScript-Objekte (`de.ts`, `en.ts`) für Typsicherheit
- Verschachtelte Keys mit Dot-Notation: `t('auth.login')`, `t('vault.nameEmpty')`
- Interpolation mit `{placeholder}`-Syntax: `t('auth.rateLimited', { seconds: 30 })`
- Typsichere Keys: TypeScript leitet erlaubte Keys aus dem deutschen Objekt ab (`TranslationKey`)

### Locale-Ermittlung aus User-Profil
- Sprache wird aus `user.preferredLanguage` bezogen (nach Login)
- Vor Login: Fallback auf `navigator.language` (Browser-Erkennung)
- `I18nBridge`-Komponente sitzt zwischen `AuthProvider` und Rest, liest Auth-State
- Provider-Hierarchie: `AuthProvider` → `I18nBridge` → `I18nProvider` → `AuthGuard` → App
- Nach Profil-Update: `PROFILE_UPDATED` Action aktualisiert Auth-State → Locale wechselt sofort

### Graceful Fallback ohne Provider (Tests)
- `useTranslation()` wirft NICHT wenn kein Provider vorhanden — gibt stattdessen deutsche Fallback-Übersetzungen zurück
- Tests brauchen keinen `I18nProvider`-Wrapper
- Test-Setup setzt `navigator.language = 'de-DE'` für konsistentes Verhalten in jsdom

### Übersetzungs-Namespaces
- `common.*` — Allgemeine UI-Strings (Laden, Fehler, Abbrechen, etc.)
- `auth.*` — Login, Passwort, Session
- `vault.*` — Vault-Verwaltung
- `files.*` — Datei-Operationen
- `editor.*` — Markdown-Editor-Toolbar
- `tabs.*` — Tab-Leiste
- `userMenu.*` — Benutzermenü
- `pages.*` — Seitentitel
- `profile.*` — Profilseite
- `sessions.*` — Sitzungsverwaltung
- `admin.users.*`, `admin.config.*`, `admin.audit.*`, `admin.vaults.*` — Admin-Seiten
- `sharing.*` — Vault-Freigaben
- `vaultDeletion.*` — Vault-Lösch-Workflow
- `binaryViewer.*`, `fileViewer.*` — Datei-Anzeige
- `rightPanel.*`, `resize.*` — Layout-Elemente

### Doppelte Validierung beachten
- Backend hat ZWEI Validierungsschichten: Zod-Schema (Controller) UND Service-Methoden (Business)
- Beide müssen konsistent sein — wenn Zod leere Strings erlaubt, muss der Service das auch tun
- **Regel:** Bei Validierungsänderungen IMMER beide Schichten prüfen (`validation.ts` UND Service-Methoden)

## Color Scheme (Light/Dark/System)

### Steuerung über data-theme Attribut
- `<html data-theme="light|dark|system">` wird per JavaScript gesetzt
- CSS-Logik:
  - `data-theme="dark"` → expliziter Dark-Mode-Block (`:root[data-theme="dark"]`)
  - `data-theme="light"` → kein Dark-Override (Light-Tokens aus `:root` greifen)
  - `data-theme="system"` → `@media (prefers-color-scheme: dark)` mit `:root:not([data-theme="light"])` entscheidet
- `I18nBridge` setzt `data-theme` per `useEffect` basierend auf `authState.user?.colorScheme`

### Light Mode: Subtiler Kontrast statt dunkle Sidebar
- Sidebar und Right Panel nutzen `#f1f5f9` (helles Grau-Blau), Content `#f8fafc` (noch heller)
- Trennung durch `#e2e8f0` Borders statt durch Farbkontrast
- Texte dunkel auf hellem Grund (Standard-Lesbarkeit)
- Dark Mode behält dunkle Sidebar (`#0b1120`) bei

## Dropdown-Positionierung bei overflow: hidden Parents

### position: fixed für Dropdowns in geclippten Containern
- `.app-vault-layout` hat `overflow: hidden` → schneidet absolut positionierte Kinder ab
- Lösung: Dropdown mit `position: fixed` rendern
- Position per JavaScript berechnen: `getBoundingClientRect()` des Trigger-Buttons
- Dropdown unterhalb des Triggers, rechtsbündig zum Button
- Schutz gegen Off-Screen: `if (left < 8) left = 8`
- **Regel:** Wenn ein Dropdown in einem `overflow: hidden` Container sitzt → `position: fixed` + JS-Positionierung

### Keine CSS-Pseudo-Element-Tooltips über Containergrenzen
- `::after` mit `position: absolute` wird vom Parent-Overflow abgeschnitten
- Native `title`-Attribute können über den Viewport hinausragen (Browser-Kontrolle)
- Für Tooltips die über Container-Grenzen müssen: Custom Tooltip-Komponente mit `position: fixed` oder Portal
- **Einfachste Lösung:** Auf Tooltip verzichten wenn die Info im Dropdown/Menü sichtbar ist

## PublicUserInfo: Backend und Frontend synchron halten

### Alle Felder im Backend-Interface UND in toPublicInfo()
- Wenn ein Feld zum `PublicUserInfo`-Interface hinzugefügt wird, MUSS es auch in `toPublicInfo()` gemappt werden
- Sonst gibt der Server das Feld nicht zurück → Frontend bekommt `undefined` statt des erwarteten Typs
- **Betroffene Stellen:** `UserService.toPublicInfo()`, `AuthService` Login-Response, Test-Mocks
- **Regel:** Bei Interface-Änderungen `grep` nach allen Stellen die das Interface konstruieren

### Defensive Initialisierung im Frontend
- Felder die vom Server kommen immer mit `?? ''` oder `?? defaultValue` initialisieren
- Schützt gegen alte Sessions/Caches die das neue Feld noch nicht haben
- Besonders wichtig nach Interface-Erweiterungen (alte Daten im sessionStorage)

## Docker-Deployment

### Node.js `--experimental-strip-types` funktioniert NICHT mit `.js`-Extension-Imports
- Backend verwendet `.js`-Extensions in allen relativen Imports (ESM-Konvention für kompilierten Code)
- `--experimental-strip-types` entfernt nur Typ-Annotationen, löst aber KEINE `.js` → `.ts` Umschreibung auf
- Ergebnis: `ERR_MODULE_NOT_FOUND: Cannot find module '/app/src/config/index.js'`
- **Lösung für Docker:** Multi-Stage-Build mit `tsc` → kompiliertes JavaScript in `dist/` ausführen (`node dist/index.js`)
- **Lokal (Dev):** `tsx watch` funktioniert weiterhin, da tsx die Auflösung übernimmt
- **Regel:** Für Production-Deployments immer den `tsc`-Build verwenden, nicht `--experimental-strip-types`

### Multi-Stage Dockerfile für Backend
- Stage 1 (build): `npm ci` (alle Deps inkl. devDeps) → `npx tsc` → `dist/` entsteht
- Stage 2 (production): `npm ci --omit=dev` → `COPY --from=build dist/` → `node dist/index.js`
- argon2 braucht Build-Tools (python3, make, g++) in BEIDEN Stages (native Compilation bei `npm ci`)
- Build-Tools nach `npm ci` wieder entfernen um Image-Größe zu reduzieren
- Non-Root-User (`slatebase:slatebase`) für Security

### Config-Pfad-Auflösung nach tsc-Build
- `config/index.ts` verwendet `resolve(__dirname, '../../config/default.json')`
- Nach Kompilierung: `dist/config/index.js` → `__dirname` = `/app/dist/config`
- `../../config/default.json` → `/app/config/default.json` ✓
- **Regel:** Bei Pfad-Berechnungen mit `__dirname` immer prüfen ob sie nach Kompilierung noch stimmen

### Docker-Env-Vars statt .env-Datei
- Im Container werden Env-Vars über `docker-compose.yml` → `env_file: docker.env` injiziert
- Kein `--env-file=.env` im CMD nötig — `process.env` wird direkt von Docker befüllt
- `ConfigService.loadEnvOverlay()` liest aus `process.env` — funktioniert unabhängig von der Quelle

### Healthcheck für Backend-Container
- Prüft ob der Server antwortet: `fetch('http://localhost:3000/api/v1/vaults')`
- Erwartet 401 (Unauthorized) als "healthy" — beweist dass der Server läuft und Auth aktiv ist
- `start_period: 10s` gibt dem Backend Zeit für Initialisierung (Sessions laden, Admin erstellen, Vaults init)

### Frontend: Nginx als Reverse Proxy im Container
- Nginx serviert statische Dateien aus `/usr/share/nginx/html` (Vite-Build-Output)
- `/api/` wird an `http://backend:3000` geproxied (Docker-internes Netzwerk, Container-Name als Hostname)
- SPA-Fallback: `try_files $uri $uri/ /index.html` für Client-Side-Routing
- `client_max_body_size 512m` für große File-Uploads

### SLATEBASE_HOST muss 0.0.0.0 sein im Container
- Default in `config/default.json` ist `127.0.0.1` (nur localhost)
- Im Docker-Container muss der Server auf `0.0.0.0` lauschen, sonst ist er von außen (auch vom Nginx-Container) nicht erreichbar
- `docker.env` setzt `SLATEBASE_HOST=0.0.0.0`

### Reverse Proxy: Trusted Proxies für echte Client-IPs
- Ohne `SLATEBASE_TRUSTED_PROXIES` ignoriert das Backend `X-Forwarded-For` komplett → Audit-Log zeigt die Docker-interne Proxy-IP
- `createClientIpMiddleware` in `src/api/client-ip.ts` setzt `c.set('clientIp', ip)` für alle Handler
- Middleware wird VOR Auth-Middleware registriert (auch Login-Requests bekommen die echte IP)
- Logik: Socket-IP via `getConnInfo` (aus `@hono/node-server/conninfo`) → prüfe ob in `trustedProxies` → wenn ja: `X-Forwarded-For` leftmost IP, sonst Socket-IP
- CIDR-Matching für Subnet-Ranges (z.B. `172.19.0.0/16` für ein Docker-Netzwerk)
- IPv6-Loopback `::1` wird automatisch auf `127.0.0.1` normalisiert
- Wildcard `*` vertraut allen Verbindungen — nur für Debugging, nicht für Production
- **Regel:** Bei Docker-Setups mit externem Reverse Proxy (NPM, Traefik, Caddy) immer das Proxy-Netzwerk-Subnet als `SLATEBASE_TRUSTED_PROXIES` setzen
- **Subnet ermitteln:** `docker network inspect <netzwerk-name> --format '{{range .IPAM.Config}}{{.Subnet}}{{end}}'`

### Reverse Proxy: Frontend-Port nur intern exponieren
- Wenn ein externer Reverse Proxy (NPM) den Traffic weiterleitet, braucht der Frontend-Container keinen nach außen offenen Port
- `ports: - "8080:80"` → `expose: - "80"` (nur Docker-intern sichtbar)
- Verhindert unverschlüsselten Zugriff am Proxy vorbei
- **Regel:** In Production mit Reverse Proxy niemals den Frontend-Port direkt nach außen exponieren

## i18n-Typsystem

### `typeof de` erzeugt literale String-Typen
- `export const de = { common: { loading: 'Laden…' } }` → TypeScript leitet `"Laden…"` als Literal-Typ ab
- `Translations = typeof de` → alle Werte sind Literal-Typen, nicht `string`
- `en: Translations` erzwingt dann exakt die gleichen String-Werte → unmöglich für andere Sprachen

### TranslationShape: Struktur prüfen, Werte frei lassen
- Rekursiver Mapped Type der die Schlüssel-Struktur von `de` spiegelt, aber `string` als Blatt-Typ verwendet
- `en.ts` importiert `type { de }` direkt aus `./de` (kein zirkulärer Import über `index.ts`)
- Definiert `TranslationShape` lokal basierend auf `typeof de`
- **Regel:** Neue Übersetzungsdateien immer mit `TranslationShape` typisieren, nie mit `Translations`

### TranslateFn-Typ für Hilfsfunktionen
- `export type TranslateFn = (key: TranslationKey, params?: Record<string, string | number>) => string`
- Hilfsfunktionen die `t` als Parameter akzeptieren müssen `TranslateFn` verwenden
- NICHT `(key: string) => string` — das ist kontravariant inkompatibel mit dem engeren `TranslationKey`-Typ
- **Betroffene Funktionen:** `extractErrorMessage`, `mapTransferError`, `mapShareError`

### test-setup.ts vom Production-Build ausschließen
- `test-setup.ts` matcht NICHT auf `*.test.ts` Pattern
- Muss explizit in `tsconfig.app.json` exclude aufgenommen werden: `"src/test-setup.ts"`
- Sonst: `Cannot find name 'beforeEach'` weil Test-Runner-Typen im App-Build nicht verfügbar sind


## Chat-System

### chatReducer: State-Konsistenz bei Konversations-Aktionen
- `CONVERSATION_LEFT` muss `currentConversation` auf `null` und `messages` auf `[]` setzen, wenn die verlassene Konversation die aktuell angezeigte ist
- Sonst bleibt der Chat-Inhalt sichtbar obwohl die Konversation nicht mehr existiert
- **Regel:** Bei jeder Aktion die eine Konversation entfernt prüfen ob sie die aktuelle ist

### Konversationsliste braucht aktive Aktualisierung
- Einmaliges Laden beim Mount reicht nicht — Server-Änderungen (neue Nachrichten, Archivierung) werden nicht reflektiert
- Lösung: Dreifacher Mechanismus:
  1. **Optimistisches lokales Update** bei `MESSAGE_SENT` (Preview, Timestamp, Sortierung)
  2. **Periodischer Refresh** alle 30 Sekunden via `setInterval`
  3. **Visibility-Change-Handler** für sofortigen Refresh bei Tab-Fokus
- Cleanup bei Unmount: `clearInterval` + `removeEventListener` (Memory Leaks verhindern)
- **Regel:** Langlebige Seiten mit Server-Daten brauchen immer einen Refresh-Mechanismus

### MESSAGE_SENT muss Konversationsliste aktualisieren
- Der Reducer muss bei `MESSAGE_SENT` nicht nur `messages` erweitern, sondern auch:
  - `lastMessagePreview` auf `content.slice(0, 100) + '…'` setzen (wenn > 100 Zeichen)
  - `lastMessageTimestamp` auf den Nachrichten-Timestamp setzen
  - Die Konversation an Index 0 verschieben (neueste zuerst)
- Wenn keine passende Konversation gefunden wird: graceful ignorieren (kein Crash)

### ChatProvider-Hierarchie
- `ChatProvider` sitzt in `App.tsx` (nicht in `ChatPage`) damit `SidebarToolbar` auf `globalUnreadCount` zugreifen kann
- `ChatPage` nutzt `useChatContext()` direkt ohne eigenen Provider
- 30s-Polling für `globalUnreadCount` läuft im `ChatProvider` (nicht in App.tsx)

### Property-Based Testing für Reducer
- `chatReducer` ist eine pure Funktion → ideal für PBT ohne Mocking
- `fast-check` generiert beliebige State + Action Kombinationen
- Preservation-Tests: Verhalten für alle Nicht-Bug-Actions muss identisch bleiben nach einem Fix
- Bug-Condition-Tests: Schreiben VOR dem Fix, erwarten Failure → nach Fix erwarten sie Pass

## Vault-Sync

### Modulstruktur analog zum Chat-Modul
- Eigenes Verzeichnis `backend/src/sync/` mit Types, Errors, Validation, Stores, Engine, Service
- Barrel-Export über `index.ts` — alle öffentlichen Interfaces und Klassen
- Gleiche Schichtung: Utility → Store → Engine → Service → API
- **Regel:** Neue Feature-Module immer nach diesem Pattern aufbauen

### CryptoService: Server-Secret für Credential-Verschlüsselung
- `SLATEBASE_SYNC_SECRET` Env-Var (min 32 Zeichen) für AES-256-GCM Verschlüsselung
- Wenn nicht gesetzt: Random-Secret bei jedem Start → verschlüsselte Credentials überleben Neustarts nicht
- **Empfehlung:** Secret in `.env` / `docker.env` setzen für Persistenz
- Separates Secret von `SLATEBASE_CSRF_SECRET` — unterschiedliche Zwecke

### SyncLock: In-Memory Mutex reicht für Single-Process
- `Map<string, boolean>` — kein TOCTOU-Problem da Node.js single-threaded
- Schützt gegen parallele Syncs, Analysen UND Konfliktauflösungen pro Vault
- Scheduler-Callback prüft `isLocked()` — überspringt wenn gelockt (kein Queuing)
- Lock wird im `finally`-Block freigegeben — auch bei Exceptions

### Checkpoint-Strategie: Nur bei Erfolg aktualisieren
- `last_seq` aus CouchDB Changes Feed wird erst am Ende in Checkpoint geschrieben
- Bei `failed` (Verbindungsabbruch): Checkpoint bleibt unverändert → nächster Sync wiederholt alles
- Bei `partial_success` (einzelne Dokumente fehlgeschlagen): Checkpoint wird aktualisiert, da CouchDB sonst Endlos-Schleifen erzeugt
- **Regel:** Checkpoint-Update immer atomar (temp → rename)

### Pre-Write mtime Check für Konflikterkennung
- Vor dem Schreiben einer gepullten Datei: aktuelle `mtime` mit Checkpoint vergleichen
- Wenn `aktuelle mtime > checkpoint mtime` → lokale Änderung seit letztem Sync → Konflikt erzeugen
- Wenn Datei nicht existiert → normal schreiben (neue Remote-Datei)
- Verhindert Datenverlust bei gleichzeitiger Bearbeitung

### obsidian-livesync Chunk-Reassembly
- Große Dokumente werden von obsidian-livesync in Chunks fragmentiert
- Chunks müssen beim Pull reassembliert werden bevor sie als Datei geschrieben werden
- Chunk-Reihenfolge aus CouchDB-Dokument-Metadaten ableiten

### Sync-Konfiguration: Owner-Only Zugriff
- Nur der Vault-Besitzer darf Sync konfigurieren/auslösen — Admin-Rolle hat KEINEN Bypass
- Prüfreihenfolge: Auth (401) → Vault-Existenz (404) → Owner (403)
- Verhindert Information Leakage über Vault-Existenz an nicht-authentifizierte Requests

### Config-Änderung während Sync
- `updateConfig()` prüft Lock → 409 wenn Sync läuft
- Laufender Sync verwendet Snapshot-Kopie der Config (keine Live-Referenz)
- `disableConfig()` setzt nur Status-Flag — laufender Sync läuft zu Ende

### SyncScheduler: Wiederherstellung nach Neustart
- `initializeSchedulers()` wird im Composition Root nach Vault-Init aufgerufen
- Lädt alle aktiven Configs mit Intervall und startet Timer
- Erster Sync nach vollem Intervall ab Startzeitpunkt (nicht sofort)
- `stopAll()` für graceful Shutdown


## MCP Context Server

### Modulstruktur analog zu Sync/Chat
- Eigenes Verzeichnis `backend/src/mcp/` mit Types, Config, Errors, Validation, Stores, Service, Handlers, Factory
- Barrel-Export über `index.ts` — alle öffentlichen Interfaces und Klassen
- Gleiche Schichtung: Types/Errors → TokenStore (Data) → McpTokenService (Business) → McpHandlers/McpServerFactory (Protocol) → Routes (API)
- **Regel:** Folgt dem gleichen Layered-Pattern wie alle anderen Module

### Token-Authentifizierung (Bearer Token, nicht Session)
- MCP-Clients nutzen `Authorization: Bearer <token>` — unabhängig von Browser-Sessions
- Token-Format: 128 Hex-Zeichen (`crypto.randomBytes(64).toString('hex')`)
- Gespeichert als SHA-256-Hash (Klartext-Token wird nur einmal bei Erstellung zurückgegeben)
- In-Memory-Index (`Map<tokenHash, tokenId>`) für O(1) Validierung — analog zu SessionStore
- Token-Verwaltung (CRUD) über Session-Auth-geschützte Endpoints (`/api/v1/mcp/tokens`)

### MCP SDK Integration
- `@modelcontextprotocol/sdk` stellt `McpServer` und `StreamableHTTPServerTransport` bereit
- Hono nutzt `@hono/node-server` → Zugriff auf raw `IncomingMessage`/`ServerResponse` via `c.env.incoming`/`c.env.outgoing`
- Pro POST-Request wird ein neuer Transport + Server erstellt (stateless per-request)
- Sessions werden in einer In-Memory-Map verwaltet (für GET/DELETE SSE-Streams)
- **Regel:** `StreamableHTTPServerTransport` (nicht `WebStandardStreamableHTTPServerTransport`) verwenden, da wir raw Node.js HTTP-Objekte brauchen

### User-Invalidierung Hook
- `UserService` akzeptiert optionalen `onUserInvalidated`-Callback
- Wird bei `deleteUser()`, `suspendUser()`, `deleteSelf()` aufgerufen
- MCP-Modul registriert `mcpTokenService.invalidateAllForUser` als Callback
- Mutable-Reference-Pattern: Callback wird nach MCP-Init gesetzt (Composition Root Reihenfolge)

### Rate Limiting per Token
- Sliding-Window-Algorithmus (In-Memory, resets bei Neustart — akzeptabel)
- Konfigurierbar via `SLATEBASE_MCP_RATE_LIMIT` (Standard: 60 req/min/token)
- HTTP 429 mit `Retry-After`-Header bei Überschreitung
- Automatische Cleanup alter Einträge verhindert Memory Leaks

### .well-known/mcp.json Discovery
- Öffentlich zugänglich (keine Auth) — ermöglicht Auto-Discovery durch MCP-Clients
- Gibt 404 zurück wenn MCP deaktiviert ist
- Registriert außerhalb der `/api/v1/*` Middleware-Chain

### MCP Write Tools (Schreibzugriff)
- 5 Write-Tools ergänzen die 4 Read-Tools: `write_file`, `create_directory`, `delete_file`, `move_file`, `rename_file`
- Alle Write-Tools prüfen `checkWriteAccess()` — nur Vault-Besitzer und Benutzer mit Write-Share haben Zugriff
- Delegieren an bestehende `VaultService`-Methoden (kein duplizierter Code)
- `write_file` unterstützt optionalen `ifMatch`-Parameter für ETag-basierte Konflikterkennung
- Fehler-Mapping: Domain-Errors → MCP-Error-Codes (`-32005` Conflict, `-32006` Storage, `-32001` Access Denied, etc.)
- **Regel:** Neue MCP-Tools immer über die Business-Schicht (`VaultService`) implementieren, nie direkt auf das Filesystem zugreifen


## Obsidian Markdown Kompatibilität

### Drei-Schichten-Pattern für micromark-Plugins
- Jedes Plugin mit eigener Inline-Syntax (Wikilink, Embed, Tag) folgt dem gleichen Muster:
  1. `syntax.ts` — micromark Tokenizer-Extension (registriert auf Character-Code)
  2. `mdast-util.ts` — fromMarkdown + toMarkdown Handler (Token → MDAST-Node und zurück)
  3. `plugin.ts` — remark Plugin-Wrapper (registriert Extensions auf `this.data()`)
- Callout-Plugin ist anders: MDAST-Transformer der existierende `blockquote`-Nodes transformiert
- **Regel:** Neue Obsidian-Syntax-Elemente immer nach diesem Pattern implementieren

### micromark Tokenizer: `Effects` statt `Parameters<Tokenizer>[1]`
- TypeScript's `Parameters<>` zählt den `this`-Parameter NICHT mit
- `Parameters<Tokenizer>[1]` ergibt `State` (der `ok`-Parameter), nicht `Effects`
- **Immer** den `Effects`-Typ direkt importieren und verwenden:
  ```typescript
  function tokenize(this: TokenizeContext, effects: Effects, ok: State, nok: State): State
  ```

### Plugin-Array-Typisierung in unified Pipeline
- `Plugin[]` (ohne Generics) ist inkompatibel mit `Plugin<[], Root>`
- Lösung: `Array<Plugin<[], Root>>` für das Plugin-Array
- `pipeline.use(plugin)` ändert den Processor-Typ → `as unknown as typeof pipeline` bei Reassignment

### Embed-Nodes als PhrasingContent
- micromark parsed `![[...]]` als Inline-Syntax → Embed-Nodes landen in Paragraphen
- TypeScript's `PhrasingContentMap` enthält `embed` nicht (ist in `BlockContentMap`)
- Workaround: `case 'embed' as PhrasingContent['type']:` im Switch

### Callout-Plugin: Transformer statt Syntax-Extension
- Callouts bauen auf existierenden `blockquote`-Nodes auf — kein neuer Token nötig
- Plugin gibt eine Transformer-Funktion zurück: `return (tree: Root) => { transformCallouts(tree) }`
- `pipeline.runSync(tree)` nach `.parse()` führt den Transformer aus
- **Regel:** Wenn Syntax auf existierenden MDAST-Nodes aufbaut → Transformer-Pattern verwenden

### Graceful Degradation bei Plugin-Fehlern
- Jedes Plugin wird einzeln in try/catch registriert
- Bei Parse/Run-Fehler: Fallback auf Base-Pipeline (remarkParse + remarkFrontmatter + remarkGfm)
- Verhindert dass ein fehlerhaftes Plugin die gesamte Markdown-Anzeige blockiert

### Heading-Anchor-Normalisierung
- Umlaute (äöüß) werden beibehalten — nicht entfernt oder transliteriert
- Duplikate bekommen numerisches Suffix (-1, -2, etc.)
- `createAnchorTracker()` ist stateful → muss pro Render-Pass neu erstellt werden
- Gleiche Normalisierung in `scrollToHeadingAnchor()` verwenden wie in `generateHeadingAnchor()`

### Link-Resolver: Depth-First Alphabetical
- Bei mehrdeutigen Dateinamen (gleicher Name in verschiedenen Ordnern): erste Datei in Tiefensuche, alphabetisch sortiert
- Case-insensitive Suche + `.md`-Extension-Fallback
- Pfad-basierte Targets (`ordner/datei`) werden als relative Pfade aufgelöst

### CSS Design Tokens für Obsidian-Elemente
- 12 Callout-Typen × 3 Tokens (bg, border, icon) = 36 neue Tokens
- Alle in `:root`, `:root[data-theme="dark"]` UND `@media (prefers-color-scheme: dark)` definieren
- Tags, Embeds, Broken Links haben eigene Token-Gruppen
- **Regel:** Keine hartcodierten Farben in Obsidian-Element-Styles — immer Tokens verwenden

### Keine neuen npm-Dependencies nötig
- `micromark`, `mdast-util-from-markdown`, `unist-util-visit` sind transitive Dependencies von `remark-parse`/`unified`
- Direkt importierbar ohne Installation
- **Regel:** Vor dem Installieren neuer Packages prüfen ob sie bereits transitiv verfügbar sind

### mdast-util-from-markdown: buffer()/resume() vs. sliceSerialize()
- `this.buffer()` in einem `enter`-Handler pusht einen leeren String auf `this.stack`
- Danach ist `this.stack[this.stack.length - 1]` der Buffer-String, NICHT der Node
- `this.sliceSerialize(token)` liest direkt aus dem Source-Text — unabhängig vom Buffer
- **Fehler-Pattern:** `enterTag` ruft `this.buffer()` auf → `exitTagValue` findet den TagNode nicht mehr auf dem Stack → `node.tag` bleibt leer → Tag-Text fehlt im Rendering
- **Regel:** `this.buffer()`/`this.resume()` nur verwenden wenn man den gesamten Text-Content eines Tokens als String sammeln will. Wenn man Token-Werte per `sliceSerialize()` liest, ist `buffer()` unnötig und schädlich.
- **Regel:** Nach Änderungen an mdast-util-Handlern immer prüfen ob der Stack-Zugriff (`this.stack[this.stack.length - 1]`) den erwarteten Node-Typ zurückgibt

### Embed-Syntax: Pipe-Separator für Größe/Display
- Obsidian unterstützt `![[bild.jpg|300]]`, `![[bild.jpg|300x200]]`, `![[bild.jpg|100%]]`, `![[bild.jpg|x200]]`
- Der Pipe-Character `|` muss im Embed-Tokenizer als `embedSeparator`-Token erkannt werden
- `EmbedNode` hat ein `display: string | null` Feld für den Text nach dem Pipe
- Größen-Parsing im Renderer: `parseEmbedImageStyle(display)` → CSS-Properties
- Nicht-numerischer Display-Text wird als Alt-Text interpretiert
- **Regel:** Bei neuen Obsidian-Syntax-Elementen immer die Obsidian-Dokumentation auf Pipe-Varianten prüfen

### Embed-Typ-Erkennung: Drei Kategorien
- `detectEmbedType(target)` in `plugins/embed/syntax.ts` gibt `'image' | 'pdf' | 'note'` zurück
- `IMAGE_EXTENSIONS` und `PDF_EXTENSIONS` sind in `plugins/types.ts` definiert
- PDFs (`![[datei.pdf]]`) werden als inline `<object type="application/pdf">` gerendert (via `PdfViewer`)
- Nicht-Bild/Nicht-PDF-Embeds werden als Markdown-Notiz geladen und rekursiv gerendert
- **Fehler-Pattern:** Neuen Dateityp vergessen → wird als Note-Embed behandelt → versucht Binärdaten als Markdown zu rendern
- **Regel:** Bei neuen einbettbaren Dateitypen: (1) Extension-Liste erweitern, (2) `detectEmbedType` anpassen, (3) `renderEmbedNode()` erweitern, (4) `renderTextWithEmbeds()` erweitern

### Broken Links: Kein Durchstreichen (line-through)
- `text-decoration: line-through` für broken/unresolved Links ist visuell identisch mit Markdown-Strikethrough (`~~text~~`)
- Benutzer verwechseln broken Links mit durchgestrichenem Text
- **Lösung:** `--broken-link-text-decoration: underline dashed` — dezente gestrichelte Unterstreichung
- Obsidian selbst zeigt unresolved Links nur in einer anderen Farbe, ohne Dekoration
- **Regel:** Broken Links nie mit `line-through` stylen — immer `underline dashed` oder nur Farbänderung

### extractPlainText() muss alle Inline-Node-Typen kennen
- `extractPlainText()` wird für Heading-Anchor-Generierung verwendet
- Muss ALLE PhrasingContent-Typen behandeln die Text enthalten: `text`, `inlineCode`, `wikilink` (→ `display`), `tag` (→ `tag`)
- Fehlende Typen → Anchor-IDs stimmen nicht mit dem sichtbaren Heading-Text überein
- **Regel:** Bei neuen Inline-Node-Typen immer `extractPlainText()` erweitern

### Task-Listen (GFM Checkboxen)
- `remark-gfm` parsed `- [ ]` / `- [x]` als `listItem` mit `checked: boolean | null`
- `checked === null` → normales List-Item, `checked === true/false` → Task-Item
- Parent-`<ul>` braucht eigene CSS-Klasse (`view-mode-task-list`) mit `list-style: none` + reduziertem Padding
- Nur `list-style: none` auf dem `<li>` reicht NICHT — der Bullet-Platz (padding-left) bleibt auf dem `<ul>`
- Checkbox-Content in `<span class="view-mode-task-item__content">` wrappen für gezielte Styles (line-through nur auf Text, nicht auf Checkbox)
- `hasTaskItems`-Check auf `node.children.some(item => item.checked != null)` für die Parent-Klasse

## Context Panel

### Split-Modus: Jede Section hat eigene Tab-Leiste
- Im Split-Modus (`sections.length > 1`) zeigt jede Section ihre eigene `ContextPanelTabBar`
- Im Single-Section-Modus wird die Tab-Leiste separat über dem Content gerendert (in `ContextPanel.tsx`)
- `SplitSectionContainer` rendert Tab-Leisten nur im Split-Modus — Single-Section-Rendering liegt bei `ContextPanel`

### Tab-Leiste: Nur Icons, Text als Tooltip
- `ContextPanelTabBar` rendert immer nur Icons (14px Lucide-Icons)
- Labels werden als `title`-Attribut (nativer Browser-Tooltip) und `aria-label` (Accessibility) beibehalten
- CSS-Klasse `context-panel-tab-bar--icon-only` wird immer angewendet
- Kein `panelWidth`-basierter Wechsel zwischen Icon-Only und Icon+Text mehr

### Cross-Section Tab-Verschiebung
- Tabs können per Drag & Drop von einer Section in eine andere verschoben werden
- Neuer Reducer-Action: `MOVE_VIEW_TO_SECTION` — verschiebt View und entfernt leere Source-Section
- `ContextPanelTabBar` akzeptiert `onTabReceive`-Prop für eingehende Drops aus anderen Sections
- `sectionId`-Prop identifiziert die Section für Cross-Section-Drops
- Tabs sind auch in Single-Tab-Sections draggable (wenn `sectionId` gesetzt ist)

### Letzte Tab rausgezogen → Section schließt sich
- Wenn die letzte View aus einer Section verschoben wird, wird die Section automatisch entfernt
- Höhen werden gleichmäßig auf die verbleibenden Sections umverteilt (`1 / newSections.length`)
- Verhindert leere Sections ohne Inhalt

### ContextPanelProvider: Layout-Persistenz per User
- Layout (tabOrder, sections mit viewIds/activeViewId/heightFraction) wird in localStorage gespeichert
- Scoped per `userId` — verschiedene Benutzer haben verschiedene Layouts
- Debounced (500ms) um excessive Writes zu vermeiden
- Beim Laden: Section-IDs werden frisch generiert (nicht aus localStorage übernommen)

## Knowledge Graph

### SVG-Text in transformierten Gruppen wird unscharf
- SVG `<text>`-Elemente innerhalb einer `<g transform="scale(...)">` Gruppe werden vom Browser mit Subpixel-Rendering gezeichnet
- Ergebnis: chromatische Aberrationen (farbige Ränder an Buchstaben), pixeliger Text
- CSS-Fixes (`text-rendering`, `-webkit-font-smoothing`) helfen nur minimal
- **Lösung:** Labels AUSSERHALB der Zoom-Transform-Gruppe rendern und Position manuell berechnen:
  ```tsx
  // Labels in separater <g> ohne scale(), Position = node.x * zoom + panX
  <g className="graph-view__labels">
    {nodes.map(node => (
      <text x={node.x * zoom + panX} y={(node.y + radius + 12) * zoom + panY}>
        {label}
      </text>
    ))}
  </g>
  ```
- **Regel:** SVG-Text niemals innerhalb einer `scale()`-Transform-Gruppe rendern — immer in nativer Auflösung zeichnen

### LinkIndexService: Per-Vault-Instanz im Composition Root
- `Map<string, LinkIndexService>` im Composition Root (`linkIndexMap`)
- Neue Instanz bei Vault-Erstellung, Entfernung bei Vault-Löschung
- Lazy-Init: Wenn Graph-API aufgerufen wird und Index nicht ready → `loadFromDisk()` oder `rebuild()`
- Fire-and-forget beim Startup: `loadFromDisk()` im Hintergrund (blockiert nicht den Server-Start)
- **Regel:** Keine synchrone Initialisierung im Startup-Pfad — Index-Aufbau kann bei großen Vaults mehrere Sekunden dauern

### LinkIndexService: Hook in VaultController für inkrementelle Updates
- `vaultController.setLinkIndexHook({ onFileSaved, onFileDeleted, onFileRenamed })`
- Nur `.md`-Dateien triggern Index-Updates (Bilder, PDFs etc. werden ignoriert)
- Hook-Callbacks sind fire-and-forget (kein `await` im Save-Pfad — User wartet nicht auf Index-Update)
- **Regel:** Index-Updates dürfen die Datei-Save-Latenz nicht erhöhen

### Graph-Tab: Virtueller Pfad `__graph__`
- Tab-ID: `${vaultId}::__graph__`
- `TabContent` prüft `filePath === '__graph__'` → rendert `GraphView` statt Editor/Viewer
- Maximal ein Graph-Tab gleichzeitig (bei Klick auf Graph-Button: existierenden Tab aktivieren)
- Bei Vault-Wechsel: Graph-Tab bleibt offen, `vaultId`-Prop ändert sich → GraphView re-fetcht automatisch
- **Regel:** Spezial-Tabs mit virtuellen Pfaden immer mit `__` Prefix markieren (Kollisionsvermeidung mit echten Dateien)

### d3-force: Simulation-Referenz als useRef
- `simulationRef.current` hält die aktive Simulation
- Simulation wird bei `graphData`-Änderung neu erstellt (nicht bei jedem Render)
- `simulation.on('tick')` setzt State → Re-Render → neue Node-Positionen
- Bei Drag: `node.fx`/`node.fy` fixieren Position, `simulation.alpha(0.1).restart()` für sanftes Update
- **Regel:** d3-force-Simulation nie in einem `useEffect` mit häufig wechselnden Dependencies erstellen — nur bei Datenänderung

### Graph CSS Design Tokens
- 7 Tokens: `--graph-bg`, `--graph-node-fill`, `--graph-node-unresolved`, `--graph-edge-color`, `--graph-edge-highlight`, `--graph-label-color`, `--graph-search-highlight`
- Definiert in allen drei Blöcken: `:root`, `:root[data-theme="dark"]`, `@media (prefers-color-scheme: dark)`
- **Regel:** Neue Graph-Farben immer als Token definieren, nie inline

### Wikilink-Parser: Backend-Äquivalenz zum Frontend
- Backend `extractWikilinks()` in `backend/src/link-index/wikilink-parser.ts`
- Muss identische Targets liefern wie Frontend `extractWikilinks()` in `frontend/src/plugins/wikilink/extract.ts`
- Code-Block-Exclusion: Fenced (``` / ~~~), Indented (4 Spaces / 1 Tab), Inline (Backticks)
- Formate: `[[target]]`, `[[folder/file]]`, `[[file#heading]]`, `[[file#heading|display]]`, `[[#heading]]`
- **Regel:** Bei Änderungen am Frontend-Parser immer Backend-Parser synchron halten (Property 9 validiert Äquivalenz)

### JSON-Persistierung: Atomarer Schreibvorgang
- Link-Index wird als `_link-index.json` im Vault-Verzeichnis gespeichert
- Atomares Schreiben: temp-Datei → `rename()` (konsistent mit allen anderen Persistierungen)
- Schema: `{ version: 1, updatedAt: ISO-String, forwardLinks: Record<path, targets[]> }`
- Reverse-Map wird beim Laden aus Forward-Links berechnet (nicht persistiert)
- Bei ungültigem JSON oder Schema-Fehler → automatischer Full-Rebuild

## Entwicklungsumgebung: Dev-Server-Management

### Port-Belegung nach Prozess-Abbruch (EADDRINUSE)
- Wenn ein `tsx watch`-Prozess abrupt beendet wird (Timeout, Kill, Crash), bleiben TCP-Verbindungen im `TIME_WAIT`-Status (PID 0 unter Windows)
- Der nächste Start schlägt fehl mit `Error: listen EADDRINUSE: address already in use 127.0.0.1:3000`
- **Lösung:** 5–10 Sekunden warten bis TIME_WAIT-Verbindungen ablaufen, dann erneut starten
- **Diagnose:** `netstat -ano | findstr ":3000"` — Einträge mit PID 0 und Status WARTEND/TIME_WAIT sind harmlos und lösen sich von selbst
- **Regel:** Nach dem Stoppen eines Dev-Servers immer kurz warten bevor ein Neustart versucht wird

### Wiederverwendete Prozesse können veralteten State haben
- Wenn ein Background-Prozess "reused" wird (gleicher Befehl + Arbeitsverzeichnis), kann der angezeigte Output vom vorherigen Lauf stammen
- Fehler wie `'@hono/node-server' does not provide an export named 'getConnInfo'` können Artefakte eines alten Prozesses sein
- **Regel:** Bei unerklärlichen Import-Fehlern den Prozess explizit stoppen und neu starten (nicht wiederverwenden)
- **Verifikation:** Import direkt testen mit `node -e "import('...').then(m => console.log(Object.keys(m)))"` bevor Code geändert wird

### Node.js v24 Kompatibilität
- Projekt läuft auf Node.js v24.16.0 (Entwicklungsmaschine)
- `@hono/node-server@1.19.14` funktioniert korrekt mit Node.js v24
- Subpath-Import `@hono/node-server/conninfo` exportiert `getConnInfo` wie erwartet
- `--experimental-strip-types` ist in v24 weiterhin experimental — für Production den `tsc`-Build verwenden


## Unified File Explorer (Multi-Vault-Ansicht)

### Alle Vaults als aufklappbare Root-Einträge statt Dropdown
- Kein separates VaultList-Dropdown mehr — alle Vaults werden direkt im FileExplorer als Root-Level-Einträge angezeigt
- Jeder Vault ist ein aufklappbarer Eintrag mit Database-Icon, Name und Status-Badges (Read/Write/Sync/Shared)
- Aufklappen eines Vaults lädt den Tree lazy (nur bei Bedarf)
- Klick auf eine Datei setzt implizit `selectedVaultId` (kein expliziter Vault-Wechsel nötig)
- **Vorteil:** Benutzer sieht alle Vaults auf einen Blick, kann zwischen Vaults navigieren ohne Dropdown-Interaktion

### AppState-Erweiterung für Multi-Vault-Trees
- `vaultTrees: Record<string, DirectoryTree | null>` — pro Vault ein gecachter Tree
- `vaultTreesLoading: Set<string>` — Vault-IDs deren Tree gerade geladen wird
- `VAULT_TREE_LOADED` Action: setzt Tree für einen spezifischen Vault
- `VAULT_TREE_LOADING` Action: markiert einen Vault als "wird geladen"
- Legacy `directoryTree` bleibt bestehen für Abwärtskompatibilität (Context Panel, Graph, etc.)
- `TREE_LOADED` aktualisiert auch `vaultTrees[selectedVaultId]` für Konsistenz
- **Regel:** Neue Komponenten sollten `vaultTrees[vaultId]` nutzen, nicht das globale `directoryTree`

### Lazy-Loading der Vault-Trees
- Tree wird erst beim Aufklappen eines Vaults geladen (nicht beim App-Start)
- Wenn Tree bereits in `vaultTrees` gecacht ist, wird kein erneuter Fetch ausgelöst
- Loading-Indikator pro Vault während des Fetches
- Bei Fehler: Vault zeigt sich als leer (kein globaler Error-State)
- **Regel:** Kein Preloading aller Vault-Trees — bei vielen Vaults wäre das zu viel Traffic

### Vault-Erstellung im FileExplorer integriert
- `onRegisterCreateVault` Prop am FileExplorer (analog zu `onRegisterCreateFile`)
- Inline-Formular am unteren Rand des Explorers (Input + OK/Cancel)
- Nach Erstellung: Vault wird automatisch expanded und selected
- Validierung: Leerer Name, zu lang (>128), Duplikat — alles inline angezeigt

### expandedPaths mit Vault-Scope
- Folder-Expand-State verwendet `${vaultId}::${path}` als Key (nicht nur `path`)
- Verhindert Kollisionen wenn zwei Vaults identische Ordnernamen haben
- Vault-Expand-State (`expandedVaults: Set<string>`) ist separat von Folder-Expand-State

### Drag & Drop: Vault-Scoped
- `DragState` enthält `draggedVaultId` — Drag & Drop funktioniert nur innerhalb eines Vaults
- Cross-Vault-Drag ist nicht möglich (validTargets werden nur für den Quell-Vault berechnet)
- **Regel:** Dateien können nicht per Drag & Drop zwischen Vaults verschoben werden

### VaultList-Komponente bleibt erhalten
- `VaultList.tsx` wird nicht gelöscht — wird noch von `VaultList.test.tsx` referenziert
- Langfristig kann die Datei entfernt werden wenn die Tests migriert sind
- Import in `App.tsx` wurde entfernt — Komponente wird nicht mehr gerendert

## Backend: Interne Dateien im Tree filtern

### `_`-Prefix-Dateien werden aus dem Directory Tree ausgeschlossen
- `VaultReader.scanDirectory()` filtert Dateien deren Name mit `_` beginnt
- Betrifft: `_link-index.json` (Knowledge Graph Index)
- Nur Dateien werden gefiltert, nicht Verzeichnisse (Ordner mit `_`-Prefix bleiben sichtbar)
- `itemCount` zählt nur sichtbare Einträge (nach Filter)
- **Regel:** Interne Slatebase-Dateien im Vault-Verzeichnis immer mit `_`-Prefix benennen — sie werden automatisch aus dem Tree gefiltert
- **Betroffene Stellen:** `backend/src/vault/index.ts` → `scanDirectory()` Methode


## Embed-Typ-Erkennung: Drei Kategorien (image / pdf / note)

### detectEmbedType() unterscheidet drei Typen
- `'image'` — Bild-Extensions (`.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.webp`, `.avif`, `.bmp`)
- `'pdf'` — PDF-Extension (`.pdf`)
- `'note'` — alles andere (wird als Markdown-Notiz geladen und gerendert)
- Definiert in `frontend/src/plugins/embed/syntax.ts`
- `EmbedNode.embedType` ist ein Union-Typ: `'image' | 'pdf' | 'note'`

### PDF-Embeds werden inline als Viewer gerendert
- `![[dokument.pdf]]` in Markdown → `renderEmbedNode()` erkennt `embedType === 'pdf'`
- Rendert den exportierten `PdfViewer` aus `BinaryViewer.tsx` (Blob-Fetch + `<object type="application/pdf">`)
- Gleicher Viewer wie beim direkten Öffnen einer PDF im BinaryViewer-Tab
- CSS-Klasse: `.view-mode-embed--pdf` mit `min-height: 500px` und Flex-Layout
- **Regel:** Neue Dateitypen die inline eingebettet werden sollen, brauchen einen eigenen `embedType`-Wert + Rendering-Logik in `renderEmbedNode()` UND `renderTextWithEmbeds()`

### PdfViewer ist exportiert (nicht mehr intern)
- `PdfViewer` in `BinaryViewer.tsx` ist jetzt `export function` (vorher nur `function`)
- Wird von `ViewMode.tsx` importiert für Inline-PDF-Embeds
- Akzeptiert `{ rawSrc: string; fileName: string }` als Props
- Fetcht PDF als Blob → `URL.createObjectURL()` → `<object data={blobUrl} type="application/pdf">`
- Firefox-kompatibel: Blob mit explizitem `type: 'application/pdf'` erzwingt pdf.js-Viewer

### Zwei Stellen für Embed-Rendering beachten
- `renderEmbedNode()` — für Embed-Nodes die vom micromark-Parser als eigene MDAST-Nodes erkannt werden
- `renderTextWithEmbeds()` — Fallback-Regex für `![[...]]`-Syntax in Text-Nodes (wenn Parser sie nicht als Embed erkennt)
- **Beide** müssen bei neuen Embed-Typen aktualisiert werden
- **Regel:** Bei Änderungen an der Embed-Logik immer BEIDE Funktionen synchron halten


## Obsidian Plugin Compatibility Layer

### Architektur: Proxy-basiertes API-Shimming statt vollständiger Emulation
- ES6 `Proxy`-Objekte auf den Shim-Layern (AppShim) ermöglichen automatische Erkennung nicht-emulierter API-Zugriffe
- Proxy gibt `undefined` zurück (Properties) oder No-Op-Funktion (Methods) und loggt einmal pro Property pro Plugin eine Warnung
- **Vorteil:** Neues Plugin verwendet unbekannte API → statt Crash wird graceful degraded mit Konsolenwarnung
- **Vorteil:** Kein manuelles Pflegen einer "Null-Return-Map" für hunderte Obsidian-API-Methods nötig

### Architektur: Kein Web Worker für Sandboxing
- Obsidian-Plugins erwarten **synchronen DOM-Zugriff** (`document.createElement`, direkte DOM-Manipulation)
- Web Workers haben keinen DOM-Zugang → wäre API-inkompatibel
- Stattdessen: Proxy-basierter Sandbox mit API-Interception und Main-Thread-Blocking-Monitoring
- **Trade-off:** Weniger echte Isolation, aber volle API-Kompatibilität
- **Schutzmaßnahmen:** Vault-Isolation (kein Cross-Vault), Storage-Namespace-Prefix, Network-Allowlist, Auto-Deaktivierung bei >5s Blocking

### Architektur: Vault-scoped Plugin-Instanzen
- Jedes Plugin bekommt **pro Vault** eine eigene AppShim-Instanz
- Bei Vault-Wechsel: `onunload()` aller Plugins → Cleanup → neue Instanzen → `onload()`
- WorkspaceShim und MetadataCacheShim sind **shared** innerhalb eines Vaults (alle Plugins eines Vaults empfangen die gleichen Events)
- VaultShim ist pro Plugin (mit Vault-ID-Bindung für Isolation)

### Architektur: Emulierte API-Version als Gate
- Feste emulierte Obsidian-API-Version: `1.4.0`
- Plugins mit höherer `minAppVersion` werden als inkompatibel markiert (nicht geladen)
- Ermöglicht kontrollierte Erweiterung: neue API-Methods hinzufügen → Version hochsetzen

### Plugin-Loader: Post-FCP Loading
- Plugin-Bundles werden erst **nach First Contentful Paint** geladen (`requestIdleCallback` mit 2s timeout, `setTimeout(50)` Fallback)
- Verhindert dass Plugin-Evaluation die initiale Seitenlade-Performance beeinträchtigt
- Max 50ms FCP-Delay laut Requirement — durch asynchrones Laden nach Paint trivial eingehalten

### Plugin-Loader: onPluginInstantiated Hook
- `PluginLoaderDeps.onPluginInstantiated(pluginId, instance)` wird **nach Instanziierung, vor `onload()`** aufgerufen
- Ermöglicht Wiring von `addCommand`, `registerEvent`, etc. auf die shared Registries
- Im PluginProvider: `instance.addCommand = (command) => commandRegistry.addCommand(pluginId, command)`
- **Regel:** Neue Plugin-API-Methoden die auf shared Infrastruktur zugreifen, hier wiren

### Plugin-Installer: adm-zip für ZIP-Verarbeitung
- `adm-zip` (nicht `jszip`) im Backend — synchrone API, gut für serverseitige Einmal-Extraktion
- `jszip` bleibt ausschließlich im Frontend (Vault-Export)
- **Grund:** `adm-zip` hat bessere Node.js-Buffer-Integration und braucht kein async/await für einfache Extraktion

### Plugin-Installer: Zwei ZIP-Layouts unterstützt
- **Root-Layout:** `manifest.json` + `main.js` direkt im ZIP-Root
- **Subdirectory-Layout:** Ein einziges Unterverzeichnis enthält `manifest.json` + `main.js`
- Beide werden automatisch erkannt (Root wird zuerst geprüft)
- **Hintergrund:** Obsidian-Plugins werden oft als GitHub-Release-ZIP heruntergeladen (mit Ordner-Wrapper)

### Plugin-Installer: Version-Upgrade bewahrt data.json
- `savePlugin(vaultId, pluginId, files)` schreibt nur `manifest.json`, `main.js`, `styles.css`
- `data.json` (Plugin-Settings) wird NIE von `savePlugin` überschrieben
- **Design-Entscheidung:** Settings-Persistenz ist unabhängig vom Bundle-Upgrade

### Plugin-Installer: Bundle-Integrity-Check ist String-basiert
- Einfacher `String.includes()` Check auf `eval(`, `new Function(`, `document.write(`
- Kein AST-Parsing — bewusste Trade-off-Entscheidung:
  - False Positives möglich (z.B. `// eval(` in Kommentar) — akzeptabel als konservative Heuristik
  - False Negatives bei Obfuskation — akzeptabel da Sandbox als zweite Schutzschicht
- **Regel:** Bei Bedarf auf AST-basiertes Scanning upgraden (z.B. mit `acorn`)

### Vault Deletion Hook: Generischer Mechanismus
- `VaultController.setVaultDeletionHook({ onVaultDeleted(vaultId) })` — nicht Plugin-spezifisch
- Wird für Plugin-Cleanup UND Link-Index-Cleanup verwendet
- Fire-and-forget (`.catch()`) — Vault-Löschung wartet nicht auf Cleanup
- **Regel:** Neue Module die Vault-scoped-Daten speichern, ebenfalls in den Hook einhängen

### Event Bridge: Tab-State → Plugin-Events
- `usePluginEventBridge()` Hook sitzt **im PluginProvider** (nicht als separate Komponente)
- Erkennt Tab-Wechsel → `workspaceShim.setActiveFile(tFile)` → emittiert `file-open` + `active-leaf-change`
- Erkennt File-Save (content geändert + editBuffer===null) → `metadataCacheShim.trigger('changed', tFile, {})`
- Erkennt initiales Tree-Load → `metadataCacheShim.trigger('resolved')` (einmalig pro Vault)
- **Binary/Graph-Tabs:** Werden als `null` activeFile behandelt (Requirement 6.2)

### Command Palette: Custom Event statt direkter State-Kopplung
- `PluginProvider` dispatcht `window.dispatchEvent(new CustomEvent('slatebase:open-command-palette'))` bei Ctrl+P/Cmd+P
- `CommandPaletteContainer` hört auf dieses Event → setzt `isOpen(true)`
- **Vorteil:** Keine direkte Kopplung zwischen Provider und UI-Komponente
- **Vorteil:** Command Palette kann auch von anderen Stellen geöffnet werden (z.B. Button)

### CSS Injection: Selector-Scoping mit Prefix
- Alle CSS-Selektoren werden mit `[data-plugin-id="<pluginId>"]` prefixed
- Verhindert CSS-Leaking zwischen Plugins und in die Hauptanwendung
- Browser ignoriert ungültiges CSS automatisch — trotzdem wird eine `console.warn` ausgegeben
- Max 512 KB pro `styles.css` — darüber wird nicht injiziert

### PluginRegistry: Zwei Interfaces für zwei Schichten
- `IRegistryApiClient` — minimales Interface für Backend-Kommunikation (loadRegistry/saveRegistry)
- `PluginRegistry` — Frontend-Klasse die den In-Memory-State verwaltet und bei Änderungen persisted
- Adapter-Pattern im PluginProvider: `createRegistryApiAdapter(apiClient)` konvertiert `IApiClient` → `IRegistryApiClient`
- **Grund:** Entkopplung von der großen IApiClient-Schnittstelle — Tests brauchen nur das schmale Interface

### Frontend API Client: Plugin-Endpoints folgen bestehendem Pattern
- 10 neue Methoden auf `IApiClient` + `ApiClient` (list, upload, get, delete, bundle, styles, settings R/W, registry R/W)
- `loadBundle` und `loadStyles` geben **raw text** zurück (kein JSON-Parse) — spezielles `response.text()` Handling
- `loadStyles` gibt `null` bei 404 zurück (Plugin hat optional keine styles.css)
- `uploadPlugin` verwendet `FormData` ohne manuellen Content-Type-Header (Browser setzt Boundary)
- **Regel:** Neue Endpoints die Nicht-JSON zurückgeben → eigene fetch-Logik statt `this.request<T>()`

### Compatibility Analyzer: Statische Pattern-Erkennung
- **Multi-Layer-Ansatz** (Prioritätsreihenfolge):
  1. **Manifest-Gate:** `isDesktopOnly: true` → sofort `'unsupported'` (kein Bundle-Scan nötig)
  2. **Node.js-Modul-Erkennung:** `require('fs')`, `require('net')`, `import 'electron'`, etc. → `'unsupported'`
  3. **Obsidian-API-Pattern-Matching:** Regex auf `this.app.vault.*`, `this.app.workspace.*`, etc.
- **Schlüsselerkenntnis:** Plugins mit `isDesktopOnly: false` (oder Feld absent) laufen auf Obsidian Mobile (iOS/Android WebView) — gleiche Einschränkung wie Slatebase (kein Node.js). Das ist der stärkste Indikator für Browser-Kompatibilität.
- **Node.js-Module die erkannt werden:** fs, path, os, child_process, net, tls, http, https, crypto, stream, dgram, dns, cluster, worker_threads, vm, v8, perf_hooks, readline, zlib, buffer, electron, original-fs
- **Erkennungsmuster:** CommonJS `require('...')`, node-prefixed `require('node:...')`, ESM `import ... from '...'`, dynamic `import('...')`
- Klassifiziert jeden Obsidian-API-Zugriff als `supported`/`partial`/`unsupported`
- Berechnet Gesamt-Level: `full`/`partial`/`unsupported`/`unknown`
- Max 10 Sekunden Analyse-Zeit — bei Timeout oder Fehler → `unknown`
- **Limitation:** Obfuskierter Code → `unknown` (kein Versuch der Deobfuskation)
- **Report enthält:** `level`, `apiCalls`, `lifecycleCritical`, `nodeModules`, `isDesktopOnly`, `reasons` (menschenlesbare Begründungen)
- **Beispiele browser-kompatibler Plugins:** Calendar, Dataview, Tasks, Kanban, Excalidraw, Outliner, Style Settings
- **Beispiele NICHT-kompatibler Plugins:** Git (child_process), Shell Commands (child_process), Local REST API (net/http)

### Plugin Management UI: Optimistisches Toggle
- Toggle-Switch ändert sofort den lokalen State (optimistic update)
- Bei Backend-Fehler: Rollback auf vorherigen Zustand
- Verhindert UI-Flackern bei schnellen Klicks
- **Pattern:** Set toggling → optimistic update → API call → on error rollback → clear toggling

### Bekannte Limitierung: Kein Plugin-Hot-Reload
- Plugin-Activation startet `onload()` immer von vorn — kein HMR
- Bei Code-Änderung: Deaktivieren → Neues ZIP hochladen → Aktivieren
- **Akzeptabel:** Obsidian selbst macht es genauso (Community Plugins brauchen Restart)

### Browser-Kompatibilität: isDesktopOnly als Primärindikator
- **Erkenntnis:** `isDesktopOnly` im manifest.json ist der zuverlässigste Indikator ob ein Plugin browser-kompatibel ist
- **Logik:** Obsidian Mobile läuft in einem WebView (iOS/Android) OHNE Node.js-Zugang — exakt die gleiche Einschränkung wie Slatebase
- Plugins mit `isDesktopOnly: false` (oder Feld absent) laufen auf Mobile → laufen sehr wahrscheinlich auch in Slatebase
- Plugins mit `isDesktopOnly: true` nutzen Node.js/Electron-APIs → können nicht im Browser laufen
- **Mehrheit der populären Plugins ist mobile-kompatibel:** Calendar, Dataview, Tasks, Kanban, Excalidraw, Outliner, Style Settings, Icon Folder, Admonitions
- **Desktop-only Plugins (brauchen Node.js):** Git (child_process), Shell Commands (child_process), Local REST API (net/http), IMAP Importer (tls/net)
- **Implementierung:** CompatibilityAnalyzer prüft `isDesktopOnly` als erstes Gate (Layer 1), dann Node.js-Module (Layer 2), dann API-Patterns (Layer 3)
- **Faustregel für Nutzer:** Wenn ein Plugin auf dem Handy funktioniert, funktioniert es auch in Slatebase

### Test-Abdeckung: 371 Tests im Compat-Verzeichnis
- EventSystem, ManifestParser, VaultShim, WorkspaceShim, MetadataCacheShim, AppShim, Sandbox
- PluginLoader, PluginRegistry, SettingsManager, CommandRegistry, CSSInjector, CompatibilityAnalyzer
- PluginEventBridge (12 Tests), CommandPalette (25 Tests)
- Backend: PluginStore (24), PluginInstaller (26), PluginRoutes (50)
- **Gesamtzahl nach Implementierung:** 990 Backend + 1027 Frontend = 2017 Tests

## Obsidian Plugin Compat: Implementierungs-Fortschritt (Juni 2026)

### Fertiggestellte Komponenten (Frontend)
- **Types & Errors** — TFile, TFolder, CachedMetadata, PluginManifest, PluginRegistryEntry, alle Error-Klassen
- **EventSystem** — on/off/trigger/offref/removeAllListeners, Snapshot-Iteration, Exception-Isolation
- **ManifestParser** — Zod-Validierung, Semver-Vergleich, Round-Trip-Kompatibilität, Größenlimit
- **VaultShim** — read/modify/create/delete über IApiClient, Event-Emission, Path-Traversal-Schutz
- **WorkspaceShim** — getActiveFile, file-open/active-leaf-change Events, Proxy für Non-Emulated-Methoden
- **MetadataCacheShim** — getFileCache, getFirstLinkpathDest, resolvedLinks, changed/resolved Events
- **AppShim** — Proxy-basiert, vault/workspace/metadataCache/plugins Properties, Warning-once-per-property
- **PluginSandbox** — Vault-Isolation, Storage-Namespace, Network-Allowlist, Blocking-Detection, Resource-Cleanup
- **PluginLoader** — Blob-URL-Evaluation, onload-Timeout (10s), Deaktivierung mit Cleanup, loadAllActive
- **PluginRegistry** — Frontend-State, Backend-Persistenz, Deny-by-Default-Permissions
- **SettingsManager** — loadData/saveData mit 1MB-Limit, Circular-Ref-Erkennung, per-Plugin-per-Vault-Isolation
- **CommandRegistry** — Namespaced IDs, Case-Insensitive-Suche, Hotkey-Konflikt-Erkennung, Exception-Handling
- **CommandPalette** — Ctrl+P Modal, Keyboard-Navigation, ARIA-Accessible, max 50 Results
- **CSSInjector** — Scoped Selectors, data-plugin-id Attribut, @keyframes/@font-face unverändert, 512KB-Limit
- **CompatibilityAnalyzer** — Multi-Layer-Analyse: isDesktopOnly-Gate, Node.js-Modul-Erkennung (fs/net/electron/etc.), Regex-basierte API-Erkennung, Klassifizierung, Timeout-Schutz, menschenlesbare Reasons

### Fertiggestellte Komponenten (Backend)
- **PluginStore** — Filesystem-Persistenz, atomare Writes, per-Vault-per-Plugin-Verzeichnisse
- **Error-Klassen** — PluginNotFoundError, PluginFileTooLargeError, PluginSettingsTooLargeError
- **Validation** — Zod-Schemas für Manifest, Settings, Registry, Upload-Constraints

### Noch offene Tasks
- Backend Plugin API Routes (CRUD + Upload)
- ZIP Upload Processing (Extraktion, Integrity-Check, Version-Upgrade)
- Composition-Root-Integration (PluginStore + Routes registrieren)
- Frontend IApiClient Extension (Plugin-Endpoints hinzufügen)
- Plugin Management UI (Verwaltungsseite + Upload)
- PluginProvider + App-Wiring (Context, Keyboard-Shortcuts, Event-Bridge)

### Architektur-Entscheidungen im Plugin Compat Layer
- **ES6 Proxy für API Shimming** — statt manueller Methoden-Implementierung. Proxy fängt alle Zugriffe ab, erlaubt automatische Detection nicht-emulierter APIs, einmaliges Warning pro Property
- **Kein Web Worker für Sandboxing** — Obsidian-Plugins erwarten synchronen DOM-Zugriff, Web Workers haben keinen DOM-Zugang. Stattdessen Proxy-basierter Ansatz mit API-Interception
- **Blob URL + dynamic import() für Bundle-Evaluation** — Browser-kompatibel, ermöglicht ES-Module-Syntax in Plugins, mit injectable BundleEvaluator für Tests
- **Emulierte Version: 1.4.0** — Fixe API-Version, Plugins mit höherer minAppVersion werden als inkompatibel markiert
- **Vault-scoped Plugin-Instanzen** — Jedes Plugin bekommt pro Vault eine eigene AppShim-Instanz. Bei Vault-Wechsel: onunload → onload mit neuem Kontext
- **CSS Scoping via Attribut-Selektor** — `[data-plugin-id="<id>"]` Prefix auf allen Selektoren, keine Shadow-DOM-Isolation (wäre zu restriktiv für bestehende Plugins)
- **Zod für Backend UND Frontend Manifest-Validierung** — Gleiche Schema-Definition, konsistente Fehlermeldungen


## Search & Discovery

### SearchService: Lineare Datei-Iteration reicht für Phase 1
- Kein Index/Datenbank nötig bei ≤1000 Dateien pro Vault
- Dateien alphabetisch sortiert, max 1000 gesucht, Rest wird als `truncated` gemeldet
- Per-File-Regex-Timeout (5s) schützt vor ReDoS-artigen Patterns
- Globaler Timeout (30s) begrenzt die Gesamtdauer
- **Wann upgraden:** Erst bei Vaults mit >10.000 Dateien oder wenn Suchzeiten regelmäßig >5s werden → SQLite FTS5

### Context-Lines-Merging bei nahen Treffern
- Wenn zwei Treffer weniger als `2 * contextLines + 1` Zeilen auseinander liegen, werden ihre Kontextblöcke zusammengeführt
- Verhindert doppelte Zeilen in der Ergebnisanzeige
- Implementierung: Treffer werden in "Blöcke" gruppiert, innerhalb jedes Blocks wird der Kontext individuell berechnet mit Midpoint-Logik zwischen aufeinanderfolgenden Treffern

### Multi-Vault-Suche: Shared Budget statt separater Limits
- Globales Dateilimit (1000) und Zeitlimit (30s) gelten über ALLE Vaults hinweg
- Nicht pro Vault — sonst könnte die Suche bei 20 Vaults theoretisch 20*30s = 10 Minuten dauern
- Partial Success: Wenn ein Vault fehlschlägt, werden Ergebnisse der erfolgreichen Vaults trotzdem zurückgegeben
- `failedVaults` Array enthält ID, Name und Fehlergrund für jede gescheiterte Vault

### ReplaceService: 100-Dateien-Limit und partielle Fehlerbehandlung
- Max 100 Dateien pro Replace-Operation (verhindert versehentliche Massenänderungen)
- Sequentielle Verarbeitung — keine Parallelisierung (Race Conditions vermeiden)
- Partial Failure: Erfolgreich ersetzte Dateien bleiben, fehlgeschlagene werden in `failed[]` gemeldet
- Kein Rollback — das ist bewusst (Atomarität nur pro Datei, nicht über die gesamte Operation)

### SearchPanel: Debounce + AbortController zusammen verwenden
- 300ms Debounce auf der Eingabe: verhindert Spam-Requests beim Tippen
- AbortController: bricht den vorherigen Request ab wenn ein neuer kommt
- Zusammen verhindern sie Race Conditions bei schnellem Tippen (alter Response überschreibt neueren)
- **Regel:** Bei debounced API-Calls IMMER auch AbortController verwenden

### SearchProvider-State überlebt Panel-Öffnen/Schließen
- `SearchProvider` wraps the entire AppContent → State bleibt beim Schließen/Öffnen des Panels erhalten
- Requirement 8.4: "Letzten Query und Optionen beibehalten"
- Kein localStorage nötig — Provider-Lifetime = App-Lifetime

### Design Tokens für Search-spezifische Farben
- 5 neue Tokens: `--search-match-bg`, `--search-match-text`, `--search-active-bg`, `--search-file-header-bg`, `--search-hit-hover-bg`
- Definiert in allen 3 Blöcken: `:root`, `:root[data-theme="dark"]`, `@media (prefers-color-scheme: dark)`
- Match-Highlighting: Gelb/Amber im Light Mode, dunkles Gold im Dark Mode
- **Regel:** Neue Feature-spezifische Farben als Token-Gruppe mit Feature-Prefix definieren

### Ctrl+Shift+F: Browser-Default verhindern
- Einige Browser öffnen bei Ctrl+Shift+F ein eigenes Such-Fenster
- `e.preventDefault()` im Keydown-Handler verhindert das
- macOS: `Cmd+Shift+F` gleichberechtigt zu `Ctrl+Shift+F` prüfen (`e.metaKey || e.ctrlKey`)
