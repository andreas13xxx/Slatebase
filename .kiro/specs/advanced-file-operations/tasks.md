# Implementation Plan: Advanced File Operations

## Overview

This plan implements Drag & Drop file/folder moving, context menus (create, rename, delete), and Markdown link insertion by dragging files into the editor. The implementation follows the existing layered architecture: backend error classes and service methods first, then API routes, then frontend utilities, state management, and finally UI components.

## Tasks

- [x] 1. Backend error classes and validation utilities
  - [x] 1.1 Create error classes for file operations
    - Create `InvalidMoveError`, `FileConflictError`, and `InvalidNameError` in `backend/src/business/index.ts`
    - Export them from the barrel export
    - _Requirements: 8.7, 8.8, 9.4, 9.6_

  - [x] 1.2 Add name validation utility to backend business layer
    - Implement `validateContentName(name: string, maxLength?: number)` in `backend/src/business/validation.ts`
    - Reject path separators (`/`, `\`), null bytes, empty/whitespace-only strings, and names exceeding maxLength
    - Throw `InvalidNameError` on failure
    - _Requirements: 9.4, 3.5, 3.8_

  - [x]* 1.3 Write property test for filename validation (backend)
    - **Property 4: Filename validation rejects invalid inputs**
    - **Validates: Requirements 3.5, 3.8, 9.4**

- [x] 2. Backend service methods (moveContent, renameContent)
  - [x] 2.1 Add `moveContent` and `renameContent` to `IVaultService` interface
    - Extend the interface in `backend/src/business/index.ts`
    - Define method signatures as specified in the design document
    - _Requirements: 8.1, 8.2, 9.1, 9.2_

  - [x] 2.2 Implement `moveContent` in VaultService
    - Validate source and destination paths with `validateFilePath()`
    - Check for circular move (destination is subdirectory of source)
    - Check for file conflict at destination
    - Create intermediate directories with `fs.mkdir({ recursive: true })`
    - Move via `fs.rename()`
    - Update in-memory directory tree
    - _Requirements: 8.2, 8.3, 8.5, 8.6, 8.7, 8.8, 8.10, 8.11_

  - [x] 2.3 Implement `renameContent` in VaultService
    - Validate path with `validateFilePath()`
    - Validate new name with `validateContentName()`
    - Check for conflict at target path (same directory, new name)
    - Rename via `fs.rename()`
    - Update in-memory directory tree
    - _Requirements: 9.2, 9.3, 9.4, 9.5, 9.6_

  - [x]* 2.4 Write property test for circular move detection
    - **Property 11: Circular move detection**
    - **Validates: Requirements 8.8**

  - [x]* 2.5 Write property test for path traversal rejection
    - **Property 10: Path traversal rejection**
    - **Validates: Requirements 8.3, 8.5, 9.3**

  - [x]* 2.6 Write unit tests for moveContent and renameContent
    - Test success paths with mock filesystem
    - Test error paths (not found, conflict, circular move, path traversal)
    - _Requirements: 8.1–8.11, 9.1–9.8_

- [x] 3. Backend API routes (move, rename)
  - [x] 3.1 Add move and rename route handlers to VaultController
    - Implement `moveContent(c: Context)` and `renameContent(c: Context)` in `backend/src/api/index.ts`
    - Add Zod schemas for request validation (`sourcePath`, `destinationPath` for move; `path`, `newName` for rename)
    - Map domain errors to HTTP status codes per the error handling table
    - _Requirements: 8.1, 8.4, 8.9, 9.1, 9.7, 9.8_

  - [x] 3.2 Register routes and add access control middleware
    - Register `PUT /api/v1/vaults/:vaultId/move` and `PUT /api/v1/vaults/:vaultId/rename`
    - Apply `checkWriteAccess` via VaultAccessControlService before execution
    - _Requirements: 10.1, 10.2, 10.4, 10.5_

  - [x]* 3.3 Write property test for write permission enforcement
    - **Property 12: Write permission enforcement**
    - **Validates: Requirements 10.4**

  - [x]* 3.4 Write unit tests for move/rename controllers
    - Test request validation (missing fields, empty strings)
    - Test error mapping (404, 409, 400, 403)
    - Test success responses
    - _Requirements: 8.1–8.9, 9.1–9.8, 10.1–10.5_

- [x] 4. Checkpoint — Backend complete
  - Ensure all backend tests pass (`cd backend && npm run test`), ask the user if questions arise.

- [x] 5. Frontend utility functions (pathUtils, fileValidation)
  - [x] 5.1 Create `frontend/src/utils/pathUtils.ts`
    - Implement `computeRelativePath(fromFilePath, toFilePath)` — POSIX relative path calculation
    - Implement `isImageFile(fileName)` — check extension against {png, jpg, jpeg, gif, svg, webp, avif}
    - Implement `getValidDropTargets(tree, draggedPath)` — exclude self and descendants
    - Implement `clampMenuPosition(x, y, menuWidth, menuHeight, viewportWidth, viewportHeight)` — ensure 8px margin
    - _Requirements: 7.2, 7.6, 1.2, 1.5, 6.6_

  - [x] 5.2 Create `frontend/src/utils/fileValidation.ts`
    - Implement `validateFileName(name, maxLength?)` — reject invalid chars, whitespace-only, length overflow
    - Implement `normalizeFileName(name)` — auto-append `.md` if missing
    - Implement `getSelectionRange(name, isFolder)` — select name without extension for files, full name for folders
    - _Requirements: 3.5, 3.6, 3.8, 4.2, 4.8_

  - [x]* 5.3 Write property tests for pathUtils
    - **Property 1: Valid drop targets exclude dragged node and descendants**
    - **Validates: Requirements 1.2, 1.5, 2.3**

  - [x]* 5.4 Write property test for relative path computation
    - **Property 8: Relative path computation round-trip**
    - **Validates: Requirements 7.2**

  - [x]* 5.5 Write property test for image file detection
    - **Property 9: Image file detection determines link format**
    - **Validates: Requirements 7.6**

  - [x]* 5.6 Write property test for viewport clamping
    - **Property 7: Context menu viewport clamping**
    - **Validates: Requirements 6.6**

  - [x]* 5.7 Write property tests for fileValidation
    - **Property 4: Filename validation rejects invalid inputs (frontend)**
    - **Property 5: Auto-append .md extension**
    - **Property 6: Rename extension handling**
    - **Validates: Requirements 3.5, 3.6, 3.8, 4.2, 4.8, 9.4**

- [x] 6. Frontend state management (tab reducer, API client)
  - [x] 6.1 Extend tab reducer with `UPDATE_TAB_PATHS` and `CLOSE_TABS_BY_PATH` actions
    - Add new action types to `frontend/src/state/tabState.ts`
    - `UPDATE_TAB_PATHS`: replace `oldPathPrefix` with `newPathPrefix` in all matching tab filePaths
    - `CLOSE_TABS_BY_PATH`: remove all tabs whose filePath equals or starts with `pathPrefix + '/'`
    - _Requirements: 2.4, 4.5, 5.4_

  - [x]* 6.2 Write property tests for tab reducer extensions
    - **Property 2: Tab paths are correctly updated after path changes**
    - **Property 3: Tabs within deleted path are closed**
    - **Validates: Requirements 2.4, 4.5, 5.4**

  - [x] 6.3 Extend `IApiClient` with `moveContent` and `renameContent` methods
    - Add method signatures to the interface in `frontend/src/api/index.ts`
    - Implement fetch calls: `PUT /api/v1/vaults/:vaultId/move` and `PUT /api/v1/vaults/:vaultId/rename`
    - _Requirements: 8.1, 9.1_

  - [x]* 6.4 Write unit tests for API client extensions
    - Test moveContent and renameContent calls with success and error responses
    - _Requirements: 8.1, 9.1_

- [x] 7. Checkpoint — Frontend utilities and state complete
  - Ensure all frontend tests pass (`cd frontend && npm run test`), ask the user if questions arise.

- [x] 8. Frontend components — Context Menu
  - [x] 8.1 Create `frontend/src/components/ContextMenu.tsx`
    - Render as a portal with `position: fixed`
    - Show menu items with Lucide icons: "Neue Datei", "Umbenennen", "Löschen"
    - Hide write operations when `permission === 'read'`
    - Close on outside click, Escape key, or menu item selection
    - Use `clampMenuPosition` for viewport-aware positioning
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 6.9_

  - [x] 8.2 Create `frontend/src/components/InlineInput.tsx`
    - Editable input field for new file name / rename
    - Accept `initialValue`, `selectRange`, `onConfirm`, `onCancel`, `validate` props
    - Auto-focus on mount, confirm on Enter, cancel on Escape or blur
    - Show validation error message below input
    - _Requirements: 3.2, 3.5, 3.8, 4.2, 4.6_

  - [x]* 8.3 Write unit tests for ContextMenu and InlineInput
    - Test rendering, keyboard interactions, validation display
    - _Requirements: 6.1–6.9, 3.2, 3.5, 4.2, 4.6_

- [x] 9. Frontend components — Drag & Drop in FileExplorer
  - [x] 9.1 Implement Drag & Drop logic in FileExplorer
    - Add drag start/end handlers on TreeNodes (set opacity 0.5 while dragging)
    - Calculate valid drop targets using `getValidDropTargets`
    - Highlight valid folder targets on drag over
    - Prevent drag when `permission === 'read'`
    - On drop: call `apiClient.moveContent()`, reload tree, dispatch `UPDATE_TAB_PATHS`
    - Disable further DnD while move API is pending (loading state)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7, 1.8, 1.9, 2.1, 2.2, 2.3, 2.4, 2.5_

  - [x]* 9.2 Write unit tests for Drag & Drop event handlers
    - Test drag start sets state, drop calls API, invalid drops are ignored
    - _Requirements: 1.1–1.9, 2.1–2.5_

- [x] 10. Frontend components — Context Menu integration in FileExplorer
  - [x] 10.1 Integrate ContextMenu and InlineInput into FileExplorer
    - Add right-click handler to open ContextMenu (suppress browser default)
    - "Neue Datei": show InlineInput, on confirm call `saveFile` API with empty content, auto-append `.md`, open new tab
    - "Umbenennen": show InlineInput with current name, pre-select name without extension, on confirm call `renameContent` API, dispatch `UPDATE_TAB_PATHS`
    - "Löschen": show confirmation dialog, on confirm call `deleteContent` API, dispatch `CLOSE_TABS_BY_PATH`, reload tree
    - Handle right-click on file vs. folder (new file goes into parent folder for files)
    - _Requirements: 3.1–3.9, 4.1–4.8, 5.1–5.6, 6.1, 6.8, 6.9_

  - [x]* 10.2 Write unit tests for context menu operations
    - Test new file creation flow, rename flow, delete flow
    - _Requirements: 3.1–3.9, 4.1–4.8, 5.1–5.6_

- [x] 11. Frontend components — Editor drop handler (Markdown link insertion)
  - [x] 11.1 Add drop handler to EditMode for Markdown link insertion
    - Detect file drops from FileExplorer (use `dataTransfer` with custom MIME type or data attribute)
    - Compute relative path from current file to dropped file using `computeRelativePath`
    - Insert `[filename](relative/path)` at drop position (nearest character position)
    - Insert `![filename](relative/path)` for image files (use `isImageFile`)
    - Show cursor indicator while dragging over textarea
    - Ignore drop if read-only, no file open, or dropped item is a folder
    - Trigger auto-save after insertion
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.8_

  - [x]* 11.2 Write unit tests for editor drop handler
    - Test link format for regular files and images
    - Test ignore conditions (read-only, no file open, folder drop)
    - _Requirements: 7.1–7.8_

- [x] 12. Frontend — Read-only mode enforcement
  - [x] 12.1 Ensure read-only permission disables all write UI
    - Disable drag handles and drag start when `permission === 'read'`
    - Hide "Neue Datei", "Umbenennen", "Löschen" in context menu for read-only vaults
    - Ignore editor drops when read-only
    - _Requirements: 1.9, 6.7, 7.5, 10.6_

- [x] 13. Add i18n translation keys for new UI strings
  - [x] 13.1 Add German and English translation keys
    - Add keys for context menu items, confirmation dialogs, error messages, loading states
    - Add to `frontend/src/i18n/de.ts` and `frontend/src/i18n/en.ts`
    - _Requirements: 3.2, 4.1, 5.2, 6.2_

- [x] 14. Final checkpoint — All tests pass
  - Ensure all tests pass in both packages (`cd backend && npm run test` and `cd frontend && npm run test`), ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The backend is implemented first so the frontend can integrate against real endpoints
- `fast-check` is already available as a devDependency for property-based tests

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "5.1", "5.2"] },
    { "id": 1, "tasks": ["1.3", "2.1", "5.3", "5.4", "5.5", "5.6", "5.7"] },
    { "id": 2, "tasks": ["2.2", "2.3", "6.1", "6.3"] },
    { "id": 3, "tasks": ["2.4", "2.5", "2.6", "6.2", "6.4"] },
    { "id": 4, "tasks": ["3.1"] },
    { "id": 5, "tasks": ["3.2", "3.3", "3.4"] },
    { "id": 6, "tasks": ["8.1", "8.2", "13.1"] },
    { "id": 7, "tasks": ["8.3", "9.1"] },
    { "id": 8, "tasks": ["9.2", "10.1"] },
    { "id": 9, "tasks": ["10.2", "11.1", "12.1"] },
    { "id": 10, "tasks": ["11.2"] }
  ]
}
```
