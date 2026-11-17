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
| **`views`** | One or more named views: **table**, **gallery**, **Kanban**, **list** or **map** (plugin only), each with its own column order, sort, filter and `limit` |
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
  days_left: '(date(deadline) - today()).days'
```

**Built-in functions:** `if`, `concat`, `now`, `today`, `date`, `duration`, `number`, `list`, `link`, `file`, `image`, `icon`, `html`, `escapeHTML`, `random`, `min`, `max`, `days`, `length`.

**Methods:**

| Type | Methods |
|------|---------|
| Text | `contains`, `containsAll`, `containsAny`, `startsWith`, `endsWith`, `lower`, `upper`, `trim`, `title`, `repeat`, `reverse`, `slice`, `replace`, `split`, `length`, `isEmpty` |
| Number | `toFixed`, `round`, `abs`, `ceil`, `floor`, `isEmpty` |
| Date | `format`, `date`, `time`, `relative`, plus `year`, `month`, `day`, `hour`, `minute`, `second` |
| List | `contains`, `containsAll`, `containsAny`, `length`, `join`, `first`, `last`, `flat`, `reverse`, `slice`, `sort`, `unique`, `sum`, `mean`, `min`, `max`, `isEmpty`, `map`, `filter`, `reduce` |
| Regexp | `matches` — literals like `/abc/gi`; `replace` and `split` accept them too (`g` replaces every match, otherwise only the first) |
| Link | `asFile`, `linksTo` |
| File | `file.hasTag`, `file.inFolder`, `file.hasLink`, `file.hasProperty`, `file.asLink` |
| Any value | `isTruthy`, `isType`, `toString` |

**List lambdas** use no arrow syntax, as in Obsidian, but an expression with the implicit variables `value`, `index` and (for `reduce`) `acc`:

```yaml
formulas:
  doubled: 'numbers.map(value * 2)'
  big: 'numbers.filter(value > 10).length'
  total: 'numbers.reduce(acc + value, 0)'
```

> [!note] Date difference
> `date1 - date2` returns **milliseconds** (as in Obsidian). For days use `(a - b).days` as in Obsidian (also `.hours`, `.minutes`, `.seconds`, `.milliseconds`); `days(a, b)` exists as an extra.

---

## Summaries (`summaries`)

Each column can show a summary over the displayed rows. It lives under the view's `summaries:` as `column: function` and appears as a row under the table, or as a bar above the Kanban board.

```yaml
views:
  - type: table
    name: Tasks
    order: [file.name, status, estimate]
    summaries:
      file.name: Filled
      estimate: Sum
```

Built-in functions (as in Obsidian):

| Applies to | Functions |
|------------|-----------|
| All types | `Empty`, `Filled`, `Unique` (and `Count` as a Slatebase extra — unknown in Obsidian) |
| Numbers | `Sum`, `Average`, `Min`, `Max`, `Median`, `Range`, `Stddev` |
| Dates | `Earliest`, `Latest`, `Range` |
| Checkbox | `Checked`, `Unchecked` |

A numeric function on a non-numeric column yields an empty value, not an error. Define custom summaries in the top-level `summaries:` block as a formula over the list `values`, and assign them by name in the view:

```yaml
summaries:
  middle: 'values.mean().round(1)'
  big: 'values.filter(value > 10).length'
views:
  - type: table
    summaries:
      effort: middle
