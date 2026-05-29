# Implementation Plan: MCP Context Server

## Overview

Implementierung des MCP Context Servers als eigenständiges Backend-Modul (`src/mcp/`). Der Server exponiert Vault-Inhalte über das Model Context Protocol (MCP) mit Streamable HTTP Transport, nutzt dedizierte API-Tokens für Authentifizierung und integriert sich in die bestehende Slatebase-Architektur (VaultService, VaultAccessControlService, AuditService).

Die Implementierung folgt dem bewährten Layered-Pattern: Types/Errors → TokenStore (Data) → McpTokenService (Business) → McpHandlers/McpServerFactory (Protocol) → mcpRoutes/mcpTokenRoutes (API).

## Tasks

- [x] 1. Set up MCP module structure, types, and error classes
  - [x] 1.1 Create MCP module directory and data model types
    - Create `backend/src/mcp/types.ts` with `TokenRecord`, `UserTokenIndex`, `ApiTokenInfo`, `TokenCreateResult`, `McpTokenContext`, `McpConfig` interfaces
    - Create `backend/src/mcp/errors.ts` with `McpAuthenticationError`, `TokenLimitError`, `TokenValidationError`, `McpRateLimitError`, `McpDisabledError`, `TokenNotFoundError` error classes
    - Create `backend/src/mcp/validation.ts` with Zod schemas for token creation input (name: 1–64 chars, expiryDays: 7–365) and tool parameters
    - _Requirements: 2.1, 2.5, 9.2, 9.3, 10.1_

  - [x] 1.2 Create MCP configuration loader
    - Add MCP config loading to `backend/src/mcp/types.ts` or a separate config helper
    - Read `SLATEBASE_MCP_ENABLED` (default: true), `SLATEBASE_MCP_MAX_FILE_SIZE` (default: from server config), `SLATEBASE_MCP_RATE_LIMIT` (default: 60)
    - Add `maxTokensPerUser: 10` as fixed config value
    - _Requirements: 10.1, 10.3, 10.5_

  - [x] 1.3 Install `@modelcontextprotocol/sdk` dependency
    - Add `@modelcontextprotocol/sdk` (pinned version) to `backend/package.json` dependencies
    - Run `npm install` to update `package-lock.json`
    - _Requirements: 1.2_

- [x] 2. Implement TokenStore (filesystem persistence with in-memory index)
  - [x] 2.1 Implement TokenStore class
    - Create `backend/src/mcp/token-store.ts` implementing `ITokenStore` interface
    - Implement `loadIndex()`: read all token JSON files from `data/mcp/tokens/`, build in-memory `Map<tokenHash, tokenId>` for non-revoked tokens, skip corrupted files with warning
    - Implement `create()`: atomic write of token JSON file + update user index (`_by-user/<userId>.json`)
    - Implement `findByHash()`: O(1) lookup in hashIndex Map, then load token file by ID
    - Implement `findById()`: read token JSON file from `data/mcp/tokens/<tokenId>.json`
    - Implement `getTokenIdsForUser()`: read user index file
    - Implement `update()`: atomic write (temp → rename) of token file
    - Implement `removeFromIndex()`: remove hash from in-memory Map
    - Implement `invalidateAllForUser()`: revoke all tokens for a user, update index
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7, 12.8_

  - [ ]* 2.2 Write unit tests for TokenStore
    - Test `loadIndex()` with valid, corrupted, and empty token directories
    - Test `create()` persists token file and updates user index atomically
    - Test `findByHash()` returns correct record or null
    - Test `findById()` returns correct record or null
    - Test `update()` performs atomic write
    - Test `removeFromIndex()` removes hash from Map
    - Test `invalidateAllForUser()` revokes all user tokens
    - _Requirements: 12.1, 12.3, 12.5, 12.6, 12.7_

  - [ ]* 2.3 Write property test for token persistence round-trip
    - **Property 20: Token persistence round-trip**
    - For any set of create/revoke operations, after reloading the index from disk, non-revoked tokens are findable by hash, revoked tokens are not, and per-user index is correct
    - **Validates: Requirements 12.1, 12.3, 12.5, 12.6**

  - [ ]* 2.4 Write property test for raw token never persisted
    - **Property 21: Raw token values are never persisted**
    - For any created token, the persisted JSON file contains only the SHA-256 hash, never the raw token value
    - **Validates: Requirements 12.2, 2.7**

