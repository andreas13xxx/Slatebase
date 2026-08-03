# Design Document — Community Plugin Store

## Übersicht

Das Feature integriert den Obsidian Community Plugin Store in Slatebase. Das Backend fungiert als Proxy/Cache für GitHub-Daten (Plugin-Liste, Manifeste, Release-Assets). Das Frontend erweitert die bestehende `PluginManagementPage` um einen Tab "Verfügbare Plugins" mit Suche, Filtern und Install/Update-Aktionen. Alles liegt hinter dem bestehenden Feature-Toggle `obsidian-plugin-compat`.

---

## Architektur

```
┌─────────────────────────────────────────────────────────────────┐
│ Frontend                                                         │
│                                                                  │
│  PluginManagementPage                                           │
│  ├── Tab: "Installierte Plugins" (bestehend)                    │
│  └── Tab: "Verfügbare Plugins" (NEU)                            │
│       ├── SearchBar + CategoryFilter                            │
│       ├── PluginStoreList (virtualisiert)                       │
│       │   └── PluginStoreCard (je Plugin)                       │
│       └── UpdateBanner (Updates verfügbar)                      │
│                                                                  │
│  IApiClient (erweitert um Store-Methoden)                       │
└──────────────────────────────┬──────────────────────────────────┘
                               │ HTTP
┌──────────────────────────────▼──────────────────────────────────┐
│ Backend                                                          │
│                                                                  │
│  pluginStoreRoutes.ts (NEU)                                     │
│  ├── GET  /api/v1/plugin-store/plugins                          │
│  ├── GET  /api/v1/plugin-store/plugins/:pluginId/manifest       │
│  ├── POST /api/v1/plugin-store/install                          │
│  ├── POST /api/v1/vaults/:vaultId/plugins/check-updates         │
│  ├── POST /api/v1/vaults/:vaultId/plugins/:pluginId/update      │
│  └── POST /api/v1/vaults/:vaultId/plugins/update-all            │
│                                                                  │
│  plugin-store-service.ts (NEU)                                  │
│  ├── fetchPluginList() → cached community-plugins.json          │
│  ├── fetchRemoteManifest(repo) → cached manifest.json           │
│  ├── downloadRelease(repo, version) → Buffer (ZIP-like assets)  │
│  ├── checkUpdates(vaultId) → UpdateCheckResult[]                │
│  └── installFromStore(vaultId, pluginId) → PluginInstallResult  │
│                                                                  │
│  plugin-store-cache.ts (NEU)                                    │
│  ├── In-Memory Cache mit TTL                                    │
│  ├── Plugin-Liste: 1h TTL                                       │
│  ├── Remote-Manifeste: 15min TTL                                │
│  └── Fallback auf letzten gültigen Stand bei Fehler             │
│                                                                  │
│  github-client.ts (NEU)                                         │
│  ├── Zentraler GitHub-API-Client                                │
│  ├── Rate-Limit-Tracking (X-RateLimit-Remaining Header)         │
│  ├── Optional: SLATEBASE_GITHUB_TOKEN für 5000 req/h            │
│  └── Domain-Allowlist (github.com, raw.githubusercontent.com)   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Backend-Design

### Neues Modul: `backend/src/plugin-store/`

```
backend/src/plugin-store/
├── index.ts                    — Barrel export
├── types.ts                    — Interfaces und Datenmodelle
├── errors.ts                   — Fehlerklassen
├── validation.ts               — Zod-Schemas
├── github-client.ts            — GitHub API Client (fetch + cache headers)
├── plugin-store-cache.ts       — In-Memory Cache mit TTL
├── plugin-store-service.ts     — Business-Logik (Orchestrierung)
└── update-checker.ts           — Periodischer Update-Check (24h Intervall)
```

### Datenmodelle (`types.ts`)

```typescript
/** Eintrag aus community-plugins.json */
export interface CommunityPluginEntry {
  id: string;
  name: string;
  author: string;
  description: string;
  repo: string;  // Format: "owner/repo"
}

/** Remote-Manifest eines Plugins (von GitHub) */
export interface RemotePluginManifest {
  id: string;
  name: string;
  version: string;
  minAppVersion?: string;
  author?: string;
  description?: string;
  isDesktopOnly?: boolean;
  [key: string]: unknown;
}

