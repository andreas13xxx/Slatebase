---
tags: [advanced]
---

# Custom Keybindings

Slatebase lets you customize keyboard shortcuts to match your workflow. Remap existing shortcuts or assign new ones to frequently used actions.

---

## Opening Keybinding Settings

1. Press `Ctrl+,` to open Settings
2. Navigate to **Keybindings**
3. You'll see a table of all configurable commands

---

## Available Commands

Keybindings can be configured for these actions:

| Command | Default Shortcut | Category |
|---------|------------------|----------|
| Open command palette | `Ctrl+P` | Navigation |
| Open settings | `Ctrl+,` | Navigation |
| Open Quick Switcher | `Ctrl+O` | Navigation |
| Navigate back | `Alt+←` | Navigation |
| Navigate forward | `Alt+→` | Navigation |
| Next tab | `Ctrl+Shift+]` | Navigation |
| Previous tab | `Ctrl+Shift+[` | Navigation |
| Toggle sidebar | — | Navigation |
| Toggle context panel | — | Navigation |
| Toggle toolbar | — | Navigation |
| Toggle color scheme | — | Navigation |
| Open vault search | `Ctrl+Shift+F` | Panel |
| Toggle edit/view mode | `Ctrl+E` | Panel |
| Save file | `Ctrl+S` | Editor |
| Undo | `Ctrl+Z` | Editor |
| Redo | `Ctrl+Shift+Z` | Editor |
| Open/create daily note | — | Vault |
| New file | — | Vault |
| New note from template | — | Vault |
| Insert template | — | Vault |
| Open random note | — | Vault |
| Open knowledge graph | — | Vault |
| Open trash | — | Vault |

Commands without a default shortcut (—) are reachable from the Command Palette and can be
given one here. On macOS, `Cmd` takes the place of `Ctrl`.

> [!info] Bold, Italic, Create Link
> Formatting actions like Bold, Italic, and Create Link are available from the Command Palette (`Ctrl+P`), but they have no default keyboard shortcut and are not part of the configurable Keybindings table above.

---

## Recording a New Shortcut

1. Click the **Record** button next to a command
2. Press the key combination you want to assign
3. The shortcut is captured and displayed
4. Click **Save** to confirm

---

## Conflict Detection

If you assign a shortcut that's already used by another command:

- A warning is shown
- Both conflicting commands are highlighted
- You need to resolve the conflict (change one of them)

---

## The Mod Key

Shortcuts use `Mod` as a platform-independent modifier:
- **Windows/Linux:** `Mod` = `Ctrl`
- **macOS:** `Mod` = `Cmd`

This ensures shortcuts work consistently across platforms.

---

## Resetting to Defaults

To reset a shortcut to its default:
1. Click the **Reset** button next to the command
2. The original shortcut is restored

To reset all shortcuts:
- There's a "Reset All" option at the bottom of the keybindings section

---

## Best Practices

> [!tip] Shortcut Design
> - Keep frequently used actions on easy-to-reach combinations
> - Use consistent modifiers (e.g., all navigation with `Ctrl+Shift+`)
> - Avoid conflicts with browser shortcuts (`Ctrl+W`, `Ctrl+T`, `Ctrl+Tab`, etc.) — browsers intercept these before the page ever sees them, so remapping a command to one silently does nothing
> - Document your custom shortcuts somewhere for reference

---

> [!todo] Exercise
> 1. Open Settings → Keybindings
> 2. Find the "Toggle edit/view mode" shortcut
> 3. Click Record and try assigning a new combination
> 4. Cancel if you don't want to keep the change
> 5. Check if there are any unassigned commands you'd like to set up

---

## Related Features

- [[Features/Command Palette]] — Alternative to keyboard shortcuts
- [[Features/Settings]] — All settings overview
