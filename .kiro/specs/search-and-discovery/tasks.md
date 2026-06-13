# Implementation Plan: Search and Discovery (Phase 1)

## Overview

Vault-weite Volltextsuche mit Find & Replace für Slatebase. Das Backend erhält ein neues `search`-Modul (analog zu `chat`, `sync`, `mcp`) mit SearchService, ReplaceService, eigenen Error-Klassen und Zod-Validation. Im Frontend wird ein `searchState`/`searchContext` eingeführt sowie eine `SearchPanel`-Komponente die den File Explorer temporär ersetzt. Keine Datenbank/Index für Phase 1 — lineare Datei-Iteration mit String-Matching.

## Tasks

- [x] 1. Backend: Search module types, errors, and validation
  - [x] 1.1 Create `backend/src/search/types.ts` with all interfaces
    - Define `ISearchService`, `ISearchOptions`, `SearchResponse`, `SearchFileResult`, `SearchHit`, `SkippedFile`, `MultiVaultSearchResponse`
    - Define `IReplaceService`, `ReplaceOptions`, `ReplaceResponse`, `ReplaceFileResult`, `ReplaceFailure`
    - Use `.js` extensions on imports, `I` prefix on interfaces
    - _Requirements: 1.1, 1.3, 2.1, 6.2, 11.1, 12.1_

  - [x] 1.2 Create `backend/src/search/errors.ts` with custom error classes
    - Implement `SearchQueryValidationError`, `RegexValidationError`, `RegexTooLongError`, `SearchTimeoutError`, `ReplaceValidationError`, `FileChangedError`
    - Each extends `Error` with descriptive message
    - _Requirements: 3.4, 3.5, 11.3, 11.5, 12.4_

  - [x] 1.3 Create `backend/src/search/validation.ts` with Zod schemas
    - `searchQuerySchema`: query (1–500 chars, not whitespace-only), caseSensitive (boolean, default false), regex (boolean, default false), contextLines (int 0–10, default 2), maxResults (int 1–500, default 500)
    - `multiVaultSearchSchema`: extends searchQuerySchema with vaultIds (comma-separated, max 20)
    - `replaceBodySchema`: query (1–500, not whitespace-only), replacement (0–5000), caseSensitive (boolean), regex (boolean), paths (optional string[], max 100)
    - _Requirements: 11.1, 11.2, 12.1_

  - [ ]* 1.4 Write unit tests for types, errors, and validation
    - Test all Zod schemas: valid inputs, boundary values, invalid inputs
    - Test error class construction, inheritance from Error, and messages
    - Co-located at `backend/src/search/validation.test.ts` and `backend/src/search/errors.test.ts`
    - _Requirements: 11.3, 12.1_

- [x] 2. Backend: SearchService implementation
  - [x] 2.1 Create `backend/src/search/search-service.ts` with `SearchService` class
    - Constructor: `IVaultService`, `IVaultAccessControl`, `ILogger`
    - Implement `search(vaultId, options)`: list text files (max 1000, alphabetical), iterate line-by-line, match plain-text or regex, collect hits with context lines, enforce 30s timeout, skip binary/internal/_-prefix/too-large files
    - Case-insensitive by default, case-sensitive when option set
    - Context lines merging for nearby hits (< 2*contextLines+1 apart)
    - Truncation: file_limit (>1000 files), result_limit (>maxResults hits), time_limit (>30s)
    - Per-file regex timeout: 5s then skip
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 3.1, 3.2, 3.3, 3.5, 3.6, 3.7, 4.1, 4.4, 10.1, 10.3, 10.4_

  - [x] 2.2 Implement `searchMultiVault(vaultIds, options)` in SearchService
    - Search across multiple vaults (max 20), filter by user read access via VaultAccessControl
    - If vaultIds not provided, search all accessible vaults
    - Global file limit (1000) and time limit (30s) across all vaults
    - Partial success: collect results from successful vaults, track failed vaults with reason
    - Sort vault results alphabetically by vault name
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 11.2_

  - [ ]* 2.3 Write unit tests for SearchService
    - Test: happy path search, empty vault, binary file skip, internal file skip (_-prefix), file-too-large skip (>10MB), case-sensitive vs insensitive, regex mode, invalid regex rejection, regex pattern too long, context lines at file boundaries, context merging for nearby hits, file limit (1000), result limit (maxResults), timeout behavior, multi-vault search, multi-vault partial failure, multi-vault alphabetical sorting
    - Use mock IVaultService, IVaultAccessControl, ILogger
    - Co-located at `backend/src/search/search-service.test.ts`
    - _Requirements: 1.1–1.6, 2.1–2.4, 3.1–3.7, 4.1, 4.4, 10.1–10.4_

