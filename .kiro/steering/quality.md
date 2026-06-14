# Slatebase — Qualität & Sicherheit

Code-Review-Checkliste und Sicherheitsregeln in einem Dokument.

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

### Tests
- [ ] Unit Tests vorhanden (Success + Error)
- [ ] Alle Tests grün
- [ ] Mocks: `createMock*`-Pattern

### Integration
- [ ] Backend: `.js`-Extension, Barrel-Export aktualisiert
- [ ] API-Error-Format: `{ code, message, timestamp }`
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
- Rate-Limiting: In-Memory Map, Reset bei Neustart OK
- Login-Fehler: Identische Antwort (kein Username/Passwort-Unterschied)
- Passwort-Hashing: argon2id

### Sync-Credentials
- AES-256-GCM verschlüsselt (`SLATEBASE_SYNC_SECRET`, min 32 Zeichen)
- Passwort in Responses immer maskiert
- Nur Vault-Besitzer konfiguriert Sync (kein Admin-Bypass)

### MCP-Tokens
- SHA-256-Hash gespeichert, Klartext nur bei Erstellung
- In-Memory-Index für O(1) Validierung
- Max 10 Tokens pro User, Rate-Limit 60 req/min
- Auto-Invalidierung bei User-Löschung/Sperrung
- Write-Tools prüfen `checkWriteAccess()`

### Filesystem
- Atomare Writes: Temp → `rename()`
- Kein `eval()` mit User-Input
- File-Size-Limits vor vollständigem Lesen
- Symlinks nicht folgen

### CORS & Errors
- Explizite `allowedOrigins` — nie `*`
- Interne Details (Stack Traces) nie an Client
- Generische 500er-Messages, Details nur in Server-Log

### Audit-Logging
- Append-Only JSONL (`data/audit/YYYY-MM-DD.jsonl`)
- Pflichtfelder: Timestamp (ISO 8601), userId, action, target, IP, success/failure
- Keine sensiblen Daten in Einträgen
