---
tags: [advanced, plugins]
---

# Iconize Plugin

Iconize (`obsidian-icon-folder`) assigns custom icons to files and folders that appear before the name in the file tree. It also ships a searchable icon picker with several loadable icon packs (Boxicons, Feather, Simple Icons, Tabler, Lucide, …).

> [!warning] Core feature limited in Slatebase
> Iconize assigns icons via direct DOM access to the file explorer (`fileExplorer.view.fileItems[path]` → `titleEl.querySelector('.iconize-icon')`). Slatebase's file tree is React-rendered and doesn't expose that structure. The plugin installs, activates, and its icon picker opens normally — but the core feature, **showing icons in the file tree, doesn't work reliably**. Similar file-explorer extensions (e.g. File Explorer Note Count, Folder Notes) are likely affected the same way.

---

## Prerequisites

- Feature toggle `obsidian-plugin-compat` enabled
- Iconize plugin installed and activated
- Plugin ZIP from GitHub: `obsidian-icon-folder` (repository [florianwoelki/obsidian-iconize](https://github.com/florianwoelki/obsidian-iconize))

---

## Installation

1. Download the plugin ZIP from GitHub (or install it via the Community Plugin browser)
2. Settings → Vault → Plugins → "Install Plugin"
3. Upload ZIP → Activate

---

## Assigning an Icon (Core Feature)

1. Right-click a file or folder in the file tree
2. Select "Change icon" from the context menu
3. Browse or search the icon picker
4. Select an icon

In real Obsidian, the icon then appears before the file/folder name in the file tree. In Slatebase, the picker opens and you can make a selection, but the icon itself usually doesn't show up in the file tree (see the warning above) — the rest of the plugin (settings, icon pack management) works independently of that.

---

## Loading Icon Packs

Iconize downloads additional icon packs as a ZIP from GitHub on demand:

| Icon pack | Description |
|-----------|-------------|
| Boxicons | Large, general-purpose icon set |
| Feather | Minimalist outline icons |
| Simple Icons | Brand and product logos |
| Tabler | Large outline icon set |
| Lucide | Overlaps partly with Slatebase's built-in icons |

The download goes through `requestUrl()` and works in principle in Slatebase, but is also subject to the backend proxy's network allowlist.

---

## Limitations in Slatebase

| Feature | Status |
|---------|--------|
| Install/activate plugin | Works |
| Open and browse icon picker | Works |
| Load icon packs | Works (subject to network allowlist) |
| Show icon in the file tree | Limited — usually not visible |
| Icon in note titles/tabs | Not supported |

---

> [!tip] Alternative for visible file distinction
> As long as Iconize icons don't reliably show up in the file tree, emoji prefixes in the filename itself (e.g. `📌 Important Note.md`) or consistent naming conventions work better for visual distinction in Slatebase.

> [!todo] Exercise
> 1. Install and activate the Iconize plugin
> 2. Open the icon picker by right-clicking a file in the file tree
> 3. Select an icon from one of the bundled icon packs
> 4. Check whether the icon appears in the file tree
> 5. Load an additional icon pack as a test (e.g. Boxicons)

---

## Related Features

- [[Advanced/Obsidian Plugins]] — Plugin basics
- [[Advanced/Plugins/Calendar]] — Another tested plugin with sidebar integration
