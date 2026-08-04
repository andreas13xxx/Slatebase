---
tags: [advanced, plugins]
---

# Kanban Plugin

The Kanban plugin transforms Markdown files into visual Kanban boards. You organize tasks in columns (e.g. "To Do", "In Progress", "Done") and move cards via drag and drop.

---

## Prerequisites

- Feature toggle `obsidian-plugin-compat` enabled
- Kanban plugin installed and activated
- Plugin ZIP from GitHub: `obsidian-kanban`

---

## Installation

1. Download plugin ZIP from GitHub
2. Settings → Vault → Plugins → "Install Plugin"
3. Upload ZIP → Activate

---

## Creating a Board

### Via Command Palette

1. `Ctrl+P` → "Kanban: Create new board"
2. Enter filename (e.g. `Project Board`)
3. The board opens in Kanban view

### Manually (Markdown)

Create a `.md` file with the following format:

```markdown
---
kanban-plugin: basic
---

## To Do

- [ ] Conduct research
- [ ] Identify stakeholders
- [ ] Create budget

## In Progress

- [ ] Write project plan
- [ ] Assemble team

## Done

- [x] Hold kickoff meeting
- [x] Set up repository
```

> [!tip] File Format
> Kanban boards are regular Markdown files with the frontmatter field `kanban-plugin: basic`. You can edit them as text or display them in Kanban view at any time.

---

## Board Controls

### Cards

| Action | Description |
|--------|-------------|
| Create card | "+" button at the bottom of a column |
| Edit card | Click on the card text |
| Move card | Drag and drop between columns |
| Delete card | Context menu or remove checkbox |

### Columns

| Action | Description |
|--------|-------------|
| Add column | "+" button on the right |
| Rename column | Click on column title |
| Move column | Drag and drop the column |

---

## Example: Project Management Board

```markdown
---
kanban-plugin: basic
---

## Backlog

- [ ] Feature A: Extend user profiles
- [ ] Feature B: Export function
- [ ] Bug: Login redirect broken

## Active Sprint

- [ ] Feature C: Dashboard widgets #high-priority
- [ ] Update documentation

## In Review

- [ ] API refactoring #backend
- [ ] Design review landing page

## Done

- [x] Migrate database schema
- [x] Set up CI/CD pipeline
- [x] Implement onboarding flow
```

---

## Example: Personal Task Board

```markdown
---
kanban-plugin: basic
---

## This Week

- [ ] Schedule doctor appointment
- [ ] Prepare tax return
- [ ] Buy birthday gift

## Someday

- [ ] Clean apartment
- [ ] Start new book
- [ ] Declutter basement

## Waiting For

- [ ] Response from landlord
- [ ] Package delivery

## Done

- [x] Grocery shopping
- [x] Wash car
```

---

## Example: Content Planning

```markdown
---
kanban-plugin: basic
---

## Ideas

- [ ] Blog post: "10 Markdown Tips"
- [ ] Video: Vault organization tutorial
- [ ] Podcast episode: Knowledge management

## Research

- [ ] Blog post: "API Design Best Practices" #research

## Draft

- [ ] Newsletter Week 12

## Published

- [x] Blog post: "Slatebase Introduction"
- [x] Newsletter Week 11
```

---

## Markdown Integration

Since Kanban boards are Markdown, you can combine them with other Slatebase features:

### Wikilinks in Cards

```markdown
- [ ] [[Projects/API-Redesign|API Redesign]] complete
```

### Tags for Filtering

```markdown
- [ ] Finish design #design #high-priority
- [ ] Backend API #backend
```

### Embeds

You can embed a Kanban board in other notes:
```markdown
Current sprint status:
![[Project Board]]
```

---

## Limitations in Slatebase

| Feature | Status |
|---------|--------|
| Create and edit board | Works |
| Drag and drop cards | Works |
| Add/edit columns | Works |
| Markdown editing | Works |
| Date picker in cards | Limited |
| Card metadata (tags, dates) | Text-based |

---

> [!tip] Board as Project Overview
> Create a Kanban board for each project and link to it from the project overview note. This gives you the current status at a glance.

> [!todo] Exercise
> 1. Install and activate the Kanban plugin
> 2. Create a new board via Command Palette (`Ctrl+P` → "Kanban")
> 3. Add three columns: "To Do", "In Progress", "Done"
> 4. Create 5 cards in "To Do"
> 5. Move 2 cards to "In Progress"
> 6. Move 1 card to "Done"
> 7. Open the file in Source mode and check the Markdown structure
> 8. Add a wikilink to a card entry (e.g. `[[Project Note]]`)

---

## Live Example

The following board renders as a Kanban board when the plugin is activated:

→ [[Advanced/Plugins/Example-Kanban-Board]]

---

## Related Features

- [[Features/Canvas]] — Visual board (alternative without plugin)
- [[Features/Tags and Properties]] — Use tags in cards
- [[Advanced/Obsidian Plugins]] — Plugin basics
- [[Practice/Plugins/Create Kanban Board]] — Hands-on exercise