/** Ergebnis eines Update-Checks für ein einzelnes Plugin */
export interface PluginUpdateInfo {
  pluginId: string;
  installedVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
  releaseUrl: string;  // GitHub Release URL für Release Notes
  repo: string;
}

/** Ergebnis eines Update-Checks für alle Plugins eines Vaults */
export interface UpdateCheckResult {
  plugins: PluginUpdateInfo[];
  checkedAt: string;  // ISO 8601
  errors: Array<{ pluginId: string; reason: string }>;
}

/** Request für Store-Installation */
export interface StoreInstallRequest {
  pluginId: string;
  repo: string;
  vaultId: string;
}

/** Konfiguration des Plugin-Store-Service */
export interface IPluginStoreConfig {
  githubToken?: string;           // SLATEBASE_GITHUB_TOKEN
  cacheTtlPluginList: number;     // Default: 3600000 (1h)
  cacheTtlManifest: number;       // Default: 900000 (15min)
  maxAssetSize: number;           // Default: 10 * 1024 * 1024 (10 MB)
  maxTotalDownloadSize: number;   // Default: 15 * 1024 * 1024 (15 MB)
  autoCheckInterval: number;      // Default: 86400000 (24h)
}
```

### GitHub Client (`github-client.ts`)

```typescript
export interface IGitHubClient {
  /** Fetch community-plugins.json (cached) */
  fetchCommunityPlugins(): Promise<CommunityPluginEntry[]>;
  /** Fetch manifest.json from a plugin repo's default branch */
  fetchManifest(repo: string): Promise<RemotePluginManifest>;
  /** Download release assets for a specific version (or latest) */
  downloadReleaseAssets(repo: string, version?: string): Promise<PluginReleaseAssets>;
  /** Get remaining rate limit */
  getRateLimitRemaining(): number;
}
```

**Implementierungsdetails:**

- Nutzt `fetch` (Node.js 22+ built-in) für HTTP-Requests
- URLs:
  - Plugin-Liste: `https://raw.githubusercontent.com/obsidianmd/obsidian-releases/master/community-plugins.json`
  - Remote-Manifest: `https://raw.githubusercontent.com/{repo}/HEAD/manifest.json`
  - Release-Assets: GitHub Releases API `https://api.github.com/repos/{repo}/releases/latest` → Asset-URLs
- `Authorization: Bearer {token}` Header wenn `SLATEBASE_GITHUB_TOKEN` gesetzt
- Rate-Limit-Tracking via `X-RateLimit-Remaining` Response-Header
- Domain-Allowlist: Nur `github.com`, `raw.githubusercontent.com`, `objects.githubusercontent.com` (Release-Asset-CDN)
- Timeout: 30s pro Request
- Asset-Size-Check: `Content-Length` Header prüfen vor Download, Streaming mit Größen-Limit

### Cache (`plugin-store-cache.ts`)

```typescript
export interface IPluginStoreCache {
  getPluginList(): CommunityPluginEntry[] | null;
  setPluginList(data: CommunityPluginEntry[]): void;
  getManifest(repo: string): RemotePluginManifest | null;
  setManifest(repo: string, manifest: RemotePluginManifest): void;
  getUpdateCheck(vaultId: string): UpdateCheckResult | null;
  setUpdateCheck(vaultId: string, result: UpdateCheckResult): void;
  invalidateUpdateCheck(vaultId: string): void;
}
```

**Implementierung:** In-Memory `Map<string, { data: T; expiresAt: number }>`. Kein Filesystem-Persist für den Cache (nur `last-update-check.json` für den Timestamp).

### Plugin Store Service (`plugin-store-service.ts`)

```typescript
export interface IPluginStoreService {
  /** Get cached community plugin list */
  getPluginList(): Promise<CommunityPluginEntry[]>;
  /** Get remote manifest for a single plugin */
  getRemoteManifest(repo: string): Promise<RemotePluginManifest>;
  /** Install a plugin from the community store */
  installFromStore(vaultId: string, pluginId: string, repo: string): Promise<PluginInstallResult>;
  /** Check for updates for all installed plugins in a vault */
  checkUpdates(vaultId: string): Promise<UpdateCheckResult>;
  /** Update a single plugin to latest version */
  updatePlugin(vaultId: string, pluginId: string): Promise<PluginInstallResult>;
  /** Update all plugins with available updates */
  updateAll(vaultId: string): Promise<BulkUpdateResult>;
}
```

