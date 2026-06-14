# Slatebase — Lessons Learned & Konventionen

Kompakte Referenz aus der bisherigen Entwicklung. Regeln und Stolperfallen für alle Sessions.

## Architektur-Regeln

- **Interface-First:** Immer `I*`-Interface definieren, dann implementieren. Ermöglicht Mocking ohne Library.
- **Manuelle DI:** Composition Root in `src/index.ts`. Kein DI-Framework.
- **Separate Reducer:** Pro Feature-Bereich ein eigener Provider/Reducer (app, tab, auth, chat, sync, search, realtime, contextPanel, feature). Keinen Mega-Reducer bauen.
- **Filesystem statt DB:** Bewusste Entscheidung. Interface-Abstraktion hält Tür für DB offen. Keine Migration ohne messbaren Engpass.
- **SQLite als Index (geplant):** `better-sqlite3`, `data/vaults/<vaultId>/_index.sqlite`, regenerierbar aus Dateien. Erst bei >10k Dateien oder Graph-Queries >3s.
- **Atomare Writes:** Temp-Datei → `rename()`. Pattern: `<target>.${crypto.randomBytes(8).toString('hex')}.tmp`
- **Module-Level Bridge Pattern:** Wenn Provider A über Provider B sitzt und Events durchreichen muss → `Set<Callback>` auf Modul-Ebene mit `onX()` zum Subscriben und `dispatchX()` zum Publizieren. Genutzt für: Chat-Bridge, Vault-Change-Bridge.

## Code-Konventionen

- **Backend-Imports:** `.js`-Extension bei relativen Imports (ESM)
- **Frontend-Imports:** Keine Extension (Vite löst auf)
- **Barrel-Exports:** `index.ts` pro Modul, keine Default-Exports
- **Naming:** `I`-Prefix (Interfaces), `Error`-Suffix (Fehler), `create`-Prefix (Factories), `createMock`-Prefix (Test-Mocks), `SCREAMING_SNAKE_CASE` (Actions)
- **Sprache:** Code/JSDoc = Englisch, UI-Labels = Deutsch, Specs/Docs = Deutsch
- **API-Errors:** `{ code: string, message: string, timestamp: string }`
- **Action Creators:** Standalone async Funktionen (kein Hook), nehmen `dispatch` + `apiClient`
- **Validierung:** Backend hat ZWEI Schichten (Zod im Controller + Business-Methode). Bei Änderungen IMMER beide prüfen.

## TypeScript Strict-Mode

- `noUncheckedIndexedAccess` → Array/Object-Zugriffe brauchen Null-Checks
- `exactOptionalPropertyTypes` → `undefined` muss explizit zugewiesen werden
- Kein `as any` — stattdessen `as unknown as T` oder Generics
- `test-setup.ts` in `tsconfig.app.json` exclude aufnehmen (matcht nicht auf `*.test.ts`)

## Frontend State & Provider-Hierarchie

```
AuthProvider → I18nBridge → FeatureProvider → RealtimeBridge → AppProvider → SearchProvider → TabProvider → ContextPanelProvider → AppContent
```

- `RealtimeBridge` hat keinen Zugriff auf App/Tab-State → Module-Level-Bridges nutzen
- `vaultTrees: Record<string, DirectoryTree | null>` für Multi-Vault (neu). Legacy `directoryTree` nur für Abwärtskompatibilität.
- Expanded-Paths mit Vault-Scope: `${vaultId}::${path}`
- Tab-State bei Vault-Wechsel aufräumen (`CLEAR_ALL_TABS`)
- `useTranslation()` gibt Fallback-Deutsch zurück ohne Provider (Tests brauchen keinen Wrapper)

## CSS & Styling

- **Design Tokens in `index.css`:** Nie hartcodierte Farben in Komponenten-CSS
- **Dark Mode:** Tokens in `:root`, `:root[data-theme="dark"]` UND `@media (prefers-color-scheme: dark)` definieren
- **`appearance: none` + `disabled`:** Immer `opacity: 1` explizit setzen
- **`overflow: hidden` Containers:** Schneiden absolut positionierte Kinder ab. Dropdowns mit `position: fixed` + JS-Positionierung lösen.
- **`--bg-primary` existiert nicht.** Korrekt: `--bg-base`, `--bg-surface`, `--bg-elevated`
- **Feature-Farben:** Als Token-Gruppe mit Feature-Prefix (z.B. `--search-match-bg`, `--graph-node-fill`)
- **Broken Links:** Nie `line-through` (sieht aus wie Strikethrough). Immer `underline dashed`.
- **SVG-Text:** Nie innerhalb `scale()`-Transform — in nativer Auflösung rendern

## Realtime (SSE)

