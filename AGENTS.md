# AGENTS.md — Slatebase

Anweisungen für KI-Assistenten, die an diesem Projekt arbeiten.

## Projektüberblick

Slatebase ist ein self-hosted Knowledge-Context-Server für Markdown-Vaults. Monorepo mit zwei unabhängigen Packages: `backend/` (Node.js/Hono REST API) und `frontend/` (React/Vite SPA). Kein Shared-Workspace-Tooling — jedes Package hat eigene `package.json` und `node_modules`.

## Sprache

- **Code, Kommentare, Identifier, JSDoc:** Englisch
- **UI-Labels:** Deutsch
- **Requirements, Specs, Dokumentation:** Deutsch

## Architektur

### Backend (Layered, Interface-Driven)

```
Config → Logger → Vault (Data Access) → Business → API (Controller)
```

- Jede Schicht exponiert ein `I*`-Interface
- Composition Root in `src/index.ts` — manuelle DI, kein Container
- Custom Error-Klassen pro Schicht, gemappt auf HTTP-Status im Controller
- ESM mit `.js`-Extensions bei allen relativen Imports

### Frontend (React + useReducer)

- Separate Reducer für separate Concerns (`appReducer`, `tabReducer`)
- Action Creators sind standalone async Funktionen (keine Hooks)
- `IApiClient`-Interface mit Fetch-Implementierung
- Relative URLs — Vite Proxy leitet `/api` an Backend weiter

## Konventionen

### Naming

| Kategorie | Pattern | Beispiel |
|-----------|---------|----------|
| Interface | `I`-Prefix | `IVaultReader`, `ILogger` |
| Error-Klasse | `Error`-Suffix | `VaultNotFoundError` |
| Factory | `create`-Prefix | `createLogger()`, `createRouter()` |
| Mock-Factory | `createMock`-Prefix | `createMockVaultManager()` |
| Action-Type | SCREAMING_SNAKE_CASE | `'VAULTS_LOADED'` |

### Imports & Exports

- **Backend:** `.js`-Extension bei relativen Imports (Node.js ESM Requirement)
- **Frontend:** Keine Extension (Vite löst auf)
- Barrel-Exports via `index.ts` pro Modul
- Keine Default-Exports — immer Named Exports

### Error Handling

- Backend: Domain-Errors → `instanceof`-Check im Controller → HTTP-Status
- API-Error-Format: `{ code: string, message: string, timestamp: string }`
- Frontend: API-Client wirft `{ code, message }`, normalisiert via `toAppError()`
- Graceful Degradation: Fehler loggen und überspringen statt crashen

## Testing

- **Framework:** Vitest (beide Packages)
- **Co-located:** `*.test.ts` neben Source-Datei
- **Backend-Mocks:** Hand-geschriebene Factories (`createMockLogger()`, etc.) — keine Mocking-Library
- **Frontend-Mocks:** `vi.fn()` für API-Client-Methoden
- **Integration Tests:** Echtes Filesystem mit Temp-Directories, Cleanup in `afterAll`
- **Kommandos:** `npm run test` (einmalig), `npm run test:watch` (Watch-Mode)

## Wichtige Regeln

1. **Immer Interface zuerst** — dann Implementierung
2. **Keine HTTP-Concerns** in Business- oder Vault-Layer
3. **`validateFilePath()`** vor jedem Zugriff auf Vault-Dateien (Path Traversal Protection)
4. **Atomare Writes** — Temp-Datei schreiben, dann `rename()` zum Ziel
5. **Kein DI-Framework** einführen — manuelle Verdrahtung ist bewusst gewählt
6. **Kein externer State-Manager** — useReducer + Context reicht
7. **TypeScript strict** mit `noUncheckedIndexedAccess` und `exactOptionalPropertyTypes`

## Häufige Stolperfallen

- `.js`-Extension vergessen bei Backend-Imports → Runtime-Error
- `noUncheckedIndexedAccess` → Array/Object-Zugriffe brauchen Null-Checks
- `exactOptionalPropertyTypes` → `undefined` explizit zuweisen bei optionalen Props
- Vite Proxy → Backend muss auf Port 3000 laufen für Frontend-Dev
- Vault-IDs sind deterministische SHA-256-Hashes (erste 12 Hex-Zeichen), nicht zufällig

## Kommandos

### Backend (`cd backend`)

```bash
npm run dev          # Dev-Server mit Hot Reload (tsx watch)
npm run start        # Produktion (Node.js native TS stripping)
npm run test         # Tests einmalig
npm run test:watch   # Tests im Watch-Mode
```

### Frontend (`cd frontend`)

```bash
npm run dev          # Vite Dev-Server (Port 5173)
npm run build        # Type-Check + Production Build
npm run test         # Unit Tests einmalig
npm run test:e2e     # Playwright E2E Tests
npm run lint         # ESLint
```

## API Routes

Alle unter `/api/v1`:

| Method | Path | Zweck |
|--------|------|-------|
| GET | /vaults | Alle Vaults auflisten |
| POST | /vaults | Neuen Vault erstellen |
| DELETE | /vaults/:vaultId | Vault löschen |
| GET | /vaults/:vaultId/tree | Verzeichnisbaum |
| GET | /vaults/:vaultId/files?path= | Dateiinhalt lesen |
| PUT | /vaults/:vaultId/files | Datei speichern |
| POST | /vaults/:vaultId/import/file | Einzelne Datei importieren |
| POST | /vaults/:vaultId/import/folder | Ordner importieren |
| DELETE | /vaults/:vaultId/content?path= | Datei/Ordner löschen |

## Datenspeicherung

- Filesystem-basiert, keine Datenbank
- Vault-Daten: `backend/data/vaults/<vaultId>/`
- Vault-Registry: `backend/data/vaults.json`
- Config: `backend/config/default.json` + `SLATEBASE_*` Env-Vars
