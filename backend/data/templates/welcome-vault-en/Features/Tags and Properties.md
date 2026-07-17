---
tags: [features]
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

```markdown
#project/alpha
#project/beta
#status/done
#status/in-progress
```

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
> 3. Open the Context Panel and check the Tags section
> 4. Try a nested tag: `#exercise/tags`

---

## Related Features

- [[Features/Context Panel]] — View tags and properties
- [[Features/Knowledge Graph]] — Tags as graph nodes
- [[Features/Search and Replace]] — Search by tags
- [[Features/Templates and Daily Notes]] — Properties in templates
