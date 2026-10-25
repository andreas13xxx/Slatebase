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
curl -O https://raw.githubusercontent.com/andreas13xxx/Slatebase/master/docker-compose.yml
curl -O https://raw.githubusercontent.com/andreas13xxx/Slatebase/master/docker.env.example
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
| `SLATEBASE_MODULE_SECRET_KEY` | *(auto)* | Encrypts Git-Sync / Mail-Import credentials — set if you use either |
| `SLATEBASE_TRUSTED_PROXIES` | *(empty)* | Reverse proxy IPs/CIDRs for real client IPs |
| `SLATEBASE_COOKIE_SECURE` | `auto` | `Secure` attribute on the session cookie: `auto` detects HTTPS via a trusted proxy, or force `true`/`false` |
| `SLATEBASE_MAX_FILE_SIZE` | `5242880` | Max upload size in bytes (5 MB) |
| `SLATEBASE_LINK_INDEX_MAX_LOADED` | `20` | Max vaults' link indexes kept loaded in memory at once; idle ones beyond this are evicted (and reloaded on next access) |
| `SLATEBASE_PROXY_ALLOWED_ORIGINS` | *(empty — proxy disabled)* | Comma-separated hosts the plugin request proxy (`POST /api/v1/proxy`) may reach, `*.` prefix for subdomains — e.g. `api.example.com,*.couchdb.example.com`. Empty means the route is off, not "allow everything" |
| `SLATEBASE_MAP_TILE_URL` | *(empty — Bases Map view disabled)* | Leaflet tile URL template for the Bases Map view (`type: map`), e.g. `https://tiles.example.com/{z}/{x}/{y}.png`. Empty means the map view stays inactive. Each tile request sends the user's IP to this server — point it at your own or an explicitly allowed tile server, not a public one |
| `SLATEBASE_MAP_TILE_ATTRIBUTION` | *(empty)* | Attribution text shown on the Bases map, e.g. `© OpenStreetMap contributors` |
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

### Public links and the reverse proxy

If you enable `public-shares`, the paths `/s/*` (the reading page) and `/api/v1/public/*` must be reachable by people outside
your network — that is the point. Everything else can stay restricted. The links carry a 192-bit random token that is stored
only as a hash; reader routes are rate-limited per address, answer 404 for unknown, expired and revoked links alike, and are
never indexed. Revoke a link in the note's dialog or under *Settings → Public links*.

### Production Secrets

Slatebase uses three secrets in production. Without them it falls back to a value generated on startup or kept in the data directory — meaning sessions are invalidated and encrypted data becomes unreadable whenever that state is lost. The first is always required; the other two only if you use the feature they protect.

| Variable | Purpose |
|----------|---------|
| `SLATEBASE_CSRF_SECRET` | HMAC-based CSRF token generation. Without it, all user sessions break on server restart. |
| `SLATEBASE_MODULE_SECRET_KEY` | Encrypts Git-Sync remote credentials and Mail-Import mailbox passwords at rest. Falls back to a key file in the data directory, so set this if that directory is not durable. Only required if you use Git-Sync or Mail-Import. |
| `SLATEBASE_PLUGIN_SECRET_KEY` | Encrypts secrets plugins store via Obsidian's SecretStorage API. Falls back to a key file in the data directory, so set this if that directory is not durable. Only required if you use plugins that store credentials. |

**Generate a secure secret:**

