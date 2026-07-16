# Implementation Plan: Sync Conflict Resolution

## Overview

Erweiterung des Sync-Systems um einen halbautomatischen Konflikt-Workflow mit Kategorisierung, Diff-Ansicht, Batch-Auflösung, Auto-Resolution-Strategien und einem mehrstufigen Wizard-Dialog. Die Implementierung erfolgt Bottom-Up: Backend-Infrastruktur → API-Erweiterungen → Frontend-Utilities → UI-Komponenten → Integration.

## Tasks

- [x] 1. Backend: Typen, Errors und Conflict-Kategorisierung
  - [x] 1.1 Extend sync types with ConflictCategory and CategorizedConflictEntry
    - Add `ConflictCategory` type (`content_conflict | local_deleted | remote_deleted | rename_conflict`)
    - Add `CategorizedConflictEntry` interface extending `ConflictEntry` with `category`, `localContentHash?`, `remoteContentHash?`
    - Add `ConflictResolutionAction` discriminated union type
    - Add `AutoResolutionConfig` and `AutoResolutionStrategy` types
    - Add `AutoResolvedLogDetail` and `BatchResolveResult` interfaces
    - Ensure backward-compat: existing entries without `category` default to `content_conflict`
    - _Requirements: 1.1, 4.1_

  - [x] 1.2 Create new error classes in `sync/errors.ts`
    - Add `ConflictNotFoundError` (maps to 404)
    - Add `BatchLimitExceededError` (maps to 400)
    - Add `FileContentUnavailableError` (maps to 404)
    - Add `SchedulerAlreadyPausedError` (maps to 409)
    - Add `AutoResolutionConfigError` (maps to 400)
    - _Requirements: 6.8, 5.6_

  - [x] 1.3 Create conflict categorizer module (`sync/conflict-categorizer.ts`)
    - Implement `categorizeConflict()` function: given local/remote file state, produce exactly one category
    - Logic: both modified → `content_conflict`; local absent & remote present → `local_deleted`; remote absent & local present → `remote_deleted`; same content hash at different paths → `rename_conflict`
    - Implement `categorizeConflicts()` for bulk categorization
    - _Requirements: 1.1_

  - [ ]* 1.4 Write property test for conflict categorizer (Property 1)
    - **Property 1: Conflict categorization is deterministic and correct**
    - **Validates: Requirements 1.1**
    - Use fast-check to generate arbitrary file states, verify exactly one category produced per conflict

- [x] 2. Backend: ConflictResolver (atomic resolution with rollback)
  - [x] 2.1 Create `sync/conflict-resolver.ts` implementing `IConflictResolver`
    - Implement `resolve()`: backup local → write resolved content → push to CouchDB → on CouchDB failure rollback local file
    - Implement `resolveBatch()`: sequential processing with per-item error isolation
    - Enforce batch limit (max 100), throw `BatchLimitExceededError` if exceeded
    - Use `SyncLock` to serialize operations per vault
    - _Requirements: 5.5, 5.6, 3.4, 6.8_

  - [ ]* 2.2 Write property test for atomic resolution with rollback (Property 7)
    - **Property 7: Atomic resolution with rollback**
    - **Validates: Requirements 5.5, 5.6**
    - Simulate CouchDB push failures, verify local file restored to exact pre-resolution content

  - [ ]* 2.3 Write property test for batch resolution isolation (Property 4)
    - **Property 4: Batch resolution processes all items with partial failure isolation**
    - **Validates: Requirements 3.4**
    - Generate N conflicts with random success/failure, verify `succeeded + failed = total = N`

  - [ ]* 2.4 Write property test for batch size limit (Property 10)
    - **Property 10: Batch size limit enforcement**
    - **Validates: Requirements 6.8**
    - Verify K > 100 → rejected, K ≤ 100 → accepted

- [x] 3. Backend: AutoResolutionEngine
  - [x] 3.1 Create `sync/auto-resolution-engine.ts` implementing `IAutoResolutionEngine`
    - Implement `evaluate()`: given a categorized conflict + config, return resolution action or null
    - Strategies: `newer_wins` (later mtime wins; identical → `remote_wins` fallback), `remote_wins`, `local_wins`, `skip`
    - Return `null` if auto-resolution is disabled or no strategy configured for category
    - _Requirements: 4.1, 4.3_

  - [x] 3.2 Create auto-resolution config persistence (`sync/auto-resolution-config-store.ts`)
    - Persist config at `data/sync/<vaultId>/auto-resolution.json`
    - Implement `load()` / `save()` with atomic writes
    - Default: `{ enabled: false, strategies: {} }`
    - Validate config with Zod schema
    - _Requirements: 4.2, 4.5_

  - [ ]* 3.3 Write property test for strategy evaluation (Property 5)
    - **Property 5: Auto-resolution strategy evaluation is deterministic**
    - **Validates: Requirements 4.1**
    - Generate arbitrary timestamps, verify each strategy produces expected deterministic result

  - [ ]* 3.4 Write property test for auto-resolution logging (Property 6)
    - **Property 6: Auto-resolution logging invariant**
    - **Validates: Requirements 4.4, 4.6**
    - Verify every auto-resolved conflict (success or failure) produces a log entry with required fields

