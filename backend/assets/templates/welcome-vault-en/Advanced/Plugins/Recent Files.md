---
tags: [advanced, plugins]
---

# Recent Files Plugin

Recent Files (`recent-files-obsidian`) adds a sidebar pane that tracks the notes you've opened most recently, so you can jump back to something without hunting through the file tree.

> [!tip] Fully compatible
> Static analysis shows every API call Recent Files makes is fully emulated by Slatebase's compatibility layer. It's rated fully compatible and actively maintained upstream.

---

## Prerequisites

- Feature toggle `obsidian-plugin-compat` enabled
- Recent Files plugin installed and activated
- Plugin ZIP from GitHub: `recent-files-obsidian`

---

## Installation

1. Go to **Plugin Management** → **"Available Plugins"** tab and search for "Recent Files"
2. Click **Install**, then switch on the **activation toggle**

Not listed, or need a specific fork/version? Download the ZIP from GitHub instead and use **"Installed Plugins" → Upload Plugin**.

---

## Core Features

- **Recent Files pane** — a sidebar view listing the notes you opened most recently, newest first
- **Jump back with one click** — select any entry to reopen that note
- **Pin entries** — pin a file so it stays in the list regardless of how long ago it was opened
- **Omit paths and extensions** — exclude specific folders or file types (e.g. a daily notes folder, image attachments) from being tracked, via plugin settings
- **List length limit** — cap how many entries the pane keeps

---

## Opening the Pane

Add the Recent Files view via the ribbon icon it registers, or through the Command Palette (`Ctrl+P` → "Recent Files: Open Recent Files"). The pane docks into the sidebar like any other view and updates automatically as you switch notes.

---

## Limitations in Slatebase

| Feature | Status |
|---------|--------|
| Recent Files sidebar pane | Works |
| Jump to a recent file | Works |
| Pin/unpin entries | Works |
| Omit paths/extensions in settings | Works |
| Plugin loads and activates | Works |

---

> [!tip] Built-in alternative
> Slatebase's own [[Features/Bookmarks]] view covers manually curated favorites. Recent Files complements it with an automatic, recency-based list you don't have to maintain by hand.

> [!todo] Exercise
> 1. Install and activate the Recent Files plugin
> 2. Open the Recent Files pane from the ribbon or Command Palette
> 3. Open a handful of different notes and watch the list update
> 4. Pin one entry so it stays at the top
> 5. Exclude a folder or extension in the plugin settings and confirm it disappears from the list

---

## Related Features

- [[Features/Bookmarks]] — Manually curated favorites and saved searches
- [[Features/Command Palette]] — Open the Recent Files pane without the ribbon
- [[Advanced/Obsidian Plugins]] — Plugin basics
