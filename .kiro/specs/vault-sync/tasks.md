# Implementation Plan: Vault-Sync

## Overview

Implementierung der CouchDB-basierten Vault-Synchronisation für Slatebase. Das System agiert als CouchDB-kompatibler Sync-Client mit Unterstützung für bidirektionale und Read-Only-Modi, manuelle und intervallbasierte Auslösung, Analysemodus, Konflikterkennung und optionale E2E-Verschlüsselung. Die Implementierung folgt dem bestehenden modularen Pattern (analog zum Chat-Modul) mit Interface-First-Design, manueller DI und Filesystem-basierter Persistenz.

## Tasks

- [x] 1. Set up sync module structure, types, and error classes
  - [x] 1.1 Create sync module directory and define all TypeScript interfaces and data models
    - Create `backend/src/sync/` directory
    - Create `backend/src/sync/types.ts` with all interfaces: `ISyncService`, `ISyncEngine`, `ISyncConfigStore`, `ISyncLogStore`, `IConflictStore`, `ICryptoService`, `ISetupUriParser`, `ISyncScheduler`, `ISyncLock`, `ICheckpointStore`
    - Define all data models: `SyncConfig`, `SyncCheckpoint`, `SyncLogEntry`, `SyncErrorDetail`, `ConflictEntry`, `ConflictResolution`, `AnalysisResult`, `CategorySummary`, `AnalysisDetail`
    - Define API input/output types: `CreateSyncConfigInput`, `UpdateSyncConfigInput`, `SyncConfigResponse`, `SyncConfigResult`, `ConnectionTestResult`, `SyncResult`, `PaginatedSyncLog`
    - _Requirements: 1.1, 1.2, 2.1, 3.1, 4.1, 5.1, 6.2, 7.1_

  - [x] 1.2 Create error classes for the sync module
    - Create `backend/src/sync/errors.ts`
    - Implement: `SyncNotConfiguredError`, `SyncAlreadyConfiguredError`, `SyncInProgressError`, `ConnectionTestFailedError`, `InvalidSetupUriError`, `InvalidSyncIntervalError`, `InvalidPassphraseError`, `ConflictResolutionError`
    - _Requirements: 1.5, 1.6, 1.7, 1.8, 2.7, 3.5, 3.7, 6.5, 6.6, 6.7, 8.6_

  - [x] 1.3 Create Zod validation schemas for sync input
    - Create `backend/src/sync/validation.ts`
    - Define schemas: `createSyncConfigSchema` (setupUri OR manual config), `updateSyncConfigSchema`, `triggerSyncSchema`, `resolveConflictSchema`, `syncLogQuerySchema`
    - Validate: Vault-ID (hex, 12 chars), Endpoint-URL (http/https, max 2048), database name (CouchDB rules, max 256), username (non-empty, max 256), password (non-empty, max 1024), mode (`bidirectional`|`readonly`), interval (integer 5-1440), passphrase (8-256 chars), Setup-URI (max 4096 chars)
    - Apply string trimming before validation for required fields
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 1.2, 1.8, 3.5, 8.6_

- [x] 2. Implement utility layer (CryptoService, SetupUriParser, SyncLock)
  - [x] 2.1 Implement CryptoService for credential and document encryption
    - Create `backend/src/sync/crypto-service.ts`
    - Implement `ICryptoService` interface
    - `encrypt(plaintext)` / `decrypt(ciphertext)`: AES-256-GCM with server secret from `SLATEBASE_SYNC_SECRET` env var
    - `encryptDocument(content, passphrase)` / `decryptDocument(encrypted, passphrase)`: AES-GCM compatible with obsidian-livesync format
    - Use Node.js `crypto` module (no external dependencies)
    - _Requirements: 1.9, 8.1, 8.2, 8.5_

  - [x]* 2.2 Write property test for E2E encryption round-trip
    - **Property 21: E2E Encryption Round-Trip**
    - For any valid document content (arbitrary bytes) and any valid passphrase (8-256 characters), encrypting then decrypting SHALL produce identical content
    - **Validates: Requirements 8.1, 8.2**

  - [x]* 2.3 Write property test for credential encryption in storage
    - **Property 4: Credential Encryption in Storage**
    - For any stored credentials, reading the raw file SHALL never reveal plaintext values
    - **Validates: Requirements 1.9, 8.5**

  - [x] 2.4 Implement SetupUriParser for obsidian-livesync URI format
    - Create `backend/src/sync/setup-uri-parser.ts`
    - Implement `ISetupUriParser` interface
    - Parse Base64-encoded, AES-GCM-encrypted JSON string containing: endpoint, database, username, password, encryption settings
    - Validate URI format and length (max 4096 chars)
    - Throw `InvalidSetupUriError` on parse failure
    - _Requirements: 1.1, 1.7, 10.4_

  - [x]* 2.5 Write property test for Setup-URI parsing round-trip
    - **Property 1: Setup-URI Parsing Round-Trip**
    - For any valid connection parameters, encoding into Setup-URI format and parsing back SHALL produce the same parameters
    - **Validates: Requirements 1.1**

  - [x] 2.6 Implement SyncLock for concurrency control
    - Create `backend/src/sync/sync-lock.ts`
    - Implement `ISyncLock` interface using `Map<string, boolean>`
    - `acquire(vaultId)`: returns false if already locked
    - `release(vaultId)`: frees the lock
    - `isLocked(vaultId)`: check status
    - Single-threaded Node.js — no TOCTOU issues
    - _Requirements: 3.7, 6.7_

