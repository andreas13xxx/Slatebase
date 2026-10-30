---
tags: [admin]
---

# Server Configuration

Server configuration allows you to adjust global settings of your Slatebase instance. Here you control behavior that affects all users.

---

## Opening Server Configuration

| Method | Description |
|--------|-------------|
| Settings (`Ctrl+,`) | Administration → Server Configuration |
| Command Palette (`Ctrl+P`) | Search for "Server Configuration" |

---

## Configuration Levels

Slatebase uses a multi-level configuration system:

| Level | Priority | Description |
|-------|----------|-------------|
| Environment variables | Highest | `SLATEBASE_*` env vars override everything |
| Configuration UI | Medium | Changes via the admin interface |
| Default values | Lowest | Sensible presets |

---

## Available Settings

### General

| Setting | Description | Default |
|---------|-------------|---------|
| Server port | HTTP port | `3000` |
| Host | Bind address | `localhost` |
| Vault directory | Storage location for vaults | `./data/vaults` |

### Security

| Setting | Description | Default |
|---------|-------------|---------|
| Session duration | Sliding validity of an idle session (hours), editable in the admin menu | 24 hours |
| Max session lifetime | Absolute cap regardless of activity (days), editable in the admin menu; must be ≥ session duration | 7 days |
| Rate limiting | Max login attempts per time window | 5 per 15 min |
| Trusted proxies | IP ranges of trusted proxies | None |

### Realtime (SSE)

| Setting | Description | Default |
|---------|-------------|---------|
| SSE connections (total) | Maximum concurrent realtime connections across all users, editable in the admin menu | 1000 |
| SSE connections per user | Per user, usually = open browser tabs, editable in the admin menu | 3 |

### Trash & Versions

| Setting | Description | Default |
|---------|-------------|---------|
| Trash retention | Days until permanent deletion | 30 days |
| Max versions per file | Number of stored file versions | 20 |
| Cleanup interval | How often the cleanup job runs | 24 hours |

### Plugin Proxy

Obsidian plugins use `requestUrl()` for CORS-free requests. Slatebase forwards these server-side through `POST /api/v1/proxy` — **only to the hosts allowed here** (SSRF protection). Manage the list under **Administration → Server configuration → Plugin proxy**.

| Setting | Description | Default |
|---------|-------------|---------|
| Allowed proxy targets | One host per line, `*.` wildcard prefix allowed | GitHub hosts (for plugin updates & language packs) |

- One **host** per line, e.g. `api.github.com` or `*.githubusercontent.com` — no scheme, path, or port.
- An **empty list disables the proxy** entirely (plugins get `403 PROXY_NOT_CONFIGURED`).
- Private/internal/loopback addresses stay **blocked** regardless of the list.
- Changes **apply immediately** — no restart needed.
- When the `SLATEBASE_PROXY_ALLOWED_ORIGINS` environment variable is set it **wins** and the UI field is locked (the SSRF boundary stays with the operator).

> [!tip] GitHub default
> The pre-configured GitHub hosts cover the most common plugin requests (update checks, language-pack downloads). For LiveSync (CouchDB) or other services, add their domain.

---

## Server Restart

In the Settings under "Administration" you'll find the "Restart Server" option:

1. Click "Restart Server"
2. Confirm the action in the dialog
3. The server shuts down and restarts
4. All active connections are briefly interrupted

### When Is a Restart Needed?

- After changes to environment variables
- For cold toggle changes (currently none)
- After manual filesystem changes in the data directory
- After server updates

> [!warning] Restart Impact
> A server restart interrupts all active connections. Users are briefly disconnected and automatically reconnect. Active SSE connections rebuild themselves after the restart.

---

## Environment Variables

Important environment variables for server configuration:

| Variable | Description |
|----------|-------------|
| `SLATEBASE_PORT` | Server port (default: 3000) |
| `SLATEBASE_HOST` | Bind address (default: localhost, Docker: 0.0.0.0) |
| `SLATEBASE_DATA_DIR` | Data directory |
| `SLATEBASE_CSRF_SECRET` | CSRF token secret (min. 32 characters) |
| `SLATEBASE_MODULE_SECRET_KEY` | Encryption secret for Git-Sync and Mail-Import credentials |
| `SLATEBASE_TRUSTED_PROXIES` | Comma-separated IP ranges |
| `SLATEBASE_PROXY_ALLOWED_ORIGINS` | Allowed domains for plugin proxy — usually managed in the admin UI; when set, it overrides and locks the UI field |

> [!tip] .env File
> For local development you can use a `.env` file in the backend directory. For production, Docker secrets or your hosting provider's environment variables are recommended.

---

## Docker Deployment

For Docker deployments, note:

- Set `SLATEBASE_HOST=0.0.0.0` (so the container is reachable)
- Volume mount to `/app/data` for persistent data
- Configure trusted proxy subnet when behind a reverse proxy
- Healthcheck: HTTP 401 on `/api/v1/auth/session` = healthy

---

## Practical Example

Review and optimize your server configuration:

1. Open Server Configuration in Settings
2. Review the current values
3. Adjust trash retention if needed (e.g. 7 days for less storage usage)
4. Verify that trusted proxies are correctly configured

---

> [!tip] Minimal Configuration
> For most installations, the defaults are sufficient. Only change what you consciously want to adjust. The most important settings for production are: Host, Trusted Proxies, and the secret variables.

> [!todo] Exercise
> 1. Open Server Configuration
> 2. Review the current settings
> 3. Note the configured values for trash and versions
> 4. Consider whether the defaults fit your use case

---

## Related Features

- [[Admin/Feature Toggles]] — Enable/disable features
- [[Admin/Audit Log]] — Review security events
- [[Features/Trash and Versions]] — Trash from the user perspective
- [[Features/Git Sync]] — Sync a vault with a git remote
- [[Advanced/Plugins/LiveSync]] — CouchDB sync via the Obsidian LiveSync plugin
