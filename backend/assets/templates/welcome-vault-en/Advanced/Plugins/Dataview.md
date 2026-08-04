---
tags: [advanced, plugins]
author: Andreas
difficulty: intermediate
---

# Dataview Plugin

Dataview turns your vault into a queryable database. You write queries in special code blocks, and Dataview generates dynamic tables, lists, and task overviews — based on frontmatter, tags, and file metadata.

---

## Prerequisites

- Feature toggle `obsidian-plugin-compat` enabled
- Dataview plugin installed and activated
- Plugin ZIP from GitHub: `obsidian-dataview`

---

## Installation

1. Download plugin ZIP from GitHub
2. Settings → Vault → Plugins → "Install Plugin"
3. Upload ZIP → Activate

---

## Query Language (DQL)

Dataview uses its own query language (Dataview Query Language). Queries are written in code blocks with the language `dataview`:

````markdown
```dataview
TABLE file.ctime AS "Created", file.size AS "Size"
FROM "Projects"
SORT file.ctime DESC
```
````

---

## Query Types

### TABLE — Tabular View

````markdown
```dataview
TABLE status, deadline, priority
FROM #project
SORT deadline ASC
```
````

Generates a table with columns from frontmatter fields.

### LIST — Simple List

````markdown
```dataview
LIST
FROM #meeting
WHERE file.ctime >= date("2025-01-01")
SORT file.name ASC
```
````

Generates a linked list of all files with tag `#meeting` from 2025 onward.

### TASK — Task Collection

````markdown
```dataview
TASK
FROM "Projects"
WHERE !completed
SORT file.name ASC
```
````

Collects all open tasks (`- [ ]`) from the "Projects" folder.

---

## Frontmatter as Data Source

Dataview reads fields from YAML frontmatter:

```markdown
---
status: active
deadline: 2025-03-15
priority: high
assignee: Max
tags: [project, backend]
---

# API Redesign

Project description...
```

These fields can be used in queries:

````markdown
```dataview
TABLE status, deadline, assignee
FROM #project
WHERE status = "active"
SORT priority DESC
```
````

---

## Example: Project Dashboard

Create a file `Dashboard.md`:

````markdown
# Dashboard

## Active Projects

```dataview
TABLE status, deadline, priority
FROM #project
WHERE status = "active"
SORT deadline ASC
```

## Overdue Tasks

```dataview
TASK
FROM "Projects"
WHERE !completed AND due < date(today)
```

## Recent Changes

```dataview
TABLE file.mtime AS "Modified"
FROM ""
SORT file.mtime DESC
LIMIT 10
```

## Meetings This Week

```dataview
LIST
FROM #meeting
WHERE file.ctime >= date(today) - dur(7 days)
SORT file.ctime DESC
```
````

---

## Example: Reading List

```markdown
---
title: "Clean Code"
author: "Robert C. Martin"
status: read
rating: 4
finished: 2025-01-10
tags: [book, programming]
---

# Clean Code

Book notes...
```

Query all books:

````markdown
```dataview
TABLE author, rating, status
FROM #book
SORT rating DESC
```
````

---

## Example: Contact Database

```markdown
---
name: "Jane Smith"
email: "jane@example.com"
company: "TechCorp"
role: "Developer"
tags: [contact, tech]
---

# Jane Smith

Notes about this person...
```

Query:

````markdown
```dataview
TABLE company, role, email
FROM #contact
SORT company ASC
```
````

---

## Useful Operators

| Operator | Description | Example |
|----------|-------------|---------|
| `=` | Equals | `WHERE status = "active"` |
| `!=` | Not equals | `WHERE status != "archived"` |
| `>`, `<` | Greater/less | `WHERE priority > 3` |
| `contains` | Contains | `WHERE tags contains "important"` |
| `AND`, `OR` | Logical | `WHERE status = "active" AND priority = "high"` |
| `LIMIT` | Limit results | `LIMIT 5` |
| `GROUP BY` | Grouping | `GROUP BY status` |

---

## Inline Queries

Besides code blocks, there are inline queries — written **directly in body text** (not inside a code block). The syntax is a backtick, equals sign, space, expression, backtick:

Example (written like this in the editor):

    Last modified: `= this.file.mtime`
    File size: `= this.file.size`
    Created: `= this.file.cday`

> [!warning] Don't put them in code blocks
> Inline queries only work in normal body text. Inside ` ``` ` fences they are displayed as code, not executed.

---

## Limitations in Slatebase

| Feature | Status |
|---------|--------|
| DQL (TABLE, LIST, TASK) | Works |
| Inline queries | Works |
| Read frontmatter fields | Works |
| DataviewJS (JavaScript) | Limited |
| Complex functions | Partial |

> [!tip] Prefer DQL
> The declarative query language (DQL) works more reliably than DataviewJS. Use DQL for most use cases.

---

## Troubleshooting

| Problem | Solution |
|---------|----------|
| Query shows "No results" | Check path and tags — case-sensitive |
| Frontmatter field not recognized | Check YAML syntax (indentation, quotes) |
| Table empty | Check `FROM` path (relative to vault root) |

---

> [!tip] Structured Frontmatter
> The more consistent your frontmatter is, the more powerful Dataview queries become. Define a schema (e.g. always `status`, `tags`, `created`) and stick to it.

> [!todo] Exercise
> 1. Install and activate the Dataview plugin
> 2. Create 3 notes with frontmatter fields (`status`, `priority`, `tags`)
> 3. Create a Dashboard file with a TABLE query
> 4. Filter with `WHERE` for a specific status
> 5. Create a TASK query collecting all open tasks from a folder
> 6. Test a LIST query sorted by creation date
> 7. See [[Practice/Plugins/Dataview Queries]] for a guided exercise

---

## Live Examples

The following examples render automatically when the Dataview plugin is activated.

### All files in this vault (TABLE)

```dataview
TABLE file.ctime AS "Created", file.size AS "Size", file.folder AS "Folder"
FROM ""
SORT file.ctime DESC
LIMIT 10
```

### Files tagged "advanced" (LIST)

```dataview
LIST
FROM #advanced
SORT file.name ASC
```

### Inline Queries (directly in text)

This file is called: `= this.file.name`

It was created on: `= this.file.cday`

It has the tags: `= this.tags`

Character count of this file: `= this.file.size`

File path: `= this.file.path`

Folder: `= this.file.folder`

Last modified: `= this.file.mday`

Number of links in this file: `= length(this.file.outlinks)`

Author (custom frontmatter): `= this.author`

Difficulty: `= this.difficulty`

---

## Related Features

- [[Features/Tags and Properties]] — Tags and frontmatter as data source
- [[Features/Search and Replace]] — Alternative: text-based search
- [[Advanced/Plugins/Kanban]] — Visually organize tasks
- [[Advanced/Obsidian Plugins]] — Plugin basics
- [[Practice/Plugins/Dataview Queries]] — Hands-on exercise
