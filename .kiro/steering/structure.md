# Slatebase — Project Structure

## Top-Level Layout

```
backend/          — Node.js REST API server
frontend/         — React SPA (Vite)
.kiro/specs/      — Feature specifications and design docs
.kiro/steering/   — Steering rules for AI assistants
```

Test/coverage config lives per package: `backend/vitest.config.ts` and the `test` block in
`frontend/vite.config.ts`. Both pin `include: ['src/**/*.{ts,tsx}']` explicitly rather than
relying on `exclude` alone — v8's "all files" scan would otherwise sweep in non-app files
(backend: gitignored `data/` runtime state incl. installed plugin bundles; frontend:
`scripts/`), making local and CI numbers diverge. Both also exclude `dist/**` from test
discovery: Vitest 4 dropped that default, so a local build leaves compiled copies of every
test behind for the next run to collect. Thresholds are a regression baseline measured on
2026-08-07, not an aspirational target — ratchet up as coverage improves. Backend's
branch/function figures look low next to statements/lines because coverage-v8 v4 made
AST-aware remapping the default; that is the accurate number, not a regression.

## Backend (`backend/`)

```
src/
├── index.ts              — Composition root (DI wiring, server startup)
├── version.ts            — getVersion() utility (env → version.json → 'development' fallback)
├── config/index.ts       — Zod-validated config (file + env overlay)
├── logger/index.ts       — Pino logger with ILogger interface
├── logger/log-store.ts  — In-memory log ring buffer for admin log viewing
├── shared/                   — Cross-cutting utilities with no domain of their own; used by most other modules
│   ├── fs-utils.ts           — isNodeError() type guard for Node.js filesystem errors
│   ├── semver.ts             — compareSemver() (re-exported via plugin/index.ts)
│   ├── async-mutex.ts        — AsyncMutex (serializes one path's read-modify-write cycle), KeyedMutex (one AsyncMutex per string key, cached for the store/service's lifetime)
│   ├── json-file-store.ts    — writeJsonFileAtomic() (temp→rename, Windows EPERM/EACCES retry) + readJsonFile(); JsonFileStore<T> (single fixed path) and KeyedJsonFileStore<T> (one path per key, e.g. per user/vault/token) wrap these with an AsyncMutex/KeyedMutex around read-modify-write. Standard pattern for new per-file or per-key JSON persistence — used by feature-toggle-store, preferences-store, vault-config-store, token-store, unread-store.
│   └── sliding-window-rate-limiter.ts — SlidingWindowRateLimiter (generic sliding-window request limiter keyed by string; same algorithm as ChatRateLimiter/McpRateLimiter, generalized for new call sites instead of re-implementing it)
├── vault/
│   ├── index.ts          — VaultReader, VaultManager, path utilities, data models
│   └── registry.ts       — VaultRegistry (persistent vault metadata in vaults.json)
├── business/
│   ├── index.ts          — VaultService (business logic, orchestrates vault operations)
│   ├── validation.ts     — Vault name validation rules
│   └── unique-filename.ts — Unique filename generation (conflict-free renaming)
├── auth/
│   ├── index.ts          — AuthService, SessionStore, interfaces, error classes
│   ├── middleware.ts     — authMiddleware, csrfMiddleware, rateLimitMiddleware
│   ├── ratelimit.ts     — In-memory rate limiter for login attempts (composite key username:ip)
│   ├── validation.ts    — Zod schemas for login request validation (loginRequestSchema)
│   ├── csrf-secret.ts   — CsrfSecretManager (persistent CSRF secret: env → file → generate)
│   └── sse-ticket-store.ts — SseTicketStore (short-lived one-time tickets for SSE connections)
├── user/
│   ├── index.ts          — UserService, UserRepository, RoleService, interfaces
│   └── validation.ts     — Profile/password validation (Zod schemas)
├── audit/
│   └── index.ts          — AuditService, AuditLogger, interfaces
├── api/
│   ├── index.ts          — VaultController, route modules, error mapping
│   ├── access-check.ts  — Shared vault-access-check helper (session + vault existence + read access in one call)
│   ├── authRoutes.ts     — AuthController + login/logout/session routes
│   ├── userRoutes.ts     — UserController + profile/password routes
│   ├── adminRoutes.ts    — AdminController + user management/config routes
│   ├── chatRoutes.ts     — ChatController + conversation/message routes
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
│   ├── welcomeVaultRoutes.ts — POST /api/v1/welcome-vault (on-demand tutorial vault creation, rate-limited)
│   ├── welcomeVaultRoutes.test.ts — Integration tests for welcome vault route
│   ├── proxyRoutes.ts    — POST /api/v1/proxy (CORS-free HTTP proxy for plugin requestUrl, SSRF protection, URL allowlist)
│   ├── pluginStoreRoutes.ts — Community plugin store routes (browse, install, update; per-vault and global mounts)
│   └── sseRoutes.ts      — GET /events (SSE stream)
├── chat/
│   ├── types.ts          — Chat data models (Conversation, Message, etc.)
│   ├── errors.ts         — Chat-specific error classes
│   ├── validation.ts     — Zod schemas for chat input validation
│   ├── index.ts          — ChatService (business logic)
│   ├── conversation-store.ts — ConversationStore (filesystem persistence)
│   ├── message-store.ts  — MessageStore (filesystem persistence)
│   ├── unread-store.ts   — UnreadStore (per-user unread counts; persisted via shared `KeyedJsonFileStore`, keyed by userId)
│   ├── rate-limiter.ts   — ChatRateLimiter (in-memory)
│   └── chat-service.ts   — ChatService orchestration
├── mcp/
│   ├── index.ts          — Barrel export for MCP module
│   ├── types.ts          — MCP data models (TokenRecord, ApiTokenInfo, McpTokenContext, etc.)
│   ├── config.ts         — McpConfig interface + loadMcpConfig() from env/config
│   ├── errors.ts         — MCP-specific error classes (McpAuthenticationError, TokenLimitError, etc.)
│   ├── error-codes.ts    — Shared JSON-RPC-style error codes (ACCESS_DENIED, NOT_FOUND, BINARY_FILE, etc.)
│   ├── validation.ts     — Zod schemas for token creation + tool parameters
│   ├── token-store.ts    — TokenStore (filesystem persistence, in-memory hash index; per-token records and the per-user token-ID index are each a `KeyedJsonFileStore`, so the user-index update can't race and drop a tokenId — which would make it un-revocable via "revoke all")
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
│   ├── property-extractor.ts — extractProperties() (YAML frontmatter, regex-based, CRLF-normalized)
│   ├── property-extractor.test.ts — Unit tests for property extractor
│   ├── canvas-parser.ts      — Canvas link extraction (extracts wikilinks from .canvas JSON files)
│   ├── canvas-parser.test.ts — Unit tests for canvas link extraction
│   ├── link-index-service.ts — LinkIndexService (rebuild, incremental updates, JSON v2 persistence, tags, properties, getGraph with options, getGraphMeta), extractFrontmatterTags (Obsidian-compatible frontmatter tag extraction)
│   └── link-index-service.test.ts — Unit tests for LinkIndexService v2
├── plugin/                   — Installed-plugin management (per vault). Not to be confused with `plugin-store/` (the marketplace).
│   ├── index.ts              — Barrel export for plugin module
│   ├── types.ts              — IInstalledPluginStore, PluginManifest, PluginFiles, PluginRegistryData interfaces
│   ├── errors.ts             — PluginNotFoundError, PluginFileTooLargeError, PluginSettingsTooLargeError
│   ├── validation.ts         — Zod schemas (pluginManifestSchema, pluginRegistrySchema)
│   ├── installed-plugin-store.ts — InstalledPluginStore (filesystem persistence, atomic writes, per-vault per-plugin dirs)
│   ├── installed-plugin-store.test.ts — Unit tests for InstalledPluginStore
│   ├── plugin-installer.ts   — PluginInstaller (ZIP extraction, manifest validation, bundle integrity, version comparison)
│   ├── plugin-installer.test.ts — Unit tests for PluginInstaller
│   └── plugin-service.ts     — PluginService (routes→service→store layer wrapping InstalledPluginStore + PluginInstaller; also hosts the `.obsidian/plugins/` detected-plugin scanner)
├── plugin-store/             — Community plugin marketplace (browse/install/update from GitHub releases). Distinct from `plugin/` (installed plugins).
│   ├── index.ts              — Barrel export for plugin-store module
│   ├── types.ts              — IPluginStoreConfig, CommunityPluginEntry, RemotePluginManifest, UpdateCheckResult, etc.
│   ├── errors.ts             — GitHubRateLimitError, GitHubFetchError, AssetTooLargeError, DesktopOnlyPluginError, PluginNotInStoreError, UpstreamError
│   ├── validation.ts         — Zod schemas (communityPluginEntrySchema, storeInstallSchema)
│   ├── github-client.ts      — GitHubClient (fetches community plugin list/releases + `community-plugin-stats.json` (Obsidian's pre-aggregated downloads/last-updated feed — one CDN request instead of one rate-limited API call per plugin); domain allowlist re-validated on every redirect hop, size limits)
│   ├── plugin-store-cache.ts — PluginStoreCache (in-memory TTL cache for plugin list/manifests/update results)
│   ├── plugin-store-service.ts — PluginStoreService (browse/install/update orchestration; installs via the shared `plugin/` InstalledPluginStore)
│   └── update-checker.ts     — UpdateChecker (periodic update check, default 24h interval, persists last-check timestamp)
├── feature-toggle/
│   ├── index.ts              — Barrel export for feature-toggle module
│   ├── types.ts              — IFeatureToggleService, IFeatureRegistry, FeatureToggleDefinition, FeatureToggleState, etc.
│   ├── errors.ts             — FeatureNotFoundError, FeatureAlreadyRegisteredError, InvalidFeatureNameError
│   ├── feature-registry.ts   — FeatureRegistry (declarative registration with validation)
│   ├── feature-toggle-service.ts — FeatureToggleService (in-memory state, env-var overlay, onChange listeners)
│   ├── feature-toggle-store.ts — FeatureToggleStore (persists runtime overrides to `features.json` via shared `JsonFileStore`)
│   └── middleware.ts         — createFeatureGuard() factory (Hono middleware, 403 on disabled features)
├── realtime/
│   ├── index.ts              — Barrel export for realtime module
│   ├── types.ts              — SseEvent, SseEventType, ConnectionEntry, EventTarget, PublishOptions, ReplayBufferEntry
│   ├── errors.ts             — ConnectionLimitError
│   ├── connection-manager.ts — ConnectionManager (per-user connections, broadcast, drain, limits)
│   ├── event-bus.ts          — EventBus (publish with targeting, rate limiting, replay buffer)
│   ├── event-replay-buffer.ts — EventReplayBuffer (per-user circular buffer with TTL eviction)
│   ├── rate-limiter.ts       — Per-user per-event-type sliding window rate limiter for SSE events
│   └── presence-service.ts   — PresenceService (online/offline tracking, heartbeat, visibility)
├── trash/
│   ├── index.ts              — Barrel export for trash module
│   ├── types.ts              — ITrashService, TrashEntry, TrashIndex interfaces
│   ├── errors.ts             — TrashNotFoundError, TrashRestoreError
│   └── trash-service.ts      — TrashService (soft-delete, restore, purgeExpired, atomic index; each op runs inside a per-vault `KeyedMutex` lock — keeps the periodic cleanup job's `purgeExpired` from interleaving with a concurrent restore/delete on the same vault)
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
│   └── preferences-store.ts  — PreferencesStore (per-user JSON file via shared `KeyedJsonFileStore`; recent-files/favorites/keybindings updates go through `mutate()` so concurrent saves can't lose each other's field)
├── vault-config/
│   ├── index.ts              — Barrel export for vault-config module
│   ├── types.ts              — IVaultConfigService, VaultConfig (templatesDirectory, dailyNotesDirectory)
│   ├── validation.ts         — Zod schema (updateVaultConfigSchema)
│   └── vault-config-store.ts — VaultConfigStore (per-vault .slatebase/config.json via shared `KeyedJsonFileStore`; `saveConfig` merges through `mutate()` to avoid losing concurrent partial updates)
├── welcome-vault/
│   ├── index.ts              — IWelcomeVaultService, WelcomeVaultService (never-throw, language-aware template copy)
│   └── types.ts              — WelcomeVaultConfig, WelcomeVaultLanguage, OnUserCreatedFn
├── upload/
│   └── errors.ts             — Upload-specific error classes (FileTooLargeError, etc.)
├── import/index.ts       — ImportService (file/folder import logic)
└── integration.test.ts   — Integration tests
config/
└── default.json          — Default server configuration
assets/
└── templates/
    ├── welcome-vault/          — German welcome vault v2 (35+ guides: Grundlagen, Features, Fortgeschritten, Praxis, Vorlagen, Screenshots)
    └── welcome-vault-en/       — English welcome vault v2 (35+ guides: Basics, Features, Advanced, Practice, Templates, Screenshots)
data/
├── vaults.json           — Persistent vault registry
└── vaults/<id>/          — Vault storage directories (one per vault)
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
│   ├── fileValidation.ts — Filename validation for InlineInput (new file/rename): invalid chars, length
│   ├── pathUtils.ts      — Relative path computation, image/PDF detection, drop target + context-menu viewport clamping
│   ├── fileIcons.tsx     — File extension to icon mapping (@react-symbols/icons for known types, Lucide fallback)
├── canvas/
│   ├── index.ts          — Barrel export (parser, serializer, types)
│   ├── types.ts          — CanvasDocument, CanvasNode (Text/File/Link/Group), CanvasEdge, parse result types
│   ├── parser.ts         — parseCanvas (Zod validation, passthrough unknown fields for forward-compat)
│   ├── serializer.ts     — serializeCanvas (Model→JSON, round-trip compatible)
│   └── parser.test.ts    — Unit tests for parser/serializer round-trip
├── editor/
│   ├── types.ts              — Editor mode types, LivePreviewConfig, EditorMode ('source' | 'live-preview')
│   ├── theme.ts              — CodeMirror theme (Design Tokens mapping, Dark/Light mode)
│   ├── state-store.ts        — Per-tab EditorState persistence (Module-Level Map, cursor/scroll/history)
│   ├── formatting.ts         — Formatting commands (bold, italic, heading, list, link, etc.) — driven by the Command Palette, no longer by a native toolbar
│   ├── plugin-extensions.ts  — Plugin extension registry (per-plugin Compartment, add/remove/isolate, selection-dispatch after refresh) + active-editor-container tracking (get/setActiveEditorContainerEl, setEditorContainerMountedListener) so MarkdownView.containerEl points at real, attached DOM
│   ├── editor-state-fields.ts — Obsidian-compatible StateFields (editorInfoField, editorLivePreviewField, editorEditorField)
│   ├── token-class-node-prop.ts — Singleton NodeProp + Mapping (tokenClassNodeProp polyfill for Obsidian compat)
│   ├── CodeMirrorEditor.tsx  — React wrapper (EditorView in useRef, props→effects sync, mode toggle); marks the wrapper's parent `.markdown-source-view` and publishes its grandparent as containerEl for plugin toolbars
│   └── live-preview/
│       ├── index.ts               — Barrel export for live-preview decorations + extension factory
│       ├── inline-decorations.ts  — Cursor-aware inline formatting decorations (bold, italic, strikethrough, inline code), HideableRange model
│       ├── link-decorations.ts    — Wikilink + standard-link decorations, click-to-navigate
│       ├── widget-decorations.ts  — Block widgets (callouts with fold/unfold, GFM checkboxes, code-block-processor integration)
│       ├── live-preview.css       — CSS styles for live-preview decorations (readable line length, editor wrapper)
│       └── live-preview-extension.ts — Composes decorations into the CM6 extension (StateField, Compartment, click handler)
├── plugins/
│   ├── index.ts          — Barrel export (all plugins, types, utilities)
│   ├── types.ts          — MDAST node types (WikilinkNode, EmbedNode, CalloutNode, TagNode), IMAGE_EXTENSIONS, PDF_EXTENSIONS
│   ├── link-resolver.ts  — Wikilink target resolution against DirectoryTree
│   ├── heading-anchor.ts — Heading anchor generation + deduplication tracker
│   ├── preserve-table-code-escapes.ts — Counters mdast-util-gfm-table's pipe-unescaping inside inline code spans (Obsidian verbatim rendering)
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
│   ├── tag/
│   │   ├── syntax.ts     — micromark tokenizer extension for #tag syntax
│   │   ├── mdast-util.ts — fromMarkdown + toMarkdown handlers
│   │   └── plugin.ts     — remark plugin wrapper (remarkTag)
│   ├── block-ref/
│   │   ├── marker-parser.ts    — MDAST transformer for block reference markers (^block-id)
│   │   ├── marker-serializer.ts — toMarkdown extension for block refs
│   │   └── plugin.ts           — remark plugin wrapper (remarkBlockRef)
│   ├── breaks/
│   │   └── plugin.ts     — remark plugin (remarkBreaks) converting soft line breaks to hard breaks (Obsidian default)
│   └── compat/           — Obsidian Plugin Compatibility Layer
│       ├── types.ts      — TFile, TFolder, TAbstractFile, CachedMetadata, PluginManifest, PluginRegistryEntry, etc.
│       ├── errors.ts     — PluginError, ManifestValidationError, BundleEvaluationError, LifecycleError, etc.
│       ├── event-system.ts — IEventEmitter (on/off/trigger/offref/removeAllListeners)
│       ├── manifest-parser.ts — Manifest parsing with Zod validation + semver comparison
│       ├── install-globals.ts — Installs the `window.obsidian` namespace + DOM/window globals plugin bundles expect; explicit idempotent entry point (registration order: DOM patches → real API → obsidian-api-extensions → fallback-shims)
│       ├── global-extensions.ts — Obsidian-compatible prototype patches (Array.remove/first/last, String.contains, Element.find/findAll, Math.clamp, etc.) — imported synchronously before any plugin bundle evaluates
│       ├── fallback-shims.ts — Last-resort no-op/minimal implementations for anything install-globals + obsidian-api-extensions leave unclaimed; registered last so real shims always win
│       ├── plugin-loader.ts — PluginLoader (bundle evaluation, lifecycle, timeout, cleanup, @lezer/* stubs)
│       ├── plugin-registry.ts — PluginRegistry (frontend state, backend persistence)
│       ├── sandbox.ts    — PluginSandbox (vault isolation, storage namespace, network allowlist, blocking detection)
│       ├── settings-manager.ts — SettingsManager (loadData/saveData per plugin per vault)
│       ├── setting-tab.ts — PluginSettingTab, Setting, UI components, DOM extensions, icon registry, Modal, Plugin class (synchronous global registration)
│       ├── setting-tab-registry.ts — Tracks which plugins registered a PluginSettingTab (via addSettingTab), so the Plugin Management UI can mount tab.containerEl
│       ├── declarative-settings-renderer.ts — Renders Obsidian 1.13+ `getSettingDefinitions()` declarative settings arrays (group/list/page/controls) into Setting/*Component UI
│       ├── obsidian-api-extensions.ts — Extended APIs: Events, Scope, Keymap, utility functions, MarkdownPreviewRenderer, DOM globals (async loaded as supplement)
│       ├── editor-shim.ts — EditorShim (Obsidian Editor API; backend priority CM6 EditorView → textarea → internal buffer; setEditorViewAccessor wired once at vault init)
│       ├── markdown-renderer.ts — MarkdownRenderer.render()/renderMarkdown() — lightweight markdown-to-HTML (not the full remark/unified pipeline) for plugin custom views (Kanban, Dataview)
│       ├── markdown-sections.ts — Maps rendered code blocks back to their source line range (getSectionInfo) by re-scanning the source for fenced blocks in document order
│       ├── block-cache.ts — Parses `^block-id` markers out of Markdown so `[[note#^id]]` links and CachedMetadata.blocks resolve
│       ├── suggest-modal.ts — SuggestModal, FuzzySuggestModal (search/filter modals)
│       ├── ribbon-icon-registry.ts — Module-level ribbon icon registry (addRibbonIcon store + change listeners)
│       ├── status-bar-registry.ts — Module-level registry for addStatusBarItem() entries; notifies the StatusBar component on change
│       ├── command-registry.ts — CommandRegistry (addCommand → returns the Command like Obsidian does, getCommand, removeAll, search, hotkeys, editorCallback/editorCheckCallback; executes callbacks inside withPluginContext)
│       ├── plugin-execution-context.ts — Tracks which plugin's code is currently executing (withPluginContext/getCurrentPluginId) so createEl() can tag elements with data-plugin-id; scopeForPlugin() binds the id into a closure for call sites that must survive `await`
│       ├── lucide-icons.ts — Resolves Obsidian's built-in icon names (Lucide IDs + `-glyph` aliases) to SVG via lucide-react's per-icon dynamic-import map — real Obsidian ships the whole set, our addIcon() registry alone left plugin buttons blank
│       ├── code-block-processor-registry.ts — CodeBlockProcessorRegistry (registerCodeBlockProcessor, processCodeBlocks, runPostProcessors, MarkdownRenderChild lifecycle)
│       ├── css-injector.ts — CSS injection with scoped selectors (data-plugin-id); each rule emits both a descendant form (`[scope] sel`) and a self form (`sel[scope]`) so plugin UI inserted into shared workspace DOM — which has no scoped ancestor — still matches
│       ├── compatibility-analyzer.ts — Multi-layer browser compatibility analysis (isDesktopOnly gate, Node.js module detection, Obsidian API pattern matching, SUPPORTED_METHODS set)
│       ├── platform-detection.ts — Runtime device/Platform flags (Obsidian's are Electron build constants; Slatebase derives isMobile/isDesktop etc. at runtime since one build serves both)
│       ├── api-gap-registry.ts — Records which no-op Proxy-trapped API a plugin read vs. actually called, so silently-unimplemented API usage is diagnosable instead of invisible
│       ├── no-op-warning.ts — One-warning-per-session console.warn for no-op compat APIs (avoids flooding the console from render-path calls)
│       ├── plugin-context.ts — PluginProvider + usePluginContext hook (vault-scoped instances, FCP loading, activeViews/sidebarViews state)
│       ├── plugin-event-bridge.ts — usePluginEventBridge hook (tab→workspace, save→cache, tree→resolved, leaf events)
│       ├── hover-link-bus.ts — Routes hover-preview requests (Slatebase's own links + plugins' `workspace.trigger('hover-link', …)`) to the HoverPreview popover
│       ├── file-view-registry.ts — FileViewRegistry (content-based + extension-based view routing, registerExtensionsForPlugin, active file view lifecycle for TextFileView-based plugins like Kanban)
│       ├── view-registry.ts — ViewRegistry (plugin-ownership tracking, location-aware leaf creation, sidebar callbacks)
│       ├── obsidian-compat.css — Obsidian-compatible CSS Custom Properties (~590 vars mapped to Slatebase tokens, Dark Mode: fonts/weights, sizing scale, code + tag tokens, accent HSL components, input shadows) + `position: relative` on `.markdown-source-view`/`.view-content` so plugin UI anchored to the editor pane sizes against the pane, as it does in real Obsidian
│       ├── tab-view-bridge.ts — TabViewBridge (module-level bridge: ViewRegistry → TabProvider for plugin view tabs)
│       ├── tab-view-bridge-wiring.test.ts — Integration tests for TabViewBridge wiring
│       └── shims/
│           ├── app-shim.ts — AppShim (Proxy-based, vault/workspace/metadataCache/fileManager/plugins/isMobile/appId/secretStorage/loadLocalStorage/saveLocalStorage); `commands` + `hotkeyManager` are backed by the shared CommandRegistry (findCommand/listCommands/executeCommandById, defaultKeys/addDefaultHotkeys), `workspace` is wrapped with scopeForPlugin so its callbacks stay plugin-tagged
│           ├── vault-shim.ts — VaultShim (read/modify/create/delete/copy/getFileByPath/readBinary/modifyBinary/process/append/exists/configDir/events)
│           ├── vault-adapter-shim.ts — VaultAdapterShim (Obsidian-compatible DataAdapter API: exists, read, write, list, stat, mkdir, remove, rename)
│           ├── workspace-shim.ts — WorkspaceShim (full Leaf API + getActiveViewOfType synthetic view for the MarkdownView/FileView/ItemView family, onLayoutReady error-isolation); active leaf falls back to an "empty"-type view instead of null, and layout/leaf events re-fire once the CM6 editor mounts
│           ├── metadata-cache-shim.ts — MetadataCacheShim (getFileCache, resolvedLinks, changed/resolved events, getTags, fileToLinktext, blockCache, getCachedFiles)
│           ├── file-manager-shim.ts — FileManagerShim (renameFile, processFrontMatter, generateMarkdownLink, getNewFileParent, trashFile, promptForFileRename, getAvailablePathForAttachment)
│           ├── markdown-view-shim.ts — MarkdownView stub (editor property, getActiveViewOfType support, registered on window.obsidian); containerEl resolves to the live editor container (detached div only when no editor is mounted)
│           ├── markdown-renderer-shim.ts — MarkdownRenderer.render() (unified/remark MDAST→HTML pipeline, registered on window.obsidian)
│           └── suggest-modal-shim.ts — Modal, SuggestModal, FuzzySuggestModal (DOM-based overlays, fuzzy search, keyboard nav)
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
│   ├── workspaceStore.ts — Workspace UI state persistence (tabs, expanded folders, panel sizes/visibility, debounced localStorage, per-vault tab memory)
│   └── vaultStatisticsCache.ts — Client-side vault statistics cache (invalidate on vault:change SSE)
│   ├── settingsState.ts      — Settings reducer + types (categories, sections, nav state)
│   ├── settingsRegistry.ts   — ISettingsRegistry, section definitions
│   ├── settingsPersistence.ts — sessionStorage serialize/validate
│   ├── settingsContext.ts    — SettingsProvider + useSettingsContext hook
│   ├── canvasState.ts        — Canvas reducer + types (document, viewport, selection, undo/redo stacks, dirty)
│   ├── canvasContext.ts      — CanvasProvider + useCanvasContext hook (parse, autosave, save)
│   ├── sidebarPanelState.ts  — Sidebar panel reducer + types (left sidebar sections, views)
│   ├── sidebarPanelContext.ts — SidebarPanelProvider + useSidebarPanelContext hook
│   ├── realtimePresenceBridge.ts — Module-level bridge: SSE presence events → PresenceState
├── hooks/
│   ├── useLineNumbers.ts — Line numbers toggle state (localStorage persistence)
│   ├── useResize.ts      — Mouse-driven panel resize hook (width, min, max, side)
│   ├── useDropZone.ts    — File drag-and-drop hook (drag counter, size/count validation, toast errors)
│   ├── useStatusBar.ts   — Status bar visibility toggle (module-level store, useSyncExternalStore, localStorage)
│   ├── useVersionInfo.ts — Server version info hook (installed vs. latest, GitHub API check)
│   ├── useGlobalShortcuts.ts — App-wide keyboard shortcuts (vault search, mode toggle, settings panel, daily note); extracted from AppContent
│   ├── useWorkspaceRestore.ts — Session-persistence lifecycle: restores vault/tabs/layout from workspaceStore on mount, persists changes back; extracted from AppContent
│   └── usePaginatedResource.ts — Shared list-loading state machine (page/loading/error, loadPage/reload) for admin list pages
├── components/
│   ├── SlatebaseLogo.tsx — SVG logo component
│   ├── StatusBar.tsx     — Bottom status bar (clock, extensible plugin items, togglable in settings)
│   ├── StatusBar.css     — Status bar styles (Design Tokens)
│   ├── UserMenu.tsx      — User avatar and dropdown menu (navigation, import/export, admin)
│   ├── ErrorBoundary.tsx — React Error Boundary (fallback UI, reset button)
│   ├── ErrorBoundary.css — ErrorBoundary fallback styles
│   ├── SidebarToolbar.tsx — Draggable vertical toolbar (+ Daily Note, Papierkorb buttons)
│   ├── VaultList.tsx     — Vault selector/manager dropdown (legacy, no longer rendered in App.tsx)
│   ├── FileExplorer.tsx  — Unified multi-vault explorer (all vaults as expandable root entries, lazy-loading, DnD, context menu, favorites, statistics tooltip)
│   ├── file-explorer/
│   │   ├── index.ts      — Barrel export (TreeNode, shared types)
│   │   ├── types.ts      — DragState, ExternalDropState, ContextMenuState, InlineInputState
│   │   └── TreeNode.tsx  — Recursive tree node renderer (directory/file, drag/drop, inline input, favorites)
│   ├── ContextMenu.tsx   — Generic positioned overlay menu (fixed positioning, keyboard nav, portal)
│   ├── ContextMenu.css   — ContextMenu styles
│   ├── DropZone.tsx      — File drag-and-drop wrapper (visual overlay, validation, upload)
│   ├── DropZone.css      — DropZone styles
│   ├── TrashView.tsx     — Papierkorb view (list, restore, permanent delete with confirmation)
│   ├── TrashView.css     — TrashView styles
│   ├── VersionBrowser.tsx — File version browser (version list, inline diff, restore)
│   ├── VersionBrowser.css — VersionBrowser styles
│   ├── TemplateSelector.tsx — Two-step modal (template selection → filename input)
│   ├── TemplateSelector.css — TemplateSelector styles
│   ├── SearchPanel.tsx   — Vault-wide search + replace panel (replaces FileExplorer when open, debounced search, result navigation)
│   ├── SearchPanel.css   — SearchPanel styles with design tokens
│   ├── TabBar.tsx        — Unified horizontal tab strip: settings-page tabs (not draggable) + file tabs (draggable/reorderable) in one row
│   ├── TabContent.tsx    — Tab content orchestrator (Edit/View/Binary, wires upload + image paste + versions)
│   ├── TabContent.css    — TabContent styles (empty/loading/error/content states, design tokens)
│   ├── EditMode.tsx      — CodeMirror editor host: auto-save + undo/redo + line numbers + image paste + DnD + read-only banner + editor command event listener (slatebase:editor-command). No native formatting toolbar — formatting runs through the Command Palette or an Obsidian-compatible plugin toolbar (Editing Toolbar); `livePreviewMode` is a required prop driven by the tab mode
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
│   ├── HoverPreview.tsx  — Hover preview popover for internal links (hover-link bus, plugin compat)
│   ├── HoverPreview.css  — HoverPreview styles
│   ├── hover-preview-position.ts — Pure geometry positioning logic for hover preview popover
│   ├── VaultSharing.tsx  — Vault sharing component (share list, add/revoke permissions)
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
│   │   ├── FeatureTogglesSection.tsx  — Feature toggle UI; single consumer of state/featureActions.ts + the global FeatureContext (also embedded by AdminConfigPage, which no longer duplicates the load/toggle logic itself)
│   │   ├── ServerRestartSection.tsx   — Server restart with confirmation
│   │   ├── VaultConfigSection.tsx     — Per-vault config (templates dir, daily notes dir)
│   │   ├── KeybindingsSection.tsx     — Configurable keyboard shortcuts (table, inline recording, conflict detection)
│   │   ├── AppearanceSection.tsx      — Display preferences (status bar toggle)
│   │   └── WelcomeVaultSection.tsx    — On-demand tutorial vault creation (button, loading state, toast)
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
│   ├── ToastNotification.tsx — Toast notification system (module-level state, CSS transitions)
│   ├── ToastNotification.css — Toast notification styles
│   ├── ConnectionIndicator.tsx — SSE connection status indicator (connected/connecting/disconnected)
│   ├── PluginViewPanel.tsx — Plugin view rendering (imperative DOM mount for plugin ItemViews)
│   ├── PluginRibbonIcon.tsx — Plugin ribbon icon buttons (left toolbar)
│   ├── McpTokensPage.tsx — MCP API token management UI (create, revoke, list)
│   ├── AdminLogsPage.tsx — Admin server log viewer (ring buffer)
│   ├── FileViewer.tsx    — File content viewer (legacy, redirects to TabContent)
│   ├── InlineInput.tsx   — Inline text input with confirm/cancel (used in file rename)
│   ├── plugin-store/
│   │   ├── index.ts              — Barrel export for plugin-store UI module
│   │   ├── types.ts              — Plugin store frontend types (CommunityPlugin, StoreState, etc.)
│   │   ├── PluginStoreBrowser.tsx — Main store browser (list, filters, install)
│   │   ├── PluginStoreBrowser.css — Plugin store browser styles
│   │   ├── PluginStoreCard.tsx   — Individual plugin card (name, description, downloads, install button)
│   │   ├── PluginStoreSearch.tsx — Search within plugin store (debounced, filter toggles)
│   │   ├── PluginStoreSearch.css — Plugin store search styles
│   │   ├── PluginDetailPanel.tsx — Plugin detail view (README, settings, compatibility info)
│   │   └── UpdateBanner.tsx      — Update notification banner (available updates count)
│   └── sidebar-panel/
│       ├── index.ts              — Barrel export for sidebar-panel module
│       ├── SidebarPanel.tsx      — Left sidebar panel (tabbed: recent files, favorites)
│       ├── SidebarPanel.css      — Sidebar panel styles
│       ├── SidebarPanelTabBar.tsx — Tab bar for sidebar sections
│       ├── SidebarPanelTabBar.css — Tab bar styles
│       ├── SidebarSplitContainer.tsx — Split sections with resize
│       ├── SidebarSplitContainer.css — Split container styles
│       ├── RecentFilesView.tsx   — Recent files list view
│       ├── RecentFilesView.css   — Recent files styles
│       ├── FavoritesView.tsx     — Favorites list view
│       ├── FavoritesView.css     — Favorites styles
│       └── utils/
│           └── persistence.ts    — localStorage layout persistence
├── assets/               — Static images
└── test-setup.ts         — Vitest/Testing Library setup
```

## Architectural Patterns

- **Layered backend**: Config → Logger → Vault (data access) → Business → API (controller)
- **Composition root**: All dependencies wired in `backend/src/index.ts` (manual DI, no container)
- **Interface-driven**: Each layer exposes an `I*` interface (IVaultReader, IVaultService, ILogger, etc.)
- **Custom error classes**: Domain errors (VaultNotFoundError, PathTraversalError, etc.) mapped to HTTP status codes in the controller layer
- **Routes → service → store**: Route modules do auth checks + HTTP status mapping only; a service owns business logic; a store owns persistence (e.g. `pluginRoutes.ts` → `PluginService` → `InstalledPluginStore`/`PluginInstaller`). Some smaller modules collapse service+store into one class that implements the service interface directly (`PreferencesStore implements IPreferencesService`, `VaultConfigStore implements IVaultConfigService`) — acceptable when there's no business logic beyond persistence, but don't reach from a route straight into a store when there is.
- **New per-file/per-key JSON persistence → `shared/json-file-store.ts`**: Use `JsonFileStore<T>` for a single fixed file, `KeyedJsonFileStore<T>` for one file per key (userId/vaultId/tokenId/...). Both wrap the atomic temp→rename write and serialize read-modify-write via `AsyncMutex`/`KeyedMutex` — don't hand-roll another copy of this pattern. If a critical section spans more than one file's read-modify-write (e.g. a filesystem move plus an index update, as in `TrashService`), wrap the whole operation in `shared/async-mutex.ts`'s `KeyedMutex` directly instead.
- **Frontend state**: Single reducer with discriminated union actions, async action creators that call ApiClient then dispatch. Multi-vault trees cached in `vaultTrees: Record<string, DirectoryTree | null>` with lazy-loading on vault expand.
- **Co-located tests**: Test files sit next to their source files (`*.test.ts` / `*.test.tsx`)
- **AppContent decomposition**: Non-rendering effect groups (global keyboard shortcuts, workspace-restore lifecycle) live in dedicated `hooks/use*.ts` files rather than growing inline in `App.tsx` — see `useGlobalShortcuts.ts`, `useWorkspaceRestore.ts`. Prefer this over adding another `useEffect` block directly to `AppContent`.

## API Routes

All routes prefixed with `/api/v1`. Full reference in README.md.

Route modules in `src/api/`:
- `authRoutes.ts` — login, logout, sessions
- `userRoutes.ts` — profile, password, account deletion
- `adminRoutes.ts` — user management, config, audit, restart
- `vaultShareRoutes.ts` — shares, transfer
- `chatRoutes.ts` — conversations, messages, unread
- `graphRoutes.ts` — graph, backlinks, tags
- `searchRoutes.ts` — search, multi-vault search, replace
- `mcpRoutes.ts` — MCP Streamable HTTP transport (Bearer auth)
- `mcpTokenRoutes.ts` — token CRUD (session auth)
- `mcpWellKnownRoute.ts` — `.well-known/mcp.json` (public)
- `pluginRoutes.ts` — installed-plugin CRUD, bundle, styles, settings, registry (depends only on `IPluginService`)
- `pluginStoreRoutes.ts` — community plugin marketplace: browse, install, update (per-vault and global mounts)
- `featureRoutes.ts` — feature toggles (admin + public)
- `versionRoutes.ts` — `GET /version` (public)
- `statisticsRoutes.ts` — vault statistics (file/folder count, total size)
- `trashRoutes.ts` — trash CRUD (list, restore, permanent delete)
- `fileVersionRoutes.ts` — file version management (list, get content, restore)
- `templateRoutes.ts` — template listing and creation
- `uploadRoutes.ts` — file upload (multipart, image paste mode)
- `preferencesRoutes.ts` — user preferences (recent files, favorites, keybindings)
- `vaultConfigRoutes.ts` — per-vault config (templates dir, daily notes dir)
- `welcomeVaultRoutes.ts` — `POST /welcome-vault` (on-demand tutorial vault creation)
- `proxyRoutes.ts` — `POST /proxy` (CORS-free HTTP proxy for plugin requestUrl, SSRF protection)
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
├── .slatebase/
│   ├── config.json           — Per-vault configuration (templatesDirectory, dailyNotesDirectory)
│   ├── link-index.json       — Persistent link index (v2: forwardLinks, tags, properties)
│   ├── trash/
│   │   ├── _index.json       — Trash index (entries with id, originalPath, deletedAt, isDirectory)
│   │   └── <entryId>/        — Moved file/folder per trash entry
│   │       └── <originalName> — The actual file/folder content
│   └── versions/
│       └── <relativePath>/   — Version directory per file (mirrors file path structure)
│           ├── 20240120T143000123.md  — Version snapshot (YYYYMMDDTHHmmssSSS UTC timestamp)
│           └── ...
└── Templates/                — Template directory (configurable, default: "Templates")
    ├── daily.md              — Daily note template (optional)
    └── meeting.md            — Other templates (any .md file)
```

- **`.slatebase/` directory**: All Slatebase-internal data lives here (analogous to `.obsidian/` for Obsidian). Hidden from user tree (dot-prefix rule).
- **Trash**: Soft-deleted files moved to `.slatebase/trash/<id>/`. Atomic index updates (temp → rename). Configurable retention (0–365 days, default 30).
- **Versions**: Previous file content saved before each write. Configurable max per file (0–100, default 20). Timestamp format: `YYYYMMDDTHHmmssSSS` (UTC).
- **Link-Index**: Derived index rebuilt from vault content.
- **Config**: Vault configuration (templates dir, daily notes dir).
- **Templates**: Regular vault directory (visible). `.md` files used for "New from template" feature. Placeholder replacement: `{{date}}`, `{{time}}`, `{{title}}`.
- **Cleanup Job**: Periodic (default 24h interval). Purges expired trash + prunes excess versions. Per-file error isolation.

### File Visibility Rules (like Obsidian)

- **Dot-prefixed** files and directories (`.obsidian/`, `.slatebase/`, `.hidden-file`) are hidden from the user-visible tree, search, statistics, and link-index. They exist on disk and may be synced.
- **Underscore-prefixed** files and directories (`_drafts/`, `_archive.md`) are treated as normal user content — visible, searchable, indexed, synced (except at vault root due to CouchDB limitation).
