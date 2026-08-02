---
tags: [advanced, plugins]
---

# Excalidraw Plugin

Excalidraw brings a visual whiteboard directly into your vault. Create freehand drawings, diagrams, wireframes, and sketches — embedded in your knowledge management.

---

## Prerequisites

- Feature toggle `obsidian-plugin-compat` enabled
- Excalidraw plugin installed and activated
- Plugin ZIP from GitHub: `obsidian-excalidraw-plugin`

---

## Installation

1. Download plugin ZIP from GitHub
2. Settings → Vault → Plugins → "Install Plugin"
3. Upload ZIP → Activate

---

## Creating a Drawing

### Via Command Palette

1. `Ctrl+P` → "Excalidraw: Create new drawing"
2. Enter filename
3. The Excalidraw editor opens

### Manually

Create a file with the extension `.excalidraw.md` — the plugin recognizes it automatically.

---

## Tools

| Tool | Shortcut | Description |
|------|----------|-------------|
| Selection | `V` | Select and move elements |
| Rectangle | `R` | Draw rectangle |
| Ellipse | `O` | Draw circle/ellipse |
| Arrow | `A` | Draw arrow/connection |
| Line | `L` | Free line |
| Text | `T` | Insert text |
| Freehand | `P` | Freehand drawing (pen) |

---

## Example: Architecture Diagram

Create a system architecture diagram:

1. Create a new Excalidraw drawing
2. Draw rectangles for components (Frontend, Backend, DB)
3. Arrows for data flows between components
4. Text labels for descriptions
5. Colors for grouping (e.g. blue = Frontend, green = Backend)

### Typical Elements

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Frontend  │────▶│   Backend   │────▶│  Database   │
│   (React)   │◀────│   (Hono)    │◀────│ (Filesystem)│
└─────────────┘     └─────────────┘     └─────────────┘
        │                   │
        ▼                   ▼
┌─────────────┐     ┌─────────────┐
│   Browser   │     │   CouchDB   │
│   (Client)  │     │   (Sync)    │
└─────────────┘     └─────────────┘
```

---

## Example: Mindmap

Use Excalidraw for visual mindmaps:

1. Central topic in the middle (large rectangle/ellipse)
2. Main branches as arrows outward
3. Sub-topics as smaller elements
4. Color coding by category

---

## Embedding in Notes

Embed Excalidraw drawings in other notes:

```markdown
# Project Documentation

## Architecture

The following drawing shows the system architecture:

![[Architecture-Diagram.excalidraw]]

## Description

The system consists of three main components...
```

---

## File Format

Excalidraw saves drawings as `.excalidraw.md` files:

- **Markdown header** with frontmatter
- **JSON data** in the file body (Excalidraw format)
- Compatible with Excalidraw.com (import/export)

---

## Limitations in Slatebase

| Feature | Status |
|---------|--------|
| Basic drawing tools | Works |
| Shapes and arrows | Works |
| Text | Works |
| Colors and styles | Works |
| Export as PNG/SVG | Limited |
| Libraries | Not supported |
| Collaborative drawing | Not supported |

---

## Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+D` | Duplicate |
| `Ctrl+G` | Group |
| `Ctrl+Shift+G` | Ungroup |
| `Ctrl+]` | Bring to front |
| `Ctrl+[` | Send to back |
| `Ctrl+A` | Select all |
| `Delete` | Delete |

---

> [!tip] Excalidraw vs. Canvas
> **Excalidraw** is ideal for freehand drawings and diagrams. **Canvas** ([[Features/Canvas]]) is better for linked note cards and workflows. Use both complementarily.

> [!todo] Exercise
> 1. Install and activate the Excalidraw plugin
> 2. Create a new drawing (`Ctrl+P` → "Excalidraw")
> 3. Draw a simple diagram with 3 rectangles and arrows
> 4. Add text labels
> 5. Experiment with colors and styles
> 6. Create a note that embeds the drawing (`![[Drawing.excalidraw]]`)
> 7. Try the freehand drawing (Pen tool)

---

## Related Features

- [[Features/Canvas]] — Node-based whiteboard (alternative)
- [[Advanced/Canvas Workflows]] — Canvas for workflows
- [[Features/Embeds]] — Embed files in notes
- [[Advanced/Obsidian Plugins]] — Plugin basics
