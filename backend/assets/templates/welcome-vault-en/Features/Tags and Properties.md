---
tags:
  - features/tags
  - basics/organization
  - type/documentation
---

# Tags and Properties

Tags and properties let you categorize and enrich your notes with metadata. Tags are quick labels, properties are structured key-value pairs in the frontmatter.

![[Screenshots/context-panel.png]]

*The Context Panel shows tags and properties*

---

## Tags

### Syntax

Tags start with `#` followed by a word (no spaces):

```markdown
#basics #productivity #project-alpha
```

You can use tags anywhere in the text body or in the frontmatter.

### Nested Tags

Use `/` to create hierarchies:

#project/alpha #project/beta #project/webapp/frontend #project/webapp/backend

#status/done #status/in-progress #status/archived

#type/meeting #type/daily #type/project

#priority/high #priority/medium #priority/low

Nested tags let you subdivide categories. Filtering for `#project/webapp` will find both frontend and backend entries.

### Frontmatter Tags

Define tags in the YAML frontmatter:

```yaml
---
tags: [features, tutorial]
---
```

Or as a list:

```yaml
---
tags:
  - features
  - tutorial
---
```

---

## Properties (Frontmatter)

Properties are YAML key-value pairs at the top of a file:

```yaml
---
tags: [project]
status: in-progress
priority: high
created: "2025-01-15"
assignee: "Anna"
---
```

### Supported Value Types

| Type | Example |
|------|---------|
| String | `title: "My Note"` |
| Number | `priority: 1` |
| Boolean | `published: true` |
| Date | `created: "2025-01-15"` |
| List | `tags: [a, b, c]` |

---

## Viewing Tags and Properties

### In the Context Panel

The [[Features/Context Panel|Context Panel]] has dedicated sections for:
- **Tags** — All tags in the vault, expandable to see which files use them
- **Properties** — The frontmatter of the current file as a key-value table

### Interactive Properties Editor

When you have write access, the Properties tab shows an **interactive editor** instead of a plain table:

- **Text fields:** Click to edit, Enter/Blur to save
- **Numbers:** Numeric input with validation
- **Date/Time:** Native date picker
- **Checkbox:** Toggle switch for `true`/`false`
- **Lists/Tags:** Chip editor with add/remove and autocomplete

**Type detection:** The editor automatically infers the type from the value (e.g. `true` → checkbox, `2024-06-15` → date, `[a, b, c]` → list). You can also declare types explicitly via the vault settings.

**Add a property:** Click "+ Add property" at the bottom. Key names get autocomplete suggestions from your vault.

**Delete a property:** Via the trash icon next to each entry.

> [!tip] No manual YAML
> The Properties Editor saves you from editing raw YAML. Changes are written directly into the frontmatter and saved immediately.

### In the Knowledge Graph

Tags appear as nodes in the [[Features/Knowledge Graph|Knowledge Graph]] when enabled in the graph settings.

---

## Practical Example

Create a note with tags and properties:

```yaml
---
tags: [meeting, project-alpha]
date: "2025-03-15"
participants: "Anna, Ben, Clara"
status: done
---

# Sprint Planning

#project-alpha #meeting

Today we discussed the roadmap for Q2...
```

---

## Best Practices

> [!tip] Tag Conventions
> Define a consistent tag scheme for your vault:
> - Use lowercase: `#project` not `#Project`
> - Use hyphens for multi-word: `#project-alpha` not `#projectAlpha`
> - Keep a short list of "official" tags to avoid duplicates

> [!tip] Properties vs. Tags
> - **Tags** = quick categorization, searchable, visible in graph
> - **Properties** = structured data, machine-readable, good for templates

---

> [!todo] Exercise
> 1. Open this file in Edit mode and look at the frontmatter (the `---` block at the top)
> 2. Create a new file with 2 tags in the frontmatter and 1 tag in the body
> 3. Open the Context Panel and check the Tags section — you should see the nested hierarchy from this page
> 4. Try adding your own nested tag: `#exercise/tags`

---

## Related Features

- [[Features/Context Panel]] — View tags and properties
- [[Features/Knowledge Graph]] — Tags as graph nodes
- [[Features/Search and Replace]] — Search by tags
- [[Features/Templates and Daily Notes]] — Properties in templates
