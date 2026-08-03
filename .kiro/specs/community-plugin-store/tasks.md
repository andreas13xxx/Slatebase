# Tasks — Community Plugin Store

## Phase 1: Backend — GitHub Client & Cache

- [ ] 1. Erstelle `backend/src/plugin-store/types.ts` mit allen Interfaces (`CommunityPluginEntry`, `RemotePluginManifest`, `PluginUpdateInfo`, `UpdateCheckResult`, `StoreInstallRequest`, `IPluginStoreConfig`, `PluginReleaseAssets`, `BulkUpdateResult`)
- [ ] 2. Erstelle `backend/src/plugin-store/errors.ts` mit Fehlerklassen (`GitHubRateLimitError`, `GitHubFetchError`, `DesktopOnlyPluginError`, `AssetTooLargeError`, `PluginNotInStoreError`, `UpstreamError`)
- [ ] 3. Erstelle `backend/src/plugin-store/validation.ts` mit Zod-Schemas (`storeInstallSchema` für Request-Body-Validierung, `communityPluginEntrySchema`)
- [ ] 4. Erstelle `backend/src/plugin-store/github-client.ts` — GitHub API Client mit: fetch community-plugins.json, fetch remote manifest, download release assets, Rate-Limit-Tracking via Response-Headers, Domain-Allowlist, Size-Limits (10 MB/Asset, 15 MB total), optionaler `SLATEBASE_GITHUB_TOKEN`, 30s Timeout
- [ ] 5. Erstelle `backend/src/plugin-store/plugin-store-cache.ts` — In-Memory Cache mit TTL: Plugin-Liste (1h), Remote-Manifeste (15min), Update-Check-Ergebnisse (15min), Fallback auf letzten gültigen Stand bei Fehler
- [ ] 6. Erstelle `backend/src/plugin-store/index.ts` — Barrel export

## Phase 2: Backend — Plugin Store Service

- [ ] 7. Erstelle `backend/src/plugin-store/plugin-store-service.ts` — Business-Logik: `getPluginList()`, `getRemoteManifest(repo)`, `installFromStore(vaultId, pluginId, repo)`, `checkUpdates(vaultId)`, `updatePlugin(vaultId, pluginId)`, `updateAll(vaultId)`. Nutzt GitHubClient, Cache, bestehenden PluginStore + Versionsprüfung. `installFromStore` validiert `isDesktopOnly` vor Installation, speichert Assets direkt via `pluginStore.savePlugin()`, prüft Versions-Upgrade-Logik
- [ ] 8. Erstelle `backend/src/plugin-store/update-checker.ts` — Periodischer Update-Check (24h Intervall via setInterval), Persistenz des letzten Check-Timestamps in `data/plugin-store/last-update-check.json`, Start/Stop-Lifecycle, iteriert alle Vaults
- [ ] 9. Unit-Tests für `github-client.ts` (Mocked fetch, Rate-Limit-Tracking, Size-Limit-Prüfung, Domain-Allowlist)
- [ ] 10. Unit-Tests für `plugin-store-service.ts` (Install-Flow, Update-Check, Bulk-Update, Desktop-Only-Rejection, Fehlerbehandlung)

## Phase 3: Backend — API Routes

- [ ] 11. Erstelle `backend/src/api/pluginStoreRoutes.ts` mit Routes: `GET /api/v1/plugin-store/plugins` (Plugin-Liste), `GET /api/v1/plugin-store/plugins/:pluginId/manifest` (Remote-Manifest), `POST /api/v1/vaults/:vaultId/plugins/store-install` (Store-Installation), `POST /api/v1/vaults/:vaultId/plugins/check-updates` (Update-Check), `POST /api/v1/vaults/:vaultId/plugins/:pluginId/update` (Einzel-Update), `POST /api/v1/vaults/:vaultId/plugins/update-all` (Bulk-Update). Auth + Vault-Zugriffsprüfung auf allen Vault-spezifischen Routes
- [ ] 12. Registriere neue Routes in `backend/src/index.ts` (Composition Root): Plugin-Store-Service instanziieren, GitHubClient + Cache verdrahten, Update-Checker starten, Routes mounten. Feature-Guard (`obsidian-plugin-compat`) auf Store-Routes anwenden
- [ ] 13. Erweitere `backend/config/default.json` um Plugin-Store-Konfiguration (cacheTtl, autoCheck, maxAssetSize)
- [ ] 14. Integrationstests für Plugin-Store-Routes (Happy Path: Liste abrufen, Install, Update-Check; Error Path: Rate-Limit, Desktop-Only, Nicht-gelistetes Plugin)

