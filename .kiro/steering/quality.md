# Slatebase — Qualität & Sicherheit

Code-Review-Checkliste und Sicherheitsregeln in einem Dokument.

## Bugfix-Workflow

Bei gemeldeten Problemen/Bugs:
1. **Erst analysieren** — Root Cause identifizieren, betroffene Stellen zeigen
2. **Lösungsvorschlag präsentieren** — beschreiben was geändert wird und warum
3. **Auf Bestätigung warten** — erst nach explizitem OK die Dateien ändern

Keine Dateien modifizieren bevor der Nutzer den Fix bestätigt hat.

## Vor-Push-Pflicht

Vor jedem `git push` MÜSSEN folgende Checks bestehen:
1. **Backend**: `npx tsc --noEmit` — keine TypeScript-Fehler
2. **Frontend**: `npm run build` (`tsc -b && vite build`) — keine TypeScript-Fehler
3. **Backend Tests**: `npm run test:coverage` — alle grün, Coverage-Schwellen gehalten
4. **Frontend Tests**: `npm run test:coverage` — alle grün, Coverage-Schwellen gehalten
5. **Frontend Lint**: `npx eslint . --quiet` — **0 Errors** (Warnings sind OK)

Wenn ein Check fehlschlägt: **erst fixen, dann pushen**. Kein `--no-verify` ohne vorherige Behebung aller Errors.

### Coverage-Schwellen

CI fährt `test:coverage` (nicht `test`) — ein Unterschreiten der Schwellen bricht den Build wie ein roter Test. Die Werte in `backend/vitest.config.ts` bzw. `frontend/vite.config.ts` sind eine **Regressions-Baseline** (gemessener Stand vom 2026-08-07 minus kleiner Puffer), kein Zielwert.

- Schwellen nach oben nachziehen, wenn Coverage steigt. **Nie senken**, um einen Push durchzubekommen — dann fehlen Tests.
- `include` explizit auf `src/**` lassen: v8 scannt sonst „all files" und zieht Backend-`data/` (installierte Plugin-Bundles) bzw. Frontend-`scripts/` mit rein, die im CI-Checkout gar nicht existieren.

---

## Code-Review Checkliste

### Funktionalität
- [ ] Feature entspricht Requirements/Design
- [ ] Error-Pfade abgedeckt (nicht nur Happy Path)
- [ ] Edge Cases (leere Listen, max. Längen, ungültige Eingaben)

### TypeScript
- [ ] Keine `any`-Types
- [ ] `noUncheckedIndexedAccess` beachtet (Null-Checks)
- [ ] `exactOptionalPropertyTypes` beachtet
- [ ] Kompiliert fehlerfrei (`npm run build` Frontend, `npx tsc --noEmit` Backend)

### Code-Qualität
- [ ] JSDoc auf öffentlichen Methoden/Interfaces
- [ ] Keine auskommentierten Blöcke, kein `console.log`
- [ ] Naming-Konventionen (I-Prefix, Error-Suffix, etc.)
- [ ] Keine Default-Exports
- [ ] Error-Handling in catch-Blöcken: `extractErrorMessage(err, fallback)` aus `utils/error.ts` — kein inline `err as { message }`
- [ ] Keine Inline-Styles (`CSSProperties`-Objekte) — CSS-Klassen mit Design Tokens
- [ ] Keine hartcodierten deutschen Strings — `t('section.key')` verwenden

### Tests
- [ ] Unit Tests vorhanden (Success + Error)
- [ ] Alle Tests grün
- [ ] Mocks: `createMock*`-Pattern

### Integration
- [ ] Backend: `.js`-Extension, Barrel-Export aktualisiert
- [ ] API-Error-Format: `{ code, message, timestamp }`
- [ ] Frontend: `IApiClient` erweitert falls neuer Endpoint
- [ ] Neue i18n-Keys in `de.ts` UND `en.ts` ergänzt (Struktur muss identisch sein)
- [ ] Frontend: `IApiClient` erweitert falls neuer Endpoint

### CSS
- [ ] Tokens existieren in `index.css` (nie hartcodierte Farben)
- [ ] Dark Mode in `:root[data-theme="dark"]` UND `@media (prefers-color-scheme: dark)`
- [ ] `appearance: none` + `disabled` → `opacity: 1`
- [ ] Kein `overflow: hidden` auf Containern mit absolut positionierten Kindern

