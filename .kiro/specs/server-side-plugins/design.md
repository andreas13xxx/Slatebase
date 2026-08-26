# Server-Side Plugins — Design

## Architektur-Übersicht

```
┌─────────────────────────────────────────────────────────────────┐
│ Frontend (Browser)                                               │
│  PluginManagementPage ─── Settings-Bridge ─── Plugin Status UI  │
└────────────────────────────────────┬────────────────────────────┘
                                     │ REST API
┌────────────────────────────────────┴────────────────────────────┐
│ Backend (Node.js)                                                │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Plugin Runtime Manager                                      │ │
│  │  ├── PluginClassifier (statische Analyse)                   │ │
│  │  ├── PluginSandboxManager (vm Contexts)                     │ │
│  │  ├── PluginScheduler (Timer-Verwaltung)                     │ │
│  │  └── PluginLogCollector (Konsolen-Capture)                  │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Server-Side Shim Layer                                      │ │
│  │  ├── VaultShim (read/modify/create/delete via VaultService) │ │
│  │  ├── NetworkShim (fetch mit Allowlist-Prüfung)              │ │
│  │  ├── SettingsShim (loadData/saveData via PluginStore)       │ │
│  │  ├── DomStub (jsdom-light für SettingTab)                   │ │
│  │  └── MetadataCacheShim (aus Vault-Dateien)                  │ │
│  └────────────────────────────────────────────────────────────┘ │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │ Bestehende Infrastruktur                                    │ │
│  │  ├── PluginStore (Filesystem-Persistenz)                    │ │
│  │  ├── PluginInstaller (ZIP-Upload)                           │ │
│  │  ├── VaultService (Dateisystem-Zugriff)                     │ │
│  │  └── AuditService (Logging)                                 │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

## Komponenten

### 1. PluginClassifier (Backend)

**Standort:** `backend/src/plugin/plugin-classifier.ts`

Statische Analyse des Plugin-Bundles um den Execution-Typ zu bestimmen:

```typescript
interface ClassificationResult {
  executionType: 'browser-only' | 'server-capable' | 'hybrid' | 'unknown'
  nodeModules: string[]       // Erkannte Node.js-Module (tls, net, crypto, ...)
  domAccess: boolean          // Ob DOM-APIs verwendet werden (außer SettingTab)
  settingTabDetected: boolean // Ob addSettingTab() aufgerufen wird
}
```

**Logik:**
- Regex-Scan nach `require('tls'|'net'|'crypto'|'fs'|...)` und `require('node:...')`
- Regex-Scan nach `document.`, `window.`, `HTMLElement`, `containerEl` (außerhalb von SettingTab-Kontext)
- Node-Module erkannt + kein DOM → `server-capable`
- Node-Module erkannt + DOM-Zugriff → `hybrid`
- Kein Node-Module → `browser-only`

**Wiederverwendung statt Neubau:** `frontend/src/plugins/compat/compatibility-analyzer.ts` (`CompatibilityAnalyzer`, Teil von `obsidian-plugin-compat`) enthält bereits eine produktiv genutzte `detectNodeModules()`-Funktion mit Regex-Patterns für `require()`/`import`/dynamisches `import()` und einer `NODE_BUILTIN_MODULES`-Liste. Diese Erkennung dient dort einem anderen Zweck (Browser-Kompatibilitäts-Badge, Feld `compatibilityLevel`), ist aber für die Node-Modul-Erkennung selbst 1:1 übertragbar. Empfehlung: Regex-Patterns + Modul-Liste in ein gemeinsames Modul extrahieren (z. B. `shared/node-module-detection.ts`, von Frontend und Backend importierbar, oder als reiner Kopie-Fork mit explizitem Sync-Kommentar, falls ein Shared-Package zwischen `frontend/` und `backend/` architektonisch nicht vorgesehen ist), statt eine zweite, driftende Implementierung zu pflegen. Dabei `events` und `url` zur Liste ergänzen (fehlen aktuell in `NODE_BUILTIN_MODULES`, werden aber von R5.6/Task 7 als bereitzustellende Built-ins verlangt).

### 2. PluginSandboxManager (Backend)

**Standort:** `backend/src/plugin/server-sandbox.ts`

Verwaltet isolierte `vm.Script`/`vm.Module`-Kontexte für serverseitige Plugins:

```typescript
interface IServerPluginSandbox {
  createContext(pluginId: string, vaultId: string, config: SandboxConfig): ServerPluginContext
  destroyContext(pluginId: string): void
  getContext(pluginId: string): ServerPluginContext | undefined
  listActive(): string[]
}

