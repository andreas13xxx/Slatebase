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
| Session duration | How long a session remains valid | 24 hours |
| Rate limiting | Max login attempts per time window | 5 per 15 min |
| Trusted proxies | IP ranges of trusted proxies | None |

### Trash & Versions

| Setting | Description | Default |
|---------|-------------|---------|
| Trash retention | Days until permanent deletion | 30 days |
| Max versions per file | Number of stored file versions | 20 |
| Cleanup interval | How often the cleanup job runs | 24 hours |

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
| `SLATEBASE_PROXY_ALLOWED_ORIGINS` | Allowed domains for plugin proxy |

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
- [[Advanced/Vault Sync Setup]] — Sync configuration
