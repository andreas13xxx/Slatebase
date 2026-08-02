---
tags: [practice]
---

# Exercise 3 — Organize a Project

**Difficulty:** :star::star: Medium
**Duration:** ~15 minutes

---

## Goal

You'll create a project structure with folders, tags, and templates — simulating a realistic workflow.

## Prerequisites

- Exercises 1 and 2 completed
- You know how to create files, folders, and links

---

## Steps

> [!todo] Step 1: Create a project folder structure
> 1. Create a folder `Projects` in the vault root
> 2. Inside it, create `Projects/Website Relaunch`
> 3. Inside that, create:
>    - `Projects/Website Relaunch/Notes`
>    - `Projects/Website Relaunch/Meetings`
>    - `Projects/Website Relaunch/Resources`

> [!todo] Step 2: Create a project overview using a template
> 1. Right-click → **New from Template**
> 2. Select "Project Overview" (from the Templates folder)
> 3. Name it `Overview` and save in `Projects/Website Relaunch/`
> 4. Fill in the template:
>    - Project goal: "Redesign and relaunch company website"
>    - Add 3 milestones
>    - Add 2 team members

> [!todo] Step 3: Create tagged notes
> 1. Create `Projects/Website Relaunch/Notes/Design Ideas.md`:
>
> ```markdown
> ---
> tags: [project/website, design]
> ---
>
> # Design Ideas
>
> - Modern, minimalist look
> - Dark mode support
> - Mobile-first approach
>
> See also: [[Projects/Website Relaunch/Overview]]
> ```
>
> 2. Create `Projects/Website Relaunch/Notes/Tech Stack.md`:
>
> ```markdown
> ---
> tags: [project/website, tech]
> ---
>
> # Tech Stack
>
> | Technology | Purpose |
> |-----------|---------|
> | React | Frontend |
> | Node.js | Backend |
> | PostgreSQL | Database |
>
> Links to: [[Projects/Website Relaunch/Notes/Design Ideas]]
> ```

> [!todo] Step 4: Use the Context Panel for tags
> 1. Open the Context Panel
> 2. Go to the Tags section
> 3. Expand `project/website` — you should see your new files
> 4. Notice how nested tags create a hierarchy

> [!todo] Step 5: Link back to the overview
> 1. Open `Projects/Website Relaunch/Overview`
> 2. Add links to your new notes at the bottom:
>
> ```markdown
> ## Related Notes
>
> - [[Projects/Website Relaunch/Notes/Design Ideas]]
> - [[Projects/Website Relaunch/Notes/Tech Stack]]
> ```

---

## Success Criteria

- [ ] Folder structure: `Projects/Website Relaunch/Notes`, `/Meetings`, `/Resources`
- [ ] Project overview created from template with filled content
- [ ] Two tagged notes with cross-references
- [ ] Tags visible in the Context Panel
- [ ] Links between overview and detail notes

---

## What You Learned

- Creating hierarchical folder structures
- Using templates to scaffold documents
- Applying tags (including nested tags) for categorization
- Building cross-references between project files
- Using the Context Panel to navigate by tags

---

## Continue

:arrow_right: [[Exercise 4 - Master Search]] — Learn powerful search and replace techniques