- [x] 4. Backend: SyncScheduler pause/resume extension
  - [x] 4.1 Extend `sync/sync-scheduler.ts` with `pause(vaultId)`, `resume(vaultId)`, `isPaused(vaultId)`
    - Internal `Set<string>` for paused vault IDs
    - Paused vaults skip scheduled callback execution but keep timer registered
    - `pause()` on already-paused vault: throw `SchedulerAlreadyPausedError`
    - `resume()` on non-paused vault: no-op (idempotent)
    - _Requirements: 6.9, 6.10_

  - [ ]* 4.2 Write property test for scheduler pause invariant (Property 11)
    - **Property 11: Scheduler pause invariant**
    - **Validates: Requirements 6.9**
    - Verify paused scheduler never fires sync callbacks until resume signal

- [x] 5. Checkpoint - Backend infrastructure validation
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Backend: SyncService extensions and SyncEngine categorization
  - [x] 6.1 Extend `sync/sync-service.ts` with new methods
    - `getCategorizedConflicts(vaultId)`: load conflicts → categorize → return enriched entries
    - `resolveConflictWithContent(vaultId, documentPath, content)`: delegate to ConflictResolver
    - `resolveConflictBatch(vaultId, resolutions)`: delegate to ConflictResolver batch
    - `getFileContent(vaultId, documentPath, source)`: read local file or fetch from CouchDB
    - `getAutoResolutionConfig(vaultId)` / `setAutoResolutionConfig(vaultId, config)`
    - `pauseScheduler(vaultId)` / `resumeScheduler(vaultId)`: delegate to SyncScheduler
    - Integrate AutoResolutionEngine into sync flow (evaluate on pull conflicts)
    - Log auto-resolved conflicts with `auto_resolved` marker
    - _Requirements: 1.1, 3.4, 4.3, 4.4, 5.5, 6.9_

  - [x] 6.2 Extend `sync/sync-engine.ts` to categorize conflicts during pull phase
    - During pull, when conflicts are detected, compute content hashes for rename detection
    - Store `category`, `localContentHash`, `remoteContentHash` in ConflictStore entries
    - Backward-compat migration: load existing conflicts without `category` → default to `content_conflict`
    - _Requirements: 1.1_

  - [x] 6.3 Add Zod validation schemas for new API inputs (`sync/validation.ts`)
    - `resolveBatchSchema`: array of `{ documentPath, resolution }` with max length 100
    - `resolveMergeSchema`: `{ documentPath, content }` with content max 10MB
    - `autoResolutionConfigSchema`: validates `AutoResolutionConfig` shape
    - `fileContentQuerySchema`: `{ path: string, source: 'local' | 'remote' }`
    - _Requirements: 6.8, 4.2_

- [x] 7. Backend: New API endpoints in syncRoutes.ts
  - [x] 7.1 Add conflict resolution API routes to `api/syncRoutes.ts`
    - `GET /vaults/:vaultId/sync/conflicts/categorized` → `getCategorizedConflicts`
    - `POST /vaults/:vaultId/sync/conflicts/resolve-batch` → `resolveConflictBatch`
    - `POST /vaults/:vaultId/sync/conflicts/resolve-merge` → `resolveConflictWithContent`
    - `GET /vaults/:vaultId/sync/conflicts/file-content?path=...&source=local|remote` → `getFileContent`
    - `GET /vaults/:vaultId/sync/auto-resolution` → `getAutoResolutionConfig`
    - `PUT /vaults/:vaultId/sync/auto-resolution` → `setAutoResolutionConfig`
    - `POST /vaults/:vaultId/sync/scheduler/pause` → `pauseScheduler`
    - `POST /vaults/:vaultId/sync/scheduler/resume` → `resumeScheduler`
    - All routes: owner-only auth, Zod validation, error mapping to HTTP status
    - _Requirements: 1.1, 3.4, 4.2, 5.5, 6.9_

  - [x] 7.2 Update barrel export `sync/index.ts` with new modules
    - Export ConflictResolver, AutoResolutionEngine, conflict-categorizer, auto-resolution-config-store
    - Export new types and error classes
    - _Requirements: 1.1_

