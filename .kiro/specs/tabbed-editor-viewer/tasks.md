# Implementation Plan: Tabbed Editor/Viewer

## Overview

This plan implements a tab-based editor/viewer system replacing the existing `FileViewer` component. The implementation proceeds bottom-up: backend save endpoint first, then frontend state management (tab reducer), followed by UI components (TabBar, EditMode, ViewMode, BinaryViewer), and finally wiring everything together with the FileExplorer integration.

## Tasks

- [x] 1. Backend: Implement file save endpoint
  - [x] 1.1 Add `saveFile` method to `VaultService`
    - Add `saveFile(vaultId: string, filePath: string, content: string): Promise<FileSaveResult>` to `IVaultService` interface in `backend/src/business/index.ts`
    - Implement with: vault existence check, path validation via `validateFilePath`, content size check against `maxFileSize`, atomic write (temp file + rename), directory creation with `fs.mkdir(recursive: true)`, tree refresh
    - Add `FileSaveResult` type (`{ path: string, name: string, size: number }`)
    - Add `FileTooLargeError` custom error class to the business layer
    - _Requirements: 8.1, 8.2, 8.3, 8.5, 8.6, 8.7_

  - [x] 1.2 Add `PUT /vaults/:vaultId/files` route to the API controller
    - Add `saveFile` method to `IVaultController` interface in `backend/src/api/index.ts`
    - Parse JSON body `{ path, content }`, validate required fields
    - Call `vaultService.saveFile(vaultId, path, content)`
    - Map `FileTooLargeError` to HTTP 413 with `FILE_TOO_LARGE` code
    - Register route in `VaultRouteModule.register()`
    - Return 200 with `{ path, name, size }`
    - _Requirements: 8.1, 8.2, 8.4, 8.5, 8.6, 8.7_

  - [ ]* 1.3 Write unit tests for `VaultService.saveFile`
    - Test successful write and response format
    - Test path traversal rejection
    - Test vault not found rejection
    - Test content size limit enforcement
    - Test intermediate directory creation
    - _Requirements: 8.1, 8.2, 8.3, 8.5, 8.6_

  - [ ]* 1.4 Write property test: Save round-trip (Property 9)
    - **Property 9: Save round-trip**
    - Generate random valid vault IDs, valid file paths, and valid UTF-8 content within size limits
    - Assert: saving content then reading back returns identical content with correct path, name, and size
    - **Validates: Requirements 8.1, 8.3, 8.4**

  - [ ]* 1.5 Write property test: Invalid save requests rejected (Property 10)
    - **Property 10: Invalid save requests are rejected**
    - Generate random paths with `../` traversal sequences, non-existent vault IDs, and oversized content
    - Assert: PATH_TRAVERSAL error for traversal paths, VAULT_NOT_FOUND for invalid vaults, size limit error for oversized content
    - **Validates: Requirements 8.2, 8.5, 8.6**

