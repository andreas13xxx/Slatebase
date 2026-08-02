---
tags: [practice, plugins]
---

# Exercise — Create Kanban Board

**Difficulty:** :star::star: Medium
**Duration:** ~10 minutes
**Prerequisite:** Kanban plugin installed and activated

---

## Goal

You create a working Kanban board for a sample project and learn how boards work as Markdown files.

---

## Steps

> [!todo] Step 1: Create Board File
> 1. Create a new file `Practice/Plugins/My Sprint Board.md`
> 2. Add the following content:
>
> ```markdown
> ---
> kanban-plugin: basic
> ---
>
> ## Backlog
>
> - [ ] Implement user profiles
> - [ ] Write API documentation
> - [ ] Extend search function
> - [ ] Run performance tests
>
> ## Active Sprint
>
> - [ ] Redesign login page #design
> - [ ] Update database schema #backend
>
> ## In Review
>
> - [ ] Email notifications #feature
>
> ## Done
>
> - [x] Complete project setup
> - [x] Set up CI/CD
> ```

> [!todo] Step 2: Open Board in Kanban Mode
> 1. Open the created file
> 2. The Kanban plugin should automatically render it as a board
> 3. You see 4 columns with cards

> [!todo] Step 3: Move Cards
> 1. Drag "Redesign login page" from "Active Sprint" to "In Review"
> 2. Drag "Implement user profiles" from "Backlog" to "Active Sprint"
> 3. Drag "Email notifications" from "In Review" to "Done"

> [!todo] Step 4: Add New Card
> 1. Click the "+" button in the "Backlog" column
> 2. Enter: `Create user dashboard #feature`
> 3. Confirm with Enter

> [!todo] Step 5: Check Markdown
> 1. Switch to Source mode (Editor)
> 2. Observe: Moved cards now appear in new sections
> 3. The Markdown structure reflects the board status

> [!todo] Step 6: Wikilinks in Cards
> 1. Switch back to Kanban mode
> 2. Edit a card and add a wikilink:
>    `[[Practice/Plugins/My Sprint Board|Sprint Board]] Review`
> 3. The link becomes clickable in the board

---

## Success Criteria

- [ ] Board is displayed as Kanban (not as Markdown)
- [ ] At least 2 cards were moved between columns
- [ ] A new card was added
- [ ] In Source mode, the Markdown structure is visible
- [ ] At least one card contains a wikilink

---

## Bonus Task

Create a personal weekly board:

```markdown
---
kanban-plugin: basic
---

## Monday

- [ ] 

## Tuesday

- [ ] 

## Wednesday

- [ ] 

## Thursday

- [ ] 

## Friday

- [ ] 
```

Fill it with your actual tasks for the week.

---

## Continue

- [[Practice/Plugins/Dataview Queries]] — Query dynamic data
- [[Advanced/Plugins/Kanban]] — Full Kanban documentation
