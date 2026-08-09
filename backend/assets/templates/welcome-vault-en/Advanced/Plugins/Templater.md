---
tags: [advanced, plugins]
---

# Templater Plugin

Templater extends the template system with dynamic commands. Instead of static placeholders (`{{date}}`), you can use JavaScript expressions, date calculations, and interactive prompts in your templates.

> [!example] Live examples in this vault
> The `Templates/Templater` folder contains four ready-made Templater templates you can try right after installing the plugin:
> - [[Templates/Templater/Daily Note (Templater)]]
> - [[Templates/Templater/Meeting Notes (Templater)]]
> - [[Templates/Templater/Weekly Review (Templater)]]
> - [[Templates/Templater/Project Template (Templater)]]
>
> In the Templater plugin settings, set the templates folder to `Templates/Templater` and create a new file from one of them — every `<% ... %>` expression below is evaluated live.

---

## Prerequisites

- Feature toggle `obsidian-plugin-compat` enabled
- Templater plugin installed and activated
- Plugin ZIP from GitHub: `templater-obsidian`
- Templates directory configured (Settings → Vault)

---

## Installation

1. Download plugin ZIP from GitHub
2. Settings → Vault → Plugins → "Install Plugin"
3. Upload ZIP → Activate
4. In plugin settings: Set templates folder

---

## Basic Syntax

Templater uses special delimiters:

| Syntax | Description |
|--------|-------------|
| `<% tp.date.now() %>` | Evaluate expression and insert |
| `<% tp.file.title %>` | Insert file title |
| `<%* ... %>` | Execute code (no output) |

---

## Date Functions

### Current Date

```markdown
Created: <% tp.date.now("YYYY-MM-DD") %>
```

Result: `Created: 2025-01-15`

### Relative Date

```markdown
Yesterday: <% tp.date.now("YYYY-MM-DD", -1) %>
Tomorrow: <% tp.date.now("YYYY-MM-DD", 1) %>
Next week: <% tp.date.now("YYYY-MM-DD", 7) %>
```

### Formatting

| Format | Result |
|--------|--------|
| `YYYY-MM-DD` | 2025-01-15 |
| `DD/MM/YYYY` | 15/01/2025 |
| `dddd, MMMM DD, YYYY` | Wednesday, January 15, 2025 |
| `HH:mm` | 14:30 |
| `YYYY-[W]ww` | 2025-W03 |

---

## File Functions

```markdown
Filename: <% tp.file.title %>
Folder: <% tp.file.folder() %>
Creation date: <% tp.file.creation_date("YYYY-MM-DD") %>
```

---

## Example: Enhanced Daily Note

```markdown
---
tags: [journal, daily]
created: <% tp.date.now("YYYY-MM-DD") %>
weekday: <% tp.date.now("dddd") %>
week: <% tp.date.now("YYYY-[W]ww") %>
---

# <% tp.date.now("dddd, MMMM DD, YYYY") %>

## Day Planning

### Top 3 Priorities
1. 
2. 
3. 

### Appointments Today
- 

## Notes

## Daily Review

### What went well?
- 

### What can I improve tomorrow?
- 

---

*Yesterday: [[<% tp.date.now("YYYY-MM-DD", -1) %>]] | Tomorrow: [[<% tp.date.now("YYYY-MM-DD", 1) %>]]*
```

---

## Example: Meeting Notes with Metadata

```markdown
---
tags: [meeting]
date: <% tp.date.now("YYYY-MM-DD") %>
time: <% tp.date.now("HH:mm") %>
---

# Meeting: <% tp.file.title %>

**Date:** <% tp.date.now("MMMM DD, YYYY") %> at <% tp.date.now("HH:mm") %>
**Location:** 

## Attendees

- 

## Agenda

1. 

## Decisions

| # | Decision | Owner | Deadline |
|---|----------|-------|----------|
| 1 | | | |

## Action Items

- [ ] 

## Next Meeting

---

*Created from template on <% tp.date.now("MMMM DD, YYYY [at] HH:mm") %>*
```

