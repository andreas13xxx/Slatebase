# r/selfhosted Post

**Flair:** Self-Hosted Alternatives
**Titel:** Slatebase — Self-hosted knowledge server for Markdown vaults (runs Obsidian plugins in the browser)

---

Hey r/selfhosted,

I've been building **Slatebase**, a self-hosted knowledge server that serves Markdown vaults through a web interface. Think of it as a multi-user web app for your Obsidian vaults — no cloud dependency, no vendor lock-in, and no desktop app required.

![Demo](demo.gif)

**What it does:**

- Multi-vault management with a file explorer, drag & drop upload, trash and per-file version history
- CodeMirror 6 editor with Live Preview, auto-save, and a built-in spellchecker (its own Hunspell dictionaries — the browser never hands its suggestions to JavaScript)
- Obsidian-compatible rendering: wikilinks, embeds (incl. PDF/audio/video), callouts, tags, block references, Mermaid diagrams, LaTeX math
- Obsidian `.canvas` whiteboards — read and edit
- Knowledge graph with a per-note local graph, plus a context panel (outline, links, unlinked mentions, tags, typed frontmatter properties)
- Vault-wide search & replace with regex and `tag:`/`path:`/`property:` operators
- **Runs real Obsidian community plugins in the browser** — a compatibility layer emulating the plugin API, with a built-in store that installs straight from GitHub releases
- Sync your way: server-side **git remotes** (HTTPS token or SSH deploy key), or CouchDB through the Obsidian LiveSync plugin running in the compat layer
- **IMAP mail import** — poll a mailbox server-side and file each mail as a Markdown note with attachments
- **MCP server** — AI assistants (Claude, Cursor, …) read *and* write your vaults, respecting the same permissions
- Multi-user with granular read/write vault sharing, ownership transfer, real-time chat and presence
- Admin panel (users, audit log, server config, feature toggles), dark mode, German/English UI

**Tech stack:**

- Backend: Node.js, Hono, TypeScript, Zod, Pino, argon2
- Frontend: React 19, Vite, CodeMirror 6, custom CSS with design tokens
- No database — everything is filesystem-based (JSON + your Markdown files on disk)
- Docker-ready, multi-arch images (amd64 + arm64) on GHCR, runs as non-root

**Deliberate non-choices:**

- No database (SQLite, Postgres, …) — vaults are just folders on disk
- No JWT — opaque tokens with server-side session management
- No external state manager (useReducer + Context is enough)
- No CSS framework — custom design token system

**Deployment:**

Docker Compose with two containers (backend + Nginx frontend). Single `docker.env` for configuration, data lives in a volume. Set `SLATEBASE_CSRF_SECRET` so sessions survive restarts.

**Still open:** responsive/mobile layout, split panes, public share links, Obsidian themes.

Licensed AGPL-3.0. Feedback and feature requests welcome.

**GitHub:** https://github.com/andreas13xxx/slatebase
