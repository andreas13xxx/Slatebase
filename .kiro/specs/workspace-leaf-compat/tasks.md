# Implementation Plan: Workspace Leaf API-Kompatibilität

## Overview

Vollständige Emulation der Obsidian Workspace Leaf API in Slatebase. Plugin-Views (Calendar, Kanban, Excalidraw, etc.) werden nahtlos in das bestehende Tab-System und Context Panel integriert. Die Implementierung erfolgt Bottom-Up: Core-Klassen (ItemView, WorkspaceLeaf, ViewRegistry) → Bridge-Layer (TabViewBridge) → WorkspaceShim-Erweiterung → UI-Integration (TabContent, ContextPanel) → Event-Bridge-Erweiterung → Compatibility-Analyzer-Update.

## Tasks

- [x] 1. Core-Klassen: ItemView und WorkspaceLeaf refactoring
  - [x] 1.1 Refactor `ItemView` in `view-registry.ts`
    - Rename CSS class on `containerEl` from `'plugin-view-container'` to `'view-content'`
    - Add `addAction(icon: string, title: string, callback: () => void): HTMLElement` method that creates a button element in the containerEl header area
    - Ensure `contentEl` retains CSS class `'plugin-view-content'`
    - Add `onload()` and `onunload()` no-op lifecycle methods (already exist, verify signatures)
    - Ensure constructor sets `this.app = leaf.app` and `this.leaf = leaf`
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [x] 1.2 Refactor `WorkspaceLeaf` to support location tracking
    - Add `LeafLocation` type export: `'main' | 'right-sidebar'`
    - Add `readonly location: LeafLocation` property to WorkspaceLeaf
    - Update constructor signature: `constructor(app: unknown, registry: ViewRegistry, location: LeafLocation)`
    - Update `setViewState` to call `onClose()` on existing view AND remove `containerEl` from DOM before creating new view (Req 2.6 ordering guarantee)
    - Log `console.error` if `onOpen()` throws but keep view in leaf (Req 13.3)
    - Log `console.error` if `onClose()` throws but proceed with leaf removal (Req 13.4)
    - Emit warning via `console.warn` if viewType not registered (Req 2.4)
    - _Requirements: 2.3, 2.4, 2.5, 2.6, 13.3, 13.4_

  - [ ]* 1.3 Write unit tests for ItemView and WorkspaceLeaf
    - Test containerEl/contentEl DOM structure and CSS classes
    - Test `setViewState` lifecycle ordering (onClose before new view)
    - Test error resilience (onOpen throws, onClose throws)
    - Test unregistered viewType produces warning and no view change
    - _Requirements: 9.1, 2.3, 2.4, 2.5, 2.6, 13.3, 13.4_

  - [ ]* 1.4 Write property test for view activation lifecycle (Property 4)
    - **Property 4: View activation lifecycle**
    - **Validates: Requirements 2.3, 2.5**
    - For any registered viewType, `setViewState` results in `leaf.view` non-null with correct type and `onOpen()` called

  - [ ]* 1.5 Write property test for view replacement lifecycle ordering (Property 5)
    - **Property 5: View replacement lifecycle ordering**
    - **Validates: Requirements 2.6**
    - For any leaf with existing view A, calling `setViewState({ type: B })` calls `onClose()` on A before creating B

  - [ ]* 1.6 Write property test for unregistered viewType no-op (Property 6)
    - **Property 6: Unregistered viewType no-op**
    - **Validates: Requirements 2.4**
    - For any viewType not in registry, `setViewState` resolves without creating a view