- [x] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Implement store layer (SyncConfigStore, SyncLogStore, ConflictStore, CheckpointStore)
  - [x] 4.1 Implement SyncConfigStore for configuration persistence
    - Create `backend/src/sync/sync-config-store.ts`
    - Implement `ISyncConfigStore` interface
    - Filesystem path: `data/sync/<vaultId>/config.json`
    - Atomic writes (temp file → rename)
    - `save()`, `load()`, `remove()`, `loadAll()` methods
    - Credentials stored encrypted via CryptoService
    - _Requirements: 1.1, 1.2, 1.9, 2.4, 2.6_

  - [x] 4.2 Implement SyncLogStore for sync log persistence
    - Create `backend/src/sync/sync-log-store.ts`
    - Implement `ISyncLogStore` interface
    - Filesystem path: `data/sync/<vaultId>/sync-log.jsonl` (Append-Only JSONL)
    - `append()`: add entry, rotate if > 1000 entries (remove oldest)
    - `read()`: paginated read (default 50, max 100, sorted descending by timestamp)
    - `updateLast()`: update the last entry (for status updates)
    - Handle corrupt/unreadable files gracefully (return empty response, log error)
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8_

  - [x]* 4.3 Write property tests for log pagination and rotation
    - **Property 12: Log Pagination Consistency**
    - For any log with N entries queried with page P and pageSize S: `totalPages = ceil(N/S)`, `items.length <= S`, `total = N`
    - **Property 13: Log Rotation Cap**
    - After any write, total entries SHALL never exceed 1000
    - **Validates: Requirements 5.4, 5.7**

  - [x] 4.4 Implement ConflictStore for conflict persistence
    - Create `backend/src/sync/conflict-store.ts`
    - Implement `IConflictStore` interface
    - Filesystem path: `data/sync/<vaultId>/conflicts.json`
    - Atomic writes for all mutations
    - `add()`, `getAll()`, `remove()`, `exists()` methods
    - _Requirements: 7.1, 7.5, 7.9_

  - [x] 4.5 Implement CheckpointStore for sync checkpoint persistence
    - Create `backend/src/sync/checkpoint-store.ts`
    - Implement `ICheckpointStore` interface
    - Filesystem path: `data/sync/<vaultId>/checkpoint.json`
    - Atomic writes (temp → rename)
    - `save()`, `load()`, `remove()` methods
    - Handle missing/corrupt checkpoint gracefully (return null → triggers full pull)
    - _Requirements: 4.4, 4.9_

