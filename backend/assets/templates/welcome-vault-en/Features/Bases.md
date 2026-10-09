---
tags: [features]
---

# Bases

Bases turn the metadata already in your vault into a live, filterable table. A `.base` file declares — in plain YAML — which notes to include, which properties to show as columns, how to sort them, and optional calculated columns (formulas). The result opens like any other file: a table where each row is a note and each cell can be edited in place.

Think of it as a saved, structured view over your notes — the database layer that sits on top of [[Features/Tags and Properties|tags and properties]].

> [!warning] Experimental / rolling out
> Bases is an in-progress feature (roadmap Prio 6). Depending on your Slatebase version it may be behind the `bases` feature toggle or not yet available. If the table doesn't render, your server either has the toggle off (ask an administrator — see [[Admin/Feature Toggles]]) or runs a version without Bases yet. The `.base` files themselves stay valid and portable either way.

---

## What a Base is made of

A `.base` file is Obsidian-compatible YAML with four parts:

| Part | What it does |
|------|--------------|
| **Filters** | Which notes appear — by property, tag, path, or file metadata, combined with AND/OR |
| **Properties** | Which columns to show and their display names |
| **Formulas** | Calculated columns (read-only), e.g. days until a deadline |
| **Views** | One or more named layouts (table first; cards/board are a later stage) |

---

## Opening and creating a Base

- **Open:** click a `.base` file in the [[Basics/File Explorer|File Explorer]], follow a wikilink to it, or find it in the Quick Switcher (`Ctrl+O`). It renders as a table, not as the Markdown editor.
- **Create:** run **"Create new base"** from the [[Features/Command Palette|Command Palette]] (`Ctrl+P`). An empty `.base` is created in the current folder.
- **Raw mode:** every Base has a raw-source view (edit the YAML directly) as a fallback and for fields the UI doesn't expose yet — the same idea as the Canvas source view.

---

## Filtering

Filters decide which notes become rows. You can combine conditions with AND/OR:

- **Property conditions** — equals, not-equals, contains, exists/empty, numeric and date comparisons (e.g. `priority == high`, `deadline < today`)
- **Tag conditions** — has / doesn't have a tag
- **Path conditions** — a `path:` glob, the same syntax as [[Features/Search and Replace|Search]]
- **File metadata** — name, created/modified date

The engine reads from the vault's live metadata index, so a Base updates automatically when you add, edit, delete, or rename notes — no need to reopen it.

---

## Formulas (calculated columns)

Formulas are read-only columns computed per row. The first version supports a deliberately small, documented set:

- Property references, string/number/boolean literals
- Comparisons (`== != < <= > >=`), basic arithmetic (`+ - * /`), string concatenation
- A handful of helpers: `if(...)`, `concat(...)`, `now()`/`today()`, a simple date difference, `length(...)`

> [!note] Not the full Obsidian formula language
> The first version is intentionally limited to simple expressions. Lambdas and list map/filter operations are a later stage. A formula never writes back into a note — it's display-only.

---

## Editing in the table

Property cells are editable inline, using the same typed controls as the [[Features/Tags and Properties|Properties editor]] — text, number, date/datetime, checkbox, list/tags. Editing a cell writes straight into that note's frontmatter and saves it. Formula columns are read-only.

A cell you have open isn't lost if the table rebuilds (because another cell changed, you switched tabs, or the Base refreshed) — whatever you typed is committed, the same safety net the Properties editor has.

Click a column header to sort; the chosen sort is written back into the `.base` file.

---

## Practical example

This vault ships a ready-made example: [[Features/Example Tasks (Base)]]. It filters a small set of task notes by status and shows a formula column. Open it to see a non-empty table, then:

1. Edit a `status` cell directly in the table — the change lands in the underlying note's frontmatter.
2. Click the **Priority** column header to sort.
3. Open the raw-source view to see the YAML behind the table.

---

> [!todo] Exercise
> 1. Open the example Base and change one note's `status` from the table.
> 2. Create a new note with a `status` and `priority` property, then reopen the Base — your note should appear as a new row.
> 3. Run **"Create new base"** from the Command Palette and build a tiny Base of your own that filters for one tag.

---

## Related Features

- [[Features/Tags and Properties]] — The metadata layer Bases build on
- [[Features/Search and Replace]] — The `path:`/`tag:`/`property:` operators Bases filters mirror
- [[Features/Context Panel]] — Per-note view of the same properties
- [[Advanced/Plugins/Dataview]] — The plugin-based alternative for querying notes
- [[Admin/Feature Toggles]] — Enable/disable Bases server-wide