- [x] 3. Backend: ReplaceService implementation
  - [x] 3.1 Create `backend/src/search/replace-service.ts` with `ReplaceService` class
    - Constructor: `IVaultService`, `IVaultAccessControl`, `ILogger`
    - Implement `replace(vaultId, options)`: find all occurrences, replace text, atomic write per file (temp → rename)
    - Max 100 files per operation
    - Skip files changed since search (ETag-based)
    - Partial failure handling: successful replacements kept, failed files reported
    - Sequential file processing
    - Support both plain-text and regex replacements
    - _Requirements: 6.2, 6.4, 7.3, 7.4, 7.5, 7.6, 12.1, 12.2_

  - [ ]* 3.2 Write unit tests for ReplaceService
    - Test: single file replace, bulk replace across multiple files, file-changed-since-search rejection, max 100 files cap, partial failure (some files succeed, some fail), regex replace, empty replacement string, no matches (returns 0), atomic write verification
    - Use mock IVaultService, IVaultAccessControl, ILogger
    - Co-located at `backend/src/search/replace-service.test.ts`
    - _Requirements: 6.2, 6.4, 7.3, 7.4, 7.5, 7.6, 12.5, 12.6_

- [x] 4. Backend: API routes and barrel export
  - [x] 4.1 Create `backend/src/search/index.ts` barrel export
    - Export all types, interfaces, error classes, services, and validation schemas
    - _Requirements: 11.1, 12.1_

  - [x] 4.2 Create `backend/src/api/searchRoutes.ts` with route handlers
    - `GET /api/v1/vaults/:vaultId/search` — single-vault search (query params validated via Zod)
    - `GET /api/v1/search` — multi-vault search (query params + vaultIds)
    - `POST /api/v1/vaults/:vaultId/replace` — replace (JSON body validated via Zod)
    - Auth middleware: 401 if not authenticated
    - Access control: 403 if no read access (search) or no write access (replace)
    - Error mapping: SearchQueryValidationError→400, RegexValidationError→400, RegexTooLongError→400, ReplaceValidationError→400, VaultNotFoundError→404, VaultAccessDeniedError→403
    - _Requirements: 1.6, 11.1–11.5, 12.1–12.6_

  - [x] 4.3 Register search routes in the composition root (`backend/src/index.ts`)
    - Instantiate `SearchService` and `ReplaceService` with existing dependencies (vaultService, vaultAccessControl, logger)
    - Create and register `searchRoutes` on the Hono app
    - Wire behind auth middleware
    - _Requirements: 11.1, 12.1_

  - [ ]* 4.4 Write integration tests for search routes
    - Test HTTP status codes: 200 (success), 400 (invalid query, invalid regex), 401 (unauthenticated), 403 (no access), 404 (vault not found)
    - Test query parameter parsing and defaults
    - Test replace body validation and response format
    - Co-located at `backend/src/api/searchRoutes.test.ts`
    - _Requirements: 11.1–11.5, 12.1–12.6_

- [x] 5. Checkpoint — Backend complete
  - Ensure all backend tests pass (`cd backend && npm run test`), ask the user if questions arise.