- [x] 5. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement SyncEngine (CouchDB communication)
  - [x] 6.1 Implement SyncEngine core with connection testing and Changes Feed
    - Create `backend/src/sync/sync-engine.ts`
    - Implement `ISyncEngine` interface
    - `testConnection()`: HTTP request to CouchDB with 10s timeout, check reachability and auth
    - `pull()`: Use CouchDB `_changes` API with `since` parameter, 30s timeout per request
    - Handle chunk reassembly for obsidian-livesync fragmented documents
    - Derive file paths from CouchDB document metadata (obsidian-livesync path convention)
    - Use native `fetch()` (Node.js 22)
    - _Requirements: 1.3, 4.1, 4.2, 4.5, 4.6, 4.9_

  - [x] 6.2 Implement push logic and analysis mode in SyncEngine
    - `push()`: Detect local changes via mtime comparison with checkpoint, send to CouchDB
    - Handle deleted local files → mark as `_deleted: true` in CouchDB
    - Handle deleted remote documents → remove local file (with mtime guard)
    - `analyze()`: Query Changes Feed and compare with local state without writing
    - Categorize documents: `remote_newer`, `local_newer`, `remote_only`, `local_only`, `conflict`, `identical`
    - 120s timeout for analysis operations
    - _Requirements: 4.3, 4.10, 4.11, 6.1, 6.2, 6.3_

  - [x]* 6.3 Write property tests for SyncEngine pure functions
    - **Property 7: Readonly Mode Prevents Push**
    - For any sync in `readonly` mode, zero push operations SHALL occur
    - **Property 8: Chunk Reassembly Integrity**
    - For any file split into chunks, reassembly SHALL produce byte-for-byte identical content
    - **Property 9: Local Change Detection via mtime**
    - Files with mtime differing from checkpoint are "changed", matching mtimes are "unchanged"
    - **Property 10: Error Resilience — Partial Failures Continue**
    - If a subset of documents fails, remaining documents SHALL still be processed
    - **Validates: Requirements 3.3, 4.2, 4.3, 4.8**

  - [x]* 6.4 Write property tests for analysis categorization
    - **Property 16: Analysis Categorization Correctness**
    - For any pair of local/remote state, exactly one correct category SHALL be assigned
    - **Property 17: Analysis Summary Aggregation**
    - Summary counts and byte totals SHALL match the detail list per category
    - **Validates: Requirements 6.2, 6.3**

- [x] 7. Implement SyncScheduler for interval-based triggering
  - [x] 7.1 Implement SyncScheduler with setInterval management
    - Create `backend/src/sync/sync-scheduler.ts`
    - Implement `ISyncScheduler` interface
    - `start(vaultId, intervalMinutes, callback)`: create interval timer
    - `stop(vaultId)`: clear interval
    - `reset(vaultId)`: clear and restart timer (after manual sync)
    - `isActive(vaultId)`: check if timer exists
    - `stopAll()`: cleanup for shutdown
    - Scheduler callback checks `syncLock.isLocked()` — skip if locked
    - _Requirements: 3.2, 3.6, 3.8_

- [x] 8. Implement SyncService (business logic orchestrator)
  - [x] 8.1 Implement SyncService — configuration management
    - Create `backend/src/sync/sync-service.ts`
    - Implement `ISyncService` interface (config methods)
    - `createConfig()`: validate input, parse Setup-URI if provided, encrypt credentials, save config, run connection test, start scheduler if interval configured
    - `getConfig()`: load config, mask password (all `*` except last 4 chars; fully mask if < 4 chars), return response
    - `updateConfig()`: check lock, validate, connection test (reject with 422 on failure), atomic overwrite
    - `disableConfig()`: set status to `disabled`, let running sync finish, stop scheduler
    - `enableConfig()`: set status to `active`, restart scheduler if interval configured
    - `removeConfig()`: delete config + checkpoint + credentials, stop scheduler, keep sync log
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.6, 1.9, 2.1, 2.2, 2.3, 2.4, 2.6, 2.7_

  - [x]* 8.2 Write property tests for password masking and interval validation
    - **Property 5: Password Masking in API Responses**
    - Masking replaces all chars with `*` except last 4 (or fully masks if length < 4), preserving length
    - **Property 6: Sync Interval Validation**
    - Accept values in [5, 1440], reject all others
    - **Property 22: E2E Passphrase Validation**
    - Accept strings with length [8, 256], reject shorter or longer
    - **Validates: Requirements 2.1, 3.2, 3.5, 8.6, 10.5**

  - [x] 8.3 Implement SyncService — sync execution and analysis
    - `triggerSync()`: acquire lock, load config, create log entry (started), execute pull (and push if bidirectional), handle conflicts (pre-write mtime check), update checkpoint on success/partial_success, update log entry, release lock, reset scheduler timer
    - `analyze()`: acquire lock, load config, call engine.analyze(), release lock
    - `getLog()`: delegate to SyncLogStore with pagination
    - `initializeSchedulers()`: load all active configs with intervals, start schedulers
    - Implement atomic file writes (temp → rename) for vault file operations
    - _Requirements: 3.1, 3.3, 3.4, 3.6, 3.7, 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 4.10, 4.11, 5.1, 5.2, 6.1, 6.2, 6.3, 6.5, 6.6, 6.7_

  - [x] 8.4 Implement SyncService — conflict management
    - `getConflicts()`: delegate to ConflictStore
    - `resolveConflict()`: acquire lock, execute resolution (use_remote: overwrite local with CouchDB version; use_local: push local to CouchDB if bidirectional; skip: no-op), remove from conflict store on success, release lock
    - Preserve existing unresolved conflicts across new syncs
    - Reject `use_local` in readonly mode
    - _Requirements: 7.1, 7.4, 7.5, 7.6, 7.8, 7.9_

  - [x]* 8.5 Write property tests for conflict and data safety
    - **Property 18: Conflict Detection — No Auto-Overwrite**
    - Documents modified both locally and remotely SHALL never be auto-overwritten
    - **Property 19: Conflict Recommendation Logic**
    - Newer modification date is recommended; if identical, remote is recommended
    - **Property 20: Existing Conflicts Preserved Across Syncs**
    - Unresolved conflicts SHALL be preserved; new conflicts only for documents without existing entries
    - **Property 25: No Data Loss on Concurrent Edit**
    - Files modified locally during pull SHALL create conflict, not overwrite
    - **Property 26: Checkpoint Atomicity**
    - Failed syncs SHALL leave checkpoint unchanged
    - **Property 27: Delete Safety — mtime Guard**
    - Remote deletions SHALL only delete local file if mtime matches checkpoint
    - **Validates: Requirements 7.1, 7.3, 7.9, Datenverlust-Prävention**