```bash
# Option A: OpenSSL
openssl rand -hex 32

# Option B: Node.js
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Set them in your `docker.env` (or via `-e` flags):**

```bash
SLATEBASE_CSRF_SECRET=<your-64-char-hex-secret>
SLATEBASE_MODULE_SECRET_KEY=<your-64-char-hex-secret>
SLATEBASE_PLUGIN_SECRET_KEY=<your-64-char-hex-secret>
```

Or directly with Docker:

```bash
docker run -e SLATEBASE_CSRF_SECRET=... -e SLATEBASE_MODULE_SECRET_KEY=... ghcr.io/andreas13xxx/slatebase:latest
```

The server logs a visible warning at startup for any of these that is not set.

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

## Operating Model

Slatebase is built to run as **one process**. There's no supported way to run two instances
of the same deployment (e.g. behind a load balancer for horizontal scaling) — they would
silently corrupt each other's state rather than fail loudly:

- Session store, live SSE connections, presence, and login/rate-limit counters all live in
  process memory. A second instance wouldn't see any of it, so users would get logged out
  or rate-limited at random depending on which instance handled a given request.
- Writes to the JSON files under the data directory (vault registry, shares, preferences,
  etc.) are serialized by an in-process lock. Two processes writing the same file via
  read-modify-write with no shared lock **will** race and can corrupt or drop data — this
  is a real risk, not a theoretical one, the moment two instances share a data directory.

This is a deliberate trade-off for a self-hosted, single-tenant-per-deployment tool, not an
oversight — but it means:

- **Run exactly one instance per data directory.** Never point two containers or processes
  at the same `SLATEBASE_DATA_DIR` (or the same Docker volume).
- **No load balancing across instances.** If you need TLS termination or a public hostname,
  put a reverse proxy in front of the single instance (see [Reverse Proxy](#reverse-proxy-https)
  above) — don't fan requests out across multiple backend instances.
- **For resilience, restart the same instance rather than replicate it.** The provided
  `docker-compose.yml` uses `restart: unless-stopped`; that's the supported recovery model.
  Vertical scaling (more CPU/RAM for the one instance) is fine — horizontal scaling isn't.

## Features

| Feature | Description |
|---------|-------------|
| 📁 **Multi-Vault Management** | Create, delete, import, and switch between multiple vaults |
| 🌳 **File Explorer** | Navigate your vault's directory tree with context menus, drag & drop, and an optional "follow active file" auto-reveal |
| 📝 **Markdown Editor** | CodeMirror 6 editor with Live Preview, auto-save, and keyboard shortcuts — formatting via Command Palette or an Obsidian toolbar plugin |
| ✅ **Spellchecker** | Built in, with corrections — not the browser's. Unknown words are underlined; right-click offers suggestions, "add to dictionary", and "ignore for this session". German and English dictionaries, switchable per editor; German compounds are resolved by splitting |
| 🎙️ **Voice Dictation** | Record in the browser and transcribe to text at the cursor via a self-hosted Whisper backend — multilingual, optional audio attachment. Off by default (`voice-transcription` toggle); the Whisper backend is operator-provided |
| 👁️ **Markdown Viewer** | Rendered view with GFM, syntax highlighting, frontmatter, collapsible headings, and colored `==highlights==` (yellow + 🔴🟠🟢🔵🟣, with `==` autocomplete) |
| 🗂️ **Tabs & Navigation** | Open multiple files simultaneously with unsaved indicators; split the editor into resizable panes (side-by-side or stacked, drag tabs between them); browser-like back/forward history, fuzzy Quick Switcher (Ctrl+O), Ctrl+Shift+]/[ tab cycling, and a clickable folder breadcrumb |
| 👥 **Multi-User & Sharing** | Invite others to your vaults with read or write access, transfer ownership |
| 🔗 **Public Links** | Share a single note read-only with people who have no account: a link with optional password and expiry that always shows the current note, embedded notes and media included. Off by default (`public-shares` toggle); see [Public links and the reverse proxy](#public-links-and-the-reverse-proxy) |
| 💬 **Real-time Chat** | Messaging between users with unread badges, archiving, and pagination |
| 🔒 **Authentication** | Session-based auth with argon2id hashing, CSRF protection, rate limiting |
| 🔄 **Vault Sync** | Via Obsidian LiveSync plugin (running in plugin compat layer with server-side CORS proxy) |
| 🗃️ **Git-Sync** | Sync a vault with one or more git remotes — HTTPS token or SSH deploy key, shared branch, per-remote interval, manual sync; credentials encrypted at rest |
| 📧 **Mail-Import** | Poll IMAP mailboxes server-side and file unread mails as Markdown notes with attachments — mailbox tree picker, target folder, per-config interval |
| 🤖 **MCP Context Server** | AI assistants (Claude, Cursor, etc.) read and write your vaults via MCP |
| 🎨 **Canvas** | Open and edit Obsidian `.canvas` whiteboards: text, file, link, and group nodes with edges, drag, resize, zoom/pan, minimap, file-path search, and auto-save |
| 🕸️ **Knowledge Graph** | Interactive visualization of vault link structure with zoom, pan, drag, and search |
| 📑 **Context Panel** | Right-side panel with document outline, forward/backlinks, unlinked mentions, tags, a footnotes list, and typed frontmatter properties — properties are also editable inline in the link hover preview |
| 🧮 **Bases** | Real Obsidian `.base` files as filterable, sortable, editable views over your notes' metadata — a table, a cards/Kanban board (drag cards between columns), a list and a map (needs a tile server, see `SLATEBASE_MAP_TILE_URL`), filters and formulas written in Obsidian's expression language (a pragmatic subset), inline cell editing, `![[x.base]]` embeds and inline ```` ```base ```` code blocks in notes (read-only table), and an MCP tool (`query_base`) to evaluate a base from AI clients. Limits: at most 5000 candidate notes per query (cheap filters run before that cut, a visible notice shows when it is still hit), formula columns are read-only (but sortable), no lambdas (`map`/`filter`), no custom `summaries` formulas, no `file.embeds`. Off by default (`bases` toggle) |
| 🔖 **Bookmarks** | Bookmark files, headings, blocks, or saved searches — reorder by drag and drop, rename, and bookmark all open tabs at once |
| 📟 **Status Bar** | Clock, vault name, word/character count, and cursor position with click-to-"go to line" — each item toggleable |
| 🖌️ **Obsidian Themes** | Obsidian themes read straight from the vault's `.obsidian/themes/` folder (the active one is Obsidian's `cssTheme` in `.obsidian/appearance.json`, so the choice applies to everyone using the vault and a vault brought over from Obsidian shows its themes without an import). Works for themes built on Obsidian CSS variables — colors, fonts, headings, line width, plus the editor's Obsidian classes (`mod-cm6`, `HyperMD-*`, `cm-inline-code`, …) so rules such as Minimal's tables and editor width apply. Themes that restyle Obsidian's own layout (tabs, sidebars, title bars) are only partly applied, and Options a theme offers through the Style Settings plugin work in part: the plugin runs here (variable-based options take full effect, class toggles only where Slatebase has the element — about 11 of 64 for Minimal), and the theme list hints at themes that have such options. A **community catalog** (Settings → Themes → Discover, about 900 themes from Obsidian's catalog) installs themes with one click and checks for updates on demand; the server fetches everything from `raw.githubusercontent.com`, the browser never contacts GitHub, and an admin can switch it off (feature `obsidian-theme-store`) |
| 🎨 **CSS Snippets** | Per-vault custom CSS, uploaded or written in an embedded editor, enabled and disabled individually |
| 🔍 **Search & Replace** | Vault-wide full-text search with regex, context lines, multi-vault, find & replace, and `path:`/`file:`/`tag:`/`property:` operators |
| 📊 **Mermaid & LaTeX** | Mermaid code blocks as interactive SVG diagrams and KaTeX math (inline `$…$` and block `$$…$$`), both dark-mode aware |
| 🗑️ **Trash & Versions** | Soft-delete with configurable retention plus a per-file version browser with inline diff |
| 🖨️ **PDF Export** | "Export to PDF…" in the Command Palette prints the reading view through the browser's print dialog |
| 🧩 **Plugin Compat** | Run browser-compatible Obsidian Community Plugins in the web UI |
| 🛒 **Plugin Store** | Browse the Obsidian community plugin list, install from GitHub releases, and keep plugins updated — all from Settings |
| 📦 **Import & Export** | Import files/folders, export vaults as ZIP or to a local directory |
| 🌐 **Real-time Updates** | SSE-based push for chat messages, vault changes, presence, and notifications |
| 🌙 **Dark Mode** | Automatic light/dark theme based on system preference or manual override |
| 🌐 **i18n** | German and English UI, switchable per user |
| 🛡️ **Admin Panel** | User management, feature toggles, audit log, server configuration |
| 🐳 **Docker Ready** | Pre-built multi-arch images (amd64 + arm64), runs as non-root user |
| 📖 **Tutorial Vault** | Comprehensive welcome vault with 70+ guides (DE/EN), practice exercises, screenshots, and templates — auto-created for new users or on-demand via Settings/Command Palette |


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
| POST | `/vaults/:vaultId/rename` | Rename file/folder (rewrites wikilinks vault-wide) |
| POST | `/vaults/:vaultId/move` | Move file/folder (rewrites wikilinks vault-wide) |
| POST | `/vaults/:vaultId/upload` | Upload file (multipart) |
| POST | `/vaults/:vaultId/import/file` | Import file |
| POST | `/vaults/:vaultId/import/folder` | Import folder |
| DELETE | `/vaults/:vaultId/content?path=` | Delete file/folder (moves to trash) |
| GET | `/vaults/:vaultId/statistics` | File/folder count and total size |
| GET/PUT | `/vaults/:vaultId/config` | Per-vault config (templates, daily notes, attachments directory) |