interface SandboxConfig {
  memoryLimitMb: number    // Default: 128
  timeoutMs: number        // Default: 30000
  networkAllowlist: string[]
}
```

**Isolation:**
- `vm.createContext()` mit eigenem Global-Objekt
- Node.js Built-ins werden selektiv injiziert (kein `child_process`, kein `fs` direkt)
- `VaultShim` statt `fs` für Dateizugriff
- Proxy-basierter `require()` der nur erlaubte Module auflöst

### 3. Server-Side Shim Layer

**VaultShim (Server):**
- `read(file)` → `vaultService.getFileContent(vaultId, path)`
- `modify(file, content)` → `vaultService.saveFile(vaultId, path, content)`
- `create(path, content)` → `vaultService.saveFile(vaultId, path, content)`
- `delete(file)` → `vaultService.deleteContent(vaultId, path)`
- `getAbstractFileByPath(path)` → Lookup im Directory Tree

**NetworkShim:**
- `requestUrl(urlOrConfig)` → `fetch()` mit Allowlist-Prüfung
- Blockiert Requests an nicht-erlaubte Hosts
- Loggt alle Requests im Plugin-Log
- Für Credentials (z. B. IMAP-Passwort im Motivations-Beispiel): bestehenden `PluginSecretStore`/`PluginSecretKeyManager` (`backend/src/plugin/secret-store.ts`, `secret-key-manager.ts`) wiederverwenden — AES-256-GCM-verschlüsselt, bereits vault-/plugin-scoped unter `data/plugins/<vaultId>/<pluginId>/secrets.json`, kein Grund für eine zweite Secret-Persistenz nur für Server-Plugins.

**DomStub:**
- Minimale `document`/`HTMLElement`-Implementierung für SettingTab
- `createElement`, `appendChild`, `textContent`, `className`, `addEventListener`
- Serialisierung zu HTML-String für Frontend-Transfer

### 4. Settings-Bridge

**Ansatz V1 (JSON-basiert):**
- Server evaluiert `settingTab.display()` → erzeugt DOM-Struktur
- DOM wird zu einem deklarativen Format serialisiert:
  ```json
  { "type": "setting", "name": "IMAP Host", "desc": "...", "control": { "type": "text", "value": "..." } }
  ```
- Frontend rendert dieses Format als native UI-Komponenten
- User-Eingaben werden als Events an den Server gesendet

**Endpoint:** `GET /vaults/:vaultId/plugins/:pluginId/settings-ui`
- Ruft `display()` auf dem Server auf
- Gibt serialisierte Settings-UI zurück

**Endpoint:** `POST /vaults/:vaultId/plugins/:pluginId/settings-event`
- Body: `{ "settingIndex": 0, "controlType": "text", "value": "new-value" }`
- Server führt den Change-Handler aus → gibt aktualisierten State zurück

### 5. Plugin Runtime Manager

**Standort:** `backend/src/plugin/plugin-runtime.ts`

Orchestriert den Lifecycle serverseitiger Plugins:

```typescript
interface IPluginRuntimeManager {
  loadPlugin(vaultId: string, pluginId: string): Promise<void>
  unloadPlugin(vaultId: string, pluginId: string): Promise<void>
  getStatus(vaultId: string, pluginId: string): PluginRuntimeStatus
  getLogs(vaultId: string, pluginId: string, limit?: number): PluginLogEntry[]
  initializeAll(): Promise<void>  // Beim Server-Start
  shutdownAll(): Promise<void>    // Beim Server-Stop
}

type PluginRuntimeStatus = 'running' | 'stopped' | 'error' | 'loading'
```

### 6. API-Erweiterungen

| Method | Path | Purpose |
|--------|------|---------|
| GET | /vaults/:vaultId/plugins/:pluginId/runtime-status | Server-Plugin-Status |
| POST | /vaults/:vaultId/plugins/:pluginId/start | Server-Plugin starten |
| POST | /vaults/:vaultId/plugins/:pluginId/stop | Server-Plugin stoppen |
| GET | /vaults/:vaultId/plugins/:pluginId/logs | Plugin-Logs abrufen |
| GET | /vaults/:vaultId/plugins/:pluginId/settings-ui | Serialisierte Settings-UI |
| POST | /vaults/:vaultId/plugins/:pluginId/settings-event | Settings-Interaktion |

### 7. Frontend-Anpassungen

- **PluginManagementPage**: Zeigt `executionType` Badge ("Browser" / "Server" / "Hybrid")
- **Settings-Modal**: Bei server-capable Plugins wird die serialisierte Settings-UI gerendert statt JSON-Editor
- **Status-Anzeige**: Echtzeit-Status (running/stopped/error) für Server-Plugins
- **Log-Viewer**: Abrufbare Plugin-Logs (ähnlich Sync-Log)

## Datenfluss: Plugin-Aktivierung

```
1. Admin aktiviert Plugin in UI
2. Frontend: PUT /plugins/registry (status: 'active')
3. Backend: PluginClassifier analysiert Bundle → executionType
4. Wenn 'server-capable':
   a. PluginSandboxManager erstellt vm-Context
   b. Bundle wird im Context evaluiert
   c. Plugin-Instanz wird erstellt (new PluginClass(appShim))
   d. onPluginInstantiated: addCommand/addSettingTab werden verdrahtet
   e. onload() wird aufgerufen
   f. Timer/Intervalle des Plugins laufen im Hintergrund
