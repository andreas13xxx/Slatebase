# Slatebase — Project Structure

## Top-Level Layout

```
backend/          — Node.js REST API server
frontend/         — React SPA (Vite)
.kiro/specs/      — Feature specifications and design docs
.kiro/steering/   — Steering rules for AI assistants
```

## Backend (`backend/`)

```
src/
├── index.ts              — Composition root (DI wiring, server startup)
├── version.ts            — getVersion() utility (env → version.json → 'development' fallback)
├── config/index.ts       — Zod-validated config (file + env overlay)
├── logger/index.ts       — Pino logger with ILogger interface
├── vault/
│   ├── index.ts          — VaultReader, VaultManager, path utilities, data models
│   └── registry.ts       — VaultRegistry (persistent vault metadata in vaults.json)
├── business/
│   ├── index.ts          — VaultService (business logic, orchestrates vault operations)
│   └── validation.ts     — Vault name validation rules
├── auth/
│   ├── index.ts          — AuthService, SessionStore, interfaces, error classes
│   ├── middleware.ts     — authMiddleware, csrfMiddleware, rateLimitMiddleware
│   ├── csrf-secret.ts   — CsrfSecretManager (persistent CSRF secret: env → file → generate)
│   └── sse-ticket-store.ts — SseTicketStore (short-lived one-time tickets for SSE connections)
├── user/
│   ├── index.ts          — UserService, UserRepository, RoleService, interfaces
│   └── validation.ts     — Profile/password validation (Zod schemas)
├── audit/
│   └── index.ts          — AuditService, AuditLogger, interfaces
├── api/
│   ├── index.ts          — VaultController, route modules, error mapping
│   ├── authRoutes.ts     — AuthController + login/logout/session routes
│   ├── userRoutes.ts     — UserController + profile/password routes
│   ├── adminRoutes.ts    — AdminController + user management/config routes
│   ├── chatRoutes.ts     — ChatController + conversation/message routes
│   ├── syncRoutes.ts     — SyncController + sync config/trigger/log/conflict routes
│   ├── mcpRoutes.ts      — MCP Streamable HTTP transport endpoint (Bearer token auth)
│   ├── mcpTokenRoutes.ts — MCP token CRUD routes (session auth)
│   ├── mcpWellKnownRoute.ts — .well-known/mcp.json discovery endpoint (public)
│   ├── graphRoutes.ts    — Graph API routes (GET graph, GET graph/meta, GET backlinks, GET tags)
│   ├── client-ip.ts     — Centralized client IP extraction with trusted proxy support
│   ├── request-id.ts   — Request-ID middleware (X-Request-Id header, UUID generation)
│   ├── pluginRoutes.ts  — Plugin management CRUD routes (list, install, delete, bundle, styles, settings, registry)
│   ├── featureRoutes.ts — Feature toggle admin + public routes (GET/PUT /admin/features, GET /features)
│   ├── searchRoutes.ts — Search routes (GET /vaults/:vaultId/search, GET /search, POST /vaults/:vaultId/replace)
│   ├── searchRoutes.test.ts — Integration tests for search routes
│   ├── versionRoutes.ts — GET /api/v1/version (public, no auth, returns installed version)
│   ├── vaultShareRoutes.ts — ShareController + share/transfer routes
│   ├── statisticsRoutes.ts — GET /vaults/:vaultId/statistics (vault file/folder/size stats)
│   ├── trashRoutes.ts   — Trash CRUD routes (list, restore, permanent delete)
│   ├── fileVersionRoutes.ts — File version routes (list, get content, restore)
│   ├── templateRoutes.ts — Template routes (list, create from template)
│   ├── uploadRoutes.ts   — File upload routes (multipart, image paste mode)
│   ├── preferencesRoutes.ts — User preferences routes (GET/PUT recent-files, favorites, keybindings)
│   ├── vaultConfigRoutes.ts — Per-vault config routes (GET/PUT /vaults/:vaultId/config)
│   └── sseRoutes.ts      — GET /events (SSE stream)
├── chat/
│   ├── types.ts          — Chat data models (Conversation, Message, etc.)
│   ├── errors.ts         — Chat-specific error classes
│   ├── validation.ts     — Zod schemas for chat input validation
│   ├── index.ts          — ChatService (business logic)
│   ├── conversation-store.ts — ConversationStore (filesystem persistence)
│   ├── message-store.ts  — MessageStore (filesystem persistence)
│   ├── unread-store.ts   — UnreadStore (per-user unread counts)
│   ├── rate-limiter.ts   — ChatRateLimiter (in-memory)
│   └── chat-service.ts   — ChatService orchestration
├── sync/
│   ├── types.ts          — Sync data models (SyncConfig, SyncLogEntry, ConflictEntry, etc.)
│   ├── errors.ts         — Sync-specific error classes
│   ├── validation.ts     — Zod schemas for sync input validation
│   ├── index.ts          — Barrel export for sync module
│   ├── crypto-service.ts — CryptoService (AES-256-GCM credential & document encryption)
│   ├── setup-uri-parser.ts — SetupUriParser (obsidian-livesync URI format)
│   ├── sync-lock.ts      — SyncLock (in-memory mutex per vault)
│   ├── sync-config-store.ts — SyncConfigStore (filesystem persistence)
│   ├── sync-log-store.ts — SyncLogStore (JSONL append-only, rotation)
│   ├── conflict-store.ts — ConflictStore (filesystem persistence)
│   ├── checkpoint-store.ts — CheckpointStore (filesystem persistence)
│   ├── sync-engine.ts    — SyncEngine (CouchDB communication, pull/push/analyze)
│   ├── sync-scheduler.ts — SyncScheduler (setInterval management)
│   └── sync-service.ts   — SyncService (business logic orchestrator)
├── mcp/
│   ├── index.ts          — Barrel export for MCP module
│   ├── types.ts          — MCP data models (TokenRecord, ApiTokenInfo, McpTokenContext, etc.)
│   ├── config.ts         — McpConfig interface + loadMcpConfig() from env/config
│   ├── errors.ts         — MCP-specific error classes (McpAuthenticationError, TokenLimitError, etc.)
│   ├── validation.ts     — Zod schemas for token creation + tool parameters
│   ├── token-store.ts    — TokenStore (filesystem persistence, in-memory hash index)
│   ├── token-service.ts  — McpTokenService (token lifecycle: create, validate, revoke, list)
│   ├── rate-limiter.ts   — McpRateLimiter (sliding window per token)
│   ├── handlers.ts       — McpHandlers (MCP resource handlers: list, read)
│   ├── tool-handlers.ts  — MCP tool handlers (list_vaults, get_vault_structure, search_vault, read_file, write_file, create_directory, delete_file, move_file, rename_file)
│   └── server-factory.ts — McpServerFactory (creates configured McpServer instance)
├── search/
│   ├── index.ts              — Barrel export for search module
│   ├── types.ts              — ISearchService, IReplaceService, SearchResponse, SearchHit, etc.
│   ├── errors.ts             — SearchQueryValidationError, RegexValidationError, RegexTooLongError, SearchTimeoutError, ReplaceValidationError, FileChangedError
│   ├── validation.ts         — Zod schemas (searchQuerySchema, multiVaultSearchSchema, replaceBodySchema)
│   ├── search-service.ts     — SearchService (linear file iteration, plain-text + regex, context lines, multi-vault)
│   ├── replace-service.ts    — ReplaceService (atomic write, max 100 files, partial failure)
│   ├── replace-service.test.ts — Unit tests for ReplaceService
│   └── (search-service.test.ts) — Optional: Unit tests for SearchService
├── link-index/
│   ├── index.ts              — Barrel export for link-index module
│   ├── types.ts              — ILinkIndex interface, GraphData, GraphNode, GraphEdge, GraphQueryOptions, GraphMeta, ParsedWikilink
│   ├── wikilink-parser.ts    — Backend extractWikilinks() (code-block-aware, all formats)
│   ├── wikilink-parser.test.ts — Unit tests for parser
│   ├── tag-extractor.ts      — extractTags() (code-block-aware, nested tags, dedup)
│   ├── tag-extractor.test.ts — Unit tests for tag extractor
│   ├── property-extractor.ts — extractProperties() (YAML frontmatter, regex-based)
│   ├── property-extractor.test.ts — Unit tests for property extractor
│   ├── link-index-service.ts — LinkIndexService (rebuild, incremental updates, JSON v2 persistence, tags, properties, getGraph with options, getGraphMeta)
│   └── link-index-service.test.ts — Unit tests for LinkIndexService v2
├── plugin/
│   ├── index.ts              — Barrel export for plugin module
│   ├── types.ts              — IPluginStore, PluginManifest, PluginFiles, PluginRegistryData interfaces
│   ├── errors.ts             — PluginNotFoundError, PluginFileTooLargeError, PluginSettingsTooLargeError
│   ├── validation.ts         — Zod schemas (pluginManifestSchema, pluginRegistrySchema)
│   ├── plugin-store.ts       — PluginStore (filesystem persistence, atomic writes, per-vault per-plugin dirs)
│   ├── plugin-store.test.ts  — Unit tests for PluginStore
│   ├── plugin-installer.ts   — PluginInstaller (ZIP extraction, manifest validation, bundle integrity, version comparison)
│   └── plugin-installer.test.ts — Unit tests for PluginInstaller
├── feature-toggle/
│   ├── index.ts              — Barrel export for feature-toggle module
│   ├── types.ts              — IFeatureToggleService, IFeatureRegistry, FeatureToggleDefinition, FeatureToggleState, etc.
│   ├── errors.ts             — FeatureNotFoundError, FeatureAlreadyRegisteredError, InvalidFeatureNameError
│   ├── feature-registry.ts   — FeatureRegistry (declarative registration with validation)
│   ├── feature-toggle-service.ts — FeatureToggleService (in-memory state, env-var overlay, onChange listeners)
│   └── middleware.ts         — createFeatureGuard() factory (Hono middleware, 403 on disabled features)
├── realtime/
│   ├── index.ts              — Barrel export for realtime module
│   ├── types.ts              — SseEvent, SseEventType, ConnectionEntry, EventTarget, PublishOptions, ReplayBufferEntry
│   ├── errors.ts             — ConnectionLimitError
│   ├── connection-manager.ts — ConnectionManager (per-user connections, broadcast, drain, limits)
│   ├── event-bus.ts          — EventBus (publish with targeting, rate limiting, replay buffer)
│   ├── replay-buffer.ts      — ReplayBuffer (per-user circular buffer with TTL eviction)
│   └── presence-service.ts   — PresenceService (online/offline tracking, heartbeat, visibility)
├── trash/
│   ├── index.ts              — Barrel export for trash module
│   ├── types.ts              — ITrashService, TrashEntry, TrashIndex interfaces
│   ├── errors.ts             — TrashNotFoundError, TrashRestoreError
│   └── trash-service.ts      — TrashService (soft-delete, restore, purgeExpired, atomic index)
├── version/
│   ├── index.ts              — Barrel export for version module
│   ├── types.ts              — IVersionService, VersionEntry, VersionList interfaces
│   ├── errors.ts             — VersionNotFoundError, VersionLimitError
│   └── version-service.ts    — VersionService (createVersion, listVersions, restoreVersion, pruneVersions, moveVersions)
├── template/
│   ├── index.ts              — Barrel export for template module
│   ├── types.ts              — ITemplateService, TemplateInfo interfaces
│   ├── errors.ts             — TemplateNotFoundError, TemplateConflictError
│   └── template-service.ts   — TemplateService (listTemplates, createFromTemplate, placeholder replacement)
├── statistics/
│   ├── index.ts              — Barrel export for statistics module
│   ├── types.ts              — IVaultStatisticsService, VaultStatistics interfaces
│   └── statistics-service.ts — VaultStatisticsService (recursive scan, in-memory cache, 5s timeout)
├── cleanup/
│   ├── index.ts              — Barrel export for cleanup module
│   ├── types.ts              — ICleanupJob, CleanupConfig interfaces
│   └── cleanup-job.ts        — CleanupJob (periodic trash purge + version prune, per-file error isolation)
├── preferences/
│   ├── index.ts              — Barrel export for preferences module
│   ├── types.ts              — IPreferencesService, UserPreferences, RecentFileEntry, FavoriteEntry, KeybindingEntry
│   ├── validation.ts         — Zod schemas (saveRecentFilesSchema, saveFavoritesSchema, saveKeybindingsSchema)
│   └── preferences-store.ts  — PreferencesStore (per-user JSON file, atomic writes)
├── vault-config/
│   ├── index.ts              — Barrel export for vault-config module
│   ├── types.ts              — IVaultConfigService, VaultConfig (templatesDirectory, dailyNotesDirectory)
│   ├── validation.ts         — Zod schema (updateVaultConfigSchema)
│   └── vault-config-store.ts — VaultConfigStore (per-vault .vault-config.json, atomic writes)
├── welcome-vault/
│   ├── index.ts              — IWelcomeVaultService, WelcomeVaultService (never-throw, language-aware template copy)
│   └── types.ts              — WelcomeVaultConfig, WelcomeVaultLanguage, OnUserCreatedFn
├── import/index.ts       — ImportService (file/folder import logic)
└── integration.test.ts   — Integration tests
config/
└── default.json          — Default server configuration
data/
├── vaults.json           — Persistent vault registry
├── vaults/<id>/          — Vault storage directories (one per vault)
├── templates/welcome-vault/    — German welcome vault template (copied for new users with preferredLanguage=de)
└── templates/welcome-vault-en/ — English welcome vault template (copied for new users with preferredLanguage=en)
```

