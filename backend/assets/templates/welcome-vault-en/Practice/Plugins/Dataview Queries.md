---
tags: [practice, plugins]
---

# Exercise — Dataview Queries

**Difficulty:** :star::star::star: Advanced
**Duration:** ~20 minutes
**Prerequisite:** Dataview plugin installed and activated

---

## Goal

You create multiple notes with structured frontmatter and write Dataview queries that dynamically display this data as tables and lists.

---

## Steps

> [!todo] Step 1: Create Project Notes
> Create the following 4 files in the folder `Practice/Plugins/Projects/`:

**File 1: `Practice/Plugins/Projects/Website-Relaunch.md`**
```markdown
---
status: active
priority: high
deadline: 2025-04-01
assignee: Anna
tags: [project, frontend]
---

# Website Relaunch

- [ ] Create design mockups
- [ ] Migrate content
- [ ] SEO optimization
- [x] Set up hosting
```

**File 2: `Practice/Plugins/Projects/API-Documentation.md`**
```markdown
---
status: active
priority: medium
deadline: 2025-03-15
assignee: Max
tags: [project, backend]
---

# API Documentation

- [ ] Document endpoints
- [ ] Write example requests
- [x] Create OpenAPI schema
```

**File 3: `Practice/Plugins/Projects/Mobile-App.md`**
```markdown
---
status: planning
priority: high
deadline: 2025-06-01
assignee: Lisa
tags: [project, mobile]
---

# Mobile App

- [ ] Technology evaluation
- [ ] Create prototype
- [ ] Plan user testing
```

**File 4: `Practice/Plugins/Projects/Database-Migration.md`**
```markdown
---
status: completed
priority: critical
deadline: 2025-01-31
assignee: Max
tags: [project, backend]
---

# Database Migration

- [x] Schema design
- [x] Write migration script
- [x] Run tests
- [x] Production migration
```

> [!todo] Step 2: Create Dashboard
> Create `Practice/Plugins/Project-Dashboard.md` with the following queries:

````markdown
# Project Dashboard

## All Projects

```dataview
TABLE status, priority, deadline, assignee
FROM "Practice/Plugins/Projects"
SORT deadline ASC
```

## Active Projects

```dataview
TABLE priority, deadline, assignee
FROM "Practice/Plugins/Projects"
WHERE status = "active"
SORT priority DESC
```

## Open Tasks

```dataview
TASK
FROM "Practice/Plugins/Projects"
WHERE !completed
```

## Projects by Assignee

```dataview
LIST
FROM "Practice/Plugins/Projects"
WHERE assignee = "Max"
```
````

> [!todo] Step 3: Verify Results
> 1. Open `Project-Dashboard.md` in View mode
> 2. The TABLE query should show a table with 4 rows
> 3. The filtered query shows only active projects (2)
> 4. The TASK query collects all open checkboxes
> 5. The LIST query shows only Max's projects

> [!todo] Step 4: Write Your Own Query
> Add these queries to the dashboard:

````markdown
## High Priority Projects

```dataview
TABLE status, deadline
FROM "Practice/Plugins/Projects"
WHERE priority = "high" OR priority = "critical"
SORT deadline ASC
```

## Last 3 Files (by modification date)

```dataview
TABLE file.mtime AS "Modified"
FROM "Practice/Plugins/Projects"
SORT file.mtime DESC
LIMIT 3
```
````

> [!todo] Step 5: Test Inline Query
> Add an inline query to one of the project files:
> ```markdown
> Created: `= this.file.cday`
> Deadline: `= this.deadline`
> ```

---

## Success Criteria

- [ ] 4 project files with consistent frontmatter exist
- [ ] Dashboard shows at least 3 different query types
- [ ] TABLE query displays all 4 projects with correct fields
- [ ] WHERE filter works (fewer results than unfiltered)
- [ ] TASK query shows open tasks from all files
- [ ] At least one self-written query works

---

## Bonus Tasks

### Create Reading List

Create 3 book notes with `title`, `author`, `rating`, `status` and a query:

````markdown
```dataview
TABLE author, rating, status
FROM #book
SORT rating DESC
```
````

### Test Grouping

````markdown
```dataview
TABLE rows.file.link AS "Projects"
FROM "Practice/Plugins/Projects"
GROUP BY status
```
````

---

## Continue

- [[Advanced/Plugins/Dataview]] — Full Dataview documentation
- [[Advanced/Plugins/Templater]] — Dynamic templates
- [[Features/Tags and Properties]] — Frontmatter basics
