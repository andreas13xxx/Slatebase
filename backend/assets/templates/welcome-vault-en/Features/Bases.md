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
| **`views`** | One or more named views: **table**, **cards** (Kanban), **list** or **map**, each with its own column order, sort, filter and `limit` |
| **`summaries`** | Per-column summaries (sum, count, average, min/max …) — under the table or in the Kanban header |

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
- **File fields** — `file.name`, `file.basename`, `file.path`, `file.ext`, `file.folder`, `file.tags`, `file.links`, `file.ctime`, `file.mtime`
- **File checks** — `file.hasTag("x")`, `file.inFolder("folder")`, `file.hasLink("note")`
- **Comparison and logic** — `==  !=  <  <=  >  >=`, `&&  ||  !`, arithmetic with `+ - * / %`. `a || "x"` yields the value of `a`, or the fallback `"x"`. A missing property is never comparable with `<`, `>` etc. (the result is false). Minus needs no spaces (`end-start`); write a property with a hyphen as `note["due-date"]`
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

## Summaries (`summaries`)

Each column can show a summary over the displayed rows. It lives under the view's `summaries:` as `column: function` and appears as a row under the table, or as a bar above the Kanban board.

```yaml
views:
  - type: table
    name: Tasks
    order: [file.name, status, estimate]
    summaries:
      file.name: Count
      estimate: Sum
```

Built-in functions (as in Obsidian):

| Applies to | Functions |
|------------|-----------|
| All types | `Count`, `Empty`, `Filled`, `Unique` |
| Numbers | `Sum`, `Average`, `Min`, `Max`, `Median`, `Range`, `Stddev` |
| Dates | `Earliest`, `Latest`, `Range` |
| Checkbox | `Checked`, `Unchecked` |

A numeric function on a non-numeric column yields an empty value, not an error. Custom summaries written as a formula over `values` (lambdas) are not implemented.

---

## Editing in the table

Property cells are editable inline, using the same typed controls as the [[Features/Tags and Properties|Properties editor]] — text, number, date, checkbox, list/tags. A change goes straight into the note's frontmatter. Formula columns are read-only.

Click a column header to sort; the sort is written back into the `.base` file. This also works for formula columns — they are sorted after loading by their computed values.

---

## Views: table, cards, list and map

A base can hold several views; a view switcher appears at the top.

- **Table** — one row per note, editable cells.
- **Cards (Kanban)** — notes grouped into columns by a property. Each value becomes a column; notes without a value land in a "No …" column. Columns collapse, and clicking a card opens the note.
  **Drag a card to another column** to change the grouping property's value in the note; dropping on "No …" removes the property. (Requires write access to the vault.)
- **List** (`type: list`) — a simple read-only list with one entry per note, no grouping. Formula columns are evaluated, and summaries appear as a bar above the list.
- **Map** (`type: map`) — notes with geo coordinates as pins on a map; clicking a pin opens the note. Slatebase reads the coordinate from the view option `coordinates` (or `location`) as a property holding `"lat,lng"`, or from two numeric properties `latProperty` and `lngProperty` (also `lat`/`lng`/`longitude`). Notes without a readable coordinate are not plotted; a counter shows how many were skipped. The map tiles come from a server the operator sets (`SLATEBASE_MAP_TILE_URL`); without one the view only shows a notice that it is inactive.

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

## Embedding a base and adding items

