# Design Document: Git-Sync

## Overview

Git-Sync synchronisiert einen Vault serverseitig mit einem oder mehreren Git-Remotes. Im Unterschied zur bisherigen Lösung (obsidian-git-Plugin über den Browser-Kompat-Layer, isomorphic-git + CORS-Proxy) shellt das Backend direkt auf das native `git`-Binary aus. Das läuft headless (kein offener Browser-Tab nötig), unterstützt SSH-Remotes, und vermeidet den CORS-Proxy als zusätzliche Vertrauens-/Datenschutzgrenze.

**Kernprinzipien:**
- Ein Vault = ein lokales Git-Repository = ein Branch, geteilt von allen Remotes dieses Vaults
- `execFile` mit Argument-Array, nie ein Shell-String (Remote-URL/Branch sind Nutzereingaben)
- Credentials verlassen den Prozess nie über argv oder die gespeicherte Remote-URL
- Merge-Konflikte werden nicht versteckt oder automatisch aufgelöst, sondern als normale Git-Konfliktmarker im Editor sichtbar gemacht

## Architecture

### Neue Dateien

| Pfad | Verantwortung |
|------|---------------|
| `backend/src/git-sync/types.ts` | Datenmodelle: `GitSyncRemoteConfig`, `GitSyncVaultData`, `GitSyncRemoteStatus`, `GitAuthContext` |
| `backend/src/git-sync/errors.ts` | `GitSyncRemoteNotFoundError`, `GitSyncRemoteLimitExceededError`, `GitCommandFailedError` |
| `backend/src/git-sync/validation.ts` | Zod-Schemas für Create/Update, Branch-/ID-Validatoren |
| `backend/src/git-sync/config-store.ts` | `GitSyncConfigStore` — Branch + Remote-Liste pro Vault (`data/git-sync/config/<vaultId>.json`) |
| `backend/src/git-sync/status-store.ts` | `GitSyncStatusStore` — letzter Lauf-Status pro Remote (`data/git-sync/status/<vaultId>.json`) |
| `backend/src/git-sync/git-cli.ts` | `GitCli` — Wrapper um das native `git`-Binary (execFile, Auth-Handling) |
| `backend/src/git-sync/ssh-keygen.ts` | `SshKeyGenerator` — Wrapper um `ssh-keygen`: neues ed25519-Schlüsselpaar erzeugen, öffentlichen Schlüssel aus einem vorhandenen privaten Schlüssel ableiten |
| `backend/src/git-sync/sync-engine.ts` | `GitSyncEngine` — ein Fetch/Merge/Push-Zyklus pro Remote |
| `backend/src/git-sync/git-sync-scheduler.ts` | `GitSyncScheduler` — periodischer Tick, führt fällige Remotes aus |
| `backend/src/api/gitSyncRoutes.ts` | REST-Endpunkte (CRUD, manueller Trigger, Status) |
| `backend/src/shared-secrets/*` | Von Git-Sync und Mail-Import gemeinsam genutzter, verschlüsselter Credential-Store |

### Datenfluss

```
Scheduler-Tick (60s) ──▶ fällige, aktivierte Remotes ermitteln
                              │
                              ▼
                     GitSyncEngine.runOne(vaultId, remoteId)
                              │
     ┌────────────────────────┼─────────────────────────┐
     ▼                        ▼                          ▼
 Credential aus         Repo init/config,          .gitignore
 ModuleSecretStore       falls nötig                sicherstellen
     │                        │                          │
     └────────────────────────┴──────────────┬───────────┘
                                              ▼
                              commitAll → fetch → merge → push
                                              │
                                   Ergebnis in StatusStore
```

## Components and Interfaces

