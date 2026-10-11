---
tags: [features]
---

# Split Panes

Split panes let you work on several notes side by side at once. You divide the editor area into two or more **panes** — each pane has its own tab bar and shows a different note. Compare two documents, keep a reference open while writing in another, or hold an overview next to the detail.

Think of it like split windows in an editor: one workspace, several viewpoints.

---

## Splitting a pane

You always split the **active** pane (the one you last clicked in):

- **Via the [[Features/Command Palette|Command Palette]]** (`Ctrl+P`): **"Split right"** places the new pane beside the current one (side by side), **"Split down"** below it (stacked). Both start showing the same note — just like Obsidian.
- **By dragging a tab:** Drag a tab to the **edge** of a pane (top, bottom, left, right). A drop zone lights up; releasing there creates a new pane in that direction and moves the tab into it.

A newly created pane automatically becomes the active one.

---

## Moving tabs between panes

Each pane has its **own file-tab bar**:

- **Drag into another pane:** Drag a tab onto another pane's tab bar — it moves there.
- **Within the same pane:** Dragging just reorders the tabs (as before).

Settings/page tabs (Profile, Admin, etc.) stay in the app-level bar at the top — they aren't editor-pane content.

---

## Resizing

Between two panes sits a **resize handle**. Drag it with the mouse to change the ratio. The handle is keyboard-operable too (focus with `Tab`, then arrow keys) — accessible, with the value announced.

A pane can't shrink below a minimum size, so no pane collapses to zero.

---

## Closing panes

- Close the **last tab** of a pane and the pane disappears; the others take its place.
- The **last remaining pane** always stays (empty if need be) — there's always at least one workspace.

---

## Your layout is remembered

Your split layout is saved per vault: structure, sizes, open tabs, and the active pane. After a page **reload** your layout is back (tab content is re-fetched fresh). Switch vaults and back, and each vault keeps its own layout.

> [!note] From single tabs to panes
> A workspace saved before this feature (a single tab row) is automatically carried over into a single pane on first load — you won't lose any open tabs.

---

## Plugins

Obsidian plugins that offer "open in a split" (`createLeafBySplit`, `splitActiveLeaf`, "Open to the right") now create a real pane instead of just a new tab. The plugin's view lands in the new pane.

---

## Tip

> [!tip] Easy comparison
> Open two versions or two related notes side by side: open a note, run **"Split right"**, then in the new pane use the [[Features/Command Palette|Quick Switcher]] (`Ctrl+O`) to open the second note. Now you see both at once.

---

## Exercise

1. Open any note.
2. Run **"Split right"** from the Command Palette — the editor now shows two panes side by side.
3. Open a second note in the right pane (`Ctrl+O`).
4. Drag the resize handle in the middle to make the panes different widths.
5. Reload the page — your split layout is back.

---

## Related features

- [[Features/Command Palette|Command Palette]] — the split commands and the Quick Switcher
- [[Features/Bookmarks|Bookmarks]] — pull frequently used notes into a pane fast
- [[Features/Live Preview Editor|Live Preview Editor]] — each pane has its own editor mode
