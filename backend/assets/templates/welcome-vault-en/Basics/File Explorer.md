---
tags:
  - basics
---

# File Explorer

The File Explorer is the left panel in Slatebase. It shows all files and folders in your vault and lets you create, rename, move, and organize them.

![[Screenshots/datei-explorer.png]]

*The file explorer with folder structure*

---

## Creating Files and Folders

### New File

1. Click the **file-with-plus** icon (📄+) at the top of the explorer
2. Enter a filename (e.g. `My Note.md`)
3. Confirm with Enter

Alternatively, right-click on a folder → **New File**.

### Create New Vault

1. Click the **+** icon at the top of the explorer
2. Enter a vault name (1–128 characters)
3. Confirm with Enter

The new vault appears immediately in the file explorer as its own section.

### New Folder

1. Right-click in the explorer
2. Select **New Folder**
3. Enter a name and confirm with Enter

---

## Renaming

1. Right-click on the file or folder
2. Select **Rename**
3. Change the name and confirm with Enter

> [!tip] Tip
> When you rename a file, all wikilinks pointing to it are updated automatically — everywhere in the vault, not just in the file you happen to have open. You don't need to fix links manually.

---

## Moving Files

### Via Drag & Drop

1. Click and hold a file or folder
2. Drag it to the target folder
3. Release — the file is moved

### Via Context Menu

1. Right-click on the file
2. Select **Move to...**
3. Choose the target folder

### Links Survive the Move

Just like renaming, moving a file or folder automatically rewrites every wikilink elsewhere in the vault that pointed at the old location — including links that only use the bare filename (e.g. `[[Pasta]]`) rather than a full path, and even when you move a whole folder full of files at once.

#### Live Example

1. Create a folder `Sandbox/Recipes` and, inside it, a file `Sandbox/Recipes/Pasta.md`
2. Create a second file `Sandbox/Notes.md` and write `[[Pasta]]` in it — a bare link, no folder path
3. Open `Sandbox/Notes.md` — the link resolves normally to `Sandbox/Recipes/Pasta.md`
4. Now move `Sandbox/Recipes/Pasta.md` out of `Recipes/`, straight into `Sandbox/` (drag & drop or **Move to...**)
5. Reopen `Sandbox/Notes.md` — `[[Pasta]]` still resolves, now pointing at the new location, even though the link never mentioned a folder to begin with

---

## Context Menu

![[Screenshots/datei-explorer-kontextmenu.png]]

*Context menu via right-click*

Right-clicking on a file or folder opens the context menu with these options:

| Option | Description |
|--------|-------------|
| New File | Create a new file in this folder |
| New Folder | Create a new subfolder |
| Rename | Rename the element |
| Delete | Move to trash |
| Copy Path | Copy the file path to clipboard |
| Add to Favorites | Bookmark this file (or click the star icon next to the filename) |

---

## Favorites

Frequently used files can be marked as favorites:

1. Right-click on a file → **Add to Favorites**
2. Or click the **star icon** next to the filename

Favorites appear both at the top of the sidebar and in a dedicated **Bookmarks** view (a tab in the left sidebar), where you can reorder them by drag-and-drop, rename them, and manage them via right-click — see the [[Features/Bookmarks|Bookmarks guide]] for details.

---

## Vault Statistics

Hover over the vault name in the explorer to see statistics:
- Number of files
- Number of folders
- Total vault size

---

## Practical Example

A good folder structure for a project vault might look like this:

```
Projects/
  Project A/
    Notes/
    Meetings/
    Resources/
  Project B/
    ...
Archive/
Templates/
Daily Notes/
```

> [!tip] Best Practice
> Keep your structure flat rather than deeply nested. 2–3 levels of folders are usually enough. Use [[Features/Tags and Properties|Tags]] for cross-cutting categorization instead of creating extra folders.

---

> [!todo] Exercise
> 1. Create a new folder called `Sandbox` in this vault
> 2. Create a new file `Test Note` inside it
> 3. Rename the file to `My First Note`
> 4. Drag it to a different location, then drag it back

---

## Related Pages

- [[Basics/Editor and Viewer|Editor and Viewer]] — Next guide
- [[Features/Bookmarks|Bookmarks]] — Reorder, rename, and other bookmark types
- [[Features/Vault Management|Vault Management]] — Creating and managing vaults
- [[Features/Trash and Versions|Trash and Versions]] — Restoring deleted files
