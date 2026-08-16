# Implementation Plan: Navigation & Verknüpfungs-Politur

## Overview

Verdrahtet die bestehenden No-Op-Befehle `app:go-back`, `app:go-forward` und `switcher:open` mit echtem Verhalten, hinterlegt Standard-Tastenkombinationen für den bereits funktionierenden Tab-Wechsel, macht die Backlinks-Ansicht live-aktuell über den bestehenden Realtime-Event-Bus, härtet die Wikilink-Auflösung gegen mehrdeutige Dateinamen und ergänzt Datei-Explorer-Auto-Reveal sowie eine Breadcrumb-Leiste.

## Tasks

- [x] 1. Navigationsverlauf: State Layer
  - [x] 1.1 Create navigation history reducer and types
    - Create `frontend/src/state/navigationHistoryState.ts` with `NavHistoryEntry`, `NavigationHistoryState`, `NavigationHistoryAction`
    - Implement `navigationHistoryReducer` handling `RECORD_VISIT`, `GO_BACK`, `GO_FORWARD`, `DROP_ENTRY`, `CLEAR`
    - Enforce `MAX_STACK_SIZE = 50` on `back`/`forward`
    - `RECORD_VISIT` with `origin: 'history-nav'` must not itself mutate `back`/`forward` beyond what `GO_BACK`/`GO_FORWARD` already did
    - _Requirements: 1.1, 1.2, 1.3, 1.6, 1.9_

  - [x] 1.2 Create navigation history provider and hook
    - Create `frontend/src/state/navigationHistoryContext.ts` with `NavigationHistoryProvider` and `useNavigationHistory()`
    - Implement `navigateToFile(entry, origin)`: dispatches `RECORD_VISIT`, then opens/activates the tab via existing `openTab()`/`ACTIVATE_TAB` path
    - Implement `goBack()`/`goForward()`: dispatch `GO_BACK`/`GO_FORWARD`, then call the same open/activate path with `origin: 'history-nav'`
    - Expose `canGoBack`/`canGoForward` derived from stack lengths
    - Mount `NavigationHistoryProvider` inside `TabProvider`, outside `CommandPaletteContainer`, in the provider tree (App.tsx / index)
    - Reset history (`CLEAR`) on vault switch
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.11, 1.12_

  - [x] 1.3 Handle stale/deleted history entries
    - When `goBack()`/`goForward()` targets a file no longer present in the vault tree, dispatch `DROP_ENTRY`, show an error with the file path, and continue to the next valid entry in the same direction
    - When the target file's tab was closed, re-open it via `navigateToFile()`'s existing open path rather than skipping
    - _Requirements: 1.7, 1.8_

  - [x]* 1.4 Write unit tests for navigation history reducer
    - All action types produce correct state transitions
    - `history-nav` origin does not re-record
    - Stack size clamping at 50
    - `DROP_ENTRY` removes matching entries from both stacks
    - _Requirements: 1.1, 1.6, 1.9_

  - [x]* 1.5 Write property tests for navigation history
    - **Property 1: Zurück/Vor sind inverse Operationen**
    - **Property 2: Neue Navigation verwirft den Vor-Stack**
    - **Property 3: History-Navigation schreibt sich nicht selbst fort**
    - **Property 4: Stack-Obergrenze**
    - **Validates: Requirements 1.1, 1.2, 1.3, 1.6, 1.9**