- [x] 6. Frontend: Search state and context
  - [x] 6.1 Create `frontend/src/state/searchState.ts` with reducer and types
    - Define `SearchState` interface: query, replacement, caseSensitive, regex, scope (single/all), results, vaultResults, totalHits, truncated, truncationMessage, loading, error, replaceLoading, replaceError, lastReplaceResult, activeResultId
    - Define action types: SET_QUERY, SET_REPLACEMENT, SET_OPTION, SEARCH_STARTED, SEARCH_SUCCESS, SEARCH_ERROR, REPLACE_STARTED, REPLACE_SUCCESS, REPLACE_ERROR, CLEAR_RESULTS, SET_ACTIVE_RESULT
    - Implement `searchReducer` with all state transitions
    - _Requirements: 9.1, 9.3, 9.4, 13.6_

  - [x] 6.2 Create `frontend/src/state/searchContext.ts` with SearchProvider
    - `SearchProvider` component using `useReducer(searchReducer, initialState)`
    - `useSearchContext()` hook (throws outside provider)
    - Expose dispatch + state
    - _Requirements: 9.1, 13.6_

  - [x] 6.3 Create `frontend/src/state/searchActions.ts` with action creators
    - `performSearch(dispatch, apiClient, vaultId, options)` — calls GET search endpoint, dispatches success/error
    - `performMultiVaultSearch(dispatch, apiClient, options)` — calls GET multi-vault endpoint
    - `performReplace(dispatch, apiClient, vaultId, options)` — calls POST replace endpoint
    - `performSingleReplace(dispatch, apiClient, vaultId, options)` — replace single hit
    - AbortController integration for cancelling in-flight requests
    - _Requirements: 9.4, 6.2, 7.3_

  - [ ]* 6.4 Write unit tests for searchReducer and searchActions
    - Reducer: test all state transitions, verify loading/error states
    - Actions: test dispatch sequences with mocked apiClient
    - Co-located at `frontend/src/state/searchState.test.ts`
    - _Requirements: 9.1–9.4_

- [x] 7. Frontend: API client extension
  - [x] 7.1 Extend `IApiClient` interface and `ApiClient` implementation
    - Add `searchVault(vaultId, params)`: GET /api/v1/vaults/:vaultId/search with query params
    - Add `searchMultiVault(params)`: GET /api/v1/search with query params
    - Add `replaceInVault(vaultId, body)`: POST /api/v1/vaults/:vaultId/replace with JSON body
    - _Requirements: 11.1, 11.2, 12.1_

- [x] 8. Frontend: SearchPanel component
  - [x] 8.1 Create `frontend/src/components/SearchPanel.tsx` — main component
    - Search input field (type text, placeholder "Suchen...")
    - Collapsible replace section (chevron toggle, default collapsed)
    - Replace input field (placeholder "Ersetzen...")
    - Toggle buttons: "Aa" (case-sensitive), ".*" (regex)
    - Vault scope selector: single vault / all vaults
    - 300ms debounce on search input
    - AbortController for cancelling previous request on new input
    - Loading spinner in results area
    - "Keine Ergebnisse" when results empty
    - Clear results when input emptied
    - German labels throughout
    - _Requirements: 8.1, 8.2, 9.1, 9.2, 9.3, 9.4, 13.1, 13.2, 13.4, 13.5, 13.6_

  - [x] 8.2 Implement search results display in SearchPanel
    - Collapsible file groups: header shows file path + hit count
    - Individual hits: line number + match text with highlighted matches (background color)
    - Total hit count display with truncation warning when applicable
    - Multi-vault: group by vault with vault name header, alphabetical sort
    - Active result highlighting (background color on clicked item)
    - _Requirements: 4.2, 4.3, 2.2, 5.4, 13.3_

  - [x] 8.3 Implement replace UI in SearchPanel
    - "Ersetzen" button per hit (single replace)
    - "Alle ersetzen" button (bulk replace with confirmation dialog)
    - Replace preview before "Alle ersetzen" (file count + hit count)
    - Hide replace controls when user has read-only access
    - Success/error feedback after replace operations
    - Update results list after successful replacement
    - _Requirements: 6.1, 6.2, 6.3, 6.5, 7.1, 7.2, 7.3, 7.4, 13.2_

  - [x] 8.4 Implement result navigation (click to open file at line)
    - Click result → open file in new tab (view mode) and scroll to line
    - If file already open → activate existing tab and scroll to line
    - Multi-vault: switch selected vault before opening file
    - Position cursor in line when in edit mode
    - Callback: `onNavigateToResult(vaultId, filePath, line)`
    - _Requirements: 5.1, 5.2, 5.3, 5.5_

  - [ ]* 8.5 Write unit tests for SearchPanel
    - Test rendering states: empty, loading, results, error, no results
    - Test replace visibility (write vs read-only access)
    - Test debounce behavior (timer reset)
    - Test result click navigation callback
    - Co-located at `frontend/src/components/SearchPanel.test.tsx`
    - _Requirements: 13.1–13.6, 9.1–9.4_