## Frontend (`frontend/`)

```
src/
├── main.tsx              — React entry point
├── App.tsx               — Root component, 3-panel layout, routing, resize, AppPage type export
├── App.css               — Global styles (Design Tokens in index.css)
├── index.css             — CSS Custom Properties (Design Tokens, Dark Mode)
├── types.ts              — Shared TypeScript interfaces (VaultInfo, DirectoryTree, AppState with vaultTrees, etc.)
├── api/index.ts          — ApiClient (IApiClient interface + fetch implementation, includes getVersion())
├── utils/
│   ├── semver.ts         — compareSemver() utility (X.Y.Z comparison, v-prefix stripping)
│   ├── error.ts          — extractErrorMessage(err, fallback) shared utility
│   ├── restoreState.ts   — UI state preservation across session expiry (save/read/clear/updateSnapshot)
├── canvas/
│   ├── index.ts          — Barrel export (parser, serializer, types)
│   ├── types.ts          — CanvasDocument, CanvasNode (Text/File/Link/Group), CanvasEdge, parse result types
│   ├── parser.ts         — parseCanvas (Zod validation, passthrough unknown fields for forward-compat)
│   ├── serializer.ts     — serializeCanvas (Model→JSON, round-trip compatible)
│   └── parser.test.ts    — Unit tests for parser/serializer round-trip
├── plugins/
│   ├── index.ts          — Barrel export (all plugins, types, utilities)
│   ├── types.ts          — MDAST node types (WikilinkNode, EmbedNode, CalloutNode, TagNode), IMAGE_EXTENSIONS, PDF_EXTENSIONS
│   ├── link-resolver.ts  — Wikilink target resolution against DirectoryTree
│   ├── heading-anchor.ts — Heading anchor generation + deduplication tracker
│   ├── wikilink/
│   │   ├── syntax.ts     — micromark tokenizer extension for [[...]] syntax
│   │   ├── mdast-util.ts — fromMarkdown + toMarkdown handlers
│   │   ├── plugin.ts     — remark plugin wrapper (remarkWikilink)
│   │   └── extract.ts    — extractWikilinks() utility for knowledge graph
│   ├── embed/
│   │   ├── syntax.ts     — micromark tokenizer extension for ![[...|...]] syntax (with pipe separator for size/display), detectEmbedType() (image/pdf/note)
│   │   ├── mdast-util.ts — fromMarkdown + toMarkdown handlers (target, heading, display fields)
│   │   └── plugin.ts     — remark plugin wrapper (remarkEmbed)
│   ├── callout/
│   │   ├── transform.ts  — MDAST transformer (blockquote → CalloutNode)
│   │   ├── serializer.ts — toMarkdown serializer
│   │   └── plugin.ts     — remark plugin wrapper (remarkCallout)
│   └── tag/
│       ├── syntax.ts     — micromark tokenizer extension for #tag syntax
│       ├── mdast-util.ts — fromMarkdown + toMarkdown handlers
│       └── plugin.ts     — remark plugin wrapper (remarkTag)
│   └── compat/           — Obsidian Plugin Compatibility Layer
│       ├── types.ts      — TFile, TFolder, TAbstractFile, CachedMetadata, PluginManifest, PluginRegistryEntry, etc.
│       ├── errors.ts     — PluginError, ManifestValidationError, BundleEvaluationError, LifecycleError, etc.
│       ├── event-system.ts — IEventEmitter (on/off/trigger/offref/removeAllListeners)
│       ├── manifest-parser.ts — Manifest parsing with Zod validation + semver comparison
│       ├── plugin-loader.ts — PluginLoader (bundle evaluation, lifecycle, timeout, cleanup)
│       ├── plugin-registry.ts — PluginRegistry (frontend state, backend persistence)
│       ├── sandbox.ts    — PluginSandbox (vault isolation, storage namespace, network allowlist, blocking detection)
│       ├── settings-manager.ts — SettingsManager (loadData/saveData per plugin per vault)
│       ├── command-registry.ts — CommandRegistry (addCommand, removeAll, search, hotkeys)
│       ├── css-injector.ts — CSS injection with scoped selectors (data-plugin-id prefix)
│       ├── compatibility-analyzer.ts — Multi-layer browser compatibility analysis (isDesktopOnly gate, Node.js module detection, Obsidian API pattern matching)
│       ├── plugin-context.ts — PluginProvider + usePluginContext hook (vault-scoped instances, FCP loading)
│       ├── plugin-event-bridge.ts — usePluginEventBridge hook (tab→workspace, save→cache, tree→resolved)
│       └── shims/
│           ├── app-shim.ts — AppShim (Proxy-based, vault/workspace/metadataCache/plugins properties)
│           ├── vault-shim.ts — VaultShim (read/modify/create/delete/getAbstractFileByPath/events)
│           ├── workspace-shim.ts — WorkspaceShim (getActiveFile, file-open, active-leaf-change)
│           └── metadata-cache-shim.ts — MetadataCacheShim (getFileCache, resolvedLinks, changed/resolved events)
├── state/
│   ├── index.ts          — AppProvider, appReducer, action creators
│   ├── authState.ts      — Auth reducer + types
│   ├── authContext.ts    — AuthProvider + useAuthContext hook
│   ├── tabState.ts       — Tab reducer + types
│   ├── tabContext.ts     — TabProvider + useTabContext hook
│   ├── tabActions.ts     — openTab, saveTab action creators (+ recentFilesStore.add on open)
│   ├── chatState.ts      — Chat reducer + types (conversations, messages, unread)
│   ├── chatContext.ts    — ChatProvider + useChatContext hook
│   ├── chatActions.ts    — loadConversations, sendMessage, leaveConversation, etc.
│   ├── syncState.ts      — Sync reducer + types (config, log, conflicts, analysis)
│   ├── syncContext.ts    — SyncProvider + useSyncContext hook
│   ├── syncActions.ts    — loadSyncConfig, triggerSync, resolveConflict, etc.
│   ├── contextPanelState.ts — Context panel reducer + types (sections, views, outline, links, tags, properties)
│   ├── contextPanelContext.ts — ContextPanelProvider + useContextPanelContext hook
│   ├── contextPanelActions.ts — loadOutline, loadForwardLinks, loadBacklinks, loadTags, loadProperties, expandTag
│   ├── featureState.ts   — Feature toggle reducer + types (FeatureToggleInfo, optimistic update/rollback)
│   ├── featureContext.ts — FeatureProvider + useFeatureContext hook (isEnabled helper)
│   ├── featureActions.ts — loadFeatures, toggleFeature action creators
│   ├── searchState.ts    — Search reducer + types (query, results, replace, activeResultId)
│   ├── searchContext.ts  — SearchProvider + useSearchContext hook
│   ├── searchActions.ts  — performSearch, performMultiVaultSearch, performReplace, performSingleReplace
│   ├── realtimeState.ts  — Realtime reducer + types (connectionStatus, reconnectAttempts, lastEventId)
│   ├── realtimeContext.ts — RealtimeProvider + useRealtimeContext hook
│   ├── realtimeActions.ts — computeReconnectDelay, RealtimeAction types
│   ├── realtimeChatBridge.ts — Module-level bridge: SSE chat events → ChatProvider (cross-provider communication)
│   ├── realtimeVaultBridge.ts — Module-level bridge: SSE vault:change events → AppProvider (tree refresh + tab reload)
│   ├── useEventSource.ts — Custom hook managing EventSource lifecycle (backoff, visibility, reconnect)
│   ├── recentFilesStore.ts — Recent files list (server-synced + localStorage cache, max 20, dedup by vaultId+path)
│   ├── favoritesStore.ts — Favorites per vault (server-synced + localStorage cache, max 50, path tracking on rename/delete)
│   ├── dailyNoteService.ts — Daily note open/create logic (YYYY-MM-DD.md, template from vault config)
│   ├── keybindingsStore.ts — Configurable keyboard shortcuts (server-synced, defaults + user overrides, matchesShortcut(), formatShortcut())
│   └── vaultStatisticsCache.ts — Client-side vault statistics cache (invalidate on vault:change SSE)
│   ├── settingsState.ts      — Settings reducer + types (categories, sections, nav state)
│   ├── settingsRegistry.ts   — ISettingsRegistry, section definitions
│   ├── settingsPersistence.ts — sessionStorage serialize/validate
│   ├── settingsContext.ts    — SettingsProvider + useSettingsContext hook
│   ├── canvasState.ts        — Canvas reducer + types (document, viewport, selection, undo/redo stacks, dirty)
│   ├── canvasContext.ts      — CanvasProvider + useCanvasContext hook (parse, autosave, save)
├── hooks/
│   ├── useHistoryStack.ts — Undo/Redo history stack hook (max 100, FIFO eviction, clear on file switch)
│   ├── useLineNumbers.ts — Line numbers toggle state (localStorage persistence)
│   ├── useResize.ts      — Mouse-driven panel resize hook (width, min, max, side)
│   └── useDropZone.ts    — File drag-and-drop hook (drag counter, size/count validation, toast errors)
├── components/
│   ├── SlatebaseLogo.tsx — SVG logo component
│   ├── UserMenu.tsx      — User avatar and dropdown menu (navigation, import/export, admin)
│   ├── ErrorBoundary.tsx — React Error Boundary (fallback UI, reset button)
│   ├── ErrorBoundary.css — ErrorBoundary fallback styles
│   ├── SidebarToolbar.tsx — Draggable vertical toolbar (+ Daily Note, Papierkorb buttons)
│   ├── VaultList.tsx     — Vault selector/manager dropdown (legacy, no longer rendered in App.tsx)
│   ├── FileExplorer.tsx  — Unified multi-vault explorer (all vaults as expandable root entries, lazy-loading, DnD, context menu, favorites, statistics tooltip, .trash/.versions filtered)
│   ├── file-explorer/
│   │   ├── index.ts      — Barrel export (TreeNode, shared types)
│   │   ├── types.ts      — DragState, ExternalDropState, ContextMenuState, InlineInputState
│   │   └── TreeNode.tsx  — Recursive tree node renderer (directory/file, drag/drop, inline input, favorites)
│   ├── FavoritesSection.tsx — Collapsible favorites section above file tree (star icon, click-to-open)
│   ├── ContextMenu.tsx   — Generic positioned overlay menu (fixed positioning, keyboard nav, portal)
│   ├── DropZone.tsx      — File drag-and-drop wrapper (visual overlay, validation, upload)
│   ├── LineNumbers.tsx   — Line number gutter (scroll-synced with textarea)
│   ├── TrashView.tsx     — Papierkorb view (list, restore, permanent delete with confirmation)
│   ├── VersionBrowser.tsx — File version browser (version list, inline diff, restore)
│   ├── TemplateSelector.tsx — Two-step modal (template selection → filename input)
│   ├── SearchPanel.tsx   — Vault-wide search + replace panel (replaces FileExplorer when open, debounced search, result navigation)
│   ├── SearchPanel.css   — SearchPanel styles with design tokens
│   ├── TabBar.tsx        — Horizontal tab strip (file tabs)
│   ├── TabContent.tsx    — Tab content orchestrator (Edit/View/Binary, wires upload + image paste + versions)
│   ├── TabContent.css    — TabContent styles (empty/loading/error/content states, design tokens)
│   ├── EditMode.tsx      — Plain-text editor with toolbar + auto-save + undo/redo + line numbers + image paste + DnD + read-only mode + editor command event listener (slatebase:editor-command)
│   ├── ViewMode.tsx      — Markdown renderer (remark + highlight.js + Obsidian plugins)
│   ├── MermaidRenderer.tsx — Mermaid diagram renderer (lazy-loaded, SVG inline, theme-aware, timeout, error fallback)
│   ├── MermaidRenderer.test.tsx — Unit tests for MermaidRenderer
│   ├── BinaryViewer.tsx  — Binary file preview (images, PDF via PdfViewer, unsupported fallback)
│   ├── LoginPage.tsx     — Login with logo + card design
│   ├── ChangePasswordPage.tsx — Forced password change
│   ├── ProfilePage.tsx   — User profile settings (card layout)
│   ├── SessionsPage.tsx  — Session management
│   ├── MyVaultsPage.tsx  — User vault overview with inline sharing + transfer + delete
│   ├── VaultDeletionWorkflow.tsx — Guided vault deletion
│   ├── ChatPage.tsx      — Chat page (two-panel: conversation list + messages)
│   ├── ConversationList.tsx — Conversation list with leave/archive indicators
│   ├── MessageView.tsx   — Message display with pagination
│   ├── MessageInput.tsx  — Message input with validation + rate limit handling
│   ├── NewConversation.tsx — Create conversation dialog with user search
│   ├── ConfirmModal.tsx  — Reusable confirmation modal
│   ├── SyncConfigPage.tsx — Sync configuration (Setup-URI, manual config, mode, interval, E2E)
│   ├── SyncStatusPanel.tsx — Sync status display with trigger buttons
│   ├── SyncAnalysisView.tsx — Analysis results (category counters + detail list)
│   ├── ConflictResolutionView.tsx — Conflict list with resolution options
│   ├── GraphView.tsx     — Knowledge graph SVG visualization (d3-force, zoom/pan/drag/search, config-driven colors/layout, tag/property nodes)
│   ├── graph-utils.ts    — Pure graph utility functions (truncateLabel, clampZoom, computeNodeSize, filterNodes)
│   ├── graph-config.ts   — GraphConfig interfaces + localStorage persistence (colors, layout, node toggles)
│   ├── graph-config.test.ts — Unit tests for GraphConfig
│   ├── GraphSettingsPanel.tsx — Collapsible graph settings (color pickers, sliders, toggles, property multi-select, reset)
│   ├── GraphSettingsPanel.css — GraphSettingsPanel styles
│   ├── GraphSettingsPanel.test.tsx — Unit tests for GraphSettingsPanel
│   ├── canvas/
│   │   ├── CanvasView.tsx        — Main container (viewport zoom/pan, keyboard shortcuts, context menus, DnD, edit-mode orchestration)
│   │   ├── CanvasView.css        — All canvas styles (nodes, edges, editors, file-search dropdown, design tokens)
│   │   ├── TextNodeRenderer.tsx  — Markdown text node (inline edit, rAF-focus, drag/resize)
│   │   ├── FileNodeRenderer.tsx  — File node (image/MD/PDF preview, content vs. path edit, vault-wide file-path search dropdown)
│   │   ├── LinkNodeRenderer.tsx  — External URL node (iframe preview interactive when selected, edit URL)
│   │   ├── GroupNodeRenderer.tsx — Group/container node
│   │   ├── EdgeRenderer.tsx      — Bézier edges with arrowheads, labels, selection
│   │   ├── CanvasContextMenu.tsx — Node/background context menu (edit, edit-file-path for MD files, add nodes, color, delete)
│   │   ├── EdgeContextMenu.tsx   — Edge context menu (label, arrow toggles, delete)
│   │   ├── CanvasToolbar.tsx     — Toolbar (add nodes, zoom, fit, grid, minimap, undo/redo, visual/source mode)
│   │   ├── CanvasMinimap.tsx     — Minimap overview with click-to-navigate
│   │   ├── CanvasSourceView.tsx  — Raw JSON source editor with apply
│   │   ├── ResizeHandles.tsx     — 8-direction resize handles
│   │   ├── NodeAnchors.tsx       — Edge-creation anchor points
│   │   ├── useNodeDrag.ts        — Node drag hook (single + multi-select, stopPropagation)
│   │   ├── useNodeResize.ts      — Node resize hook (min size enforcement)
│   │   ├── useViewportCulling.ts — Viewport culling for off-screen nodes
│   │   ├── canvas-utils.ts       — generateCanvasId, getCanvasColorClass
│   │   └── markdown-render.tsx   — renderSimpleMarkdown for node previews
│   ├── context-panel/
│   │   ├── ContextPanel.tsx      — Main orchestrator (data loading, debounce, view wiring)
│   │   ├── ContextPanel.css      — All context panel styles (Design Tokens)
│   │   ├── ContextPanelTabBar.tsx — Tab bar with Drag & Drop reordering + split detection
│   │   ├── ContextPanelTabBar.css — Tab bar styles
│   │   ├── SplitSectionContainer.tsx — Vertically stacked sections with resize handles
│   │   ├── SplitSectionContainer.css — Split section styles
│   │   ├── OutlineView.tsx       — Document heading hierarchy (navigable)
│   │   ├── LinksView.tsx         — Forward links + backlinks (resolved/unresolved)
│   │   ├── TagsView.tsx          — Vault-wide tags with expand/collapse
│   │   ├── PropertiesView.tsx    — YAML frontmatter as key-value table
│   │   └── utils/
│   │       ├── extractHeadings.ts — Heading extraction from markdown
│   │       ├── parseFrontmatter.ts — YAML frontmatter parsing
│   │       └── persistence.ts    — localStorage layout persistence
│   ├── settings/
│   │   ├── SettingsPanel.tsx     — Unified settings overlay (Container Query, Ctrl+,, Escape/overlay close)
│   │   ├── SettingsPanel.css     — Settings panel styles (responsive layout, embedded table overrides)
│   │   ├── SettingsSidebar.tsx   — Sidebar: search + nav list
│   │   ├── SettingsSearch.tsx    — Debounced search input (150ms)
│   │   ├── SettingsSearch.css    — Search styles
│   │   ├── SettingsNavList.tsx   — Category/section nav (keyboard nav, aria-current, disabled vault sections)
│   │   ├── SettingsNavList.css   — Nav list styles
│   │   ├── SettingsContent.tsx   — Section → Component mapping with focus management
│   │   ├── AccountDeletionSection.tsx — Extracted account deletion form
│   │   ├── FeatureTogglesSection.tsx  — Extracted feature toggle UI
│   │   ├── ServerRestartSection.tsx   — Server restart with confirmation
│   │   ├── VaultConfigSection.tsx     — Per-vault config (templates dir, daily notes dir)
│   │   └── KeybindingsSection.tsx     — Configurable keyboard shortcuts (table, inline recording, conflict detection)
│   ├── AdminUsersPage.tsx — User administration
│   ├── AdminVaultsPage.tsx — Admin: all vaults overview with delete
│   ├── AdminConfigPage.tsx — Server configuration (card-based layout)
│   ├── AdminAuditPage.tsx — Audit log viewer
│   ├── PluginManagementPage.tsx — Plugin list with activation toggle, compatibility, error display
│   ├── PluginUpload.tsx  — Plugin ZIP upload + detected plugins from .obsidian/plugins/
│   ├── VersionCheckCard.tsx — Admin version check (installed vs. latest, GitHub API, update notification)
│   ├── CommandPalette.tsx — Modal command palette (search, execute, keyboard nav, Ctrl+P always active)
│   ├── CommandPaletteContainer.tsx — Built-in commands (navigation, vault ops, editor formatting, view toggles) + plugin commands, Ctrl+P shortcut, CustomEvent bridge to EditMode
│   ├── RealtimeProvider.tsx — SSE event routing (chat, presence, vault:change, toast, server events)
│   └── ToastNotification.tsx — Toast notification system (module-level state, CSS transitions)
├── assets/               — Static images
└── test-setup.ts         — Vitest/Testing Library setup
```

