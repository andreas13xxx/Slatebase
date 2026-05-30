# Implementation Plan: Knowledge Graph

## Overview

Implementierung des Knowledge Graph Features bestehend aus einem Backend Link-Index-Service (Wikilink-Parsing, In-Memory-Index mit JSON-Persistierung, REST-API) und einer Frontend Graph-View-Komponente (SVG + d3-force Layout, Zoom/Pan, Suche, Tab-Integration). Die Implementierung folgt dem Interface-First-Pattern mit manueller DI.

## Tasks

- [x] 1. Backend: Typen, Interface und Wikilink-Parser
  - [x] 1.1 Create ILinkIndex interface and type definitions
    - Create `backend/src/link-index/types.ts` with `ILinkIndex`, `GraphNode`, `GraphEdge`, `GraphData`, `BacklinksResponse`, `ParsedWikilink` interfaces
    - Create `backend/src/link-index/index.ts` barrel export
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x] 1.2 Implement backend WikilinkParser (`extractWikilinks`)
    - Create `backend/src/link-index/wikilink-parser.ts`
    - Implement `extractWikilinks(markdown: string): ParsedWikilink[]`
    - Handle all formats: `[[target]]`, `[[folder/file]]`, `[[file#heading]]`, `[[file#heading|display]]`, `[[#heading]]`
    - Exclude wikilinks inside fenced code blocks (``` or ~~~), indented code blocks (4 spaces/1 tab), and inline code (backticks)
    - Ignore invalid wikilinks (`[[]]`, unclosed, with newlines)
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

  - [ ]* 1.3 Write property tests for WikilinkParser (Properties 9–13)
    - **Property 9: Backend Parser Equivalence** — same targets as frontend `extractWikilinks()`
    - **Property 10: Code Block Exclusion** — wikilinks in code blocks return empty
    - **Property 11: Wikilink Format Recognition** — correct field extraction per format
    - **Property 12: Invalid Wikilinks Ignored** — no errors, no results for invalid syntax
    - **Property 13: Parser Determinism** — same input always produces same output
    - **Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5**

  - [ ]* 1.4 Write unit tests for WikilinkParser
    - Test each wikilink format with concrete examples
    - Test code block exclusion (fenced, indented, inline)
    - Test edge cases (empty string, no wikilinks, mixed valid/invalid)
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [ ] 2. Backend: LinkIndexService Implementierung
  - [x] 2.1 Implement LinkIndexService core (rebuild, persist, load)
    - Create `backend/src/link-index/link-index-service.ts`
    - Implement `rebuild()`: recursively find all `.md` files, parse each, build forward links map + reverse map
    - Implement JSON persistence: atomic write (temp → rename) to `data/vaults/<vaultId>/_link-index.json`
    - Implement `loadFromDisk()`: load JSON, validate schema, rebuild reverse map; on failure → `rebuild()`
    - Skip unreadable files during rebuild (log warning, continue)
    - Path normalization: forward slashes, no leading `./`, relative to vault root, append `.md` if missing
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6, 1.7_

  - [x] 2.2 Implement LinkIndexService incremental updates
    - Implement `updateFile(filePath, content)`: remove old forward links, parse new content, update forward + reverse maps, persist
    - Implement `removeFile(filePath)`: remove from forward map, clean reverse map entries, persist
    - Implement `renameFile(oldPath, newPath, content)`: remove old, add new with parsed content, persist
    - Handle persistence failure gracefully (keep in-memory index, log error)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8_

  - [x] 2.3 Implement LinkIndexService query methods
    - Implement `getForwardLinks(filePath)`: return target paths from forward map
    - Implement `getBacklinks(filePath)`: return source paths from reverse map
    - Implement `getGraph()`: build nodes array (with exists flag) + edges array from forward map
    - Implement `isReady()`: return initialization status
    - _Requirements: 3.1, 3.2, 3.3, 7.2_

  - [ ]* 2.4 Write property tests for LinkIndexService (Properties 1–8)
    - **Property 1: Reverse-Map Invariant** — forward/backlink consistency
    - **Property 2: Index Persistence Round-Trip** — serialize/deserialize identity
    - **Property 3: Path Normalization** — forward slashes, no `./`, relative
    - **Property 4: Incremental Update Isolation** — only updated file changes
    - **Property 5: Delete Removes All Traces** — no remnants after delete
    - **Property 6: Rename Correctness** — old path gone, new path correct
    - **Property 7: getGraph Completeness** — all nodes/edges present, no extras
    - **Property 8: Invalid Index File Triggers Rebuild** — invalid JSON → rebuild
    - **Validates: Requirements 1.2, 1.3, 1.4, 1.5, 1.6, 2.1, 2.2, 2.3, 2.4, 2.6, 3.1, 3.2, 3.3**

  - [ ]* 2.5 Write unit tests for LinkIndexService
    - Test rebuild with mock filesystem
    - Test incremental update scenarios (add, modify, delete, rename)
    - Test persistence round-trip
    - Test error handling (unreadable files, persist failure)
    - _Requirements: 1.1–1.7, 2.1–2.8_

- [x] 3. Checkpoint — Backend Link-Index-Service
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Backend: Graph API Routes
  - [x] 4.1 Implement Graph API routes
    - Create `backend/src/api/graphRoutes.ts`
    - Implement `GET /api/v1/vaults/:vaultId/graph` → returns `GraphData`
    - Implement `GET /api/v1/vaults/:vaultId/backlinks?path=<filePath>` → returns `BacklinksResponse`
    - Auth middleware: require read or write permission (403 if unauthorized)
    - Vault existence check (404 with `VAULT_NOT_FOUND`)
    - Lazy-init: if index not ready, trigger rebuild then respond
    - Empty backlinks for unknown file path (200 with empty array)
    - Zod validation for `path` query parameter
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7_

  - [x] 4.2 Wire LinkIndexService into Composition Root
    - Instantiate `LinkIndexService` per vault in `backend/src/index.ts`
    - Register graph routes in the Hono app
    - Hook into vault file save/delete events to trigger incremental updates
    - Initialize link index on vault init (load from disk or rebuild)
    - _Requirements: 1.1, 1.5, 2.1, 7.6_

  - [ ]* 4.3 Write unit tests for Graph API routes
    - Test successful graph response
    - Test successful backlinks response
    - Test 403 for unauthorized access
    - Test 404 for non-existent vault
    - Test empty backlinks for unknown file
    - Test lazy-init behavior
    - _Requirements: 3.1–3.7_

- [x] 5. Checkpoint — Backend API complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 6. Frontend: Graph Utilities and API Client
  - [x] 6.1 Extend IApiClient with graph methods
    - Add `getGraph(vaultId: string): Promise<GraphData>` to `IApiClient` interface
    - Add `getBacklinks(vaultId: string, filePath: string): Promise<BacklinksResponse>` to `IApiClient` interface
    - Implement both methods in `ApiClient` class
    - Add `GraphData`, `GraphNode`, `GraphEdge`, `BacklinksResponse` types to frontend `types.ts`
    - _Requirements: 3.1, 3.3_

  - [x] 6.2 Implement graph utility functions
    - Create `frontend/src/components/graph-utils.ts`
    - Implement `truncateLabel(filename: string): string` — remove path/extension, truncate at 30 chars with ellipsis
    - Implement `clampZoom(currentZoom: number, delta: number): number` — clamp to [0.1, 5.0]
    - Implement `computeNodeSize(connections: number, maxConnections: number): number` — scale between 4px and 20px radius
    - Implement `filterNodes(query: string, nodes: GraphNode[]): GraphNode[]` — case-insensitive substring, max 10 results
    - _Requirements: 4.3, 5.1, 9.1, 9.2_

  - [ ]* 6.3 Write property tests for graph utilities (Properties 14–17)
    - **Property 14: Label Truncation** — correct truncation at 30 chars with ellipsis
    - **Property 15: Zoom Clamping** — always within [0.1, 5.0]
    - **Property 16: Node Size Scaling** — monotonically non-decreasing, within [4, 20]
    - **Property 17: Search Filtering** — case-insensitive substring, max 10 results
    - **Validates: Requirements 4.3, 5.1, 9.1, 9.2**

  - [ ]* 6.4 Write unit tests for graph utilities
    - Test truncateLabel with short/long/exact-30 filenames
    - Test clampZoom at boundaries
    - Test computeNodeSize with 0, max, and intermediate values
    - Test filterNodes with various queries and node lists
    - _Requirements: 4.3, 5.1, 9.1, 9.2_

- [x] 7. Frontend: GraphView Component
  - [x] 7.1 Implement GraphView component with SVG + d3-force layout
    - Create `frontend/src/components/GraphView.tsx`
    - Fetch graph data from API on mount and vault change
    - Render SVG with d3-force simulation (charge repulsion, link attraction)
    - Render nodes as circles with size proportional to connections (using `computeNodeSize`)
    - Render edges as lines between source and target nodes
    - Display labels using `truncateLabel` (filename without path/extension)
    - Show isolated nodes (no connections)
    - Visually distinguish unresolved links (exists=false) with different color
    - Show loading indicator while fetching
    - Show error message with retry button on fetch failure
    - Show "no links found" message for empty graphs
    - All colors via CSS Custom Properties (Design Tokens)
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.8, 9.1, 9.5_

  - [x] 7.2 Implement GraphView interactions (zoom, pan, drag, hover, click)
    - Zoom via mouse wheel / pinch gesture, clamped to [0.1, 5.0] using `clampZoom`
    - Pan via mouse drag on background
    - Node drag: fix position, exclude from force layout; double-click to release
    - Hover: show full file path as tooltip, highlight direct connections with accent color, dim others to 20% opacity
    - Click on existing node: open file in tab via TabProvider
    - Click on non-existing node (unresolved): no action
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 4.6, 4.7_

  - [x] 7.3 Implement search functionality in GraphView
    - Add search input with case-insensitive substring filtering using `filterNodes`
    - Show max 10 suggestions in dropdown
    - On selection: center graph on node, highlight with accent border + 1.5x size
    - Show "no results" message when no matches
    - _Requirements: 9.2, 9.3, 9.4_

  - [ ]* 7.4 Write unit tests for GraphView component
    - Test loading state rendering
    - Test error state with retry button
    - Test empty graph message
    - Test node click behavior (existing vs non-existing)
    - Test vault change triggers re-fetch
    - _Requirements: 4.1, 4.6, 4.7, 4.8, 6.7_

- [x] 8. Frontend: Tab-Integration
  - [x] 8.1 Integrate GraphView as a tab in the existing tab system
    - Add graph tab type with virtual path `__graph__` and tab ID `<vaultId>::__graph__`
    - Update `TabContent` to render `GraphView` when `filePath === '__graph__'`
    - Add "Graph" button to `SidebarToolbar` with Lucide graph icon
    - On button click: open graph tab (or activate existing — max one graph tab)
    - Tab label: "Graph" with graph icon
    - On vault switch with graph tab open: reload graph data for new vault (tab stays open)
    - Show message when no vault is selected
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

  - [ ]* 8.2 Write unit tests for tab integration
    - Test graph tab opens on button click
    - Test only one graph tab at a time
    - Test vault switch reloads graph
    - Test no-vault-selected message
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [x] 9. Frontend: CSS Design Tokens for Graph
  - [x] 9.1 Add CSS Custom Properties for graph visualization
    - Add tokens to `frontend/src/index.css`: `--graph-bg`, `--graph-node-fill`, `--graph-node-unresolved`, `--graph-edge-color`, `--graph-edge-highlight`, `--graph-label-color`, `--graph-search-highlight`
    - Define values for both light mode (`:root`) and dark mode (`:root[data-theme="dark"]` + `@media (prefers-color-scheme: dark)`)
    - _Requirements: 9.5_

- [x] 10. Final Checkpoint — All tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties (17 properties defined in design)
- Unit tests validate specific examples and edge cases
- Backend uses `.js` extensions in imports (ESM)
- Frontend graph utilities are pure functions — ideal for property-based testing
- d3-force is a new dependency that needs to be installed (`d3-force` + `@types/d3-force`)
- The existing frontend wikilink parser at `frontend/src/plugins/wikilink/extract.ts` serves as reference for backend parser equivalence (Property 9)

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "6.1"] },
    { "id": 2, "tasks": ["1.3", "1.4", "2.1", "6.2"] },
    { "id": 3, "tasks": ["2.2", "6.3", "6.4"] },
    { "id": 4, "tasks": ["2.3", "2.4", "2.5"] },
    { "id": 5, "tasks": ["4.1", "7.1"] },
    { "id": 6, "tasks": ["4.2", "4.3", "7.2", "9.1"] },
    { "id": 7, "tasks": ["7.3", "7.4", "8.1"] },
    { "id": 8, "tasks": ["8.2"] }
  ]
}
```
