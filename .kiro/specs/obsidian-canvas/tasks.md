# Implementation Plan: Obsidian Canvas

## Overview

Implementierung der Obsidian-Canvas-Unterstützung für Slatebase. Umfasst Parsing/Serialisierung des `.canvas`-JSON-Formats, eine interaktive Visualisierung mit Zoom/Pan/Drag, Node/Edge-CRUD und Auto-Save. Integration in Link-Index für Knowledge-Graph-Anbindung.

## Tasks

- [x] 1. Canvas-Parser und Datenmodell
  - [x] 1.1 Create canvas data model types
    - Create `frontend/src/canvas/types.ts` with `CanvasDocument`, `CanvasNode` (TextNode, FileNode, LinkNode, GroupNode), `CanvasEdge`, `CanvasParseResult`, `CanvasValidationError`
    - Include `_unknown` passthrough fields for forward compatibility
    - _Requirements: 2.1, 2.2, 2.3_

  - [x] 1.2 Implement canvas parser with Zod validation
    - Create `frontend/src/canvas/parser.ts`
    - Zod schemas for all node types and edges (passthrough for unknown fields)
    - `parseCanvas(json: string): CanvasParseResult` — validate, return typed document or errors
    - Validate node ID uniqueness, edge references against existing node IDs
    - Handle malformed JSON gracefully (try/catch around JSON.parse)
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6_

  - [x] 1.3 Implement canvas serializer
    - Create `frontend/src/canvas/serializer.ts`
    - `serializeCanvas(doc: CanvasDocument): string` — produce Obsidian-compatible JSON
    - Preserve `_unknown` fields in output (round-trip compatibility)
    - Stable key ordering for minimal Git diffs
    - _Requirements: 8.2, 8.5_

  - [x] 1.4 Create barrel export
    - Create `frontend/src/canvas/index.ts` — export types, parser, serializer
    - _Requirements: —_

  - [x] 1.5 Write unit tests for parser and serializer
    - Create `frontend/src/canvas/parser.test.ts`
    - Test all node types, edge validation, ID uniqueness, forward-compat, round-trip
    - Test malformed JSON, missing required fields, invalid edge references
    - _Requirements: 2.1–2.6, 8.2, 8.5_

- [x] 2. Canvas-State-Management
  - [x] 2.1 Implement canvas reducer and actions
    - Create `frontend/src/state/canvasState.ts`
    - Actions: LOAD_CANVAS, MOVE_NODE, RESIZE_NODE, ADD_NODE, DELETE_NODES, UPDATE_NODE_TEXT, ADD_EDGE, DELETE_EDGES, SELECT_NODES, DESELECT_ALL, SET_VIEWPORT, UNDO, REDO
    - Undo/Redo stack (max 50 entries, FIFO eviction)
    - Dirty-Flag tracking for unsaved changes indicator
    - _Requirements: 5.1, 5.2, 5.6, 5.7, 6.1, 6.4, 7.1–7.6, 8.3_

  - [x] 2.2 Implement canvas context provider
    - Create `frontend/src/state/canvasContext.ts`
    - CanvasProvider + useCanvasContext hook
    - Auto-save logic: 2s debounce after dirty state, call onSave prop
    - _Requirements: 8.1, 8.6_

- [x] 3. Canvas-Routing und Tab-Integration
  - [x] 3.1 Add .canvas file type detection to TabContent
    - Modify `frontend/src/components/TabContent.tsx` — detect `.canvas` extension, render CanvasView instead of Edit/ViewMode
    - Pass readOnly based on vault access level
    - _Requirements: 1.2, 1.4, 11.1_

  - [x] 3.2 Add canvas icon to FileExplorer
    - Modify `frontend/src/utils/fileIcons.tsx` — use `LayoutDashboard` icon for `.canvas` files
    - _Requirements: 1.1_

  - [x] 3.3 Add canvas file icon to TabBar
    - Modify `frontend/src/components/TabBar.tsx` — show canvas icon for `.canvas` tabs, hide mode toggle
    - _Requirements: 1.3_

