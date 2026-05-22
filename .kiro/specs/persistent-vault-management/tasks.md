# Implementation Plan: Persistent Vault Management

## Overview

Transform Slatebase from a read-only viewer into a full vault lifecycle management system. Implementation proceeds bottom-up: configuration and registry layer first, then backend services, then API routes, then frontend state and components. Each layer builds on the previous, with property-based tests validating correctness properties from the design.

## Tasks

- [x] 1. Extend configuration and set up data directory
  - [x] 1.1 Add new config fields to ServerConfigSchema
    - Add `dataDir`, `maxImportFileSize`, `maxImportFiles`, `maxImportDepth` fields to the Zod schema in `backend/src/config/index.ts`
    - Add corresponding env overlay parsing for `SLATEBASE_DATA_DIR`, `SLATEBASE_MAX_IMPORT_FILE_SIZE`, `SLATEBASE_MAX_IMPORT_FILES`, `SLATEBASE_MAX_IMPORT_DEPTH`
    - Update `config/default.json` with sensible defaults (`"dataDir": "./data"`, `"maxImportFileSize": 524288000`, `"maxImportFiles": 500`, `"maxImportDepth": 10`)
    - _Requirements: 4.7, 5.6_

  - [x] 1.2 Create VaultRegistry module
    - Create `backend/src/vault/registry.ts` implementing the `IVaultRegistry` interface from the design
    - Implement `load()`: read and parse `vaults.json` from `<dataDir>/vaults.json`, return empty array if file doesn't exist
    - Implement `save()`: write atomically (write to temp file, then rename) to prevent corruption
    - Implement `addEntry()`, `removeEntry()`, `findById()`, `findByName()`
    - Ensure the `<dataDir>` and `<dataDir>/vaults/` directories are created on first access if they don't exist
    - _Requirements: 7.1, 7.3, 7.4_

  - [ ]* 1.3 Write property tests for VaultRegistry persistence
    - **Property 19: Registry Persistence Round-Trip**
    - **Validates: Requirements 7.1, 7.2, 7.3, 7.4**
    - Use fast-check to generate sequences of add/remove operations, verify that reloading from disk produces the same vault list

  - [ ]* 1.4 Write property test for startup graceful degradation
    - **Property 20: Startup Graceful Degradation**
    - **Validates: Requirements 7.5**
    - Generate registry entries with some valid and some missing storage directories, verify only valid ones load

- [x] 2. Implement vault name validation
  - [x] 2.1 Create validation module
    - Create `backend/src/business/validation.ts` with a `validateVaultName(name: string, existingNames: string[]): ValidationResult` function
    - Accept names 1-128 chars with at least one non-whitespace character
    - Return specific error codes: `VALIDATION_ERROR` for empty/whitespace-only/too-long, `VAULT_NAME_CONFLICT` for duplicate names
    - Use case-sensitive comparison for uniqueness check
    - _Requirements: 1.2, 1.3, 1.4_

  - [ ]* 2.2 Write property test for vault name validation
    - **Property 1: Vault Name Validation**
    - **Validates: Requirements 1.2, 1.4**
    - Use fast-check to generate arbitrary strings, verify acceptance/rejection matches the specification

  - [ ]* 2.3 Write property test for vault name uniqueness
    - **Property 2: Vault Name Uniqueness**
    - **Validates: Requirements 1.3**
    - Generate sets of existing names and new names, verify conflict detection is correct

- [x] 3. Implement vault creation and deletion in VaultService
  - [x] 3.1 Extend VaultService with createVault method
    - Add `createVault(name: string): Promise<VaultInfo>` to `IVaultService` and `VaultService`
    - Validate name using the validation module
    - Generate vault ID from storage path using existing `generateVaultId`
    - Create vault storage directory at `<dataDir>/vaults/<vaultId>/`
    - Add entry to VaultRegistry
    - Load the vault into VaultManager's in-memory map
    - On filesystem failure: do not add to registry (atomicity)
    - On registry failure after mkdir: remove the created directory
    - _Requirements: 1.1, 1.5_

  - [x] 3.2 Extend VaultService with deleteVault method
    - Add `deleteVault(vaultId: string): Promise<void>` to `IVaultService` and `VaultService`
    - Verify vault exists (throw `VaultNotFoundError` if not)
    - Remove vault storage directory recursively using `fs.rm(path, { recursive: true, force: true })`
    - Only after successful directory removal: remove entry from VaultRegistry and VaultManager
    - On filesystem failure: do NOT remove from registry, return error
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [ ]* 3.3 Write property tests for vault creation
    - **Property 3: Vault Creation Round-Trip**
    - **Validates: Requirements 1.1**
    - **Property 4: Vault Creation Atomicity**
    - **Validates: Requirements 1.5**

  - [ ]* 3.4 Write property tests for vault deletion
    - **Property 5: Vault Deletion Completeness**
    - **Validates: Requirements 2.1, 2.2**
    - **Property 6: Vault Deletion Atomicity**
    - **Validates: Requirements 2.4**
    - **Property 7: Non-Existent Vault Rejection**
    - **Validates: Requirements 2.3, 4.6, 6.5**

