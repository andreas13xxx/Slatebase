# Implementation Plan: Tier-2 Daily Workflow

## Overview

This plan implements the combined Tier-2 daily workflow features for Slatebase in incremental steps. The implementation follows the existing layered architecture (Config → Business → API → Frontend State → Frontend Components) and covers three main areas: Vault Explorer Enhancements (Statistics, Context Menu, Drag & Drop Upload), Editor Improvements (Line Numbers, Undo/Redo, Recent Files, Templates, Daily Notes, Image Paste, Favorites), and Trash & File Versioning.

## Tasks

- [x] 1. Extend server configuration and shared types
  - [x] 1.1 Add trash, versions, cleanup, templates, and upload config sections to `backend/config/default.json` and extend the config Zod schema in `backend/src/config/index.ts`
    - Add `trash.retentionDays` (default: 30), `versions.maxPerFile` (default: 20), `cleanup.intervalHours` (default: 24), `templates.directory` (default: `_templates`), `upload.maxFileSizeBytes` (default: 104857600), `upload.maxFilesPerDrop` (default: 50), `upload.maxImagePasteSize` (default: 10485760)
    - Validate ranges: retentionDays 0–365, maxPerFile 0–100, intervalHours ≥ 1
    - Out-of-range values fall back to defaults with a Pino warning log
    - _Requirements: 13.1, 13.2_

  - [x] 1.2 Create backend error classes for new modules
    - Create `backend/src/trash/errors.ts` with `TrashNotFoundError`, `TrashRestoreError`
    - Create `backend/src/version/errors.ts` with `VersionNotFoundError`, `VersionLimitError`
    - Create `backend/src/template/errors.ts` with `TemplateNotFoundError`, `TemplateConflictError`
    - Create `backend/src/statistics/errors.ts` with `StatisticsTimeoutError`
    - Create shared `UploadTooLargeError`, `UploadLimitExceededError` in an appropriate module
    - _Requirements: 1.5, 3.7, 3.9, 7.4, 7.6, 9.7, 11.6, 12.5_

  - [x] 1.3 Create TypeScript interfaces and types for all new backend modules
    - Create `backend/src/trash/types.ts` — `ITrashService`, `TrashEntry`, `TrashIndex`
    - Create `backend/src/version/types.ts` — `IVersionService`, `VersionEntry`, `VersionList`
    - Create `backend/src/template/types.ts` — `ITemplateService`, `TemplateInfo`
    - Create `backend/src/statistics/types.ts` — `IVaultStatisticsService`, `VaultStatistics`
    - Create `backend/src/cleanup/types.ts` — `ICleanupJob`, `CleanupConfig`
    - _Requirements: 1.1, 7.1, 11.1, 12.1, 13.1_

- [x] 2. Implement VaultStatisticsService
  - [x] 2.1 Implement `backend/src/statistics/statistics-service.ts`
    - Recursive directory scan with `fs.readdir` + `fs.stat`
    - Filter out `.trash/`, `.versions/`, and `_`-prefix entries
    - In-memory cache (`Map<vaultId, VaultStatistics>`)
    - 5-second timeout via `AbortController`
    - `invalidateCache(vaultId)` method for SSE event-driven invalidation
    - Return `{ fileCount: 0, folderCount: 0, totalSizeBytes: 0 }` for empty vaults
    - Create barrel export `backend/src/statistics/index.ts`
    - _Requirements: 1.1, 1.3, 1.4, 1.5, 1.6_

  - [x]* 2.2 Write property test for VaultStatisticsService (Property 1: Vault-Statistiken Korrektheit)
    - **Property 1: Vault-Statistiken Korrektheit**
    - **Validates: Requirements 1.1, 1.6**

  - [x] 2.3 Implement human-readable size formatter utility
    - Bytes < 1024 → "X Bytes", KB ≥ 1024, MB ≥ 1048576, GB ≥ 1073741824
    - Max 2 decimal places
    - Export from `backend/src/statistics/index.ts`
    - _Requirements: 1.2_

  - [x]* 2.4 Write property test for size formatter (Property 2: Menschenlesbare Größenformatierung)
    - **Property 2: Menschenlesbare Größenformatierung**
    - **Validates: Requirements 1.2**

  - [x] 2.5 Create `backend/src/api/statisticsRoutes.ts` — `GET /api/v1/vaults/:vaultId/statistics`
    - Auth middleware, vault access check
    - Return `{ fileCount, folderCount, totalSizeBytes, formattedSize }`
    - Map `StatisticsTimeoutError` → 408
    - Register route in `backend/src/api/index.ts`
    - _Requirements: 1.1, 1.2, 1.5_

  - [x]* 2.6 Write unit tests for VaultStatisticsService
    - Test cache invalidation, timeout handling, empty vault, filtered directories
    - _Requirements: 1.1, 1.3, 1.4, 1.5, 1.6_