**Flow: `installFromStore()`**

1. `githubClient.downloadReleaseAssets(repo)` → `{ manifest, bundle, styles? }`
2. Konstruiere `PluginFiles` Objekt
3. Validiere Manifest (Zod, bestehender `pluginManifestSchema`)
4. Rufe `pluginInstaller.installFromZip()` NICHT auf — stattdessen direkt `pluginStore.savePlugin()` aufrufen (da wir bereits entpackte Assets haben)
5. Return `PluginInstallResult`

Alternative: Die Assets zu einem in-memory ZIP packen und durch den bestehenden `installFromZip()` leiten. **Entscheidung: Direkt speichern** — ZIP-Overhead ist unnötig wenn wir die Assets bereits einzeln haben. Versionsprüfung (kein Downgrade) wird manuell geprüft wie im bestehenden Installer.

### Update Checker (`update-checker.ts`)

```typescript
export interface IUpdateChecker {
  /** Schedule periodic update checks */
  start(): void;
  /** Stop periodic checks */
  stop(): void;
  /** Get last check timestamp */
  getLastCheckTime(): string | null;
  /** Get cached update results (per vault) */
  getCachedResults(vaultId: string): UpdateCheckResult | null;
}
```

- Periodischer `setInterval` (24h)
- Persists Timestamp in `data/plugin-store/last-update-check.json`
- Bei Start: Prüfe ob seit letztem Check >24h vergangen → sofort laufen lassen
- Iteriert über alle Vaults, für jede: installierte Plugins → Remote-Manifeste abrufen → Versionen vergleichen
- Ergebnisse in Cache (15min TTL für API-Response)
- Optional: SSE-Event `plugin:updates-available` an verbundene Clients (nützlich aber nicht in v1 zwingend)

### Neue API-Routes (`pluginStoreRoutes.ts`)

| Method | Route | Beschreibung |
|--------|-------|--------------|
| GET | `/api/v1/plugin-store/plugins` | Community-Plugin-Liste (cached) |
| GET | `/api/v1/plugin-store/plugins/:pluginId/manifest` | Remote-Manifest eines Plugins |
| POST | `/api/v1/vaults/:vaultId/plugins/store-install` | Plugin aus Store installieren |
| POST | `/api/v1/vaults/:vaultId/plugins/check-updates` | Update-Check für installierte Plugins |
| POST | `/api/v1/vaults/:vaultId/plugins/:pluginId/update` | Einzelnes Plugin aktualisieren |
| POST | `/api/v1/vaults/:vaultId/plugins/update-all` | Alle Plugins aktualisieren |

**Auth:** Alle Routen brauchen Session-Auth + Vault-Zugriff (wie bestehende Plugin-Routen).

**Request/Response Beispiele:**

```
GET /api/v1/plugin-store/plugins
→ 200 { plugins: CommunityPluginEntry[], cachedAt: string, total: number }

GET /api/v1/plugin-store/plugins/calendar/manifest
→ 200 { manifest: RemotePluginManifest }

POST /api/v1/vaults/:vaultId/plugins/store-install
Body: { pluginId: "calendar", repo: "liamcain/obsidian-calendar-plugin" }
→ 201 { pluginId, manifest, isUpgrade, warnings }

POST /api/v1/vaults/:vaultId/plugins/check-updates
→ 200 { plugins: PluginUpdateInfo[], checkedAt, errors }

POST /api/v1/vaults/:vaultId/plugins/:pluginId/update
→ 200 { pluginId, manifest, isUpgrade, warnings }

POST /api/v1/vaults/:vaultId/plugins/update-all
→ 200 { updated: PluginInstallResult[], failed: { pluginId, reason }[] }
```

### Konfiguration

Neue Env-Vars (optional):

| Variable | Default | Beschreibung |
|----------|---------|--------------|
| `SLATEBASE_GITHUB_TOKEN` | (leer) | GitHub Personal Access Token für höheres Rate-Limit |
| `SLATEBASE_PLUGIN_STORE_CACHE_TTL` | `3600` | Cache-TTL für Plugin-Liste in Sekunden |
| `SLATEBASE_PLUGIN_STORE_AUTO_CHECK` | `true` | Automatischen Update-Check aktivieren |

