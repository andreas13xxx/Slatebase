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
│   ├── index.ts          — AuthService, SessionStore, interfaces, error classes. Session reads distinguish "provably gone" (ENOENT / parses but fails schema) from a transient read failure (EPERM/EBUSY from antivirus or a synced folder, torn read mid-write) and only deindex the former, so a locked file never kills a valid session. `startCleanup()`/`stopCleanup()` (composition-root lifecycle, not on ISessionStore) sweep expired session files periodically — otherwise abandoned sessions accumulate and slow every `findByUserId()`
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
│   ├── snippetRoutes.ts — CSS snippet CRUD routes (list, create, get/put/delete content, registry) — same access-control model as pluginRoutes.ts
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
│   ├── vaultConfigRoutes.ts — Per-vault config routes (GET/PUT /vaults/:vaultId/config — templates dir, daily notes dir, daily note template name)
│   ├── vaultConfigRoutes.test.ts — Integration tests for vault config routes
│   ├── welcomeVaultRoutes.ts — POST /api/v1/welcome-vault (on-demand tutorial vault creation, rate-limited)
│   ├── welcomeVaultRoutes.test.ts — Integration tests for welcome vault route
│   ├── proxyRoutes.ts    — POST /api/v1/proxy (CORS-free HTTP proxy for plugin requestUrl, SSRF protection, URL allowlist)
│   ├── propertyTypeRoutes.ts — Property-type registry CRUD (GET/PUT /vaults/:vaultId/property-types, PUT /vaults/:vaultId/property-types/:key)
│   ├── propertyTypeRoutes.test.ts — Integration tests for property-type routes
│   ├── propertyRoutes.ts    — Property metadata routes (GET /vaults/:vaultId/properties, GET /properties/:key/values, POST /properties/query)
│   ├── propertyRoutes.test.ts — Integration tests for property metadata routes
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
│   ├── tool-handlers.ts  — MCP tool handlers (list_vaults, get_vault_structure, search_vault, read_file, write_file, create_directory, delete_file, move_file, rename_file). `move_file`/`rename_file` run Link-Migration too via the optional `ToolHandlerDeps.migrateLinks` (wired to the same `LinkMigrationService` as the REST API in the composition root) — snapshots the pre-move tree, rewrites wikilinks elsewhere in the vault pointing at the old path, reports partial failures as `linkMigrationWarnings`
│   ├── tool-handlers-link-migration.test.ts — Unit tests for move_file/rename_file Link-Migration wiring
│   └── server-factory.ts — McpServerFactory (creates configured McpServer instance)
├── search/
│   ├── index.ts              — Barrel export for search module
│   ├── types.ts              — ISearchService, IReplaceService, SearchResponse, SearchHit, etc.
│   ├── errors.ts             — SearchQueryValidationError, RegexValidationError, RegexTooLongError, SearchTimeoutError, ReplaceValidationError, FileChangedError
│   ├── validation.ts         — Zod schemas (searchQuerySchema, multiVaultSearchSchema, replaceBodySchema)
│   ├── search-service.ts     — SearchService (linear file iteration, plain-text + regex, context lines, multi-vault)
│   ├── replace-service.ts    — ReplaceService (atomic write, max 100 files, partial failure)
│   ├── replace-service.test.ts — Unit tests for ReplaceService
│   ├── query-parser.ts       — parseSearchQuery() (extracts path:/file:/tag:/property: operators + negation from query string, returns ParsedQuery with operators + freeText)
│   ├── query-parser.test.ts  — Unit tests for query parser
│   ├── glob-match.ts         — globMatch() (minimal glob matching for path: operator — *, **, ?, case-insensitive, no external dependency)
│   ├── glob-match.test.ts    — Unit tests for glob-match
│   └── (search-service.test.ts) — Optional: Unit tests for SearchService
├── link-index/
│   ├── index.ts              — Barrel export for link-index module
│   ├── types.ts              — ILinkIndex interface, GraphData, GraphNode, GraphEdge, GraphQueryOptions, GraphMeta, ParsedWikilink, PropertyFilter, PropertyFilterOperator
│   ├── wikilink-parser.ts    — Backend extractWikilinks() (code-block-aware, all formats)
│   ├── wikilink-parser.test.ts — Unit tests for parser
│   ├── tag-extractor.ts      — extractTags() (code-block-aware, nested tags, dedup)
│   ├── tag-extractor.test.ts — Unit tests for tag extractor
│   ├── property-extractor.ts — extractProperties() (YAML frontmatter, regex-based, CRLF-normalized)
│   ├── property-extractor.test.ts — Unit tests for property extractor
│   ├── canvas-parser.ts      — Canvas link extraction (extracts wikilinks from .canvas JSON files)
│   ├── canvas-parser.test.ts — Unit tests for canvas link extraction
│   ├── link-index-service.ts — LinkIndexService (rebuild, incremental updates, JSON v2 persistence, tags, properties, getGraph with options, getGraphMeta, getFilesByProperty, getPropertyKeys, getPropertyValues, queryByProperties), extractFrontmatterTags (Obsidian-compatible frontmatter tag extraction)
│   ├── link-index-service.test.ts — Unit tests for LinkIndexService v2
│   ├── property-value-index.test.ts — Unit tests for inverse property-value-index and query methods
│   ├── link-match-resolver.ts — resolveWikilinkTargetOnTree() — backend port of frontend/src/plugins/link-resolver.ts (same-folder → shortest-path → alphabetical disambiguation against a DirectoryTree). Needed because LinkIndexService.getBacklinks() only matches literal normalized paths and misses bare-name wikilinks (`[[Note]]`) to subfolder files
│   ├── link-match-resolver.test.ts — Unit tests for the resolver (mirrors frontend link-resolver.test.ts fixtures)
│   ├── link-migration-service.ts — LinkMigrationService.migrateLinks() (rewrites wikilinks vault-wide after a rename/move — candidates via getBacklinks() ∪ filename search, resolved against the pre-move DirectoryTree, written via IVaultService.saveFile), computeAffectedFilePairs() (file vs. folder move → {oldPath,newPath} pairs), rewriteWikilinksInContent()
│   └── link-migration-service.test.ts — Unit tests for LinkMigrationService and its pure helpers
├── property-type/                — Per-vault property type definitions for frontmatter keys.
│   ├── index.ts              — Barrel export for property-type module
│   ├── types.ts              — IPropertyTypeService, PropertyType, PropertyTypeEntry, PropertyTypeRegistry, RESERVED_PROPERTY_KEYS
│   ├── validation.ts         — Zod schemas (propertyTypeSchema, propertyTypeEntrySchema, propertyTypeRegistrySchema)
│   ├── property-type-store.ts — PropertyTypeStore (KeyedJsonFileStore in .slatebase/property-types.json, max 200 entries, reserved key enforcement for tags/aliases)
│   └── property-type-store.test.ts — Unit tests for PropertyTypeStore
├── plugin/                   — Installed-plugin management (per vault). Not to be confused with `plugin-store/` (the marketplace).
│   ├── index.ts              — Barrel export for plugin module
│   ├── types.ts              — IInstalledPluginStore, PluginManifest, PluginFiles, PluginRegistryData interfaces
│   ├── errors.ts             — PluginNotFoundError, PluginFileTooLargeError, PluginSettingsTooLargeError
│   ├── validation.ts         — Zod schemas (pluginManifestSchema, pluginRegistrySchema)
│   ├── installed-plugin-store.ts — InstalledPluginStore (filesystem persistence, atomic writes, per-vault per-plugin dirs); `loadManifest` normalizes `manifest.id` to the directory name, since every other lookup is keyed by that and a manifest's self-declared id is upstream-controlled and can drift. The atomic write retries on EPERM/EACCES (Windows file locking from OneDrive sync or antivirus), then unlinks and retries, then falls back to a direct write — a transient lock must never surface as a lost write
│   ├── installed-plugin-store.test.ts — Unit tests for InstalledPluginStore
│   ├── plugin-installer.ts   — PluginInstaller (ZIP extraction, manifest validation, bundle integrity, version comparison)
│   ├── plugin-installer.test.ts — Unit tests for PluginInstaller
│   ├── plugin-service.ts     — PluginService (routes→service→store layer wrapping InstalledPluginStore + PluginInstaller; also hosts the `.obsidian/plugins/` detected-plugin scanner); `saveSettings()` publishes a `plugin-settings:change` broadcast so other tabs/devices reload instead of drifting
│   └── plugin-service.test.ts — Unit tests for PluginService
├── plugin-store/             — Community plugin marketplace (browse/install/update from GitHub releases). Distinct from `plugin/` (installed plugins).
│   ├── index.ts              — Barrel export for plugin-store module
│   ├── types.ts              — IPluginStoreConfig, CommunityPluginEntry, RemotePluginManifest, UpdateCheckResult, etc.
│   ├── errors.ts             — GitHubRateLimitError, GitHubFetchError, AssetTooLargeError, DesktopOnlyPluginError, PluginNotInStoreError, UpstreamError
│   ├── validation.ts         — Zod schemas (communityPluginEntrySchema, storeInstallSchema)
│   ├── github-client.ts      — GitHubClient (fetches community plugin list/releases + `community-plugin-stats.json` (Obsidian's pre-aggregated downloads/last-updated feed — one CDN request instead of one rate-limited API call per plugin); domain allowlist re-validated on every redirect hop, size limits)
│   ├── plugin-store-cache.ts — PluginStoreCache (in-memory TTL cache for plugin list/manifests/update results)
│   ├── plugin-store-service.ts — PluginStoreService (browse/install/update orchestration; installs via the shared `plugin/` InstalledPluginStore)
│   └── update-checker.ts     — UpdateChecker (periodic update check, default 24h interval, persists last-check timestamp)
├── snippets/                 — User CSS snippets (per vault). Modeled on `plugin/installed-plugin-store.ts`'s atomic-write pattern, but stores unscoped user CSS rather than plugin-scoped bundles.
│   ├── index.ts              — Barrel export for snippets module
│   ├── types.ts              — ISnippetStore, SnippetMeta, SnippetRegistryData interfaces
│   ├── errors.ts             — SnippetNotFoundError, SnippetTooLargeError, InvalidSnippetFilenameError
│   ├── validation.ts         — Zod schemas + `SNIPPET_FILENAME_PATTERN` (`^[a-zA-Z0-9_-]+\.css$`), `MAX_SNIPPET_SIZE` (512 KB)
│   ├── snippet-store.ts      — SnippetStore (filesystem persistence, atomic writes, per-vault dirs; `data/snippets/<vaultId>/<snippetId>.css` + `_registry.json`)
│   └── snippet-store.test.ts — Unit tests for SnippetStore
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
│   ├── types.ts              — IPreferencesService, UserPreferences, RecentFileEntry, FavoriteEntry (now a discriminated-by-`type` bookmark: file/heading/block/search, with `id`/`order`/`label` — see lessons-learned.md), KeybindingEntry
│   ├── validation.ts         — Zod schemas (saveRecentFilesSchema, saveFavoritesSchema, saveKeybindingsSchema); optional fields typed `| undefined` (not just `?:`) to satisfy `exactOptionalPropertyTypes: true` against Zod's `.optional()` inference
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
├── App.tsx               — Root component, 3-panel layout, routing, resize, AppPage type export. An ErrorBoundary wraps PluginProvider: third-party plugin code runs inside it on every vault switch and toggle, and without a boundary a plugin bug unmounts the whole tree and reads as an app crash. `NavigationControls` renders next to `TabBar` in a `.tab-bar-row`; `Breadcrumb` renders above `TabContent` for file tabs (both derived from `tabState.activeTabId`, not props threaded down). Auto-reveal effect and breadcrumb derivation live in `AppContent` itself — `usePluginContext()` cannot be called there, since `<PluginProvider>` is mounted inside `AppContent`'s own JSX output (~line 722), not as an ancestor of it
├── App.css               — Global styles (Design Tokens in index.css)
├── index.css             — CSS Custom Properties (Design Tokens, Dark Mode)
├── types.ts              — Shared TypeScript interfaces (VaultInfo, DirectoryTree, AppState with vaultTrees, etc.)
├── api/index.ts          — ApiClient (IApiClient interface + fetch implementation, includes getVersion()). A 401 (or a CSRF failure, which is indistinguishable from a dead session client-side) triggers a session probe returning `alive`/`dead`/`unknown` — only the server answering 401 counts as `dead`; a 5xx, 429 or rejected fetch is `unknown` and leaves the session intact. Concurrent failures share one in-flight probe, so a burst of requests on page load cannot avalanche into a logout
├── utils/
│   ├── semver.ts         — compareSemver() utility (X.Y.Z comparison, v-prefix stripping)
│   ├── error.ts          — extractErrorMessage(err, fallback) shared utility
│   ├── fileValidation.ts — Filename validation for InlineInput (new file/rename): invalid chars, length
│   ├── pathUtils.ts      — Relative path computation, image/PDF detection, drop target + context-menu viewport clamping
│   ├── fileIcons.tsx     — File extension to icon mapping (@react-symbols/icons for known types, Lucide fallback)
│   ├── fuzzyMatch.ts     — Case-insensitive subsequence fuzzy match (QuickSwitcher), lower score = better
│   ├── internalLink.ts   — Builds the wikilink/embed text for a file dropped from the File Explorer; image/PDF extensions become `![[…]]` embeds, Markdown links drop its `.md` so the target matches what the wikilink resolver looks up
│   ├── pluginIcon.ts     — Single resolution path for plugin icon names (addRibbonIcon, ItemView.getIcon, context-panel tabs): checks the plugin's own `addIcon()` SVGs first, then falls back to the shared Lucide resolver in `plugins/compat/lucide-icons.ts`. Centralized so a new render site cannot skip the custom-icon check — a second, independently maintained alias table used to live here and drifted
│   ├── frontmatterWriter.ts — YAML frontmatter serialization + editing (locateFrontmatterBlock, serializeFrontmatter, applyFrontmatterChange) — custom line-builder for Obsidian-compatible output, no yaml lib for serialization
│   ├── frontmatterWriter.test.ts — Unit tests for frontmatter writer
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
│   ├── editor-state-fields.ts — Obsidian-compatible StateFields (editorInfoField, editorLivePreviewField, editorEditorField) + `livePreviewState` (`{ mousedown }`) and the `livePreviewStateTracker` extension that maintains it (document-level mouseup, so a drag ending outside the editor still clears)
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
│   ├── types.ts          — MDAST node types (WikilinkNode, EmbedNode, CalloutNode, TagNode), IMAGE_EXTENSIONS, PDF_EXTENSIONS, AUDIO_EXTENSIONS, VIDEO_EXTENSIONS
│   ├── link-resolver.ts  — Wikilink target resolution against DirectoryTree; `resolveWikilinkTargetWithAlternatives()`/`resolveAmbiguousMatch()` disambiguate multiple same-named files (optional `sourcePath` → same folder as source, then shortest path, then alphabetical) and report `alternativeCount` for link tooltips
│   ├── heading-anchor.ts — Heading anchor generation + deduplication tracker
│   ├── preserve-table-code-escapes.ts — Counters mdast-util-gfm-table's pipe-unescaping inside inline code spans (Obsidian verbatim rendering)
│   ├── inline-html.ts    — Allowlist + attribute parsing for the safe subset of inline raw HTML (`<font color>`, `<mark>`, `<span style>`, …); shared by Live Preview (inline-decorations.ts, styled span) and reading view (ViewMode.tsx, real element) so both agree on what renders vs. stays literal text
│   ├── wikilink/
│   │   ├── syntax.ts     — micromark tokenizer extension for [[...]] syntax
│   │   ├── mdast-util.ts — fromMarkdown + toMarkdown handlers
│   │   ├── plugin.ts     — remark plugin wrapper (remarkWikilink)
│   │   └── extract.ts    — extractWikilinks() utility for knowledge graph
│   ├── embed/
│   │   ├── syntax.ts     — micromark tokenizer extension for ![[...|...]] syntax (with pipe separator for size/display), detectEmbedType() (image/pdf/audio/video/note)
│   │   ├── mdast-util.ts — fromMarkdown + toMarkdown handlers (target, heading, display fields)
│   │   ├── plugin.ts     — remark plugin wrapper (remarkEmbed)
│   │   └── media-embed.test.ts — Unit tests for audio/video embed type detection (22 tests)
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
│   ├── math/
│   │   ├── syntax.ts     — micromark tokenizer extension for inline $...$ math (boundary rules)
│   │   ├── mdast-util.ts — fromMarkdown/toMarkdown handlers + mathBlockTransformer ($$...$$ → MathBlockNode)
│   │   ├── types.ts      — MathInlineNode, MathBlockNode interfaces + mdast module augmentation
│   │   ├── plugin.ts     — remark plugin wrapper (remarkMath: inline tokenizer + block transformer)
│   │   ├── index.ts      — Barrel export
│   │   └── math.test.ts  — Unit tests for syntax/serialization (14 tests)
│   ├── appearance/           — User-facing appearance customization (CSS Snippets), distinct from plugin CSS
│   │   ├── snippet-injector.ts — SnippetInjector (unscoped `<style data-snippet-id>` injection — deliberately does NOT reuse compat/css-injector.ts's `[data-plugin-id]` scoping, since user snippets must affect the whole app, e.g. `body`/`:root` overrides)
│   │   └── snippet-injector.test.ts — Unit tests for SnippetInjector
│   └── compat/           — Obsidian Plugin Compatibility Layer
│       ├── types.ts      — TFile, TFolder, TAbstractFile, CachedMetadata, PluginManifest, PluginRegistryEntry, etc.
│       ├── errors.ts     — PluginError, ManifestValidationError, BundleEvaluationError, LifecycleError, etc.
│       ├── event-system.ts — IEventEmitter (on/off/trigger/offref/removeAllListeners); `on(event, cb, context)` binds the optional third argument as the callback's `this`, as Obsidian's API does
│       ├── manifest-parser.ts — Manifest parsing with Zod validation + semver comparison
│       ├── install-globals.ts — Installs the `window.obsidian` namespace + DOM/window globals plugin bundles expect; explicit idempotent entry point (registration order: DOM patches → real API → obsidian-api-extensions → fallback-shims). Base classes are wrapped so plugins can extend them from native `class ... extends` *and* from the ES5-downlevel `_super.call(this, …)` output older community bundles ship (`new.target` tells the two call shapes apart). Node's `Buffer` and the `path` shim are installed here too — before bundle evaluation, not at `onload()`, since plugins reference them at module top level. Also home to the single real view/modal class chain (Component → View → ItemView → FileView → EditableFileView → TextFileView → MarkdownView, and MarkdownRenderChild → MarkdownRenderer → MarkdownPreviewView, and MarkdownEditView, and Modal → SuggestModal → FuzzySuggestModal) so `instanceof` and the prototype chain behave as plugins expect — these were previously duplicated across separate shim modules that overwrote each other
│       ├── global-extensions.ts — Obsidian-compatible prototype patches (Array.remove/first/last, String.contains, Element.find/findAll, Math.clamp, etc.) — imported synchronously before any plugin bundle evaluates
│       ├── fallback-shims.ts — Last-resort no-op/minimal implementations for anything install-globals + obsidian-api-extensions leave unclaimed; registered last so real shims always win
│       ├── plugin-loader.ts — PluginLoader (bundle evaluation, lifecycle, timeout, cleanup, @lezer/* stubs)
│       ├── plugin-registry.ts — PluginRegistry (frontend state, backend persistence); `hydrateManifests()` overwrites the id-only placeholders restored from `_registry.json` (whose schema carries no manifest) with the real `manifest.json` content, so plugins don't report version "0.0.0" back to themselves
│       ├── sandbox.ts    — PluginSandbox (vault isolation, storage namespace, network allowlist, blocking detection)
│       ├── settings-manager.ts — SettingsManager (loadData/saveData per plugin per vault); tracks its own recent writes (2s) so the `plugin-settings:change` broadcast triggered by a save is not delivered back to the tab that made it as an "external" change
│       ├── setting-tab.ts — PluginSettingTab, Setting, SettingGroup (1.11+ grouped settings with optional search/extra-button header — a real extendable class, since plugins subclass it and `class X extends undefined` throws at bundle parse time), UI components, DOM extensions, icon registry, Modal, Plugin class (synchronous global registration)
│       ├── setting-tab-registry.ts — Tracks which plugins registered a PluginSettingTab (via addSettingTab), so the Plugin Management UI can mount tab.containerEl
│       ├── declarative-settings-renderer.ts — Renders Obsidian 1.13+ `getSettingDefinitions()` declarative settings arrays (group/list/page/controls) into Setting/*Component UI
│       ├── obsidian-api-extensions.ts — Extended APIs: Events, Scope, Keymap, utility functions, MarkdownPreviewRenderer, DOM globals (async loaded as supplement) + `OBSIDIAN_API_VERSION` behind `requireApiVersion()`. `Scope.handleKey()` and the module-level `Keymap` scope stack really dispatch (a single global keydown listener walks the stack) instead of only collecting handlers — inert until a plugin calls `app.keymap.pushScope()`. `sanitizeHTMLToDom()` strips inline event-handler attributes and `javascript:`/dangerous `data:` URLs, not just `<script>` tags. `renderComponentIcon()` is `ExtraButtonComponent.setIcon()`'s Lucide/custom-SVG resolver (same logic `ButtonComponent.setIcon()` in `setting-tab.ts` implements separately) — `Setting`/`SettingGroup`'s `addExtraButton()` now construct a real `ExtraButtonComponent` instead of a third copy, so this one fix covers all three call sites.
│       ├── metadata-parser.ts — `parseMetadata()`: the single producer of Obsidian-shaped `CachedMetadata` from raw Markdown — headings, embeds, sections, listItems, footnotes/footnoteRefs, referenceLinks, frontmatterLinks alongside frontmatter/tags/links/blocks. Best-effort CommonMark approximation (same bar as `parseBlocks`/`scanFencedCodeBlocks`), not a spec-compliant parser
│       ├── editor-shim.ts — EditorShim (Obsidian Editor API; backend priority CM6 EditorView → textarea → internal buffer; setEditorViewAccessor wired once at vault init)
│       ├── editor-suggest-manager.ts — EditorSuggestManager (module-level singleton: registry of EditorSuggest instances, trigger-detection state machine, async generation guard, open/close lifecycle)
│       ├── editor-suggest-popover.ts — EditorSuggestPopover (fixed-position dropdown DOM, coordsAtPos positioning, viewport clamping, renderSuggestion loop, keyboard-nav selection, scroll-into-view)
│       ├── editor-suggest-extension.ts — CM6 ViewPlugin (trigger loop on selectionSet/docChanged) + Prec.highest keymap (↑↓ Enter Tab Esc interception when popover is open)
│       ├── markdown-renderer.ts — MarkdownRenderer (lightweight regex-based markdown-to-HTML). Serves as the synchronous initial implementation during bundle evaluation; the full remark pipeline from `shims/markdown-renderer-shim.ts` patches over the static methods before any plugin's `onload()` fires
│       ├── markdown-sections.ts — Maps rendered code blocks back to their source line range (getSectionInfo) by re-scanning the source for fenced blocks in document order
│       ├── block-cache.ts — Parses `^block-id` markers out of Markdown so `[[note#^id]]` links and CachedMetadata.blocks resolve
│       ├── ribbon-icon-registry.ts — Module-level ribbon icon registry (addRibbonIcon store + change listeners)
│       ├── status-bar-registry.ts — Module-level registry for addStatusBarItem() entries; notifies the StatusBar component on change
│       ├── command-registry.ts — CommandRegistry (addCommand → returns the Command like Obsidian does, getCommand, removeAll, search, hotkeys, editorCallback/editorCheckCallback; executes callbacks inside withPluginContext)
│       ├── plugin-execution-context.ts — Tracks which plugin's code is currently executing (withPluginContext/getCurrentPluginId) so createEl() can tag elements with data-plugin-id; scopeForPlugin() binds the id into a closure for call sites that must survive `await`
│       ├── lucide-icons.ts — Resolves Obsidian's built-in icon names (Lucide IDs + `-glyph` aliases) to SVG via lucide-react's per-icon dynamic-import map — real Obsidian ships the whole set, our addIcon() registry alone left plugin buttons blank. `preloadIconsReferencedIn(source)` scans a bundle's text for icon-id-shaped tokens and resolves those into the cache *before* the bundle evaluates, because Obsidian's `getIcon()` is synchronous and plugins may freeze its result into a vDOM tree at module load (Excalidraw), where a later async fill-in lands on a node nothing points at
│       ├── browser-path-shim.ts — Browser-safe subset of Node's POSIX `path` (normalize/join/resolve/relative/dirname/basename/extname/parse/format, `posix`/`win32` self-aliases) for mobile-compatible plugins; transforms path strings only, never grants filesystem access
│       ├── code-block-processor-registry.ts — CodeBlockProcessorRegistry (registerCodeBlockProcessor, processCodeBlocks, runPostProcessors, MarkdownRenderChild lifecycle)
│       ├── css-injector.ts — CSS injection with scoped selectors (data-plugin-id); each rule emits both a descendant form (`[scope] sel`) and a self form (`sel[scope]`) so plugin UI inserted into shared workspace DOM — which has no scoped ancestor — still matches
│       ├── compatibility-analyzer.ts — Multi-layer browser compatibility analysis (isDesktopOnly gate, Node.js module detection, Obsidian API pattern matching, SUPPORTED_METHODS set). Methods that degrade gracefully and self-explanatorily (a split becomes a plain tab, both sidebars merge into the Context Panel) count as supported and explain the substitution in the console at call time; the pre-install warning list is reserved for reduced behavior likely to actually break a plugin
│       ├── platform-detection.ts — Runtime device/Platform flags (Obsidian's are Electron build constants; Slatebase derives isMobile/isDesktop etc. at runtime since one build serves both)
│       ├── api-gap-registry.ts — Records which no-op Proxy-trapped API a plugin read vs. actually called, so silently-unimplemented API usage is diagnosable instead of invisible
│       ├── log.ts — Shared console helpers with meaningful severity: `debug*` = deliberate compat trade-off (expected), `warn*` = real gap (actionable); `*Once` variants dedupe by key so render/event-path call sites log one line per session instead of flooding
│       ├── core-commands.ts — Obsidian's built-in `editor:*` commands (formatting, lists, headings, tables) registered against the CommandRegistry, so `executeCommandById('editor:toggle-code')` resolves like a real install; no-Slatebase-equivalent commands are registered as literal no-ops rather than left unresolvable
│       ├── core-commands-app.ts — The core commands needing app-level React state (`workspace:*`, `file-explorer:*`, `app:*`, `theme:*`, Graph/Canvas/Daily Notes, side panels); registered once by CommandPaletteContainer and fed fresh state via a ref. `app:go-back`/`app:go-forward`/`switcher:open` (formerly no-ops) now call `h.onNavigateBack`/`onNavigateForward`/`onOpenQuickSwitcher`; `workspace:next-tab`/`previous-tab` (`activateTabByOffset()`, wrap-around) predate this but only got a default keybinding now; `graph:open-local` (formerly a no-op) now calls `h.onOpenLocalGraph(activeTab.filePath)`, guarded against sentinel (non-file) active tabs
│       ├── body-classes.ts — Syncs Obsidian's `theme-dark`/`theme-light` + platform marker classes (`is-mobile`, `mod-macos`, …) onto `document.body`; plugin CSS and runtime theme checks read those, while Slatebase's own state lives in `data-theme` on `<html>`
│       ├── active-workspace-shim.ts — Module-level get/set for the current vault's WorkspaceShim, so native UI outside the PluginProvider tree (file-explorer context menu) can fire `file-menu`/`files-menu`
│       ├── obsidian-components.css — Styles for the Obsidian-compatible Setting/*Component controls rendered by setting-tab.ts
│       ├── plugin-context.ts — PluginProvider + usePluginContext hook (vault-scoped instances, FCP loading, activeViews/sidebarViews state)
│       ├── plugin-event-bridge.ts — usePluginEventBridge hook (tab→workspace, save→cache, tree→resolved, leaf events)
│       ├── core-command-i18n.ts — German/English display names for the core commands, keyed by the same full command ID. The IDs themselves stay fixed and language-independent (plugins resolve them); only the palette label is localized, and keeping it here means translating never touches the command spec arrays
│       ├── menu.ts — `Menu`/`MenuItem`/`MenuSeparator`, extracted out of `installObsidianGlobals()` so entries are real class instances rather than object literals — plugins narrow menu entries with `instanceof MenuItem`/`instanceof MenuSeparator`, which only holds if these are the same classes `addItem()`/`addSeparator()` construct
│       ├── file-explorer-dom-registry.ts — Live DOM registry behind `workspace.getLeavesOfType('file-explorer')[0].view.fileItems`, Obsidian's undocumented-but-supported path for plugins that inject DOM straight into a tree row (Iconize is the known consumer). `titleEl` points at the row's title button, whose React children keep a stable count/order, so plugin-inserted nodes survive re-renders
│       ├── embed-registry.ts — `app.embedRegistry`: undocumented core API (absent from the public `obsidian.d.ts`) through which plugins render custom non-Markdown embeds for `![[file.ext]]` — Supernote, tldraw, PDF++, drawio and obsidian-dev-utils' EmbedExtensionsComponent rely on it. Shape cross-checked against obsidian-typings and those plugins' source
│       ├── hover-link-bus.ts — Routes hover-preview requests (Slatebase's own links + plugins' `workspace.trigger('hover-link', …)`) to the HoverPreview popover
│       ├── file-view-registry.ts — FileViewRegistry (content-based + extension-based view routing, registerExtensionsForPlugin, active file view lifecycle for TextFileView-based plugins like Kanban)
│       ├── view-registry.ts — ViewRegistry (plugin-ownership tracking, location-aware leaf creation, sidebar callbacks). `ItemView.containerEl` keeps Obsidian's two-child shape (header at `children[0]`, contentEl at `children[1]`) — header actions go inside the header, never as a sibling before contentEl, which plugins read positionally. `WorkspaceLeaf.getRoot()` reports `rightSplit` for sidebar leaves and `rootSplit` otherwise, which is how plugins tell the two apart
│       ├── obsidian-compat.css — Obsidian-compatible CSS Custom Properties (~590 vars mapped to Slatebase tokens, Dark Mode: fonts/weights, sizing scale, code + tag tokens, accent HSL components, input shadows) + `position: relative` on `.markdown-source-view`/`.view-content` so plugin UI anchored to the editor pane sizes against the pane, as it does in real Obsidian
│       ├── tab-view-bridge.ts — TabViewBridge (module-level bridge: ViewRegistry → TabProvider for plugin view tabs)
│       ├── tab-view-bridge-wiring.test.ts — Integration tests for TabViewBridge wiring
│       └── shims/
│           ├── app-shim.ts — AppShim (Proxy-based, vault/workspace/metadataCache/fileManager/plugins/isMobile/appId/secretStorage/loadLocalStorage/saveLocalStorage); `commands` + `hotkeyManager` are backed by the shared CommandRegistry (findCommand/listCommands/executeCommandById, defaultKeys/addDefaultHotkeys), `workspace` is wrapped with scopeForPlugin so its callbacks stay plugin-tagged. `App.scope` is one shared `Scope` across every AppShim (real Obsidian has a single App, so `app.scope.register()` from different plugins accumulates into one hotkey set) and is pushed onto the scope stack once, never popped. Also `metadataTypeManager` (undocumented frontmatter property-type registry — obsidian-tasks registers its field types on startup; Slatebase has no Properties view to reflect them into, so it just echoes back what was registered)
│           ├── vault-shim.ts — VaultShim (read/modify/create/delete/copy/getFileByPath/readBinary/modifyBinary/process/append/exists/configDir/events); create/delete/rename/createFolder also patch the local `directoryTree` snapshot immediately (returning a new tree, not mutating in place) so the synchronous cache-only APIs — `getAbstractFileByPath`/`exists`/`getFileByPath`, which cannot await — don't answer from stale state before the realtime round-trip lands (Templater creates a file and looks it up in the same tick). `onFileRead`/`onFileWrite` callbacks (wired in `plugin-context.ts`) feed `MetadataCacheShim.populateFromContent()`/`refreshFileCache()` after every read/write, so `getFileCache()` never answers from a stale or empty cache. `TFile.stat.mtime`/`ctime` come from the backend's directory-tree scan (real `fs.stat()`), falling back to "now" only for locally-synthesized nodes (e.g. a file just created, ahead of the next tree refresh)
│           ├── vault-adapter-shim.ts — VaultAdapterShim (Obsidian-compatible DataAdapter API: exists, read, write, list, stat, mkdir, remove, rename)
│           ├── workspace-shim.ts — WorkspaceShim (full Leaf API + getActiveViewOfType synthetic view for the MarkdownView/FileView/ItemView family, onLayoutReady error-isolation); active leaf falls back to an "empty"-type view instead of null, and layout/leaf events re-fire once the CM6 editor mounts
│           ├── metadata-cache-shim.ts — MetadataCacheShim (getFileCache, resolvedLinks, changed/resolved events, getTags, fileToLinktext, blockCache, getCachedFiles); content parsing is delegated to `metadata-parser.ts`
│           ├── file-manager-shim.ts — FileManagerShim (renameFile, processFrontMatter, generateMarkdownLink, getNewFileParent, trashFile, promptForFileRename, getAvailablePathForAttachment)
│           └── markdown-renderer-shim.ts — MarkdownRendererShim (unified/remark MDAST→HTML pipeline); `registerMarkdownRendererGlobal()` patches the static `render()`/`renderMarkdown()` methods onto the instanziable MarkdownRenderer class defined in `install-globals.ts` — does NOT replace the class (would break the instanceof chain)
├── state/
│   ├── index.ts          — AppProvider, appReducer, action creators
│   ├── authState.ts      — Auth reducer + types
│   ├── authContext.ts    — AuthProvider + useAuthContext hook
│   ├── tabState.ts       — Tab reducer + types
│   ├── tabContext.ts     — TabProvider + useTabContext hook
│   ├── tabActions.ts     — openTab, saveTab action creators (+ recentFilesStore.add on open)
│   ├── navigationHistoryState.ts   — Back/forward navigation history reducer (RECORD_VISIT/GO_BACK/GO_FORWARD/DROP_ENTRY/CLEAR), session-only, MAX_STACK_SIZE 50
│   ├── navigationHistoryContext.ts — NavigationHistoryProvider + useNavigationHistory hook. Records a visit centrally via a `useEffect` watching `tabState.activeTabId` (not threaded through every click handler) — GO_BACK/GO_FORWARD suppress the resulting auto-record via a ref flag so they don't re-record their own tab activation
│   ├── chatState.ts      — Chat reducer + types (conversations, messages, unread)
│   ├── chatContext.ts    — ChatProvider + useChatContext hook
│   ├── chatActions.ts    — loadConversations, sendMessage, leaveConversation, etc.
│   ├── panelState.ts     — Generic split-section/tab-ordering reducer shared by both side panels (`side-panel/SidePanel.tsx`) — layout only, not document-derived content. MAX_SECTIONS 3
│   ├── panelState.test.ts — Unit tests for panelState reducer
│   ├── panelContext.tsx  — LeftPanelProvider/RightPanelProvider + useLeftPanelContext/useRightPanelContext — both wrap the same `usePanelState` hook (reducer + localStorage persistence scoped by userId), differing only in storage-key prefix and default view set
│   ├── documentPanelData.ts — DocumentPanelState reducer + types (outline, forward/backlinks, unlinkedMentions, tags, properties) and the `useDocumentPanelData` hook (owns the 5 effects: document switch, debounced content re-parse, vault-change tag reload, live backlinks refresh, live unlinked-mentions refresh — all via `onRealtimeVaultChange`). Side-agnostic: doesn't care which panel currently hosts Outline/Links/Tags/Properties, see `panelState.ts`
│   ├── documentPanelActions.ts — loadOutline, loadForwardLinks, loadBacklinks, loadUnlinkedMentions (search-based, filters out matches already inside a wikilink via extractWikilinks/resolveWikilinkTarget), linkUnlinkedMention (rewrites one occurrence into a wikilink and saves), loadTags, loadProperties, loadPropertyTypes, expandTag
│   ├── documentPanelActions.test.ts — Unit tests for loadUnlinkedMentions/linkUnlinkedMention
│   ├── propertyTypes.ts  — Frontend-side property type definitions (PropertyType, PropertyTypeEntry, PropertyTypeOptions, PropertyTypeRegistry) — mirrors backend types for API communication
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
│   ├── pluginSettingsChangeBridge.ts — Same module-level bridge pattern for SSE `plugin-settings:change` → PluginProvider, which resolves the PluginInstance and calls its `onExternalSettingsChange()` (RealtimeProvider sits above PluginProvider, so it cannot reach the loader directly)
│   ├── useEventSource.ts — Custom hook managing EventSource lifecycle (backoff, visibility, reconnect)
│   ├── recentFilesStore.ts — Recent files list (server-synced + localStorage cache, max 20, dedup by vaultId+path)
│   ├── favoritesStore.ts — Bookmarks per vault (server-synced + localStorage cache, max 50 across all types, path tracking on rename/delete). Four bookmark types (file/heading/block/search) share one entry shape discriminated by `type` (absent = legacy 'file'); `id` (not `path`) is the primary key for reorder/label/removeById since `path` is no longer unique once entries can share it (heading/block bookmarks on the same file) or be empty (search). `order` field drives display order (lazy-migrated for pre-existing entries on first read, idempotently)
│   ├── snippetStore.ts   — CSS snippet action-creator functions `(apiClient, vaultId, ...)` — not a module-level singleton like favoritesStore.ts, since snippets are only managed from one place (Settings) and gain nothing from hidden shared state
│   ├── dailyNoteService.ts — Daily note open/create logic (YYYY-MM-DD.md, template from vault config)
│   ├── keybindingsStore.ts — Configurable keyboard shortcuts (server-synced, defaults + user overrides, matchesShortcut(), formatShortcut()); includes `slatebase:navigate-back`/`-forward` (Alt+ArrowLeft/Right — the `event.key` form, not `Left`/`Right`), `slatebase:open-quick-switcher` (Mod+O), `slatebase:next-tab`/`previous-tab` (Ctrl+Tab/Ctrl+Shift+Tab)
│   ├── workspaceStore.ts — Workspace UI state persistence (tabs, expanded folders, panel sizes/visibility, `explorerFollowActiveFile` auto-reveal toggle, debounced localStorage, per-vault tab memory); a `storage`-event listener adopts writes from other browser tabs, except while this tab has a pending debounced write of its own. `explorerFollowActiveFile` validates leniently (defaults `false` instead of invalidating the whole blob on old persisted state) since it was added after the initial schema
│   └── vaultStatisticsCache.ts — Client-side vault statistics cache (invalidate on vault:change SSE)
│   ├── settingsState.ts      — Settings reducer + types (categories, sections, nav state)
│   ├── settingsRegistry.ts   — ISettingsRegistry, section definitions
│   ├── settingsPersistence.ts — sessionStorage serialize/validate
│   ├── settingsContext.ts    — SettingsProvider + useSettingsContext hook
│   ├── canvasState.ts        — Canvas reducer + types (document, viewport, selection, undo/redo stacks, dirty)
│   ├── canvasContext.ts      — CanvasProvider + useCanvasContext hook (parse, autosave, save)
│   ├── realtimePresenceBridge.ts — Module-level bridge: SSE presence events → PresenceState
├── hooks/
│   ├── useLineNumbers.ts — Line numbers toggle state (localStorage persistence)
│   ├── useResize.ts      — Mouse-driven panel resize hook (width, min, max, side)
│   ├── useDropZone.ts    — File drag-and-drop hook (drag counter, size/count validation, toast errors)
│   ├── useStatusBar.ts   — Status bar visibility toggle (module-level store, useSyncExternalStore, localStorage) — global on/off, gates everything below
│   ├── useStatusBarItemVisibility.ts — Per-built-in-item visibility toggle (`slatebase:statusBarItem:<itemId>`, same module-level useSyncExternalStore pattern as useStatusBar.ts)
│   ├── useWordStats.ts   — Word/character count (+ selection) for the active file. Polls `getActiveEditorView()` (300ms) rather than subscribing to CM6 transactions directly — no reactive content/selection stream exists without extending the core editor's extension pipeline
│   ├── useCursorPosition.ts — Cursor line/column (100ms poll, same rationale as useWordStats.ts) + `goToLine()` helper
│   ├── useVersionInfo.ts — Server version info hook (installed vs. latest, GitHub API check)
│   ├── useGlobalShortcuts.ts — App-wide keyboard shortcuts (vault search, mode toggle, settings panel, daily note, navigate back/forward); extracted from AppContent. Next/previous tab is registered in `CommandPaletteContainer.tsx` instead — it needs `commandRegistry` from `usePluginContext()`, unreachable from this hook (see App.tsx note)
│   ├── useWorkspaceRestore.ts — Session-persistence lifecycle: restores vault/tabs/layout from workspaceStore on mount, persists changes back; extracted from AppContent
│   ├── usePaginatedResource.ts — Shared list-loading state machine (page/loading/error, loadPage/reload) for admin list pages
│   └── useFocusTrap.ts    — Reusable focus trap hook (Tab cycling, Escape callback, focus return to trigger element)
├── components/
│   ├── SlatebaseLogo.tsx — SVG logo component
│   ├── StatusBar.tsx     — Bottom status bar (clock, vault name, word/char count, cursor position with "go to line" popover, extensible plugin items — each built-in item independently togglable). Plugin items are diff-synced into the DOM (only added/removed elements touched, never a full `innerHTML = ''` + rebuild) so a plugin mutating its own element in place never gets torn out and flickers
│   ├── SnippetLifecycle.tsx — Renders nothing; applies a vault's enabled CSS snippets on open and swaps them for the new vault's on switch. Mounted once near the app root (reacts to `state.selectedVaultId` via useAppContext) — same "self-contained, context-only, no prop drilling" pattern as StatusBar's VaultNameItem
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
│   ├── SearchPanel.tsx   — Vault-wide search + replace panel (replaces FileExplorer when open, debounced search, result navigation, operator syntax highlighting + autocomplete)
│   ├── SearchPanel.css   — SearchPanel styles with design tokens (incl. highlight layer, autocomplete dropdown, operator help popover)
│   ├── search-operator-highlight.ts — Client-side search operator highlighting (mirrors backend query-parser regex, produces HighlightedSegment[] for shadow-layer rendering)
│   ├── search-operator-highlight.test.ts — Unit tests for search operator highlighting
│   ├── SearchOperatorHelp.tsx — Popover with search operator syntax table and examples
│   ├── TabBar.tsx        — Unified horizontal tab strip: settings-page tabs (not draggable) + file tabs (draggable/reorderable) in one row
│   ├── NavigationControls.tsx — Back/forward buttons for the navigation history, disabled when the respective stack is empty
│   ├── Breadcrumb.tsx    — Active file's folder path as clickable segments (vault name → folders → filename); collapses middle segments into a "…" dropdown past 2 visible folders; hidden for non-file tabs (graph, plugin views)
│   ├── TabContent.tsx    — Tab content orchestrator (Edit/View/Binary, wires upload + image paste + versions)
│   ├── TabContent.css    — TabContent styles (empty/loading/error/content states, design tokens)
│   ├── EditMode.tsx      — CodeMirror editor host: auto-save + undo/redo + line numbers + image paste + DnD + read-only banner + editor command event listener (slatebase:editor-command). No native formatting toolbar — formatting runs through the Command Palette or an Obsidian-compatible plugin toolbar (Editing Toolbar); `livePreviewMode` is a required prop driven by the tab mode
│   ├── ViewMode.tsx      — Markdown renderer (remark + highlight.js + Obsidian plugins)
│   ├── MermaidRenderer.tsx — Mermaid diagram renderer (lazy-loaded, SVG inline, theme-aware, timeout, error fallback)
│   ├── MermaidRenderer.test.tsx — Unit tests for MermaidRenderer
│   ├── MathRenderer.tsx  — LaTeX math renderer (KaTeX, lazy-loaded, 5-state machine: loading/rendered/error/timeout/load-failed, same pattern as MermaidRenderer)
│   ├── katex-loader.ts   — KaTeX lazy-loader (module-level cached promise, CSS injection, renderMathToString helper, MATH_RENDER_TIMEOUT_MS=2000)
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
│   ├── GlobalTooltip.tsx — Renders a visible tooltip for any element carrying an `aria-label` (Obsidian's tooltip mechanism — plugins and our own `setTooltip()` just set the attribute and expect a bubble; browsers only do that for `title`). Mounted once near the root, independent of vault/auth state
│   ├── GlobalTooltip.css — GlobalTooltip styles
│   ├── global-tooltip-position.ts — Pure geometry for placing the tooltip (viewport-edge flipping), testable without a browser layout
│   ├── VaultSharing.tsx  — Vault sharing component (share list, add/revoke permissions)
│   ├── GraphView.tsx     — Knowledge graph SVG visualization (d3-force, zoom/pan/drag/search, config-driven colors/layout, tag/property nodes). Optional `localGraphCenterPath` prop renders a Lokaler_Graph: full graph data filtered client-side to the center note's N-hop neighborhood (local-graph-utils.ts), no separate endpoint. Hop-radius stepper, center highlight, live-refresh, dedicated error state when the center note is deleted
│   ├── GraphView.test.tsx — Unit tests for local-graph filtering/rendering behavior
│   ├── local-graph-utils.ts — filterToNeighborhood() — pure BFS filter of GraphData to a center node's N-hop neighborhood (undirected edges)
│   ├── local-graph-utils.test.ts — Unit tests for filterToNeighborhood
│   ├── graph-utils.ts    — Pure graph utility functions (truncateLabel, clampZoom, computeNodeSize, filterNodes)
│   ├── graph-config.ts   — GraphConfig interfaces + localStorage persistence (colors, layout, node toggles, localGraph.hops)
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
│   ├── context-panel/            — Built-in Outline/Links/Tags/Properties view components only (layout/orchestration now lives in `side-panel/` — see below; the former `ContextPanel.tsx`/`ContextPanelTabBar.tsx`/`SplitSectionContainer.tsx` orchestrator trio was replaced by the unified `side-panel/SidePanel.tsx`, since every built-in view can now live on either side panel)
│   │   ├── OutlineView.tsx       — Document heading hierarchy (navigable)
│   │   ├── OutlineView.test.tsx
│   │   ├── OutlineView.css
│   │   ├── LinksView.tsx         — Forward links, backlinks, and Ungelinkte_Erwähnungen (three sections: resolved/unresolved forward+back links; unlinked mentions found via search + filtered against extractWikilinks/resolveWikilinkTarget, with a "Verlinken" action per entry)
│   │   ├── LinksView.test.tsx
│   │   ├── LinksView.css
│   │   ├── TagsView.tsx          — Vault-wide tags with expand/collapse
│   │   ├── TagsView.test.tsx
│   │   ├── TagsView.css
│   │   ├── PropertiesView.tsx    — YAML frontmatter as key-value table (read-only, used when document is not editable)
│   │   ├── PropertiesView.test.tsx
│   │   ├── PropertiesView.css
│   │   ├── PropertiesEditor.tsx  — Interactive typed frontmatter editor (replaces PropertiesView when editable): type resolution (registry > well-known keys > inference), typed controls per property, add/delete/commit
│   │   ├── PropertiesEditor.css
│   │   ├── property-controls/   — Individual type-aware input controls for the Properties Editor
│   │   │   ├── index.ts          — Barrel export
│   │   │   ├── TextPropertyControl.tsx — Click-to-edit text input (Enter/Blur commit, Escape cancel)
│   │   │   ├── NumberPropertyControl.tsx — Numeric input with parseFloat validation
│   │   │   ├── DatePropertyControl.tsx — Native date/datetime-local picker
│   │   │   ├── CheckboxPropertyControl.tsx — Toggle for boolean values
│   │   │   ├── ListPropertyControl.tsx — Chip editor with add/remove and optional autocomplete suggestions
│   │   │   └── property-controls.css — Shared styles for all property controls
│   │   └── utils/
│   │       ├── extractHeadings.ts — Heading extraction from markdown
│   │       └── parseFrontmatter.ts — YAML frontmatter parsing
│   ├── side-panel/               — Unified left/right side-panel shell (layout only — document content lives in `context-panel/` + `documentPanelData.ts`)
│   │   ├── SidePanel.tsx         — Single shared implementation for both panels; `side` prop only selects which `PanelContext` instance, plugin view source, and CSS look applies — every built-in/plugin view can move freely between sides
│   │   ├── SidePanel.css
│   │   ├── PanelTabBar.tsx       — Tab bar with Drag & Drop reordering + split detection
│   │   ├── PanelTabBar.test.tsx
│   │   ├── PanelTabBar.css
│   │   ├── PanelSplitContainer.tsx — Vertically stacked split sections with resize handles, each with its own PanelTabBar
│   │   ├── PanelSplitContainer.css
│   │   └── utils/
│   │       ├── persistence.ts    — localStorage layout persistence, shared by both panels (caller-supplied storage-key prefix keeps left/right independent)
│   │       └── persistence.test.ts
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
│   │   ├── VaultConfigSection.tsx     — Per-vault config (templates dir, daily notes dir) + "Aktive Datei im Explorer verfolgen" checkbox (client-only `workspaceStore.explorerFollowActiveFile`, applies instantly, no save button — unlike the server-persisted fields in the same section)
│   │   ├── KeybindingsSection.tsx     — Configurable keyboard shortcuts (table, inline recording, conflict detection)
│   │   ├── AppearanceSection.tsx      — Display preferences: global status bar toggle + one toggle per built-in item (clock/vault name/word stats/cursor position), plus the embedded SnippetManager
│   │   ├── SnippetManager.tsx         — CSS snippet list (name/enabled toggle/size), upload (.css file), "create new" (opens SnippetEditorModal on an empty snippet), delete with ConfirmModal
│   │   ├── SnippetManager.css         — SnippetManager + SnippetEditorModal styles
│   │   ├── SnippetEditorModal.tsx     — Embedded snippet content editor (plain textarea — a small settings dialog, not the main document editor); loads on mount unless `initialContent` is already known (skips the round-trip for newly created snippets)
│   │   └── WelcomeVaultSection.tsx    — On-demand tutorial vault creation (button, loading state, toast)
│   ├── AdminUsersPage.tsx — User administration
│   ├── AdminVaultsPage.tsx — Admin: all vaults overview with delete
│   ├── AdminConfigPage.tsx — Server configuration (card-based layout)
│   ├── AdminAuditPage.tsx — Audit log viewer
│   ├── PluginManagementPage.tsx — Plugin list with activation toggle, compatibility, error display
│   ├── PluginUpload.tsx  — Plugin ZIP upload + detected plugins from .obsidian/plugins/
│   ├── VersionCheckCard.tsx — Admin version check (installed vs. latest, GitHub API, update notification)
│   ├── CommandPalette.tsx — Modal command palette (search, execute, keyboard nav, Ctrl+P always active)
│   ├── QuickSwitcher.tsx — Fuzzy-open-by-name modal (Ctrl+O), structurally mirrors CommandPalette.tsx (overlay, useFocusTrap, Arrow/Enter/Escape) and reuses its `.command-palette-*` CSS classes; sources candidates via `collectFilesSorted()`, ranks via `fuzzyMatch()`, shows `recentFilesStore.getRecent()` for an empty query, offers "create new file" when nothing matches
│   ├── CommandPaletteContainer.tsx — Built-in commands (navigation, vault ops, editor formatting, view toggles) + plugin commands, Ctrl+P shortcut, CustomEvent bridge to EditMode. Also owns QuickSwitcher's open state and the next/previous-tab keyboard shortcut (both need `commandRegistry`/`usePluginContext()`, only reachable from inside `<PluginProvider>` — see App.tsx note) and wires `app:go-back`/`app:go-forward`/`switcher:open` (previously no-ops in `core-commands-app.ts`) to `useNavigationHistory()`
│   ├── RealtimeProvider.tsx — SSE event routing (chat, presence, vault:change, plugin-settings:change, toast, server events)
│   ├── ToastNotification.tsx — Toast notification system (module-level state, CSS transitions). `showToast()` returns the toast's id; `updateToastMessage(id, msg)`/`dismissToast(id)` target that specific toast — the Obsidian `Notice` compat shim's `setMessage()`/`hide()` need this to affect the toast they actually created, not just fire another `showToast()` blind. `duration: 0` suppresses auto-dismiss (Notice's "stays until closed")
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
│   └── sidebar-panel/            — Built-in view components only, mounted by `side-panel/SidePanel.tsx` (the former `SidebarPanel.tsx`/`SidebarPanelTabBar.tsx`/`SidebarSplitContainer.tsx` orchestrator trio was replaced by the same unified `side-panel/` shell that absorbed `context-panel/`'s orchestrator — see above)
│       ├── RecentFilesView.tsx   — Recent files list view
│       ├── RecentFilesView.css   — Recent files styles
│       ├── FavoritesView.tsx     — Bookmarks list view: renders all 4 bookmark types (file/heading/block/search) with type-appropriate icon and click resolution; HTML5 drag-and-drop reorder; right-click/Shift+F10 context menu (remove, reveal in explorer via the shared `slatebase:reveal-file` window event, rename via InlineInput) — reuses the generic `ContextMenu.tsx` rather than a dedicated component
│       ├── FavoritesView.test.tsx
│       └── FavoritesView.css     — Bookmarks view styles (incl. drag-over/dragging state)
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
- `snippetRoutes.ts` — CSS snippet CRUD + registry (depends only on `ISnippetStore`); DELETE also prunes the snippet's registry entry
- `pluginStoreRoutes.ts` — community plugin marketplace: browse, install, update (per-vault and global mounts)
- `featureRoutes.ts` — feature toggles (admin + public)
- `versionRoutes.ts` — `GET /version` (public)
- `statisticsRoutes.ts` — vault statistics (file/folder count, total size)
- `trashRoutes.ts` — trash CRUD (list, restore, permanent delete)
- `fileVersionRoutes.ts` — file version management (list, get content, restore)
- `templateRoutes.ts` — template listing and creation
- `uploadRoutes.ts` — file upload (multipart, image paste mode)
- `preferencesRoutes.ts` — user preferences (recent files, bookmarks, keybindings)
- `vaultConfigRoutes.ts` — per-vault config (templates dir, daily notes dir, daily note template name)
- `welcomeVaultRoutes.ts` — `POST /welcome-vault` (on-demand tutorial vault creation)
- `proxyRoutes.ts` — `POST /proxy` (CORS-free HTTP proxy for plugin requestUrl, SSRF protection)
- `propertyTypeRoutes.ts` — property-type registry CRUD (GET/PUT per vault)
- `propertyRoutes.ts` — property metadata (keys, values, query) for Bases foundation
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
│   ├── property-types.json   — Per-vault property type registry (PropertyTypeEntry[], max 200 — declared types for frontmatter keys)
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