- [x] 3. Implement TrashService (Soft-Delete)
  - [x] 3.1 Implement `backend/src/trash/trash-service.ts`
    - `moveToTrash`: Move file/folder to `.trash/<uniqueId>/`, write `_index.json` entry atomically
    - `listTrash`: Read `_index.json`, sort by `deletedAt` descending
    - `restore`: Restore to original path, create missing parent dirs, append suffix (`-restored`, `-restored-2`, ..., `-restored-99`) if path occupied
    - `deletePermanently`: Remove from `.trash/` and `_index.json`
    - `purgeExpired`: Remove entries older than `retentionDays`
    - `deleteImmediately`: Permanent delete when `retentionDays=0`
    - Atomic index updates (temp → rename)
    - Create barrel export `backend/src/trash/index.ts`
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7, 11.8, 13.7_

  - [x]* 3.2 Write property tests for TrashService (Properties 21–24, 32)
    - **Property 21: Trash Soft-Delete**
    - **Property 22: Trash-Auflistung Sortierung**
    - **Property 23: Trash Restore Round-Trip**
    - **Property 24: Trash Cleanup nach Aufbewahrungsfrist**
    - **Property 32: Sofortige permanente Löschung bei retentionDays=0**
    - **Validates: Requirements 11.1, 11.2, 11.3, 11.4, 11.7, 13.5, 13.7**

  - [x] 3.3 Create `backend/src/api/trashRoutes.ts`
    - `GET /api/v1/vaults/:vaultId/trash` — list trash entries
    - `POST /api/v1/vaults/:vaultId/trash/:entryId/restore` — restore file
    - `DELETE /api/v1/vaults/:vaultId/trash/:entryId` — permanently delete
    - Auth middleware, vault ownership/access check
    - Zod validation for params
    - Map errors: `TrashNotFoundError` → 404, `TrashRestoreError` → 500
    - Register route in `backend/src/api/index.ts`
    - _Requirements: 11.3, 11.4, 11.5, 11.6_

  - [x]* 3.4 Write unit tests for TrashService
    - Test restore with suffix, restore failure, _index.json consistency, purgeExpired boundary
    - _Requirements: 11.1, 11.2, 11.4, 11.5, 11.6, 11.7_

- [x] 4. Implement VersionService
  - [x] 4.1 Implement `backend/src/version/version-service.ts`
    - `createVersion`: Save previous content under `.versions/<relativePath>/<YYYYMMDDTHHmmssSSS>.<ext>`, prune excess versions
    - `listVersions`: Read version directory, parse timestamps, sort descending
    - `getVersionContent`: Read specific version file
    - `restoreVersion`: Save current as new version, then atomically overwrite file (temp → rename)
    - `pruneVersions`: Delete oldest versions exceeding `maxPerFile`
    - `moveVersions`: Rename `.versions/` subdirectory when file is renamed/moved
    - `deleteVersions`: Remove all versions when file is permanently deleted
    - Skip version creation when `maxPerFile=0`
    - Create barrel export `backend/src/version/index.ts`
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.7, 12.8, 12.10, 12.11, 13.8_

  - [x]* 4.2 Write property tests for VersionService (Properties 25–30, 33, 34)
    - **Property 25: Version-Erstellung bei Speichern**
    - **Property 26: Versions-Anzahl-Invariante**
    - **Property 27: Versions-Auflistung Sortierung**
    - **Property 28: Version-Restore sichert aktuelle Version**
    - **Property 29: Versionen bei Umbenennung mitverschieben**
    - **Property 30: Versionen bei Löschung entfernen**
    - **Property 33: Keine Versionierung bei maxPerFile=0**
    - **Property 34: Inline-Diff Korrektheit**
    - **Validates: Requirements 12.1, 12.2, 12.3, 12.4, 12.7, 12.10, 12.11, 13.6, 13.8**

  - [x] 4.3 Create `backend/src/api/versionRoutes.ts`
    - `GET /api/v1/vaults/:vaultId/versions/:filePath` — list versions
    - `GET /api/v1/vaults/:vaultId/versions/:filePath/:timestamp` — get version content
    - `POST /api/v1/vaults/:vaultId/versions/:filePath/:timestamp/restore` — restore version
    - Auth middleware, vault access check, `validateFilePath()`
    - Map errors: `VersionNotFoundError` → 404
    - Register route in `backend/src/api/index.ts`
    - _Requirements: 12.4, 12.5, 12.6, 12.7_

  - [x]* 4.4 Write unit tests for VersionService
    - Test timestamp generation format, moveVersions, deleteVersions, prune logic, maxPerFile=0
    - _Requirements: 12.1, 12.2, 12.3, 12.10, 12.11, 13.8_

