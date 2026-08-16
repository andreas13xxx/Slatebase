---
tags: [advanced, plugins]
---

# Mind Map Plugin

The Mind Map plugin turns a note's heading and list structure into an interactive, zoomable mind map — without requiring you to rewrite the note. Every heading level and every indentation level automatically becomes a node.

---

## Prerequisites

- Feature toggle `obsidian-plugin-compat` enabled
- Mind Map plugin installed and activated
- Plugin ZIP from GitHub: `obsidian-mind-map`

---

## Installation

1. Download plugin ZIP from GitHub
2. Settings → Vault → Plugins → "Install Plugin"
3. Upload ZIP → Activate

---

## Opening a Mind Map

### Via the Command Palette

1. Open the note you want to view as a mind map
2. `Ctrl+P` → "Mind Map: Open as Mind Map"
3. The mind map opens in a new tab

### Via the Ribbon Icon

After activation, a mind map icon appears in the toolbar — clicking it opens the mind map for the active note.

---

## How the Structure Translates

The plugin reads the note as an outline: headings (`#`, `##`, `###`, …) and indented list items become parent-child relationships in the tree.

```markdown
# Project Redesign

## Frontend
- New component library
- Dark mode
	- Define color palette
	- Contrast testing

## Backend
- API versioning
- Migration script

## Rollout
- Staging test
- Go-live date
```

Produces a mind map with "Project Redesign" as the root node, "Frontend"/"Backend"/"Rollout" as main branches, and the list items (including nested sub-items like "Dark mode") as further levels.

---

## Using the Mind Map View

| Action | Result |
|--------|--------|
| Scroll / Pinch | Zoom |
| Drag | Pan the view |
| Click a node | Collapse/expand its children |
| Click node text | Jumps to the corresponding line in the source note |

The mind map updates when you edit the source note and reload the view or reopen the note.

---

## Example: Brainstorming Structure

```markdown
# Content Strategy Q3

## Blog
- SEO optimization of existing articles
- New series: "Deep Dives"

## Video
- Tutorial series
	- Episode 1: Getting started
	- Episode 2: Advanced
- Short-form content for social media

## Newsletter
- Increase frequency to weekly
- Segment by interest
```

This kind of structure works especially well for mind maps because it's clearly hierarchical — unlike prose paragraphs, which don't produce meaningful nodes.

---

## Limitations in Slatebase

| Feature | Status |
|---------|--------|
| Headings/lists as mind map nodes | Works |
| Zoom, pan, collapse/expand | Works |
| Clicking a node jumps to the source line | Works |
| Export as PNG/SVG | Limited |
| Color themes from plugin settings | Works |

---

> [!tip] Structure first, mind map second
> The plugin only visualizes what's already there as an outline. Notes with clear heading levels and short bullet points produce far more useful mind maps than long prose paragraphs.

> [!todo] Exercise
> 1. Install and activate the Mind Map plugin
> 2. Open [[Advanced/Plugins/Example-Mind-Map]]
> 3. Open it as a mind map via the Command Palette
> 4. Collapse a branch and expand it again
> 5. Click a node and verify the jump to the source line
> 6. Add another heading with two bullet points to the source note and reopen the mind map

---

## Live Example

The following note is already structured as an outline and can be opened directly as a mind map once the plugin is activated:

→ [[Advanced/Plugins/Example-Mind-Map]]

---

## Related Features

- [[Features/Knowledge Graph]] — Visualize links between notes (a different perspective than a single note's outline)
- [[Features/Canvas]] — Free-form, non-hierarchical visualization
- [[Advanced/Obsidian Plugins]] — Plugin basics