### Persistenz

```
data/plugin-store/
└── last-update-check.json    — { timestamp: string, results: Record<vaultId, UpdateCheckResult> }
```

Minimale Persistenz — der Cache ist in-memory (geht bei Restart verloren, wird on-demand neu aufgebaut).

---

## Frontend-Design

### Komponentenstruktur

```
frontend/src/components/
├── PluginManagementPage.tsx    — Erweitert um Tab-Navigation
├── plugin-store/               — NEU: Store-Browser
│   ├── index.ts                — Barrel export
│   ├── PluginStoreBrowser.tsx  — Hauptkomponente (Suche + Filter + Liste)
│   ├── PluginStoreBrowser.css  — Styles
│   ├── PluginStoreCard.tsx     — Einzelnes Plugin in der Liste
│   ├── PluginStoreSearch.tsx   — Suchfeld + Filter-Controls
│   ├── PluginStoreSearch.css   — Search styles
│   ├── UpdateBanner.tsx        — "X Updates verfügbar" Banner
│   └── types.ts                — Frontend-spezifische Typen
```

### Tab-Integration in PluginManagementPage

Die bestehende `PluginManagementPage` bekommt eine Tab-Leiste:

```
┌──────────────────────────────────────────────────────────────┐
│  [Installierte Plugins]  [Verfügbare Plugins]                │
├──────────────────────────────────────────────────────────────┤
│  (Tab-Content)                                                │
└──────────────────────────────────────────────────────────────┘
```

- Default-Tab: "Installierte Plugins" (bestehende Ansicht)
- "Verfügbare Plugins" lädt den `PluginStoreBrowser`

### PluginStoreBrowser Layout

```
┌──────────────────────────────────────────────────────────────┐
│  [🔍 Plugin suchen...]  [Kategorie ▾]  [☑ Kompatibel]       │
│  [☑ Nicht installiert]  [Nach Updates suchen]  [Alle upd.]  │
├──────────────────────────────────────────────────────────────┤
│  1842 Plugins verfügbar · 47 angezeigt                       │
├──────────────────────────────────────────────────────────────┤
│  ┌────────────────────────────────────────────────────────┐  │
│  │  Calendar                              v1.5.1          │  │
│  │  Liam Cain · Explore your daily notes.                 │  │
│  │  [Installieren]                                        │  │
│  ├────────────────────────────────────────────────────────┤  │
│  │  Dataview                              v0.5.67         │  │
│  │  Michael Brenan · Complex data views...                │  │
│  │  ✓ Installiert (v0.5.64 → 0.5.67)   [Aktualisieren]  │  │
│  ├────────────────────────────────────────────────────────┤  │
│  │  ░░ Git ░░░░░░░░░░░░░░░░░░░░░░░░░   Nur Desktop ░░░  │  │
│  │  ░░ Vinzent · Integrate Git version control...  ░░░░  │  │
│  │  ░░ [Installieren] (disabled)                    ░░░  │  │
│  └────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────┘
```

### Desktop-Only Erkennung

Die `community-plugins.json` enthält KEIN `isDesktopOnly`-Feld. Dieses steht nur in der `manifest.json` des jeweiligen Repos. 

**Strategie:** 
- Die Plugin-Liste zeigt initial alle Plugins ohne Desktop-Only-Markierung
- Beim Laden der Liste holt das Backend NICHT automatisch alle ~6000 Manifeste ab (zu teuer)
- Stattdessen: Wenn ein User ein Plugin anklickt oder installieren will, wird das Remote-Manifest geladen
- Desktop-only-Status wird dann in der UI aktualisiert
- **Optimierung**: Das Backend könnte eine statische Blocklist mit bekannten Desktop-Only-Plugins mitliefern (manuell gepflegt oder durch Community-Daten). Für v1 reichen wir den Status nach wenn das Manifest geladen wird.
- **Alternative für v1**: Wir nutzen die bereits in `community-plugins.json` fehlende Information und prüfen `isDesktopOnly` nur bei Install-Versuch (Backend prüft vor Installation). Frontend zeigt dann ggf. den Fehler "Plugin ist nur für Desktop verfügbar".

