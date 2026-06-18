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
- Knowledge Graph (d3-force SVG, zoom/pan/drag/search)
- Search & Replace (regex, context lines, multi-vault, atomic writes)
- Realtime infrastructure (SSE: chat push, presence, vault changes, toasts, reconnect with replay — always active when authenticated)
- Obsidian plugin compat ⚠️ experimental (API shims, sandbox, command palette, CSS injection)
- Feature toggles (hot/cold toggle, env overlay, API + admin UI; toggles: vault-sync, obsidian-plugin-compat, chat, mcp, knowledge-graph)
- CI/CD (GitHub Actions, Release Please, multi-arch Docker, GHCR)
- i18n (German/English), Dark Mode, Docker deployment
- Vault Explorer enhancements (statistics tooltip, custom context menu, drag & drop file upload)
- Editor improvements (line numbers, undo/redo history stack, recent files, templates, daily notes, image paste, favorites)
- Trash & file versioning (soft-delete with retention, version browser with inline diff, configurable cleanup job)
- Login version display (server version shown on login screen)
- Unified Settings Panel (Ctrl+,, categorized sidebar, responsive, keyboard-navigable, search)
- Mermaid diagram rendering (lazy-loaded mermaid.js, SVG inline, Dark/Light mode, error fallback, 5s timeout)

## Planned

- Live Preview Editor (WYSIWYG/Side-by-Side)
- Server-Side Plugins (Node.js APIs in vm sandbox)
- Accessibility audit (WCAG 2.1 AA)
- Responsive/mobile, public sharing

## Language Convention

- Product UI: German labels
- Requirements/docs: German
- Code/identifiers: English
