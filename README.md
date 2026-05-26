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

</details>

## Project Structure

```
backend/           — Node.js REST API (Hono + TypeScript)
├── src/           — Source code (layered architecture)
├── config/        — Default configuration
└── data/          — Runtime data (vaults, users, sessions, audit)

frontend/          — React SPA (Vite + TypeScript)
├── src/
│   ├── components/  — React components
│   ├── state/       — Reducers, contexts, action creators
│   └── api/         — API client
└── public/        — Static assets
```

## Contributing

Contributions are welcome! Please open an issue first to discuss what you'd like to change.

## License

This project is licensed under the [GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0).

If you modify Slatebase and make it available over a network, you must publish the source code of your modified version. See [LICENSE](LICENSE) for the full text.
