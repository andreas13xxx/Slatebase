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
- Built-in spellchecker (own Hunspell dictionaries via nspell in a Web Worker, German/English switchable per editor, German compound splitting, personal dictionary per vault, shared by its users and synced through Git Sync). Main editor only — `<textarea>` surfaces are not covered
- Voice transcription / dictation (record in the browser via `MediaRecorder`, transcribe on a self-hosted Whisper backend, insert text at the cursor; multilingual, optional audio attachment + embed). Feature toggle `voice-transcription` (cold, default off, admin-disableable); audio never leaves the operator's server. **Compute-intensive — GPU recommended, slow on a small VPS.** The Whisper backend is not part of the Slatebase image; the operator provides it and sets `SLATEBASE_TRANSCRIPTION_BACKEND_URL`. Rationale + rejected plugin alternatives: `PLUGIN-COMPAT.md`
- Obsidian Canvas (`.canvas` whiteboards: text/file/link/group nodes, edges, drag/resize, zoom/pan, minimap, source view, auto-save)
- PDF export via `@media print` stylesheet + browser print dialog (Command Palette: "Export to PDF…")

### Navigation & Discovery
- Search & Replace (regex, context lines, multi-vault, atomic writes) with search operators `path:`/`file:`/`tag:`/`property:`, negation, quoted values, syntax highlighting and autocomplete
- Knowledge Graph (d3-force SVG, zoom/pan/drag/search, configurable colors/layout, tag + property nodes) plus a per-note Local Graph filtered to a configurable N-hop neighborhood
- Context Panel (Outline, Links — outgoing links + backlinks incl. Unlinked Mentions with one-click linking — Tags, Properties, Footnotes list — splittable, DnD)
- Properties editor: typed frontmatter editing (text/number/date/datetime/checkbox/list/tags) with type inference and a per-vault Property-Type-Registry
- Bases ⚠️ experimental (feature toggle `bases`, cold/default-off): Obsidian-compatible `.base` files (real Obsidian format — expression-string filters, `groupBy` object, summaries, view limit) as filterable, sortable, editable views over the vault's metadata — a table view (inline cell editing) and a cards/Kanban view (notes grouped into collapsible columns by `groupBy`, cards drag between columns to rewrite the grouping property) and a flat list view (`type: list` — one entry per note, read-only, formula columns evaluated) and a map view (`type: map` — notes with geo coordinates plotted as pins on a Leaflet map, click-to-open; coordinate property configurable, operator-set tile server via `SLATEBASE_MAP_TILE_URL`, inactive without one), AND/OR/NOT filters written as the Obsidian expression language (`'status != "done"'`, `file.hasTag("book")`, `file.inFolder(...)`) evaluated client-side by a shared CSP-safe expression engine (own tokenizer→Pratt parser→evaluator, no `eval`) that also backs formula columns, read-only formula columns, inline cell editing writing back to each note's frontmatter, raw-YAML source view. Third-party plugins can contribute their own Bases view types via `Plugin.registerBasesView()` (the Bases plugin API is functional — the plugin's view is mounted and fed the same query data as the built-in views). The expression language is a pragmatic subset (common functions + methods: `if`/`concat`/`date`/`days`/`number`/`list`/`link`/`min`/`max`/`length`, string/number/date/list methods, date durations), not the full Obsidian function library; custom formula `summaries` over `values` and list `map`/`filter` lambdas are not implemented. Known limits: the link index hands over at most 5000 candidate rows, with the cheaply-checkable filter predicates (property equality, `file.hasTag`, `file.inFolder`) pushed to the backend BEFORE that cut and a visible "truncated" notice when it is still hit; `file.size`/`file.backlinks` work (`file.embeds` does not; `file.path`/`basename` work); the index hands properties over as lists, so a property observed with ≥2 values anywhere (or declared list/tags in the property-type registry) reads as a list even with one value, otherwise a one-element list reads as a single value; formula columns are read-only but ARE sortable (client-side, by evaluated value); a `.base` embeds read-only via `![[file.base]]` (`![[file.base#View]]` picks a named view; an unknown name is a visible error; always rendered as a table, never refreshed on `vault:change`), `this` in a base's filters/formulas is the embedding note (the base file itself when opened on its own; null in MCP `query_base` and plugin views), a ```` ```base ```` code block holds the YAML inline in a note and renders the same read-only table (`bases:insert` inserts a skeleton; plain code on a public share), and `bases:add-item` creates a scoped note; per-column `summaries` are computed. The MCP tool `query_base` evaluates a `.base` server-side with the same shared engine (default 100 rows, max 1000, includes summaries)
- Sidebar Panel (Recent Files + Bookmarks views, splittable, tabbed)
- Activity Timeline ⚠️ experimental (feature toggle `activity-timeline`, cold/default-off): a chronological per-vault log of note create/edit/delete/move/restore, recorded as a side effect of every vault mutation (REST, MCP, git-sync and mail-import write paths), coalescing rapid edits into one entry; viewable as a full tab or a compact side-panel view, grouped into time buckets, filterable by type, live-refreshed on `vault:change`, with per-vault retention pruned by the existing cleanup job. The full tab adds a two-column layout with a statistics panel (By-type bars + a last-10-weeks heatmap loaded on its own fixed window, and a day/week/month/year range switcher persisted per user+vault), an origin badge marking non-`web` events (mcp/git-sync/mail-import) and a folder filter. git-sync records a single `sync.completed` event per effective pull (never per merged file, and only when files were pulled — a pure push writes nothing); mail-import records each imported mail as `note.created` and keeps the link index in sync. The activity log stays per-instance (never git-synced)
- Bookmarks for files, headings, blocks and saved searches — drag-and-drop reordering, context menu, custom labels
- Navigation history (back/forward with Alt+←/→), Quick Switcher (Ctrl+O), tab cycling (Ctrl+Shift+]/[), breadcrumb bar, File Explorer "follow active file"
- Aliases: frontmatter `aliases:` resolve `[[Alias]]` wikilinks to the declaring note (reading view + Live Preview) and surface as Quick Switcher hits shown as „Alias → Datei"; a real file name always wins over an alias, several files sharing an alias disambiguate like same-named files (same folder → shortest path → alphabetical)
- Random Note (open a random note from the current vault — command `slatebase:open-random-note`, Command Palette, sidebar toolbar button, configurable hotkey, Obsidian-compat `random-note` command)
- Unique Note / Zettelkasten (create a new note named with a `YYYYMMDDHHmmss` timestamp prefix in a per-vault configurable folder — command `slatebase:create-unique-note`, Command Palette, configurable hotkey, Obsidian-compat `unique-note:create-today`; empty folder = vault root, timestamp format fixed)
- Web Viewer (open an external web page in a sandboxed iframe tab — command `webviewer:open`, URL prompt, http(s) only, `no-referrer`). Optional `![](url)` auto-embed in reading view behind a per-vault opt-in (`webEmbedEnabled`, default off — auto-loading third-party URLs from a document is a tracking/clickjacking surface and loads foreign pages for readers of a shared vault); off renders a plain link. Live-Preview auto-embed is a separate follow-up
- Split panes (split the editor into a nestable pane tree — "Split right"/"Split down" commands, edge-drop split, cross-pane tab drag, keyboard-operable resize; layout persisted per vault with migration from the legacy flat tab row; plugin split APIs — `createLeafBySplit`/`splitActiveLeaf`/`getLeaf('split')` — create real panes)
- Workspaces (save the current layout — pane tree + open tabs + both side-panel layouts — as a named workspace and switch between several; commands `workspaces:save`/`workspaces:load`, a save/load modal with inline rename/delete, overwrite confirmation; stored per user+vault server-backed, content-free snapshots; a workspace referencing a since-deleted file loads the rest and skips the missing tab)
- Command Palette (Ctrl+P, 40+ built-in commands; plugin commands when compat is enabled)
- Slash commands: in-editor `/` menu at the cursor (headings, lists, quote, code block, callout, table, horizontal rule, internal link, insert template, date/time), filtered by fuzzy match, delegating to the same core commands as the palette — triggers only at a line start / after whitespace, never inside code, wikilinks or math
- Hover Preview (rendered Markdown popover on internal links, with inline-editable frontmatter properties), file-type icons in the explorer

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
foreign-format importer, semantic search, collaborative editing, E2E test suite. Bases is
shipped incl. card drag-between-columns, plugin views via `registerBasesView()` and the MCP
tool `query_base`; its known limits/gaps (candidate cap, function subset, `summaries`, …)
are listed in the Bases line above and in `implementation-plan.md` (Prio 6).

## Language Convention

- Product UI: German labels
- Requirements/docs: German
- Code/identifiers: English
