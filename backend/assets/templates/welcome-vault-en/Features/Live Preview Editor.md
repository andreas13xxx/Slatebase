---
tags: [features]
---

# Live Preview Editor

The Live Preview Editor combines editing and previewing into a single view. Markdown syntax is rendered inline as you type — headings, bold/italic text, links, callouts and more appear formatted instantly. When your cursor enters a formatted area, the Markdown markers become visible so you can edit them.

---

## The Two Modes

### Source Mode

The classic editor — you see raw Markdown text with syntax highlighting. All Markdown markers (`#`, `**`, `[[...]]`) remain visible at all times.

**When to use:** Complex formatting, tables, or when you need full control over the syntax.

### Live Preview Mode

Markdown is rendered inline. Headings appear at the correct size, links become clickable, images are displayed embedded. When the cursor moves into a formatted region, markers are automatically revealed.

**When to use:** Normal writing and when you want to see the result immediately.

---

## Switching Modes

| Method | Action |
|--------|--------|
| Toolbar | Click the mode icon (source/preview) |
| Keyboard shortcut | `Ctrl+E` (Source ↔ Live Preview) |
| Command Palette | `Ctrl+P` → "Toggle editor mode" |

---

## Inserting Images

### From Clipboard

1. Copy an image to clipboard (screenshot, image from browser)
2. Press `Ctrl+V` in the editor
3. The image is automatically saved to the vault and inserted as an embed

### Via Drag & Drop

1. Drag an image file from your desktop or file explorer into the editor
2. Drop it — the file is uploaded and an embed link is inserted

---

## Editor Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+B` | Bold |
| `Ctrl+I` | Italic |
| `Ctrl+K` | Insert link |
| `Ctrl+E` | Toggle mode (Source ↔ Live Preview) |
| `Ctrl+Z` | Undo |
| `Ctrl+Shift+Z` | Redo |
| `Ctrl+D` | Duplicate line |
| `Tab` | Indent |
| `Shift+Tab` | Outdent |

---

## Vim Mode

An optional Vim mode is available for experienced Vim users. Enable it via Settings (Ctrl+,) → Appearance → Vim Mode.

In Vim mode, the familiar modes (Normal, Insert, Visual) and commands are available.

---

## Notes

- **Large files:** Files exceeding 50,000 characters automatically switch to Source mode (performance protection).
- **Feature toggle:** Live Preview mode can be disabled under Settings → Feature Toggles. The editor then functions as a pure Source editor.
- **Full Obsidian syntax:** Wikilinks, embeds, callouts, tags, and Mermaid diagrams are all rendered correctly in Live Preview.

---

## What Gets Rendered in Live Preview?

| Element | Example | Rendering |
|---------|---------|-----------|
| Headings | `## Title` | Font size + markers hidden |
| Bold/Italic | `**bold**` / `*italic*` | Formatted, markers hidden |
| Strikethrough | `~~text~~` | Strikethrough |
| Highlight | `==text==` | Colored background |
| Inline code | `` `code` `` | Monospace styling |
| Links | `[text](url)` | Clickable (Ctrl+Click) |
| Wikilinks | `[[Page]]` | Clickable, brackets hidden |
| Embeds | `![[image.png]]` | Inline image |
| Standard images | `![alt](url)` | Inline image |
| Checkboxes | `- [x] done` | Clickable checkbox |
| Tables | Pipe syntax | HTML table |
| Code blocks | ` ```js ` | Fences hidden, background |
| Mermaid | ` ```mermaid ` | SVG diagram |
| Block quotes | `> text` | Border-left, prefix hidden |
| Callouts | `> [!tip]` | Colored box with icon |
| Horizontal rule | `---` | Rendered divider line |

> [!info] Cursor Reveal
> All hidden markers become visible immediately when the cursor touches the formatted area. This preserves full control over the syntax.
