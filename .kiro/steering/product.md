# Slatebase — Product Overview

Self-hosted Knowledge-Context-Server for Markdown vaults. Multi-user web UI for Obsidian-compatible vaults — no database, no sync service, no desktop app required.

## Implemented Features

- Multi-vault management (CRUD, import/export, unified file explorer)
- Tabbed Markdown editor/viewer (auto-save, GFM, syntax highlighting, collapsible headings)
- Obsidian-compatible rendering (Wikilinks, Embeds with inline PDF, Callouts, Tags)
- Authentication (opaque tokens, argon2id, CSRF, sliding sessions, rate limiting)
- Multi-user & sharing (granular read/write, ownership transfer)
- Real-time chat (unread badges, archiving, pagination)
- Admin panel (user management, audit log, config, feature toggles)
- Vault sync ⚠️ experimental (CouchDB/livesync, bidirectional, conflict resolution, E2E encryption)
- MCP Context Server (AI read+write via Model Context Protocol)
- Context Panel (Outline, Links, Tags, Properties — splittable, DnD)
- Knowledge Graph (d3-force SVG, zoom/pan/drag/search, konfigurierbare Farben/Layout, Tag-Nodes, Property-Nodes)
- Search & Replace (regex, context lines, multi-vault, atomic writes)
- Realtime infrastructure (SSE: chat push, presence, vault changes, toasts, reconnect with replay — always active when authenticated)
- Obsidian plugin compat ⚠️ experimental (API shims, sandbox, command palette, CSS injection)
- Feature toggles (hot/cold toggle, env overlay, API + admin UI; toggles: vault-sync, obsidian-plugin-compat, chat, mcp, knowledge-graph, welcome-vault)
- CI/CD (GitHub Actions, Release Please, multi-arch Docker, GHCR)
- i18n (German/English), Dark Mode, Docker deployment
- Vault Explorer enhancements (statistics tooltip, custom context menu, drag & drop file upload)
- Editor improvements (line numbers, undo/redo history stack, recent files, templates, daily notes, image paste, favorites)
- Trash & file versioning (soft-delete with retention, version browser with inline diff, configurable cleanup job)
- Login version display (server version shown on login screen)
- Unified Settings Panel (Ctrl+,, categorized sidebar, responsive, keyboard-navigable, search)
- Mermaid diagram rendering (lazy-loaded mermaid.js, SVG inline, Dark/Light mode, error fallback, 5s timeout)
- Command Palette (Ctrl+P, always active, 40+ built-in commands: navigation, vault ops, editor formatting, admin; plugin commands when compat enabled)
- Per-user preferences persistence (recent files, favorites synced to server with localStorage cache)
- Per-vault configuration (templates directory, daily notes directory — owner-configurable via Settings)
- Configurable keyboard shortcuts (per-user overrides, 14 commands, conflict detection, Settings UI)
- Welcome Vault (automatic tutorial vault for new users, feature-toggled, multi-language DE/EN, language defaults to admin's preference at user creation)
- Obsidian Canvas (`.canvas` whiteboards: text/file/link/group nodes, edges, drag/resize, zoom/pan, minimap, source view, auto-save; link-node iframe preview, file-node content/path editing with vault-wide file-path search)

## Planned

- Live Preview Editor (WYSIWYG/Side-by-Side)
- Server-Side Plugins (Node.js APIs in vm sandbox)
- Accessibility audit (WCAG 2.1 AA)
- Responsive/mobile, public sharing

## Language Convention

- Product UI: German labels
- Requirements/docs: German
- Code/identifiers: English
