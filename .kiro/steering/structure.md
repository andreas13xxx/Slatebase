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
├── types.ts              — Shared TypeScript interfaces (VaultInfo, DirectoryTree, etc.)
├── api/index.ts          — ApiClient (IApiClient interface + fetch implementation)
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
│   └── syncActions.ts    — loadSyncConfig, triggerSync, resolveConflict, etc.
├── components/
│   ├── SlatebaseLogo.tsx — SVG logo component
│   ├── SidebarToolbar.tsx — Draggable vertical toolbar
│   ├── VaultList.tsx     — Vault selector/manager dropdown (with permission badges)
│   ├── FileExplorer.tsx  — Directory tree navigation (Lucide icons)
│   ├── TabBar.tsx        — Horizontal tab strip (file tabs)
│   ├── TabContent.tsx    — Tab content orchestrator (Edit/View/Binary)
│   ├── EditMode.tsx      — Plain-text editor with toolbar + auto-save + read-only mode
│   ├── ViewMode.tsx      — Markdown renderer (remark + highlight.js)
│   ├── BinaryViewer.tsx  — Binary file preview
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
│   ├── AdminUsersPage.tsx — User administration
│   ├── AdminVaultsPage.tsx — Admin: all vaults overview with delete
│   ├── AdminConfigPage.tsx — Server configuration (card-based layout)
│   └── AdminAuditPage.tsx — Audit log viewer
├── assets/               — Static images
└── test-setup.ts         — Vitest/Testing Library setup
```

## Architectural Patterns

- **Layered backend**: Config → Logger → Vault (data access) → Business → API (controller)
- **Composition root**: All dependencies wired in `backend/src/index.ts` (manual DI, no container)
- **Interface-driven**: Each layer exposes an `I*` interface (IVaultReader, IVaultService, ILogger, etc.)
- **Custom error classes**: Domain errors (VaultNotFoundError, PathTraversalError, etc.) mapped to HTTP status codes in the controller layer
- **Frontend state**: Single reducer with discriminated union actions, async action creators that call ApiClient then dispatch
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