- [x] 2. ViewRegistry refactoring with plugin ownership and location support
  - [x] 2.1 Refactor `ViewRegistry` for plugin ownership tracking
    - Add `pluginId` parameter to `registerView(viewType, creator, pluginId)`
    - Store `ViewRegistration` objects: `{ viewType, creator, pluginId }`
    - Add input validation: ignore empty/whitespace viewType, non-callable creator, viewType > 128 chars (log `console.warn`)
    - Add `unregisterView(viewType)` method
    - Add `unregisterAllForPlugin(pluginId)` method to remove all registrations for a plugin
    - Update `hasViewType()` to work with new storage
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [x] 2.2 Add location-aware leaf creation and sidebar callbacks
    - Update `createLeaf(app, location, pluginId?)` to accept `LeafLocation` parameter
    - Track leaves with location: `Map<WorkspaceLeaf, { location, pluginId, viewType }>`
    - Add `getAllLeaves()`, `getMainLeaves()`, `getSidebarLeaves()` query methods
    - Add `getLeafByViewType(viewType)` for deduplication checks
    - Add `setOnSidebarViewActivated(callback)` and `setOnSidebarViewDeactivated(callback)`
    - Update `notifyViewActivated` to differentiate main vs sidebar notifications
    - _Requirements: 3.6, 4.1, 5.6, 5.7_

  - [x] 2.3 Add plugin cleanup and vault-switch support
    - Add `detachAllForPlugin(pluginId)` — detach all leaves for a plugin, call `onClose()` on each, continue on error (Req 13.1)
    - Update `detachLeavesOfType` to handle both main and sidebar leaves
    - Update `clear()` to close all views with per-leaf error isolation
    - Ensure `onClose()` exceptions are logged but don't block cleanup
    - _Requirements: 13.1, 13.2, 6.3, 6.4_

  - [ ]* 2.4 Write unit tests for ViewRegistry
    - Test registration with valid inputs, overwrite, plugin ownership
    - Test invalid input rejection (empty string, non-callable, >128 chars)
    - Test `unregisterAllForPlugin` removes correct entries
    - Test `detachAllForPlugin` calls `onClose()` and continues on error
    - Test location-aware leaf creation and query methods
    - _Requirements: 1.1–1.5, 13.1_

  - [ ]* 2.5 Write property test for registration persistence and ownership (Property 1)
    - **Property 1: Registration persistence and ownership**
    - **Validates: Requirements 1.1, 1.4**
    - For any valid viewType (1–128 chars), after `registerView`, `hasViewType` returns true

  - [ ]* 2.6 Write property test for invalid registration rejection (Property 2)
    - **Property 2: Invalid registration rejection**
    - **Validates: Requirements 1.5**
    - For any empty/whitespace viewType or non-callable creator, registry remains unchanged

  - [ ]* 2.7 Write property test for plugin deactivation cleanup (Property 3)
    - **Property 3: Plugin deactivation cleanup**
    - **Validates: Requirements 1.3**
    - For any plugin with N registrations, `unregisterAllForPlugin` removes all N

- [x] 3. Checkpoint - Core classes complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. TabViewBridge module-level bridge
  - [x] 4.1 Create `tab-view-bridge.ts` in `frontend/src/plugins/compat/`
    - Implement module-level bridge following `realtimeVaultBridge` pattern
    - Export `onOpenPluginViewTab(fn)` / `offOpenPluginViewTab(fn)` — called when plugin view should open as tab
    - Export `onClosePluginViewTab(fn)` / `offClosePluginViewTab(fn)` — called when plugin view tab should close
    - Export `onActivatePluginViewTab(fn)` / `offActivatePluginViewTab(fn)` — called when existing plugin view tab should activate
    - Export `dispatchOpenPluginViewTab(vaultId, viewType, displayText, icon)` — dispatched by ViewRegistry
    - Export `dispatchClosePluginViewTab(vaultId, viewType)` — dispatched by ViewRegistry
    - Export `dispatchActivatePluginViewTab(vaultId, viewType)` — dispatched for tab deduplication
    - Use `Set<Callback>` pattern for subscriber management
    - _Requirements: 3.1, 3.5, 3.6_

  - [ ]* 4.2 Write unit tests for TabViewBridge
    - Test registration/deregistration of callbacks
    - Test dispatch triggers all registered callbacks
    - Test dispatch with no subscribers is a no-op
    - _Requirements: 3.1_