- **Embed:** write `![[My Base.base]]` in a note. In reading mode and Live Preview the base renders as a read-only table inside the note — handy for a dashboard that shows several bases side by side.
- **Embed a specific view:** `![[My Base.base#View name]]` shows the view with that name instead of the first. If the name does not exist you get "Ansicht nicht gefunden" (view not found) — it never silently falls back to the first view. The example here shows the "Open tasks" view of the example table:

  ![[Features/Example Tasks (Base).base#Open tasks]]

- **Inline as a code block:** a ```` ```base ```` block holds the base's YAML right in the note, no separate `.base` file needed. Run **"Bases: Insert new base"** from the [[Features/Command Palette|Command Palette]] to insert a skeleton at the cursor. The note then shows the same read-only table; in Live Preview the raw text appears as soon as you click into the block. On a [[Features/Public Links|public share]] and while the `bases` feature toggle is off, the block stays as code; the command then inserts nothing and points to the toggle.
- **Add an item:** run **"Bases: Add item"** from the [[Features/Command Palette|Command Palette]] while a base is open. Slatebase creates a new note in the base's scope — the target folder comes from a `file.inFolder(...)` filter (else the vault root), and the displayed properties are prepared as blank frontmatter fields (a `property == "x"` filter pre-fills the value). The note opens and appears as a new row.

---

## `this`: filters relative to the note

In filters and formulas, `this` stands for the note the base is embedded in — as in Obsidian. The same base can therefore show something different in every note:

- `this.file.name`, `this.file.path`, `this.file.folder`, `this.file.tags`, `this.file.size` … — the file fields of the embedding note
- `this.status` (or `this.note.status`) — a property from its frontmatter
- `this.file` on its own is the note itself and works as the argument of `file.hasLink(...)`

The classic example is a note's **backlinks**: all notes that link to this note. The block below sits right in this page, so it lists every note that points to "Bases":

```base
filters: file.hasLink(this.file)
properties:
  file.name:
    displayName: "Links to Bases"
views:
  - type: table
    name: "Links"
    order:
      - file.name
```

When the base is opened as its **own `.base` file**, `this` is the base file itself. If no note is known, `this.…` is empty — a row that depends on it is excluded, never wrongly kept.

> [!note] Names and duplicates
> `file.hasLink(this.file)` compares the link as written in the note (`Plan`, `Projects/Plan`) with the host note's path — with or without `.md`, in full or as the path's tail. If two files share a name in different folders, a link to the short name can match both.

---

## Limits and gaps

So nothing surprises you:

**Data volume**
- Each query examines **up to 5000 notes** from the index as candidates. Where possible, Slatebase pushes the cheaply-checkable parts of your filter (property equality, `file.hasTag`, `file.inFolder`) **ahead of** that cap, so it rarely reaches real matches. If it is exceeded anyway, the view shows a visible "result truncated" notice — never a silent cut.

**Expression language**
- This is a **pragmatic subset** of Obsidian's functions (see the lists above), not the full library. An unknown function yields `#ERR` in a formula column and drops the note in a filter.
- **No lambdas** and no `map`/`filter` operations on lists (this also means custom `summaries` written as a formula).
- Unsupported: `file.embeds`. `file.size` and `file.backlinks` ARE supported.

**Lists vs. single values**
- The index hands over every property as a list. A property that has **more than one value somewhere** in your vault — or is declared as a list/tags in the property-type registry — is treated as a list even with a single value. Only for a property that never appears as a list and is not declared one is a one-element list read like a single value.

**Views and embedding**
- **Table**, **cards**, **list** and **map** are built in; other view types need a plugin, and plugin views run in the browser only, never on the server.
- A base can be **opened as its own `.base` file, embedded via `![[…]]`, or written as a ```` ```base ```` code block right in a note** (a read-only table each). Embedded, it shows **one** view — the first, or the one chosen with `#View name` — and always as a **table**, even if the view is of type cards, list or map.
- An embedded base is queried once when shown and is **not** refreshed on vault changes; an opened `.base` file is. That includes `this`: if the embedding note changes, the embed keeps the old state until the note is reopened.
- `this` works in the built-in table, not in views a plugin provides, and not in the MCP `query_base` tool (there `this.…` is empty).

**AI access via MCP**
- The `query_base` tool evaluates a `.base` server-side with the same engine ([[Advanced/MCP Context Server|MCP interface]] for AI clients), including its `summaries`. It returns 100 rows by default (maximum 1000) and returns formula values as text.

---

## Worked example

This vault ships two ready-made examples that work on the same task notes:

- [[Features/Example Tasks (Base)]] — a **table** with a filter, a "Days left" formula column, the estimate column and a **summary row** (count, sum of estimate, average of days left).
- [[Features/Example Board (Base)]] — a **card board** grouped by `status`, with a summary bar above the columns.

The same tasks as an **inline base** — a ```` ```base ```` block that sits directly in this note:

```base
filters:
  and:
    - file.inFolder("Features/Example Tasks")
    - 'type == "task"'
properties:
  file.name:
    displayName: "Task"
  status:
    displayName: "Status"
  priority:
    displayName: "Priority"
views:
  - type: table
    name: "Tasks"
    order:
      - file.name
      - status
      - priority
```

Open the table, then:

1. Edit a `status` cell directly in the table — the change lands in the note's frontmatter and the summary row recomputes.
2. Click the **Days left** column header (a formula column) to sort by it client-side.
3. Open raw-source mode to see the YAML, including the `summaries` block.
4. Open the board and drag a card to another status column.

---

> [!todo] Exercise
> 1. Open the example base and change a note's `status` from the table.
> 2. Run **"Bases: Add item"** while the base is open — a new task note should be created in the right folder and appear as a row.
> 3. Run **"Create new Base"** and build a small base of your own with the filter `file.hasTag("features")`.
> 4. Add a `summaries` row with `estimate: Sum` and embed the base in another note with `![[…]]`.
> 5. Run **"Bases: Insert new base"** and adjust the `filters` block in the inserted code block.

---

## Related features

- [[Features/Tags and Properties]] — The metadata layer Bases build on
- [[Features/Search and Replace]] — The `path:`/`tag:`/`property:` operators
- [[Features/Context Panel]] — Per-note view of the same properties
- [[Advanced/Plugins/Dataview]] — The plugin-based alternative for querying notes
- [[Admin/Feature Toggles]] — Switch Bases on/off server-wide