- [x] 5. Implement TemplateService
  - [x] 5.1 Implement `backend/src/template/template-service.ts`
    - `listTemplates`: Read `.md` files (no `_` prefix) from configured template dir, sort alphabetically, cap at 100
    - `createFromTemplate`: Read template, replace `{{date}}`, `{{time}}`, `{{title}}` placeholders (leave unrecognized ones), validate target path, check for conflicts, write atomically
    - Return empty list (not error) when template dir doesn't exist
    - Create barrel export `backend/src/template/index.ts`
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_

  - [x]* 5.2 Write property tests for TemplateService (Properties 13, 14)
    - **Property 13: Template-Listing-Filterung**
    - **Property 14: Template-Platzhalter-Ersetzung**
    - **Validates: Requirements 7.1, 7.2, 7.5**

  - [x] 5.3 Create `backend/src/api/templateRoutes.ts`
    - `GET /api/v1/vaults/:vaultId/templates` — list templates
    - `POST /api/v1/vaults/:vaultId/templates/create` — create file from template
    - Zod validation (`CreateFromTemplateSchema`: templateName, targetDir, fileName)
    - Map errors: `TemplateNotFoundError` → 404, `TemplateConflictError` → 409
    - Register route in `backend/src/api/index.ts`
    - _Requirements: 7.2, 7.3, 7.4_

  - [x]* 5.4 Write unit tests for TemplateService
    - Test directory not existing, _-prefix filtering, placeholder edge cases, name conflict
    - _Requirements: 7.1, 7.4, 7.5, 7.6_

- [x] 6. Implement unique filename generator and upload endpoint
  - [x] 6.1 Implement shared unique filename generator utility in `backend/src/business/unique-filename.ts`
    - Given a desired filename and existing filenames in target dir, produce a unique name
    - Suffix pattern: `-1`, `-2`, etc. appended before extension
    - Preserve original extension
    - Used by Drag & Drop Upload, Image Paste, and Trash Restore
    - _Requirements: 3.6, 9.3, 11.5_

  - [x]* 6.2 Write property test for unique filename generator (Property 4)
    - **Property 4: Unique-Filename-Generator**
    - **Validates: Requirements 3.6, 9.3, 11.5**

  - [x] 6.3 Create upload endpoint `backend/src/api/uploadRoutes.ts` — `POST /api/v1/vaults/:vaultId/upload`
    - Accept multipart file uploads (max 50 files, max 100 MB each)
    - Image paste variant: max 10 MB, generate `paste-YYYY-MM-DD-HHmmss.<ext>` filename
    - Apply unique filename logic for conflicts
    - Validate file size before writing, reject oversized files
    - Auth middleware, vault write-access check, `validateFilePath()`
    - Publish `vault:change` event after successful upload
    - Register route in `backend/src/api/index.ts`
    - _Requirements: 3.2, 3.6, 3.9, 9.1, 9.2, 9.3, 9.5_

  - [x]* 6.4 Write property test for image paste filename format (Property 16)
    - **Property 16: Bild-Paste-Dateiname-Format**
    - **Validates: Requirements 9.2**

  - [x]* 6.5 Write unit tests for upload route and unique filename generator
    - Test multi-file upload, size rejection, filename collision, MIME type validation
    - _Requirements: 3.2, 3.6, 3.9, 9.2, 9.3, 9.5_

