---
tags:
  - basics
---

# Navigation and Tabs

Slatebase uses a tab system similar to a browser or code editor. You can keep multiple files open at once and quickly switch between them.

![[Screenshots/tabs-mehrere.png]]

*Multiple open tabs in the tab bar*

---

## Opening Files

There are several ways to open a file:

1. **Click in the Explorer** — A click on a file opens it in a new tab
2. **Click a Wikilink** — In View mode, clicking `[[Filename]]` opens the linked file
3. **Command Palette** — `Ctrl+P` opens the command palette where you can search for files
4. **Quick Switcher** — `Ctrl+O` opens a fuzzy file finder: type a few letters from the filename and matches are ranked by how well they fit. If nothing matches, the Quick Switcher offers to create a new file with that name right away

---

## Back and Forward Navigation

Slatebase remembers which files you've recently visited — similar to a browser's history.

- **Back** (`Alt+←` or the ◀ button left of the tab bar): jumps to the previously visited file
- **Forward** (`Alt+→` or the ▶ button): jumps forward again, if you've used "Back" before

Every navigation counts as a visit — whether you click a file in the explorer, follow a wikilink, open a search result, or use the Quick Switcher. If you navigate to a new file after going "Back" (instead of pressing "Forward" again), the existing forward history is discarded — just like in a browser.

> [!tip] Tip
> The Back button is greyed out as long as there's no previous file. Same for the Forward button, until you've used "Back" at least once.

---

## Managing Tabs

### Closing a Tab

- Click the **×** on the tab
- Or use **Middle mouse button** (scroll wheel click) on the tab

### Reordering Tabs

Drag a tab via **Drag & Drop** to the desired position in the tab bar.

### Active Tab

The active tab is highlighted. The content of this tab is displayed in the main area.

### Switching Tabs by Keyboard

- `Ctrl+Shift+]` — next tab (wraps around to the first tab at the end)
- `Ctrl+Shift+[` — previous tab (wraps around to the last tab at the start)

---

## Breadcrumb Bar

Above the editor, the breadcrumb bar shows the folder path of the open file as a chain of clickable segments — e.g. `MyVault / Projects / Alpha / notes.md`. Clicking a folder segment opens the File Explorer and highlights that folder; clicking the vault name jumps to the root level. For deeply nested paths, the middle folders collapse behind a "…" icon.

For files at the vault root, the bar shows only the vault name and filename. For non-file tabs (e.g. the Knowledge Graph), it stays hidden.

---

## Step by Step: Using Multiple Tabs

1. Open a file in the explorer (e.g., `Start here.md`)
2. Open a second file — it appears as a new tab
3. Click between tabs to switch
4. Close tabs you no longer need with the × icon

---

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Open Command Palette | `Ctrl+P` |
| Open Quick Switcher | `Ctrl+O` |
| Open Settings | `Ctrl+,` |
| Open Search | `Ctrl+Shift+F` |
| Navigate Back | `Alt+←` |
| Navigate Forward | `Alt+→` |
| Next Tab | `Ctrl+Shift+]` |
| Previous Tab | `Ctrl+Shift+[` |

> [!tip] Tip
> Keyboard shortcuts can be customized under **Settings → Keybindings**. More on this in the guide [[Advanced/Custom Keybindings|Custom Keybindings]].

---

## File Navigation

### Recently Opened Files

In the left sidebar you'll find the **Recently Opened** list. It shows the last 20 files you've edited — handy for quickly returning to a recently visited note.

### Favorites

Frequently used files can be marked as **Favorites** (star icon in the explorer). They then appear in the favorites section of the sidebar.

### Follow Active File in Explorer

Under **Settings → Vault Configuration** there's a toggle "Follow active file in explorer". When enabled, the File Explorer automatically expands the relevant folders and scrolls to the file whenever the active tab changes — no need to manually hunt through the explorer to see where you are. The toggle is off by default and applies instantly, no save button needed.

---

## Practical Example

Imagine you're working on a project with multiple notes:

1. Open the **project overview** as your starting point
2. Open the **meeting notes** in a second tab
3. Keep the **TODO list** in a third tab
4. Switch between tabs as needed

This way you have all relevant information at hand without constantly navigating back and forth.

---

> [!todo] Exercise
> Open 3 different files from this vault in separate tabs:
> 1. This file (already open)
> 2. [[Basics/Markdown Syntax|Markdown Syntax]]
> 3. [[Start here|Start here]]
>
> Now switch between the tabs and close one of them.

---

## Related Pages

- [[Basics/File Explorer|File Explorer]] — Next guide
- [[Features/Command Palette|Command Palette]] — Quick access to everything
- [[Advanced/Custom Keybindings|Custom Keybindings]] — Define your own shortcuts