- [x] 4. Canvas-Rendering (Read-Only-Kern)
  - [x] 4.1 Implement CanvasView container component
    - Create `frontend/src/components/canvas/CanvasView.tsx`
    - Viewport state (x, y, zoom), CSS transform on container
    - Error state for parse failures (show error + raw JSON fallback link)
    - Wire CanvasProvider, load/parse on mount
    - _Requirements: 1.5, 4.5, 11.4_

  - [x] 4.2 Implement zoom and pan interaction
    - Wheel zoom (10%–400%, step 10%), middle-mouse/space+drag pan
    - Fit-to-View button
    - Initial viewport: center on nodes bounding box
    - _Requirements: 4.1, 4.2, 4.3, 4.5_

  - [x] 4.3 Implement TextNodeRenderer
    - Create `frontend/src/components/canvas/TextNodeRenderer.tsx`
    - Positioned div with text content display
    - Color border from node.color
    - _Requirements: 3.2, 3.8_

  - [x] 4.4 Implement FileNodeRenderer
    - Create `frontend/src/components/canvas/FileNodeRenderer.tsx`
    - Show filename, icon based on type, broken-link styling if not found
    - Double-click opens file in new tab
    - _Requirements: 3.3, 3.9, 5.5_

  - [x] 4.5 Implement LinkNodeRenderer
    - Create `frontend/src/components/canvas/LinkNodeRenderer.tsx`
    - URL display with external link icon
    - Double-click opens URL in new browser tab
    - _Requirements: 3.4_

  - [x] 4.6 Implement GroupNodeRenderer
    - Create `frontend/src/components/canvas/GroupNodeRenderer.tsx`
    - Semi-transparent background rect, z-index below contained nodes
    - Optional label display
    - _Requirements: 3.5_

  - [x] 4.7 Implement EdgeRenderer (SVG layer)
    - Create `frontend/src/components/canvas/EdgeRenderer.tsx`
    - Bézier curve calculation based on fromSide/toSide anchor points
    - Arrow markers via SVG `<marker>` defs
    - Color from edge.color
    - _Requirements: 3.6, 3.7, 3.8_

  - [x] 4.8 Implement grid background
    - Optional grid pattern SVG (toggle via toolbar)
    - Scales with zoom level
    - _Requirements: 9.4_

- [x] 5. Canvas-CSS und Design Tokens
  - [x] 5.1 Add canvas Design Tokens to index.css
    - Node background, border, selection, group colors
    - `--canvas-color-1` through `--canvas-color-6` (Obsidian mapping)
    - Edge default color, grid color
    - Dark mode overrides
    - _Requirements: 9.1, 9.2, 9.3_

  - [x] 5.2 Add canvas CSS classes
    - Create `frontend/src/components/canvas/CanvasView.css`
    - Node containers, edge paths, selection highlight, minimap, toolbar
    - Responsive font sizing (readable at ≥50% zoom)
    - _Requirements: 9.5_

- [x] 6. Canvas-Bearbeitung (Interaktion)
  - [x] 6.1 Implement node drag (move)
    - Mouse down on node → track delta → dispatch MOVE_NODE
    - Multi-select drag (shift+click)
    - Live edge re-routing during drag
    - _Requirements: 5.1, 5.6_

  - [x] 6.2 Implement node resize
    - Resize handles on selected nodes (8 points: corners + midpoints)
    - Minimum size 100×60px
    - Dispatch RESIZE_NODE
    - _Requirements: 5.2_

  - [x] 6.3 Implement text node inline editing
    - Double-click TextNode → show textarea overlay
    - Escape/blur → save and re-render as markdown
    - _Requirements: 5.3, 5.4_

  - [x] 6.4 Implement node creation
    - Double-click background → new TextNode
    - Generate unique IDs (crypto.randomUUID)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

  - [x] 6.5 Implement node deletion
    - Select nodes → Delete key → dispatch DELETE_NODES
    - Remove connected edges
    - _Requirements: 5.7_

  - [x] 6.6 Implement edge creation
    - Drag from node border anchor → drop on target node
    - Determine fromSide/toSide from drag start/end positions
    - _Requirements: 6.1, 6.2_

  - [x] 6.7 Implement edge deletion and editing
    - Click edge → select → Delete key removes
    - _Requirements: 6.3, 6.4, 6.5_

  - [x] 6.8 Implement copy/paste
    - Ctrl+C selected nodes → clipboard state
    - Ctrl+V → paste with new IDs, offset position
    - _Requirements: 7.6_

  - [x] 6.9 Implement read-only mode
    - Hide drag handles, resize handles, toolbar creation options
    - Allow zoom/pan and file-node double-click navigation
    - Show read-only indicator badge
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

