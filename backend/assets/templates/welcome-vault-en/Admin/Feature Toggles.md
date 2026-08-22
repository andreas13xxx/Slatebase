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

Slatebase currently has three registered feature toggles:

| Feature | Default | Type | Description |
|---------|---------|------|-------------|
| `chat` | enabled | hot | Real-time chat between users |
| `mcp` | enabled | cold | Model Context Protocol server (AI integration) |
| `obsidian-plugin-compat` | **disabled** | cold | Obsidian plugin compatibility layer |

---

## Enabling/Disabling Features

1. Open Feature Toggles in Settings
2. Click the toggle switch next to the desired feature
3. For a **hot** toggle, the change takes effect **immediately**. For a **cold** toggle, it takes effect after the next server restart

### Effects of Disabling

- The feature becomes unavailable for **all users**
- Associated UI elements (menu entries, buttons, pages) disappear
- API endpoints for the feature return `403 FEATURE_DISABLED`
- Existing data is **not deleted** — everything returns when re-enabled

---

## Hot Toggles vs. Cold Toggles

| Type | Description |
|------|-------------|
| Hot toggle | Takes effect immediately, no restart needed |
| Cold toggle | Requires a server restart to take effect |

Of the three current toggles, only `chat` is hot. Both `mcp` and `obsidian-plugin-compat` are **cold** — flipping them queues the change until the server is restarted.

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

### Obsidian Plugin Compat (`obsidian-plugin-compat`) — cold, **disabled** by default

- **Enabled:** Plugin management visible, plugins can be installed and loaded
- **Disabled:** No plugin functionality, plugin commands not in Command Palette
- **Note:** Experimental feature — plugins may affect stability; change requires a server restart to take effect

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
| Plugins not needed | Leave `obsidian-plugin-compat` disabled (its default) |
| No team requirements | Disable `chat` |

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
