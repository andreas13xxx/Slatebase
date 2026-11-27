---
tags: [advanced, plugins]
---

# Nested Properties Plugin

Nested Properties (by mnaoumov) shows nested frontmatter values in the properties editor as collapsible groups — objects inside objects, lists with mixed entries — and makes them editable there. Obsidian's built-in properties editor cannot display nested objects on its own; this plugin fills exactly that gap.

> [!example] Live examples in this vault
> Three notes with real nested frontmatter to try right away:
> - [[Advanced/Plugins/Example-Address (Nested Properties)]] — address with a `geo` sub-object (`latitude`/`longitude`)
> - [[Advanced/Plugins/Example-Project (Nested Properties)]] — project with several levels of sub-objects
> - [[Advanced/Plugins/Example-Mixed-List (Nested Properties)]] — list with text, number, boolean and objects

> [!warning] Experimental
> Plugin compatibility in Slatebase is experimental. An admin must enable the `obsidian-plugin-compat` feature (Admin → Feature Toggles, see [[Admin/Feature Toggles]]), otherwise there is no plugin management.

---

## Prerequisites

- Feature toggle `obsidian-plugin-compat` enabled
- Nested Properties plugin installed and activated

---

## Installation

1. Open **Plugin Management** → tab **"Available Plugins"** and search for "Nested Properties"
2. Click **Install**, then switch on the **activation toggle**
3. Open one of the example notes above and look at its properties

Not listed, or need a specific fork/version? Download the plugin ZIP from GitHub and use **"Installed Plugins" → Upload plugin** instead.

---

## What you see without the plugin

Without the plugin, the properties editor still shows nested values (an object, or a list with more than just text) as a small YAML field ("Nested value (YAML)"). You edit the value there as YAML text; invalid YAML is reported as such. With the plugin, a group view replaces this field.

---

## Using the properties editor

The properties editor appears in the sidebar (**Properties** tab), as the properties block at the top of a note in Live Preview, and in the hover preview.

- **Expand/collapse groups** — Nested values appear as a group with an arrow. Clicking it opens or closes the group; as in Obsidian, the arrow points down when the group is open.
- **Change the type via the icon** — Clicking the icon in front of a property's name opens the type menu (text, number, date, and so on). This applies to top-level properties.
- **Add a property** — At the bottom of the editor via **Add property**. Inside a group, the plugin brings its own buttons for adding entries.
- **Change values** — A value is applied when you leave the field or press Enter. Slatebase writes the frontmatter back losslessly, including nested objects and mixed lists.

> [!info] Types
> The menu shows which types are available; assigning a type to a key applies to the whole vault ([[Features/Tags and Properties]]).

---

## Reading vs. editing view

| View | Behavior |
|------|----------|
| Source / Live Preview, sidebar | Editable, if you have write access to the vault |
| Reading view | Display only — groups can be expanded and collapsed, but nothing can be changed, added, deleted or retyped |
| Hover preview | Editable with write access, display only otherwise |

The reading view draws the values with the same plugin widget as the editor, just frozen: inputs are disabled, buttons hidden.

---

## Limitations

- If the plugin reports something it cannot do in Slatebase, it appears in the browser console (F12).
- Not checked and therefore not described here: how nested keys behave in Bases queries and in the properties overview.

---

> [!todo] Exercise
> 1. Install and activate the Nested Properties plugin
> 2. Open [[Advanced/Plugins/Example-Address (Nested Properties)]] and expand the `address` group and `geo` inside it
> 3. Change the `latitude` and leave the field — check in source mode that only this line of the frontmatter changed
> 4. Switch to reading view and check that the values can no longer be changed
> 5. Open [[Advanced/Plugins/Example-Mixed-List (Nested Properties)]] and look at the list with mixed entries

---

## Related features

- [[Advanced/Obsidian Plugins]] — Plugin basics
- [[Features/Tags and Properties]] — Properties and their types
- [[Advanced/Plugins/Outliner]] — Another plugin for nested structures (lists)
