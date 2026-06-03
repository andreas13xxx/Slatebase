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
│   └── middleware.ts     — authMiddleware, csrfMiddleware, rateLimitMiddleware
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
│   ├── graphRoutes.ts    — Graph API routes (GET graph, GET backlinks)
│   ├── client-ip.ts     — Centralized client IP extraction with trusted proxy support
│   ├── pluginRoutes.ts  — Plugin management CRUD routes (list, install, delete, bundle, styles, settings, registry)
│   └── vaultShareRoutes.ts — ShareController + share/transfer routes
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
├── link-index/
│   ├── index.ts              — Barrel export for link-index module
│   ├── types.ts              — ILinkIndex interface, GraphData, GraphNode, GraphEdge, ParsedWikilink
│   ├── wikilink-parser.ts    — Backend extractWikilinks() (code-block-aware, all formats)
│   ├── wikilink-parser.test.ts — Unit tests for parser
│   └── link-index-service.ts — LinkIndexService (rebuild, incremental updates, JSON persistence, queries)
├── plugin/
│   ├── index.ts              — Barrel export for plugin module
│   ├── types.ts              — IPluginStore, PluginManifest, PluginFiles, PluginRegistryData interfaces
│   ├── errors.ts             — PluginNotFoundError, PluginFileTooLargeError, PluginSettingsTooLargeError
│   ├── validation.ts         — Zod schemas (pluginManifestSchema, pluginRegistrySchema)
│   ├── plugin-store.ts       — PluginStore (filesystem persistence, atomic writes, per-vault per-plugin dirs)
│   ├── plugin-store.test.ts  — Unit tests for PluginStore
│   ├── plugin-installer.ts   — PluginInstaller (ZIP extraction, manifest validation, bundle integrity, version comparison)
│   └── plugin-installer.test.ts — Unit tests for PluginInstaller
├── import/index.ts       — ImportService (file/folder import logic)
└── integration.test.ts   — Integration tests
config/
└── default.json          — Default server configuration
data/
├── vaults.json           — Persistent vault registry
└── vaults/<id>/          — Vault storage directories (one per vault)
```

## Frontend (`frontend/`)

```
src/
├── main.tsx              — React entry point
├── App.tsx               — Root component, 3-panel layout, routing, resize
├── App.css               — Global styles (Design Tokens in index.css)
├── index.css             — CSS Custom Properties (Design Tokens, Dark Mode)
├── types.ts              — Shared TypeScript interfaces (VaultInfo, DirectoryTree, AppState with vaultTrees, etc.)
├── api/index.ts          — ApiClient (IApiClient interface + fetch implementation)
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
│       ├── compatibility-analyzer.ts — Static analysis of API usage (supported/partial/unsupported)
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
│   ├── tabActions.ts     — openTab, saveTab action creators
│   ├── chatState.ts      — Chat reducer + types (conversations, messages, unread)
│   ├── chatContext.ts    — ChatProvider + useChatContext hook
│   ├── chatActions.ts    — loadConversations, sendMessage, leaveConversation, etc.
│   ├── syncState.ts      — Sync reducer + types (config, log, conflicts, analysis)
│   ├── syncContext.ts    — SyncProvider + useSyncContext hook
│   ├── syncActions.ts    — loadSyncConfig, triggerSync, resolveConflict, etc.
│   ├── contextPanelState.ts — Context panel reducer + types (sections, views, outline, links, tags, properties)
│   ├── contextPanelContext.ts — ContextPanelProvider + useContextPanelContext hook
│   └── contextPanelActions.ts — loadOutline, loadForwardLinks, loadBacklinks, loadTags, loadProperties, expandTag
├── components/
│   ├── SlatebaseLogo.tsx — SVG logo component
│   ├── SidebarToolbar.tsx — Draggable vertical toolbar
│   ├── VaultList.tsx     — Vault selector/manager dropdown (legacy, no longer rendered in App.tsx)
│   ├── FileExplorer.tsx  — Unified multi-vault explorer (all vaults as expandable root entries, lazy-loading, DnD, context menu)
│   ├── TabBar.tsx        — Horizontal tab strip (file tabs)
│   ├── TabContent.tsx    — Tab content orchestrator (Edit/View/Binary)
│   ├── EditMode.tsx      — Plain-text editor with toolbar + auto-save + read-only mode
│   ├── ViewMode.tsx      — Markdown renderer (remark + highlight.js + Obsidian plugins)
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
│   ├── GraphView.tsx     — Knowledge graph SVG visualization (d3-force, zoom/pan/drag/search)
│   ├── graph-utils.ts    — Pure graph utility functions (truncateLabel, clampZoom, computeNodeSize, filterNodes)
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
│   ├── AdminUsersPage.tsx — User administration
│   ├── AdminVaultsPage.tsx — Admin: all vaults overview with delete
│   ├── AdminConfigPage.tsx — Server configuration (card-based layout)
│   ├── AdminAuditPage.tsx — Audit log viewer
│   ├── PluginManagementPage.tsx — Plugin list with activation toggle, compatibility, error display
│   ├── PluginUpload.tsx  — Plugin ZIP upload + detected plugins from .obsidian/plugins/
│   ├── CommandPalette.tsx — Modal command palette (search, execute, keyboard nav)
│   └── CommandPaletteContainer.tsx — Wires CommandPalette to PluginContext CommandRegistry
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

All routes are prefixed with `/api/v1`:

