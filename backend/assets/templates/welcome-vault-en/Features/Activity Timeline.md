---
tags: [features]
---

# Activity Timeline

The activity timeline shows, in chronological order, what has happened in your vault: which notes were created, edited, deleted, moved, or restored from the trash — grouped by time (Today, Yesterday, This week, Older) and filterable by event type. You open it as a full tab or compactly in one of the side panels.

Think of it as your vault's journal: not the content of the notes, but the record of what happened to them.

> [!warning] Experimental
> The activity timeline sits behind the `activity-timeline` feature toggle (off by default). If you don't see it, the toggle is off server-side — ask an administrator (see [[Admin/Feature Toggles]]). While the toggle is off, no activity is recorded.

---

## What gets recorded

| Event | When |
|-------|------|
| **Note created** | A new file is saved |
| **Note edited** | An existing file is saved (rapid auto-saves are coalesced into one entry) |
| **Note deleted** | A file is deleted |
| **Note moved** | A file is moved or renamed — as **one** entry carrying the old and new path |
| **Note restored** | A file is brought back from the [[Features/Trash and Versions|Trash]] |

Changes made through the MCP interface (by an AI assistant) appear in the timeline too — it does not matter whether a change came from the browser or an MCP client.

Internal Slatebase files (`.slatebase/`) never appear.

---

## Opening it

- **As a tab:** Run **"Open activity timeline"** from the [[Features/Command Palette|Command Palette]] (`Ctrl+P`). The full view opens with a vertical timeline.
- **In a side panel:** Add the **Activity** view to either side panel — compact and single-column, ideal for watching alongside the editor.

Both show the same events; the sidebar is just the space-saving variant.

---

## Filtering and navigating

- **Filter chips** at the top show or hide event types (Notes, Canvas, Bases, Snippets). Only chips for types that actually occur are shown — no empty lanes.
- **Clicking an entry** opens its file in a tab. A deleted entry is not clickable (there is nothing to open).
- **Load more** fetches older events, one page at a time.
- The list **refreshes live**: save a note and its entry appears without reloading.

---

## Retention

The timeline does not grow forever. Each vault has a retention period (**90 days** by default); older entries are removed by the periodic cleanup job — the same one that empties the trash and prunes old versions.

---

## Tip

> [!tip] Per-vault timeline
> Activity belongs to the vault, not to you alone: anyone with read access to the vault sees the same record, including who triggered each change. In a shared vault, the timeline doubles as a small team log.

---

## Exercise

1. Create a new note, edit it twice in quick succession, then move it to a different folder.
2. Open the activity timeline.
3. You should see: **one** "created", **one** "edited" (the two quick edits coalesced), and **one** "moved" with the old and new path.

---

## Related features

- [[Features/Trash and Versions|Trash and Versions]] — the history *within* a single file
- [[Features/Knowledge Graph|Knowledge Graph]] — the structure of your vault, rather than its chronicle
- [[Features/Context Panel|Context Panel]] — outline, links, tags, and properties of the active note