**Entscheidung für v1:** Backend prüft `isDesktopOnly` beim Install und blockiert mit spezifischem Fehler. Im Frontend bleibt der Install-Button aktiv. Für v2: Hintergrund-Scan der populärsten Plugins + Blocklist-Cache.

### IApiClient-Erweiterung

```typescript
// Neue Methoden auf IApiClient:

/** Get community plugin list from store */
getStorePlugins(): Promise<{ plugins: CommunityPluginEntry[]; cachedAt: string; total: number }>

/** Get remote manifest for a community plugin */
getStorePluginManifest(pluginId: string): Promise<{ manifest: RemotePluginManifest }>

/** Install a plugin from the community store */
installFromStore(vaultId: string, pluginId: string, repo: string): Promise<PluginInstallResult>

/** Check for updates for installed plugins */
checkPluginUpdates(vaultId: string): Promise<UpdateCheckResult>

/** Update a single plugin to latest version */
updatePlugin(vaultId: string, pluginId: string): Promise<PluginInstallResult>

/** Update all plugins with available updates */
updateAllPlugins(vaultId: string): Promise<{ updated: PluginInstallResult[]; failed: Array<{ pluginId: string; reason: string }> }>
```

### Settings-Panel Anpassung

In `SettingsPanel.css` eine Ausnahme für die Plugin-Sektion:

```css
/* Plugin-Management braucht volle Breite für Store-Browser */
.settings-panel-content:has(.plugin-management-page) {
  max-width: none;
}
```

Falls `:has()` nicht breit genug unterstützt wird (>95% in 2026), alternativ eine CSS-Klasse auf den Content-Container setzen wenn die Plugin-Sektion aktiv ist.

### State Management

Kein neuer Context/Provider nötig. Der Plugin-Store-State lebt lokal in `PluginStoreBrowser`:

```typescript
// Lokaler State in PluginStoreBrowser
const [plugins, setPlugins] = useState<CommunityPluginEntry[]>([])
const [loading, setLoading] = useState(true)
const [searchQuery, setSearchQuery] = useState('')
const [categoryFilter, setCategoryFilter] = useState<string[]>([])
const [showCompatibleOnly, setShowCompatibleOnly] = useState(false)
const [showNotInstalled, setShowNotInstalled] = useState(false)
const [updateCheck, setUpdateCheck] = useState<UpdateCheckResult | null>(null)
const [installingPlugins, setInstallingPlugins] = useState<Set<string>>(new Set())
const [updatingPlugins, setUpdatingPlugins] = useState<Set<string>>(new Set())
```

### Filtering (Client-Side)

Die gesamte Plugin-Liste (~6000 Einträge) wird einmal vom Backend geladen und im Frontend gefiltert. Bei ~6000 Einträgen mit je ~200 Bytes ist das ~1.2 MB JSON — akzeptabel als einmaliger Ladevorgang.

```typescript
const filteredPlugins = useMemo(() => {
  return plugins.filter(p => {
    // Text-Suche
    if (searchQuery) {
      const q = searchQuery.toLowerCase()
      if (!p.name.toLowerCase().includes(q) &&
          !p.author.toLowerCase().includes(q) &&
          !p.description.toLowerCase().includes(q)) {
        return false
      }
    }
    // Kategorie-Filter (wenn verfügbar)
    // Installiert-Filter
    // Kompatibel-Filter (basierend auf gecachtem Desktop-Only-Status)
    return true
  })
}, [plugins, searchQuery, categoryFilter, showCompatibleOnly, showNotInstalled])
```

### Kategorien

Die `community-plugins.json` enthält keine Kategorien. Obsidian hat intern Kategorien, aber die sind nicht öffentlich in der JSON-Datei.

**Entscheidung:** Für v1 verzichten wir auf Kategorien als Filter. Die Textsuche reicht initial. Für v2 könnte man Kategorien aus einer separaten Quelle (Obsidian-Stats-API o.ä.) beziehen oder manuell pflegen.

**Update:** Falls `community-plugins.json` doch Kategorien enthält (format kann sich ändern), werden sie dynamisch extrahiert. Ansonsten: Nur Textsuche in v1.

---

## Sequenzdiagramme

### Plugin-Installation aus Store