- [x] 8. Backend: Composition root wiring
  - [x] 8.1 Wire new modules in `backend/src/index.ts`
    - Instantiate `AutoResolutionConfigStore`
    - Instantiate `ConflictResolver` with SyncEngine, ConflictStore, SyncLock dependencies
    - Instantiate `AutoResolutionEngine`
    - Pass new dependencies to `SyncService` constructor
    - _Requirements: 1.1, 4.1, 5.5_

- [x] 9. Checkpoint - Backend complete validation
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Frontend: Diff utility and API client extensions
  - [x] 10.1 Create `components/conflict-wizard/diff-utils.ts` (Myers-Diff)
    - Implement `computeDiff(oldText, newText): DiffHunk[]` — line-level Myers algorithm
    - Implement `isTextFile(filePath): boolean` — check extension against defined text list
    - Implement `groupHunks(hunks, contextLines?): GroupedHunk[]` — collapse equal sections
    - Define `DiffHunk` and `GroupedHunk` interfaces
    - Pure functions, no side effects, no external dependencies
    - _Requirements: 2.1, 2.6_

  - [ ]* 10.2 Write property test for diff round-trip (Property 2)
    - **Property 2: Diff round-trip (Myers algorithm correctness)**
    - **Validates: Requirements 2.2**
    - Generate arbitrary text pairs, verify applying diff to A reconstructs B exactly

  - [ ]* 10.3 Write property test for binary file detection (Property 3)
    - **Property 3: Binary file detection consistency**
    - **Validates: Requirements 2.6**
    - Generate arbitrary file paths, verify `isTextFile()` returns true iff extension in defined list

  - [x] 10.4 Extend `IApiClient` interface with new sync endpoints
    - `getCategorizedConflicts(vaultId): Promise<CategorizedConflictEntry[]>`
    - `resolveConflictBatch(vaultId, resolutions): Promise<BatchResolveResult>`
    - `resolveConflictMerge(vaultId, documentPath, content): Promise<void>`
    - `getFileContent(vaultId, documentPath, source): Promise<string | null>`
    - `getAutoResolutionConfig(vaultId): Promise<AutoResolutionConfig>`
    - `setAutoResolutionConfig(vaultId, config): Promise<void>`
    - `pauseSyncScheduler(vaultId): Promise<void>`
    - `resumeSyncScheduler(vaultId): Promise<void>`
    - Implement all methods in ApiClient class
    - _Requirements: 1.1, 3.4, 4.2, 5.5, 6.9_

- [x] 11. Frontend: ConflictWizard types and state
  - [x] 11.1 Create `components/conflict-wizard/types.ts`
    - Define `WizardStep`, `ConflictWizardState`, `ConflictWizardAction` (discriminated union)
    - Define `CategorizedConflictEntry` (frontend mirror of backend type)
    - Define `BatchResolveResult`, `AutoResolutionConfig` types for frontend
    - _Requirements: 6.1, 6.2_

  - [x] 11.2 Create `components/conflict-wizard/ConflictWizard.tsx` (main component)
    - Implement 3-step wizard using `useReducer` for local state
    - Step 1 (WizardOverview): categories + badges + "Alle auflösen" per category
    - Step 2 (WizardCategoryDetail): conflict list with checkboxes, pagination (max 50/page)
    - Step 3 (WizardResolution): DiffView / MergePreview / action buttons
    - Progress indicator: `"M/N Konflikte gelöst"`
    - Navigation: Vor/Zurück, direct jump via overview click
    - On mount: call `pauseSyncScheduler(vaultId)`, on unmount: call `resumeSyncScheduler(vaultId)`
    - Live update: resolved conflicts disappear, completion summary + "Sync fortsetzen" button
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.9, 6.10_

  - [ ]* 11.3 Write property test for progress indicator (Property 8)
    - **Property 8: Progress indicator correctness**
    - **Validates: Requirements 6.2**
    - Generate N total / M resolved, verify display shows exactly `"M/N Konflikte gelöst"`

  - [ ]* 11.4 Write property test for pagination (Property 9)
    - **Property 9: Pagination invariant**
    - **Validates: Requirements 6.7**
    - Generate N > 50, verify `ceil(N/50)` pages, max 50 items each, union = complete list

  - [ ]* 11.5 Write property test for conflict grouping (Property 12)
    - **Property 12: Conflict grouping count invariant**
    - **Validates: Requirements 1.2**
    - Generate categorized conflicts, verify sum of group sizes = total, each in exactly one group