- [x] 3. Implement McpTokenService (business logic)
  - [x] 3.1 Implement McpTokenService class
    - Create `backend/src/mcp/token-service.ts` implementing `IMcpTokenService` interface
    - Implement `createToken()`: validate name (1–64 chars, unique per user), check active token count ≤ 10, generate 128 hex char token via `crypto.randomBytes(64)`, compute SHA-256 hash, persist via TokenStore, log to AuditService
    - Implement `validateToken()`: compute hash, lookup in TokenStore, check not revoked and not expired, return `McpTokenContext`
    - Implement `listTokens()`: get user's token IDs, load records, map to `ApiTokenInfo` with masked token and status
    - Implement `revokeToken()`: verify ownership, mark as revoked, remove from index, log to AuditService
    - Implement `invalidateAllForUser()`: delegate to TokenStore
    - Implement `recordUsage()`: fire-and-forget update of `lastUsedAt`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 9.7, 9.8_

  - [ ]* 3.2 Write unit tests for McpTokenService
    - Test `createToken()` success path (valid name, under limit)
    - Test `createToken()` rejects duplicate name, exceeds limit, invalid expiry
    - Test `validateToken()` with valid, expired, revoked, and unknown tokens
    - Test `listTokens()` returns correct status for active/expired/revoked tokens
    - Test `revokeToken()` success and error paths (not found, wrong user)
    - Test `invalidateAllForUser()` revokes all tokens
    - Test `recordUsage()` updates lastUsedAt
    - _Requirements: 2.1, 2.3, 2.4, 2.5, 2.6, 2.7, 2.8, 2.9, 2.10, 9.1, 9.3, 9.4, 9.6_

  - [ ]* 3.3 Write property test for token creation format
    - **Property 3: Token creation produces correctly formatted tokens with persisted metadata**
    - For any valid name (1–64 chars) and expiryDays (7–365), generated token is exactly 128 hex chars, and listing includes correct metadata
    - **Validates: Requirements 2.1, 2.6, 9.1**

  - [ ]* 3.4 Write property test for invalid token rejection
    - **Property 2: Invalid tokens are always rejected with HTTP 401**
    - For any string that is not a valid, non-expired, non-revoked token, validateToken throws McpAuthenticationError
    - **Validates: Requirements 1.8, 2.3**

  - [ ]* 3.5 Write property test for revoked/expired token rejection
    - **Property 4: Revoked or expired tokens are rejected**
    - For any token that has been revoked or whose expiry has passed, validateToken throws
    - **Validates: Requirements 2.4, 2.10, 9.4**

  - [ ]* 3.6 Write property test for user invalidation
    - **Property 5: User invalidation events invalidate all user tokens**
    - For any user with N active tokens, after invalidateAllForUser, all N tokens are rejected
    - **Validates: Requirements 2.8, 2.9**

  - [ ]* 3.7 Write property test for token name validation
    - **Property 17: Token name validation rejects invalid names**
    - For any name that is empty, >64 chars, or duplicate, creation is rejected with specific error
    - **Validates: Requirements 9.3**

  - [ ]* 3.8 Write property test for token listing status
    - **Property 18: Token listing shows correct status**
    - For any token list, status is "active" if not revoked and not expired, "expired" if past expiresAt, "revoked" if revokedAt is set
    - **Validates: Requirements 9.6, 9.7**