- [x] 4. Implement content deletion in VaultService
  - [x] 4.1 Add deleteContent method to VaultService
    - Add `deleteContent(vaultId: string, relativePath: string): Promise<void>` to `IVaultService` and `VaultService`
    - Validate vault exists (throw `VaultNotFoundError` if not)
    - Validate path using existing `validateFilePath` (path traversal protection)
    - Check if path exists on filesystem, throw appropriate error if not
    - Use `fs.rm(resolvedPath, { recursive: true })` for both files and folders
    - Refresh the vault's in-memory directory tree after deletion
    - _Requirements: 6.1, 6.2, 6.4, 6.5, 6.6_

  - [ ]* 4.2 Write property tests for content deletion
    - **Property 16: Content Deletion Completeness**
    - **Validates: Requirements 6.1, 6.2**
    - **Property 17: Content Path Traversal Protection**
    - **Validates: Requirements 6.6**
    - **Property 18: Non-Existent Content Path Rejection**
    - **Validates: Requirements 6.4**

- [x] 5. Checkpoint - Ensure all backend service tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 6. Implement ImportService
  - [x] 6.1 Create ImportService module
    - Create `backend/src/import/index.ts` implementing `IImportService`
    - Implement `importFile(vaultId: string, file: UploadedFile): Promise<void>`:
      - Validate vault exists
      - Validate filename (1-255 chars, no path separators)
      - Validate file size (≤ 500 MB)
      - Check for name conflict at root level
      - Write file to vault storage; on failure, clean up partial file
    - _Requirements: 4.1, 4.3, 4.4, 4.5, 4.6, 4.7_

  - [x] 6.2 Implement folder import in ImportService
    - Implement `importFolder(vaultId: string, files: UploadedFile[]): Promise<void>`:
      - Validate vault exists
      - Validate depth (≤ 10 levels) and file count (≤ 500 files)
      - Check for name conflicts at all target paths before writing
      - Create directory structure preserving relative paths, including empty subfolders
      - Track all created paths; on failure, remove them in reverse order (files first, then directories)
    - _Requirements: 5.1, 5.2, 5.4, 5.5, 5.6, 5.7_

  - [ ]* 6.3 Write property tests for file import
    - **Property 8: File Import Round-Trip**
    - **Validates: Requirements 4.1, 4.4**
    - **Property 9: File Import Conflict Detection**
    - **Validates: Requirements 4.3**
    - **Property 10: File Import Validation**
    - **Validates: Requirements 4.7**
    - **Property 11: File Import Atomicity**
    - **Validates: Requirements 4.5**

  - [ ]* 6.4 Write property tests for folder import
    - **Property 12: Folder Import Structural Preservation**
    - **Validates: Requirements 5.1, 5.2, 5.5**
    - **Property 13: Folder Import Conflict Detection**
    - **Validates: Requirements 5.4**
    - **Property 14: Folder Import Limit Validation**
    - **Validates: Requirements 5.6**
    - **Property 15: Folder Import Atomicity**
    - **Validates: Requirements 5.7**

