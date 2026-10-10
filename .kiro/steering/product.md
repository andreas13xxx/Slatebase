# Slatebase — Product Overview

Self-hosted Knowledge-Context-Server for Markdown vaults. Multi-user web UI for
Obsidian-compatible vaults — no database, no sync service, no desktop app required.

## Implemented Features

### Vaults & Files
- Multi-vault management (CRUD, import/export, unified file explorer, statistics tooltip, context menu, drag & drop upload)
- Trash & file versioning (soft-delete with retention, version browser with inline diff, periodic cleanup job)
- Per-vault configuration (templates, daily notes and attachments directory — owner-configurable; an empty attachments directory means „same folder as the note")
- Automatic link migration on rename/move: every wikilink pointing at the old path is rewritten vault-wide, including bare-name links and whole-folder moves; runs before the response returns and reports partial failures
- Advanced file operations (move, rename, unique-filename conflict resolution, templates, daily notes)
- Note Composer: split a file / extract a heading or selection into a new note, linked back with a wikilink; bare-name wikilinks in the extracted text that would resolve differently from the new note's location are rewritten to explicit paths (Obsidian 1.13 "update links on extract")

### Editor & Rendering
- Tabbed editor/viewer (auto-save, GFM, syntax highlighting, collapsible headings, recent files, image paste)
- Live Preview Editor (CodeMirror 6 — Source + Live Preview mode, cursor-aware inline rendering, plugin extensions via Compartments; tables, Mermaid, KaTeX, images, audio/video, highlights, frontmatter properties box, readable line length, click-to-follow links, callout folding)
- Obsidian-compatible rendering (Wikilinks, Embeds incl. inline PDF/Audio/Video, Callouts, Tags incl. frontmatter tags, Block References, soft→hard line breaks)
- Highlights with colors: `==text==` (yellow) plus five emoji-selected colors (`==🔴 text==` red, 🟠 orange, 🟢 green, 🔵 blue, 🟣 purple), rendered in both Live Preview and reading view; `==`-autocomplete and an editor context-menu color submenu to apply them (Obsidian 1.14 syntax, portable Markdown)
- Mermaid diagrams and LaTeX math (KaTeX), both lazy-loaded, dark/light aware, with error/timeout fallback to raw source
- Audio/video embeds (`![[file.mp3]]` → `<audio>`, `![[file.mp4]]` → `<video>` with size syntax)
- Inline raw HTML subset: allowlisted inline tags (`<font color>`, `<mark>`, `<span style>`) and `<center>` blocks render in both Live Preview and reading view; everything else — `on*` handlers, `script`, `iframe` — stays literal text
- Built-in spellchecker (own Hunspell dictionaries via nspell in a Web Worker, German/English switchable per editor, German compound splitting, personal dictionary per browser). Main editor only — `<textarea>` surfaces are not covered
- Voice transcription / dictation (record in the browser via `MediaRecorder`, transcribe on a self-hosted Whisper backend, insert text at the cursor; multilingual, optional audio attachment + embed). Feature toggle `voice-transcription` (cold, default off, admin-disableable); audio never leaves the operator's server. **Compute-intensive — GPU recommended, slow on a small VPS.** The Whisper backend is not part of the Slatebase image; the operator provides it and sets `SLATEBASE_TRANSCRIPTION_BACKEND_URL`. Rationale + rejected plugin alternatives: `PLUGIN-COMPAT.md`
- Obsidian Canvas (`.canvas` whiteboards: text/file/link/group nodes, edges, drag/resize, zoom/pan, minimap, source view, auto-save)
- PDF export via `@media print` stylesheet + browser print dialog (Command Palette: "Export to PDF…")

### Navigation & Discovery
- Search & Replace (regex, context lines, multi-vault, atomic writes) with search operators `path:`/`file:`/`tag:`/`property:`, negation, quoted values, syntax highlighting and autocomplete
- Knowledge Graph (d3-force SVG, zoom/pan/drag/search, configurable colors/layout, tag + property nodes) plus a per-note Local Graph filtered to a configurable N-hop neighborhood
- Context Panel (Outline, Links incl. Unlinked Mentions with one-click linking, Tags, Properties — splittable, DnD)
- Properties editor: typed frontmatter editing (text/number/date/datetime/checkbox/list/tags) with type inference and a per-vault Property-Type-Registry
- Bases ⚠️ experimental (feature toggle `bases`, cold/default-off): Obsidian-compatible `.base` files as filterable, sortable, editable views over the vault's metadata — a table view (inline cell editing) and a cards/Kanban view (notes grouped into collapsible columns by a `groupBy` property, read-only cards), AND/OR filters on properties/tags/path/file-metadata, read-only formula columns (own CSP-safe interpreter, not the full Obsidian formula language), inline cell editing writing back to each note's frontmatter, raw-YAML source view. Third-party plugins can contribute their own Bases view types via `Plugin.registerBasesView()` (the Bases plugin API is functional — the plugin's view is mounted and fed the same query data as the built-in views). Card drag-between-columns and the full formula language are later stages
- Sidebar Panel (Recent Files + Bookmarks views, splittable, tabbed)
- Activity Timeline ⚠️ experimental (feature toggle `activity-timeline`, cold/default-off): a chronological per-vault log of note create/edit/delete/move/restore, recorded as a side effect of every vault mutation (REST and MCP write paths), coalescing rapid edits into one entry; viewable as a full tab or a compact side-panel view, grouped into time buckets, filterable by type, live-refreshed on `vault:change`, with per-vault retention pruned by the existing cleanup job
- Bookmarks for files, headings, blocks and saved searches — drag-and-drop reordering, context menu, custom labels
- Navigation history (back/forward with Alt+←/→), Quick Switcher (Ctrl+O), tab cycling (Ctrl+Shift+]/[), breadcrumb bar, File Explorer "follow active file"
- Split panes (split the editor into a nestable pane tree — "Split right"/"Split down" commands, edge-drop split, cross-pane tab drag, keyboard-operable resize; layout persisted per vault with migration from the legacy flat tab row; plugin split APIs — `createLeafBySplit`/`splitActiveLeaf`/`getLeaf('split')` — create real panes)
- Command Palette (Ctrl+P, 40+ built-in commands; plugin commands when compat is enabled)
- Hover Preview (rendered Markdown popover on internal links), file-type icons in the explorer

### Multi-User & Realtime
- Authentication (opaque tokens, argon2id, CSRF, sliding sessions, rate limiting). Only a server 401 ends a session — an unreachable backend is retried
- Multi-user & sharing (granular read/write, ownership transfer)
- Real-time chat (unread badges, archiving, pagination)
- Realtime infrastructure (SSE: chat push, presence, vault changes, plugin/preference changes, toasts, reconnect with replay — always active when authenticated)
- Admin panel (user management, audit log, server config, log viewer, feature toggles, restart)

### Sync & Integration
- MCP Context Server (AI read+write via Model Context Protocol, incl. binary files and link-index-consistent writes)
- Git-Sync (per-vault git remotes with HTTPS-token or SSH-key auth, vault-level branch, per-remote interval, manual sync, conflict reporting; credentials encrypted at rest)
- Mail-Import (IMAP polling per vault, unread mails written as Markdown notes into a target folder, mailbox tree browser, per-config interval and status)
- Vault sync via the Obsidian LiveSync plugin (CouchDB, bidirectional, running natively in the plugin compat layer with server-side CORS proxy)

### Plugins & Customization
- Obsidian plugin compat ⚠️ experimental — API shims at level 1.13.2, sandbox, command palette, CSS injection, workspace leaf API with plugin views as tabs/sidebar sections. Twelve real community plugin bundles verified. Full details and per-plugin status: `PLUGIN-COMPAT.md`
- Community Plugin Store (browse the full Obsidian list in Settings, filters, install from GitHub releases, single + bulk updates, 24h update check, download counts; desktop-only gate, domain allowlist, size limits)
- CSS Snippets (per-vault custom CSS in Settings, per-snippet enable/disable, applied unscoped — distinct from the plugin-CSS injector scoped to `[data-plugin-id]`)
- Unified Settings Panel (Ctrl+`,`, categorized sidebar, searchable, keyboard-navigable, one shared `settings/ui` design system across all tabs)
- Configurable keyboard shortcuts (per-user overrides, conflict detection)
- Status Bar (clock, vault name, word/character count, cursor position with go-to-line popover, extensible plugin items; each item toggleable)
- Global tooltips (`aria-label` renders a visible tooltip, matching Obsidian's mechanism)

### State & Preferences
- Per-user preferences on the server with localStorage as cache only: account-wide via `userSettingsStore`, per-vault via `vaultSettingsStore`
- Workspace state persistence (open tabs, expanded folders, panel sizes/visibility, active page; per-vault tab memory on vault switch)

### Platform
- Feature toggles (hot/cold, env overlay, API + admin UI). Registered: `obsidian-plugin-compat`, `chat`, `mcp`, `git-sync`, `mail-import`, `voice-transcription`, `bases`, `activity-timeline` — see `featureRegistry.register()` in `backend/src/index.ts`
- Welcome Vault (tutorial vault with 70+ guides DE/EN, screenshots, exercises, templates incl. Templater examples; on-demand creation via API, Settings and Command Palette)
- Security hardening (OWASP Top 10 audit, full CSP, HSTS, path-traversal defense in depth, Zod validation on every route module, npm audit in CI) — see `SECURITY-AUDIT.md`
- Accessibility (WCAG 2.1 AA, partial: axe-core in CI, jsx-a11y lint, focus traps, skip link, keyboard-operable splitters/canvas/status bar) — see `ACCESSIBILITY-AUDIT.md`
- CI/CD (GitHub Actions, Release Please, multi-arch Docker, GHCR), i18n (German/English), dark mode, Docker deployment

## Planned

See `.kiro/specs/implementation-plan.md` for the prioritized roadmap: Obsidian Themes,
Public Sharing, Responsive/Mobile, Workspaces & Split-Panes, Server-Side Plugins,
foreign-format importer, semantic search, collaborative editing, E2E test suite. Bases
later stages (plugin-contributed views via `registerBasesView()`, card/board views, the
full formula language) are tracked in `.kiro/specs/bases-plugin-api/` and the Bases spec.

## Language Convention

- Product UI: German labels
- Requirements/docs: German
- Code/identifiers: English
