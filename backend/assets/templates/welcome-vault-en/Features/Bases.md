---
tags: [features]
---

# Bases

Bases turn the metadata already in your vault into a live, filterable table. A `.base` file declares — in plain YAML — which notes to include, which properties to show as columns, how to sort them, and optional calculated columns (formulas). The result opens like any other file: a table or a Kanban board where each row or card is a note.

Think of it as a saved, structured view over your notes — the database layer that sits on top of [[Features/Tags and Properties|tags and properties]].

> [!warning] Experimental
> Bases is behind the `bases` feature toggle (off by default). If the table doesn't render, the toggle is off on your server — ask an administrator, see [[Admin/Feature Toggles]]. The file format is the **real Obsidian `.base` format**: a `.base` file from Obsidian opens here and vice versa. Not every Obsidian capability is implemented, though — the [[#Limits and gaps|list below]] says plainly what is missing.

---

## What a base is made of

| Part | Purpose |
|------|---------|
| **`filters`** | Which notes appear — as an expression, combinable with `and` / `or` / `not` |
| **`properties`** | Display names of the columns |
| **`formulas`** | Calculated columns (read-only), e.g. days until a deadline |
| **`views`** | One or more named views: **table** or **cards** (Kanban), each with its own column order, sort, filter and `limit` |
| **`summaries`** | Per-column summaries — read and preserved on save, but not computed yet (see limits) |

---

## Opening and creating a base

- **Open:** Click a `.base` file in the [[Basics/File Explorer|File Explorer]], follow a wikilink to it, or find it in the quick switcher (`Ctrl+O`). It renders as a view, not a Markdown editor. This also works inside a split pane.
- **Create:** Run **"Create new Base"** from the [[Features/Command Palette|Command Palette]] (`Ctrl+P`).
- **Raw source:** Every base has a raw-source mode (edit the YAML directly) — useful for anything the UI doesn't expose.

---

## Filtering

A filter condition is an **expression written as text** — the same language as in Obsidian. Combine several with `and`, `or` and `not` (each takes a list):

```yaml
filters:
  and:
    - file.inFolder("Projects")
    - 'status != "done"'
    - or:
        - file.hasTag("important")
        - 'priority > 2'
```

What you can use in conditions:

