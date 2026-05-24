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

### Dark Mode: CSS-Variablen konsequent nutzen
- `index.css` definiert CSS Custom Properties mit `@media (prefers-color-scheme: dark)` Override
- `App.css` verwendet aktuell noch hartcodierte Farbwerte — Dark-Mode-Anpassungen als separater `@media`-Block am Ende der Datei
- **Regel für neue Styles:** Bevorzugt CSS-Variablen aus `index.css` verwenden (`var(--text)`, `var(--bg)`, `var(--border)`, etc.)
- Falls komponentenspezifische Farben nötig: Dark-Mode-Override im `@media (prefers-color-scheme: dark)`-Block in `App.css` ergänzen
- Farbpalette Dark Mode: Hintergründe `#16171d` / `#1a1b22` / `#1f2028` / `#2a2b36`, Text `#e5e7eb` / `#f3f4f6`, Akzent `#a78bfa`

## Häufige Stolperfallen

1. **`.js`-Extension vergessen** bei Backend-Imports → Runtime-Error unter Node.js ESM
2. **`noUncheckedIndexedAccess`** ist aktiv → Array/Object-Zugriffe brauchen Null-Checks
3. **`exactOptionalPropertyTypes`** ist aktiv → `undefined` muss explizit zugewiesen werden bei optionalen Properties
4. **Top-Level `await`** im Composition Root → funktioniert nur mit ESM
5. **Vite Proxy** leitet `/api` an `localhost:3000` weiter → Backend muss laufen für Frontend-Dev
6. **React.createElement** statt JSX in State/Context-Dateien (kein JSX-Transform dort)
7. **Vault-IDs** sind SHA-256-Hashes (erste 12 Hex-Zeichen) des normalisierten Pfads — deterministisch, nicht zufällig

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
- **Workaround:** `git config --global --unset http.proxy` → Push → Proxy wieder setzen
- **Langfristig:** Proxy nur für bestimmte Hosts konfigurieren oder sicherstellen dass er immer läuft

### Gitignore-Pflege bei neuen Tools
- `.kiro/settings/` (lokale MCP-Config) muss in `.gitignore` stehen — ist maschinenspezifisch
- `.kiro/specs/` und `.kiro/steering/` gehören ins Repo (Projekt-Dokumentation)
- Root-Level-Screenshots (`/*.png`, `/*.jpg`) ausschließen — entstehen durch Playwright-MCP und Debug-Sessions
- **Regel:** Bei Einführung neuer Tools/Workflows prüfen ob `.gitignore`-Einträge fehlen

## Frontend UX-Patterns

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