- [x] 2. Frontend: Tab state management
  - [x] 2.1 Define tab state types and create `tabReducer`
    - Create `frontend/src/state/tabState.ts` with `TabMode`, `TabEntry`, `TabState`, `TabAction` types as defined in design
    - Implement `tabReducer` handling: `OPEN_TAB`, `CLOSE_TAB`, `ACTIVATE_TAB`, `TOGGLE_MODE`, `TAB_CONTENT_LOADED`, `TAB_LOADING`, `TAB_ERROR`, `UPDATE_EDIT_BUFFER`, `SAVE_SUCCESS`, `SAVE_ERROR`
    - Implement `generateTabId(vaultId, filePath)` as `${vaultId}::${filePath}`
    - Implement close-neighbor-activation logic (right neighbor first, then left, then null)
    - Initial mode: `edit` for text files, `view` for binary files (set on `TAB_CONTENT_LOADED`)
    - _Requirements: 1.1, 1.2, 1.4, 2.2, 2.3, 2.4, 2.5, 3.2, 3.3, 3.4, 3.5, 3.6, 4.7_

  - [x] 2.2 Create `TabProvider` context
    - Create `frontend/src/state/tabContext.ts` with `TabProvider` component and `useTabContext` hook
    - Expose `tabState` and `tabDispatch` via context
    - Follow same pattern as existing `AppProvider`
    - _Requirements: 1.1, 3.3_

  - [ ]* 2.3 Write property test: Tab open idempotence (Property 1)
    - **Property 1: Tab open idempotence**
    - Generate random file paths and vault IDs, dispatch OPEN_TAB for same file twice
    - Assert: exactly one tab exists for that file, and it is the active tab
    - **Validates: Requirements 1.1, 1.2**

  - [ ]* 2.4 Write property test: Tab label matches filename (Property 2)
    - **Property 2: Tab label matches filename**
    - Generate random paths with various directory depths
    - Assert: tab's `fileName` equals the last segment of the file path
    - **Validates: Requirements 1.3**

  - [ ]* 2.5 Write property test: Tab order preserves insertion order (Property 3)
    - **Property 3: Tab order preserves insertion order**
    - Generate random sequences of distinct file paths, dispatch OPEN_TAB for each
    - Assert: resulting tab array is ordered by insertion time
    - **Validates: Requirements 1.4**

  - [ ]* 2.6 Write property test: Tab close and neighbor activation (Property 4)
    - **Property 4: Tab close and neighbor activation**
    - Generate random tab states (1–20 tabs), random close targets
    - Assert: tab count decreases by one, correct neighbor is activated per the algorithm
    - **Validates: Requirements 2.2, 2.3, 2.4, 2.5**

  - [ ]* 2.7 Write property test: Mode toggle isolation (Property 5)
    - **Property 5: Mode toggle isolation**
    - Generate random multi-tab states, toggle mode on one random tab
    - Assert: only that tab's mode flips, all other tabs' modes unchanged
    - **Validates: Requirements 3.2, 3.3**

  - [ ]* 2.8 Write property test: Initial mode depends on file type (Property 6)
    - **Property 6: Initial mode depends on file type**
    - Generate random files with random `isBinary` flags
    - Assert: text files get mode `edit`, binary files get mode `view`
    - **Validates: Requirements 3.4, 3.5**

  - [ ]* 2.9 Write property test: Edit buffer preserved across mode toggle (Property 7)
    - **Property 7: Edit buffer preserved across mode toggle**
    - Generate random tab states with non-null editBuffers, toggle mode
    - Assert: editBuffer content is unchanged after toggle
    - **Validates: Requirements 3.6**

  - [ ]* 2.10 Write property test: Cancel discards edit buffer (Property 8)
    - **Property 8: Cancel discards edit buffer**
    - Generate random tab states with editBuffers, dispatch cancel (TOGGLE_MODE to view + clear buffer)
    - Assert: mode is `view`, editBuffer is null, content unchanged
    - **Validates: Requirements 4.7**

- [x] 3. Checkpoint - Backend and state management
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Frontend: API client extension
  - [x] 4.1 Add `saveFile` method to `IApiClient` and `ApiClient`
    - Extend `IApiClient` interface with `saveFile(vaultId: string, filePath: string, content: string): Promise<FileSaveResult>`
    - Add `FileSaveResult` type to `frontend/src/types.ts`
    - Implement in `ApiClient` class: `PUT /api/v1/vaults/${vaultId}/files` with JSON body `{ path, content }`
    - _Requirements: 4.4, 8.1_

  - [x] 4.2 Add tab-related async action creators
    - Create `frontend/src/state/tabActions.ts` with action creators for:
      - `openTab(tabDispatch, appDispatch, apiClient, vaultId, filePath, fileName)` — dispatches OPEN_TAB, fetches content, dispatches TAB_CONTENT_LOADED or TAB_ERROR
      - `saveTab(tabDispatch, apiClient, vaultId, filePath, content)` — calls saveFile API, dispatches SAVE_SUCCESS or SAVE_ERROR
    - _Requirements: 1.1, 4.4, 4.5, 8.1_

