---
tags: [features]
---

# Templates and Daily Notes

Templates are reusable file blueprints. Daily Notes create a new note for each day with a predefined structure — perfect for journaling, task tracking, or logging.

![[Screenshots/template-auswahl.png]]

*The template selector when creating a new file*

---

## Templates

### What are Templates?

Templates are Markdown files stored in a designated folder (default: `Templates/`). When you create a new file from a template, its content is copied and placeholders are replaced.

### Placeholders

| Placeholder | Replaced with |
|-------------|---------------|
| `{{date}}` | Current date (YYYY-MM-DD) |
| `{{time}}` | Current time (HH:MM) |
| `{{title}}` | The filename you chose |

### Using a Template

1. Right-click in the file explorer → **New from Template**
2. Select a template from the list
3. Enter a filename
4. The file is created with the template content (placeholders filled)

### Configuring the Templates Folder

By default, Slatebase looks for templates in `Templates/`. You can change this:

**Settings → Vault → Templates Directory**

---

## Daily Notes

### What are Daily Notes?

A daily note is a file named with today's date (e.g., `2025-07-15.md`). It's created from your daily note template with one click or shortcut.

### Creating a Daily Note

| Method | Description |
|--------|-------------|
| Sidebar button | Click the calendar icon in the toolbar |
| Command Palette | Search for "Daily Note" |

If a note for today already exists, it's opened instead of creating a new one.

### Daily Note Template

The daily note uses the template specified in your vault settings. A typical daily note template:

```yaml
---
tags: [daily]
date: "{{date}}"
---

# {{date}}

## Tasks

- [ ] 

## Notes



## Reflection


```

### Configuring the Daily Notes Folder

**Settings → Vault → Daily Notes Directory**

By default, daily notes are created in the vault root. You can specify a subfolder (e.g., `Daily Notes/`).

---

## Practical Example

1. Check that a `Templates/` folder exists in your vault
2. Create a file `Templates/Quick Note.md`:
   ```markdown
   ---
   tags: [note]
   created: "{{date}}"
   ---
   
   # {{title}}
   
   Created on {{date}} at {{time}}.
   
   ## Content
   
   
   ```
3. Now right-click → **New from Template** → select "Quick Note"
4. Enter a name — the placeholders are filled automatically

---

> [!tip] Template Ideas
> - **Meeting notes** — Date, participants, agenda, action items
> - **Project overview** — Goals, status, milestones, team
> - **Reading notes** — Title, author, key takeaways, rating
> - **Weekly review** — Wins, challenges, plans for next week

> [!todo] Exercise
> 1. Check the `Templates/` folder in this vault — it contains example templates
> 2. Create a new file from the "Daily Note" template
> 3. Verify that `{{date}}` was replaced with today's date
> 4. Try creating a daily note via the sidebar button or Command Palette

---

## Related Features

- [[Features/Command Palette]] — Quick access to daily notes
- [[Features/Tags and Properties]] — Frontmatter in templates
- [[Features/Settings]] — Configure template and daily notes directories
