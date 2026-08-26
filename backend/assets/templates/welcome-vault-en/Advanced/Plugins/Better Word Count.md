---
tags: [advanced, plugins]
---

# Better Word Count Plugin

Better Word Count (`better-word-count`) replaces the status bar display with more detailed writing statistics — words, characters, sentences, reading time, and more, either for the whole document or just the current selection.

> [!tip] Fully compatible
> Manually tested with the real, GitHub-loaded bundle — runs in Slatebase without limitations.

---

## Prerequisites

- Feature toggle `obsidian-plugin-compat` enabled
- Better Word Count plugin installed and activated
- Plugin ZIP from GitHub: `better-word-count`

---

## Installation

1. Go to **Plugin Management** → **"Available Plugins"** tab and search for "Better Word Count"
2. Click **Install**, then switch on the **activation toggle**

Not listed, or need a specific fork/version? Download the ZIP from GitHub instead and use **"Installed Plugins" → Upload Plugin**.

---

## Core Features

- **Extended status bar statistics** — word count, character count (with/without spaces), sentence count, estimated reading time, and page count
- **Selection-based counting** — once text is selected, the status bar shows counts for the selection instead of the whole document
- **Configurable display** — choose which statistics are visible and in what order via plugin settings
- **Words-per-page setting** — adjust the basis used for the page count estimate

---

## Limitations in Slatebase

| Feature | Status |
|---------|--------|
| Status bar statistics (words/characters/sentences/reading time) | Works |
| Selection-based counting | Works |
| Settings (displayed statistics, order) | Works |
| Plugin loads and activates | Works |

---

> [!tip] Built-in alternative
> Slatebase's own status bar already shows word and character counts including selection stats (see [[Features/Status Bar]]). Better Word Count adds sentences, reading time, and page count, plus finer configurability.

> [!todo] Exercise
> 1. Install and activate the Better Word Count plugin
> 2. Open a longer note and observe the extended status bar display
> 3. Select a portion of text and watch the numbers switch to the selection
> 4. Adjust which statistics are shown in the plugin settings

---

## Related Features

- [[Features/Status Bar]] — Slatebase's built-in word/character count
- [[Advanced/Obsidian Plugins]] — Plugin basics
