# Implementation Plan: Obsidian Plugin Compatibility Layer

## Overview

Implementierung eines Compatibility Layers für Obsidian Community Plugins in Slatebase. Das System emuliert eine Teilmenge der Obsidian Plugin API (App, Vault, Workspace, MetadataCache) und stellt einen Plugin-Loader, ein Sicherheitsmodell (Sandboxing), eine Verwaltungsoberfläche sowie Backend-Persistenz bereit. Die Implementierung erfolgt in TypeScript (Frontend: React/Vite, Backend: Hono/Node.js).

## Tasks

- [x] 1. Core Types, Interfaces und Event System
  - [x] 1.1 Create Obsidian-compatible data models and shared types
    - Create `frontend/src/plugins/compat/types.ts` with TFile, TFolder, TAbstractFile, CachedMetadata, LinkCache, TagCache, HeadingCache, Pos, PluginManifest, PluginRegistryEntry, PluginStatus, PluginPermissions, PluginInstance, EventRef, Command, Hotkey interfaces
    - Create `frontend/src/plugins/compat/errors.ts` with PluginError, ManifestValidationError, BundleEvaluationError, LifecycleError, SecurityViolationError, SettingsError, InstallationError classes
    - _Requirements: 4.1, 5.5, 7.1, 8.7_

  - [x] 1.2 Implement EventSystem (on/off/trigger/offref/removeAllListeners)
    - Create `frontend/src/plugins/compat/event-system.ts` implementing IEventEmitter interface
    - Synchronous dispatch in registration order, exception isolation per callback, idempotent off()
    - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5, 13.6_



- [x] 2. Manifest Parsing and Validation
  - [x] 2.1 Implement manifest parser with Zod validation
    - Create `frontend/src/plugins/compat/manifest-parser.ts`
    - Parse manifest.json: extract id, name, version, minAppVersion, author, description
    - Validate required fields (id, name, version non-empty), semver format for version
    - Preserve unknown fields for round-trip (passthrough)
    - Reject files >1 MB, report JSON syntax errors with position
    - Semver comparison for minAppVersion against emulated version (1.4.0)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_



- [x] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Vault Shim (Dateisystem-Emulation)
  - [x] 4.1 Implement VaultShim with Slatebase API integration
    - Create `frontend/src/plugins/compat/shims/vault-shim.ts` implementing IVaultShim
    - Implement read(), modify(), create(), delete(), getAbstractFileByPath(), getMarkdownFiles(), getFiles(), getName()
    - Integrate with Slatebase API client for file operations
    - Emit events (create, modify, delete) on successful operations
    - Path validation: reject paths outside vault, paths with ../, null bytes
    - Error handling: reject operations on non-existent files, duplicate creates
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 5.8, 5.9, 5.10, 5.11_



- [x] 5. Workspace Shim und MetadataCache Shim
  - [x] 5.1 Implement WorkspaceShim
    - Create `frontend/src/plugins/compat/shims/workspace-shim.ts` implementing IWorkspaceShim
    - Implement getActiveFile(), on/off/trigger for events (file-open, active-leaf-change)
    - No-op functions for non-emulated methods with console warning
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.7_

  - [x] 5.2 Implement MetadataCacheShim
    - Create `frontend/src/plugins/compat/shims/metadata-cache-shim.ts` implementing IMetadataCacheShim
    - Implement getFileCache() returning CachedMetadata (frontmatter, links, tags, headings)
    - Implement getFirstLinkpathDest() using existing link-resolver logic
    - Implement resolvedLinks map, emit changed/resolved events
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7_



- [x] 6. App Shim (Zentraler API-Einstiegspunkt)
  - [x] 6.1 Implement AppShim with Proxy-based API shimming
    - Create `frontend/src/plugins/compat/shims/app-shim.ts` implementing IAppShim
    - Expose vault, workspace, metadataCache properties bound to vault context
    - Expose plugins property (plugins map, enabledPlugins set, getPlugin method)
    - Use ES6 Proxy for non-emulated property/method access (return undefined/no-op, log warning once per property per plugin)
    - Per-vault-context instances, vault-switch lifecycle (onunload/onload)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6_



