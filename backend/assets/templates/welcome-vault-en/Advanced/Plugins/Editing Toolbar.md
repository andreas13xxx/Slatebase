---
tags: [advanced, plugins]
---

# Editing Toolbar Plugin

Editing Toolbar adds a formatting bar above the editor — bold, italic, headings, lists, quotes, and more with a click, no need to memorize Markdown syntax. A floating selection toolbar also appears when you select text.

---

## Prerequisites

- Feature toggle `obsidian-plugin-compat` enabled
- Editing Toolbar plugin installed and activated
- Plugin ZIP from GitHub: `editing-toolbar`

---

## Installation

1. Go to **Plugin Management** → **"Available Plugins"** tab and search for "Editing Toolbar"
2. Click **Install**, then switch on the **activation toggle**

Not listed, or need a specific fork/version? Download the ZIP from GitHub instead and use **"Installed Plugins" → Upload Plugin**.

---

## Toolbar Variants

| Variant | When it's visible |
|---------|--------------------|
| Fixed toolbar | Always at the top of the editor |
| Selection toolbar | Appears floating as soon as text is selected |
| Ribbon icon | Shows/hides the toolbar from the sidebar |

---

## Typical Tools

| Tool | Effect |
|------|--------|
| Bold / Italic / Strikethrough | Wraps the selection with `**`, `*`, `~~` |
| Headings H1–H6 | Prefixes the line with `#` through `######` |
| Bullet / numbered list | Converts line(s) into list items |
| Quote | Prefixes the line with `>` |
| Code (inline / block) | Wraps with `` ` `` or ` ``` ` |
| Insert link | Opens a dialog, produces `[text](URL)` |
| Highlight | Wraps with `==...==` |
| Alignment | Inserts formatting callouts for links/images |

The exact set of tools can be adjusted in plugin settings (show/hide tools, reorder them).

---

## Sample Text to Try

Select individual words or whole sentences in the paragraph below and apply formatting via the selection toolbar — with the plugin active, the toolbar appears right next to your selection:

> This sentence is sample text for the Editing Toolbar. Select a word and make it bold. Select another part and make it italic. Turn this line into a heading. Insert a link somewhere.

---

## Ribbon and Fullscreen

The plugin also registers a ribbon icon to show/hide the toolbar, plus a "Workplace Fullscreen" mode that hides sidebars to give the editor more room.

---

## Limitations in Slatebase

| Feature | Status |
|---------|--------|
| Fixed toolbar above the editor | Works |
| Floating selection toolbar | Works |
| All standard formatting tools | Works |
| Ribbon icon to show/hide | Works |
| Workplace Fullscreen | Works (hides sidebars, not a real fullscreen window) |
| Custom tools via snippet configuration | Limited |

---

> [!tip] A good on-ramp
> Editing Toolbar is especially useful for users coming from traditional word processors who are still getting used to Markdown syntax. Over time, it's worth learning the keyboard-driven syntax (`**`, `##`, `>`) directly — it's usually faster than the toolbar.

> [!todo] Exercise
> 1. Install and activate the Editing Toolbar plugin
> 2. Select text in the sample paragraph above and format it bold and italic
> 3. Turn a line into a heading using the toolbar
> 4. Insert a link using the toolbar
> 5. Hide and re-show the fixed toolbar via the ribbon icon
> 6. Try the Workplace Fullscreen mode

---

## Related Features

- [[Basics/Markdown Syntax]] — The syntax the toolbar produces behind the scenes
- [[Features/Live Preview Editor]] — The editor mode the toolbar works in
- [[Advanced/Obsidian Plugins]] — Plugin basics