- **Event-Typen:** `chat:message`, `chat:unread`, `presence:update`, `presence:init`, `vault:change`, `sync:conflict`, `notification:toast`, `server:shutdown`, `server:feature-disabled`
- **Vault-Change-Handler:** Tree nur refreshen wenn bereits geladen (`vaultTrees[id] !== undefined`). Tab-Content nur reloaden wenn `editBuffer === null`. Bei `deleted` → Tab schließen.
- **Reconnect:** Exponential Backoff (1s→60s, Faktor 2, ±500ms Jitter). Nach 5 Fehlern → Fallback auf Polling. Last-Event-ID Replay bei Reconnect.
- **Neue SSE-Events die State ändern:** Neuen Bridge in `state/realtime*Bridge.ts` erstellen

## Obsidian Markdown Plugins

- **Pattern:** `syntax.ts` (micromark Tokenizer) → `mdast-util.ts` (fromMarkdown/toMarkdown) → `plugin.ts` (remark Wrapper)
- **Callouts:** Transformer-Pattern (kein neuer Token, transformiert bestehende `blockquote`-Nodes)
- **`this.buffer()` in mdast-util:** Vergiftet den Stack. Nur verwenden wenn `resume()` gebraucht wird. Sonst `sliceSerialize()`.
- **`Effects`-Typ:** Direkt importieren, nicht `Parameters<Tokenizer>[1]` (zählt `this` nicht mit)
- **Embeds:** Drei Typen (`image`/`pdf`/`note`). Pipe-Separator für Größe. Beide Render-Pfade (`renderEmbedNode` + `renderTextWithEmbeds`) synchron halten.
- **`extractPlainText()`:** Bei neuen Inline-Node-Typen erweitern (für Heading-Anchor-Generierung)
- **Transitive Dependencies:** `micromark`, `mdast-util-from-markdown`, `unist-util-visit` direkt nutzbar ohne Installation

## Obsidian Plugin Compat

- **Proxy-basiertes Shimming:** Kein Web Worker (braucht DOM-Zugang). Proxy gibt `undefined`/No-Op zurück für nicht-emulierte APIs.
- **Vault-scoped Instanzen:** Pro Plugin pro Vault eine AppShim. Bei Vault-Wechsel: `onunload()` → neue Instanzen → `onload()`.
- **Emulierte Version:** `1.4.0`. Plugins mit höherer `minAppVersion` → inkompatibel.
- **Post-FCP Loading:** Bundles erst nach First Contentful Paint laden (`requestIdleCallback`/`setTimeout(50)`)
- **ZIP-Layouts:** Root-Layout UND Subdirectory-Layout unterstützt (automatische Erkennung)
- **Settings bewahren:** `savePlugin()` überschreibt nie `data.json`. Version-Upgrade-sicher.
- **isDesktopOnly = Primärindikator:** Wenn Plugin auf Obsidian Mobile läuft → läuft auch in Slatebase
- **CSS Scoping:** `[data-plugin-id="<id>"]` Prefix auf allen Selektoren. Max 512 KB.
- **Command Palette:** CustomEvent `slatebase:open-command-palette` (keine direkte State-Kopplung)
- **VaultDeletionHook:** Generisch, für alle Module die vault-scoped Daten speichern

## Vault Sync

- **Secrets:** `SLATEBASE_SYNC_SECRET` (AES-256-GCM) und `SLATEBASE_CSRF_SECRET` sind getrennt. Beide in `.env` persistieren.
- **SyncLock:** In-Memory `Map<string, boolean>`. Single-threaded → kein TOCTOU.
- **Checkpoint:** Nur bei Erfolg aktualisieren. Atomar schreiben.
- **Konflikterkennung:** Pre-Write mtime Check gegen Checkpoint-mtime.
- **Owner-Only:** Nur Vault-Besitzer darf Sync konfigurieren. Admin hat keinen Bypass.

## MCP

- **Bearer Token Auth:** SHA-256-Hash gespeichert, Klartext nur bei Erstellung zurückgegeben
- **StreamableHTTPServerTransport** verwenden (nicht WebStandard-Variante)
- **Write-Tools:** Immer über `VaultService`, nie direkt aufs Filesystem
- **User-Invalidierung:** `onUserInvalidated`-Callback invalidiert alle Tokens bei Löschung/Sperrung

## Docker

- **Production:** `tsc`-Build verwenden, nicht `--experimental-strip-types` (löst `.js`-Extensions nicht auf)
- **Host:** `SLATEBASE_HOST=0.0.0.0` im Container (sonst nicht erreichbar)
- **Trusted Proxies:** Proxy-Subnet als `SLATEBASE_TRUSTED_PROXIES` setzen für echte Client-IPs
- **Healthcheck:** 401 = healthy (Server läuft, Auth aktiv). `start_period: 10s`.
- **Frontend-Port:** Nur intern exponieren wenn externer Reverse Proxy vorhanden