## Architectural Patterns

- **Layered backend**: Config → Logger → Vault (data access) → Business → API (controller)
- **Composition root**: All dependencies wired in `backend/src/index.ts` (manual DI, no container)
- **Interface-driven**: Each layer exposes an `I*` interface (IVaultReader, IVaultService, ILogger, etc.)
- **Custom error classes**: Domain errors (VaultNotFoundError, PathTraversalError, etc.) mapped to HTTP status codes in the controller layer
- **Frontend state**: Single reducer with discriminated union actions, async action creators that call ApiClient then dispatch. Multi-vault trees cached in `vaultTrees: Record<string, DirectoryTree | null>` with lazy-loading on vault expand.
- **Co-located tests**: Test files sit next to their source files (`*.test.ts` / `*.test.tsx`)

## API Routes

All routes prefixed with `/api/v1`. Full reference in README.md.

Route modules in `src/api/`:
- `authRoutes.ts` — login, logout, sessions
- `userRoutes.ts` — profile, password, account deletion
- `adminRoutes.ts` — user management, config, audit, restart
- `vaultShareRoutes.ts` — shares, transfer
- `chatRoutes.ts` — conversations, messages, unread
- `syncRoutes.ts` — sync config, trigger, log, conflicts
- `graphRoutes.ts` — graph, backlinks, tags
- `searchRoutes.ts` — search, multi-vault search, replace
- `mcpRoutes.ts` — MCP Streamable HTTP transport (Bearer auth)
- `mcpTokenRoutes.ts` — token CRUD (session auth)
- `mcpWellKnownRoute.ts` — `.well-known/mcp.json` (public)
- `pluginRoutes.ts` — plugin CRUD, bundle, styles, settings, registry
- `featureRoutes.ts` — feature toggles (admin + public)
- `versionRoutes.ts` — `GET /version` (public)
- `statisticsRoutes.ts` — vault statistics (file/folder count, total size)
- `trashRoutes.ts` — trash CRUD (list, restore, permanent delete)
- `fileVersionRoutes.ts` — file version management (list, get content, restore)
- `templateRoutes.ts` — template listing and creation
- `uploadRoutes.ts` — file upload (multipart, image paste mode)
- `preferencesRoutes.ts` — user preferences (recent files, favorites, keybindings)
- `vaultConfigRoutes.ts` — per-vault config (templates dir, daily notes dir)
- `sseRoutes.ts` — `GET /events` (SSE stream)