- [x] 2. Navigationsverlauf: Auslöser umstellen und UI
  - [x] 2.1 Record visits centrally instead of touching every trigger
    - Implemented as a `useEffect` in `NavigationHistoryProvider` watching `tabState.activeTabId` — records a visit whenever the active tab changes, regardless of source (link click in `TabContent.tsx`, backlink/search/tag click in `ContextPanel.tsx`, file click in `FileExplorer.tsx`, node click in `GraphView.tsx`, tab click in `TabBar.tsx`, quick switcher, tab-cycle keybinding)
    - No existing call site needed changes — they all already flow through `openTab()`/`ACTIVATE_TAB`, which is the single point the effect observes
    - _Requirements: 1.1_

  - [x] 2.2 Wire `app:go-back` / `app:go-forward` to real behavior
    - Extended `CoreAppCommandHandlers` in `core-commands-app.ts` with `onNavigateBack`, `onNavigateForward` (dropped the redundant `navHistory: {canGoBack,canGoForward}` field from the original plan — `NavigationControls` reads those directly from `useNavigationHistory()` instead)
    - Replaced the `noop` run functions for `app:go-back`/`app:go-forward` with calls to `h.onNavigateBack()`/`h.onNavigateForward()`
    - Fed from `CommandPaletteContainer`'s `coreHandlersRef` using `useNavigationHistory()`
    - _Requirements: 1.2, 1.3, 1.4, 1.5_

  - [x] 2.3 Create NavigationControls component
    - Created `frontend/src/components/NavigationControls.tsx` with back/forward icon buttons (lucide `ChevronLeft`/`ChevronRight`)
    - `disabled` bound to `!canGoBack`/`!canGoForward`, `aria-label` for both
    - Rendered next to `TabBar` in `App.tsx` inside a new `.tab-bar-row` flex wrapper
    - _Requirements: 1.4, 1.5_

  - [x] 2.4 Add back/forward keybindings
    - Added `slatebase:navigate-back` (`Alt+ArrowLeft`) and `slatebase:navigate-forward` (`Alt+ArrowRight`) to `DEFAULT_KEYBINDINGS` in `keybindingsStore.ts`, category `navigation` (arrow keys need the `Arrow`-prefixed `event.key` form, not `Left`/`Right`)
    - Wired both in `useGlobalShortcuts.ts` using the existing `matchesShortcut()` pattern, calling `goBack()`/`goForward()`
    - _Requirements: 1.10_

  - [ ]* 2.5 Write E2E tests for back/forward navigation
    - Click link → click back → lands on origin document
    - Go back, then navigate elsewhere → forward button disabled
    - _Requirements: 1.2, 1.3, 1.6_

- [x] 3. Schnellwechsler (Quick Switcher)
  - [x] 3.1 Create fuzzy match utility
    - Created `frontend/src/utils/fuzzyMatch.ts` with `fuzzyMatch(query, text): number | null` (case-insensitive subsequence match, lower score = better)
    - _Requirements: 2.2_

  - [x] 3.2 Create QuickSwitcher component
    - Created `frontend/src/components/QuickSwitcher.tsx`, structurally mirroring `CommandPalette.tsx` (overlay, `useFocusTrap`, Arrow/Enter/Escape handling, `role="dialog"`/`role="listbox"`), reusing its `.command-palette-*` CSS classes
    - Sources candidates via `collectFilesSorted(directoryTree)` from `link-resolver.ts`, filters/ranks via `fuzzyMatch()` against the full path, capped at 50 results
    - When query is empty, shows recent files from `recentFilesStore.getRecent()` filtered to the current vault (newest first, max 20) instead of the originally planned nav-history back stack — it's already exactly this data (persisted, cross-device) and every `openTab()` call already feeds it, so no new plumbing was needed
    - Appends a "Neue Datei „<query>.md" erstellen" entry when no exact-path file matches
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.9_

  - [x] 3.3 Wire file selection and creation
    - On select: calls `openTab()` directly and closes the switcher — the centralized `NavigationHistoryProvider` effect (see 2.1) records the visit automatically since it's just another `activeTabId` change
    - On "create new": calls `apiClient.saveFile()` + refreshes the vault tree, then opens the new file; on failure shows the error inline and keeps the switcher open
    - _Requirements: 2.5, 2.6, 2.7, 2.8_

  - [x] 3.4 Wire `switcher:open` and keybinding
    - Extended `CoreAppCommandHandlers` with `onOpenQuickSwitcher: () => void`; replaced `switcher:open`'s `noop` run function
    - No-op when no vault is selected (Requirement 2.10)
    - Added `slatebase:open-quick-switcher` (`Mod+O`) to `DEFAULT_KEYBINDINGS`, category `navigation`; wired directly in `CommandPaletteContainer.tsx` (same dual keydown-listener + custom-event pattern already used for `slatebase:open-command-palette`, since that's where the switcher's open/close state lives) rather than in `useGlobalShortcuts.ts`
    - _Requirements: 2.1, 2.10_

  - [ ]* 3.5 Write tests for QuickSwitcher
    - Unit: `fuzzyMatch()` scoring/ordering, no-match → `null`
    - Component: filtering, keyboard nav, create-new fallback, empty-query recent list
    - E2E: `Mod+O` → type → Enter opens file; nonexistent name → create → file exists in explorer
    - _Requirements: 2.1–2.9_

