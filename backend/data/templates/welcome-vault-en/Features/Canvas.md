---
tags: [features]
---

# Canvas

Canvas is a visual whiteboard where you can arrange text, files, links, and groups as draggable nodes connected by edges. Perfect for brainstorming, planning, and mind mapping.

![[Screenshots/canvas-nodes.png]]

*Canvas with different node types and connections*

---

## Opening a Canvas

Create a new file with the `.canvas` extension (e.g., `Brainstorm.canvas`) or use the context menu → **New Canvas**.

---

## Node Types

### Text Nodes

Free-form text with Markdown support. Double-click to edit.

### File Nodes

Embed an existing vault file. The content is previewed inside the node. Markdown files show rendered content, images show the image.

### Link Nodes

External URLs displayed as an iframe preview. Useful for referencing web resources.

### Group Nodes

Containers that visually group other nodes. Drag nodes into a group to associate them.

---

## Creating Nodes

| Method | Description |
|--------|-------------|
| Toolbar | Click the node type button (Text, File, Link, Group) |
| Double-click | Double-click on empty space → creates text node |
| Context menu | Right-click on empty space → Add node |
| Drag from explorer | Drag a file into the canvas → creates file node |

---

## Edges (Connections)

Connect nodes to show relationships:

1. Hover over a node — anchor points appear on the edges
2. Click and drag from an anchor to another node
3. Release — an edge is created

### Edge Options (Context Menu)

- **Add label** — Text on the connection
- **Arrow direction** — Toggle arrows
- **Delete** — Remove the edge

---

## Navigation

| Action | Control |
|--------|---------|
| Pan | Click and drag on empty space |
| Zoom | Scroll wheel |
| Select node | Click on a node |
| Multi-select | Hold Shift and click, or drag a selection box |
| Fit to view | Toolbar button (fits all nodes into the viewport) |

---

## Toolbar

The canvas toolbar offers:
- Add nodes (text, file, link, group)
- Zoom in/out
- Fit to view
- Toggle grid
- Toggle minimap
- Undo/Redo
- Switch to source view (raw JSON)

---

## Minimap

Toggle the minimap in the bottom-right corner for an overview of your canvas. Click on the minimap to navigate to that area.

---

## Source View

Switch to source view to see and edit the raw JSON of your canvas. Useful for precise adjustments or debugging.

---

> [!tip] Canvas Tips
> - Use groups to organize related nodes
> - Color-code nodes via the context menu for visual categorization
> - Keep text nodes concise — link to detailed files instead
> - The canvas auto-saves like regular files

> [!todo] Exercise
> 1. Create a new canvas file (right-click → New Canvas)
> 2. Add a text node with a project idea
> 3. Add 2–3 more text nodes with related thoughts
> 4. Connect them with edges
> 5. Create a group node and drag some nodes into it
> 6. Try the minimap and zoom controls

---

## Related Features

- [[Advanced/Canvas Workflows]] — Advanced canvas use cases
- [[Features/Wikilinks]] — Linking notes (text-based alternative)
- [[Features/Knowledge Graph]] — Automatic visualization of connections
