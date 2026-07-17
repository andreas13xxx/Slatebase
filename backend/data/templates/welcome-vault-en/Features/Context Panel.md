---
tags: [features]
---

# Context Panel

The Context Panel is the right sidebar that shows information about the currently open file — outline, links, tags, and properties at a glance.

![[Screenshots/context-panel.png]]

*The Context Panel shows outline, links, and tags*

---

## Sections

The panel has four main sections:

### Outline

Shows the heading structure of the current file. Click a heading to jump to that section.

### Links

- **Forward links** — Files that the current file links to
- **Backlinks** — Files that link back to the current file
- Unresolved links are shown separately

### Tags

All tags used in the current vault, with counts. Expand a tag to see which files use it.

### Properties

The YAML frontmatter of the current file displayed as a readable key-value table.

---

## Tab Management

Each section is accessible via tabs in the panel header. You can:

- **Reorder tabs** — Drag and drop tabs to change their order
- **Split sections** — Drag a tab down to create a vertical split (view two sections at once)

---

## Opening the Context Panel

The Context Panel is visible by default on the right side. If it's hidden:

| Method | Description |
|--------|-------------|
| Command Palette | Search for "Context Panel" |
| Drag the right edge | Pull the panel open from the right |

---

## Practical Example

1. Open any file with wikilinks (e.g., [[Start here]])
2. Look at the Context Panel on the right
3. Check the **Links** section — you'll see forward links and backlinks
4. Check the **Outline** — the heading structure is clickable
5. Check **Tags** — expand a tag to see all files using it

---

## Split View

To view two sections simultaneously:

1. Grab a tab in the Context Panel
2. Drag it downward
3. A split indicator appears — release to create a vertical split
4. Now both sections are visible at the same time

This is useful for seeing the outline and backlinks together while editing.

---

> [!tip] Tip: Backlinks Discovery
> The backlinks section is one of the most powerful features for rediscovering connections. Even if you forget where you mentioned something, backlinks show you all references automatically.

> [!todo] Exercise
> 1. Open this file and check the Context Panel
> 2. How many backlinks does this file have?
> 3. Click on the Outline section and navigate to a heading
> 4. Try splitting: drag the Tags tab below the Links section

---

## Related Features

- [[Features/Wikilinks]] — Creating links between notes
- [[Features/Knowledge Graph]] — Visual representation of connections
- [[Features/Tags and Properties]] — Tags and frontmatter
