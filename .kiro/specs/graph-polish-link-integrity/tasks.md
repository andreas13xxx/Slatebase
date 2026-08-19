# Implementation Plan: Graph-Politur & Link-Integrität

## Overview

Drei unabhängige Task-Gruppen, entsprechend den drei Requirements. Keine Gruppe hängt von einer anderen ab — sie können in beliebiger Reihenfolge oder parallel umgesetzt werden. Innerhalb jeder Gruppe sind die Tasks sequenziell sinnvoll (State/Service vor UI/Wiring vor Tests).

## Tasks

- [x] 1. Lokaler Graph: Filter-Baustein und `GraphView`-Erweiterung
  - [x] 1.1 Create neighborhood filter utility
    - Create `frontend/src/components/local-graph-utils.ts` with `filterToNeighborhood(data: GraphData, centerNodeId: string, maxHops: number): GraphData`
    - BFS over an undirected adjacency map built from `data.edges` (both `Backlink`- and `Forward_Link`-direction edges count for reachability)
    - Returns only nodes within `maxHops` and edges whose both endpoints survive the filter
    - If `centerNodeId` has no entry in `data.nodes` (note with zero links), returns `{ nodes: [], edges: [] }` — the caller is responsible for synthesizing the center node (see 1.2)
    - _Requirements: 1.3, 1.4, 1.10_

  - [x] 1.2 Extend `GraphView.tsx` with `scope` prop and neighborhood rendering
    - Add optional `scope?: { centerPath: string; hops: number; onHopsChange: (hops: number) => void; onRecenter: (newCenterPath: string) => void }` to `GraphViewProps`
    - Derive `displayData` via `useMemo` from `graphData` and `scope` (falls back to unfiltered `graphData` when `scope` is absent); resolve `centerNodeId` from `scope.centerPath` against `graphData.nodes` by `path`; synthesize a center-only node when the path has no graph entry
    - Feed `displayData` (not raw `graphData`) into the existing simulation-build effect (`GraphView.tsx:163-229`)
    - Add visual highlight for the center node (CSS modifier + larger radius), reusing the existing hover-highlight styling pattern
    - Add a small toolbar (rendered only when `scope` is set): hop-count stepper (1–5, calls `scope.onHopsChange`) and a "center on active note" button (calls `scope.onRecenter`)
    - Keep the existing node-click behavior (opens file) unchanged for both scoped and unscoped rendering
    - _Requirements: 1.5, 1.6, 1.7, 1.8, 1.9_

  - [x] 1.3 Wire the `graph:open-local` command and tab routing
    - Add `'__local-graph::'+notePath` sentinel handling in `TabContent.tsx`, inserted before the existing `'__graph__'` branch (`TabContent.tsx:229`)
    - Add `onOpenLocalGraph: (filePath: string) => void` to `CoreAppCommandHandlers` (`core-commands-app.ts:71` area)
    - Implement `handleOpenLocalGraph` in `App.tsx` next to the existing `handleOpenGraph`, dispatching `OPEN_TAB` with the sentinel path and a localized tab label
    - Replace the `noop` for `graph:open-local` (`core-commands-app.ts:484`) with a handler that reads the active tab, guards against non-file tabs (any `__`-prefixed sentinel path), and calls `h.onOpenLocalGraph(activeTab.filePath)`
    - _Requirements: 1.1, 1.2_

  - [x] 1.4 Local graph live-update and hop persistence
    - Add hop count to `GraphConfig` (`graph-config.ts`) as `localGraph.hops`, persisted via the existing `loadGraphConfig`/`saveGraphConfig` localStorage mechanism
    - When `scope` is set, subscribe to `onRealtimeVaultChange` inside `GraphView.tsx` and debounced-refetch (`fetchGraph()`) on `saved`/`renamed`/`deleted` events for the current vault, mirroring `documentPanelData.ts:236-259`
    - On a `deleted` event matching `scope.centerPath`, switch to a dedicated non-retryable error state (distinct from the generic fetch-error state) showing the file path
    - _Requirements: 1.11, 1.12, 1.13_

  - [x]* 1.5 Tests for local graph
    - Unit tests for `filterToNeighborhood`: 1/2/3-hop correctness, isolated center node, cyclic graphs, center node absent from data
    - Component test: `graph:open-local` opens/reuses the correct sentinel tab; guard against non-file active tabs
    - Component test: hop-stepper changes re-filter without a new `fetchGraph()` call; recenter button changes `centerPath` without changing hops
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.10_

