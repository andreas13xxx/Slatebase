---
tags: [advanced, plugins]
---

# Advanced Tables Plugin

Advanced Tables extends Markdown table editing with auto-formatting, Tab-based cell navigation, tools to move/sort rows and columns, and table formulas. The file format stays plain Markdown — there's no special format like with Kanban or Excalidraw.

---

## Prerequisites

- Feature toggle `obsidian-plugin-compat` enabled
- Advanced Tables plugin installed and activated
- Plugin ZIP from GitHub: `table-editor-obsidian`

---

## Installation

1. Go to **Plugin Management** → **"Available Plugins"** tab and search for "Advanced Tables"
2. Click **Install**, then switch on the **activation toggle**

Not listed, or need a specific fork/version? Download the ZIP from GitHub instead and use **"Installed Plugins" → Upload Plugin**.

---

## Auto-Formatting

As soon as the cursor leaves a Markdown table, Advanced Tables re-aligns every column — separator dashes and padding are recalculated regardless of how messily the table was typed:

```markdown
| Name | Status | Deadline |
|---|---|---|
| API Redesign | active | 2026-08-20 |
| Onboarding | open | 2026-09-01 |
```

automatically becomes:

```markdown
| Name         | Status | Deadline   |
| ------------ | ------ | ---------- |
| API Redesign | active | 2026-08-20 |
| Onboarding   | open   | 2026-09-01 |
```

---

## Navigation

| Keybinding | Action |
|------------|--------|
| `Tab` | Jump to the next cell (creates a new row at the end) |
| `Shift+Tab` | Jump to the previous cell |
| `Enter` inside a row | Move to the next row, same column |

This lets you type an entire table without touching the mouse.

---

## Managing Rows and Columns

These actions are available from the Command Palette (`Ctrl+P` → "Advanced Tables:") whenever the cursor is inside a table:

| Command | Description |
|---------|--------------|
| Format table | Re-format the current table |
| Format all tables in note | Re-format every table in the note |
| Insert column left / right | Insert a column |
| Insert row above / below | Insert a row |
| Delete column / Delete row | Delete a column or row |
| Move column left / right | Move a column |
| Move row up / down | Move a row |
| Sort rows ascending / descending | Sort rows by the column under the cursor |

---

## Formulas (TBLFM)

Advanced Tables supports Emacs Org-mode style table formulas. The formula lives as a comment directly below the table; columns are referenced with `$N`, rows with `@N`:

```markdown
| Item       | Qty | Price | Total |
| ---------- | --- | ----- | ----- |
| Coffee     | 3   | 4     |       |
| Cookies    | 2   | 2.5   |       |
| **Total**  |     |       |       |

<!-- TBLFM: @2$4=@2$2*@2$3;@3$4=@3$2*@3$3;@4$4=sum(@2..@3) -->
```

Running **"Advanced Tables: Evaluate formulas"** computes and fills in the total cells. Supported functions include `sum`, `average`/`mean`, `min`, `max`, `round`.

> [!warning] Formulas don't auto-recalculate
> After changing any values, re-run "Evaluate formulas" to update the results.

---

## Example: Project Tracker

```markdown
| Task                  | Owner | Status   | Deadline   |
| --------------------- | ----- | -------- | ---------- |
| API design             | Max   | Active    | 2026-08-20 |
| Frontend integration    | Lisa  | Open      | 2026-08-25 |
| Write tests             | Max   | Open      | 2026-08-27 |
| Deployment              | Team  | Blocked   | 2026-08-30 |
```

`Tab`/`Shift+Tab` lets you append new rows without hand-maintaining alignment — Advanced Tables re-formats every time you leave the table.

---

## Example: Budget with Formula

```markdown
| Category | Planned | Spent |
| -------- | ------- | ----- |
| Hosting  | 50      | 47    |
| Domains  | 20      | 18    |
| Tools    | 30      | 35    |
| **Total**|         |       |

<!-- TBLFM: @4$2=sum(@2..@3);@4$3=sum(@2..@3) -->
```

---

## Limitations in Slatebase

| Feature | Status |
|---------|--------|
| Auto-format on leaving the table | Works |
| Tab/Shift+Tab navigation | Works |
| Insert, delete, move rows/columns | Works |
| Sort by column | Works |
| Formulas (TBLFM, `evaluate formulas`) | Works |
| CSV export | Limited |

---

> [!tip] Formatting alone is worth it
> Even without formulas, Advanced Tables is worth installing just for auto-formatting — tables stay readable no matter how fast or messily you type.

> [!todo] Exercise
> 1. Install and activate the Advanced Tables plugin
> 2. Open [[Advanced/Plugins/Example-Table]] and watch the table snap into alignment as you leave it
> 3. Use `Tab` at the end of the last row to add a new row
> 4. Sort the table by a column via the Command Palette
> 5. Add a formula row and compute it with "Evaluate formulas"
> 6. Move a column to a different position

---

## Live Example

The following table auto-aligns as soon as you edit it with the plugin active:

→ [[Advanced/Plugins/Example-Table]]

---

## Related Features

- [[Features/Tags and Properties]] — Structured data as an alternative to tables
- [[Advanced/Plugins/Dataview]] — Generate tables automatically from frontmatter
- [[Advanced/Obsidian Plugins]] — Plugin basics