```

If the formula fails, the summary stays empty.

---

## Editing in the table

Property cells are editable inline, using the same typed controls as the [[Features/Tags and Properties|Properties editor]] — text, number, date, checkbox, list/tags. A change goes straight into the note's frontmatter. Formula columns are read-only.

Click a column header to sort; the sort is written back into the `.base` file. This also works for formula columns — they are sorted after loading by their computed values.

**Column width:** drag the right edge of a column header to resize it; with the keyboard the arrow keys (←/→) change the width by 10 pixels (50 with `Shift`), and a double click resets the column to automatic. Widths are stored as `columnSize` in the view of the `.base` file (as in Obsidian); under **Display**, "Reset" returns all widths to automatic at once. With column widths set, overlong cell content is clipped instead of widening the column.

---

## Toolbar: views, filters, sorting, groups, properties

A toolbar sits above the table — you don't have to write the YAML by hand. Every change is written to the `.base` file immediately (with write access to the vault; without it the settings can only be viewed).

- **View menu** (view name ▾): switch between views, create a **new view** with a name and type, **rename** the current one, **change its type**, **duplicate** or **delete** it (the last view always stays).
- **Sort:** several sorts with property and direction, reorderable.
- **Group:** the property that gallery, Kanban and table views build their groups from.
- **Filter:** conditions of property, operator and value (is, contains, starts with, is empty, greater/less than, has tag, in folder …), nested into **and / or / not** groups as you like; conditions can be reordered with the grip or ↑/↓ and moved between "This view" and "All views". The **This view** tab affects only the current view, **All views** the whole base. Anything that can't be shown as a builder condition stays editable as an expression (`</>`).
- **Properties:** choose which columns show and in which order — including file fields (`file.ctime` …) and formulas; type the name of a custom property to add it.
- **Display:** display options that fit the type of the view — see [[#Display options per view]].
- **Search:** filters the shown entries by file name and visible values (accents and case ignored) without changing the base.
- **New item:** creates a new note in the base's scope (like "Bases: Add item").

The icon on the right of the path bar (breadcrumb) toggles between the view and the source (raw YAML, which now uses all the available space).

---

## Views: table, gallery, Kanban, list and map

A base can hold several views; a view switcher appears at the top. You choose a view's type in the view menu (table, gallery, Kanban, list); in the `.base` file it is stored as `type`.

- **Table** (`type: table`) — one row per note, editable cells, adjustable column widths and row height.
- **Gallery** (`type: cards` without `groupBy`) — a grid of cards, one per note, as in Obsidian (called "Cards" there; Slatebase names it **Gallery** in the interface). Options: `image` (the property holding the cover image: an `[[attachment]]` link, an http(s) URL or a colour like `#ff8800`), `imageFit` (`cover` crops, `contain` does not), `imageAspectRatio` (width / height, default 1) and `cardSize` (card width in pixels, default 200).
- **Grouped gallery** (`type: cards` **with** `groupBy`) — each group is its own row of cards, stacked one below the other. `cardSize` is the card width here; `image`, `imageFit` and `imageAspectRatio` work as in the gallery.
- **Kanban** (`type: kanban`, a Slatebase type — Obsidian does not know it) — notes grouped by a property into **columns** side by side. With `groupOrder` (a list of values; `null` stands for "No …") only the listed columns show, in that order; an empty list hides them all. Each value becomes a column; notes without a value land in a "No …" column. Columns collapse and can be reordered by their grip (this writes `groupOrder`), the **+** in a column header creates an item right in that column, and clicking a card opens the note. Cards can carry a cover image (`image`, `imageFit`, `imageAspectRatio` as in the gallery); `cardSize` is the **column width** here (unset: the width adapts).
  **Drag a card to another column** to change the grouping property's value in the note; dropping on "No …" removes the property. If you group by `file.folder`, dragging moves the note into the column's folder (the "(Root)" column is the vault's top folder). (Requires write access to the vault.)
  Right-clicking a card (in the gallery too) opens a menu: open in a tab or split pane, rename, move, delete, bookmark, reveal in the explorer, copy link.
- **List** (`type: list`) — a simple read-only list with one entry per note. Formula columns are evaluated, and summaries appear as a bar above the list.
- **Groups in table and list** — a `groupBy` on a table or list view splits the rows into groups with a header (name and count). Click a header to collapse or expand its group. `groupOrder` works as in the Kanban view: only the listed groups show, in that order; `null` is the group of notes without a value; an empty list hides all groups. Without `groupOrder` the groups are sorted by value (`direction: DESC` reverses it) and the "No …" group comes last. Collapsing is not saved.
- **Map** (`type: map`) — Slatebase has no built-in map view; it comes from the Obsidian community plugin **Maps** (enable Obsidian plugin compatibility and install the plugin). The plugin registers the `type: map` view and plots notes with geo coordinates as pins on a map. The "Example Places" demo base uses this view; without the plugin it falls back to the table.

### More views from plugins

These views come from community plugins (see [[Advanced/Obsidian Plugins]]). Each demo also carries a `type: table` view, so without the plugin it falls back to a table instead of staying empty.

- **Graph** (`type: base-graph`, plugin **Base Graph**) - draws the base's notes as a force-directed graph; edges are the wikilinks between notes. The tasks demo [[Features/Example Tasks (Base)]] contains this view; the example tasks link to each other so edges appear.
- **Chart** (`type: chart-bar` / `chart-line` / `chart-scatter`, plugin **Bases Charts**) - bar, line or scatter chart. Pick the X axis (`x`) as a property/formula; Y values come from the numeric columns of the view. The tasks demo shows effort per task as a bar chart (X = task, Y = `estimate`).
- **Timeline** (`type: timeline-view`, plugin **Bases Timeline View**) - plots notes with start and end dates as bars on a time axis. Set the fields via `startField` / `endField` / `contentField`. The demo [[Features/Example Projects (Base)]] shows four example projects across the year.
- **Tasks** (`type: tasknotesTaskList`, `tasknotesKanban`, `tasknotesCalendar`, `tasknotesMiniCalendar`, plugin **TaskNotes**) - treats notes with the `task` tag as tasks (status, priority, due and scheduled dates live in the frontmatter) and shows them as a grouped list, Kanban board, calendar or mini calendar. The demo [[Features/Example TaskNotes (Base)]] bundles all four views over six example tasks; the list and board group by `status`, the calendar shows `due` and `scheduled`. The example tasks' dates lie in late autumn 2026 - in the calendar you page there, in the list and board the date does not matter.

```yaml
views:
  - type: table
    name: All tasks
    order: [file.name, status, priority]
    limit: 50
  - type: kanban
    name: Board
    groupBy:
      property: status
      direction: ASC
    order: [file.name, priority]
```

`limit` caps a view's rows — applied **after** filtering. If the limit hides matches, "Zeigt N von M" (shows N of M) appears above the view.

Other view types come from Obsidian plugins (see [[Advanced/Obsidian Plugins]]).

### Display options per view

The toolbar has a **Display** button for table, gallery, Kanban and list. It shows only what fits the type of the current view and writes every change as a key into the view in the `.base` file — a value equal to the default is not written at all.

| View | Option | YAML key | Default |
|------|--------|----------|---------|
| Table | **Row height** (Short, Medium, Tall, Extra tall) | `rowHeight: medium / tall / extra` | Short |
| Table | **Column widths** — drag the column edge, reset here | `columnSize` (column → pixels) | automatic |
| Gallery | **Card size** (card width, 50–800 px) | `cardSize` | 200 |
| Gallery, grouped gallery, Kanban | **Image property** (property with a link, URL or colour) | `image` | none |
| Gallery, grouped gallery, Kanban | **Image fit** (Fill / Fit in) | `imageFit: contain` | Fill |
| Gallery, grouped gallery, Kanban | **Image ratio** (width / height, 0.25–2.5) | `imageAspectRatio` | 1 |
| Kanban | **Column width** (50–800 px) | `cardSize` | automatic (220–300 px) |
| Grouped gallery | **Card width** (50–800 px) | `cardSize` | 220 |
| List | **Marker** (Bullets, Numbers, None) | `markers: number / none` | Bullets |
| List | **Indent properties** | `indentProperties: true` | off |
| List | **Separator** between the values | `separator` | `,` |

```yaml
views:
  - type: table
    name: Tasks
    rowHeight: medium
    columnSize:
      file.name: 280
      note.status: 120
  - type: kanban
    name: Board
    groupBy:
      property: status
    image: cover
    imageFit: contain
    cardSize: 300
```

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

## Objects: `file.properties`

`file.properties` is an **object** holding all properties of a note (name → value). Reach an entry with a dot or brackets, also nested:

- `file.properties.status` or `file.properties["status"]`
- `file.properties.keys()` — the names as a list, in frontmatter order
- `file.properties.values()` — the values as a list
- `file.properties.isEmpty()` — `true` when the note has no properties

A missing entry gives an empty value, not an error. In a cell an object shows as compact text (JSON), and sorting by such a formula uses exactly that text.

> [!note] Slatebase choices
> Obsidian only describes `file.properties` and the three methods. The text form (compact JSON), equality (two objects are equal when names and values match) and order are Slatebase decisions. There are no object literals, and nested frontmatter objects are not yet read as objects. The index hands over at most 200 properties per note.

---

## Limits and gaps

So nothing surprises you:

**Data volume**
- Each query examines **up to 5000 notes** from the index as candidates. Where possible, Slatebase pushes the cheaply-checkable parts of your filter (property equality, `file.hasTag`, `file.inFolder`) **ahead of** that cap, so it rarely reaches real matches. If it is exceeded anyway, the view shows a visible "result truncated" notice — never a silent cut.

**Expression language**
- This is a **pragmatic subset** of Obsidian's functions (see the lists above), not the full library. An unknown function yields `#ERR` in a formula column and drops the note in a filter.
- Objects exist only as `file.properties` (see above), not as literals. `html()`, `icon()` and `image()` return text or a link; raw HTML is never inserted.
- `file.embeds`, `file.size` and `file.backlinks` ARE supported. `file.embeds` holds `![[…]]` embeds only; on the first start after the update Slatebase rebuilds the link index once.
- Not implemented: Obsidian's further display options beyond those listed above (for example column widths in lists); unknown keys in a view are kept unchanged when saving.

**Lists vs. single values**
- The index hands over every property as a list. A property that has **more than one value somewhere** in your vault — or is declared as a list/tags in the property-type registry — is treated as a list even with a single value. Only for a property that never appears as a list and is not declared one is a one-element list read like a single value.

**Views and embedding**
- **Table**, **gallery** (`cards`), **Kanban** and **list** are built in; the **map** and all other view types need a plugin, and plugin views run in the browser only, never on the server.
- A base can be **opened as its own `.base` file, embedded via `![[…]]`, or written as a ```` ```base ```` code block right in a note** (read-only each). Embedded, it shows **one** view — the first, or the one chosen with `#View name` — in its own type: table, gallery, Kanban or list. Only plugin views (the map included) appear as a table when embedded.
- An embedded base refreshes itself on vault changes (including a change to the embedding note, and so to `this`); the old display stays until the new query is done.
- `this` works in the built-in table, not in views a plugin provides. In the MCP `query_base` tool it applies only with the `thisPath` parameter, otherwise `this.…` is empty.

**AI access via MCP**
- The `query_base` tool evaluates a `.base` server-side with the same engine ([[Advanced/MCP Context Server|MCP interface]] for AI clients), including its `summaries`. It returns 100 rows by default (maximum 1000) and returns formula values as text.

---

## Worked example

This vault ships two ready-made examples that work on the same task notes:

- [[Features/Example Tasks (Base)]] — a **table** with a filter, a "Days left" formula column, the estimate column and a **summary row** (count, sum of estimate, average of days left).
- [[Features/Example Board (Base)]] — a **Kanban board** grouped by `status`, with a summary bar above the columns.

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