- [x] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Plugin Sandbox (Sicherheit)
  - [x] 8.1 Implement PluginSandbox with Proxy-based access control
    - Create `frontend/src/plugins/compat/sandbox.ts` implementing IPluginSandbox
    - Vault isolation: reject API calls with different vault ID
    - Storage namespace isolation: prefix keys with `slatebase_plugin_<pluginId>_`, enforce 5 MB limit per storage type
    - Network allowlist enforcement: intercept fetch/XMLHttpRequest, block requests not in allowlist
    - Main-thread blocking detection (>5s → auto-deactivate)
    - Deny-by-default permissions for new plugins
    - Resource cleanup on deactivation (DOM elements, timers, event listeners, WebSockets)
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7_



- [x] 9. Plugin Loader und Lifecycle Management
  - [x] 9.1 Implement PluginLoader (bundle evaluation, lifecycle)
    - Create `frontend/src/plugins/compat/plugin-loader.ts` implementing IPluginLoader
    - Load plugin bundles as ES modules, instantiate exported Plugin class
    - Handle missing/invalid exports, syntax errors, runtime exceptions
    - Async loading after First Contentful Paint (max 50ms FCP delay)
    - Lifecycle: activate (onload with 10s timeout), deactivate (onunload + full cleanup)
    - Startup: load all active plugins in registration order
    - Exception handling: mark as error, log, continue with remaining plugins
    - Full resource cleanup on deactivation regardless of onunload exceptions
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_



- [x] 10. Plugin Registry (Frontend State)
  - [x] 10.1 Implement PluginRegistry for frontend state management
    - Create `frontend/src/plugins/compat/plugin-registry.ts` implementing IPluginRegistry
    - Manage plugin list, status, permissions, compatibility level
    - Persist activation status via backend API
    - _Requirements: 3.5, 8.7_



- [x] 11. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Settings Manager (Plugin-Einstellungen)
  - [x] 12.1 Implement SettingsManager (loadData/saveData)
    - Create `frontend/src/plugins/compat/settings-manager.ts`
    - Implement loadData(): load from backend, return null on error or first call
    - Implement saveData(): validate JSON-serializable, enforce 1 MB limit, persist to backend
    - Isolate settings per plugin-ID and vault-ID
    - Handle circular references, network errors gracefully
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7_



- [x] 13. Command Registry und Command Palette
  - [x] 13.1 Implement CommandRegistry
    - Create `frontend/src/plugins/compat/command-registry.ts` implementing ICommandRegistry
    - addCommand with namespaced ID (<pluginId>:<commandId>)
    - removeCommand, removeAllForPlugin, searchCommands (case-insensitive substring, max 50 results)
    - executeCommand with exception handling
    - Hotkey registration with conflict detection
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.6, 12.7, 12.8_

  - [x] 13.2 Implement Command Palette UI component
    - Create `frontend/src/components/CommandPalette.tsx`
    - Modal overlay triggered by Ctrl+P (Windows/Linux) / Cmd+P (macOS)
    - Search input with case-insensitive filtering, max 50 results
    - Execute selected command, close palette, handle callback exceptions
    - _Requirements: 12.2, 12.3, 12.5, 12.7_



- [x] 14. CSS Injection
  - [x] 14.1 Implement CSS Injector with scoped styles
    - Create `frontend/src/plugins/compat/css-injector.ts`
    - Inject <style> element with data-plugin-id attribute on activation
    - Remove <style> element on deactivation
    - Scope all CSS selectors with [data-plugin-id="<pluginId>"] prefix
    - Reject styles.css >512 KB, warn on invalid CSS
    - _Requirements: 15.1, 15.2, 15.3, 15.4, 15.5_



