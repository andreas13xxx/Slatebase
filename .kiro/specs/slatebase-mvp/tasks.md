# Implementation Plan: Slatebase MVP

## Overview

Incrementally build the Slatebase MVP as two independent projects — a Node.js/Hono backend and a React 19/Vite frontend — wired together via REST API. Tasks follow the dependency chain: Config → Logger → Vault Access → Business Logic → API Layer → Frontend Foundation → Frontend Features → Integration.

## Tasks

- [x] 1. Backend: Project scaffold and configuration module
  - [x] 1.1 Initialize backend project structure
    - Create `backend/` directory with `package.json` (Node.js 22+, TypeScript, Hono, Zod, pino, Vitest)
    - Create `tsconfig.json` with strict mode enabled
    - Create `config/default.json` with all default values (port, host, logLevel, vaults, maxFileSize, maxDirectoryDepth, maxVaults, allowedOrigins)
    - Create `.env.example` documenting all supported environment variables
    - Create `src/` directory skeleton: `config/`, `logger/`, `vault/`, `business/`, `api/`
    - _Requirements: 1.4, 5.1, 5.5_

  - [x] 1.2 Implement `ConfigService` with Zod validation
    - Define `ServerConfigSchema` with Zod covering all fields from the design
    - Implement `IConfigService` interface and `ConfigService` class
    - Load `config/default.json`, then overlay `process.env` values (SLATEBASE_PORT, SLATEBASE_HOST, SLATEBASE_LOG_LEVEL, SLATEBASE_VAULT_PATHS, SLATEBASE_MAX_FILE_SIZE, SLATEBASE_ALLOWED_ORIGINS)
    - Parse comma-separated `SLATEBASE_VAULT_PATHS` into `VaultConfig[]`
    - Throw `ZodError` on invalid configuration values
    - _Requirements: 1.4, 5.5_

  - [ ]* 1.3 Write unit tests for `ConfigService`
    - Test env-over-file precedence for every overridable field
    - Test comma-separated vault path parsing
    - Test Zod validation rejects invalid port ranges, unknown log levels
    - Test default values when neither env nor file provides a value
    - _Requirements: 1.4, 5.5_

- [x] 2. Backend: Logger module
  - [x] 2.1 Implement `AppLogger` with pino
    - Define `ILogger` interface (debug, info, warn, error)
    - Implement `AppLogger` class wrapping pino, log level sourced from `IConfigService`
    - Export factory function `createLogger(config: IConfigService): ILogger`
    - _Requirements: 5.2_

  - [ ]* 2.2 Write unit tests for `AppLogger`
    - Test that log level from config is applied
    - Test that each method (debug/info/warn/error) delegates to pino
    - _Requirements: 5.2_

- [x] 3. Backend: Vault Access Layer
  - [x] 3.1 Implement `generateVaultId` and `resolveVaultName`
    - Implement `generateVaultId(absolutePath: string): string` using SHA-256 (first 12 hex chars)
    - Implement `resolveVaultName(dirName: string, existingNames: Set<string>): string` with 128-char truncation and numeric suffix deduplication
    - _Requirements: 1.5, 1.6_

  - [ ]* 3.2 Write unit tests for `generateVaultId` and `resolveVaultName`
    - Test that same path always produces same ID
    - Test that different paths produce different IDs
    - Test name truncation at 128 characters
    - Test numeric suffix appended when name already exists (Vault → Vault-2 → Vault-3)
    - _Requirements: 1.5, 1.6_

  - [x] 3.3 Implement `isBinaryContent` and `validateFilePath`
    - Implement `isBinaryContent(buffer: Buffer): boolean` — check first 8 KB for null bytes
    - Implement `validateFilePath(vaultAbsolutePath: string, rawFilePath: string): string` — URL-decode, normalize, reject absolute paths and null bytes, prefix-check against vault root
    - Throw `PathTraversalError` on violations
    - _Requirements: 4.6, 5.2_

  - [ ]* 3.4 Write unit tests for `isBinaryContent` and `validateFilePath`
    - Test `isBinaryContent` with pure text buffer, buffer with null byte at position 0, null byte at position 8191, null byte at position 8192 (outside sample window)
    - Test `validateFilePath` with valid relative path, `../` traversal, double-encoded `%2F..%2F`, absolute path, null byte in path, path resolving exactly to vault root (no trailing sep)
    - _Requirements: 4.6, 5.2_

  - [x] 3.5 Implement `VaultReader`
    - Define `IVaultReader` interface
    - Implement `readDirectory(absolutePath: string, maxDepth: number): Promise<DirectoryTree>` — recursive fs scan, sort (directories first, then files, case-insensitive alphabetical), populate `itemCount` for directories and `size` for files, respect `maxDepth`
    - Implement `readFile(absolutePath: string, maxSize: number): Promise<FileContent>` — read up to `maxSize` bytes, detect binary via `isBinaryContent`, set `isTruncated` if file exceeds `maxSize`, decode as UTF-8
    - _Requirements: 1.1, 1.2, 3.4, 4.1, 4.5, 4.6, 4.7_

  - [ ]* 3.6 Write unit tests for `VaultReader`
    - Test `readDirectory` with a nested fixture vault (directories before files, correct `itemCount`, correct `size`)
    - Test `readDirectory` stops recursion at `maxDepth`
    - Test `readFile` returns full content for file under limit
    - Test `readFile` sets `isTruncated: true` and returns first `maxSize` bytes for oversized file
    - Test `readFile` sets `isBinary: true` and empty content for binary file
    - Test `readFile` preserves UTF-8 special characters and Umlauts
    - _Requirements: 1.2, 3.4, 4.1, 4.5, 4.6, 4.7_

  - [x] 3.7 Implement `VaultManager`
    - Define `IVaultManager` interface
    - Implement `loadVaults(configs: VaultConfig[]): Promise<void>` — for each config: validate path exists, generate ID, resolve name (deduplication), call `VaultReader.readDirectory`, store `Vault` in memory; on error log and skip (graceful degradation); log warn if no vaults configured
    - Implement `getVault(vaultId: string): Vault | null`
    - Implement `getAllVaults(): Vault[]`
    - _Requirements: 1.1, 1.3, 1.5, 1.6, 1.7_

  - [ ]* 3.8 Write unit tests for `VaultManager`
    - Test successful load of multiple vaults
    - Test non-existent path is skipped and error is logged
    - Test unreadable path is skipped and error is logged
    - Test name deduplication across multiple vaults with same directory name
    - Test `getAllVaults()` returns only successfully loaded vaults
    - Test warn log when no vaults are configured
    - _Requirements: 1.1, 1.3, 1.5, 1.6, 1.7_

