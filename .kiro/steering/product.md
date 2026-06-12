# Slatebase — Product Overview

Slatebase is a self-hosted Knowledge-Context-Server for Markdown vaults. It allows users to manage, browse, and edit Markdown-based knowledge bases through a web interface. The system is designed to be compatible with Obsidian vaults.

## Current State

Slatebase is feature-complete for its core use case: multi-user Markdown vault management with web-based editing, sharing, real-time chat, and CouchDB-based vault synchronization.

### Implemented Features

- **Multi-vault management** — Create, delete, import/export, switch between vaults
- **Unified file explorer** — All vaults displayed as expandable root entries in a single tree view, lazy-loading of vault contents, inline vault creation, permission badges, drag & drop within vaults
- **Tabbed editor/viewer** — Multiple files open simultaneously, auto-save, View/Edit modes
- **Markdown rendering** — GFM, syntax highlighting, frontmatter, collapsible headings, Obsidian-compatible (Wikilinks, Embeds with size/display including inline PDF viewer, Callouts, Tags)
- **Authentication** — Session-based auth (opaque tokens, argon2id, CSRF with persistent secret, rate limiting, sliding session expiry with configurable duration, localStorage token persistence, CSRF mismatch recovery)
- **Multi-user & sharing** — Granular read/write vault permissions, ownership transfer
- **User chat** — Real-time messaging between users with unread badges, archiving, pagination
- **Admin panel** — User management, audit log, server configuration
- **Import & export** — File/folder import, vault export (ZIP or File System Access API)
- **Advanced file operations** — Delete, rename files/folders within vaults
- **Internationalization (i18n)** — German and English UI, per-user preference
- **Dark mode** — System-preference-based or manual override (light/dark/system)
- **Docker deployment** — Multi-stage build, Nginx reverse proxy, non-root user
- **Vault synchronization** ⚠️ *experimental* — CouchDB/obsidian-livesync compatible sync (bidirectional & read-only, manual & interval-based, conflict detection & resolution, analysis mode, optional E2E encryption)
- **MCP Context Server** — Model Context Protocol integration for AI assistants (Claude, Cursor, etc.) to read and write vault contents via standardized MCP tools and resources (read: list, search, read; write: create, edit, delete, move, rename)
- **Context Panel** — Right-side panel with four views (Outline, Links, Tags, Properties), icon-only tab navigation with Drag & Drop reordering, panel splitting with per-section tab bars, cross-section tab movement, and auto-close of empty sections
- **Knowledge Graph** — Interactive force-directed graph visualization of vault link structure (SVG + d3-force, zoom/pan/drag, search, node highlighting, tab integration, backend link-index with JSON persistence and incremental updates)

- **Feature Toggles** — Centralized feature toggle system for administrators. Toggle features (vault-sync, obsidian-plugin-compat, chat, mcp, knowledge-graph) via config, environment variables, or Admin API at runtime. Hot-toggles take effect immediately, cold-toggles show restart-required hint. Feature guards block API routes for disabled features. Frontend hides UI elements for disabled features. Replaces the old `mcp.enabled` config.

- **Obsidian Plugin Compatibility (work-in-progress)** ⚠️ *experimental* — Compatibility layer for Obsidian Community Plugins: API shims (App, Vault, Workspace, MetadataCache), plugin loader with lifecycle management (onload/onunload), security sandbox (vault isolation, storage namespace, network allowlist, main-thread blocking detection), Command Palette (Ctrl+P), CSS injection with scoped styles, compatibility analyzer, plugin settings persistence, backend plugin store. **Limitation:** Only browser-compatible plugins can run. Plugins requiring Node.js modules (tls, net, crypto, fs, etc.) cannot be executed — server-side plugin execution is planned as a separate feature.

- **CI/CD Release Pipeline** — Automated release pipeline with GitHub Actions: CI workflow (lint, test, build on every push/PR), automatic Semantic Versioning via Release Please (Conventional Commits), multi-arch Docker image builds (amd64 + arm64), push to GHCR (+ optional DockerHub), version check in Admin UI (installed vs. latest on GitHub, update notification). Version endpoint at `GET /api/v1/version` (public, no auth).

### Planned Features

- Server-Side Plugin Execution — Run Obsidian plugins that require Node.js APIs on the backend (vm sandbox, Vault I/O shims, settings bridge, plugin logs)
- Live Preview Editor (Side-by-Side or WYSIWYG)
- Accessibility (a11y) — WCAG 2.1 AA compliance

## Language

The product UI uses German labels (e.g., "Laden…", "Fehler"). Requirements and documentation are written in German. Code comments and identifiers are in English.