## Data Storage

Vaults are stored on disk under `backend/data/vaults/<vaultId>/`. The vault registry (`data/vaults.json`) maps vault IDs to names and storage paths. No database — all persistence is filesystem-based.

### Auth & User Data

```
data/
├── users/
│   ├── _index.json           — Username → userId mapping (fast lookup)
│   └── <userId>.json         — Individual user records (one file per user)
├── sessions/
│   └── <sessionId>.json      — Individual session records (one file per session)
├── shares.json               — Vault share entries (all shares in one file)
└── audit/
    └── YYYY-MM-DD.jsonl      — Append-only audit log (one file per day, JSONL format)
```

- **Users**: One JSON file per user, atomic writes (temp → rename). Index file for username lookups.
- **Sessions**: One JSON file per session. In-memory `Map<token, sessionId>` for fast validation, filesystem as source of truth.
- **Shares**: Single JSON file with all vault share entries. Atomic writes.
- **Audit**: Append-only JSONL files rotated daily. Never overwritten or deleted.

### Chat Data

```
data/chat/
├── conversations/
│   ├── _index.json           — Conversation index (fast lookup)
│   └── <conversationId>.json — Individual conversation records
├── messages/
│   └── <conversationId>/     — Messages per conversation (paginated JSON files)
└── unread/
    └── <userId>.json         — Per-user unread counts per conversation
```