- [x] 12. Frontend: DiffView component
  - [x] 12.1 Create `components/conflict-wizard/DiffView.tsx`
    - Side-by-Side mode: local (left) vs remote (right) with line numbers
    - Unified mode: single column interleaved view
    - Added lines: green background (Design Token), removed: red background
    - Collapsible identical sections ("N identische Zeilen")
    - Toggle Side-by-Side / Unified (persist in localStorage)
    - "Übernehmen" buttons for Local / Remote + "Manuell mergen" button
    - Binary file fallback: show metadata only (file size, modification date)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x] 12.2 Create `components/conflict-wizard/DiffView.css`
    - Design Token-based colors for additions/deletions
    - Responsive layout for side-by-side (min 768px)
    - Dark mode support via `:root[data-theme="dark"]` + `@media`
    - _Requirements: 2.2, 6.6_

- [x] 13. Frontend: MergePreview component
  - [x] 13.1 Create `components/conflict-wizard/MergePreview.tsx`
    - Editable textarea pre-filled with chosen base version
    - Syntax highlighting for Markdown (read-only preview mode below textarea)
    - "Bestätigen" and "Abbrechen" buttons
    - On confirm: call `resolveConflictMerge` API
    - On cancel: return to conflict list without changes
    - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 14. Frontend: BatchActions component
  - [x] 14.1 Create `components/conflict-wizard/BatchActions.tsx`
    - Checkbox selection per conflict
    - "Alle auflösen" button per category (uses configured strategy or default recommendation)
    - Confirmation dialog before batch execution (count + strategy display)
    - Batch limit: reject > 100 selected, prompt user to split
    - Result summary after batch: N succeeded, M failed with error reasons
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 6.8_

- [x] 15. Frontend: CSS and i18n
  - [x] 15.1 Create `components/conflict-wizard/ConflictWizard.css`
    - Design Tokens for wizard steps, progress bar, category badges
    - Responsive layout (≥768px)
    - Dark mode support
    - _Requirements: 6.6_

  - [x] 15.2 Add i18n keys for conflict wizard in `de.ts` and `en.ts`
    - All UI labels: wizard steps, buttons, progress, category names, confirmations, errors
    - Structure under `sync.conflictWizard.*`
    - _Requirements: 6.1_

- [x] 16. Checkpoint - Frontend components validation
  - Ensure all tests pass, ask the user if questions arise.

- [x] 17. Integration: Wire ConflictWizard into application
  - [x] 17.1 Replace `ConflictResolutionView` usage with `ConflictWizard`
    - Update sync section to render `ConflictWizard` when conflicts present
    - Pass necessary props (vaultId, apiClient, onComplete callback)
    - Keep existing `ConflictResolutionView.tsx` as deprecated fallback (remove in future)
    - _Requirements: 6.1_

  - [x] 17.2 Create barrel export `components/conflict-wizard/index.ts`
    - Export ConflictWizard, types, diff-utils
    - _Requirements: 6.1_

  - [x] 17.3 Extend SSE `sync:conflict` event with `category` field
    - Update `RealtimeProvider` to handle enriched conflict events
    - Notify wizard of new conflicts during open session (Req 6.11)
    - _Requirements: 6.11_

- [x] 18. Final checkpoint - Full integration validation
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties (fast-check, min 100 iterations)
- Unit tests validate specific examples and edge cases
- Backend uses `.js` extension on relative imports (ESM)
- Frontend uses Design Tokens from `index.css` — no hardcoded colors
- All error handling uses `extractErrorMessage(err, fallback)` pattern
- Atomic writes pattern: temp file → `rename()` for all persistence operations

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["1.3", "3.2", "4.1"] },
    { "id": 2, "tasks": ["1.4", "2.1", "3.1", "4.2"] },
    { "id": 3, "tasks": ["2.2", "2.3", "2.4", "3.3", "3.4"] },
    { "id": 4, "tasks": ["6.1", "6.2", "6.3"] },
    { "id": 5, "tasks": ["7.1", "7.2", "8.1"] },
    { "id": 6, "tasks": ["10.1", "10.4", "11.1"] },
    { "id": 7, "tasks": ["10.2", "10.3", "11.2", "15.2"] },
    { "id": 8, "tasks": ["11.3", "11.4", "11.5", "12.1", "13.1", "14.1"] },
    { "id": 9, "tasks": ["12.2", "15.1"] },
    { "id": 10, "tasks": ["17.1", "17.2", "17.3"] }
  ]
}
```
