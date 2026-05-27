# Slatebase — Product Overview

Slatebase is a self-hosted Knowledge-Context-Server for Markdown vaults. It allows users to manage, browse, and edit Markdown-based knowledge bases through a web interface. The system is designed to be compatible with Obsidian vaults.

## Current State

Slatebase is feature-complete for its core use case: multi-user Markdown vault management with web-based editing, sharing, and real-time chat.

### Implemented Features

- **Multi-vault management** — Create, delete, import/export, switch between vaults
- **File explorer** — Directory tree navigation with Lucide icons
- **Tabbed editor/viewer** — Multiple files open simultaneously, auto-save, View/Edit modes
- **Markdown rendering** — GFM, syntax highlighting, frontmatter, collapsible headings
- **Authentication** — Session-based auth (opaque tokens, argon2id, CSRF, rate limiting)
- **Multi-user & sharing** — Granular read/write vault permissions, ownership transfer
- **User chat** — Real-time messaging between users with unread badges, archiving, pagination
- **Admin panel** — User management, audit log, server configuration
- **Import & export** — File/folder import, vault export (ZIP or File System Access API)
- **Advanced file operations** — Delete, rename files/folders within vaults
- **Internationalization (i18n)** — German and English UI, per-user preference
- **Dark mode** — System-preference-based or manual override (light/dark/system)
- **Docker deployment** — Multi-stage build, Nginx reverse proxy, non-root user

### Planned Features

- Vault synchronization (LiveSync/CouchDB compatible)
- Knowledge graph visualization
- AI Context Server with MCP (Model Context Protocol) integration
- Obsidian Community Plugin compatibility layer
- Accessibility (a11y) — WCAG 2.1 AA compliance

## Language

The product UI uses German labels (e.g., "Laden…", "Fehler"). Requirements and documentation are written in German. Code comments and identifiers are in English.