- **Conversations**: One JSON file per conversation. Index file for listing.
- **Messages**: Stored per conversation in paginated chunks.
- **Unread**: Per-user JSON tracking unread counts per conversation.

### Sync Data

```
data/sync/
└── <vaultId>/
    ├── config.json           — Encrypted sync configuration
    ├── checkpoint.json       — Last sync checkpoint (last_seq + local mtimes)
    ├── conflicts.json        — Open conflicts
    └── sync-log.jsonl        — Sync log (append-only JSONL, max 1000 entries)
```

- **Config**: One JSON file per vault with encrypted credentials. Atomic writes.
- **Checkpoint**: CouchDB sequence number + local file mtimes. Atomic writes.
- **Conflicts**: Open conflict entries per vault. Atomic writes.
- **Sync Log**: Append-only JSONL with rotation at 1000 entries.

### MCP Data

```
data/mcp/
└── tokens/
    ├── <tokenId>.json        — Individual API token records (hash, userId, name, expiry, status)
    └── _by-user/
        └── <userId>.json     — Per-user token ID index (fast listing)
```

- **Tokens**: One JSON file per API token. SHA-256 hash stored (never raw token). Atomic writes.
- **User Index**: Per-user JSON listing their token IDs. Atomic writes.
- **In-Memory Index**: `Map<tokenHash, tokenId>` loaded at startup for O(1) token validation.