- [x] 7. Extend API routes and controller
  - [x] 7.1 Add vault creation endpoint
    - Add `POST /vaults` route to `VaultRouteModule`
    - Implement `createVault` handler in `VaultController`: parse JSON body `{ name }`, call `vaultService.createVault(name)`, return 201 with vault metadata
    - Map `VALIDATION_ERROR` → 400, `VAULT_NAME_CONFLICT` → 409, `STORAGE_ERROR` → 500
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [x] 7.2 Add vault deletion endpoint
    - Add `DELETE /vaults/:vaultId` route to `VaultRouteModule`
    - Implement `deleteVault` handler in `VaultController`: extract vaultId param, call `vaultService.deleteVault(vaultId)`, return 204
    - Map `VaultNotFoundError` → 404, filesystem errors → 500
    - _Requirements: 2.1, 2.2, 2.3, 2.4_

  - [x] 7.3 Add file import endpoint
    - Add `POST /vaults/:vaultId/import/file` route to `VaultRouteModule`
    - Implement `importFile` handler in `VaultController`: parse multipart form data, extract file, call `importService.importFile(vaultId, file)`, return 201
    - Map validation errors → 400, `FILE_CONFLICT` → 409, `FILE_TOO_LARGE` → 413, `VAULT_NOT_FOUND` → 404
    - _Requirements: 4.1, 4.3, 4.4, 4.5, 4.6, 4.7_

  - [x] 7.4 Add folder import endpoint
    - Add `POST /vaults/:vaultId/import/folder` route to `VaultRouteModule`
    - Implement `importFolder` handler in `VaultController`: parse multipart form data with multiple files (including relative paths), call `importService.importFolder(vaultId, files)`, return 201
    - Map validation errors → 400, `FILE_CONFLICT` → 409, `VAULT_NOT_FOUND` → 404
    - _Requirements: 5.1, 5.2, 5.4, 5.5, 5.6, 5.7_

  - [x] 7.5 Add content deletion endpoint
    - Add `DELETE /vaults/:vaultId/content` route to `VaultRouteModule`
    - Implement `deleteContent` handler in `VaultController`: extract vaultId and `path` query param, call `vaultService.deleteContent(vaultId, path)`, return 204
    - Map `VaultNotFoundError` → 404, `FILE_NOT_FOUND` → 404, `PathTraversalError` → 400
    - _Requirements: 6.1, 6.2, 6.4, 6.5, 6.6_

  - [x] 7.6 Update CORS and HTTP methods
    - Update CORS config in `backend/src/index.ts` to allow `POST` and `DELETE` methods in addition to `GET`
    - Wire `ImportService` into the composition root
    - Wire `VaultRegistry` into the composition root
    - Update `VaultService` constructor to accept `IVaultRegistry` and `IImportService`
    - _Requirements: 1.1, 2.1, 4.1, 5.1, 6.1_

- [x] 8. Update server initialization for persistent vaults
  - [x] 8.1 Replace static vault loading with registry-based initialization
    - Modify `VaultService.initializeVaults()` to load from `VaultRegistry` instead of static config
    - On startup: load registry entries, verify each storage directory exists, skip missing ones with a warning log
    - Make loaded vaults available in VaultManager's in-memory map
    - Maintain backward compatibility: if registry is empty but static config has vaults, optionally migrate them (or just ignore static config)
    - _Requirements: 7.1, 7.2, 7.5_

  - [ ]* 8.2 Write unit tests for server initialization
    - Test that vaults load from registry on startup
    - Test that missing vault directories are skipped with warning
    - Test that valid vaults appear in vault list after initialization
    - _Requirements: 7.2, 7.5_

- [x] 9. Checkpoint - Ensure all backend tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Extend frontend ApiClient
  - [x] 10.1 Add new API methods to ApiClient
    - Add `createVault(name: string): Promise<VaultInfo>` — POST to `/api/v1/vaults`
    - Add `deleteVault(vaultId: string): Promise<void>` — DELETE to `/api/v1/vaults/:vaultId`
    - Add `importFile(vaultId: string, file: File): Promise<void>` — POST multipart to `/api/v1/vaults/:vaultId/import/file`
    - Add `importFolder(vaultId: string, files: FileList): Promise<void>` — POST multipart to `/api/v1/vaults/:vaultId/import/folder`
    - Add `deleteContent(vaultId: string, path: string): Promise<void>` — DELETE to `/api/v1/vaults/:vaultId/content?path=...`
    - Update `IApiClient` interface in `frontend/src/api/index.ts`
    - _Requirements: 1.1, 2.1, 4.1, 5.1, 6.1_

  - [ ]* 10.2 Write unit tests for new ApiClient methods
    - Test request construction (correct URL, method, headers, body)
    - Test error response parsing
    - _Requirements: 1.1, 2.1, 4.1, 5.1, 6.1_

