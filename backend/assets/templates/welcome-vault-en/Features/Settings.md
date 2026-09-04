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

The settings sidebar has three categories and 18 sections.

### Account

- **Profile** — Display name and preferred language (DE/EN — also decides the language of the tutorial vault)
- **Change Password** — Current plus new password
- **Sessions** — View and revoke active sessions individually
- **MCP Tokens** — Create and revoke API tokens for AI access (only while the `mcp` toggle is on)
- **Keybindings** — View, record and reset keyboard shortcuts, with conflict detection
- **Appearance** — Status bar (globally and per item), toolbar, file explorer behavior
- **My Vaults** — Manage your own vaults; also holds the button that recreates the tutorial vault
- **Delete Account** — Permanently delete your own account

### Vault

These need an open vault; the writable ones are owner-only:

- **Vault Configuration** — Templates directory (default: `Templates`), daily notes directory, attachments directory, "follow active file in explorer"
- **Plugins** — Install, update and manage Obsidian community plugins (only while the `obsidian-plugin-compat` toggle is on)
- **CSS Snippets** — Per-vault custom CSS, uploaded or written in the embedded editor, enabled and disabled individually
- **Git Sync** — Configure git remotes per vault (only while the `git-sync` toggle is on) — see [[Features/Git Sync]]
- **Mail Import** — Import IMAP mailboxes as Markdown notes (only while the `mail-import` toggle is on) — see [[Features/Mail Import]]

### Administration (admins only)

- **Server Configuration** — Runtime configuration, audit log and server logs
- **User Management** — Create, edit, delete and lock users, assign roles
- **Vault Management** — See all vaults on the server
- **Feature Toggles** — Enable/disable features — see [[Admin/Feature Toggles]]
- **Restart Server** — Restart with a confirmation prompt

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
