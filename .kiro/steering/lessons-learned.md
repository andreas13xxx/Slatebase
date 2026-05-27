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
- **Nicht** alles in einen Mega-Reducer packen — lieber neue Provider/Reducer für neue Feature-Bereiche

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