---

## Sicherheitsregeln

### Path Traversal
- `validateFilePath()` vor JEDEM Vault-Dateizugriff
- Neue Endpoints mit Pfaden: Path-Traversal-Test zuerst
- Blockiert: Null-Bytes, absolute Pfade, `..`-Sequenzen

### Input-Validierung
- Zod im Controller-Layer, BEVOR Business-Logik aufgerufen wird
- Zwei Schichten: Zod (Controller) + Business-Validierung
- Max-Längen definieren (Vault-Name: 128, Pfade: sinnvoll)

### Secrets & Credentials
- Keine Secrets in Logs (Pino: sensible Felder exclude)
- Keine Secrets in API-Responses
- `.env` nie committen
- Env-Vars: `SLATEBASE_`-Prefix

### Auth & Sessions
- Opake Tokens: `crypto.randomBytes(64).toString('hex')` (128 Zeichen)
- CSRF: `crypto.randomBytes(32).toString('hex')`, `X-CSRF-Token`-Header bei POST/PUT/DELETE
- Session: 24h Gültigkeit, sliding expiry
- Rate-Limiting: In-Memory Map, Composite Key `username:ip` (verhindert Account-Lockout), Reset bei Neustart OK
- Login-Fehler: Identische Antwort (kein Username/Passwort-Unterschied)
- Passwort-Hashing: argon2id
- SSE-Auth: Einmal-Ticket (`POST /auth/sse-ticket`, 30s TTL) statt Session-Token in URL. `SseTicketStore` in-memory, max 5 pro User.
- Request-ID: `X-Request-Id` Header auf jeder Response (reuse incoming oder UUIDv4). Im Error-Log mitloggen.
- Passwort-Änderung (`PUT /users/me/password`): rate-limited pro userId (5/15min, `SlidingWindowRateLimiter`) — eine gekaperte/CSRF-erzwungene Session könnte sonst das aktuelle Passwort unbegrenzt brute-forcen.
- Jeder neue state-changing Endpoint, der nur durch eine gültige Session geschützt ist (kein zusätzliches Secret wie CSRF-Token oder MFA), braucht ein eigenes Rate-Limit — Session-Diebstahl/CSRF-Bypass ist die Bedrohung, nicht nur der ursprüngliche Login.

### Security-Header
- `hono/secure-headers` global aktiv (CSP `object-src`/`frame-ancestors: 'none'`, `X-Content-Type-Options: nosniff`, `X-Frame-Options`, `Referrer-Policy`, HSTS, entfernt `X-Powered-By`).
- `crossOriginResourcePolicy` bewusst deaktiviert: Frontend und Backend laufen laut `allowedOrigins`-Konfiguration auf unterschiedlichen Origins — `same-origin` CORP würde `<img src>`-Ladevorgänge von Vault-Dateien (raw-file-Endpoint) blockieren.
- Rohes SVG/HTML (`raw=true`-Dateiendpoint) niemals mit `Content-Disposition: inline` ausliefern — beide können `<script>` enthalten und werden bei direkter Navigation (geteilter Link, neuer Tab) ausgeführt. `attachment` erzwingt Download statt Rendern; `<img>`-Einbettung im Frontend bleibt unbetroffen (Disposition wirkt nur bei Top-Level-Navigation).

### MCP-Tokens
- SHA-256-Hash gespeichert, Klartext nur bei Erstellung
- In-Memory-Index für O(1) Validierung
- Max 10 Tokens pro User, Rate-Limit 60 req/min (Requests pro Token, `McpRateLimiter`)
- Token-*Erstellung* separat rate-limited (10/15min pro User, `SlidingWindowRateLimiter`) — sonst nur durch das 10-Token-Limit begrenzt, das ein Create/Revoke-Loop umgehen kann
- Auto-Invalidierung bei User-Löschung/Sperrung
- Write-Tools prüfen `checkWriteAccess()`

