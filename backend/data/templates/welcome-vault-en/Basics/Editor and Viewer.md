---
tags:
  - basics
---

# Editor and Viewer

Slatebase has two modes for working with your notes: **Edit mode** for writing Markdown, and **View mode** for seeing the formatted result.

![[Screenshots/editor-toolbar.png]]

*Editor with toolbar in edit mode*

---

## Edit Mode

In Edit mode you see the raw Markdown text. This is where you write and edit your notes.

### Features

- **Toolbar** — Buttons for common formatting (bold, italic, heading, list, link, code)
- **Line Numbers** — Optional line numbers on the left (toggle in Settings)
- **Auto-Save** — Your changes are saved automatically after a short pause
- **Undo/Redo** — `Ctrl+Z` to undo, `Ctrl+Shift+Z` to redo

### Save Indicator

The tab shows a dot when there are unsaved changes:
- **No dot** = file is saved
- **Dot on tab name** = unsaved changes (auto-save will handle it shortly)

---

## View Mode

![[Screenshots/viewer-formatiert.png]]

*Formatted view in view mode*

In View mode you see the rendered Markdown — headings are larger, bold text is bold, lists have bullets, and wikilinks are clickable.

### Features

- **Clickable links** — Wikilinks and external links are interactive
- **Rendered formatting** — Tables, code blocks, callouts, and diagrams are displayed
- **Syntax highlighting** — Code blocks show colored syntax
- **Collapsible headings** — Click on headings to collapse/expand sections

---

## Switching Modes

| Method | Description |
|--------|-------------|
| Toolbar button | Eye icon (view) / Pencil icon (edit) |
| Keyboard shortcut | `Ctrl+E` toggles between modes |

---

## Toolbar Functions

The edit toolbar provides quick access to formatting:

| Button | Action | Markdown |
|--------|--------|----------|
| **B** | Bold | `**text**` |
| *I* | Italic | `*text*` |
| H | Heading | `## text` |
| List | Bullet list | `- item` |
| 1. | Numbered list | `1. item` |
| ☑ | Checklist | `- [ ] item` |
| Link | Wikilink | `[[target]]` |
| Code | Code block | `` `code` `` |

---

## Image Paste

You can paste images directly from the clipboard:

1. Copy an image (screenshot, from browser, etc.)
2. In Edit mode, press `Ctrl+V`
3. The image is uploaded to the vault and an embed link is inserted

---

## Step by Step: Your First Edit

1. Open a file (or create a new one)
2. You're in Edit mode — write some Markdown
3. Press `Ctrl+E` to switch to View mode
4. Check that the formatting looks correct
5. Press `Ctrl+E` again to return to Edit mode

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

Then switch to View mode to see it rendered.

---

> [!todo] Exercise
> 1. Open this file in Edit mode (if not already)
> 2. Notice the Markdown syntax (the `#`, `**`, etc.)
> 3. Switch to View mode with `Ctrl+E`
> 4. Click on one of the wikilinks below to navigate
> 5. Use `Ctrl+Z` to undo any accidental changes

---

## Related Pages

- [[Basics/Markdown Syntax|Markdown Syntax]] — The formatting language
- [[Basics/Navigation and Tabs|Navigation and Tabs]] — Previous guide
- [[Features/Live Preview Editor|Live Preview Editor]] — Source mode and inline Live Preview in one editor
- [[Features/Embeds|Embeds]] — Embedding images and files
- [[Features/Templates and Daily Notes|Templates and Daily Notes]] — Reusable templates
