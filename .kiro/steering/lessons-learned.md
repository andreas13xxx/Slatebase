# Slatebase — Lessons Learned & Konventionen

Kompakte Referenz aus der bisherigen Entwicklung.

## Architektur

- **Interface-First:** `I*`-Interface definieren, dann implementieren
- **Manuelle DI:** Composition Root in `src/index.ts`, kein Framework
- **Separate Reducer:** Pro Feature ein eigener Provider/Reducer
- **Filesystem statt DB:** Interface-Abstraktion hält Tür für DB offen
- **Atomare Writes:** `<target>.${crypto.randomBytes(8).toString('hex')}.tmp` → `rename()`
- **Module-Level Bridge:** `Set<Callback>` für Cross-Provider-Events (`onX()`/`dispatchX()`)

## Code-Konventionen

- Backend: `.js`-Extension bei relativen Imports (ESM)
- Frontend: keine Extension (Vite)
- Barrel-Exports `index.ts`, keine Default-Exports
- Naming: `I`-Prefix, `Error`-Suffix, `create`-Prefix, `createMock`-Prefix, `SCREAMING_SNAKE_CASE` (Actions)
- Sprache: Code = Englisch, UI = Deutsch, Docs = Deutsch
- API-Errors: `{ code, message, timestamp }`
- Action Creators: Standalone async (kein Hook), nehmen `dispatch` + `apiClient`
- Validierung: ZWEI Schichten (Zod Controller + Business). Bei Änderungen IMMER beide prüfen.

## Frontend State

Provider-Hierarchie:
```
AuthProvider → I18nBridge → FeatureProvider → RealtimeBridge → AppProvider → SearchProvider → TabProvider → ContextPanelProvider → AppContent
```

- `RealtimeBridge` → Module-Level-Bridges für App/Tab-State
- `vaultTrees: Record<string, DirectoryTree | null>` (Multi-Vault)
- Expanded-Paths: `${vaultId}::${path}`
- `useTranslation()` Fallback-Deutsch ohne Provider (Tests brauchen keinen Wrapper)

## CSS

- Design Tokens in `index.css` — nie hartcodierte Farben
- Dark Mode: `:root[data-theme="dark"]` UND `@media (prefers-color-scheme: dark)`
- `appearance: none` + `disabled` → `opacity: 1`
- Dropdowns: `position: fixed` + JS (nicht abs in `overflow: hidden`)
- `--bg-primary` existiert NICHT → `--bg-base`, `--bg-surface`, `--bg-elevated`
- Feature-Farben als Token-Gruppe mit Prefix
- Broken Links: `underline dashed` (nie `line-through`)
- SVG-Text: nie in `scale()` — native Auflösung

## Realtime (SSE)

- Events: `chat:message`, `chat:unread`, `presence:update/init`, `vault:change`, `sync:conflict`, `notification:toast`, `server:shutdown`
- SSE ist immer aktiv wenn authentifiziert (kein Feature-Toggle, kein Fallback-Modus)
- `ConnectionStatus`: `'connected' | 'connecting' | 'disconnected'` (kein `'fallback'`)
- `RealtimeProvider` braucht nur `token` (kein `featureEnabled` Prop)
- `ConnectionIndicator` immer sichtbar (kein `visible` Prop)
- Tree nur refreshen wenn `vaultTrees[id] !== undefined`
- Tab-Content nur reloaden wenn `editBuffer === null`; bei `deleted` → Tab schließen
- Reconnect: Exponential Backoff 1s→60s (×2, ±500ms Jitter), 5 Fehler → `disconnected`
- Reconnect von `disconnected` → `connected` triggert `onReconnect` (Full Refresh)
- Neue Events: Bridge in `state/realtime*Bridge.ts`
- Tests: `EventSource` Mock in `test-setup.ts` (jsdom hat kein natives EventSource)

## Obsidian Markdown Plugins

- Pattern: `syntax.ts` → `mdast-util.ts` → `plugin.ts`
- Callouts: Transformer (kein Token, transformiert `blockquote`)
- `this.buffer()` vergiftet Stack — nur wenn `resume()` nötig
- `Effects`-Typ direkt importieren
- Embeds: 3 Typen (image/pdf/note), Pipe-Separator, beide Render-Pfade synchron halten
- `extractPlainText()` bei neuen Inline-Nodes erweitern
- Transitive Deps (`micromark`, `mdast-util-*`, `unist-util-visit`) direkt nutzbar

