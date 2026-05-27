# r/selfhosted Post

**Flair:** Self-Hosted Alternatives  
**Titel:** Slatebase — Self-hosted knowledge server for Markdown vaults (Obsidian-compatible)

---

Hey r/selfhosted,

I've been building **Slatebase**, a self-hosted knowledge server that serves Markdown vaults through a web interface. Think of it as a web-based reader/editor for your Obsidian vaults — no cloud dependency, no vendor lock-in.

![Demo](demo.gif)

**What it does:**

- Multi-vault management (create, delete, share between users)
- File explorer with directory tree
- Markdown rendering (GFM, frontmatter, syntax highlighting, collapsible headings)
- Inline editor with auto-save (1.5s debounce + Ctrl+S)
- Vault sharing with granular permissions (read/write per user)
- Multi-user with roles (admin/user), session-based auth (argon2)
- Vault export (File System Access API on Chrome, ZIP fallback on Firefox)
- File/folder import via browser
- Audit logging
- Dark mode
- i18n (German/English)

**Tech stack:**

- Backend: Node.js, Hono, TypeScript, Pino logging, argon2 auth
- Frontend: React 19, Vite, custom CSS with design tokens
- No database — everything is filesystem-based (JSON + Markdown files on disk)
- Docker-ready (multi-stage build, Nginx reverse proxy for frontend)

**Deliberate non-choices:**

- No database (SQLite, Postgres, etc.) — vaults are just folders on disk
- No JWT — opaque tokens with server-side session management
- No external state manager (useReducer + Context is enough)
- No CSS framework — custom design token system

**Deployment:**

Docker Compose with two containers (backend + Nginx frontend). Single `docker.env` for configuration, data lives in a volume under `data/`.

**Planned:**

- Knowledge graph visualization
- MCP integration (Model Context Protocol) as an AI context server
- Vault sync (LiveSync/CouchDB compatible)
- Obsidian community plugin compatibility layer

Still in active development. Feedback and feature requests welcome.

**GitHub:** https://github.com/andreas13xxx/slatebase