### Trash, Versions & Templates

| Method | Path | Description |
|--------|------|-------------|
| GET | `/vaults/:vaultId/trash` | List trash entries |
| POST | `/vaults/:vaultId/trash/:entryId/restore` | Restore entry |
| DELETE | `/vaults/:vaultId/trash/:entryId` | Delete permanently |
| GET | `/vaults/:vaultId/versions` | List versions of a file |
| GET | `/vaults/:vaultId/versions/content` | Read one version |
| POST | `/vaults/:vaultId/versions/restore` | Restore a version |
| GET | `/vaults/:vaultId/templates` | List templates |
| POST | `/vaults/:vaultId/templates/create` | Create a file from a template |

### Sharing

| Method | Path | Description |
|--------|------|-------------|
| GET | `/vaults/:vaultId/shares` | List shares |
| POST | `/vaults/:vaultId/shares` | Create share |
| PUT | `/vaults/:vaultId/shares/:userId` | Update permission |
| DELETE | `/vaults/:vaultId/shares/:userId` | Revoke share |
| POST | `/vaults/:vaultId/transfer` | Transfer ownership |

### Public links

Behind the `public-shares` feature toggle (off by default). The first group needs a session; the reader routes are anonymous.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/vaults/:vaultId/public-shares` | Create a link for `{ path, expiresAt?, password? }` (the token is returned once) |
| GET | `/vaults/:vaultId/public-shares` | List the vault's links (writers only) |
| GET | `/vaults/:vaultId/public-shares/preview?path=` | What a link for this note would include |
| PUT | `/vaults/:vaultId/public-shares/:id` | Change expiry / password (`null` removes) |
| POST | `/vaults/:vaultId/public-shares/:id/regenerate` | New URL for the same link; password and expiry are kept, the old URL stops working (new token returned once) |
| DELETE | `/vaults/:vaultId/public-shares/:id` | Revoke |
| GET | `/public-shares` | The caller's own links across vaults |
| DELETE | `/public-shares/:id` | Revoke one of the caller's own links |
| GET | `/public/s/:token` | **Anonymous.** The note with its resolved embeds |
| POST | `/public/s/:token/unlock` | **Anonymous.** Password → link-scoped cookie |
| GET | `/public/s/:token/asset?ref=` | **Anonymous.** An asset the note embeds |

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
| GET | `/admin/logs` | Recent server logs (in-memory ring buffer) |
| POST | `/admin/restart` | Restart the server |

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
| GET | `/vaults/:vaultId/graph/meta` | Graph metadata (counts, tags, property keys) |
| GET | `/vaults/:vaultId/tags` | All tags in vault |

### Properties

| Method | Path | Description |
|--------|------|-------------|
| GET | `/vaults/:vaultId/properties` | All frontmatter property keys in use |
| GET | `/vaults/:vaultId/properties/:key/values` | Distinct values for one key |
| POST | `/vaults/:vaultId/properties/query` | Files matching property filters |
| GET/PUT | `/vaults/:vaultId/property-types` | Per-vault property type registry |
| PUT | `/vaults/:vaultId/property-types/:key` | Declare the type of one key |

### Plugins

| Method | Path | Description |
|--------|------|-------------|
| GET | `/vaults/:vaultId/plugins` | List the plugins in the vault's `.obsidian/plugins/` |
| POST | `/vaults/:vaultId/plugins` | Install plugin (ZIP) |
| DELETE | `/vaults/:vaultId/plugins/:pluginId` | Uninstall |
| GET | `/vaults/:vaultId/plugins/:pluginId/bundle` | JS bundle |
| GET | `/vaults/:vaultId/plugins/:pluginId/styles` | CSS styles |
| GET/PUT | `/vaults/:vaultId/plugins/:pluginId/settings` | Settings |
| GET/PUT | `/vaults/:vaultId/plugins/registry` | Registry (permissions, compatibility, approval; enabled state is mirrored to `.obsidian/community-plugins.json`) |
| GET | `/vaults/:vaultId/plugins/:pluginId/secrets` | Plugin SecretStorage — IDs only, never values |
| GET/PUT/DELETE | `/vaults/:vaultId/plugins/:pluginId/secrets/:secretId` | Read / set / delete one secret |
| GET | `/plugins` | Community plugin list (store) |
| POST | `/vaults/:vaultId/plugins/store-install` | Install from a GitHub release |
| POST | `/vaults/:vaultId/plugins/check-updates` | Check all installed plugins for updates |
| POST | `/vaults/:vaultId/plugins/:pluginId/update` | Update one plugin |
| POST | `/vaults/:vaultId/plugins/update-all` | Update all plugins |
| POST | `/proxy` | CORS-free HTTP proxy for plugin `requestUrl` (SSRF-protected, allowlisted) |

Plugins are stored the way Obsidian stores them: files and settings in `<vault>/.obsidian/plugins/<id>/`, the enabled ones in `<vault>/.obsidian/community-plugins.json`. A plugin that Obsidian or a sync put there appears in the list on its own. It does **not** start by itself: the server's approval (permissions, compatibility) is kept outside the vault in `data/plugins/<vaultId>/_registry.json`, and a plugin only runs while it is both approved there and enabled in `community-plugins.json`. Disabling it in Obsidian therefore switches it off here too; enabling it only in Obsidian does not switch it on. Installing, deleting and activating need write access to the vault, since plugin code runs in every user's browser. Secrets stay encrypted under `data/plugins/<vaultId>/<pluginId>/secrets.json`. Installing, updating, deleting and activating a plugin publish a `vault:change` event for the other users and tabs of the vault, whose plugin page then refreshes on its own; a plugin that is already running is never reloaded by that and picks the change up on the next page load. A plugin's `data.json` does not publish it (plugins write it while they run) — it has its own `plugin-settings:change` event.

### CSS Snippets

| Method | Path | Description |
|--------|------|-------------|
| GET | `/vaults/:vaultId/snippets` | List snippets |
| POST | `/vaults/:vaultId/snippets` | Create snippet |
| GET/PUT | `/vaults/:vaultId/snippets/:snippetId` | Read / write snippet content |
| DELETE | `/vaults/:vaultId/snippets/:snippetId` | Delete snippet (also removes it from `enabledCssSnippets`) |
| GET/PUT | `/vaults/:vaultId/snippets/registry` | Enabled state, stored as `enabledCssSnippets` in `.obsidian/appearance.json` |

### Themes

Themes live in the vault (`.obsidian/themes/<id>/theme.css` + `manifest.json`); the selection is `cssTheme` in `.obsidian/appearance.json`. Reads need read access to the vault, every mutating route needs write access. Writes publish a `vault:change` event for the changed path.

| Method | Path | Description |
|--------|------|-------------|
| GET | `/vaults/:vaultId/themes` | List themes plus the active theme id |
| GET/PUT | `/vaults/:vaultId/themes/active` | Read / set the active theme (`{ "themeId": "Name" \| null }`) |
| GET | `/vaults/:vaultId/themes/:themeId` | Theme CSS and metadata |
| PUT | `/vaults/:vaultId/themes/:themeId` | Create or overwrite a theme (`{ "css", "manifest"? }`, CSS up to 3 MB) |
| DELETE | `/vaults/:vaultId/themes/:themeId` | Delete a theme (resets the selection if it was active) |
| GET | `/theme-store/themes` | Community theme catalog (`{ themes, stale }`; `stale` = GitHub unreachable, last known list) |
| GET | `/theme-store/screenshot?repo=owner/repo` | Preview image of a catalog theme, served by the backend (PNG/JPEG/GIF/WebP only) |
| GET | `/vaults/:vaultId/theme-store/updates` | Compare installed themes with the catalog (read access) |
| POST | `/vaults/:vaultId/theme-store/install` | Install a catalog theme (`{ "repo", "replace"?, "activate"? }`; write access; 409 if it exists and `replace` is not set) |

The theme store routes sit behind the `obsidian-theme-store` feature toggle (403 when off).

### Git-Sync & Mail-Import

| Method | Path | Description |
|--------|------|-------------|
| GET | `/vaults/:vaultId/git-sync` | Remotes + branch for a vault |
| PUT | `/vaults/:vaultId/git-sync/branch` | Set the shared local branch |
| POST | `/vaults/:vaultId/git-sync/remotes` | Add a remote |
| PUT/DELETE | `/vaults/:vaultId/git-sync/remotes/:remoteId` | Update / remove a remote |
| POST | `/vaults/:vaultId/git-sync/generate-ssh-key` | Generate an SSH deploy keypair |
| GET | `/vaults/:vaultId/git-sync/remotes/:remoteId/status` | Last run, result, error |
| POST | `/vaults/:vaultId/git-sync/remotes/:remoteId/sync-now` | Run a sync immediately |
| GET | `/vaults/:vaultId/mail-import` | List IMAP configs |
| POST | `/vaults/:vaultId/mail-import` | Create IMAP config |
| PUT/DELETE | `/vaults/:vaultId/mail-import/:configId` | Update / remove a config |
| GET | `/vaults/:vaultId/mail-import/:configId/mailbox-tree` | Browse the account's mailboxes |
| GET | `/vaults/:vaultId/mail-import/:configId/status` | Last run, counts, error |
| POST | `/vaults/:vaultId/mail-import/:configId/import-now` | Run an import immediately |

### Preferences

| Method | Path | Description |
|--------|------|-------------|
| GET/PUT | `/users/me/recent-files` | Recent files |
| GET/PUT | `/users/me/favorites` | Bookmarks |
| GET/PUT | `/users/me/keybindings` | Keyboard shortcut overrides |
| GET/PATCH | `/users/me/ui-settings` | Account-wide UI settings |
| GET/PATCH | `/users/me/vault-settings/:vaultId` | Per-vault UI settings |

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
| POST | `/auth/sse-ticket` | One-time ticket for the SSE stream (30s TTL) |
| GET | `/events` | SSE stream (chat, presence, vault changes, toasts) |
| GET | `/version` | Installed version (public, no auth) |
| GET | `/.well-known/mcp.json` | MCP discovery (public) |
| POST | `/welcome-vault` | Create tutorial vault on-demand |

</details>

## Contributing

Contributions are welcome! See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, architecture overview, code conventions, and how to submit changes.

## License

This project is licensed under the [GNU Affero General Public License v3.0](LICENSE) (AGPL-3.0).

If you modify Slatebase and make it available over a network, you must publish the source code of your modified version. See [LICENSE](LICENSE) for the full text.