## Obsidian Plugin Compat

- Proxy-basiert (kein Worker — braucht DOM)
- Pro Plugin pro Vault eine AppShim (Vault-Wechsel: unload → neu → load)
- Emulierte Version: `1.4.0`
- Post-FCP Loading (`requestIdleCallback`/`setTimeout(50)`)
- ZIP: Root + Subdirectory-Layout (auto-detect)
- `savePlugin()` überschreibt nie `data.json`
- `isDesktopOnly` = Primärindikator
- CSS Scoping: `[data-plugin-id="<id>"]`, max 512 KB
- Command Palette: CustomEvent `slatebase:open-command-palette`

## Vault Sync

- `SLATEBASE_SYNC_SECRET` ≠ `SLATEBASE_CSRF_SECRET` (getrennt!)
- SyncLock: In-Memory Map, single-threaded → kein TOCTOU
- Checkpoint nur bei Erfolg updaten, atomar schreiben
- Konflikterkennung: mtime Check gegen Checkpoint-mtime
- Owner-Only (kein Admin-Bypass)

## MCP

- Bearer Token: SHA-256-Hash, Klartext nur bei Erstellung
- `StreamableHTTPServerTransport` verwenden
- Write-Tools über `VaultService`, nie direkt Filesystem
- `onUserInvalidated` invalidiert alle Tokens

## Docker

- Production: `tsc`-Build (nicht `--experimental-strip-types`)
- `SLATEBASE_HOST=0.0.0.0` im Container
- Trusted Proxies: Proxy-Subnet setzen
- Healthcheck: 401 = healthy, `start_period: 10s`

## i18n

- `TranslationShape` (rekursiver Mapped Type) für neue Sprachen
- `TranslateFn`-Typ für Hilfsfunktionen
- `en.ts` importiert `type { de }` direkt

## Häufige Stolperfallen

1. `.js`-Extension vergessen → Runtime-Error
2. Singleton `apiClient` verwenden — nie `new ApiClient()` in Komponenten
3. `vite.config.ts`: `defineConfig` aus `vitest/config` (nicht `vite`)
4. Vault-IDs: deterministisch (SHA-256, 12 Hex), nicht random
5. `_`-Prefix-Dateien aus Tree gefiltert
6. Hono: `/users/search` VOR `/users/me` registrieren
7. Client ≠ Server Filesystem (Export braucht Download-Endpoint)
8. `showDirectoryPicker`: nur Chromium, JSZip-Fallback
9. `EADDRINUSE`: 5–10s warten
10. Windows: kein `head`, `tail`, `grep` in Hooks
11. `PublicUserInfo`-Erweiterungen: `toPublicInfo()` + Login-Response + Mocks synchron
12. `__dirname` nach tsc prüfen (relative Pfade verschieben sich)
13. Debounced API-Calls: IMMER AbortController (Race Conditions)
14. `Ctrl+Shift+F`: `e.preventDefault()` für Browser-Suche
15. `.trash/` + `.versions/` aus FileExplorer-Tree filtern (Backend filtert `.`-Prefixed Dirs, Frontend zusätzlich explizit)
16. DropZone + internes DnD: `stopPropagation()` im internen Handler, damit DropZone-Overlay nicht triggert
17. Favorites-Store: Zustandsänderungen erzwingen Re-Render über Counter-State (Store ist kein React-State)
18. Image Paste: nur `image/*` MIME-Typen abfangen, Text-Paste NICHT intercepten (`preventDefault` nur bei Bild)
19. `EventSource` existiert nicht in jsdom — Mock in `test-setup.ts` erforderlich für Tests die RealtimeProvider rendern

## Multi-User & Vault-Besitz

- Lösch-Kette: Freigaben → Vault → Account
- Transfer: nur an EINEN, vorher ALLE Freigaben widerrufen
- Optimistisches Concurrency (ETag), kein Locking
- Sperrung ≠ Löschung; letzter Admin unantastbar

## Testing

- Co-located, keine externe Mocking-Lib (Backend)
- Keine PBT-Tests (entfernt). Gründliche Unit Tests mit Edge Cases.
- Integration: echtes Filesystem, Temp-Dirs, Cleanup `afterAll`
- ESLint vor Commit: `npx eslint . --quiet` im Frontend

## Dev-Umgebung

- Git-Proxy: `git -c http.proxy="" push`
- Node.js v24, `tsx watch` Dev, `tsc` Prod