- [x] 7. Implement CleanupJob and integrate with VaultService
  - [x] 7.1 Implement `backend/src/cleanup/cleanup-job.ts`
    - `start()`: Run immediately on server start, then repeat every `intervalHours`
    - `stop()`: Clear interval
    - `runOnce()`: Iterate all vaults, call `trashService.purgeExpired()` and `versionService.pruneVersions()` for each
    - Read fresh config values on each run (supports config changes within 24h)
    - Per-file error isolation (one failure doesn't stop the entire run)
    - Create barrel export `backend/src/cleanup/index.ts`
    - _Requirements: 13.3, 13.4, 13.5, 13.6_

  - [x] 7.2 Modify `backend/src/business/index.ts` (VaultService) to integrate Trash and Version
    - Modify `deleteContent()`: Call `trashService.moveToTrash()` when `retentionDays > 0`, call `trashService.deleteImmediately()` when `retentionDays = 0`
    - Call `versionService.deleteVersions()` when file is permanently deleted
    - Modify `saveFile()`: Before writing, read current content and call `versionService.createVersion()` if file exists and `maxPerFile > 0`
    - Modify rename/move: Call `versionService.moveVersions()` and `favoritesStore.updatePath()` logic
    - Publish `vault:change` events for trash/restore operations
    - _Requirements: 11.1, 11.9, 12.1, 12.9, 12.10, 12.11, 13.7, 13.8_

  - [x] 7.3 Wire new services in composition root `backend/src/index.ts`
    - Instantiate `TrashService`, `VersionService`, `TemplateService`, `VaultStatisticsService`, `CleanupJob`
    - Listen to `vault:change` SSE events → call `statisticsService.invalidateCache(vaultId)`
    - Register new route modules (trashRoutes, versionRoutes, templateRoutes, statisticsRoutes, uploadRoutes)
    - Start `CleanupJob` on server boot, stop on graceful shutdown
    - _Requirements: 1.4, 13.3, 13.4_

  - [x]* 7.4 Write unit tests for CleanupJob and VaultService integration
    - Test start/stop, interval execution, config change pickup
    - Test deleteContent → moveToTrash flow, saveFile → createVersion flow
    - _Requirements: 13.3, 13.4, 13.5, 13.6, 13.7, 13.8_

- [x] 8. Checkpoint — Backend services complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Implement frontend state stores (localStorage-based)
  - [x] 9.1 Create `frontend/src/state/recentFilesStore.ts`
    - `add(vaultId, path)`: Add/move entry to front, dedup by vaultId+path, cap at 20 entries
    - `getRecent(limit)`: Return latest N entries
    - `remove(vaultId, path)`: Remove specific entry
    - `updatePath(vaultId, oldPath, newPath)`: Update path on rename
    - Persist in localStorage key `slatebase:recentFiles`
    - Store timestamp as ISO 8601
    - _Requirements: 6.1, 6.2, 6.5, 6.6_

  - [x]* 9.2 Write property test for RecentFilesStore (Property 12)
    - **Property 12: Recent-Files-Listenintegrität**
    - **Validates: Requirements 6.1, 6.2**

  - [x] 9.3 Create `frontend/src/state/favoritesStore.ts`
    - `add(vaultId, path)`: Add favorite, cap at 50 per vault
    - `remove(vaultId, path)`: Remove favorite
    - `getForVault(vaultId)`: Return favorites ordered by `addedAt` descending (newest first)
    - `isFavorite(vaultId, path)`: Check membership
    - `updatePath(vaultId, oldPath, newPath)`: Update on rename/move
    - `removeByPath(vaultId, path)`: Remove on delete
    - Persist in localStorage key `slatebase:favorites:<vaultId>`
    - Graceful fallback to in-memory if localStorage unavailable
    - _Requirements: 10.1, 10.2, 10.5, 10.6, 10.7, 10.8, 10.9_

  - [x]* 9.4 Write property tests for FavoritesStore (Properties 18–20)
    - **Property 18: Favoriten Add/Remove Round-Trip**
    - **Property 19: Favoriten-Größeninvariante und Reihenfolge**
    - **Property 20: Favoriten-Pfad-Tracking**
    - **Validates: Requirements 10.1, 10.2, 10.5, 10.6, 10.7, 10.8**

  - [x] 9.5 Create `frontend/src/state/dailyNoteService.ts`
    - `openOrCreate(vaultId, dailyDir)`: Determine today's date (browser timezone, YYYY-MM-DD format), check if file exists via API, create with template if not, open in tab
    - Read daily notes directory config from localStorage `slatebase:dailyNotes:<vaultId>` (default: vault root)
    - Validate directory path (max 255 chars)
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

  - [x]* 9.6 Write property test for Daily Note filename format (Property 15)
    - **Property 15: Daily-Note-Dateiname-Format**
    - **Validates: Requirements 8.1**

  - [x]* 9.7 Write unit tests for RecentFilesStore, FavoritesStore, DailyNoteService
    - Test dedup logic, max limits, localStorage fallback, path updates, no-active-vault error
    - _Requirements: 6.1, 6.2, 6.5, 8.5, 10.5, 10.9_

- [x] 10. Implement useHistoryStack hook (Undo/Redo)
  - [x] 10.1 Create `frontend/src/hooks/useHistoryStack.ts`
    - Two arrays: undoStack and redoStack
    - `pushState(entry)`: Push HistoryEntry (text, selectionStart, selectionEnd) to undoStack, clear redoStack
    - `undo()`: Pop from undoStack, push current to redoStack, return previous state
    - `redo()`: Pop from redoStack, push current to undoStack, return next state
    - Max 100 entries (FIFO eviction of oldest)
    - `clear()`: Reset both stacks (called on file switch)
    - `canUndo` / `canRedo` boolean states
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8_

  - [x]* 10.2 Write property tests for useHistoryStack (Properties 8–11)
    - **Property 8: History-Stack Undo Round-Trip**
    - **Property 9: History-Stack Redo Round-Trip**
    - **Property 10: Redo-Invalidierung bei neuer Aktion**
    - **Property 11: History-Stack Größeninvariante**
    - **Validates: Requirements 5.1, 5.2, 5.3, 5.4, 5.5**

  - [x] 10.3 Integrate useHistoryStack into `frontend/src/components/EditMode.tsx`
    - Wrap all toolbar actions (Bold, Italic, Strikethrough, Code, Link, Heading, List, Checkbox, Blockquote, HR, Table, DnD-Link) to push state before execution
    - Add Undo/Redo buttons to toolbar (disabled when stack empty)
    - Wire Ctrl+Z → undo, Ctrl+Y / Ctrl+Shift+Z → redo
    - Restore text content and cursor selection (selectionStart, selectionEnd)
    - Clear history stack on file switch
    - _Requirements: 5.1, 5.2, 5.3, 5.6, 5.7, 5.8_

  - [x]* 10.4 Write unit tests for Undo/Redo integration in EditMode
    - Test toolbar action → undo restores state, file switch clears stack, button disable states
    - _Requirements: 5.2, 5.3, 5.6, 5.7, 5.8_

- [x] 11. Implement LineNumbers component
  - [x] 11.1 Create `frontend/src/components/LineNumbers.tsx` and `LineNumbers.css`
    - Render line numbers based on `text.split('\n').length`
    - Synchronize scroll position with textarea via `scrollTop` binding
    - Match `line-height` with textarea for pixel-perfect alignment
    - Toggle visibility via prop
    - _Requirements: 4.3, 4.4_

  - [x] 11.2 Create `frontend/src/hooks/useLineNumbers.ts`
    - Manage line numbers enabled/disabled state
    - Persist to localStorage key `slatebase:lineNumbers`
    - Default: disabled. Fallback to disabled if localStorage unavailable
    - _Requirements: 4.1, 4.5, 4.6_

  - [x] 11.3 Integrate LineNumbers into `frontend/src/components/EditMode.tsx`
    - Add toggle button to editor toolbar (visually distinct active/inactive states)
    - Toggle within 100ms without page reload
    - Position LineNumbers component left of textarea
    - Update line count immediately on content changes
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x]* 11.4 Write property test for LineNumbers count (Property 7)
    - **Property 7: Zeilennummern-Synchronisation**
    - **Validates: Requirements 4.3**

  - [x]* 11.5 Write unit tests for LineNumbers
    - Test toggle persistence, scroll sync, default-off behavior, localStorage failure
    - _Requirements: 4.1, 4.2, 4.5, 4.6_