| Method | Path | Purpose |
|--------|------|---------|
| GET | /vaults | List vaults (filtered by user; ?all=true for admin) |
| POST | /vaults | Create a new vault |
| DELETE | /vaults/:vaultId | Delete a vault |
| GET | /vaults/:vaultId/tree | Get directory tree |
| GET | /vaults/:vaultId/files?path= | Get file content |
| PUT | /vaults/:vaultId/files | Save file content |
| POST | /vaults/:vaultId/import/file | Import single file |
| POST | /vaults/:vaultId/import/folder | Import folder |
| DELETE | /vaults/:vaultId/content?path= | Delete file/folder |
| POST | /auth/login | Authenticate user |
| POST | /auth/logout | End session |
| GET | /auth/sessions | List own sessions |
| DELETE | /auth/sessions/:sessionId | Invalidate session |
| DELETE | /auth/sessions | Invalidate all other sessions |
| GET | /users/search?q= | Search users by username prefix |
| GET | /users/me | Get own profile |
| PUT | /users/me | Update own profile |
| PUT | /users/me/password | Change own password |
| DELETE | /users/me | Delete own account |
| GET | /admin/users | List users (admin) |
| POST | /admin/users | Create user (admin) |
| DELETE | /admin/users/:userId | Delete user (admin) |
| PUT | /admin/users/:userId/role | Change role (admin) |
| PUT | /admin/users/:userId/password | Reset password (admin) |
| PUT | /admin/users/:userId/suspend | Suspend user (admin) |
| PUT | /admin/users/:userId/unsuspend | Unsuspend user (admin) |
| GET | /admin/config | Get server config (admin) |
| PUT | /admin/config | Update server config (admin) |
| POST | /admin/restart | Restart server (admin) |
| GET | /admin/audit | Get audit log (admin) |
| GET | /vaults/:vaultId/shares | List vault shares (owner) |
| POST | /vaults/:vaultId/shares | Create share (owner) |
| DELETE | /vaults/:vaultId/shares/:userId | Revoke share (owner) |
| PUT | /vaults/:vaultId/shares/:userId | Update permission (owner) |
| POST | /vaults/:vaultId/transfer | Transfer ownership (owner) |

### Chat

| Method | Path | Purpose |
|--------|------|---------|
| GET | /chat/conversations | List user's conversations (paginated) |
| POST | /chat/conversations | Create a new conversation |
| POST | /chat/conversations/:conversationId/leave | Leave a conversation |
| GET | /chat/conversations/:conversationId/messages | Get messages (paginated) |
| POST | /chat/conversations/:conversationId/messages | Send a message |
| GET | /chat/unread | Get global unread count |
| POST | /chat/conversations/:conversationId/read | Mark conversation as read |

### Sync

| Method | Path | Purpose |
|--------|------|---------|
| POST | /vaults/:vaultId/sync/config | Create sync configuration |
| GET | /vaults/:vaultId/sync/config | Get sync configuration |
| PUT | /vaults/:vaultId/sync/config | Update sync configuration |
| DELETE | /vaults/:vaultId/sync/config | Remove sync configuration |
| PUT | /vaults/:vaultId/sync/config/disable | Disable sync |
| PUT | /vaults/:vaultId/sync/config/enable | Enable sync |
| POST | /vaults/:vaultId/sync/trigger | Trigger manual sync |
| POST | /vaults/:vaultId/sync/analyze | Start analysis mode |
| GET | /vaults/:vaultId/sync/log | Get sync log (paginated) |
| GET | /vaults/:vaultId/sync/conflicts | Get open conflicts |
| POST | /vaults/:vaultId/sync/conflicts/:path/resolve | Resolve conflict |

### Graph & Context Panel

| Method | Path | Purpose |
|--------|------|---------|
| GET | /vaults/:vaultId/graph | Get full link graph (nodes + edges) |
| GET | /vaults/:vaultId/backlinks?path= | Get backlinks for a file |
| GET | /vaults/:vaultId/tags | Get all tags in the vault with file counts |

### MCP (Model Context Protocol)

| Method | Path | Auth | Purpose |
|--------|------|------|---------|
| POST/GET/DELETE | /api/v1/mcp | Bearer Token | MCP Streamable HTTP transport |
| GET | /api/v1/mcp/tokens | Session | List user's API tokens |
| POST | /api/v1/mcp/tokens | Session + CSRF | Create new API token |
| DELETE | /api/v1/mcp/tokens/:tokenId | Session + CSRF | Revoke a token |
| GET | /.well-known/mcp.json | None | MCP discovery metadata |

### Plugins

| Method | Path | Purpose |
|--------|------|---------|
| GET | /vaults/:vaultId/plugins | List installed plugins |
| POST | /vaults/:vaultId/plugins | Upload/install plugin (ZIP multipart) |
| GET | /vaults/:vaultId/plugins/registry | Load plugin registry state |
| PUT | /vaults/:vaultId/plugins/registry | Save plugin registry state |
| GET | /vaults/:vaultId/plugins/:pluginId | Get plugin details (manifest) |
| DELETE | /vaults/:vaultId/plugins/:pluginId | Uninstall plugin |
| GET | /vaults/:vaultId/plugins/:pluginId/bundle | Download plugin bundle (JS) |
| GET | /vaults/:vaultId/plugins/:pluginId/styles | Download plugin styles (CSS) |
| GET | /vaults/:vaultId/plugins/:pluginId/settings | Load plugin settings |
| PUT | /vaults/:vaultId/plugins/:pluginId/settings | Save plugin settings (max 1 MB) |

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