- [x] 4. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Implement McpRateLimiter (sliding window per token)
  - [x] 5.1 Implement McpRateLimiter class
    - Create `backend/src/mcp/rate-limiter.ts` implementing `IMcpRateLimiter` interface
    - Implement sliding window algorithm: track timestamps per tokenId in a Map
    - `checkLimit()`: count requests in last 60 seconds, return `{ allowed, retryAfter }`
    - `recordRequest()`: add current timestamp to the window
    - `clear()`: remove all entries for a token
    - Automatic cleanup of old entries to prevent memory leaks
    - _Requirements: 10.5, 10.6_

  - [ ]* 5.2 Write unit tests for McpRateLimiter
    - Test allows requests under limit
    - Test blocks requests over limit with correct retryAfter
    - Test sliding window resets after time passes
    - Test `clear()` removes token entries
    - _Requirements: 10.5, 10.6_

  - [ ]* 5.3 Write property test for rate limiting enforcement
    - **Property 19: Rate limiting enforces the configured maximum**
    - For any token with limit N, sending N+1 requests within 60s results in rejection with correct retryAfter
    - **Validates: Requirements 10.6**

- [x] 6. Implement MCP Handlers (resources and tools)
  - [x] 6.1 Implement McpHandlers class — resource handlers
    - Create `backend/src/mcp/handlers.ts` implementing `IMcpHandlers` interface
    - Register `resources/list` handler: list accessible vaults via VaultAccessControlService
    - Register `resources/read` handler for `vault://<vaultId>/` (directory tree as JSON)
    - Register `resources/read` handler for `vault://<vaultId>/<path>` (file content)
    - Register `resources/templates/list` handler with URI template `vault://{vaultId}/{path}`
    - Implement path validation via `validateFilePath()`, binary detection, file size checks
    - Set MIME types: `.md` → `text/markdown`, others → `text/plain`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8, 4.9, 5.1, 5.2, 5.3, 5.4, 5.5_

  - [x] 6.2 Implement McpHandlers class — tool handlers
    - Register `list_vaults` tool: return accessible vaults with ID, name, permission, fileCount
    - Register `get_vault_structure` tool: return directory tree JSON for a vault
    - Register `search_vault` tool: case-insensitive text search with parameters validation (query 1–500 chars, maxResults 1–100), 30s timeout, skip binary/oversized files, max 1000 files, sort by hit count
    - Register `read_file` tool: read single file with path validation, binary detection, size check
    - All tools check vault access via VaultAccessControlService before execution
    - Return appropriate MCP error codes (-32001, -32002, -32003, -32004, -32602)
    - _Requirements: 3.1, 3.2, 3.3, 3.5, 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7, 6.8, 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7, 8.8_

  - [ ]* 6.3 Write unit tests for McpHandlers
    - Test `resources/list` returns only accessible vaults
    - Test `resources/read` for directory tree (root URI)
    - Test `resources/read` for file content (with correct MIME type)
    - Test `resources/read` rejects non-existent files, binary files, oversized files, path traversal
    - Test `list_vaults` returns correct metadata
    - Test `get_vault_structure` returns correct tree
    - Test `search_vault` with valid query, empty results, invalid params
    - Test `read_file` success and error paths
    - Test access control enforcement (unauthorized vault access → -32001)
    - _Requirements: 3.1, 3.3, 4.3, 4.5, 4.6, 4.9, 6.2, 6.5, 6.6, 8.4, 8.6, 8.7_

  - [ ]* 6.4 Write property test for vault access filtering
    - **Property 6: Vault access is correctly filtered by user permissions**
    - For any user, only owned/shared vaults are accessible; unauthorized access returns -32001
    - **Validates: Requirements 3.1, 3.3, 3.5, 4.1, 4.2, 7.2, 7.5**

  - [ ]* 6.5 Write property test for file read round-trip
    - **Property 8: File read round-trip preserves content**
    - For any text file in an accessible vault, reading returns exact UTF-8 content
    - **Validates: Requirements 4.3, 8.2**

  - [ ]* 6.6 Write property test for MIME type determination
    - **Property 9: MIME type is determined by file extension**
    - Files with `.md` get `text/markdown`, all others get `text/plain`
    - **Validates: Requirements 4.4**

  - [ ]* 6.7 Write property test for non-existent file error
    - **Property 10: Non-existent files produce error -32002**
    - For any path that doesn't exist, reading returns MCP error -32002
    - **Validates: Requirements 4.5, 8.6**

  - [ ]* 6.8 Write property test for binary file error
    - **Property 11: Binary files produce error -32003**
    - For any file with null bytes in first 8192 bytes, reading returns MCP error -32003
    - **Validates: Requirements 4.6, 8.7**

  - [ ]* 6.9 Write property test for path traversal rejection
    - **Property 12: Path traversal attempts produce appropriate errors**
    - For any path with `../`, null bytes, or absolute prefixes, request is rejected
    - **Validates: Requirements 4.9, 8.3, 8.4**

  - [ ]* 6.10 Write property test for directory tree structure
    - **Property 13: Directory tree structure is complete and correctly sorted**
    - Tree entries have name, type, path; files have size; sorted directories-first then case-insensitive alphabetically
    - **Validates: Requirements 5.1, 5.2, 7.4**

  - [ ]* 6.11 Write property test for search correctness
    - **Property 14: Search returns correct, complete, and sorted results**
    - Results include all matching text files, each with path/name/snippet, sorted by hit count
    - **Validates: Requirements 6.2, 6.3, 6.4**

  - [ ]* 6.12 Write property test for invalid search query rejection
    - **Property 15: Invalid search queries produce error -32602**
    - Empty, whitespace-only, or >500 char queries return -32602
    - **Validates: Requirements 6.6**

  - [ ]* 6.13 Write property test for binary/oversized file exclusion from search
    - **Property 16: Binary and oversized files are excluded from search**
    - Binary files and files >10 MB never appear in search results
    - **Validates: Requirements 6.7**

