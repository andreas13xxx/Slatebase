---
tags: [advanced, plugins]
---

# Outliner Plugin

Outliner (`obsidian-outliner`) upgrades Slatebase's plain bullet lists into a proper outline editor — moving, indenting, and folding whole branches of a list as a single unit instead of line by line.

> [!tip] Fully compatible
> Static analysis shows every API call Outliner makes is fully emulated by Slatebase's compatibility layer. It's rated fully compatible and actively maintained upstream.

---

## Prerequisites

- Feature toggle `obsidian-plugin-compat` enabled
- Outliner plugin installed and activated
- Plugin ZIP from GitHub: `obsidian-outliner`

---

## Installation

1. Go to **Plugin Management** → **"Available Plugins"** tab and search for "Outliner"
2. Click **Install**, then switch on the **activation toggle**

Not listed, or need a specific fork/version? Download the ZIP from GitHub instead and use **"Installed Plugins" → Upload Plugin**.

---

## Core Features

- **Move whole branches** — drag or use hotkeys to move a bullet along with all of its children in one step
- **Indent/outdent as a unit** — Tab/Shift+Tab re-nests an entire sub-list, not just the current line
- **Zoom into a list item** — focus on one branch of the outline at a time
- **Fold/unfold branches** — collapse children to see just the top-level structure

---

## Limitations in Slatebase

| Feature | Status |
|---------|--------|
| Core outlining (move, indent/outdent, zoom, fold) | Works |
| Plugin loads and activates | Works |
| Optional Vim `o`/`O` key override | Not functional |

> [!info] About the Vim key override
> Outliner has an optional setting that overrides how the `o`/`O` keys behave in Obsidian's Vim mode. It checks for `window.CodeMirrorAdapter.Vim`, which Slatebase provides only as a non-crashing stub (Slatebase has no real Vim-keymap engine behind it) — so this one optional integration silently does nothing, while the rest of the plugin runs normally.

---

> [!todo] Exercise
> 1. Install and activate the Outliner plugin
> 2. Create a nested bullet list with two or three levels
> 3. Move a parent bullet and confirm its children move with it
> 4. Zoom into one branch, then zoom back out
> 5. Fold a branch and unfold it again

---

## Related Features

- [[Advanced/Obsidian Plugins]] — Plugin basics
- [[Advanced/Plugins/Kanban]] — Another list-based, drag-driven plugin
