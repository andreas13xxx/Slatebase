---
tags: [practice]
---

# Exercise 2 — Linking Notes

**Difficulty:** :star::star: Medium
**Duration:** ~10 minutes

---

## Goal

You'll create wikilinks between notes, discover backlinks, and explore your connections in the Knowledge Graph.

## Prerequisites

- Exercise 1 completed (Sandbox folder and first note exist)
- You know how to create files and switch between Edit/View mode

---

## Steps

> [!todo] Step 1: Create a second note
> 1. Right-click on the `Sandbox` folder → **New File**
> 2. Name it `Ideas`
> 3. Write the following:
>
> ```markdown
> # My Ideas
>
> Things I want to explore further:
>
> - [[Sandbox/My Note|My first note]] has the basics
> - I should learn about [[Features/Tags and Properties|Tags]]
> - The [[Features/Knowledge Graph]] looks interesting
>
> #ideas #practice
> ```

> [!todo] Step 2: Create a third note with cross-links
> 1. Create a new file `Sandbox/Questions`
> 2. Write:
>
> ```markdown
> # Open Questions
>
> ## About Linking
>
> - How many links should a note have?
> - See [[Sandbox/Ideas]] for topic ideas
> - Related: [[Sandbox/My Note#Next Steps]]
>
> ## About Organization
>
> - What folder structure works best?
> - See [[Basics/File Explorer]] for tips
> ```

> [!todo] Step 3: Check backlinks
> 1. Open `Sandbox/My Note` 
> 2. Look at the Context Panel on the right
> 3. In the **Links** section, find "Backlinks"
> 4. You should see `Sandbox/Ideas` listed as a backlink

> [!todo] Step 4: Explore the Graph
> 1. Open the Knowledge Graph (Command Palette → "Knowledge Graph")
> 2. Find your Sandbox notes — they should be connected
> 3. Click on a node to see its connections highlighted
> 4. Double-click to open the file

> [!todo] Step 5: Create a broken link
> 1. In any file, add: `[[Sandbox/Future Plans]]`
> 2. Switch to View mode — the link appears with a dashed underline (broken)
> 3. Click on it — Slatebase offers to create the file

---

## Success Criteria

- [ ] Three files exist in `Sandbox/` with links between them
- [ ] Backlinks appear in the Context Panel
- [ ] The Knowledge Graph shows your connected notes
- [ ] You understand the difference between resolved and broken links

---

## What You Learned

- Creating wikilinks with `[[Target]]` and aliases `[[Target|Display]]`
- Linking to specific headings `[[File#Heading]]`
- Discovering backlinks in the Context Panel
- Exploring connections in the Knowledge Graph
- How broken links work and how to resolve them

---

## Continue

:arrow_right: [[Exercise 3 - Organize Project]] — Now organize a complete project with folders, tags, and templates