## i18n-Typsystem

- `TranslationShape` (rekursiver Mapped Type mit `string`-Blättern) für neue Sprachen — nie `typeof de` direkt
- `TranslateFn`-Typ für Hilfsfunktionen die `t` akzeptieren — nicht `(key: string) => string`
- `en.ts` importiert `type { de }` direkt aus `./de` (kein zirkulärer Import)

## Häufige Stolperfallen

1. `.js`-Extension vergessen (Backend-Imports) → Runtime-Error
2. Singleton `apiClient` verwenden — nie `new ApiClient()` in Komponenten
3. `vite.config.ts`: `defineConfig` aus `vitest/config` importieren (nicht aus `vite`)
4. Vault-IDs sind deterministisch (SHA-256, 12 Hex-Zeichen), nicht zufällig
5. `_`-Prefix-Dateien werden aus dem Tree gefiltert (interne Dateien)
6. Hono Route-Reihenfolge: `/users/search` VOR `/users/me` registrieren
7. Client ≠ Server Filesystem (kein Backend-Endpoint für Export/Download)
8. `showDirectoryPicker`: Nur Chromium. Immer JSZip-Fallback bereitstellen.
9. `EADDRINUSE` nach Prozess-Kill: 5–10s warten, nicht Code ändern
10. Wiederverwendete Dev-Server-Prozesse: Explizit stoppen und neu starten
11. Windows Hooks: Kein `head`, `tail`, `grep` — nur Windows-kompatible Befehle
12. `PublicUserInfo`-Erweiterungen: `toPublicInfo()` + Login-Response + Test-Mocks synchron halten
13. `__dirname` nach tsc-Build prüfen (relative Pfade verschieben sich um eine Ebene)
14. Debounced API-Calls: IMMER auch AbortController verwenden (Race Conditions)
15. `Ctrl+Shift+F`: `e.preventDefault()` um Browser-Suche zu blockieren

## Vault-Besitz & Multi-User

- **Lösch-Kette:** Freigaben aufheben → Vault löschen/übertragen → Account löschen
- **Transfer:** Nur an EINEN Benutzer, vorher ALLE anderen Freigaben widerrufen
- **Konflikte:** Optimistisches Concurrency (ETag). Kein Locking, kein CRDT.
- **Sperrung vs. Löschung:** Sperrung = Login blockiert, Daten intakt. Löschung = nur ohne Vaults möglich. Letzter Admin unantastbar.

## Testing

- Co-located (`*.test.ts`), keine externe Mocking-Library (Backend), `vi.fn()` (Frontend)
- Keine PBT-Tests (entfernt Juni 2026). Gründliche Unit Tests mit Edge Cases statt `fast-check`.
- Integration Tests: Echtes Filesystem, Temp-Dirs, Cleanup in `afterAll`
- ESLint vor Commit: `npx eslint . --quiet` im Frontend. CI bricht bei Errors.

## Knowledge Graph

- **LinkIndexService:** Per-Vault-Instanz. Lazy-Init, Fire-and-forget Updates, `_link-index.json` Persistenz.
- **Hook in VaultController:** `onFileSaved`/`onFileDeleted`/`onFileRenamed` — nur `.md`, fire-and-forget
- **Graph-Tab:** Virtueller Pfad `__graph__`. Maximal einer gleichzeitig.
- **d3-force:** `simulationRef` als useRef, nur bei Datenänderung neu erstellen

## Search & Replace

- **Lineare Iteration:** Reicht bis ~1000 Dateien. Per-File-Timeout 5s, Global-Timeout 30s.
- **Multi-Vault:** Shared Budget (nicht pro Vault). Partial Success bei Vault-Fehlern.
- **Replace:** Max 100 Dateien, sequentiell, kein Rollback. Atomarität nur pro Datei.
- **SearchPanel:** Debounce (300ms) + AbortController. State überlebt Panel-Öffnen/Schließen.

## Context Panel

- Split-Modus: Jede Section eigene Tab-Leiste. Cross-Section Drag & Drop. Letzte Tab raus → Section schließt sich.
- Layout-Persistenz: localStorage, scoped per userId, debounced (500ms)

## Dev-Umgebung

- Git-Proxy: `git -c http.proxy="" push` wenn lokaler Proxy nicht läuft
- `.gitignore`: `.kiro/settings/`, `/*.png`, `skills-lock.json`, `.agents/`, `.kiro/skills/`
- Node.js v24, `tsx watch` für Dev, `tsc`-Build für Production