- [x] 9. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Implement API layer (syncRoutes, access control)
  - [x] 10.1 Create sync route module with access control middleware
    - Create `backend/src/api/syncRoutes.ts`
    - Register all sync endpoints under `/vaults/:vaultId/sync/`
    - Implement access control check order: Authentication (401) → Vault existence (404) → Owner permission (403)
    - Use existing `createAuthMiddleware` for authentication
    - Check vault ownership via `IVaultRegistry.findById(vaultId).ownerId`
    - Admin role does NOT bypass owner check
    - Map domain errors to HTTP responses (error-to-HTTP mapping table from design)
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 1.5, 2.5_

  - [x]* 10.2 Write property tests for access control and input validation
    - **Property 2: Input Validation Correctness**
    - Zod schemas SHALL accept conforming inputs and reject violating inputs
    - **Property 3: Access Control Enforcement**
    - Non-owner authenticated users (including admins) SHALL receive 403
    - **Property 23: Auth Check Ordering**
    - Error responses SHALL follow priority: 401 → 404 → 403
    - **Property 24: String Trimming for Required Fields**
    - Leading/trailing whitespace SHALL be removed; empty-after-trim SHALL be rejected
    - **Validates: Requirements 1.5, 2.5, 9.3, 9.5, 9.6, 9.7, 10.1, 10.6**

  - [x]* 10.3 Write property test for log security
    - **Property 11: Log Error Truncation**
    - Each error description SHALL be max 500 chars, max 100 error entries per operation
    - **Property 14: No Credentials in Log Entries**
    - Log entries SHALL never contain credential values or document content
    - **Property 15: Analysis is Read-Only**
    - Analysis SHALL perform zero write operations
    - **Validates: Requirements 5.3, 5.6, 6.1**

- [x] 11. Wire sync module into composition root
  - [x] 11.1 Integrate SyncService into backend composition root and register routes
    - Update `backend/src/index.ts` to instantiate all sync dependencies:
      - CryptoService (with `SLATEBASE_SYNC_SECRET` env var)
      - SetupUriParser
      - SyncLock
      - SyncConfigStore, SyncLogStore, ConflictStore, CheckpointStore
      - SyncEngine
      - SyncScheduler
      - SyncService (with all dependencies injected)
    - Register sync routes in the Hono app
    - Call `syncService.initializeSchedulers()` during startup (after vault initialization)
    - Create barrel export `backend/src/sync/index.ts`
    - _Requirements: 3.8_