5. Frontend: Zeigt Status "Running" + verfügbare Settings
```

## Abhängigkeiten

- `vm` (Node.js built-in) — für Sandbox-Isolation
- `jsdom` (optional, für DOM-Stub) — oder eigene minimale Implementierung
- Bestehende Infrastruktur: `PluginStore`, `PluginInstaller`, `VaultService`, `AuditService`

## Offene Entscheidungen

1. **`vm` vs `isolated-vm` vs `worker_threads`**: `vm` ist einfacher aber weniger sicher; `isolated-vm` bietet echte Memory-Isolation; `worker_threads` ermöglicht parallele Ausführung. Empfehlung: Start mit `vm`, Migration zu `isolated-vm` wenn Security-Audit das verlangt. **Stand (QA-Check):** Weder `isolated-vm` noch `jsdom` sind aktuell eine Dependency von `backend/package.json` — beide müssten bei Task 6 neu hinzugefügt werden, das ist keine bereits vorbereitete Altlast.
2. **DOM-Stub-Tiefe**: Minimale Implementierung (nur was SettingTab braucht) vs. jsdom (volle Kompatibilität, aber 10 MB+ Dependency). Empfehlung: Eigene minimale Implementierung, jsdom als optionaler Fallback.
3. **Settings-Bridge-Format**: Deklaratives JSON (einfacher, kontrollierbarer) vs. serialisiertes HTML (kompatibler mit beliebigem DOM). Empfehlung: Deklaratives JSON in V1.

## Security-Hardening-Nachsorge (R9)

`implementation-plan.md` (Prio 11) und `SECURITY-AUDIT.md` (Fix-Backlog #2–#4) weisen dieser Spec zwei bislang offene, unabhängig von der Plugin-Sandbox-Architektur stehende Punkte explizit zu, statt dafür einen eigenen Security-Nachfolge-Pass zu eröffnen:

- **Rate-Limiter** für `POST /proxy` (60/min/userId), `POST /vaults/:vaultId/shares` (20/Stunde/userId) und `GET /search` + `GET /vaults/:vaultId/search` (inkl. `SearchService`-Timeout) — alle über die bestehende `SlidingWindowRateLimiter`-Klasse (`backend/src/shared/sliding-window-rate-limiter.ts`), dieselbe Middleware-Instanz-Bauart wie beim Login- und Passwort-Change-Limiter. Kein neuer Rate-Limiting-Mechanismus nötig, nur zusätzliche Instanzen + Middleware-Verdrahtung an drei bestehenden Routen (`proxyRoutes.ts`, vermutlich `vaultShareRoutes.ts`, `searchRoutes.ts`).
- **Echte Plugin-Sandbox-Isolation**: Wird durch die in diesem Dokument beschriebene `vm`-Sandbox (Komponente 2) für `server-capable`-Plugins erfüllt — schließt `SECURITY-AUDIT.md` Fix-Backlog #4. Betrifft **nicht** die Browser-Ausführung von `browser-only`-Plugins; deren Proxy-basierte Soft-Isolation (`frontend/src/plugins/compat/sandbox.ts`) bleibt unverändert bestehen (dokumentiertes Trust-Modell, siehe dortiger "SECURITY NOTE"-Kommentar).

**Terminologie-Hinweis:** `SECURITY-AUDIT.md` bezeichnet diese Spec an einer Stelle als "Priority 4", `implementation-plan.md` führt sie aktuell unter "Prio 11" — beide Dokumente meinen dieselbe Spec (`server-side-plugins`), die Nummerierungen stammen aus unterschiedlichen, zu unterschiedlichen Zeitpunkten geschriebenen Priorisierungslisten und sind nicht synchronisiert. Kein Handlungsbedarf für diese Spec selbst, aber beim nächsten Audit-Refresh in `SECURITY-AUDIT.md` erwähnenswert.
