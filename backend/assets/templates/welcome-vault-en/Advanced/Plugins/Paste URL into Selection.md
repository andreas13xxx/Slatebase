---
tags: [advanced, plugins]
---

# Paste URL into Selection

Paste URL into Selection (`url-into-selection`) is a small quality-of-life plugin: select some text, paste a URL from the clipboard, and it turns the selection into a proper Markdown link — instead of overwriting your text with the raw URL.

> [!tip] Fully compatible
> Static analysis shows every API call this plugin makes is fully emulated by Slatebase's compatibility layer. It's rated fully compatible and actively maintained upstream.

---

## Prerequisites

- Feature toggle `obsidian-plugin-compat` enabled
- Paste URL into Selection plugin installed and activated
- Plugin ZIP from GitHub: `obsidian-url-into-selection`

---

## Installation

1. Go to **Plugin Management** → **"Available Plugins"** tab and search for "Paste URL into selection"
2. Click **Install**, then switch on the **activation toggle**

Not listed, or need a specific fork/version? Download the ZIP from GitHub instead and use **"Installed Plugins" → Upload Plugin**.

---

## Core Features

- **Select, then paste a link** — highlight any text, paste a URL over it, and it becomes `[selected text](url)` instead of replacing the selection with the raw URL
- **Normal paste is unaffected** — pasting without a selection, or pasting clipboard content that isn't a URL, still works exactly as before
- **Configurable URL detection** — plugin settings let you adjust the regex used to decide whether clipboard content counts as a URL

---

## Example

1. Write a sentence: `Check out the documentation for details.`
2. Select the word `documentation`
3. Copy a URL (e.g. `https://example.com/docs`) and paste it over the selection
4. Result: `Check out the [documentation](https://example.com/docs) for details.`

---

## Limitations in Slatebase

| Feature | Status |
|---------|--------|
| Wrap selection with pasted URL | Works |
| Regular paste (no selection / non-URL content) | Works |
| Custom URL regex in settings | Works |

---

> [!tip] Built-in alternative
> Slatebase's own **Insert Link** editor command (Command Palette → "Insert Link", see [[Features/Live Preview Editor]]) wraps a selection as `[text](url)` too, then places the cursor on "url" for typing. Paste URL into Selection saves that last step whenever the link is already on your clipboard.

> [!todo] Exercise
> 1. Install and activate the Paste URL into Selection plugin
> 2. Write a short sentence and select a word or phrase in it
> 3. Copy a URL and paste it over the selection
> 4. Confirm it turned into a Markdown link instead of overwriting your text

---

## Related Features

- [[Features/Live Preview Editor]] — Built-in Insert Link command
- [[Advanced/Obsidian Plugins]] — Plugin basics