### Filesystem
- Atomare Writes: Temp → `rename()` — Standard-Implementierung in `shared/json-file-store.ts` (`writeJsonFileAtomic`, `JsonFileStore`, `KeyedJsonFileStore`) nutzen statt neu zu implementieren
- Read-Modify-Write über mehrere Requests hinweg IMMER durch `AsyncMutex`/`KeyedMutex` serialisieren (`shared/async-mutex.ts`) — sonst Lost-Update oder Out-of-Order-Rename bei zwei nahezu gleichzeitigen Schreibern. Bei Requests, die mehr als eine Datei anfassen (z.B. Filesystem-Move + Index-Update), den Lock um die GESAMTE Operation legen, nicht nur um den Index-Write (siehe `TrashService` — sonst kann ein periodischer Cleanup-Job ein Verzeichnis löschen, aus dem gerade parallel restored wird)
- Kein `eval()` mit User-Input
- File-Size-Limits vor vollständigem Lesen
- Symlinks nicht folgen

### Untrusted Content Rendering (XSS)
- `dangerouslySetInnerHTML` nur mit einer der beiden Garantien: (a) Bibliothek mit eingebautem Escaping (`highlight.js`-Output, Mermaid mit `securityLevel: 'strict'`), oder (b) explizites Sanitizing durch uns.
- Content aus externen/Dritt-Quellen (Plugin-READMEs von GitHub, Community-Plugin-Metadaten, o.ä.) gilt als nicht vertrauenswürdig — auch wenn kein direkter User-Input.
- Eigenes Sanitizing MUSS: Text-Escaping (`&`/`<`/`>`) UND Attribut-Quote-Escaping (`"`/`'`) UND URL-Schema-Allowlist (http/https/mailto, alles andere → `#`) — reines Text-Escaping lässt `javascript:`-URIs und Attribut-Breakout durch. Whitespace/Steuerzeichen vor der Schema-Prüfung entfernen (`java<TAB>script:`-Bypass).
- Roh-HTML aus Markdown (` ```html ` o.ä.) grundsätzlich als Text rendern, nicht als HTML.

### CORS & Errors
- Explizite `allowedOrigins` — nie `*`
- Interne Details (Stack Traces) nie an Client
- Generische 500er-Messages, Details nur in Server-Log

### Audit-Logging
- Append-Only JSONL (`data/audit/YYYY-MM-DD.jsonl`)
- Pflichtfelder: Timestamp (ISO 8601), userId, action, target, IP, success/failure
- Keine sensiblen Daten in Einträgen

### Plugin-Compat-Shims (Fehlerbehandlung)
- **Keine Silent Failures**: No-Op-Stubs MÜSSEN entweder die API korrekt implementieren oder einen sichtbaren Fehler erzeugen (console.warn bei Funktionsaufruf, Error im Modal bei onOpen-Crash). Niemals still `undefined` zurückgeben.
- **Modal.onOpen() in try/catch**: Fehler werden direkt im Modal-Content angezeigt — kein Auto-Close leerer Modals (versteckt Root Cause).
- **Fehlermeldungen mit Detail**: `extractErrorMessage(err, fallback)` für aussagekräftige Fehlertexte bei Plugin-Reload, Settings-Rendering etc.
- **DOM-Extensions synchron**: Alle Obsidian DOM-Prototype-Patches (`addClass`, `appendText`, `createEl` etc.) MÜSSEN synchron in `setting-tab.ts` registriert werden (vor Plugin-Bundle-Evaluation), nicht async per dynamic import.
- **Icon-Registry synchron**: `addIcon()`/`getIcon()` und `window.__obsidianCustomIcons` MÜSSEN vor `onload()` verfügbar sein.
- **Keine leeren DOM-Stubs für Einhängepunkte**: Ein detachtes `document.createElement('div')` als `containerEl` ist für Plugins nicht von „nichts gefunden" unterscheidbar — sie suchen darin per `querySelector()` und geben still auf. Entweder echtes, eingehängtes DOM liefern (siehe `getActiveEditorContainerEl()`) oder den Fall sichtbar machen.
- **Rückgabewerte der echten API nachbauen**: `addCommand()` gibt in Obsidian das `Command` zurück, `executeCommandById()` ein `boolean`. Plugins stashen/prüfen diese Werte; ein `void`/`undefined` crasht erst viel später und weit weg von der Ursache. Gilt auch für Guard-Pfade (z.B. Vault-Wechsel): Form der Rückgabe beibehalten statt früh leer zu returnen.
- **Container-Objekte müssen existieren, auch wenn leer**: Plugins indizieren direkt (`hotkeyManager.customKeys[id]`) statt vorher zu prüfen. Ein fehlendes Feld ist ein `undefined[id]`-TypeError; `{}` ist ein sauberer Miss.
