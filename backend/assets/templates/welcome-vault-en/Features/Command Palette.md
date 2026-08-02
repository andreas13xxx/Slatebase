---
tags: [features]
---

# Command Palette

The Command Palette gives you quick keyboard access to all Slatebase actions — no need to remember where things are in the UI.

![[Screenshots/command-palette.png]]

*The Command Palette with search results*

---

## Opening the Palette

| Shortcut | Description |
|----------|-------------|
| `Ctrl+P` | Open the command palette |

The palette opens as a modal overlay. Start typing to filter commands.

---

## Using the Palette

1. Press `Ctrl+P`
2. Type a few characters of the command you want
3. Use arrow keys to navigate the results
4. Press Enter to execute the selected command

### Fuzzy Search

The palette uses fuzzy matching — you don't need to type the exact name. For example:
- "kn gr" matches "Knowledge Graph"
- "daily" matches "Open Daily Note"
- "set" matches "Open Settings"

---

## Command Categories

| Category | Examples |
|----------|----------|
| Navigation | Open file, go to vault, switch tab |
| Vault operations | Create vault, delete vault, import/export |
| Editor | Bold, italic, heading, insert link, insert code block |
| View | Toggle dark mode, toggle sidebar, toggle search |
| Advanced | Create daily note, open graph, create welcome vault |

---

## Built-in Commands

Slatebase comes with 40+ built-in commands covering:

- **File navigation** — Open recent files, switch tabs
- **Editor formatting** — Apply bold, italic, headings, lists
- **Vault management** — Create, delete, import/export vaults
- **View controls** — Toggle panels, switch modes
- **Tools** — Open graph, search, settings, trash

---

## Plugin Commands

When the Obsidian plugin compatibility feature is enabled, plugin commands also appear in the palette. They're marked with the plugin name for easy identification.

---

> [!tip] Tip: Build Muscle Memory
> The most productive way to use Slatebase is through the Command Palette. Instead of hunting through menus, just press `Ctrl+P` and type what you want. After a few days, you'll find yourself navigating entirely by keyboard.

> [!todo] Exercise
> 1. Press `Ctrl+P` to open the Command Palette
> 2. Type "daily" — what commands appear?
> 3. Type "graph" and press Enter to open the Knowledge Graph
> 4. Press `Ctrl+P` again and type "settings" to open the settings

---

## Related Features

- [[Advanced/Custom Keybindings]] — Configure keyboard shortcuts
- [[Features/Settings]] — All settings in one place
- [[Features/Knowledge Graph]] — Accessible via palette