---

## Example: Weekly Review

```markdown
---
tags: [review, weekly]
week: <% tp.date.now("YYYY-[W]ww") %>
from: <% tp.date.now("YYYY-MM-DD", -6) %>
to: <% tp.date.now("YYYY-MM-DD") %>
---

# Weekly Review <% tp.date.now("YYYY-[W]ww") %>

*<% tp.date.now("MMM DD", -6) %> – <% tp.date.now("MMM DD, YYYY") %>*

## Retrospective

### What did I accomplish?
- 

### What remained open?
- 

### What did I learn?
- 

## Next Week

### Priorities
1. 
2. 
3. 

### Appointments
- 

---

**Daily notes this week:**
- [[<% tp.date.now("YYYY-MM-DD", -6) %>]]
- [[<% tp.date.now("YYYY-MM-DD", -5) %>]]
- [[<% tp.date.now("YYYY-MM-DD", -4) %>]]
- [[<% tp.date.now("YYYY-MM-DD", -3) %>]]
- [[<% tp.date.now("YYYY-MM-DD", -2) %>]]
- [[<% tp.date.now("YYYY-MM-DD", -1) %>]]
- [[<% tp.date.now("YYYY-MM-DD") %>]]
```

---

## Example: Project Template

```markdown
---
tags: [project]
status: planning
created: <% tp.date.now("YYYY-MM-DD") %>
deadline: 
priority: medium
---

# <% tp.file.title %>

## Summary

## Goals

- [ ] 

## Milestones

| Milestone | Deadline | Status |
|-----------|----------|--------|
| | | ⏳ |

## Resources

- 

## Notes

---

*Project created on <% tp.date.now("MMMM DD, YYYY") %>*
```

---

## Using Templater

### New File from Template

1. `Ctrl+P` → "Templater: Create new note from template"
2. Select template
3. Enter filename
4. Templater replaces all `<% ... %>` expressions

### Insert into Existing File

1. Open an empty file
2. `Ctrl+P` → "Templater: Insert template"
3. Select template
4. Content is inserted at cursor position

---

## Difference from Slatebase Templates

| Feature | Slatebase Templates | Templater |
|---------|-------------------|-----------|
| Placeholders | `{{date}}`, `{{time}}`, `{{title}}` | Full JavaScript syntax |
| Date calculation | No | Yes (`+1`, `-7` etc.) |
| Filename as variable | `{{title}}` | `tp.file.title` |
| Conditional logic | No | Yes (JavaScript) |
| Prompts (user input) | No | Limited in Slatebase |
| Without plugin | Yes | No |

---

## Limitations in Slatebase

| Feature | Status |
|---------|--------|
| Date functions | Works |
| File functions | Works |
| Template insertion | Works |
| User prompts | Limited |
| System commands | Not supported |
| Folder templates (auto) | Not supported |

---

> [!tip] Templater + Calendar
> Combine Templater with the Calendar plugin: Set a Templater-based daily note template. Every calendar click creates a note with dynamically calculated dates.

> [!todo] Exercise
> 1. Install and activate the Templater plugin
> 2. Set the templates folder in plugin settings to `Templates/Templater`
> 3. Create a new file from [[Templates/Templater/Daily Note (Templater)]] (`Ctrl+P` → "Templater")
> 4. Verify that date placeholders were correctly replaced
> 5. Also try [[Templates/Templater/Meeting Notes (Templater)]] and [[Templates/Templater/Weekly Review (Templater)]]
> 6. Then create your own template `Templates/Templater/my-template.md` with `tp.date.now()` and `tp.file.title`
> 7. Test relative dates: yesterday, tomorrow, next week

---

## Related Features

- `Templates/Templater` — Live example templates to try
- [[Features/Templates and Daily Notes]] — Slatebase's built-in templates
- [[Advanced/Plugins/Calendar]] — Calendar with Templater integration
- [[Features/Command Palette]] — Templater commands
- [[Advanced/Obsidian Plugins]] — Plugin basics