- [x] 15. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 16. Compatibility Analyzer
  - [x] 16.1 Implement CompatibilityAnalyzer (static analysis)
    - Create `frontend/src/plugins/compat/compatibility-analyzer.ts` implementing ICompatibilityAnalyzer
    - Pattern-match Obsidian API accesses in bundle source (this.app.vault.*, this.app.workspace.*, etc.)
    - Classify each detected call as supported/partial/unsupported
    - Calculate compatibility level (full/partial/unsupported/unknown)
    - Handle analysis failures gracefully (obfuscated code → unknown)
    - Complete analysis within 10 seconds
    - _Requirements: 16.1, 16.2, 16.3, 16.4_



- [x] 17. Backend Plugin Store
  - [x] 17.1 Implement PluginStore (filesystem persistence)
    - Create `backend/src/plugin/plugin-store.ts` implementing IPluginStore
    - Save/load plugin files (manifest, bundle, styles) under `data/plugins/<vaultId>/<pluginId>/`
    - Save/load plugin settings (data.json, max 1 MB)
    - Save/load plugin registry (_registry.json with status, permissions, compatibility)
    - List plugins for a vault, delete plugin, delete all for vault
    - Atomic writes (temp → rename), file size validation (max 5 MB per file)
    - _Requirements: 14.1, 14.2, 14.3, 14.5, 14.6, 14.7, 14.8_

  - [x] 17.2 Create backend error classes and validation schemas
    - Create `backend/src/plugin/errors.ts` with PluginNotFoundError, PluginFileTooLargeError, PluginSettingsTooLargeError
    - Create `backend/src/plugin/validation.ts` with Zod schemas for upload validation
    - Create `backend/src/plugin/index.ts` barrel export
    - _Requirements: 14.8, 11.6_



- [x] 18. Backend Plugin API Routes
  - [x] 18.1 Implement Plugin API routes (CRUD + upload)
    - Create `backend/src/api/pluginRoutes.ts` with all plugin endpoints
    - GET /api/v1/vaults/:vaultId/plugins — List installed plugins
    - POST /api/v1/vaults/:vaultId/plugins — Upload/install plugin (ZIP, multipart/form-data)
    - GET /api/v1/vaults/:vaultId/plugins/:pluginId — Get plugin details
    - DELETE /api/v1/vaults/:vaultId/plugins/:pluginId — Uninstall plugin
    - GET /api/v1/vaults/:vaultId/plugins/:pluginId/bundle — Download bundle
    - GET /api/v1/vaults/:vaultId/plugins/:pluginId/styles — Download styles
    - GET /api/v1/vaults/:vaultId/plugins/:pluginId/settings — Load settings
    - PUT /api/v1/vaults/:vaultId/plugins/:pluginId/settings — Save settings (max 1 MB)
    - PUT /api/v1/vaults/:vaultId/plugins/registry — Save registry state
    - GET /api/v1/vaults/:vaultId/plugins/registry — Load registry state
    - Access control: same as vault files (owner + shared users)
    - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5, 14.8_

  - [x] 18.2 Implement ZIP upload processing and plugin installation logic
    - Extract ZIP (root or single subdirectory containing manifest.json + main.js)
    - Validate manifest per Requirement 1, check bundle integrity (no eval, new Function, document.write)
    - Enforce ZIP size limit (5 MB) and extracted size limit (10 MB)
    - Handle version upgrades (higher semver → update bundle/manifest, preserve data.json)
    - Reject same/lower version uploads
    - Detect plugins from .obsidian/plugins/ directory in synced vaults
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5, 11.6, 11.7_



- [x] 19. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 20. Wire Backend into Composition Root
  - [x] 20.1 Integrate PluginStore and routes into backend composition root
    - Instantiate PluginStore in `backend/src/index.ts`
    - Register pluginRoutes with auth middleware
    - Hook into vault deletion to clean up plugin data (deleteAllForVault)
    - _Requirements: 14.4, 14.5, 14.7_



