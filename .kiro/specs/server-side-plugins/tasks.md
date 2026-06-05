# Server-Side Plugins — Tasks

## Phase 1: Klassifikation & Infrastruktur

- [ ] Task 1: PluginClassifier implementieren (statische Bundle-Analyse: Node.js-Module, DOM-Zugriff, executionType)
- [ ] Task 2: Registry-Schema um `executionType`-Feld erweitern (Backend + Frontend)
- [ ] Task 3: PluginInstaller erweitern — Klassifikation bei Upload durchführen und in Registry speichern
- [ ] Task 4: Frontend PluginManagementPage: executionType-Badge anzeigen ("Browser" / "Server" / "Hybrid" / "Unbekannt")
- [ ] Task 5: ~~CompatibilityAnalyzer erweitern — Node.js-Module als "nicht browser-kompatibel" kennzeichnen~~ ✅ Erledigt (in `obsidian-plugin-compat` umgesetzt: Multi-Layer-Analyse mit isDesktopOnly + Node.js-Modul-Erkennung + API-Pattern-Matching)

## Phase 2: Server-Side Sandbox

- [ ] Task 6: ServerPluginSandbox implementieren (vm.createContext, Memory-Limits, Timeout)
- [ ] Task 7: Selektiver require()-Proxy (erlaubte Node.js built-ins: tls, net, crypto, buffer, events, stream, path, url, https, http)
- [ ] Task 8: VaultShim (Server) implementieren — Vault-I/O über VaultService
- [ ] Task 9: NetworkShim implementieren — fetch/requestUrl mit Allowlist-Prüfung
- [ ] Task 10: SettingsShim implementieren — loadData/saveData über PluginStore
- [ ] Task 11: Minimaler DOM-Stub für SettingTab (createElement, appendChild, textContent, className, addEventListener, innerHTML)

## Phase 3: Plugin Runtime Manager

- [ ] Task 12: PluginRuntimeManager implementieren (loadPlugin, unloadPlugin, getStatus, initializeAll, shutdownAll)
- [ ] Task 13: Plugin-Bundle im vm-Context evaluieren (CJS-Wrapper mit require/module.exports)
- [ ] Task 14: Plugin-Instanziierung mit Server-AppShim (vault, settings, network)
- [ ] Task 15: onload()/onunload() Lifecycle mit Timeout und Error-Handling
- [ ] Task 16: Timer/Intervall-Tracking und Cleanup bei unload
- [ ] Task 17: Console-Capture (log/warn/error → PluginLogStore)

## Phase 4: API & Logs

- [ ] Task 18: PluginLogStore implementieren (append-only, max 500 Einträge pro Plugin, Rotation)
- [ ] Task 19: API-Route: GET /vaults/:vaultId/plugins/:pluginId/runtime-status
- [ ] Task 20: API-Route: POST /vaults/:vaultId/plugins/:pluginId/start
- [ ] Task 21: API-Route: POST /vaults/:vaultId/plugins/:pluginId/stop
- [ ] Task 22: API-Route: GET /vaults/:vaultId/plugins/:pluginId/logs
- [ ] Task 23: Composition-Root-Integration (PluginRuntimeManager bei Server-Start initialisieren)

## Phase 5: Settings-Bridge

- [ ] Task 24: DOM-Serializer: SettingTab containerEl → deklaratives JSON-Format
- [ ] Task 25: API-Route: GET /vaults/:vaultId/plugins/:pluginId/settings-ui (serialisierte Settings)
- [ ] Task 26: API-Route: POST /vaults/:vaultId/plugins/:pluginId/settings-event (User-Interaktion)
- [ ] Task 27: Frontend: ServerSettingsRenderer-Komponente (rendert deklaratives JSON als React-Elemente)
- [ ] Task 28: Frontend: PluginManagementPage Settings-Modal-Integration (Server-Settings statt JSON-Editor wenn executionType === 'server-capable')

## Phase 6: Frontend-Integration

- [ ] Task 29: Frontend: Plugin-Status-Anzeige (running/stopped/error) für Server-Plugins
- [ ] Task 30: Frontend: Start/Stop-Buttons für Server-Plugins
- [ ] Task 31: Frontend: Plugin-Log-Viewer (ähnlich Sync-Log, paginated)
- [ ] Task 32: Frontend: Warnung bei hybrid-Plugins ("Teilweise nicht unterstützt")

## Phase 7: Sicherheit & Hardening

- [ ] Task 33: Netzwerk-Allowlist-UI (pro Plugin konfigurierbar)
- [ ] Task 34: Memory/CPU-Monitoring mit Auto-Kill bei Überschreitung
- [ ] Task 35: Audit-Logging für Plugin-Aktionen (Dateiänderungen, Netzwerk-Requests)
- [ ] Task 36: Sicherheits-Review: Sandbox-Escape-Vektoren identifizieren und mitigieren
