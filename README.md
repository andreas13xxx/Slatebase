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
  <a href="#configuration">Configuration</a> •
  <a href="#api">API</a>
</p>

---

## Why Slatebase?

You have Markdown vaults (Obsidian, Logseq, or plain files) on a server or NAS — but no way to access them from your phone, a shared computer, or a browser. Slatebase gives you a fast, self-hosted web UI for your vaults without requiring any sync service or desktop app.

- **No vendor lock-in** — your files stay as plain Markdown on disk
- **Obsidian-compatible** — reads your existing vault structure as-is
- **Multi-user** — share vaults with others, with granular read/write permissions
- **No database** — everything is filesystem-based, easy to backup and migrate

## Quick Start

### Docker Compose (recommended)

```bash
git clone https://github.com/andreas13xxx/Slatebase.git
cd Slatebase

# Create environment file from template
cp docker.env.example docker.env
# Edit docker.env — at minimum, set a CSRF secret:
# SLATEBASE_CSRF_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

docker compose up -d --build
# Open http://localhost:8080
# Default login: admin / admin (you'll be prompted to change the password)
```

See `docker.env.example` for all available configuration options.

### Manual Installation

```bash
git clone https://github.com/andreas13xxx/Slatebase.git
cd Slatebase

# Backend
cd backend
npm install
cp .env.example .env
npm run dev

# Frontend (new terminal)
cd frontend
npm install
npm run dev
# Open http://localhost:5173
```

## Features

| Feature | Description |
|---------|-------------|
| 📁 **Multi-Vault Management** | Create, delete, import, and switch between multiple vaults |
| 🌳 **File Explorer** | Navigate your vault's directory tree with familiar folder/file icons |
| 📝 **Markdown Editor** | Edit files with toolbar, auto-save, and keyboard shortcuts |
| 👁️ **Markdown Viewer** | Rendered view with GFM, syntax highlighting, frontmatter, and collapsible headings |
| 🗂️ **Tabs** | Open multiple files side-by-side, with unsaved indicators |
| 👥 **Multi-User & Sharing** | Invite others to your vaults with read or write access |
| 🔒 **Authentication** | Session-based auth with argon2id hashing, CSRF protection, rate limiting |
| 📦 **Import & Export** | Import files/folders, export vaults as ZIP or to a local directory |
| 🌙 **Dark Mode** | Automatic light/dark theme based on system preference (or manual override) |
| 💬 **User Chat** | Real-time messaging between users with unread badges and conversation management |
| 🔄 **Vault Sync** | CouchDB/obsidian-livesync compatible synchronization with conflict resolution ⚠️ *experimental* |
| 🤖 **MCP Context Server** | AI assistants (Claude, Cursor, etc.) access your vaults via Model Context Protocol |
| 📑 **Context Panel** | Right-side panel with document outline, links, tags, and frontmatter properties |
| 🌐 **i18n** | German and English UI, switchable per user |
| 🛡️ **Admin Panel** | User management, audit log, server configuration |
| 🐳 **Docker Ready** | Multi-stage Dockerfile, runs as non-root user |

## Demo

<p align="center">
  <img src="demo.gif" alt="Slatebase Demo — Login, Vault-Navigation, Markdown-Editor, Sharing, Admin-Panel" width="800" />
</p>

## Tech Stack