- [x] 11. Extend frontend state management
  - [x] 11.1 Add new actions and reducer cases
    - Add `VAULT_CREATED`, `VAULT_DELETED`, `CONTENT_DELETED` action types to `AppAction` in `frontend/src/types.ts`
    - Implement reducer cases in `frontend/src/state/index.ts`:
      - `VAULT_CREATED`: append new vault to `state.vaults`
      - `VAULT_DELETED`: remove vault from `state.vaults`, if deleted vault was selected then set `selectedVaultId` to null and clear tree/file
      - `CONTENT_DELETED`: trigger tree refresh (set `directoryTree` to null to force reload)
    - _Requirements: 1.6, 2.5, 2.6, 6.3_

  - [x] 11.2 Add action creator functions
    - Add `createVault(dispatch, apiClient, name)`: dispatch LOADING → call API → dispatch VAULT_CREATED or ERROR
    - Add `deleteVault(dispatch, apiClient, vaultId)`: dispatch LOADING → call API → dispatch VAULT_DELETED or ERROR
    - Add `importFile(dispatch, apiClient, vaultId, file)`: dispatch LOADING → call API → refresh tree → dispatch TREE_LOADED or ERROR
    - Add `importFolder(dispatch, apiClient, vaultId, files)`: dispatch LOADING → call API → refresh tree → dispatch TREE_LOADED or ERROR
    - Add `deleteContent(dispatch, apiClient, vaultId, path)`: dispatch LOADING → call API → refresh tree → dispatch TREE_LOADED or ERROR
    - _Requirements: 1.6, 2.5, 4.2, 5.3, 6.3_

  - [ ]* 11.3 Write unit tests for new reducer cases
    - Test VAULT_CREATED appends to vault list
    - Test VAULT_DELETED removes vault and clears selection if needed
    - Test CONTENT_DELETED triggers tree refresh
    - _Requirements: 1.6, 2.5, 2.6_

- [x] 12. Update VaultList component (Dropdown)
  - [x] 12.1 Add vault creation UI
    - Refactored VaultList from a list to a dropdown menu
    - Dropdown trigger shows selected vault name or placeholder
    - "+ Neuer Vault" button in dropdown reveals inline creation form
    - On submit: call `createVault` action creator with the entered name
    - Show validation errors inline (empty name, name too long, name conflict)
    - Clear input and hide form on successful creation
    - _Requirements: 1.1, 1.6_

  - [x] 12.2 Add vault deletion UI and visual distinction
    - Add a delete button (×) to each vault entry in the dropdown (with confirmation prompt)
    - Call `deleteVault` action creator on confirmation
    - Dropdown trigger clearly distinguishes vault selection from file/folder navigation
    - Each vault entry has `aria-label="Vault: {name}"` for accessibility
    - _Requirements: 2.1, 2.5, 2.6, 3.1, 3.2, 3.3_

  - [ ]* 12.3 Write unit tests for VaultList changes
    - Test create vault form renders and submits
    - Test delete button triggers confirmation and deletion
    - Test vault icon/visual indicator is rendered
    - Test aria-label includes vault type
    - _Requirements: 1.6, 2.5, 3.1, 3.2, 3.3_

- [x] 13. Update FileExplorer component
  - [x] 13.1 Add import and delete actions to FileExplorer
    - Add "Import File" button that opens a file picker (`<input type="file">`)
    - Add "Import Folder" button that opens a folder picker (`<input type="file" webkitdirectory>`)
    - On file selection: call `importFile` or `importFolder` action creator
    - Add a delete button/context action on each file and folder node in the tree
    - On delete: show confirmation, then call `deleteContent` action creator
    - After successful import or deletion: tree refreshes automatically via state
    - Show error messages on failure (displayed via existing error state)
    - _Requirements: 4.1, 4.2, 5.1, 5.3, 6.1, 6.3, 6.7_

  - [ ]* 13.2 Write unit tests for FileExplorer changes
    - Test import buttons render and trigger file picker
    - Test delete button renders on tree nodes
    - Test error display on failed operations
    - _Requirements: 4.2, 5.3, 6.3, 6.7_

- [x] 14. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The backend uses TypeScript with Hono, Vitest, and fast-check
- The frontend uses React 19, Vite, Vitest, and Testing Library
- All file operations use Node.js `fs/promises` for async I/O
- Atomic registry writes (temp file + rename) prevent corruption on crash

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "2.2", "2.3"] },
    { "id": 2, "tasks": ["1.4", "3.1", "3.2"] },
    { "id": 3, "tasks": ["3.3", "3.4", "4.1"] },
    { "id": 4, "tasks": ["4.2", "6.1"] },
    { "id": 5, "tasks": ["6.2", "6.3"] },
    { "id": 6, "tasks": ["6.4", "7.1", "7.2", "7.5"] },
    { "id": 7, "tasks": ["7.3", "7.4", "7.6"] },
    { "id": 8, "tasks": ["8.1"] },
    { "id": 9, "tasks": ["8.2", "10.1"] },
    { "id": 10, "tasks": ["10.2", "11.1"] },
    { "id": 11, "tasks": ["11.2", "11.3"] },
    { "id": 12, "tasks": ["12.1", "12.2"] },
    { "id": 13, "tasks": ["12.3", "13.1"] },
    { "id": 14, "tasks": ["13.2"] }
  ]
}
```