### Plugin Data

```
data/plugins/
└── <vaultId>/
    ├── _registry.json        — Plugin registry (status, permissions, compatibility per plugin)
    └── <pluginId>/
        ├── manifest.json     — Plugin manifest (original from ZIP)
        ├── main.js           — Plugin bundle (JavaScript, max 5 MB)
        ├── styles.css        — Plugin styles (optional, max 512 KB)
        └── data.json         — Plugin settings (max 1 MB, preserved across upgrades)
```

- **Registry**: One JSON file per vault with all plugin states. Atomic writes.
- **Plugin Files**: Per-vault, per-plugin directory. Atomic writes (temp → rename).
- **Settings**: Preserved across version upgrades (savePlugin only touches manifest/bundle/styles).
- **Vault Deletion Hook**: `deleteAllForVault(vaultId)` removes entire `data/plugins/<vaultId>/` directory.

### Vault Internal Data (per vault directory)

```
data/vaults/<vaultId>/
├── .trash/
│   ├── _index.json           — Trash index (entries with id, originalPath, deletedAt, isDirectory)
│   └── <entryId>/            — Moved file/folder per trash entry
│       └── <originalName>    — The actual file/folder content
├── .versions/
│   └── <relativePath>/       — Version directory per file (mirrors file path structure)
│       ├── 20240120T143000123.md  — Version snapshot (YYYYMMDDTHHmmssSSS UTC timestamp)
│       └── ...
└── _templates/               — Template directory (configurable, default: _templates/)
    ├── daily.md              — Daily note template (optional)
    └── meeting.md            — Other templates (any .md, not _-prefixed)
```

- **Trash**: Soft-deleted files moved to `.trash/<id>/`. Atomic index updates (temp → rename). Configurable retention (0–365 days, default 30).
- **Versions**: Previous file content saved before each write. Configurable max per file (0–100, default 20). Timestamp format: `YYYYMMDDTHHmmssSSS` (UTC).
- **Templates**: `.md` files (not `_`-prefixed) used for "New from template" feature. Placeholder replacement: `{{date}}`, `{{time}}`, `{{title}}`.
- **Cleanup Job**: Periodic (default 24h interval). Purges expired trash + prunes excess versions. Per-file error isolation.