- [x] 12. Implement ContextMenu component
  - [x] 12.1 Create `frontend/src/components/ContextMenu.tsx` and `ContextMenu.css`
    - Position via `position: fixed` + viewport boundary clamping
    - Suppress native browser context menu (`e.preventDefault()`)
    - Close on click-outside or Escape
    - Keyboard navigation: Arrow Up/Down (cyclic wrapping), Enter to select
    - Focus first item on open
    - _Requirements: 2.4, 2.5, 2.6_

  - [x] 12.2 Integrate ContextMenu into `frontend/src/components/FileExplorer.tsx`
    - Right-click on file → show: Umbenennen, Löschen, Kopieren, Verschieben
    - Right-click on folder → show: Neuer Ordner, Neue Datei, Umbenennen, Löschen
    - Right-click on vault entry → show: Neuer Ordner, Neue Datei, Export
    - Read-only users: show no write actions, display hint instead
    - Wire actions to existing VaultService operations
    - _Requirements: 2.1, 2.2, 2.3, 2.7_

  - [x]* 12.3 Write property test for permission filtering (Property 3)
    - **Property 3: Kontextmenü-Berechtigungsfilterung**
    - **Validates: Requirements 2.7**

  - [x]* 12.4 Write unit tests for ContextMenu
    - Test positioning/clamping, keyboard navigation, permission-based filtering, close behavior
    - _Requirements: 2.4, 2.5, 2.6, 2.7_