- [x] 5. WorkspaceShim extension with full Leaf API
  - [x] 5.1 Extend `WorkspaceShim` with leaf management methods
    - Refactor `getLeaf(newLeaf?)`: if `newLeaf === true` always create new leaf with location `'main'`; if `false`/undefined, return existing leaf with null view or create new
    - Refactor `getRightLeaf()`: create leaf with location `'right-sidebar'`
    - Refactor `getLeftLeaf()`: create leaf with location `'right-sidebar'` (Slatebase maps both to right)
    - Add `getActiveLeaf()`: return leaf of currently active tab (via tracking) or null
    - Add `setActiveLeaf(leaf)`: activate tab for leaf, warn if leaf unknown
    - Add `getUnpinnedLeaf()`: create new leaf (no pinning concept)
    - Add `createLeafBySplit(leaf)`: create new leaf, log `console.info` about no split support
    - Add `splitActiveLeaf()`: create new leaf, log `console.info` about no split support
    - Wire `registerView` to pass `pluginId` from PluginContext
    - _Requirements: 2.1, 2.2, 4.1, 4.2, 5.4, 5.5, 6.5, 6.6, 6.7, 7.1, 7.2, 7.3, 7.4_

  - [x] 5.2 Add iteration and query methods to WorkspaceShim
    - Add `getLeavesOfType(viewType)`: delegates to ViewRegistry
    - Add `getActiveViewOfType(ViewClass)`: instanceof check on active leaf's view
    - Add `iterateAllLeaves(callback)`: iterate all leaves (main + sidebar), catch exceptions per leaf
    - Add `iterateRootLeaves(callback)`: iterate only main leaves, catch exceptions per leaf
    - Add `detachLeavesOfType(viewType)`: close all leaves of type, emit `layout-change`
    - Add `revealLeaf(leaf)`: activate tab for main leaf, activate section for sidebar leaf
    - _Requirements: 5.1, 5.2, 5.3, 5.6, 5.7, 5.8, 6.1, 6.2, 6.3, 6.4_

  - [x] 5.3 Add `openLinkText` to WorkspaceShim
    - Implement `openLinkText(linkText, sourcePath): Promise<void>`
    - No-op for empty linkText (Req 8.4)
    - Use existing `resolveWikilinkTarget` from `link-resolver.ts` for path resolution
    - If resolved, dispatch tab open via TabViewBridge or direct OPEN_TAB
    - If not resolved, `console.warn` and no action (Req 8.3)
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [x] 5.4 Update WorkspaceShim proxy `emulatedProperties` set
    - Add all new methods to the `emulatedProperties` set so they don't trigger no-op warnings
    - Methods to add: `getActiveLeaf`, `setActiveLeaf`, `getUnpinnedLeaf`, `createLeafBySplit`, `splitActiveLeaf`, `getActiveViewOfType`, `iterateAllLeaves`, `iterateRootLeaves`, `openLinkText`
    - _Requirements: 12.3_

  - [ ]* 5.5 Write unit tests for WorkspaceShim leaf management
    - Test `getLeaf(true)` creates new leaf, `getLeaf(false)` reuses empty
    - Test `getRightLeaf`/`getLeftLeaf` both create sidebar leaves
    - Test `getActiveLeaf`/`setActiveLeaf` round-trip
    - Test `createLeafBySplit`/`splitActiveLeaf` return new leaves with console.info
    - Test iteration methods (all vs root), exception isolation
    - Test `openLinkText` resolution and edge cases
    - _Requirements: 2.1, 2.2, 5.1–5.8, 6.1–6.7, 7.1–7.4, 8.1–8.4_

  - [ ]* 5.6 Write property test for getLeavesOfType correctness (Property 9)
    - **Property 9: getLeavesOfType correctness**
    - **Validates: Requirements 5.1, 5.2**
    - For any set of active leaves, `getLeavesOfType(X)` returns exactly those with matching viewType

  - [ ]* 5.7 Write property test for iterate correctness (Property 10)
    - **Property 10: iterateAllLeaves visits all, iterateRootLeaves visits main only**
    - **Validates: Requirements 5.6, 5.7**
    - For mixed-location leaves, verify correct iteration scope

  - [ ]* 5.8 Write property test for exception isolation in iteration (Property 11)
    - **Property 11: Exception isolation in iteration**
    - **Validates: Requirements 5.8**
    - For callbacks that throw on some leaves, all remaining leaves still visited

  - [ ]* 5.9 Write property test for detachLeavesOfType (Property 12)
    - **Property 12: detachLeavesOfType removes all and calls onClose**
    - **Validates: Requirements 6.3, 6.4**
    - For N leaves of type X, after detach, `getLeavesOfType(X)` returns empty array

