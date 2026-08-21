---
tags: [features]
---

# Status Bar

The status bar at the bottom of Slatebase shows at-a-glance information about the active file and the current vault. Each item can be shown or hidden independently.

---

## Status Bar Items

| Item | Shows | Interaction |
|------|-------|-------------|
| Clock | Current time | — |
| Vault name | Name of the open vault | — |
| Word/character count | Words and characters in the active file | When text is selected, also shows the selection count |
| Cursor position | Line:column of the cursor | Click to open the "Go to line" popover |
| Plugin items | Displays from Obsidian plugins | Appear on the right side when plugin compatibility is enabled |

---

## Controlling Visibility

1. Open Settings (`Ctrl+,`)
2. Navigate to **Appearance**
3. **Show status bar** — toggles the entire bar on or off
4. Below that, each item has its own toggle — e.g. show only the word count, hide the clock and cursor position

Changes take effect immediately, no page reload needed.

---

## Go to Line

The "Go to line" popover helps you jump to a specific location in long files:

1. Click the **cursor position** in the status bar (e.g. `12:5`)
2. An input field appears
3. Type the line number and press `Enter`
4. The cursor jumps to that line

> [!tip] Keyboard shortcut
> You can also trigger "Go to line" from the [[Features/Command Palette|Command Palette]] (`Ctrl+P`) — search for "Go to line".

---

## Word and Character Count Details

The count always refers to the **entire** active file:

- **Words** — units separated by whitespace/line breaks
- **Characters** — all characters including spaces

When text is selected, the status bar shows the selection stats in addition:

```
245 words / 1,832 characters — 12 words / 87 characters selected
```

---

## Plugin Status Items

When the [[Advanced/Obsidian Plugins|Obsidian plugin compatibility layer]] is enabled, plugins can register their own displays in the status bar. These appear on the right side and update themselves — for example, the Calendar plugin might show today's date, or a sync plugin might show connection status.

Plugin items cannot be hidden individually (only by disabling the respective plugin).

---

## Practical Example

You're writing a blog post and want to keep an eye on the word count:

1. Open Settings → Appearance
2. Enable the status bar (if hidden)
3. Disable the clock and vault name — only word/character count and cursor position remain
4. Start writing — the count updates continuously
5. Select a paragraph to see how many words it contains

---

> [!todo] Exercise
> Open any file in this vault. Select a paragraph and watch how the status bar shows the selection stats. Then click the cursor position and jump to the beginning of the file (line 1) using "Go to line".

---

## Related Features

- [[Features/Settings|Settings]] — Where you control visibility
- [[Features/Command Palette|Command Palette]] — "Go to line" and "Toggle status bar" as commands
- [[Advanced/Obsidian Plugins|Obsidian Plugins]] — Plugin status items