- [x] 13. Checkpoint — Core frontend components complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 14. Implement Drag & Drop and Image Paste
  - [x] 14.1 Create `frontend/src/hooks/useDropZone.ts` and `frontend/src/components/DropZone.tsx` + `DropZone.css`
    - Handle `dragenter`/`dragleave`/`dragover`/`drop` events
    - Drag counter for nested element enter/leave correctness
    - Visual feedback (highlighted area) when dragging over
    - Validate: max 50 files, max 100 MB per file
    - Reject drop on editor when no file is open (toast notification)
    - _Requirements: 3.1, 3.2, 3.7, 3.8, 3.9_

  - [x] 14.2 Integrate DropZone into FileExplorer and EditMode
    - FileExplorer: Drop on folder → upload to that folder
    - EditMode: Drop → upload to same directory as current file
    - For image files (`.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.webp`, `.avif`, `.bmp`): insert embed link `![[filename]]` at cursor
    - Refresh file tree after successful upload
    - Show toast notifications for individual file errors (with filename + reason)
    - _Requirements: 3.2, 3.3, 3.4, 3.5, 3.7, 3.8_

  - [x] 14.3 Implement image paste handler in EditMode
    - Intercept `paste` event, check `clipboardData.items` for image MIME types (image/png, image/jpeg, image/gif, image/webp)
    - Do NOT intercept text or other clipboard content
    - Upload via `POST /api/v1/vaults/:vaultId/upload` with generated filename `paste-YYYY-MM-DD-HHmmss.<ext>`
    - Insert `![[filename]]` at cursor position on success
    - Show toast on failure or size exceeded (10 MB limit)
    - Ignore paste when no file is open
    - _Requirements: 9.1, 9.2, 9.4, 9.5, 9.6, 9.7, 9.8, 9.9_

  - [x]* 14.4 Write property tests for upload target directory and embed link (Properties 5, 6, 17)
    - **Property 5: Upload-Zielverzeichnis vom Editor-Kontext**
    - **Property 6: Bild-Embed-Link-Einfügung**
    - **Property 17: Nur Bild-MIME-Typen werden verarbeitet**
    - **Validates: Requirements 3.3, 3.4, 9.4, 9.6, 9.9**

  - [x]* 14.5 Write unit tests for DropZone and image paste
    - Test multi-file drop, type validation, size validation, no-file-open rejection, MIME filtering
    - _Requirements: 3.1, 3.7, 3.8, 3.9, 9.5, 9.7, 9.8, 9.9_