- [x] 7. Implement McpServerFactory
  - [x] 7.1 Implement McpServerFactory class
    - Create `backend/src/mcp/server-factory.ts` implementing `IMcpServerFactory` interface
    - Create and configure `McpServer` instance from `@modelcontextprotocol/sdk`
    - Set server name "slatebase-mcp", version from package.json, description "Knowledge-Context-Server for Markdown vaults"
    - Declare capabilities: `resources` (listChanged: false), `tools` (listChanged: false)
    - Register all handlers via `McpHandlers.register(server)`
    - _Requirements: 1.3, 11.1, 11.2_

  - [ ]* 7.2 Write unit tests for McpServerFactory
    - Test server is created with correct name, version, capabilities
    - Test handlers are registered on the server instance
    - _Requirements: 1.3, 11.1, 11.2_

- [x] 8. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 9. Implement MCP HTTP routes and token management routes
  - [x] 9.1 Implement mcpRoutes (Streamable HTTP transport endpoint)
    - Create `backend/src/api/mcpRoutes.ts`
    - Handle `POST /api/v1/mcp` (and GET/DELETE for SSE session management)
    - Extract Bearer token from Authorization header
    - Validate token via McpTokenService
    - Check rate limit via McpRateLimiter
    - Forward request to `StreamableHTTPServerTransport` (or `WebStandardStreamableHTTPServerTransport` for Hono)
    - Return HTTP 401 for invalid tokens, HTTP 429 for rate limit exceeded (with Retry-After header)
    - If MCP disabled: don't register routes
    - _Requirements: 1.1, 1.8, 2.2, 2.3, 10.2, 10.6, 10.7, 10.8_

  - [x] 9.2 Implement mcpTokenRoutes (token CRUD API)
    - Create `backend/src/api/mcpTokenRoutes.ts`
    - `GET /api/v1/mcp/tokens` — list user's tokens (session auth)
    - `POST /api/v1/mcp/tokens` — create new token (session auth + CSRF, validate with Zod)
    - `DELETE /api/v1/mcp/tokens/:tokenId` — revoke token (session auth + CSRF)
    - Return appropriate HTTP status codes (201 for create, 200 for list, 204 for revoke, 409 for limit)
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5, 9.8_

  - [x] 9.3 Implement `.well-known/mcp.json` endpoint
    - Add route for `GET /.well-known/mcp.json` (no auth required)
    - Return `{ endpoint: "/api/v1/mcp", authentication: { type: "bearer", token_url: "/api/v1/mcp/tokens" }, capabilities: ["resources", "tools"] }`
    - Return HTTP 404 if MCP is disabled
    - _Requirements: 11.3, 11.4, 11.5_

  - [ ]* 9.4 Write unit tests for mcpRoutes
    - Test token validation (valid, invalid, missing → 401)
    - Test rate limiting (over limit → 429 with Retry-After)
    - Test request forwarding to MCP SDK transport
    - Test MCP disabled behavior (no routes registered)
    - _Requirements: 1.1, 1.8, 2.2, 2.3, 10.2, 10.6_

  - [ ]* 9.5 Write unit tests for mcpTokenRoutes
    - Test list tokens (empty, with tokens)
    - Test create token (success, validation errors, limit reached)
    - Test revoke token (success, not found, already revoked)
    - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

  - [ ]* 9.6 Write property test for JSON-RPC error codes
    - **Property 1: Invalid MCP requests produce correct JSON-RPC error codes**
    - For invalid JSON → -32700, invalid structure → -32600, invalid params → -32602
    - **Validates: Requirements 1.5, 1.6, 1.7**

