<p align="center">
  <h1 align="center">Slatebase</h1>
  <p align="center">
    Self-hosted Knowledge-Context-Server for Markdown vaults.<br/>
    Browse, edit, and share your Obsidian-compatible notes from any browser.
  </p>
</p>

<p align="center">
  <a href="#quick-start">Quick Start</a> •
  <a href="#features">Features</a> •
  <a href="#demo">Demo</a> •
  <a href="#mcp--ai-integration">MCP</a> •
  <a href="#contributing">Contributing</a>
</p>

---

## Why Slatebase?

You have Markdown vaults (Obsidian, Logseq, or plain files) on a server or NAS — but no way to access them from your phone, a shared computer, or a browser. Slatebase gives you a fast, self-hosted web UI for your vaults without requiring any sync service or desktop app.

- **No vendor lock-in** — your files stay as plain Markdown on disk
- **Obsidian-compatible** — reads your existing vault structure as-is
- **Multi-user** — share vaults with others, with granular read/write permissions
- **No database** — everything is filesystem-based, easy to backup and migrate
- **AI-ready** — built-in MCP server lets AI assistants read and write your knowledge base

## Quick Start

### Prerequisites

- Docker Engine ≥ 24
- Docker Compose ≥ 2.20

### 1. Create a project directory

```bash
mkdir slatebase && cd slatebase
```

### 2. Download the compose file and environment template

```bash
curl -O https://raw.githubusercontent.com/andreas13xxx/Slatebase/main/docker-compose.yml
curl -O https://raw.githubusercontent.com/andreas13xxx/Slatebase/main/docker.env.example
cp docker.env.example docker.env
```

### 3. Configure secrets

```bash
# Generate a CSRF secret (required for session persistence across restarts)
openssl rand -hex 32
# → Paste the output as SLATEBASE_CSRF_SECRET in docker.env
```

### 4. Start Slatebase

```bash
docker compose up -d
```

Open **http://localhost:8080** and log in with `admin` / `admin`. You'll be prompted to change the password on first login.

### Configuration

All settings live in `docker.env`. Key options:

| Variable | Default | Description |
|----------|---------|-------------|
| `SLATEBASE_EXTERNAL_PORT` | `8080` | Port exposed on the host |
| `SLATEBASE_ALLOWED_ORIGINS` | `http://localhost:8080` | Your public URL (for CORS) |
| `SLATEBASE_CSRF_SECRET` | *(random)* | Persistent CSRF secret — **set this!** |
| `SLATEBASE_SYNC_SECRET` | *(random)* | Encryption key for CouchDB sync credentials |
| `SLATEBASE_TRUSTED_PROXIES` | *(empty)* | Reverse proxy IPs/CIDRs for real client IPs |
| `SLATEBASE_MAX_FILE_SIZE` | `5242880` | Max upload size in bytes (5 MB) |
| `SLATEBASE_LOG_LEVEL` | `info` | Log level: debug, info, warn, error |

See `docker.env.example` for the full list with documentation.

### Reverse Proxy (HTTPS)

Slatebase is designed to run behind a reverse proxy for TLS termination. Point your proxy to the frontend container's port (default `8080`), set `SLATEBASE_ALLOWED_ORIGINS` to your public URL, and configure `SLATEBASE_TRUSTED_PROXIES` with your proxy's subnet for accurate client IP logging.

Example with Caddy:

```
slatebase.example.com {
    reverse_proxy localhost:8080
}
```