- [x] 7. Link-Index-Integration (Backend)
  - [x] 7.1 Implement canvas file-reference extractor
    - Create `backend/src/link-index/canvas-parser.ts`
    - Parse `.canvas` JSON, extract `file` field from all file-nodes
    - Return as link entries (source: canvas file, target: referenced file)
    - _Requirements: 10.1_

  - [x] 7.2 Integrate canvas extraction into LinkIndexService
    - Modify `backend/src/link-index/link-index-service.ts`
    - On rebuild: process `.canvas` files alongside `.md` files
    - On incremental update: re-index changed `.canvas` files
    - _Requirements: 10.1, 10.2_

  - [x] 7.3 Add canvas node type to graph
    - Canvas files appear as 'file' type nodes in graph (with .canvas extension)
    - Click opens canvas tab (handled by existing graph click → openTab logic)
    - _Requirements: 10.3, 10.4_

  - [x] 7.4 Write unit tests for canvas link extraction
    - Create `backend/src/link-index/canvas-parser.test.ts`
    - Test file-node extraction, empty canvas, invalid JSON, mixed node types
    - All 10 tests passing
    - _Requirements: 10.1, 10.2_

- [x] 8. Optionale Erweiterungen
  - [x] 8.1 Implement minimap
    - Create `frontend/src/components/canvas/CanvasMinimap.tsx`
    - Scaled SVG overview of all nodes with viewport indicator rect
    - Click-to-navigate (converts minimap coords to canvas coords)
    - Toggle visibility via toolbar button
    - _Requirements: 4.4_

  - [ ]* 8.2 Implement touch gestures
    - Pinch-to-zoom, two-finger pan
    - _Requirements: 4.6_

  - [x] 8.3 Implement viewport culling
    - Create `frontend/src/components/canvas/useViewportCulling.ts`
    - Only render nodes within visible viewport + 200px margin
    - Threshold: culling activates for canvases with ≥100 nodes
    - Uses AABB overlap test, memoized with useMemo
    - _Requirements: Performance_

  - [x] 8.4 Implement edge label editing via context menu
    - Create `frontend/src/components/canvas/EdgeContextMenu.tsx`
    - Right-click edge → context menu with label edit, arrow toggles, delete
    - Added UPDATE_EDGE_ARROWS action to reducer
    - EdgeRenderer supports onEdgeContextMenu prop (right-click on hit area)
    - _Requirements: 6.5, 6.6_

## Notes

- Tasks marked with `*` are optional enhancements
- No new npm dependencies needed for core functionality (SVG rendering is native)
- Markdown rendering inside Text_Nodes reuses existing ViewMode/plugins infrastructure
- Canvas state is fully client-side (no Canvas-specific backend endpoints beyond existing file read/write)
- Auto-save uses existing `VaultService.writeFile()` endpoint

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.4"] },
    { "id": 2, "tasks": ["1.5", "2.1"] },
    { "id": 3, "tasks": ["2.2", "3.1", "3.2", "3.3"] },
    { "id": 4, "tasks": ["4.1", "5.1", "5.2"] },
    { "id": 5, "tasks": ["4.2", "4.3", "4.4", "4.5", "4.6", "4.7", "4.8"] },
    { "id": 6, "tasks": ["6.1", "6.2", "6.3", "6.9"] },
    { "id": 7, "tasks": ["6.4", "6.5", "6.6", "6.7", "6.8"] },
    { "id": 8, "tasks": ["7.1", "7.2", "7.3", "7.4"] },
    { "id": 9, "tasks": ["8.1", "8.2", "8.3", "8.4"] }
  ]
}
```

