---
tags: [features]
---

# Callouts

Callouts are colored boxes that highlight important information. They use a special blockquote syntax and come in various types for different purposes.

![[Screenshots/callout-typen.png]]

*Different callout types in preview*

---

## Basic Syntax

```markdown
> [!type] Title
> Content of the callout.
```

The type determines the color and icon. The title is optional — without it the type name is used.

---

## Available Types

### Informational

> [!info] Info
> General information or context.

> [!tip] Tip
> Helpful advice or best practices.

> [!note] Note
> Something worth noting or remembering.

> [!abstract] Abstract
> A summary or overview.

### Status

> [!success] Success
> Something that worked or was completed.

> [!question] Question
> An open question or consideration.

> [!example] Example
> A concrete example or demonstration.

### Warnings

> [!warning] Warning
> Something to be careful about.

> [!danger] Danger
> Critical warning — data loss or security risk.

> [!bug] Bug
> A known issue or limitation.

> [!failure] Failure
> Something that didn't work.

### Other

> [!quote] Quote
> A citation or referenced text.

> [!todo] To-Do
> An action item or task.

---

## Syntax Reference

| Type | Color | Use Case |
|------|-------|----------|
| `info` | Blue | General information |
| `tip` | Green | Helpful advice |
| `note` | Blue | Something noteworthy |
| `abstract` | Teal | Summaries |
| `success` | Green | Completed items |
| `question` | Yellow | Open questions |
| `example` | Purple | Examples |
| `warning` | Orange | Caution |
| `danger` | Red | Critical warnings |
| `bug` | Red | Known issues |
| `failure` | Red | Errors |
| `quote` | Gray | Citations |
| `todo` | Blue | Action items |

---

## Foldable Callouts

Add `+` (expanded by default) or `-` (collapsed by default) after the type:

```markdown
> [!tip]+ Click to collapse
> This content is visible by default but can be collapsed.

> [!note]- Click to expand
> This content is hidden by default.
```

---

## Multi-line Content

Callouts can contain any Markdown — lists, code, links:

```markdown
> [!example] Practical Example
> Here's a list inside a callout:
> - First point
> - Second point
> 
> And even code:
> ```javascript
> console.log("Hello from a callout!");
> ```
```

---

## Practical Example

Use callouts to structure a research note:

```markdown
# Research: Productivity Methods

> [!abstract] Summary
> Comparison of three methods: GTD, Zettelkasten, PARA.

> [!info] GTD (Getting Things Done)
> Capture everything, process into actionable items, review weekly.

> [!warning] Caveat
> GTD requires significant setup time. Not ideal for quick adoption.

> [!todo] Next Steps
> - [ ] Try GTD for one week
> - [ ] Document observations
> - [ ] Compare with current workflow
```

---

> [!tip] Best Practice
> Don't overuse callouts. One or two per note for the most important information is usually enough. Too many callouts make the content harder to read.

> [!todo] Exercise
> Create a new file and add at least 3 different callout types:
> 1. A `[!tip]` with a useful hint
> 2. A `[!warning]` about something
> 3. A foldable `[!note]-` that's collapsed by default
>
> Switch to View mode to see the colored boxes.

---

## Related Features

- [[Features/Embeds]] — Embedding content
- [[Basics/Markdown Syntax]] — Basic formatting
- [[Features/Mermaid Diagrams]] — Diagrams in Markdown