For detailed reverse proxy setup (Nginx Proxy Manager, Traefik, etc.), see [CONTRIBUTING.md](CONTRIBUTING.md#reverse-proxy).

### Updates

```bash
docker compose pull
docker compose up -d
```

Data is stored in a Docker volume (`slatebase-data`) and persists across updates.

### Backup & Restore

```bash
# Backup
docker run --rm -v slatebase_slatebase-data:/data -v $(pwd):/backup alpine \
  tar czf /backup/slatebase-backup-$(date +%Y%m%d).tar.gz -C /data .

# Restore
docker compose down
docker run --rm -v slatebase_slatebase-data:/data -v $(pwd):/backup alpine \
  sh -c "rm -rf /data/* && tar xzf /backup/slatebase-backup-YYYYMMDD.tar.gz -C /data"
docker compose up -d
```

## Features

| Feature | Description |
|---------|-------------|
| 📁 **Multi-Vault Management** | Create, delete, import, and switch between multiple vaults |
| 🌳 **File Explorer** | Navigate your vault's directory tree with context menus and drag & drop |
| 📝 **Markdown Editor** | Edit files with toolbar, auto-save, and keyboard shortcuts |
| 👁️ **Markdown Viewer** | Rendered view with GFM, syntax highlighting, frontmatter, and collapsible headings |
| 🗂️ **Tabs** | Open multiple files simultaneously with unsaved indicators |
| 👥 **Multi-User & Sharing** | Invite others to your vaults with read or write access, transfer ownership |
| 💬 **Real-time Chat** | Messaging between users with unread badges, archiving, and pagination |
| 🔒 **Authentication** | Session-based auth with argon2id hashing, CSRF protection, rate limiting |
| 🔄 **Vault Sync** ⚠️ | CouchDB/obsidian-livesync compatible synchronization with conflict resolution |
| 🤖 **MCP Context Server** | AI assistants (Claude, Cursor, etc.) read and write your vaults via MCP |
| 🕸️ **Knowledge Graph** | Interactive visualization of vault link structure with zoom, pan, drag, and search |
| 📑 **Context Panel** | Right-side panel with document outline, forward/backlinks, tags, and properties |
| 🔍 **Search & Replace** | Vault-wide full-text search with regex, context lines, multi-vault, and find & replace |
| 📊 **Mermaid Diagrams** | Render Mermaid code blocks as interactive SVG diagrams with dark mode support |
| 🧩 **Plugin Compat** ⚠️ | Run browser-compatible Obsidian Community Plugins in the web UI |
| 📦 **Import & Export** | Import files/folders, export vaults as ZIP or to a local directory |
| 🌐 **Real-time Updates** | SSE-based push for chat messages, vault changes, presence, and notifications |
| 🌙 **Dark Mode** | Automatic light/dark theme based on system preference or manual override |
| 🌐 **i18n** | German and English UI, switchable per user |
| 🛡️ **Admin Panel** | User management, feature toggles, audit log, server configuration |
| 🐳 **Docker Ready** | Pre-built multi-arch images (amd64 + arm64), runs as non-root user |

⚠️ = Experimental feature. Use with caution.

## Demo

<p align="center">
  <img src="demo.gif" alt="Slatebase Demo — Login, Vault Navigation, Markdown Editor, Sharing, Admin Panel" width="800" />
</p>

## MCP — AI Integration

Slatebase includes a built-in [Model Context Protocol](https://modelcontextprotocol.io/) server. AI assistants like Claude, Cursor, or Continue can list vaults, read files, search content, and create/edit/delete/move files — all respecting your vault permissions.

For setup instructions, available tools, and configuration details, see **[MCP.md](MCP.md)**.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Node.js 22+, [Hono](https://hono.dev/), TypeScript, Zod, Pino |
| **Frontend** | React 19, Vite 8, TypeScript, Lucide Icons |
| **Auth** | Opaque tokens, argon2id, CSRF, rate limiting |
| **Storage** | Plain filesystem (no database) |
| **Testing** | Vitest, Testing Library, Playwright |
| **Deployment** | Docker, Docker Compose, multi-arch images (GHCR) |

## API

All routes under `/api/v1`. Authentication required (session cookie or Bearer token).

<details>
<summary>Full API reference</summary>

### Vaults

| Method | Path | Description |
|--------|------|-------------|
| GET | `/vaults` | List vaults (filtered by access) |
| POST | `/vaults` | Create vault |
| DELETE | `/vaults/:vaultId` | Delete vault |
| GET | `/vaults/:vaultId/tree` | Directory tree |
| GET | `/vaults/:vaultId/files?path=` | Read file |
| PUT | `/vaults/:vaultId/files` | Save file |
| POST | `/vaults/:vaultId/import/file` | Import file |
| POST | `/vaults/:vaultId/import/folder` | Import folder |
| DELETE | `/vaults/:vaultId/content?path=` | Delete file/folder |

### Sharing

| Method | Path | Description |
|--------|------|-------------|
| GET | `/vaults/:vaultId/shares` | List shares |
| POST | `/vaults/:vaultId/shares` | Create share |
| PUT | `/vaults/:vaultId/shares/:userId` | Update permission |
| DELETE | `/vaults/:vaultId/shares/:userId` | Revoke share |
| POST | `/vaults/:vaultId/transfer` | Transfer ownership |

### Auth & Users

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/login` | Login |
| POST | `/auth/logout` | Logout |
| GET | `/auth/sessions` | List own sessions |
| DELETE | `/auth/sessions/:sessionId` | Invalidate session |
| GET | `/users/search?q=` | Search users |
| GET | `/users/me` | Get profile |
| PUT | `/users/me` | Update profile |
| PUT | `/users/me/password` | Change password |
| DELETE | `/users/me` | Delete account |

### Admin

| Method | Path | Description |
|--------|------|-------------|
| GET | `/admin/users` | List all users |
| POST | `/admin/users` | Create user |
| DELETE | `/admin/users/:userId` | Delete user |
| PUT | `/admin/users/:userId/role` | Change role |
| PUT | `/admin/users/:userId/suspend` | Suspend user |
| PUT | `/admin/users/:userId/unsuspend` | Unsuspend user |
| GET | `/admin/audit` | Audit log |
| GET | `/admin/config` | Server config |
| PUT | `/admin/config` | Update config |
| GET | `/admin/features` | List feature toggles |
| PUT | `/admin/features/:name` | Toggle feature |

### Chat

| Method | Path | Description |
|--------|------|-------------|
| GET | `/chat/conversations` | List conversations |
| POST | `/chat/conversations` | Create conversation |
| POST | `/chat/conversations/:id/leave` | Leave conversation |
| GET | `/chat/conversations/:id/messages` | Get messages |
| POST | `/chat/conversations/:id/messages` | Send message |
| GET | `/chat/unread` | Global unread count |
| POST | `/chat/conversations/:id/read` | Mark as read |

### Sync ⚠️

| Method | Path | Description |
|--------|------|-------------|
| POST | `/vaults/:vaultId/sync/config` | Create sync config |
| GET | `/vaults/:vaultId/sync/config` | Get sync config |
| PUT | `/vaults/:vaultId/sync/config` | Update sync config |
| DELETE | `/vaults/:vaultId/sync/config` | Remove sync config |
| PUT | `/vaults/:vaultId/sync/config/enable` | Enable sync |
| PUT | `/vaults/:vaultId/sync/config/disable` | Disable sync |
| POST | `/vaults/:vaultId/sync/trigger` | Trigger sync |
| POST | `/vaults/:vaultId/sync/analyze` | Analysis mode |
| GET | `/vaults/:vaultId/sync/log` | Sync log |
| GET | `/vaults/:vaultId/sync/conflicts` | Open conflicts |
| POST | `/vaults/:vaultId/sync/conflicts/:path/resolve` | Resolve conflict |

### Search & Replace

| Method | Path | Description |
|--------|------|-------------|
| GET | `/vaults/:vaultId/search` | Single-vault search |
| GET | `/search` | Multi-vault search |
| POST | `/vaults/:vaultId/replace` | Replace in files |

### Graph

| Method | Path | Description |
|--------|------|-------------|
| GET | `/vaults/:vaultId/graph` | Full link graph |
| GET | `/vaults/:vaultId/backlinks?path=` | Backlinks for a file |
| GET | `/vaults/:vaultId/tags` | All tags in vault |

### Plugins ⚠️

| Method | Path | Description |
|--------|------|-------------|
| GET | `/vaults/:vaultId/plugins` | List plugins |
| POST | `/vaults/:vaultId/plugins` | Install plugin (ZIP) |
| DELETE | `/vaults/:vaultId/plugins/:pluginId` | Uninstall |
| GET | `/vaults/:vaultId/plugins/:pluginId/bundle` | JS bundle |
| GET | `/vaults/:vaultId/plugins/:pluginId/styles` | CSS styles |
| GET/PUT | `/vaults/:vaultId/plugins/:pluginId/settings` | Settings |
| GET/PUT | `/vaults/:vaultId/plugins/registry` | Registry |

### MCP

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST/GET/DELETE | `/mcp` | Bearer | MCP transport |
| GET | `/mcp/tokens` | Session | List tokens |
| POST | `/mcp/tokens` | Session+CSRF | Create token |
| DELETE | `/mcp/tokens/:tokenId` | Session+CSRF | Revoke token |

### Realtime & Version

| Method | Path | Description |
|--------|------|-------------|
| GET | `/events` | SSE stream (chat, presence, vault changes) |
| GET | `/version` | Installed version (public, no auth) |
| GET | `/.well-known/mcp.json` | MCP discovery (public) |

</details>

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, architecture overview, code conventions, and how to submit changes.

## License

This project is licensed under the [GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0).

If you modify Slatebase and make it available over a network, you must publish the source code of your modified version. See [LICENSE](LICENSE) for the full text.
