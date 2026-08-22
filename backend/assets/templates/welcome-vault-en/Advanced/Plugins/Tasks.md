---
tags: [advanced, plugins]
---

# Tasks Plugin

The Tasks plugin turns ordinary checkbox lines (`- [ ]`) into a searchable task management system. Due dates, priorities, and recurrence are written directly into the task line as emoji signifiers — Tasks reads them and renders them through query blocks that filter, sort, and group.

---

## Prerequisites

- Feature toggle `obsidian-plugin-compat` enabled
- Tasks plugin installed and activated
- Plugin ZIP from GitHub: `obsidian-tasks-plugin`

---

## Installation

1. Go to **Plugin Management** → **"Available Plugins"** tab and search for "Tasks"
2. Click **Install**, then switch on the **activation toggle**

Not listed, or need a specific fork/version? Download the ZIP from GitHub instead and use **"Installed Plugins" → Upload Plugin**.

---

## Task Syntax

A Tasks task is a normal Markdown checkbox with optional emoji signifiers at the end of the line:

```markdown
- [ ] Prepare presentation 📅 2026-08-20 ⏫
```

| Emoji | Meaning | Example |
|-------|---------|---------|
| 📅 | Due date | `📅 2026-08-20` |
| ⏳ | Scheduled date | `⏳ 2026-08-18` |
| 🛫 | Start date | `🛫 2026-08-15` |
| ➕ | Created date | `➕ 2026-08-10` |
| ✅ | Done date | `✅ 2026-08-14` |
| ❌ | Cancelled date | `❌ 2026-08-12` |
| 🔁 | Recurrence | `🔁 every week` |
| ⛔ | Blocked by (id) | `⛔ abc123` |
| 🆔 | Own id | `🆔 abc123` |

### Priorities

| Emoji | Priority |
|-------|----------|
| 🔺 | Highest |
| ⏫ | High |
| 🔼 | Medium |
| 🔽 | Low |
| ⏬ | Lowest |

> [!tip] Order doesn't matter, but position does
> Signifiers can appear in any order relative to each other, but must stay at the end of the line — text written after them is no longer treated as part of the description.

---

## Query Language

Tasks queries live in code blocks with the language `tasks`. Each line in the block is either a filter or a sort/display instruction:

````markdown
```tasks
not done
due before next monday
sort by priority
```
````

### Common Filters

| Filter | Description |
|--------|-------------|
| `done` / `not done` | Only completed / only open tasks |
| `due today`, `due before X`, `due after X` | Filters by due date |
| `path includes X` | Only tasks from files whose path contains `X` |
| `tags include #X` | Only tasks tagged `#X` |
| `priority is above medium` | Filters by priority |
| `is recurring` | Only recurring tasks |
| `no due date` | Tasks with no due date |

### Sorting and Grouping

```markdown
sort by due
sort by priority
group by status
group by path
```

### Display

```markdown
short mode
hide backlink
hide priority
```

---

## Recurring Tasks

The `🔁` signifier automatically creates a new instance of the task with a shifted date once it's checked off:

```markdown
- [ ] Server backup 🔁 every week 📅 2026-08-17
```

After checking it off:

```markdown
- [x] Server backup 🔁 every week 📅 2026-08-17 ✅ 2026-08-14
- [ ] Server backup 🔁 every week 📅 2026-08-24
```

Supported patterns include: `every day`, `every week`, `every month`, `every year`, `every 2 weeks`, `every weekday`.

---

## Example: Personal Task Management

```markdown
## This Week

- [ ] Send quote to client 📅 2026-08-15 ⏫
- [ ] Check invoice #4471 📅 2026-08-16
- [ ] Prepare team meeting 🛫 2026-08-17 📅 2026-08-18 🔼

## Recurring

- [ ] Weekly review 🔁 every week 📅 2026-08-17
- [ ] Check backups 🔁 every monday 📅 2026-08-17

## Done

- [x] Kickoff meeting ➕ 2026-08-01 ✅ 2026-08-05
```

Dashboard query for open, overdue tasks:

````markdown
```tasks
not done
due before today
sort by due
```
````

---

## Example: Project Dashboard with Multiple Queries

````markdown
# Project Dashboard

## Overdue

```tasks
not done
due before today
```

## Due This Week

```tasks
not done
due after yesterday
due before in 7 days
sort by due
```

## High Priority

```tasks
not done
priority is above medium
group by path
```

## Recently Completed

```tasks
done
sort by done reverse
limit 5
```
````

---

## Combining with Dataview

Tasks and [[Advanced/Plugins/Dataview]] can run side by side: Dataview has its own `TASK` query type, which also collects checkbox lines — but without understanding Tasks' emoji signifiers. For pure due-date/priority workflows, the `tasks` block is more precise; for queries over frontmatter fields, Dataview is more powerful.

---

## Limitations in Slatebase

| Feature | Status |
|---------|--------|
| Checkbox tasks with emoji metadata | Works |
| `tasks` query blocks (filter, sort, group) | Works |
| Recurring tasks (`🔁`) | Works |
| Checking off tasks directly from the query view | Works |
| Global filter (setting) | Works |
| Emoji syntax autocomplete while typing | Limited |

---

> [!tip] Consistent signifiers
> Stick to a fixed set of emoji (e.g. always 📅 for due dates, never a freeform date). That's what keeps your queries reliable.

> [!todo] Exercise
> 1. Install and activate the Tasks plugin
> 2. Create 5 tasks with different due dates and priorities
> 3. Check off two of them
> 4. Create a `tasks` query block showing only open tasks sorted by due date
> 5. Add a recurring task (`🔁 every week`) and check it off — verify a new instance appears
> 6. Create a second query block showing only high-priority tasks

---

## Live Examples

The following tasks and queries render when the Tasks plugin is activated — they all come from this file.

### Tasks in this chapter

- [ ] Review vault structure 📅 2026-08-20 ⏫ #documentation
- [ ] Update screenshots ⏳ 2026-08-18 🔼 #documentation
- [ ] Check weekly backup 🔁 every week 📅 2026-08-17
- [x] Write Tasks chapter ➕ 2026-08-10 ✅ 2026-08-14 #documentation
- [ ] Archive old notes ⏬

### Open tasks, sorted by due date

```tasks
not done
path includes Advanced/Plugins/Tasks
sort by due
```

### High priority only

```tasks
not done
path includes Advanced/Plugins/Tasks
priority is above medium
```

### Completed tasks

```tasks
done
path includes Advanced/Plugins/Tasks
```

### Recurring tasks

```tasks
path includes Advanced/Plugins/Tasks
is recurring
```

---

## Related Features

- [[Advanced/Plugins/Dataview]] — Query frontmatter and tags
- [[Features/Tags and Properties]] — Use tags to filter tasks
- [[Advanced/Plugins/Kanban]] — Organize tasks visually in boards
- [[Advanced/Obsidian Plugins]] — Plugin basics
