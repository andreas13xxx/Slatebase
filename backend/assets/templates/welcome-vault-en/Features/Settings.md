---
tags: [features]
---

# Settings

Slatebase offers a comprehensive settings panel where you can configure your account, appearance, vault behavior, keybindings, and admin options.

![[Screenshots/settings-panel.png]]

*The settings panel with categorized navigation*

---

## Opening Settings

| Method | Description |
|--------|-------------|
| `Ctrl+,` | Keyboard shortcut |
| Command Palette | Search for "Settings" |
| User menu | Click your avatar → Settings |

The settings panel opens as an overlay with a sidebar for navigation.

---

## Categories

### Account

- **Profile** — Display name, preferred language
- **Password** — Change your password
- **Sessions** — View and revoke active sessions
- **Welcome Vault** — Recreate the tutorial vault (also reachable via Command Palette → "Open sandbox vault")
- **Account Deletion** — Permanently delete your account

### Appearance

- **Status Bar** — Toggle the bottom status bar globally, plus a separate toggle per built-in item (clock, vault name, word/character count, cursor position)
- **CSS Snippets** — Manage custom per-vault CSS (upload or create/edit in an embedded editor, enable/disable, delete)

### Vault Configuration

(Only visible when a vault is selected)

- **Templates Directory** — Folder where templates are stored (default: `Templates`)
- **Daily Notes Directory** — Folder for daily notes (default: vault root)

### Keybindings

- View and customize keyboard shortcuts
- Record new shortcuts
- Conflict detection (warns if a shortcut is already used)

### Admin (Admin users only)

- **User Management** — Create, edit, delete, lock users
- **Vault Overview** — See all vaults on the server
- **Server Configuration** — Runtime configuration
- **Feature Toggles** — Enable/disable features (sync, MCP, plugins, etc.)
- **Audit Log** — View security-relevant events

---

## Appearance

### Status Bar

The status bar at the bottom of the app can show several pieces of information at once:

| Item | Shows |
|------|-------|
| Clock | Current time |
| Vault name | Name of the open vault |
| Word/character count | Word and character count of the active file; plus selection size when text is selected |
| Cursor position | Line:column of the cursor — click it to open "Go to line" |

Toggle the whole bar on/off, or toggle individual items independently (e.g. show only the word count, hide the clock and cursor position). Plugin status items (when the Obsidian plugin compatibility layer is enabled) appear on the right side of the bar.

> [!info] Full guide
> For all details on the status bar (go to line, selection stats, plugin items), see [[Features/Status Bar|Status Bar]].

### CSS Snippets

Customize Slatebase's appearance with your own CSS, stored and managed per vault under Settings → Appearance → "CSS Snippets":

1. **Upload** an existing `.css` file (max 512 KB)
2. Or **create new** — name it and write the content directly in the embedded editor
3. **Enable/disable** with the toggle next to each snippet — takes effect immediately, no page reload
4. **Edit** via the pencil icon
5. **Delete** via the trash icon, with a confirmation prompt

Enabled snippets are applied automatically whenever you open or switch to the vault. Unlike plugin CSS, snippets apply globally (e.g. `body { }` or `:root { }` rules), not just to a single plugin's UI.

> [!tip] Getting started
> Try a snippet with `:root { --accent: #ff6b6b; }` to change the interface's accent color (find the exact variable names via your browser's dev tools).

### Zoom

Command Palette → "Zoom in" / "Zoom out" / "Reset zoom" scales the entire interface up or down in 10% steps (50%–200%), persisted across sessions. Unlike the browser's own zoom, this only affects the Slatebase page.

---

## Feature Toggles

Admins can enable or disable features via Settings → Admin → Feature Toggles. Slatebase currently has three registered toggles:

| Feature | Default | Type | Description |
|---------|---------|------|-------------|
| Chat | enabled | hot | Built-in messaging |
| MCP | enabled | cold | Model Context Protocol server |
| Obsidian Plugins | **disabled** | cold | Plugin compatibility layer |

See [[Admin/Feature Toggles]] for full details, including what hot vs. cold means for each toggle.

---

## Search in Settings

The settings panel has a search field that filters sections by keyword. Type to quickly find the setting you're looking for.

---

## Keyboard Navigation

- `Ctrl+,` — Open/close settings
- `Escape` — Close settings
- Arrow keys — Navigate the sidebar
- Tab — Move between elements

---

> [!tip] Quick Access
> The most common settings action is changing keybindings. Press `Ctrl+,` then navigate to Keybindings to customize your shortcuts. Changes take effect immediately.

> [!todo] Exercise
> 1. Open Settings with `Ctrl+,`
> 2. Navigate through the categories using the sidebar
> 3. Check your current keybindings
> 4. Close settings with Escape

---

## Related Features

- [[Advanced/Custom Keybindings]] — Detailed keybinding guide
- [[Features/CSS Snippets]] — Detailed guide to custom per-vault CSS
- [[Features/Bookmarks]] — Bookmarks view, also reachable via the sidebar
- [[Features/Vault Management]] — Vault administration
- [[Features/Command Palette]] — Alternative quick access