- [x] 2. Ungelinkte Erwähnungen
  - [x] 2.1 Extend document panel state
    - Add `UnlinkedMentionEntry` type and `unlinkedMentions: { entries, loading, error }` slice to `DocumentPanelState` (`documentPanelData.ts`)
    - Add `SET_UNLINKED_MENTIONS` / `SET_UNLINKED_MENTIONS_LOADING` / `SET_UNLINKED_MENTIONS_ERROR` actions and reducer cases, mirroring the existing backlinks actions
    - Include the new slice in `RESET_DOCUMENT_STATE`
    - _Requirements: 2.1_

  - [x] 2.2 Implement `loadUnlinkedMentions` action
    - Add `loadUnlinkedMentions(dispatch, apiClient, vaultId, filePath, directoryTree)` to `documentPanelActions.ts`
    - Extract base filename (no extension) from `filePath`; call `apiClient.searchVault(vaultId, { query: baseName, caseSensitive: 'false', regex: 'false', contextLines: '0', maxResults: '50' })`
    - Exclude the active file itself from results
    - For each candidate file's `matchLine`, run `extractWikilinks()` and `resolveWikilinkTarget()` (against `directoryTree`, `sourcePath` = candidate file path) to detect whether the match overlaps an existing wikilink that resolves to the active file; drop those matches, keep files with at least one remaining unlinked occurrence
    - Map remaining results to `UnlinkedMentionEntry[]` (file path, line number, snippet from `matchLine`)
    - _Requirements: 2.2, 2.3, 2.4, 2.5_

  - [x] 2.3 Wire loading into `useDocumentPanelData`
    - Call `loadUnlinkedMentions` in the document-switch effect after the existing `loadBacklinks` call, as an independent (non-blocking) async call
    - Use a request-token/ref pattern to discard stale results if the document changes before the search resolves
    - Extend the existing realtime-refresh effect (`documentPanelData.ts:236-259`) with a second, independently debounced (1000ms) call to `loadUnlinkedMentions` on `saved`/`deleted` events
    - _Requirements: 2.9, 2.10, 2.11, 2.12_

  - [x] 2.4 Add "Ungelinkte Erwähnungen" section to `LinksView.tsx`
    - New `<section>` after the existing Backlinks section (after `LinksView.tsx:108`), same markup pattern (title, loading, error, empty-placeholder, list)
    - Each entry shows file path + snippet; clicking opens the file and scrolls to the match (reuse `onLinkClick`-style navigation)
    - Add a "Verlinken" action per entry that rewrites the first occurrence at the matched line into `[[<active file name>]]` and saves the file through the existing save path
    - _Requirements: 2.1, 2.6, 2.7, 2.8_

  - [x]* 2.5 Tests for unlinked mentions
    - Unit tests for the wikilink-overlap filtering logic in `loadUnlinkedMentions` (plain mention kept, existing-wikilink mention dropped, mixed line with both kept partially)
    - Component tests for `LinksView`: empty placeholder, loading, error states; "Verlinken" action rewrites only the targeted occurrence
    - Stale-response discard test: document switch mid-request does not clobber the new document's state
    - _Requirements: 2.3, 2.7, 2.8, 2.9, 2.12_