- [x] 4. Backend: Business Logic Layer
  - [x] 4.1 Implement `VaultService`
    - Define `IVaultService` interface
    - Implement `initializeVaults(): Promise<void>` — delegates to `IVaultManager.loadVaults` with configs from `IConfigService`
    - Implement `getVaultList(): VaultInfo[]` — returns `VaultInfo[]` from all loaded vaults
    - Implement `getVaultTree(vaultId: string): DirectoryTree` — retrieves cached tree from `IVaultManager`, throws `VaultNotFoundError` if absent
    - Implement `getFileContent(vaultId: string, filePath: string): Promise<FileContent>` — validates vault exists, calls `validateFilePath`, calls `IVaultReader.readFile`
    - _Requirements: 2.1, 2.3, 3.1, 4.1, 4.4, 4.6, 4.7_

  - [ ]* 4.2 Write unit tests for `VaultService`
    - Test `getVaultList` returns mapped `VaultInfo[]`
    - Test `getVaultTree` returns cached tree without filesystem access
    - Test `getVaultTree` throws `VaultNotFoundError` for unknown vaultId
    - Test `getFileContent` calls `validateFilePath` before reading
    - Test `getFileContent` propagates `PathTraversalError` from `validateFilePath`
    - Test `getFileContent` throws `VaultNotFoundError` for unknown vaultId
    - _Requirements: 2.1, 3.1, 4.1, 4.4_

- [x] 5. Backend: API Layer
  - [x] 5.1 Implement `VaultController`
    - Define `IVaultController` interface
    - Implement `listVaults(c: Context): Response` — returns `200` with `VaultInfo[]` JSON
    - Implement `getVaultTree(c: Context): Response` — extracts `vaultId` path param, returns `200` with `DirectoryTree` JSON or structured `ApiError`
    - Implement `getFileContent(c: Context): Response` — extracts `vaultId` path param and `path` query param, URL-decodes path, returns `200` with `FileContent` JSON or structured `ApiError`
    - Map domain errors to HTTP status codes per the design error table
    - Include `code`, `message`, `timestamp` in all error responses
    - _Requirements: 2.1, 2.3, 3.1, 4.1, 4.4, 4.6, 4.7, 5.4_

  - [ ]* 5.2 Write unit tests for `VaultController`
    - Test `listVaults` returns 200 with vault array
    - Test `getVaultTree` returns 200 with tree for valid vaultId
    - Test `getVaultTree` returns 404 with `VAULT_NOT_FOUND` for unknown vaultId
    - Test `getFileContent` returns 200 with `FileContent` for valid request
    - Test `getFileContent` returns 400 with `PATH_TRAVERSAL` for traversal attempt
    - Test `getFileContent` returns 404 with `FILE_NOT_FOUND` for missing file
    - Test `getFileContent` returns 403 with `PERMISSION_DENIED` for unreadable file
    - _Requirements: 2.1, 3.1, 4.1, 4.4, 4.6, 4.7_

  - [x] 5.3 Implement router and `VaultRouteModule`
    - Define `RouteModule` interface
    - Implement `createRouter(registry: RouteModule[]): Hono` — iterates registry and calls `module.register(router)`
    - Implement `VaultRouteModule` registering GET `/vaults`, GET `/vaults/:vaultId/tree`, GET `/vaults/:vaultId/files`
    - _Requirements: 5.4, 5.6_

  - [x] 5.4 Implement `index.ts` composition root and server startup
    - Instantiate `ConfigService`, `AppLogger`, `VaultReader`, `VaultManager`, `VaultService`, `VaultController`
    - Configure Hono app with CORS middleware (origins from config)
    - Mount router at `/api/v1`
    - Call `VaultService.initializeVaults()` before starting server
    - Start `@hono/node-server` on configured host/port
    - Log server started (info), vault loaded (info), vault error (error), no vaults (warn)
    - Support `node --env-file=.env src/index.ts` startup
    - _Requirements: 1.1, 1.3, 1.7, 5.1, 5.4, 5.5, 5.6_

