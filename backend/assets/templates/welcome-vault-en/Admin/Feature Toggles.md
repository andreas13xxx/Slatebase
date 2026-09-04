---
tags: [admin]
---

# Feature Toggles

Feature toggles allow you as an admin to enable or disable individual Slatebase features for all users — without code changes. Some take effect immediately, others require a server restart (see [[#Hot Toggles vs. Cold Toggles]] below).

---

## Opening Feature Toggles

| Method | Description |
|--------|-------------|
| Settings (`Ctrl+,`) | Administration → Feature Toggles |
| Command Palette (`Ctrl+P`) | Search for "Feature Toggles" |

---

## Available Features

Slatebase currently has five registered feature toggles:

| Feature | Default | Type | Description |
|---------|---------|------|-------------|
| `chat` | enabled | hot | Real-time chat between users |
| `mcp` | enabled | cold | Model Context Protocol server (AI integration) |
| `obsidian-plugin-compat` | enabled | cold | Obsidian plugin compatibility layer (⚠️ experimental) |
| `git-sync` | enabled | cold | Server-side Git synchronization of vaults |
| `mail-import` | enabled | cold | Server-side IMAP mail import as Markdown notes |

---

## Enabling/Disabling Features

1. Open Feature Toggles in Settings
2. Click the toggle switch next to the desired feature
3. For a **hot** toggle, the change takes effect **immediately**. For a **cold** toggle, it takes effect after the next server restart

### Effects of Disabling

- The feature becomes unavailable for **all users**
- Associated UI elements (menu entries, buttons, pages) usually disappear entirely — the vault settings for Git Sync and Mail Import are an exception: their navigation entry stays visible but disabled, with a hint to contact an administrator
- API endpoints for the feature return `403 FEATURE_DISABLED`
- Existing data is **not deleted** — everything returns when re-enabled

---

## Hot Toggles vs. Cold Toggles

| Type | Description |
|------|-------------|
| Hot toggle | Takes effect immediately, no restart needed |
| Cold toggle | Requires a server restart to take effect |

Of the five current toggles, only `chat` is hot. `mcp`, `obsidian-plugin-compat`, `git-sync`, and `mail-import` are **cold** — flipping them queues the change until the server is restarted.

---

## Feature Details

### Chat (`chat`) — hot, enabled by default

- **Enabled:** Chat icon in menu, unread badges, real-time messages
- **Disabled:** No chat access, no notifications
- **Data:** Conversations and messages are preserved

### MCP (`mcp`) — cold, enabled by default

- **Enabled:** MCP endpoint active, token management available
- **Disabled:** MCP endpoint responds with 403, existing tokens remain stored
- **Note:** Experimental feature; change requires a server restart to take effect

### Obsidian Plugin Compat (`obsidian-plugin-compat`) — cold, enabled by default

- **Enabled:** Plugin management visible, plugins can be installed and loaded
- **Disabled:** No plugin functionality, plugin commands not in Command Palette
- **Note:** Experimental feature — plugins may affect stability; change requires a server restart to take effect

### Git Sync (`git-sync`) — cold, enabled by default

- **Enabled:** Vault settings show the "Git Sync" section, remotes can be configured, the background scheduler syncs due remotes
- **Disabled:** Nav entry stays visible but disabled; API endpoints respond with 403; existing remote configs and credentials remain stored
- **Details:** [[Features/Git Sync]]

### Mail Import (`mail-import`) — cold, enabled by default

- **Enabled:** Vault settings show the "Mail Import" section, mailboxes can be configured, the background scheduler polls due mailboxes
- **Disabled:** Nav entry stays visible but disabled; API endpoints respond with 403; existing mailbox configs and passwords remain stored
- **Details:** [[Features/Mail Import]]

---

## Environment Variable Override

Feature toggles can also be controlled via environment variables. These override the UI setting:

```
SLATEBASE_FEATURE_CHAT=false
```

> [!warning] Env Override
> When a feature is set via an environment variable, it cannot be changed in the UI. This is useful for deployments where certain features should be permanently disabled.

---

## When to Disable Features?

| Situation | Recommendation |
|-----------|---------------|
| Small installation (1–3 users) | Keep all features at their default |
| Corporate environment without AI | Disable `mcp` (restart required) |
| Plugins not needed | Disable `obsidian-plugin-compat` (requires a restart) |
| No team requirements | Disable `chat` |
| No external Git remotes needed | Disable `git-sync` (restart required) |
| No IMAP mailbox import needed | Disable `mail-import` (restart required) |

---

## Practical Example

Test the effect of a feature toggle:

1. Open Feature Toggles in Settings
2. Disable "Chat"
3. Verify: The chat entry in the user menu has disappeared
4. Re-enable "Chat"
5. Verify: The chat entry is immediately back

---

> [!tip] Gradual Activation
> For a new Slatebase installation, consider keeping experimental features (Plugins, MCP) disabled initially and enabling them gradually as you become familiar with the platform.

> [!todo] Exercise
> 1. Open Feature Toggles (`Ctrl+,` → Administration)
> 2. Disable a feature of your choice
> 3. Check in the user menu and Command Palette that the feature is gone
> 4. Re-enable it

---

## Related Features

- [[Admin/Server Configuration]] — Global server settings
- [[Admin/User Management]] — Users and roles
- [[Features/Settings]] — Settings panel overview
- [[Advanced/MCP Context Server]] — MCP feature in detail
- [[Advanced/Obsidian Plugins]] — Plugin feature in detail
- [[Features/Git Sync]] — Git Sync feature in detail
- [[Features/Mail Import]] — Mail Import feature in detail
