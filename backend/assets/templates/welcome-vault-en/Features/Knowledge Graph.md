---
tags: [features]
---

# Knowledge Graph

The Knowledge Graph visualizes the connections between your notes. Every wikilink becomes a visible edge, every file a node — making your knowledge network tangible.

![[Screenshots/knowledge-graph.png]]

*The Knowledge Graph visualizes connections between notes*

---

## What the Graph Shows

- **Nodes** — Each file in your vault is represented as a node
- **Edges** — Wikilinks between files are shown as connecting lines
- **Tag nodes** — Tags can appear as separate nodes (configurable)
- **Property nodes** — Frontmatter properties can also appear as nodes

---

## Opening the Graph

| Method | Description |
|--------|-------------|
| Command Palette | Search for "Knowledge Graph" |
| Sidebar | Click the graph icon |

The graph opens as a new tab in the main area.

---

## Navigation

| Action | Control |
|--------|---------|
| Pan | Click and drag on empty space |
| Zoom | Scroll wheel or pinch gesture |
| Select node | Click on a node |
| Open file | Double-click a node |
| Drag node | Click and drag a node |

---

## Search

The graph includes a search field. Type a filename to highlight and center on that node.

---

## Configuration

Click the settings gear icon in the graph view to customize:

### Colors

- Node color (files)
- Tag node color
- Property node color
- Edge color
- Background color

### Layout

- Link distance — How far apart connected nodes are
- Charge strength — How much nodes repel each other
- Center force — How strongly nodes are pulled toward center

### Toggles

- Show tags as nodes
- Show properties as nodes
- Show orphan nodes (files with no links)

---

## Practical Example

1. Open the Knowledge Graph for this vault
2. Zoom into the center — you'll see dense clusters (the Features folder)
3. Click on a node to highlight its connections
4. Double-click to open that file
5. Try adjusting the charge strength to spread nodes further apart

---

> [!tip] Graph Insights
> - **Dense clusters** indicate strongly related topics
> - **Orphan nodes** (disconnected) might need more links
> - **Hub nodes** (many connections) are often your most important notes
> - Use the graph to discover unexpected connections between topics

> [!todo] Exercise
> 1. Open the Knowledge Graph
> 2. Find this file's node and see its connections
> 3. Identify the most connected file in this vault (the biggest hub)
> 4. Open graph settings and toggle tag nodes on/off
> 5. Create a new file with 3 links and watch it appear in the graph

---

## Related Features

- [[Features/Wikilinks]] — Creating the connections
- [[Features/Context Panel]] — Backlinks and forward links
- [[Features/Tags and Properties]] — Tags as graph nodes
