# Slatebase — Product Overview

Self-hosted Knowledge-Context-Server for Markdown vaults. Multi-user web UI for Obsidian-compatible vaults — no database, no sync service, no desktop app required.

## Implemented Features

- Multi-vault management (CRUD, import/export, unified file explorer)
- Tabbed Markdown editor/viewer (auto-save, GFM, syntax highlighting, collapsible headings)
- Obsidian-compatible rendering (Wikilinks, Embeds with inline PDF, Callouts, Tags incl. Frontmatter-Tags, Block References, Soft→Hard Line Breaks)
- Authentication (opaque tokens, argon2id, CSRF, sliding sessions, rate limiting)
- Multi-user & sharing (granular read/write, ownership transfer)
- Real-time chat (unread badges, archiving, pagination)
- Admin panel (user management, audit log, config, feature toggles)
- Vault sync via Obsidian LiveSync plugin (CouchDB/livesync, bidirectional, running natively in the plugin compat layer with server-side CORS proxy; PouchDB IndexedDB local DB, vault event bridge for push sync)
- MCP Context Server (AI read+write via Model Context Protocol)
- Context Panel (Outline, Links, Tags, Properties — splittable, DnD)
- Knowledge Graph (d3-force SVG, zoom/pan/drag/search, konfigurierbare Farben/Layout, Tag-Nodes, Property-Nodes)
- Search & Replace (regex, context lines, multi-vault, atomic writes)
- Realtime infrastructure (SSE: chat push, presence, vault changes, toasts, reconnect with replay — always active when authenticated)
- Obsidian plugin compat ⚠️ experimental (API shims, sandbox, command palette, CSS injection, workspace leaf API with plugin views as tabs/sidebar sections; extended API coverage for Calendar, Dataview, Templater, LiveSync, Excalidraw, Editing Toolbar, Kanban — full EditorShim with CM6 backend, MarkdownView stub, editorCallback commands, MarkdownRenderer.render(), Notice→Toast bridge, requestUrl() backend proxy, registerExtensions file routing, CodeBlockProcessor registry with ViewMode integration, SuggestModal/FuzzySuggestModal, getAllTags, debounce, App.loadLocalStorage/saveLocalStorage, Vault.copy, Obsidian CSS variables, DOM extensions, icon registry; **Dataview full inline-query compat**: syntaxTree wrapper for InlineCode range adjustment, MetadataCacheShim on-demand parsing (frontmatter/tags/links), VaultShim root-folder for PrefixIndex, selection-dispatch for immediate decoration rendering; **LiveSync full compat**: CORS proxy for cross-origin fetch/XHR, PouchDB IndexedDB local DB, bidirectional CouchDB replication via server-side proxy, vault event bridge for push sync, binary file upload support, plugin view tabs; **Kanban partial compat**: TextFileView file-view-registry routing, Board layout rendering with lanes, CSS scoping via data-plugin-id, Component.addChild lifecycle — lane titles/card text not yet rendered due to Preact/MarkdownDomRenderer lifecycle gap; **Editing Toolbar compat**: real attached `MarkdownView.containerEl` (`.markdown-source-view` marker on the editor pane), layout/leaf events re-fired on editor mount, `getActiveViewOfType` covering the ItemView/FileView family, `app.commands`/`hotkeyManager` backed by the shared CommandRegistry, full Lucide icon resolution, dual self+descendant CSS scoping for plugin UI in shared workspace DOM)
- Community Plugin Store (browse the full Obsidian community plugin list in Settings, text/compatible/installed filters, install straight from GitHub releases, single + bulk updates, manual and 24h automatic update check, download counts from Obsidian's aggregated stats feed; desktop-only gate, domain allowlist, size limits, rate-limit tracking, optional `SLATEBASE_GITHUB_TOKEN`)
- Feature toggles (hot/cold toggle, env overlay, API + admin UI; toggles: obsidian-plugin-compat, chat, mcp, knowledge-graph, welcome-vault, live-preview)
- CI/CD (GitHub Actions, Release Please, multi-arch Docker, GHCR)
- i18n (German/English), Dark Mode, Docker deployment
- Vault Explorer enhancements (statistics tooltip, custom context menu, drag & drop file upload)
- Editor improvements (line numbers, undo/redo history stack, recent files, templates, daily notes, image paste, favorites). Formatting runs through the Command Palette or an Obsidian-compatible plugin toolbar — there is no native formatting toolbar
- Trash & file versioning (soft-delete with retention, version browser with inline diff, configurable cleanup job)
- Login version display (server version shown on login screen)
- Unified Settings Panel (Ctrl+,, categorized sidebar, responsive, keyboard-navigable, search)
- Mermaid diagram rendering (lazy-loaded mermaid.js, SVG inline, Dark/Light mode, error fallback, 5s timeout)
- Command Palette (Ctrl+P, always active, 40+ built-in commands: navigation, vault ops, editor formatting, admin; plugin commands when compat enabled)
- Per-user preferences persistence (recent files, favorites synced to server with localStorage cache)
- Per-vault configuration (templates directory, daily notes directory — owner-configurable via Settings)
- Configurable keyboard shortcuts (per-user overrides, 14 commands, conflict detection, Settings UI)
- Welcome Vault v2 (comprehensive tutorial vault with 35+ guides DE/EN, screenshots, practice exercises, templates; API endpoint for on-demand creation, Settings button, Command Palette integration, name deduplication)
- Obsidian Canvas (`.canvas` whiteboards: text/file/link/group nodes, edges, drag/resize, zoom/pan, minimap, source view, auto-save; link-node iframe preview, file-node content/path editing with vault-wide file-path search)
- Status Bar (bottom bar with clock, extensible for plugin items, toggleable in Settings → Darstellung)
- Sidebar Panel (left panel with Recent Files + Favorites views, splittable, tabbed)
- Session verification (lightweight session-alive check on app mount, graceful expiry handling)
- Live Preview Editor (CodeMirror 6 — Source + Live Preview mode, cursor-aware inline rendering, plugin extensions via Compartments; GFM tables, Mermaid diagrams, standard images, horizontal rules, highlight ==text==, frontmatter properties box, readable line length, click-to-follow links, callout fold/unfold with todo type; feature toggle `live-preview`)
- Workspace State Persistence (open tabs, expanded folders, panel sizes/visibility, active page restored across page reloads; per-vault tab memory on vault switch)
- Hover Preview (internal link hover popover with rendered Markdown preview, plugin compat via workspace hover-link event)
- File Type Icons (file-extension-based icons in explorer via @react-symbols/icons with Lucide fallback)
- Canvas link extraction (wikilinks inside .canvas JSON files included in knowledge graph)

## Planned

- Obsidian Themes (CSS variable mapping, theme loader + picker)
- Public sharing (token links, read-only rendering)
- Semantic search / AI embeddings
- Server-Side Plugins (Node.js APIs in vm sandbox)
- Security hardening, accessibility audit (WCAG 2.1 AA), responsive/mobile
- Collaborative editing (CRDT)

## Language Convention

- Product UI: German labels
- Requirements/docs: German
- Code/identifiers: English