| Layer | Technology |
|-------|-----------|
| **Backend** | Node.js 22, [Hono](https://hono.dev/), TypeScript, Zod, Pino |
| **Frontend** | React 19, Vite 8, TypeScript, Lucide Icons |
| **Auth** | Opaque tokens, argon2id, CSRF, rate limiting |
| **Storage** | Plain filesystem (no database) |
| **Testing** | Vitest, Testing Library, Playwright |
| **Deployment** | Docker, Docker Compose, Nginx reverse proxy |

## Configuration

Backend configuration via `backend/config/default.json`, overridden by environment variables:

| Variable | Description | Default |
|----------|-------------|---------|
| `SLATEBASE_PORT` | Server port | `3000` |
| `SLATEBASE_HOST` | Bind address | `127.0.0.1` |
| `SLATEBASE_LOG_LEVEL` | Log level (debug/info/warn/error) | `info` |
| `SLATEBASE_MAX_FILE_SIZE` | Max file size in bytes | `5242880` (5 MB) |
| `SLATEBASE_ALLOWED_ORIGINS` | CORS origins (comma-separated) | `http://localhost:5173` |
| `SLATEBASE_CSRF_SECRET` | CSRF token secret (set for persistence across restarts) | random |
| `SLATEBASE_SYNC_SECRET` | Sync credential encryption secret (set for persistence) | random |
| `SLATEBASE_MCP_ENABLED` | Enable/disable MCP server | `true` |
| `SLATEBASE_MCP_MAX_FILE_SIZE` | Max file size for MCP reads (bytes) | `5242880` (5 MB) |
| `SLATEBASE_MCP_RATE_LIMIT` | Max MCP requests per minute per token | `60` |

## Development

```bash
# Backend with hot reload
cd backend && npm run dev

# Frontend with Vite dev server (port 5173, proxies /api to backend)
cd frontend && npm run dev

# Run tests
cd backend && npm test
cd frontend && npm test

# E2E tests (backend must be running)
cd frontend && npm run test:e2e
```

## API

All routes under `/api/v1`. Authentication required (Bearer token via `Authorization` header).

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

### Auth

| Method | Path | Description |
|--------|------|-------------|
| POST | `/auth/login` | Login |
| POST | `/auth/logout` | Logout |
| GET | `/auth/sessions` | List own sessions |
| DELETE | `/auth/sessions/:sessionId` | Invalidate session |

### Users

| Method | Path | Description |
|--------|------|-------------|
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
| GET | `/admin/audit` | Audit log |
| GET | `/admin/config` | Server config |

### Chat

| Method | Path | Description |
|--------|------|-------------|
| GET | `/chat/conversations` | List conversations (paginated) |
| POST | `/chat/conversations` | Create conversation |
| POST | `/chat/conversations/:id/leave` | Leave conversation |
| GET | `/chat/conversations/:id/messages` | Get messages (paginated) |
| POST | `/chat/conversations/:id/messages` | Send message |
| GET | `/chat/unread` | Get global unread count |
| POST | `/chat/conversations/:id/read` | Mark as read |

### Sync

> ⚠️ **Experimental — Use at your own risk.** Synchronization with CouchDB/obsidian-livesync may lead to data loss. Always maintain a backup of your vault before enabling sync.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/vaults/:vaultId/sync/config` | Create sync configuration |
| GET | `/vaults/:vaultId/sync/config` | Get sync configuration |
| PUT | `/vaults/:vaultId/sync/config` | Update sync configuration |
| DELETE | `/vaults/:vaultId/sync/config` | Remove sync configuration |
| PUT | `/vaults/:vaultId/sync/config/disable` | Disable sync |
| PUT | `/vaults/:vaultId/sync/config/enable` | Enable sync |
| POST | `/vaults/:vaultId/sync/trigger` | Trigger manual sync |
| POST | `/vaults/:vaultId/sync/analyze` | Start analysis mode |
| POST | `/vaults/:vaultId/sync/reset-checkpoint` | Reset checkpoint (full resync) |
| GET | `/vaults/:vaultId/sync/log` | Get sync log (paginated) |
| GET | `/vaults/:vaultId/sync/conflicts` | Get open conflicts |
| POST | `/vaults/:vaultId/sync/conflicts/:path/resolve` | Resolve conflict |

### MCP (Model Context Protocol)

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST/GET/DELETE | `/api/v1/mcp` | Bearer Token | MCP Streamable HTTP transport |
| GET | `/api/v1/mcp/tokens` | Session | List user's API tokens |
| POST | `/api/v1/mcp/tokens` | Session + CSRF | Create new API token |
| DELETE | `/api/v1/mcp/tokens/:tokenId` | Session + CSRF | Revoke a token |
| GET | `/.well-known/mcp.json` | None | MCP discovery metadata |

</details>

## MCP — AI Assistant Integration

Slatebase includes a built-in [Model Context Protocol (MCP)](https://modelcontextprotocol.io/) server that allows AI assistants like Claude, Cursor, or Continue to access your vault contents as context.

### How it works

1. **Create an API token** via the Slatebase web UI (Profile → MCP Tokens) or the API
2. **Configure your MCP client** to connect to your Slatebase instance
3. **AI assistants can now** list your vaults, read files, search content, and browse directory structures

### Quick Setup

#### 1. Create an API Token

```bash
# Via API (replace with your session cookie)
curl -X POST http://localhost:3000/api/v1/mcp/tokens \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: <your-csrf-token>" \
  -H "Cookie: session=<your-session-token>" \
  -d '{"name": "Claude Desktop", "expiryDays": 90}'

# Response: { "token": "abc123...def456", "tokenId": "...", "expiresAt": "..." }
# ⚠️ Save the token — it's shown only once!
```

#### 2. Configure your MCP Client

**Claude Desktop** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "slatebase": {
      "url": "http://localhost:3000/api/v1/mcp",
      "headers": {
        "Authorization": "Bearer <your-api-token>"
      }
    }
  }
}
```

**Cursor / Continue** (or any MCP-compatible client):

Use the discovery endpoint to auto-detect capabilities:
```
GET http://localhost:3000/.well-known/mcp.json
```

### Available MCP Tools

| Tool | Description |
|------|-------------|
| `list_vaults` | List all vaults you have access to (with name, permission, file count) |
| `get_vault_structure` | Get the directory tree of a vault as JSON |
| `search_vault` | Full-text search across all files in a vault |
| `read_file` | Read the content of a specific file |

### Available MCP Resources

| URI Pattern | Description |
|-------------|-------------|
| `vault://<vaultId>/` | Directory tree as JSON |
| `vault://<vaultId>/<path>` | File content (Markdown as `text/markdown`, others as `text/plain`) |

### Token Management

- Each user can have up to **10 active tokens**
- Tokens expire after the configured period (7–365 days, default: 90)
- Tokens can be revoked immediately via the web UI or API
- Token usage is logged (last used timestamp visible in token list)
- Tokens are invalidated automatically when a user is deleted or suspended

### Configuration

| Variable | Description | Default |
|----------|-------------|---------|
| `SLATEBASE_MCP_ENABLED` | Enable/disable the MCP server | `true` |
| `SLATEBASE_MCP_MAX_FILE_SIZE` | Max file size for MCP reads | `5242880` (5 MB) |
| `SLATEBASE_MCP_RATE_LIMIT` | Max requests per minute per token | `60` |

Set `SLATEBASE_MCP_ENABLED=false` to completely disable the MCP server (no routes registered, `.well-known/mcp.json` returns 404).

### Security

- Tokens are stored as SHA-256 hashes (raw value never persisted)
- Each token is scoped to the creating user's vault permissions
- Rate limiting prevents abuse (HTTP 429 with `Retry-After` header)
- All MCP access is logged in the audit trail
- Path traversal protection on all file operations

## Project Structure

```
backend/           — Node.js REST API (Hono + TypeScript)
├── src/           — Source code (layered architecture)
│   ├── mcp/       — MCP Context Server (token auth, resources, tools)
│   ├── chat/      — Chat module (conversations, messages, unread)
│   └── sync/      — Sync module (CouchDB sync, conflicts, scheduling)
├── config/        — Default configuration
└── data/          — Runtime data (vaults, users, sessions, chat, sync, mcp, audit)

frontend/          — React SPA (Vite + TypeScript)
├── src/
│   ├── components/  — React components
│   ├── state/       — Reducers, contexts, action creators
│   ├── i18n/        — Internationalization (de, en)
│   └── api/         — API client
└── public/        — Static assets
```

## Contributing

Contributions are welcome! Please open an issue first to discuss what you'd like to change.

## License

This project is licensed under the [GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0).

If you modify Slatebase and make it available over a network, you must publish the source code of your modified version. See [LICENSE](LICENSE) for the full text.
