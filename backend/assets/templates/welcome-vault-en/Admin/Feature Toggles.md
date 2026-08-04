---
tags: [admin]
---

# Feature Toggles

Feature toggles allow you as an admin to enable or disable individual Slatebase features for all users — without a server restart and without code changes.

---

## Opening Feature Toggles

| Method | Description |
|--------|-------------|
| Settings (`Ctrl+,`) | Administration → Feature Toggles |
| Command Palette (`Ctrl+P`) | Search for "Feature Toggles" |

---

## Available Features

| Feature | Default | Description |
|---------|---------|-------------|
| `chat` | enabled | Chat between users |
| `knowledge-graph` | enabled | Knowledge graph visualization |
| `welcome-vault` | enabled | Create tutorial vault for new users |
| `mcp` | enabled | Model Context Protocol server (AI integration) |
| `obsidian-plugin-compat` | enabled | Obsidian plugin compatibility layer |
| `live-preview` | enabled | Live Preview editor (CodeMirror 6) |

---

## Enabling/Disabling Features

1. Open Feature Toggles in Settings
2. Click the toggle switch next to the desired feature
3. The change takes effect **immediately** (hot toggle)

### Effects of Disabling

- The feature becomes unavailable for **all users**
- Associated UI elements (menu entries, buttons, pages) disappear
- API endpoints for the feature return `403 FEATURE_DISABLED`
- Existing data is **not deleted** — everything returns when re-enabled

---

## Hot Toggles vs. Cold Toggles

All current feature toggles are **hot toggles**:

| Type | Description |
|------|-------------|
| Hot toggle | Takes effect immediately, no restart needed |
| Cold toggle | Requires server restart (currently none) |

---

## Feature Details

### Chat (`chat`)

- **Enabled:** Chat icon in menu, unread badges, real-time messages
- **Disabled:** No chat access, no notifications
- **Data:** Conversations and messages are preserved

### Knowledge Graph (`knowledge-graph`)

- **Enabled:** Graph tab in tab bar, graph commands in Command Palette
- **Disabled:** Graph not accessible
- **Data:** Link index continues to be maintained (for backlinks in Context Panel)

### Welcome Vault (`welcome-vault`)

- **Enabled:** New users automatically receive a tutorial vault; users can manually create one
- **Disabled:** No automatic vault on user creation, no button in settings

### MCP (`mcp`)

- **Enabled:** MCP endpoint active, token management available
- **Disabled:** MCP endpoint responds with 403, existing tokens remain stored
- **Note:** Experimental feature

### Obsidian Plugin Compat (`obsidian-plugin-compat`)

- **Enabled:** Plugin management visible, plugins can be installed and loaded
- **Disabled:** No plugin functionality, plugin commands not in Command Palette
- **Note:** Experimental feature — plugins may affect stability

### Live Preview (`live-preview`)

- **Enabled:** Editor offers Source and Live Preview modes
- **Disabled:** Only Source mode available, toggle button hidden

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
| Small installation (1–3 users) | Keep all features enabled |
| Corporate environment without AI | Disable `mcp` |
| Stability prioritized | Disable `obsidian-plugin-compat` |
| No team requirements | Disable `chat` |
| Performance optimization | Disable `knowledge-graph` for very large vaults |

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
