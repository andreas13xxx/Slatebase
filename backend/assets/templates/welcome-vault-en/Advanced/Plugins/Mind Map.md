---
tags: [advanced, plugins]
---

# Mind Map Plugin

The Mind Map plugin turns a note's heading and list structure into an interactive, zoomable mind map — without requiring you to rewrite the note. Every heading level and every indentation level automatically becomes a node.

> [!warning] Plugin is probably broken
> The Mind Map plugin (`lynchjames/obsidian-mind-map`) hasn't been updated since 2024-02-25 and is confirmed broken by user reports on GitHub — it reportedly no longer works with current Obsidian versions (issue #117 "Doesn't work in latest version", 04/2025; issue #119 "Obsidian update", 09/2025). This is a problem with the plugin itself, unrelated to Slatebase's compatibility layer. Install it to experiment, but expect the mind map view to not open.

---

## Prerequisites

- Feature toggle `obsidian-plugin-compat` enabled
- Mind Map plugin installed and activated
- Plugin ZIP from GitHub: `obsidian-mind-map`

---

## Installation

1. Go to **Plugin Management** → **"Available Plugins"** tab and search for "Mind Map"
2. Click **Install**, then switch on the **activation toggle**

Not listed, or need a specific fork/version? Download the ZIP from GitHub instead and use **"Installed Plugins" → Upload Plugin**.

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

> [!warning] Plugin confirmed broken — nothing below actually opens
> Slatebase's compatibility layer emulates every API call this plugin makes (static analysis shows full coverage), so it isn't the source of the problem. But the plugin itself is confirmed broken against current Obsidian versions upstream, so in practice it fails to render a mind map at all — the table below describes what *would* work if the plugin's own bug were fixed, not what you can rely on today.

| Feature | Status |
|---------|--------|
| Plugin loads / mind map view opens | ⚠️ Confirmed broken upstream |
| Headings/lists as mind map nodes | Not usable — view doesn't open |
| Zoom, pan, collapse/expand | Not usable — view doesn't open |
| Clicking a node jumps to the source line | Not usable — view doesn't open |
| Export as PNG/SVG | Not usable — view doesn't open |
| Color themes from plugin settings | Not usable — view doesn't open |

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