- [x] 6. Backend checkpoint — Ensure all tests pass
  - Run `vitest --run` in `backend/`; ensure all unit tests pass. Ask the user if questions arise.

- [x] 7. Frontend: Project scaffold and API client
  - [x] 7.1 Initialize frontend project structure
    - Create `frontend/` with Vite + React 19 + TypeScript template
    - Configure `vite.config.ts` with dev proxy to backend (port 3000)
    - Create `src/` directory skeleton: `components/`, `state/`, `api/`
    - Install Vitest, React Testing Library, and Playwright
    - _Requirements: 5.1, 5.3_

  - [x] 7.2 Define shared TypeScript types
    - Create `src/types.ts` with `VaultInfo`, `DirectoryTree`, `FileContent`, `AppState`, `AppAction`, `AppError` interfaces matching the design data models
    - _Requirements: 5.3_

  - [x] 7.3 Implement `ApiClient`
    - Define `IApiClient` interface
    - Implement `fetchVaults(): Promise<VaultInfo[]>`
    - Implement `fetchVaultTree(vaultId: string): Promise<DirectoryTree>`
    - Implement `fetchFileContent(vaultId: string, filePath: string): Promise<FileContent>` — encode `filePath` with `encodeURIComponent` before appending as query param
    - Throw typed `AppError` on non-2xx responses, parsing `ApiError` JSON from backend
    - _Requirements: 4.1, 5.1, 5.3_

  - [ ]* 7.4 Write unit tests for `ApiClient`
    - Test `fetchVaults` calls correct URL and returns parsed `VaultInfo[]`
    - Test `fetchFileContent` encodes path with `encodeURIComponent`
    - Test non-2xx response throws `AppError` with correct code
    - _Requirements: 4.1, 5.3_

- [x] 8. Frontend: State management
  - [x] 8.1 Implement `appReducer` and `AppContext`
    - Implement `appReducer(state: AppState, action: AppAction): AppState` handling all action types: `VAULTS_LOADED`, `VAULT_SELECTED`, `TREE_LOADED`, `FILE_LOADED`, `LOADING_STARTED`, `ERROR_OCCURRED`
    - Implement `AppContext` with `useReducer`, expose `state` and `dispatch`
    - Implement action creator functions that call `ApiClient` and dispatch appropriate actions
    - _Requirements: 5.3_

  - [ ]* 8.2 Write unit tests for `appReducer`
    - Test each action type produces correct next state
    - Test `LOADING_STARTED` sets `loading: true` and clears `error`
    - Test `ERROR_OCCURRED` sets `error` and clears `loading`
    - Test `VAULT_SELECTED` sets `selectedVaultId` and clears `directoryTree` and `selectedFile`
    - _Requirements: 5.3_