```
User → Frontend → Backend → GitHub
 |       |          |         |
 |  klickt         |         |
 |  "Installieren" |         |
 |       |──POST store-install──→|
 |       |          |──GET releases/latest──→|
 |       |          |←──Release-Assets-URLs──|
 |       |          |──GET main.js──────────→|
 |       |          |←──Bundle-Content───────|
 |       |          |──GET manifest.json────→|
 |       |          |←──Manifest-Content─────|
 |       |          |──GET styles.css───────→| (optional)
 |       |          |←──Styles-Content───────|
 |       |          |                        |
 |       |          | [Validate + Save]      |
 |       |          |                        |
 |       |←──201 { manifest, warnings }──|
 |  zeigt Erfolg   |         |
 |  + Compat-Level |         |
```

### Update-Check

```
User → Frontend → Backend → GitHub (je installiertes Plugin)
 |       |          |         |
 |  klickt         |         |
 |  "Nach Updates  |         |
 |   suchen"       |         |
 |       |──POST check-updates──→|
 |       |          |──GET manifest.json (Plugin 1)──→|
 |       |          |←──manifest (v1.3.1)────────────|
 |       |          |──GET manifest.json (Plugin 2)──→|
 |       |          |←──manifest (v2.0.0)────────────|
 |       |          | ...                            |
 |       |          | [Compare versions]             |
 |       |←──200 { plugins: [...], errors: [...] }──|
 |  zeigt Updates  |         |
 |  "2 Updates"    |         |
```

---

## Fehlerbehandlung

| Szenario | Backend-Verhalten | Frontend-Verhalten |
|----------|---------------------|---------------------|
| GitHub Rate-Limit erreicht | 429 + `retryAfter` Header | Zeigt "Rate-Limit erreicht, bitte in X Min erneut versuchen" |
| Plugin-Repo nicht erreichbar | Skip + in `errors[]` aufnehmen | Zeigt Warnung bei betroffenen Plugins |
| `isDesktopOnly: true` bei Install | 400 `DESKTOP_ONLY_PLUGIN` | Zeigt "Plugin nur für Desktop verfügbar" |
| Asset > 10 MB | 400 `ASSET_TOO_LARGE` | Zeigt "Plugin zu groß für Installation" |
| Kein Cache + GitHub-Fehler | 502 `UPSTREAM_ERROR` | Zeigt "Plugin-Store nicht verfügbar" mit Retry |
| Version nicht höher (Downgrade) | 409 `VERSION_NOT_HIGHER` | Zeigt "Bereits auf neuestem Stand" |

---

## Sicherheit

1. **Domain-Allowlist**: Downloads nur von `github.com`, `raw.githubusercontent.com`, `objects.githubusercontent.com`
2. **Size-Limits**: 10 MB pro Asset, 15 MB Gesamt pro Plugin
3. **Keine User-Input-URLs**: `repo`-Feld wird gegen die `community-plugins.json` validiert (nur dort gelistete Repos sind installierbar)
4. **Rate-Limit-Schutz**: Backend tracked eigenes Request-Budget, pausiert bei niedrigem Remaining
5. **Token-Schutz**: `SLATEBASE_GITHUB_TOKEN` nie in Responses, nie in Logs
6. **Keine Ausführung**: Backend lädt nur Dateien herunter, führt keinen Code aus

---

## Migration / Abwärtskompatibilität

- Kein Breaking Change: Bestehende Plugin-Installation (ZIP-Upload, Detected-Plugins) bleibt unverändert
- Neue Routes sind additiv
- Feature liegt hinter bestehendem Toggle `obsidian-plugin-compat` — keine Sichtbarkeit wenn deaktiviert
- Cache-Verzeichnis `data/plugin-store/` wird bei erstem Zugriff erstellt

---

## Offene Entscheidungen / v2-Scope

| Thema | v1 | v2 |
|-------|----|----|
| Desktop-Only-Erkennung | Beim Install prüfen, Fehler anzeigen | Hintergrund-Scan, Blocklist-Cache |
| Kategorien | Nur Textsuche | Kategorie-Filter (externe Datenquelle) |
| Update-Notification | Badge bei Seitenöffnung | SSE Push-Event |
| Plugin-Bewertungen/Downloads | Nicht anzeigen | Download-Zahlen aus `community-plugin-stats.json` |
| Virtualisierung der Liste | CSS overflow-y + max-height | Virtualisierte Liste bei Performance-Problemen |
