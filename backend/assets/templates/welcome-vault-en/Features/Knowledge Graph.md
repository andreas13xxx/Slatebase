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

## Local Graph

The full graph above shows the whole vault — great for an overview, but noisy once a vault has hundreds of notes. The **Local Graph** shows only the neighborhood of a single note instead.

### Opening the Local Graph

1. Open the note you want to inspect — it must be the active tab
2. Open the Command Palette and run **"Graph view: Open local graph"**
3. A new tab opens with just that note and its connections; the note itself is highlighted at the center

### Neighborhood Radius

A stepper in the top-left corner of the local graph controls how many hops out from the center note are shown:

| Radius | Shows |
|--------|-------|
| 1 hop (default) | Direct forward links and backlinks only |
| 2 hops | Also the connections of those connections |
| 3–5 hops | Wider neighborhoods, approaching the full graph in a densely linked vault |

The radius is remembered the next time you open a local graph. No new data is fetched when you change it — the same graph data is just filtered differently.

### Re-centering

Use the search field to jump to a different note. In the local graph, selecting a search result **re-centers** the neighborhood on it instead of just panning to it — clicking a node still opens that file, exactly like in the full graph.

### Live Example

1. With this file (`Features/Knowledge Graph.md`) open, run **"Graph view: Open local graph"** from the Command Palette
2. You'll see this note in the center, connected to [[Features/Wikilinks]], [[Features/Context Panel]], and [[Features/Tags and Properties]] — much easier to read than the full graph above
3. Increase the radius to 2 — now you also see what those three files link to
4. Search for "Start here" and select it — the graph re-centers on that hub note instead of just scrolling to it

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
> 6. Open the local graph for this file and compare it to the full graph above

---

## Related Features

- [[Features/Wikilinks]] — Creating the connections
- [[Features/Context Panel]] — Backlinks and forward links
- [[Features/Tags and Properties]] — Tags as graph nodes