- [x] 9. Frontend: UI components
  - [x] 9.1 Implement `VaultList` component
    - Render list of `VaultInfo` items from state as selectable entries
    - Dispatch `VAULT_SELECTED` on click
    - Show "Keine Vaults verfügbar" message when vault list is empty
    - _Requirements: 2.1, 2.3, 2.4_

  - [ ]* 9.2 Write unit tests for `VaultList`
    - Test renders vault names from state
    - Test click dispatches `VAULT_SELECTED` with correct vaultId
    - Test empty state message is shown when vaults array is empty
    - _Requirements: 2.1, 2.3, 2.4_

  - [x] 9.3 Implement `FileExplorer` component
    - Render `DirectoryTree` recursively as a collapsible tree
    - All folders collapsed on initial render (local UI state via `useState`)
    - Toggle folder open/closed on click; show visual indicator (arrow/chevron)
    - Highlight selected file
    - Dispatch file selection action on file click
    - Show `itemCount` next to folder names
    - Show "Vault ist leer" message when tree has no children
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6_

  - [ ]* 9.4 Write unit tests for `FileExplorer`
    - Test all folders are collapsed on initial render
    - Test clicking a folder toggles its children visibility
    - Test clicking a file dispatches file selection action
    - Test selected file is visually highlighted
    - Test `itemCount` is displayed for directories
    - Test empty vault message shown when tree has no children
    - _Requirements: 3.1, 3.2, 3.3, 3.5, 3.6_

  - [x] 9.5 Implement `FileViewer` component
    - Display `FileContent.name` as heading
    - Render `FileContent.content` in a `<pre>` with monospace font
    - Show truncation notice when `isTruncated === true`
    - Show binary file notice when `isBinary === true`
    - Show error message (filename + reason) when file load fails
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

  - [ ]* 9.6 Write unit tests for `FileViewer`
    - Test file name rendered as heading
    - Test content rendered in monospace `<pre>`
    - Test truncation notice shown when `isTruncated: true`
    - Test binary notice shown when `isBinary: true`
    - Test error message shown with filename and reason on load failure
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.6, 4.7_

  - [x] 9.7 Implement `App` root component and layout
    - Compose `VaultList`, `FileExplorer`, and `FileViewer` within `AppContext.Provider`
    - Show `VaultList` on initial load; switch to vault view (FileExplorer + FileViewer) when a vault is selected
    - Provide navigation back to vault overview from vault view
    - Fetch vaults on mount via action creator
    - Show loading indicator while `state.loading === true`
    - Show global error message when `state.error` is set
    - _Requirements: 2.1, 2.2, 2.4_

  - [ ]* 9.8 Write unit tests for `App`
    - Test vault list is fetched on mount
    - Test selecting a vault triggers tree fetch and shows `FileExplorer`
    - Test back navigation returns to `VaultList`
    - Test loading indicator shown during async operations
    - _Requirements: 2.1, 2.2_

- [x] 10. Frontend checkpoint — Ensure all tests pass
  - Run `vitest --run` in `frontend/`; ensure all unit tests pass. Ask the user if questions arise.

- [x] 11. End-to-end integration and E2E tests
  - [x] 11.1 Write backend integration tests
    - Use Hono's `app.request()` helper to test all three API endpoints against a real fixture vault directory
    - Test `GET /api/v1/vaults` returns correct vault list
    - Test `GET /api/v1/vaults/:id/tree` returns correct tree structure
    - Test `GET /api/v1/vaults/:id/files?path=...` returns correct file content
    - Test path traversal attempts return 400 with `PATH_TRAVERSAL` code
    - Test CORS headers are present on responses
    - _Requirements: 1.1, 1.2, 3.1, 4.1, 5.4_

  - [ ]* 11.2 Write Playwright E2E tests
    - Test full flow: load app → see vault list → select vault → see file tree → click file → see content
    - Test empty vault shows appropriate message in FileExplorer
    - Test binary file shows binary notice in FileViewer
    - Test truncated file shows truncation notice in FileViewer
    - _Requirements: 2.1, 2.2, 3.1, 3.3, 4.6, 4.7_

- [x] 12. Final checkpoint — Ensure all tests pass
  - Run `vitest --run` in both `backend/` and `frontend/`, then run Playwright tests. Ensure all pass. Ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP
- Each task references specific requirements for traceability
- The backend and frontend are completely independent projects — no shared source files or dependencies
- Directory tree sorting (directories first, case-insensitive alphabetical) is performed in the backend; the frontend renders in received order
- File content is never cached; only the directory tree is held in memory
- The `node --env-file=.env` flag (Node.js 22+) eliminates the need for a `dotenv` dependency

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "7.1"] },
    { "id": 1, "tasks": ["1.2", "2.1", "7.2"] },
    { "id": 2, "tasks": ["1.3", "2.2", "3.1", "7.3"] },
    { "id": 3, "tasks": ["3.2", "3.3", "7.4", "8.1"] },
    { "id": 4, "tasks": ["3.4", "3.5", "8.2", "9.1"] },
    { "id": 5, "tasks": ["3.6", "3.7", "9.2", "9.3"] },
    { "id": 6, "tasks": ["3.8", "4.1", "9.4", "9.5"] },
    { "id": 7, "tasks": ["4.2", "5.1", "9.6", "9.7"] },
    { "id": 8, "tasks": ["5.2", "5.3", "9.8"] },
    { "id": 9, "tasks": ["5.4"] },
    { "id": 10, "tasks": ["11.1"] },
    { "id": 11, "tasks": ["11.2"] }
  ]
}
```