```typescript
// backend/src/git-sync/types.ts
export type GitAuthMethod = 'https-token' | 'ssh-key'
export type GitSyncResult = 'success' | 'error' | 'conflict'

export interface GitSyncRemoteConfig {
  id: string
  vaultId: string
  name: string
  remoteUrl: string
  authMethod: GitAuthMethod
  /** Öffentlicher Schlüssel, serverseitig via `ssh-keygen -y` aus dem gespeicherten privaten Schlüssel abgeleitet — für die Anzeige (GitHub Deploy Key). `null` bei `https-token`. Optional, damit vor diesem Feld persistierte Datensätze weiter parsen. */
  publicKey?: string | null
  intervalMinutes: number
  enabled: boolean
  createdAt: string
  updatedAt: string
}

/** Branch ist vault-weit, nicht pro Remote — siehe Requirement 1.3 */
export interface GitSyncVaultData {
  branch: string
  remotes: GitSyncRemoteConfig[]
}

export interface GitSyncRemoteStatus {
  remoteId: string
  lastRunAt: string | null
  lastResult: GitSyncResult | null
  lastError: string | null
  conflictFiles: string[]
  /** Dateien, die der letzte erfolgreiche Merge mitgebracht hat. `null`, wenn nicht anwendbar (error/conflict/noch kein Lauf). */
  lastPulledFiles: number | null
  /** Dateien, die im letzten erfolgreichen Lauf lokal committet und gepusht wurden. `null`, wenn nicht anwendbar. */
  lastPushedFiles: number | null
}

export type GitAuthContext =
  | { method: 'https-token'; token: string }
  | { method: 'ssh-key'; privateKey: string; knownHostsPath: string }
```

```typescript
// backend/src/git-sync/git-cli.ts
export interface IGitCli {
  isRepo(cwd: string): Promise<boolean>
  init(cwd: string, initialBranch: string): Promise<void>
  configureIdentity(cwd: string): Promise<void>
  remoteAddOrSetUrl(cwd: string, remoteName: string, url: string): Promise<void>
  hasUncommittedChanges(cwd: string): Promise<boolean>
  commitAll(cwd: string, message: string): Promise<void>
  fetch(cwd: string, remoteName: string, branch: string, auth: GitAuthContext): Promise<void>
  mergeNoEdit(cwd: string, remoteName: string, branch: string): Promise<'merged' | 'up-to-date' | 'conflict'>
  conflictedFiles(cwd: string): Promise<string[]>
  push(cwd: string, remoteName: string, branch: string, auth: GitAuthContext): Promise<void>
}
```

### Credential-Übergabe an `git`

- **HTTPS (PAT):** `GIT_ASKPASS` zeigt auf ein pro Lauf erzeugtes, ausführbares Skript (`chmod 700`, gelöscht in `finally`). Das Skript liest das Token aus der Umgebungsvariable `SLATEBASE_GIT_TOKEN` (nur für diesen einen `git`-Aufruf gesetzt) und gibt es auf Passwort-Prompts zurück; auf Username-Prompts wird ein fester Platzhalter zurückgegeben.
- **SSH:** Privater Schlüssel wird in eine temporäre Datei (`0600`) geschrieben und via `GIT_SSH_COMMAND` referenziert (`-i <keyfile> -o StrictHostKeyChecking=accept-new -o UserKnownHostsFile=<persistenter Pfad pro Remote>`). Der `known_hosts`-Pfad liegt unter `data/git-sync/known-hosts/<remoteId>.txt` und bleibt zwischen Läufen erhalten (echtes Trust-on-First-Use statt Reset bei jedem Lauf).

### SSH-Schlüsselgenerierung

Da ein von Hand kopierter privater Schlüssel leicht die PEM-Rahmung (`-----BEGIN/-----END-----`) verliert oder CRLF-Zeilenenden bekommt (beobachtet in einem echten Vorfall, führte zum irreführenden OpenSSL-Fehler `error in libcrypto: unsupported`), kann Slatebase das Schlüsselpaar stattdessen serverseitig erzeugen:

- `POST /vaults/:vaultId/git-sync/generate-ssh-key` erzeugt ein neues, passphrase-loses ed25519-Schlüsselpaar via `ssh-keygen -t ed25519 -N '' -C <comment> -f <tmp>` und gibt `{ privateKey, publicKey }` zurück. Zustandslos — nichts wird hier persistiert, der Aufrufer übergibt den privaten Schlüssel danach ganz normal über Create/Update.
- Bei jedem Anlegen/Aktualisieren eines Remotes mit `authMethod: 'ssh-key'` leitet der Server zusätzlich via `ssh-keygen -y -f <tmp>` den öffentlichen Schlüssel aus dem (generierten oder von Hand eingefügten) privaten Schlüssel ab und speichert ihn in `publicKey` — das validiert den Schlüssel robuster als die reine Regex-Prüfung in `validation.ts` (schlägt bei jedem strukturell ungültigen Schlüssel fehl, nicht nur bei fehlender Rahmung) und macht den öffentlichen Schlüssel dauerhaft in der UI sichtbar, unabhängig vom Ursprung des privaten Schlüssels.
- Wechselt ein Remote von `ssh-key` zurück auf `https-token`, wird `publicKey` auf `null` zurückgesetzt.

