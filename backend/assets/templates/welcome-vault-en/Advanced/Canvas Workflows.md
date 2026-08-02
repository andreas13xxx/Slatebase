---
tags: [advanced]
---

# Canvas Workflows

The Canvas feature is not just for free-form notes — it's a powerful planning tool. This guide shows practical workflows for brainstorming, project planning, and mind mapping.

---

## Brainstorming

### How to Use Canvas for Brainstorming

1. Create a new canvas (`Brainstorm.canvas`)
2. Add text nodes for each idea (double-click to create)
3. Don't filter — capture everything first
4. After capturing, group related ideas
5. Connect ideas that relate to each other with edges

### Tips

- Use **colors** to categorize (green = do, yellow = maybe, red = won't do)
- Keep nodes small — one idea per node
- Add a "Parking Lot" group for ideas to revisit later

---

## Project Planning

### Visual Project Board

Create a canvas that mirrors a Kanban board:

1. Create group nodes for columns: "To Do", "In Progress", "Done"
2. Add text nodes for each task
3. Drag tasks between groups as they progress
4. Connect dependent tasks with edges

### Linking to Project Files

Use file nodes to reference detailed notes:
- Project plan as a file node
- Meeting notes as file nodes
- Connect them with edges to show relationships

---

## Mind Mapping

### Building a Mind Map

1. Start with a central text node (your main topic)
2. Add branch nodes around it (subtopics)
3. Connect the center to each branch
4. Add leaf nodes to branches for details
5. Use colors to distinguish branches

### Example Structure

```
            [Research]
               |
[Planning] -- [Main Topic] -- [Implementation]
               |
           [Testing]
```

---

## File-Node Linking

### Integrating Vault Content

File nodes embed vault files directly in the canvas:

1. Drag a file from the explorer onto the canvas
2. The file content is previewed inside the node
3. Double-click the file node to open the full file

### Use Cases

- **Architecture diagrams** — Arrange file nodes showing different modules
- **Literature review** — File nodes for each paper/source, edges for connections
- **Meeting preparation** — Relevant notes arranged visually for discussion

---

## Workflow: Weekly Review

1. Create a canvas for your weekly review
2. Add file nodes for each day's daily note
3. Add text nodes for wins, challenges, and goals
4. Connect insights across days
5. Create action items as text nodes for next week

---

> [!tip] Canvas Best Practices
> - Save canvases in a dedicated `Canvas/` folder
> - Name them descriptively: `Project Alpha - Architecture.canvas`
> - Use the minimap for large canvases
> - Source view is useful for precise position adjustments

> [!todo] Exercise
> 1. Create a new canvas
> 2. Build a simple mind map: central node + 3 branches + 2 leaves each
> 3. Color-code the branches (right-click → Color)
> 4. Add one file node linking to an existing file
> 5. Try the minimap to navigate your canvas

---

## Related Features

- [[Features/Canvas]] — Canvas basics
- [[Features/Knowledge Graph]] — Automatic visualization (vs. manual canvas)
- [[Features/Wikilinks]] — Text-based linking alternative