- [x] 6. Checkpoint - Compat layer complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. UI Integration: TabContent plugin view rendering
  - [x] 7.1 Update `TabContent.tsx` for plugin view tabs
    - Add branch after `__graph__` check: if `activeTab.filePath.startsWith('__view::')`, render plugin view container
    - Extract `viewType` from filePath (`filePath.slice('__view::'.length)`)
    - Get `containerEl` from `activeViews` map (via `usePluginContext()`)
    - Render a container div with ref callback that appends `containerEl` via DOM (imperative mount)
    - Use CSS class `tab-content tab-content--plugin-view`
    - _Requirements: 3.4_

  - [x] 7.2 Wire TabViewBridge to TabProvider
    - In appropriate component (TabProvider or PluginProvider), subscribe to `onOpenPluginViewTab`
    - On dispatch: call `tabDispatch({ type: 'OPEN_TAB', payload: { vaultId, filePath: '__view::' + viewType, fileName: displayText } })`
    - Handle `onClosePluginViewTab` → dispatch `CLOSE_TAB`
    - Handle `onActivatePluginViewTab` → dispatch `ACTIVATE_TAB`
    - Handle deduplication: check if tab with same virtual path exists before opening
    - Cleanup: unsubscribe on unmount
    - _Requirements: 3.1, 3.2, 3.5, 3.6_

  - [ ]* 7.3 Write unit tests for TabContent plugin view branch
    - Test plugin view tab renders container with mounted containerEl
    - Test non-plugin tabs still render correctly (no regression)
    - _Requirements: 3.4_

  - [ ]* 7.4 Write property test for tab deduplication (Property 7)
    - **Property 7: Tab deduplication for plugin views**
    - **Validates: Requirements 3.6**
    - For a viewType with existing tab, re-open activates existing tab (tab count unchanged)

- [x] 8. UI Integration: Context Panel sidebar views
  - [x] 8.1 Extend `PluginContext` with sidebar view state
    - Add `sidebarViews: Map<string, SidebarViewInfo>` to `PluginContextValue`
    - Define `SidebarViewInfo`: `{ viewType, displayText, icon, containerEl, leaf }`
    - Wire `ViewRegistry.setOnSidebarViewActivated` to update `sidebarViews` state
    - Wire `ViewRegistry.setOnSidebarViewDeactivated` to remove from `sidebarViews` state
    - _Requirements: 4.1, 4.3, 4.4_

  - [x] 8.2 Update Context Panel to render plugin sidebar sections
    - In `ContextPanel.tsx`, consume `sidebarViews` from `usePluginContext()`
    - Render additional tab entries for each sidebar view (using `displayText` as label, `icon` as icon)
    - Mount `containerEl` via ref callback (imperative DOM append) when section is active
    - Handle close: call `detachLeavesOfType` or leaf.detach when section is removed
    - _Requirements: 4.3, 4.4, 4.5_

  - [ ]* 8.3 Write unit tests for sidebar view integration
    - Test sidebar view appears as additional section/tab in Context Panel
    - Test closing sidebar view calls onClose and removes section
    - _Requirements: 4.3, 4.4, 4.5_

- [x] 9. PluginEventBridge extension for leaf events
  - [x] 9.1 Extend `usePluginEventBridge` for plugin-view-tab awareness
    - Detect `__view::` prefix on active tab → emit `active-leaf-change` with the WorkspaceLeaf (not TFile)
    - When plugin-view-tab is active, ensure `getActiveFile()` returns null (Req 3.7)
    - Emit `layout-change` when plugin view tab opens or closes
    - Emit `active-leaf-change` with null when no tab is active
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 3.7, 12.4_

  - [ ]* 9.2 Write unit tests for extended event bridge
    - Test file-tab → plugin-tab switch emits correct events
    - Test plugin-tab active → `getActiveFile()` returns null
    - Test layout-change emitted on plugin view open/close
    - _Requirements: 11.1–11.4, 3.7_

  - [ ]* 9.3 Write property test for active-leaf-change consistency (Property 15)
    - **Property 15: active-leaf-change consistency**
    - **Validates: Requirements 11.1, 11.4**
    - For any tab activation, workspace emits `active-leaf-change` with correct WorkspaceLeaf or null

  - [ ]* 9.4 Write property test for getActiveFile returns null on plugin tabs (Property 8)
    - **Property 8: Plugin view tab getActiveFile returns null**
    - **Validates: Requirements 3.7, 12.4**
    - For any active tab matching `__view::*`, `getActiveFile()` returns null