- [x] 12. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 13. Implement frontend sync UI
  - [x] 13.1 Create sync state management (reducer, context, actions)
    - Create `frontend/src/state/syncState.ts` with `syncReducer`
    - Create `frontend/src/state/syncContext.ts` with `SyncProvider` and `useSyncContext()` hook
    - Create `frontend/src/state/syncActions.ts` with action creators:
      - `loadSyncConfig()`, `createSyncConfig()`, `updateSyncConfig()`, `disableSyncConfig()`, `enableSyncConfig()`, `removeSyncConfig()`
      - `triggerSync()`, `triggerAnalysis()`
      - `loadSyncLog()`, `loadConflicts()`, `resolveConflict()`
    - Define sync state: config, log, conflicts, analysis result, loading states, errors
    - _Requirements: 1.1, 2.1, 3.6, 6.4, 7.2_

  - [x] 13.2 Implement SyncConfigPage component
    - Create `frontend/src/components/SyncConfigPage.tsx`
    - Setup-URI input with passphrase field (obsidian-livesync format)
    - Manual configuration form: endpoint URL, database name, username, password
    - Mode selector: bidirectional / readonly
    - Trigger selector: manual / interval (with interval minutes input)
    - E2E encryption toggle with passphrase input (min 8, max 256 chars)
    - Connection test result display (reachable/auth status)
    - Disable/Enable/Remove actions with confirmation dialogs
    - Display masked password in config view
    - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 3.1, 3.2, 8.7_

  - [x] 13.3 Implement SyncStatusPanel and SyncAnalysisView components
    - Create `frontend/src/components/SyncStatusPanel.tsx`
    - Show current sync status, last sync time, open conflict count
    - Manual sync trigger button
    - Analysis trigger button
    - Create `frontend/src/components/SyncAnalysisView.tsx`
    - Display analysis results: category counters (remote_newer, local_newer, remote_only, local_only, conflict, identical)
    - Detail list with: path, category, revision, modification dates, file sizes
    - Category filter for detail list
    - _Requirements: 6.2, 6.3, 6.4, 7.7_

  - [x] 13.4 Implement ConflictResolutionView component
    - Create `frontend/src/components/ConflictResolutionView.tsx`
    - Display conflict list: document path, local info (modified date, size), remote info (revision, modified date, size)
    - Show recommendation based on modification date (newer = recommended; if equal, remote recommended)
    - Resolution options per conflict: "Remote-Version übernehmen", "Lokale Version behalten" (disabled in readonly mode), "Überspringen"
    - Confirmation dialog for E2E encryption activation/passphrase change
    - _Requirements: 7.2, 7.3, 7.4, 7.6, 8.7, 8.8_

  - [x] 13.5 Add IApiClient sync methods and integrate sync UI into app
    - Extend `frontend/src/api/index.ts` `IApiClient` interface with sync methods
    - Implement all sync API calls in the fetch-based ApiClient
    - Integrate SyncConfigPage as a settings tab (accessible from vault toolbar for owner)
    - Add SyncStatusPanel to vault view (visible when sync is configured)
    - Add conflict count badge in sync status area
    - _Requirements: 2.1, 6.4, 7.2, 7.7_

- [x] 14. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The backend uses TypeScript strict mode with ESM (`.js` extensions in imports)
- All new files follow the existing interface-first pattern with manual DI
- The sync module structure mirrors the chat module (`backend/src/chat/`)
- Frontend components follow the existing pattern: useReducer + Context, action creators as standalone functions

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["2.1", "2.4", "2.6"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.5"] },
    { "id": 3, "tasks": ["4.1", "4.2", "4.4", "4.5"] },
    { "id": 4, "tasks": ["4.3", "6.1", "7.1"] },
    { "id": 5, "tasks": ["6.2"] },
    { "id": 6, "tasks": ["6.3", "6.4", "8.1"] },
    { "id": 7, "tasks": ["8.2", "8.3"] },
    { "id": 8, "tasks": ["8.4", "8.5"] },
    { "id": 9, "tasks": ["10.1"] },
    { "id": 10, "tasks": ["10.2", "10.3", "11.1"] },
    { "id": 11, "tasks": ["13.1"] },
    { "id": 12, "tasks": ["13.2", "13.3", "13.4"] },
    { "id": 13, "tasks": ["13.5"] }
  ]
}
```