- [x] 9. Frontend: Integration and keyboard shortcut
  - [x] 9.1 Integrate SearchPanel into App.tsx
    - Add `SearchProvider` to provider hierarchy (inside AppProvider)
    - Add SearchPanel to left sidebar area, replacing FileExplorer when open
    - Panel width: min 280px, max 480px (reuse existing resize pattern)
    - State for panel open/closed
    - _Requirements: 13.1_

  - [x] 9.2 Implement Ctrl+Shift+F keyboard shortcut
    - Register global keydown listener for Ctrl+Shift+F (Win/Linux) / Cmd+Shift+F (macOS)
    - Open SearchPanel and focus search input
    - If already open: refocus and select text
    - Escape key: close panel, return focus to previous element
    - Preserve last query and options when panel closed and reopened
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [x] 9.3 Add search icon button to SidebarToolbar
    - Lucide `Search` icon in toolbar
    - Click toggles SearchPanel open/close
    - Active state indicator when panel is open
    - _Requirements: 13.1_

- [x] 10. Frontend: SearchPanel CSS
  - [x] 10.1 Create `frontend/src/components/SearchPanel.css` with styles
    - Define CSS tokens in `index.css` for search-specific colors (match highlight, active result, etc.)
    - Panel layout: flex column, full height
    - Input styling: consistent with existing inputs
    - Result list: scrollable, collapsible groups
    - Match highlighting: distinct background color
    - Dark mode: token overrides in both `:root[data-theme="dark"]` and `@media (prefers-color-scheme: dark)`
    - Responsive: respect min/max width constraints
    - _Requirements: 4.2, 13.1, 13.3_

- [x] 11. Final checkpoint — Ensure all tests pass
  - Run `cd backend && npm run test` and `cd frontend && npm run test`
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- No PBT (property-based tests) — project convention is thorough unit tests with edge cases
- Backend imports use `.js` extensions (ESM), manual DI in composition root, interfaces with `I` prefix, co-located tests
- German UI labels throughout the frontend (Suchen, Ersetzen, Alle ersetzen, etc.)
- The design includes Correctness Properties but they are validated through unit test edge cases, not fast-check PBT

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["1.4", "2.1", "6.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "3.1", "6.2", "6.3"] },
    { "id": 3, "tasks": ["3.2", "4.1", "6.4", "7.1"] },
    { "id": 4, "tasks": ["4.2", "4.3"] },
    { "id": 5, "tasks": ["4.4", "8.1"] },
    { "id": 6, "tasks": ["8.2", "8.3", "8.4", "10.1"] },
    { "id": 7, "tasks": ["8.5", "9.1"] },
    { "id": 8, "tasks": ["9.2", "9.3"] }
  ]
}
```
