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

### Shortcuts in the List

If a command has a keyboard shortcut, it is shown to the right of the command name — e.g. `Ctrl+E` for "Toggle editor mode". That makes the palette double as a cheat sheet: search for the command once, then use the shortcut from then on. The shortcut shown is always the one currently in effect, including your own changes from **Settings → Keybindings**.

---

## Command Categories

| Category | Examples |
|----------|----------|
| Navigation | Open file, go to vault, switch tab |
| Vault operations | Create vault, delete vault, import/export |
| Editor | Bold, italic, heading, insert link, insert code block |
| View | Toggle dark mode, toggle sidebar, toggle search, toggle line numbers, toggle readable line length |
| Spellcheck | "Toggle spellcheck", "Spellcheck dictionary: German/English" — the corrections themselves live in the right-click menu on the underlined word, see [[Editor and Viewer]] |
| Advanced | Create daily note, open graph, create welcome vault |
| Diagnostics & Help | "Show debug info" (version, browser, active vault — handy for a bug report), "Show release notes" |

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

## Slash Commands in the Editor

Besides the global palette (`Ctrl+P`), the editor has an inline **slash menu**: type `/` at the start of a line (or after a space) and a small command menu opens right at your cursor.

- **Trigger:** `/` at the line start or after whitespace. A slash inside a word, a path (`a/b`), a code block, a wikilink or math stays literal text.
- **Filter:** keep typing to narrow the list (same fuzzy match as the palette).
- **Choose:** `↑` / `↓` to move, `Enter` or `Tab` to confirm, `Escape` to cancel, or click an entry.
- **Result:** the typed `/…` text is removed and the command runs at the cursor.

Available entries include: headings H1–H3, bullet / numbered / task lists, quote, code block, callout, table, horizontal rule, internal link, insert template, insert date, insert time. The actions are the same core commands the palette runs, so the two never drift apart.

> [!tip] Palette vs. slash menu
> Use `Ctrl+P` to reach *any* action from anywhere; use `/` in the editor for quick *insert/format* actions without leaving the keyboard or the cursor position.

---
## Related Features

- [[Advanced/Custom Keybindings]] — Configure keyboard shortcuts
- [[Features/Settings]] — All settings in one place
- [[Features/Knowledge Graph]] — Accessible via palette
