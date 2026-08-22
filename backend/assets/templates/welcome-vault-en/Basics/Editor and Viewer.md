---
tags:
  - basics
---

# Editor and Viewer

Slatebase has two modes for working with your notes: **Source mode** for seeing raw Markdown, and **Live Preview mode** for an inline-formatted editing experience. Both modes are full editors — you can write and edit in both.

![[Screenshots/editor-toolbar.png]]

*Editor in edit mode*

---

## Source Mode

In Source mode you see the raw Markdown text with syntax highlighting. All markers stay visible at all times.

### Features

- **Line Numbers** — Optional line numbers on the left (toggle in Settings)
- **Auto-Save** — Your changes are saved automatically after a short pause
- **Undo/Redo** — `Ctrl+Z` to undo, `Ctrl+Shift+Z` to redo

**When to use:** For complex formatting, tables, or when you need full control over the syntax.

### Save Indicator

The tab shows a dot when there are unsaved changes:
- **No dot** = file is saved
- **Dot on tab name** = unsaved changes (auto-save will handle it shortly)

---

## Live Preview Mode

![[Screenshots/viewer-formatiert.png]]

*Formatted inline editing in Live Preview mode*

In Live Preview mode your Markdown is **rendered inline** while you type — headings appear in the correct size, links are clickable, images are displayed. When the cursor touches a formatted area, the Markdown markers are automatically revealed so you can edit them.

### Features

- **Inline formatting** — Headings, bold, italic, links rendered as you type
- **Clickable links** — Wikilinks and external links are interactive
- **Rendered content** — Tables, code blocks, callouts, and diagrams are displayed
- **Syntax highlighting** — Code blocks show colored syntax
- **Cursor-reveal** — Markers become visible when the cursor is nearby

> [!info] Live Preview Editor
> The Live Preview mode is a full-featured editor powered by CodeMirror 6. For details on all capabilities (Vim mode, image paste, Mermaid rendering, and more), see [[Features/Live Preview Editor|Live Preview Editor]].

**When to use:** For everyday writing when you want to see the result immediately.

---

## Switching Modes

| Method | Action |
|--------|--------|
| Keyboard shortcut | `Ctrl+E` toggles between modes |
| Command Palette | `Ctrl+P` → "Toggle editor mode" |

> [!info] Formatting Toolbar via Plugin
> Slatebase itself has no fixed toolbar above the editor — you format directly with Markdown syntax (`**bold**`, `## heading`, and so on). If you'd rather click than type syntax, install the [[Advanced/Plugins/Editing Toolbar|Editing Toolbar Plugin]].

---

## Image Paste

You can paste images directly from the clipboard:

1. Copy an image (screenshot, from browser, etc.)
2. In Edit mode, press `Ctrl+V`
3. The image is uploaded to the vault and an embed link is inserted

---

## Step by Step: Your First Edit

1. Open a file (or create a new one)
2. You're in Source mode — write some Markdown
3. Press `Ctrl+E` to switch to Live Preview mode
4. Check that the formatting looks correct — and keep editing
5. Press `Ctrl+E` again to return to Source mode

---

## Practical Example

Write the following in a new file:

```markdown
# My Note

This is **important** information.

## Tasks

- [x] Learn Markdown
- [ ] Create my first link
- [ ] Explore the graph

> [!tip] Remember
> Notes are saved automatically!
```

Then switch to Live Preview mode to see it rendered inline.

---

> [!todo] Exercise
> 1. Open this file in Source mode (if not already)
> 2. Notice the Markdown syntax (the `#`, `**`, etc.)
> 3. Switch to Live Preview mode with `Ctrl+E`
> 4. Notice how you can still type — the formatting updates live
> 5. Click on one of the wikilinks below to navigate
> 6. Use `Ctrl+Z` to undo any accidental changes

---

> [!tip] Best Practice
> In Live Preview mode you see the result as you type. For complex tables or nested syntax, Source mode is clearer. Both modes are full editors — you don't lose any functionality.

---

## Related Pages

- [[Basics/Markdown Syntax|Markdown Syntax]] — The formatting language
- [[Basics/Navigation and Tabs|Navigation and Tabs]] — Previous guide
- [[Features/Live Preview Editor|Live Preview Editor]] — Source mode and inline Live Preview in one editor
- [[Features/Embeds|Embeds]] — Embedding images and files
- [[Features/Templates and Daily Notes|Templates and Daily Notes]] — Reusable templates
- [[Advanced/Plugins/Editing Toolbar|Editing Toolbar Plugin]] — Click-based formatting toolbar