- [x] 5. Frontend: TabBar component
  - [x] 5.1 Implement `TabBar` component
    - Create `frontend/src/components/TabBar.tsx`
    - Render horizontal tab strip with tabs in order
    - Each tab shows: filename label, mode icon (toggle button), close button (×)
    - Active tab visually distinguished (background color or underline)
    - Close button has `aria-label` for accessibility, responds to click/Enter/Space
    - Mode icon shows distinct icons for edit vs view mode, has accessible name
    - Tooltip with parent folder path when multiple files share the same name
    - _Requirements: 1.3, 1.4, 1.5, 2.1, 3.1_

  - [ ]* 5.2 Write unit tests for `TabBar` component
    - Test tab rendering with correct labels
    - Test active tab visual distinction
    - Test close button accessibility and click handling
    - Test mode icon toggle and accessible name
    - Test tooltip for duplicate filenames
    - _Requirements: 1.3, 1.4, 1.5, 2.1, 3.1_

- [x] 6. Frontend: EditMode component
  - [x] 6.1 Implement `EditMode` component
    - Create `frontend/src/components/EditMode.tsx`
    - Render `<textarea>` with file content, supporting standard text editing (cursor, selection, copy/paste)
    - Provide Save button (triggers API save) and Cancel button (discards changes, switches to view)
    - Show saving state (disabled buttons during save)
    - Show error message on save failure, preserve editBuffer
    - Show success confirmation on save
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.7_

  - [ ]* 6.2 Write unit tests for `EditMode` component
    - Test textarea renders with content
    - Test Save button triggers onSave callback
    - Test Cancel button triggers onCancel callback
    - Test error display on save failure
    - Test buttons disabled during saving state
    - _Requirements: 4.1, 4.4, 4.5, 4.7_

- [x] 7. Frontend: ViewMode (Markdown renderer) component
  - [x] 7.1 Install Markdown rendering dependencies
    - Add `unified`, `remark-parse`, `remark-gfm`, `highlight.js` to frontend dependencies
    - _Requirements: 5.1_

  - [x] 7.2 Implement `ViewMode` (MarkdownRenderer) component
    - Create `frontend/src/components/ViewMode.tsx`
    - Parse Markdown with `unified` + `remark-parse` + `remark-gfm`
    - Custom React renderer walking MDAST to produce React elements
    - Render headings (H1–H6) as collapsible `<details>`/`<summary>` sections (default expanded)
    - Render text formatting (bold, italic, strikethrough, inline code) as proper HTML elements
    - Render ordered/unordered lists and task lists (non-interactive checkboxes)
    - Render code blocks with `highlight.js` syntax highlighting (fallback to monospace for unknown languages)
    - Render GFM tables, blockquotes, horizontal rules
    - Render invalid/unparsable syntax as plain text without crashing
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

  - [x] 7.3 Implement link handling in ViewMode
    - Recognize wikilinks `[[target]]` and `[[target|display]]` via custom remark plugin or post-processing
    - Recognize standard Markdown links `[text](url)`
    - External links (http/https): render with `target="_blank"` and `rel="noopener noreferrer"`
    - Internal links: resolve against DirectoryTree, call `onInternalLinkClick(targetPath)`
    - Broken links (target not in tree): render with distinct styling (dashed underline or different color)
    - On broken link click: create file via API, then open in new tab
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x] 7.4 Implement inline image rendering in ViewMode
    - Handle Obsidian embed syntax `![[filename.ext]]` and standard `![alt](path)` syntax
    - Construct image src URL: `/api/v1/vaults/{vaultId}/files?path={encodedPath}&raw=true`
    - Scale images to max 100% width of content area
    - Show placeholder notice for images not found in vault
    - _Requirements: 7.5, 7.6_

  - [ ]* 7.5 Write unit tests for ViewMode component
    - Test heading rendering as collapsible sections
    - Test text formatting (bold, italic, code)
    - Test list rendering (ordered, unordered, task lists)
    - Test code block syntax highlighting
    - Test table rendering
    - Test external link attributes
    - Test wikilink parsing
    - Test broken link styling
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 6.1, 6.2, 6.6_

  - [ ]* 7.6 Write property test: Link resolution classifies targets correctly (Property 11)
    - **Property 11: Link resolution classifies targets correctly**
    - Generate random filenames and random directory trees
    - Assert: link resolver classifies as "existing" iff target file exists in tree, "broken" otherwise
    - **Validates: Requirements 6.6**