- [x] 21. Frontend API Client Extension
  - [x] 21.1 Extend IApiClient with plugin endpoints
    - Add plugin methods to `frontend/src/api/index.ts`: listPlugins, uploadPlugin, getPlugin, deletePlugin, loadBundle, loadStyles, loadSettings, saveSettings, loadRegistry, saveRegistry
    - _Requirements: 14.4, 9.1, 9.2_

- [x] 22. Plugin Management UI
  - [x] 22.1 Implement Plugin Management Page
    - Create `frontend/src/components/PluginManagementPage.tsx`
    - Display list of installed plugins (name, version, author, description, status, compatibility level)
    - Activation/deactivation toggle per plugin with persistent state
    - Error state display with error message and reload option
    - Settings button for plugins with registered SettingsTab
    - Compatibility detail list (expandable, grouped by classification)
    - Empty state when no plugins installed
    - Loading indicator during plugin load
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6, 10.7, 10.8, 10.9, 16.5, 16.6_

  - [x] 22.2 Implement Plugin Upload UI
    - Add upload button/area to Plugin Management Page
    - Accept ZIP file upload, show progress, display validation errors
    - Show detected plugins from .obsidian/plugins/ directory
    - _Requirements: 11.1, 11.2, 2.6_



- [x] 23. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 24. Frontend Plugin System Integration
  - [x] 24.1 Create PluginProvider and wire plugin system into App
    - Create `frontend/src/plugins/compat/plugin-context.ts` with PluginProvider + usePluginContext hook
    - Instantiate PluginLoader, PluginRegistry, PluginSandbox, CommandRegistry, SettingsManager, CompatibilityAnalyzer
    - Load plugins after FCP, activate stored active plugins on vault open
    - Handle vault switch (unload all → reload with new context)
    - Register Command Palette keyboard shortcut (Ctrl+P / Cmd+P)
    - _Requirements: 2.5, 3.3, 3.5, 4.5, 4.6, 12.5_

  - [x] 24.2 Wire WorkspaceShim events to existing Slatebase state changes
    - Connect tab/file changes to workspace-shim events (file-open, active-leaf-change)
    - Connect file save/sync events to MetadataCache changed event
    - Emit MetadataCache resolved event after initial cache build
    - _Requirements: 6.3, 6.4, 7.5, 7.6_

  - [x] 24.3 Integrate Command Palette into App layout
    - Render CommandPalette component in App.tsx
    - Wire to CommandRegistry from PluginProvider
    - Register addCommand on PluginInstance prototype for plugin access
    - _Requirements: 6.6, 12.1, 12.5_



- [x] 25. Final Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- The implementation uses TypeScript throughout (frontend: React/Vite, backend: Hono/Node.js)
- Plugin system uses ES6 Proxy for API shimming (design decision: no Web Workers due to DOM access requirement)
- Emulated Obsidian API version: 1.4.0

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["4.1"] },
    { "id": 3, "tasks": ["5.1", "5.2"] },
    { "id": 4, "tasks": ["6.1"] },
    { "id": 5, "tasks": ["8.1"] },
    { "id": 6, "tasks": ["9.1"] },
    { "id": 7, "tasks": ["10.1"] },
    { "id": 8, "tasks": ["12.1"] },
    { "id": 9, "tasks": ["13.1"] },
    { "id": 10, "tasks": ["13.2", "14.1"] },
    { "id": 11, "tasks": ["16.1"] },
    { "id": 12, "tasks": ["17.1", "17.2"] },
    { "id": 13, "tasks": ["18.1"] },
    { "id": 14, "tasks": ["18.2"] },
    { "id": 15, "tasks": ["20.1"] },
    { "id": 16, "tasks": ["21.1"] },
    { "id": 17, "tasks": ["22.1", "22.2"] },
    { "id": 18, "tasks": ["24.1"] },
    { "id": 19, "tasks": ["24.2", "24.3"] }
  ]
}
```