## Phase 4: Frontend — IApiClient & Types

- [ ] 15. Erweitere `frontend/src/api/index.ts` (IApiClient-Interface) um neue Methoden: `getStorePlugins()`, `getStorePluginManifest(pluginId)`, `installFromStore(vaultId, pluginId, repo)`, `checkPluginUpdates(vaultId)`, `updatePlugin(vaultId, pluginId)`, `updateAllPlugins(vaultId)`
- [ ] 16. Implementiere die neuen Methoden in der `ApiClient`-Klasse (fetch-Calls zu den neuen Backend-Routes)
- [ ] 17. Erstelle `frontend/src/components/plugin-store/types.ts` mit Frontend-spezifischen Typen (Re-Exports aus API + lokale Display-Typen)

## Phase 5: Frontend — Plugin Store Browser UI

- [ ] 18. Erstelle `frontend/src/components/plugin-store/PluginStoreSearch.tsx` — Suchfeld (debounced 200ms) + Filter-Checkboxen ("Kompatibel", "Nicht installiert") + Ergebnis-Counter
- [ ] 19. Erstelle `frontend/src/components/plugin-store/PluginStoreSearch.css` — Styles für Search/Filter-Bereich
- [ ] 20. Erstelle `frontend/src/components/plugin-store/PluginStoreCard.tsx` — Plugin-Karte: Name, Autor, Beschreibung, Version (installiert vs. latest), Status-Badge (Installiert/Desktop-Only), Aktions-Buttons (Installieren/Aktualisieren), Spinner während Aktion, Fehlermeldung, Link zu Release Notes
- [ ] 21. Erstelle `frontend/src/components/plugin-store/UpdateBanner.tsx` — Banner-Komponente: "X Updates verfügbar" + "Alle aktualisieren"-Button + Spinner + Ergebnis-Zusammenfassung nach Bulk-Update
- [ ] 22. Erstelle `frontend/src/components/plugin-store/PluginStoreBrowser.tsx` — Hauptkomponente: Lädt Plugin-Liste, verwaltet lokalen State (search, filter, installing, updating), Client-Side-Filtering, koordiniert Update-Check + Install/Update-Aktionen, integriert Search + Cards + UpdateBanner
- [ ] 23. Erstelle `frontend/src/components/plugin-store/PluginStoreBrowser.css` — Styles (Plugin-Grid/Liste, Cards, Desktop-Only-Graying, Responsive)
- [ ] 24. Erstelle `frontend/src/components/plugin-store/index.ts` — Barrel export

## Phase 6: Frontend — Integration in PluginManagementPage

- [ ] 25. Erweitere `PluginManagementPage.tsx` um Tab-Navigation: "Installierte Plugins" (bestehende Ansicht) und "Verfügbare Plugins" (PluginStoreBrowser). Tab-State als `useState`. Installierte-Plugin-Tab als Default
- [ ] 26. Passe `SettingsPanel.css` an: `max-width: none` für den Content-Bereich wenn Plugin-Management aktiv ist (CSS `:has()` oder Klassen-basiert)
- [ ] 27. Erweitere i18n (`de.ts` + `en.ts`) um alle neuen Strings: Tab-Labels, Filter-Labels, Button-Texte, Fehlermeldungen, Statusmeldungen, Update-Banner-Texte

## Phase 7: Frontend — Update-Indikator

- [ ] 28. Implementiere Update-Badge/Hinweis: Beim Öffnen der Plugin-Seite prüfen ob gecachte Update-Ergebnisse vorliegen und Badge anzeigen ("2 Updates"). Optional: Toast-Notification bei App-Start wenn Updates verfügbar
- [ ] 29. "Nach Updates suchen"-Button im "Installierte Plugins"-Tab: Lädt Update-Check, zeigt Ergebnis inline bei jedem Plugin (Version → neueste Version, Update-Button)

## Phase 8: Tests & Polish

- [ ] 30. Unit-Tests für `PluginStoreBrowser` (Rendering, Filtering, Install-Flow, Error-States)
- [ ] 31. Unit-Tests für `PluginStoreCard` (Status-Varianten: installiert, update verfügbar, desktop-only, installierend)
- [ ] 32. Manueller E2E-Test: Plugin-Store öffnen → Suchen → Installieren → Update prüfen → Einzeln updaten → Bulk-Update
- [ ] 33. Backend `npx tsc --noEmit` + Frontend `npm run build` erfolgreich
- [ ] 34. Frontend `npm run lint` — 0 Errors