- [x] 10. Checkpoint - UI integration complete
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Compatibility Analyzer update
  - [x] 11.1 Move leaf methods from UNSUPPORTED_METHODS to SUPPORTED_METHODS
    - Remove all 15 workspace leaf methods from `UNSUPPORTED_METHODS` set
    - Add all 15 workspace leaf methods to `SUPPORTED_METHODS` set
    - Methods: `workspace.getLeaf`, `workspace.getLeavesOfType`, `workspace.getActiveViewOfType`, `workspace.revealLeaf`, `workspace.detachLeavesOfType`, `workspace.getActiveLeaf`, `workspace.setActiveLeaf`, `workspace.createLeafBySplit`, `workspace.getRightLeaf`, `workspace.getLeftLeaf`, `workspace.splitActiveLeaf`, `workspace.openLinkText`, `workspace.getUnpinnedLeaf`, `workspace.iterateAllLeaves`, `workspace.iterateRootLeaves`
    - _Requirements: 10.1, 10.2, 10.3_

  - [ ]* 11.2 Write unit tests for analyzer update
    - Test that moved methods are classified as `'supported'`
    - Test that a plugin using only leaf methods + existing supported methods gets `level: 'full'`
    - Test that UNSUPPORTED_METHODS no longer contains these methods
    - _Requirements: 10.1, 10.2, 10.3_

  - [ ]* 11.3 Write property test for set disjointness (Property 13)
    - **Property 13: Compatibility analyzer set disjointness**
    - **Validates: Requirements 10.1, 10.3**
    - No method string appears in both SUPPORTED_METHODS and UNSUPPORTED_METHODS

- [x] 12. PluginContext wiring and backward compatibility
  - [x] 12.1 Update `plugin-context.ts` to wire new ViewRegistry and WorkspaceShim features
    - Pass `pluginId` through `registerView` calls
    - Wire `detachAllForPlugin(pluginId)` on plugin deactivation
    - Ensure `sidebarViews` state updates are connected
    - Wire TabViewBridge subscriptions in PluginProvider or via a dedicated hook
    - Ensure vault-switch clears sidebar views
    - _Requirements: 1.3, 13.1, 13.2_

  - [x] 12.2 Verify backward compatibility of existing workspace features
    - Ensure `getActiveFile()` still returns TFile for file tabs (Req 12.1)
    - Ensure `file-open` still fires for Markdown files (Req 12.2)
    - Ensure Proxy still handles non-emulated properties (Req 12.3)
    - Ensure non-Markdown file tabs return TFile but no `file-open` event (Req 12.5)
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

  - [ ]* 12.3 Write unit tests for backward compatibility
    - Test `getActiveFile()` with file tabs, binary tabs, and plugin-view tabs
    - Test `file-open` event for Markdown vs. non-Markdown
    - Test Proxy for non-emulated properties still works
    - _Requirements: 12.1–12.5_

  - [ ]* 12.4 Write property test for plugin deactivation full cleanup (Property 16)
    - **Property 16: Plugin deactivation full cleanup**
    - **Validates: Requirements 13.1**
    - For any plugin with active views, deactivation detaches all and continues on error

- [x] 13. Update types.ts with new interface members
  - [x] 13.1 Extend `IWorkspaceShim` interface in `types.ts`
    - Add all new leaf management method signatures
    - Add `openLinkText(linkText: string, sourcePath: string): Promise<void>`
    - Add iteration method signatures
    - Keep existing method signatures unchanged
    - _Requirements: 2.1, 5.1, 5.6, 6.1, 8.1_

- [x] 14. Final checkpoint - All tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- This is a frontend-only feature — no backend changes required
- The project uses vitest + fast-check for property-based tests
- Hand-written mocks (no external mocking library)
- No file extensions on frontend imports (Vite convention)
- CSS class rename `'plugin-view-container'` → `'view-content'` is a breaking change for existing plugin CSS — acceptable since plugin compat is experimental

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "13.1"] },
    { "id": 1, "tasks": ["1.3", "1.4", "1.5", "1.6", "2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "2.5", "2.6", "2.7"] },
    { "id": 3, "tasks": ["4.1", "5.1"] },
    { "id": 4, "tasks": ["4.2", "5.2", "5.3", "5.4"] },
    { "id": 5, "tasks": ["5.5", "5.6", "5.7", "5.8", "5.9"] },
    { "id": 6, "tasks": ["7.1", "7.2", "8.1"] },
    { "id": 7, "tasks": ["7.3", "7.4", "8.2", "9.1"] },
    { "id": 8, "tasks": ["8.3", "9.2", "9.3", "9.4"] },
    { "id": 9, "tasks": ["11.1", "12.1"] },
    { "id": 10, "tasks": ["11.2", "11.3", "12.2"] },
    { "id": 11, "tasks": ["12.3", "12.4"] }
  ]
}
```
