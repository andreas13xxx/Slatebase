---
tags: [features]
---

# Bookmarks

Files marked with the star icon (**favorites**) are the simple case — Slatebase also has a dedicated **Bookmarks** view in the left sidebar where you sort, rename, and manage those favorites. The Command Palette adds three more bookmark types on top: headings, text blocks, and saved searches.

---

## Opening the Bookmarks View

1. Click the **Bookmarks** tab (star icon) in the left sidebar
2. All bookmarks for the current vault appear as a list

---

## Reordering

Drag an entry to the position you want:

1. Click and hold an entry in the bookmarks list
2. Drag it up or down
3. An insertion marker shows the drop target
4. Release to save the new order

Dropping outside the list leaves the original order unchanged.

---

## Context Menu

Right-click (or the context-menu key / `Shift+F10` while an entry is focused) opens a menu with:

| Option | Effect |
|--------|--------|
| Rename | Set a custom display label (see below) |
| Show in File Explorer | Switches to the File Explorer and highlights the file (not available for search bookmarks) |
| Remove from Favorites | Deletes the entry |

---

## Custom Display Labels

A filename like `2026-Q1-planning-final-v3.md` isn't a great bookmark label. Use **Rename** in the context menu to set your own:

1. Right-click the entry → **Rename**
2. Type the new name, `Enter` to confirm
3. `Escape` cancels without changes

Typing the original filename back in removes the custom label — the file automatically shows its real name again. The actual path stays visible as a tooltip on hover.

---

## More Bookmark Types (Command Palette)

The [[Features/Command Palette|Command Palette]] (`Ctrl+P`) has four additional bookmark commands, using Obsidian's own command names:

| Command | Effect |
|---------|--------|
| `Bookmarks: Bookmark heading under cursor...` | Bookmarks the nearest heading above the cursor |
| `Bookmarks: Bookmark block under cursor...` | Bookmarks the paragraph under the cursor as a text block (inserts a block ID `^abc123` at the end of the paragraph if needed) |
| `Bookmarks: Bookmark current search...` | Saves the current search query along with its case-sensitive/regex flags |
| `Bookmarks: Bookmark all tabs...` | Bookmarks every currently open file tab (already-bookmarked tabs are skipped) |

These bookmarks show up in the Bookmarks view with their own icon:

- **Heading bookmarks** — open the file
- **Block bookmarks** — open the file
- **Search bookmarks** — open the search panel and run the saved query immediately

> [!tip] Limit
> Up to 50 bookmarks are allowed per vault in total, regardless of type.

---

## Practical Example

You're working on a longer research project:

1. Open your main overview file and star it
2. Switch to the Bookmarks view and rename it to "📌 Project Overview"
3. Open a long source file, place the cursor under a relevant heading, and run `Bookmarks: Bookmark heading under cursor...`
4. Search the vault for a recurring term and save the search with `Bookmarks: Bookmark current search...`
5. Drag the overview bookmark to the top of the list

---

> [!todo] Exercise
> Star two files in this vault. Switch to the Bookmarks view, rename one of them, and drag it to the first position.

---

## Related Features

- [[Basics/File Explorer|File Explorer]] — The star icon for bookmarking lives here
- [[Features/Command Palette|Command Palette]] — Access to the four additional bookmark types
- [[Features/Search and Replace|Search and Replace]] — The basis for search bookmarks