- [x] 15. Implement FavoritesSection in FileExplorer
  - [x] 15.1 Create `frontend/src/components/FavoritesSection.tsx`
    - Display "Favoriten" section above file tree when favorites exist for current vault
    - Show filename + file icon per entry
    - Click → open file in tab
    - Star icon toggle in file tree entries and context menu
    - _Requirements: 10.1, 10.2, 10.3, 10.4_

  - [x] 15.2 Integrate FavoritesStore with FileExplorer and VaultService events
    - Add star icon to file entries in FileExplorer
    - Add "Als Favorit markieren"/"Favorit entfernen" to ContextMenu file options
    - Listen to file rename/move events → `updatePath()`
    - Listen to file delete events → `removeByPath()`
    - _Requirements: 10.1, 10.2, 10.7, 10.8_

  - [x]* 15.3 Write unit tests for FavoritesSection
    - Test add/remove toggle, max 50 limit, path tracking on rename/delete
    - _Requirements: 10.1, 10.2, 10.5, 10.7, 10.8_

- [x] 16. Implement Recent Files integration and Templates/Daily Notes UI
  - [x] 16.1 Integrate RecentFilesStore with file-open events and Command Palette
    - On file open: call `recentFilesStore.add(vaultId, path)`
    - In Command Palette (empty search): show "Zuletzt geöffnet" section with last 10 entries
    - Click entry → open file in tab (or focus existing tab)
    - If file no longer exists → remove from list, show error with filename
    - _Requirements: 6.1, 6.3, 6.4, 6.5_

  - [x] 16.2 Add "Neue Notiz aus Vorlage" UI flow
    - Add action to Command Palette and ContextMenu (vault-level)
    - Fetch templates from `GET /api/v1/vaults/:vaultId/templates`
    - Display sorted template list (filename without .md as display name)
    - Prompt user for filename, cancel on Escape (no side effects)
    - Call `POST /api/v1/vaults/:vaultId/templates/create`
    - Open created file in editor
    - Show info message if no templates available (with expected directory path)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.6, 7.7_

  - [x] 16.3 Add Daily Note button and shortcut (Ctrl+Alt+D)
    - Add Daily Note button to sidebar toolbar
    - Register Ctrl+Alt+D keyboard shortcut
    - Call `dailyNoteService.openOrCreate()` with active vault and configured directory
    - Show error if no vault is active
    - Auto-create directory if it doesn't exist (handled by backend)
    - Use `_templates/daily.md` template content if available
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_

  - [x]* 16.4 Write unit tests for Recent Files, Templates, and Daily Notes UI flows
    - Test command palette integration, template listing, daily note creation/open, error states
    - _Requirements: 6.3, 6.4, 6.5, 7.2, 7.3, 7.6, 8.2, 8.3, 8.5_

- [x] 17. Implement TrashView and VersionBrowser frontend components
  - [x] 17.1 Create `frontend/src/components/TrashView.tsx` and `TrashView.css`
    - Fetch trash entries from `GET /api/v1/vaults/:vaultId/trash`
    - Display entries with original path and deletion date (sorted by date descending)
    - "Wiederherstellen" button → `POST .../restore`, refresh list
    - "Endgültig löschen" button → `DELETE ...`, refresh list
    - Show error toast on restore failure with reason
    - _Requirements: 11.3, 11.4, 11.5, 11.6_

  - [x] 17.2 Create `frontend/src/components/VersionBrowser.tsx` and `VersionBrowser.css`
    - Fetch versions from `GET /api/v1/vaults/:vaultId/versions/:filePath`
    - Display versions with local-timezone timestamp (DD.MM.YYYY HH:mm), sorted descending
    - Show empty state message when no versions exist
    - On version select: fetch content, display inline diff (added lines green, removed lines red)
    - "Wiederherstellen" button → `POST .../restore`, refresh
    - _Requirements: 12.4, 12.5, 12.6, 12.7_

  - [x] 17.3 Integrate TrashView and VersionBrowser access points
    - Add "Papierkorb" entry to sidebar/navigation
    - Add "Versionen" action to file context menu and editor toolbar
    - Hide `.trash/` and `.versions/` directories from FileExplorer tree
    - _Requirements: 11.9, 12.9_

  - [x]* 17.4 Write unit tests for TrashView and VersionBrowser
    - Test list rendering, restore flow, diff display, empty states, error handling
    - _Requirements: 11.3, 11.4, 11.6, 12.4, 12.5, 12.6, 12.7_