- [x] 8. Frontend: BinaryViewer component
  - [x] 8.1 Implement `BinaryViewer` component
    - Create `frontend/src/components/BinaryViewer.tsx`
    - For supported image formats (PNG, JPEG, JPG, GIF, AVIF, WebP, SVG): render `<img>` with src pointing to raw file endpoint, max-width 100%
    - For unsupported binary formats: show notice with filename and file type
    - Handle image load error: show fallback notice with filename
    - _Requirements: 7.1, 7.2, 7.3, 7.4_

  - [ ]* 8.2 Write unit tests for `BinaryViewer` component
    - Test image preview for supported formats
    - Test "not displayable" notice for unsupported formats
    - Test image load error fallback
    - _Requirements: 7.2, 7.3, 7.4_

- [x] 9. Checkpoint - All components implemented
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Frontend: Integration and wiring
  - [x] 10.1 Add `raw` query parameter support to backend GET /files endpoint
    - Modify `getFileContent` in `VaultController` to check for `raw=true` query param
    - When `raw=true`: read file as binary buffer, return with appropriate `Content-Type` header (image/png, image/jpeg, etc.) instead of JSON
    - This enables `<img src="...">` to load images directly from the API
    - _Requirements: 7.2, 7.5_

  - [x] 10.2 Wire `TabProvider` into the app and replace `FileViewer`
    - Wrap content area in `App.tsx` with `TabProvider`
    - Replace `FileViewer` usage with new `TabBar` + content area that renders `EditMode`, `ViewMode`, or `BinaryViewer` based on active tab's mode and file type
    - Create `frontend/src/components/TabContent.tsx` as the orchestrator component that reads active tab state and renders the appropriate sub-component
    - _Requirements: 1.1, 3.4, 3.5, 7.1_

  - [x] 10.3 Update `FileExplorer` to dispatch tab actions
    - Modify file click handler in `FileExplorer.tsx` to call `openTab` action creator (dispatching to `tabReducer`) instead of the current `loadFile` action creator
    - Ensure `FileExplorer` has access to `tabDispatch` via `useTabContext`
    - _Requirements: 1.1, 1.2_

  - [x] 10.4 Wire internal link navigation in ViewMode to tab system
    - Connect `onInternalLinkClick` in ViewMode to dispatch `OPEN_TAB` via tab action creator
    - Implement broken-link file creation: call `saveFile` API with empty content, then open tab
    - Handle file creation errors with error notification
    - _Requirements: 6.3, 6.4, 6.5_

  - [ ]* 10.5 Write integration tests for full tab workflows
    - Test: open file from FileExplorer → tab appears → content loads
    - Test: click internal link → new tab opens with linked file
    - Test: edit and save → content persisted → tab updated
    - Test: close active tab → neighbor activated
    - _Requirements: 1.1, 2.3, 4.4, 6.3_

- [x] 11. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document (Properties 1–11)
- Unit tests validate specific examples and edge cases
- The project uses **fast-check** for property-based testing, integrated with Vitest
- All code is TypeScript; backend uses ESM with `.js` extensions in imports
- Frontend uses React 19 with useReducer + Context pattern (no external state library)
- Co-located test files: `*.test.ts` / `*.test.tsx` next to source files

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1"] },
    { "id": 1, "tasks": ["1.2", "2.2", "7.1"] },
    { "id": 2, "tasks": ["1.3", "1.4", "1.5", "2.3", "2.4", "2.5", "2.6", "2.7", "2.8", "2.9", "2.10", "4.1"] },
    { "id": 3, "tasks": ["4.2", "5.1", "6.1", "7.2", "8.1"] },
    { "id": 4, "tasks": ["5.2", "6.2", "7.3", "7.4", "8.2"] },
    { "id": 5, "tasks": ["7.5", "7.6", "10.1"] },
    { "id": 6, "tasks": ["10.2", "10.3"] },
    { "id": 7, "tasks": ["10.4"] },
    { "id": 8, "tasks": ["10.5"] }
  ]
}
```