- [x] 4. Tab-Navigation per Tastatur
  - [x] 4.1 Add tab-cycle keybindings
    - Added `slatebase:next-tab` (`Ctrl+Tab`) and `slatebase:previous-tab` (`Ctrl+Shift+Tab`) to `DEFAULT_KEYBINDINGS`, category `navigation`
    - Wired in `CommandPaletteContainer.tsx` (not `useGlobalShortcuts.ts` as originally planned — see note below), calling `commandRegistry.executeCommand('workspace:next-tab' | 'workspace:previous-tab')` on match (reuses existing `activateTabByOffset()` wrap-around logic — no duplication)
    - **Bug caught by the test suite and fixed**: originally wired via `usePluginContext()` called directly at the top of `AppContent` (App.tsx) and threaded into `useGlobalShortcuts.ts` — this crashed on mount (`usePluginContext must be used within a PluginProvider`) because `<PluginProvider>` is mounted *inside* `AppContent`'s own JSX output (around line 722), not as an ancestor of `AppContent` in the tree, so a hook call at the top of the component can't reach it. `App.test.tsx`'s existing tests caught this immediately. Fixed by moving the shortcut registration into `CommandPaletteContainer.tsx`, which already sits inside `<PluginProvider>` and already calls `usePluginContext()` for its own command-palette needs — same reasoning as why the Quick Switcher's shortcut (3.4) lives there too
    - No-op when fewer than 2 tabs are open (existing `activateTabByOffset` already guards this)
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x] 4.2 Record history on keyboard tab-cycle
    - No separate wiring needed: `workspace:next-tab`/`previous-tab` dispatch `ACTIVATE_TAB`, which the centralized `NavigationHistoryProvider` effect (2.1) already observes and records like any other tab activation
    - _Requirements: 3.5_

  - [ ]* 4.3 Write tests for tab keyboard cycling
    - Unit/integration: keydown triggers correct command execution
    - **Property 10: Tab-Zyklus wickelt korrekt um** (property test)
    - E2E: `Ctrl+Tab` cycles and wraps at the end
    - _Requirements: 3.2, 3.3_

- [x] 5. Live-Aktualisierung der Backlinks
  - [x] 5.1 Subscribe ContextPanel to vault change events
    - Added a new `useEffect` in `ContextPanel.tsx` (alongside the existing document-switch and content-debounce effects) that calls `onRealtimeVaultChange()` from `realtimeVaultBridge.ts`
    - Filters to events matching the current `vaultId`; on `action` of `saved`/`renamed`/`deleted`, schedules a debounced (`BACKLINKS_REFRESH_DEBOUNCE_MS` = 1000ms) `loadBacklinks()` re-fetch
    - Clears the pending debounce timer on `documentPath`/`vaultId` change or unmount via the effect's cleanup function (same guard pattern as the existing content-debounce effect) — satisfies Requirement 5.5 for free since the effect re-runs (and its cleanup fires) whenever `documentPath` changes
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6_

  - [x] 5.2 Preserve existing backlinks on refresh failure
    - No change needed: the debounced refresh calls the existing `loadBacklinks()`, which already sets `backlinksError` without clearing `state.links.backlinks` on failure
    - _Requirements: 5.7_

  - [ ]* 5.3 Write tests for live backlinks refresh
    - Unit: debounce coalesces multiple events into one call within the window
    - Unit: document switch cancels pending refresh for the old path
    - **Property 8: Backlinks-Debounce sendet höchstens eine Anfrage pro Fenster**
    - **Property 9: Dokumentwechsel verwirft ausstehende Backlink-Refreshs**
    - E2E: two sessions — session B saves a file linking to session A's open document → backlink appears in A without manual refresh
    - _Requirements: 5.2, 5.3, 5.5_

