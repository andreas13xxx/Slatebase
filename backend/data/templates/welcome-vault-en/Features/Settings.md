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
- **Welcome Vault** — Recreate the tutorial vault
- **Account Deletion** — Permanently delete your account

### Appearance

- **Status Bar** — Toggle the bottom status bar

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

## Feature Toggles

Admins can enable or disable features via Settings → Admin → Feature Toggles:

| Feature | Description |
|---------|-------------|
| Vault Sync | CouchDB synchronization |
| Obsidian Plugins | Plugin compatibility layer |
| Chat | Built-in messaging |
| MCP | Model Context Protocol server |
| Knowledge Graph | Graph visualization |
| Welcome Vault | Auto-create tutorial vault for new users |

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
- [[Features/Vault Management]] — Vault administration
- [[Features/Command Palette]] — Alternative quick access
