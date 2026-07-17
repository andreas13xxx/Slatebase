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

1. Right-click in the explorer on a free area or a folder
2. Select **New File**
3. Enter a name (without `.md` — the extension is added automatically)
4. Confirm with Enter

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
> When you rename a file, all wikilinks pointing to it are updated automatically. You don't need to fix links manually.

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

---

## Favorites

Frequently used files can be marked as favorites:

1. Right-click on a file
2. Select **Add to Favorites**
3. The file appears in the favorites section of the sidebar

To remove a favorite, right-click and select **Remove from Favorites**.

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
- [[Features/Vault Management|Vault Management]] — Creating and managing vaults
- [[Features/Trash and Versions|Trash and Versions]] — Restoring deleted files