- [x] 18. Implement Vault Statistics tooltip in FileExplorer
  - [x] 18.1 Add statistics tooltip to vault entries in FileExplorer
    - On hover over vault entry: fetch from `GET /api/v1/vaults/:vaultId/statistics`
    - Display tooltip with: file count, folder count, human-readable total size
    - Cache response client-side, invalidate on `vault:change` SSE event for that vault
    - Show "Statistiken nicht verfügbar" on error/timeout without overwriting cached value
    - _Requirements: 1.2, 1.3, 1.4, 1.5_

  - [x]* 18.2 Write unit tests for statistics tooltip
    - Test tooltip display, cache invalidation, error/timeout fallback
    - _Requirements: 1.2, 1.3, 1.4, 1.5_

- [x] 19. Checkpoint — All features implemented
  - Ensure all tests pass, ask the user if questions arise.

- [x] 20. Final integration and wiring
  - [x] 20.1 Update `frontend/src/api/index.ts` (IApiClient) with new endpoints
    - Add methods: `getVaultStatistics`, `uploadFiles`, `listTemplates`, `createFromTemplate`, `listTrash`, `restoreTrash`, `deleteTrash`, `listVersions`, `getVersionContent`, `restoreVersion`
    - _Requirements: 1.1, 3.2, 7.2, 7.3, 11.3, 11.4, 12.4, 12.7_

  - [x] 20.2 Ensure `.trash/` and `.versions/` directories are filtered from file tree responses
    - Verify backend vault listing excludes these directories
    - Verify frontend FileExplorer does not render them
    - _Requirements: 11.9, 12.9_

  - [x] 20.3 Wire SSE events for cache invalidation and UI updates
    - `vault:change` → invalidate statistics cache, refresh file tree
    - Trash/restore operations → publish `vault:change` events
    - Version operations → publish appropriate events
    - _Requirements: 1.4, 3.5_

  - [x]* 20.4 Write integration tests for end-to-end flows
    - Trash + VaultService: deleteContent → moveToTrash
    - Version + VaultService: saveFile → createVersion
    - Upload → file on disk → vault:change event → tree refresh
    - Template → placeholder replace → file creation
    - _Requirements: 11.1, 12.1, 3.2, 7.3_

- [x] 21. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document (34 properties total)
- Unit tests validate specific scenarios and edge cases
- The implementation uses TypeScript throughout (backend: Node.js/Hono/Zod, frontend: React 19/Vite)
- All filesystem operations use atomic writes (temp → rename) per project conventions
- localStorage stores use graceful in-memory fallback when storage is unavailable

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["2.1", "3.1", "4.1", "5.1", "6.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "3.2", "4.2", "5.2", "6.2", "6.3"] },
    { "id": 3, "tasks": ["2.4", "2.5", "3.3", "4.3", "5.3", "6.4", "6.5"] },
    { "id": 4, "tasks": ["2.6", "3.4", "4.4", "5.4", "7.1", "7.2"] },
    { "id": 5, "tasks": ["7.3", "7.4"] },
    { "id": 6, "tasks": ["9.1", "9.3", "9.5", "10.1", "11.1", "11.2"] },
    { "id": 7, "tasks": ["9.2", "9.4", "9.6", "9.7", "10.2", "10.3", "11.3", "11.4", "12.1"] },
    { "id": 8, "tasks": ["10.4", "11.5", "12.2", "14.1"] },
    { "id": 9, "tasks": ["12.3", "12.4", "14.2", "14.3", "15.1"] },
    { "id": 10, "tasks": ["14.4", "14.5", "15.2", "15.3", "16.1", "16.2", "16.3"] },
    { "id": 11, "tasks": ["16.4", "17.1", "17.2", "18.1"] },
    { "id": 12, "tasks": ["17.3", "17.4", "18.2", "20.1"] },
    { "id": 13, "tasks": ["20.2", "20.3"] },
    { "id": 14, "tasks": ["20.4"] }
  ]
}
```