- [x] 6. Deterministische Auflösung mehrdeutiger Wikilinks
  - [x] 6.1 Add sourcePath-aware resolution to link-resolver
    - Added optional `sourcePath` parameter to `resolveWikilinkTarget()` in `frontend/src/plugins/link-resolver.ts`, plus a new `resolveWikilinkTargetWithAlternatives()` that also reports `alternativeCount` (for 6.3) and an exported `resolveAmbiguousMatch(candidates, sourcePath?)`: prefers same-folder-as-source, then shortest path, then alphabetical (existing tie-break)
    - Name-match logic now collects **all** matches within each priority tier (bare-name first, `.md`-suffixed fallback second — preserving the original two-pass priority so a coexisting `Note` and `Note.md` are never treated as ambiguous with each other) before applying `resolveAmbiguousMatch()`
    - Single-match behavior is byte-for-byte unchanged (verified by the existing regression suite)
    - Also found and removed a second, independent duplicate implementation of `resolveWikilinkTarget` that lived locally in `ViewMode.tsx` (not importing from `link-resolver.ts` at all) — replaced with a thin wrapper around `resolveWikilinkTargetWithAlternatives`, so the reading view now shares one resolution algorithm with every other call site instead of silently not benefiting from this fix
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.7_

  - [x] 6.2 Pass sourcePath from rendering call sites (partial — see note)
    - `context-panel/ContextPanel.tsx`'s two `loadForwardLinks()` calls now pass `documentPath` as `sourcePath` (threaded through a new parameter on `loadForwardLinks()` in `contextPanelActions.ts`) — the forward-links list now gets full same-folder disambiguation
    - `ViewMode.tsx`'s two wikilink-anchor render sites use `resolveWikilinkTargetWithAlternatives()` without a `sourcePath` (see below) — they still get the improved deterministic shortest-path/alphabetical fallback, just not the same-folder preference specifically
    - **Scope deviation from the design doc**: did not thread `sourcePath` through `ViewMode.tsx`'s full internal render tree (16 functions take `directoryTree` as a parameter; mechanically adding a parallel `sourcePath` parameter to all of them, plus `frontend/src/editor/live-preview/live-preview-extension.ts`'s click-navigation, was judged too large and too risky to do safely in this pass — `ViewModeProps` doesn't currently carry the file's own path at all). Documented here rather than silently skipped; a reasonable follow-up if same-folder preference in the reading view/live-preview-editor turns out to matter in practice
    - _Requirements: 6.5 (partially — forward-links list only)_

  - [x] 6.3 Surface ambiguity in link tooltips
    - When `resolveWikilinkTargetWithAlternatives()` returns `alternativeCount > 0`, `ViewMode.tsx`'s `ambiguityTitle()` helper sets "Löst auf zu: <path> (+N weitere gleichnamige Dateien)" as the resolved link's `title` attribute, at both wikilink-anchor render sites
    - _Requirements: 6.6_

  - [x]* 6.4 Write tests for ambiguous link resolution
    - Unit: same-folder preference, shortest-path fallback, alphabetical tie-break, single-match passthrough, determinism/repeatability (`link-resolver.test.ts`: new `resolveAmbiguousMatch` and `resolveWikilinkTargetWithAlternatives` describe blocks)
    - Regression: full existing `link-resolver.test.ts` suite updated and passing (one test's assertion legitimately changed — it asserted the old "first hit in a depth-first tree walk" artifact as correct behavior, which is exactly what this requirement replaces; the new deterministic shortest-path result is asserted instead, plus a new sourcePath same-folder-preference test)
    - Not done: dedicated property-based tests (Properties 5/7) and E2E — the unit tests above already exercise the same scenarios; skipped formal PBT harness for this given time constraints
    - _Requirements: 6.1, 6.2, 6.3, 6.7_

- [x] 7. Aktive Datei im Datei-Explorer verfolgen
  - [x] 7.1 Add the auto-reveal setting
    - Added `explorerFollowActiveFile: boolean` (default `false`) to `WorkspaceState` in `frontend/src/state/workspaceStore.ts` instead of the originally planned `settingsState.ts`/`settingsPersistence.ts` path — this is a personal, instant-apply, client-only display preference (same category as existing `sidebarVisible`/`rightPanelVisible`), not a server-persisted per-vault config value, so it belongs with the former, not the backend-synced `VaultConfig`. Validation is lenient (defaults to `false` for pre-existing persisted blobs) so this doesn't invalidate already-saved workspace state for existing users
    - Added the toggle to the Settings UI's Vault-category "Vault-Konfiguration" section (`VaultConfigSection.tsx`), applying instantly via `workspaceStore.update()` — no save button, unlike the server-persisted fields below it in the same section
    - _Requirements: 4.1, 4.5_

  - [x] 7.2 Trigger auto-reveal on active tab change
    - Added a `useEffect` in `AppContent` (App.tsx) reading `explorerFollowActiveFile` reactively via `useSyncExternalStore` (so it updates live when toggled from the Settings panel, a different component subtree) and depending on `tabState.activeTabId`; dispatches the existing `slatebase:reveal-file` custom event (same mechanism as `file-explorer:reveal-active-file`)
    - No-op when the active tab is not a file tab (`__graph__`, `__view::*` plugin views) or when the setting is disabled
    - _Requirements: 4.2, 4.3, 4.4_

  - [ ]* 7.3 Write tests for auto-reveal
    - Unit: setting toggle gates the reveal dispatch
    - Unit: non-file active tabs do not trigger reveal
    - E2E: enable setting, switch tabs, explorer scrolls to and highlights the file
    - _Requirements: 4.1–4.4_

- [x] 8. Breadcrumb-Pfad für die aktive Datei
  - [x] 8.1 Generalize the reveal-file event for folders
    - Extended `slatebase:reveal-file`'s event detail with optional `kind: 'file' | 'folder'` (default `'file'`) in `FileExplorer.tsx`'s listener
    - When `kind === 'folder'`, expands ancestors (and the folder itself) and scrolls to the `[data-path].tree-node--directory` element instead of a file leaf — corrected from the design doc's assumed `tree-node--folder` class name to the actual one used in `file-explorer/TreeNode.tsx` (`tree-node--directory`), caught by checking the real markup instead of guessing
    - Root (`path === ''`, the vault-name segment) is handled as a special case: no tree node to find, just scrolls the `.file-explorer-tree`/`.file-explorer` container to top (Requirement 7.4)
    - _Requirements: 7.3, 7.4_

  - [x] 8.2 Create Breadcrumb component
    - Created `frontend/src/components/Breadcrumb.tsx` rendering vault name + folder segments + filename, driven purely by props (no context dependency)
    - Root-level files show only vault name + filename (Requirement 7.2)
    - Collapses middle segments behind a "…" dropdown (click-to-open, closes on outside click) when there are more than 2 folder segments, keeping vault + last two segments visible (simplified from the design's originally-planned width-based collapse to a segment-count threshold — width measurement would need a `ResizeObserver` for comparatively little UX difference)
    - Hidden (`filePath === null`) when the active tab is not a file tab
    - Rendered in `App.tsx` between the tab-bar row and `<TabContent />`, derived from `activeTab.filePath` (excluding `__graph__` and `__view::*`) and `selectedVault.name`
    - _Requirements: 7.1, 7.2, 7.5, 7.6_

  - [x] 8.3 Wire segment clicks
    - Clicking a folder segment dispatches `slatebase:reveal-file` with `kind: 'folder'` for that folder path, and shows the sidebar if it was collapsed
    - Clicking the vault-name segment dispatches the same event with `path: ''`, which `FileExplorer.tsx` special-cases to scroll to the top of the tree (Requirement 7.4)
    - _Requirements: 7.3, 7.4_

  - [x] 8.4 Keep breadcrumb in sync with rename/move
    - No extra plumbing needed: `breadcrumbFilePath` is derived fresh from `activeTab.filePath` on every render, and `activeTab.filePath` is already updated by `UPDATE_TAB_PATHS` in `tabState.ts` on rename/move
    - _Requirements: 7.7_

  - [x]* 8.5 Write tests for Breadcrumb
    - Unit/component (`Breadcrumb.test.tsx`): null-filePath hides the component, root-level file shows vault+filename only, nested path renders one segment per folder, segment click reports the correct folder path, vault-name segment reports `''`, deep nesting collapses into a dropdown with the hidden folders reachable as menu items
    - Not done: E2E (click a breadcrumb segment → explorer opens and highlights the folder) — skipped given time constraints, no Playwright harness set up for this pass
    - _Requirements: 7.1–7.7_