- [x] 3. Link-Migration
  - [x] 3.1 Port wikilink target resolution to the backend
    - Create `backend/src/link-index/link-match-resolver.ts` with `resolveWikilinkTargetOnTree()` (ported from `frontend/src/plugins/link-resolver.ts:44-124`: same-folder-first, then shortest-path, then alphabetical tie-break) and `findWikilinksTargeting(content, sourcePath, targetPath, tree)` (uses `extractWikilinks()` + the resolver to return matching `ParsedWikilink[]` with positions)
    - _Requirements: 3.1, 3.2, 3.3, 3.13_

  - [x] 3.2 Implement `LinkMigrationService`
    - Create `backend/src/link-index/link-migration-service.ts` implementing `ILinkMigrationService.migrateLinks(vaultId, oldPath, newPath): Promise<LinkMigrationResult>`
    - Candidate gathering: union of `linkIndex.getBacklinks(oldPath)` and a filename-substring search (reuse `SearchService.search()`) for `oldPath`'s basename
    - Per candidate: `findWikilinksTargeting()` to confirm real matches; for confirmed matches, rewrite each occurrence's target (preserving alias/heading/blockRef), write atomically (same temp→rename approach as `ReplaceService`)
    - After each successful file write: `linkIndex.updateFile(sourcePath, newContent)` and collect the result; on write failure, record into `failedFiles` and continue with remaining candidates
    - Handles both markdown targets and non-markdown embed targets (e.g. `![[image.png]]`) — no filetype guard on `oldPath`/`newPath` beyond what `getBacklinks`/search already handle
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.9, 3.10, 3.12_

  - [x] 3.3 Integrate migration into move/rename controller handlers
    - In `backend/src/api/index.ts`, `moveContent()` (547-583) and `renameContent()` (592-628): after a successful `vaultService.moveContent`/`renameContent` call, determine the full set of `{oldPath, newPath}` file pairs affected — a single pair for a file operation, or one pair per descendant file (derived from the pre-operation `DirectoryTree` subtree) for a folder operation
    - Remove the existing `sourcePath.endsWith('.md')` guard around the `linkIndexHook.onFileRenamed` call site's scope — it still governs the self-update hook, but migration now also runs for folders and non-.md embeds
    - For each affected pair, `await linkMigrationService.migrateLinks(vaultId, oldPath, newPath)` before returning the HTTP response (synchronous, unlike the existing fire-and-forget `onFileRenamed` hook)
    - Aggregate `failedFiles` across all pairs into an optional `linkMigrationWarnings` field on the 200 response; do not change the response status on partial migration failure
    - _Requirements: 3.7, 3.8, 3.9_

  - [x] 3.4 Publish change events for migrated files
    - In `LinkMigrationService` (or the calling controller), call the existing `publishVaultChange(vaultId, 'saved', sourcePath, ...)` for every successfully rewritten migration source, so open tabs/sessions and the live-backlinks-refresh (`navigation-link-polish` Requirement 5) pick up the change without manual reload
    - _Requirements: 3.11_

  - [x]* 3.5 Tests for link migration
    - Unit tests for `resolveWikilinkTargetOnTree`/`findWikilinksTargeting`: exact-path links, bare-filename links to a subfolder file, ambiguous-name disambiguation (same-folder-first, shortest-path, alphabetical), alias/heading/blockRef preservation
    - Property test: `resolveWikilinkTargetOnTree` produces identical results to the frontend's `resolveWikilinkTarget` for the same `(target, tree, sourcePath)` inputs (equivalence, mirroring the existing "Property 9: Backend Parser Equivalence" pattern for `extractWikilinks`)
    - Integration test: rename a file referenced only via bare-filename wikilinks from a different folder — confirms the literal `getBacklinks()` path alone would have missed it, and that migration catches it
    - Integration test: folder move rewrites links to multiple descendant files in one operation
    - Integration test: partial failure (one migration-source write fails) — rename still succeeds, response carries `linkMigrationWarnings`, other sources are still migrated
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.7, 3.9, 3.13_