### Remote-Namensableitung

Der interne Git-Remote-Name wird aus der `configId` abgeleitet (`slatebase-<remoteId>`), nicht aus dem frei wählbaren, benutzerlesbaren `name`-Feld — vermeidet ungültige Git-Remote-Namen und Kollisionen bei Umbenennung.

## Data Models

Persistenz-Layout (server-seitig, außerhalb des Vault-Ordners, analog zu Plugin-Daten):

```
data/git-sync/config/<vaultId>.json   → { branch, remotes: GitSyncRemoteConfig[] }
data/git-sync/status/<vaultId>.json   → { [remoteId]: GitSyncRemoteStatus }
data/git-sync/known-hosts/<remoteId>.txt
data/module-secrets/<vaultId>/git-sync/secrets.json   → verschlüsselte Credentials
```

## Error Handling

| Fehlerfall | HTTP-Status | Code | Behandlung |
|------------|-------------|------|------------|
| Remote nicht gefunden | 404 | `GIT_SYNC_REMOTE_NOT_FOUND` | Standard API-Error |
| Remote-Limit erreicht (20) | 409 | `GIT_SYNC_REMOTE_LIMIT_EXCEEDED` | Standard API-Error |
| `git`-Kommando fehlgeschlagen (kein Konflikt) | — | `GIT_COMMAND_FAILED` | Lauf als `error` protokolliert, nicht an Client geworfen |
| Merge-Konflikt | — | — | Lauf als `conflict` protokolliert, Konfliktdateien im Status |
| Kein Credential gespeichert | — | — | Lauf als `error` protokolliert ("No credential stored") |
| Feature deaktiviert | 403 | `FEATURE_DISABLED` | `createFeatureGuard('git-sync', ...)` |

## Testing Strategy

- **`git-cli.test.ts`** (Integrations-Test gegen echtes `git`-Binary, lokale Bare-Repos als Remote, kein Netzwerk): init/isRepo, bedingtes Commit, Push/Fetch/Merge im Erfolgsfall, Konflikterkennung inkl. Konfliktmarker im Arbeitsverzeichnis
- **`sync-engine.test.ts`** (Unit, `IGitCli` gemockt): Repo-Init bei erstem Lauf, `.gitignore`-Erstellung, Skip-Merge-bei-fehlgeschlagenem-Fetch (neuer Remote), Konflikt-Pfad (kein Push, Status `conflict`), fehlendes Credential ohne Git-Aufruf, unbekannter Remote wirft
- **`config-store.test.ts`**: CRUD, Mandantentrennung pro Vault, Limit-Durchsetzung, Branch-Update
- **`git-sync-scheduler.test.ts`**: Fälligkeits-Logik, disabled-Filter, Fehler-Isolation pro Remote, Überlappungsschutz
- **`ssh-keygen.test.ts`** (Integrations-Test gegen echtes `ssh-keygen`-Binary): Schlüsselerzeugung mit korrekter PEM-Rahmung, unterschiedliche Schlüssel pro Aufruf, Ableitung des öffentlichen Schlüssels aus einem generierten privaten Schlüssel (inkl. CRLF-Normalisierung), Fehlschlag bei ungültigem Schlüssel
- **`validation.test.ts`**: Zod-Schema-Verhalten für Create/Update (PEM-Rahmungs-Prüfung, https-token unberührt, Branch-Namensvalidierung)
- **`sync-engine.test.ts`** (ergänzt): Sicherheitsnetz gegen Fehlauflösung (Konfliktmarker noch vorhanden → sofortiger Abbruch ohne Commit/Push; keine Marker mehr → normaler Ablauf; Datei gelöscht → gilt als gelöst), `pulledFiles`/`pushedFiles`-Berechnung (inkl. Fall "kein lokaler Commit nötig, da HEAD unverändert")
- **`git-sync-scheduler.test.ts`** (ergänzt): Remote mit Status `conflict` wird trotz abgelaufenem Intervall nicht erneut angefasst