- **Properties** — `status`, `priority`, `note.status` (the note's frontmatter)
- **File fields** — `file.name`, `file.ext`, `file.folder`, `file.tags`, `file.links`, `file.ctime`, `file.mtime`
- **File checks** — `file.hasTag("x")`, `file.inFolder("folder")`, `file.hasLink("note")`
- **Comparison and logic** — `==  !=  <  <=  >  >=`, `&&  ||  !`, arithmetic with `+ - * / %`
- **Methods** on text, numbers, dates and lists, e.g. `title.contains("Plan")`, `deadline < today()`

A filter on a **view** is applied in addition to the base-wide filter (AND). A condition that cannot be evaluated (typo, unknown function) excludes the note — it does not break the table.

The base refreshes automatically when you add, edit, delete or rename notes.

---

## Formulas (calculated columns)

Formulas live under `formulas:` and are read-only columns computed per row. They use the same expression language as filters. In columns and sorting they are called `formula.name`; a formula can refer to another (`formula.other`).

```yaml
formulas:
  days_left: 'days(date(deadline), today())'
```

**Built-in functions:** `if`, `concat`, `now`, `today`, `date`, `number`, `list`, `link`, `min`, `max`, `days`, `length`.

**Methods:**

| Type | Methods |
|------|---------|
| Text | `contains`, `startsWith`, `endsWith`, `lower`, `upper`, `trim`, `replace`, `split`, `length` |
| Number | `toFixed`, `round`, `abs` |
| Date | `format`, `date`, `time`, plus `year`, `month`, `day`, `hour`, `minute`, `second` |
| List | `contains`, `length`, `join`, `first`, `last` |

> [!note] Date difference
> `date1 - date2` returns **milliseconds** (as in Obsidian). Use `days(a, b)` when you want days.

---

## Editing in the table

Property cells are editable inline, using the same typed controls as the [[Features/Tags and Properties|Properties editor]] — text, number, date, checkbox, list/tags. A change goes straight into the note's frontmatter. Formula columns are read-only.

Click a column header to sort; the sort is written back into the `.base` file.

---

## Views: table and cards (Kanban)

A base can hold several views; a view switcher appears at the top.

- **Table** — one row per note, editable cells.
- **Cards (Kanban)** — notes grouped into columns by a property. Each value becomes a column; notes without a value land in a "No …" column. Columns collapse, and clicking a card opens the note.
  **Drag a card to another column** to change the grouping property's value in the note; dropping on "No …" removes the property. (Requires write access to the vault.)

```yaml
views:
  - type: table
    name: All tasks
    order: [file.name, status, priority]
    limit: 50
  - type: cards
    name: Board
    groupBy:
      property: status
      direction: ASC
    order: [file.name, priority]
```

`limit` caps a view's rows — applied **after** filtering.

Other view types come from Obsidian plugins.

---

## Limits and gaps

So nothing surprises you:

**Data volume**
- Each query returns **at most 1000 notes** from the index as candidates (in the view's sort order); filtering happens afterwards. In very large vaults a base can therefore miss matches beyond those 1000 — even a filter like `file.inFolder(...)` does not shrink that pool, because it only applies afterwards.

**Expression language**
- This is a **pragmatic subset** of Obsidian's functions (see the lists above), not the full library. An unknown function yields `#ERR` in a formula column and drops the note in a filter.
- **No lambdas** and no `map`/`filter` operations on lists.
- Unsupported file fields: `file.path`, `file.size`, `file.backlinks`, `file.embeds`.

**Formulas and summaries**
- Formula columns are **read-only** and **cannot be sorted** (sorting only works for properties, `file.name`, `file.ctime`, `file.mtime`).
- **`summaries` are not computed:** the block is read and preserved unchanged on save, but no summary row is shown.

**Views**
- Only **table** and **cards** are built in; anything else needs a plugin. Plugin views run in the browser only, never on the server.
- A base **cannot be embedded as a code block in a note**, only opened as its own `.base` file.
- Obsidian's "add item to base" command (`bases:add-item`) is missing: create new notes yourself; they appear as soon as they match the filter.

**AI access via MCP**
- The `query_base` tool evaluates a `.base` server-side with the same engine ([[Advanced/MCP Context Server|MCP interface]] for AI clients). It has the same 1000-note limit, returns 100 rows by default (maximum 1000) and returns formula values as text.

---

## Worked example

This vault ships a ready-made example: [[Features/Example Tasks (Base)]]. It filters a small set of task notes with `file.inFolder(...)` and `type == "task"` and shows a "Days left" formula column. Open it, then:

1. Edit a `status` cell directly in the table — the change lands in the note's frontmatter.
2. Click the **Priority** column header to sort.
3. Open raw-source mode to see the YAML behind the table.

---

> [!todo] Exercise
> 1. Open the example base and change a note's `status` from the table.
> 2. Create a new note with `type: task`, `status` and `priority` in the example tasks folder — it should appear as a new row.
> 3. Run **"Create new Base"** and build a small base of your own with the filter `file.hasTag("features")`.
> 4. Add a second view `type: cards` with `groupBy: { property: status }` and drag a card to another column.

---

## Related features

- [[Features/Tags and Properties]] — The metadata layer Bases build on
- [[Features/Search and Replace]] — The `path:`/`tag:`/`property:` operators
- [[Features/Context Panel]] — Per-note view of the same properties
- [[Advanced/Plugins/Dataview]] — The plugin-based alternative for querying notes
- [[Admin/Feature Toggles]] — Switch Bases on/off server-wide