- [x] 10. Wire MCP module into Composition Root
  - [x] 10.1 Integrate MCP module in `backend/src/index.ts`
    - Load MCP config from environment
    - Conditionally initialize MCP module (if `mcpConfig.enabled`)
    - Create TokenStore, load index
    - Create McpTokenService, McpRateLimiter, McpHandlers, McpServerFactory
    - Create and register mcpRoutes and mcpTokenRoutes
    - Register `.well-known/mcp.json` endpoint
    - Hook into user deletion/suspension events: call `mcpTokenService.invalidateAllForUser()`
    - Log MCP initialization status
    - _Requirements: 1.1, 1.9, 2.8, 2.9, 10.1_

  - [x] 10.2 Create barrel export `backend/src/mcp/index.ts`
    - Export all interfaces, types, error classes, and factory functions
    - _Requirements: (structural)_

  - [x] 10.3 Update backend configuration
    - Add MCP config section to `backend/config/default.json`
    - Add `SLATEBASE_MCP_ENABLED`, `SLATEBASE_MCP_MAX_FILE_SIZE`, `SLATEBASE_MCP_RATE_LIMIT` to `.env.example`
    - _Requirements: 10.1, 10.3, 10.5_

- [x] 11. Checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 12. Integration testing
  - [ ]* 12.1 Write integration tests for MCP request flow
    - Test full request flow: token creation → MCP initialize → resource read → tool call
    - Test access control enforcement end-to-end
    - Test rate limiting end-to-end
    - Test token revocation immediately blocks access
    - Test MCP disabled mode rejects all requests
    - _Requirements: 1.1, 1.3, 1.8, 2.2, 2.4, 3.1, 3.4, 10.2, 10.6_

  - [ ]* 12.2 Write property test for read-only permission enforcement
    - **Property 7: Read-only permission blocks write operations**
    - For any vault with read-only permission, write operations are rejected with -32001
    - **Validates: Requirements 3.2**

- [x] 13. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The `@modelcontextprotocol/sdk` provides `McpServer` and `StreamableHTTPServerTransport` — use `WebStandardStreamableHTTPServerTransport` since Hono uses web-standard Request/Response
- All file persistence follows the atomic write pattern (temp → rename) used throughout Slatebase
- Token validation uses in-memory hash index for O(1) lookups (same pattern as SessionStore)

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3"] },
    { "id": 1, "tasks": ["2.1"] },
    { "id": 2, "tasks": ["2.2", "2.3", "2.4", "3.1", "5.1"] },
    { "id": 3, "tasks": ["3.2", "3.3", "3.4", "3.5", "3.6", "3.7", "3.8", "5.2", "5.3"] },
    { "id": 4, "tasks": ["6.1", "6.2"] },
    { "id": 5, "tasks": ["6.3", "6.4", "6.5", "6.6", "6.7", "6.8", "6.9", "6.10", "6.11", "6.12", "6.13", "7.1"] },
    { "id": 6, "tasks": ["7.2", "9.1", "9.2", "9.3"] },
    { "id": 7, "tasks": ["9.4", "9.5", "9.6", "10.1", "10.2", "10.3"] },
    { "id": 8, "tasks": ["12.1", "12.2"] }
  ]
}
```
