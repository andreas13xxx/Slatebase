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

1. **`vm` vs `isolated-vm` vs `worker_threads`**: `vm` ist einfacher aber weniger sicher; `isolated-vm` bietet echte Memory-Isolation; `worker_threads` ermöglicht parallele Ausführung. Empfehlung: Start mit `vm`, Migration zu `isolated-vm` wenn Security-Audit das verlangt.
2. **DOM-Stub-Tiefe**: Minimale Implementierung (nur was SettingTab braucht) vs. jsdom (volle Kompatibilität, aber 10 MB+ Dependency). Empfehlung: Eigene minimale Implementierung, jsdom als optionaler Fallback.
3. **Settings-Bridge-Format**: Deklaratives JSON (einfacher, kontrollierbarer) vs. serialisiertes HTML (kompatibler mit beliebigem DOM). Empfehlung: Deklaratives JSON in V1.
