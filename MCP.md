# Slatebase — MCP (Model Context Protocol) Integration

Slatebase includes a built-in [MCP](https://modelcontextprotocol.io/) server that allows AI assistants like Claude, Cursor, or Continue to access your vault contents as context — both reading and writing.

## How it works

1. **Create an API token** via the Slatebase web UI (Profile → MCP Tokens) or the API
2. **Configure your MCP client** to connect to your Slatebase instance
3. **AI assistants can now** list vaults, read files, search content, browse structures, and create/edit/delete/move files

## Setup

### 1. Create an API Token

**Via the Web UI:** Go to Profile → MCP Tokens → Create Token.

**Via the API:**

```bash
curl -X POST http://localhost:3000/api/v1/mcp/tokens \
  -H "Content-Type: application/json" \
  -H "X-CSRF-Token: <your-csrf-token>" \
  -H "Cookie: session=<your-session-token>" \
  -d '{"name": "Claude Desktop", "expiryDays": 90}'
```

Response:
```json
{ "token": "abc123...def456", "tokenId": "...", "expiresAt": "..." }
```

> ⚠️ Save the token immediately — it's shown only once!

### 2. Configure your MCP Client

**Claude Desktop** (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "slatebase": {
      "url": "http://localhost:3000/api/v1/mcp",
      "headers": {
        "Authorization": "Bearer <your-api-token>"
      }
    }
  }
}
```

**Cursor / Continue** (or any MCP-compatible client):

Use the Streamable HTTP transport with `http://your-server:3000/api/v1/mcp` and a Bearer token in the Authorization header.

**Auto-discovery:** Clients that support MCP discovery can use:
```
GET http://your-server:3000/.well-known/mcp.json
```

## Available Tools

| Tool | Access | Description |
|------|--------|-------------|
| `list_vaults` | Read | List all vaults you have access to (with name, permission, file count) |
| `get_vault_structure` | Read | Get the directory tree of a vault as JSON |
| `search_vault` | Read | Full-text search across all files in a vault |
| `read_file` | Read | Read the content of a specific file |
| `write_file` | Write | Create or overwrite a text file (supports ETag conflict detection) |
| `create_directory` | Write | Create a directory (with intermediate directories) |
| `delete_file` | Write | Delete a file or folder recursively |
| `move_file` | Write | Move a file or folder to a new location (rewrites wikilinks elsewhere in the vault that pointed at the old path — see below) |
| `rename_file` | Write | Rename a file or folder, stays in same directory (rewrites wikilinks elsewhere in the vault that pointed at the old path — see below) |

**Link migration on move/rename:** `move_file` and `rename_file` rewrite every wikilink in *other* files that pointed at the old path — including bare-name links (`[[Note]]`) to a file in a subfolder, and every descendant file when a whole folder is moved — the same behavior as moving/renaming through the web UI or REST API. This runs synchronously before the tool call returns. If rewriting fails for some of the affected files, the move/rename itself still succeeds and the result includes an additional `linkMigrationWarnings` field: `[{ "path": "...", "reason": "..." }, ...]`.

**Realtime push:** Every write tool (`write_file`, `create_directory`, `delete_file`, `move_file`, `rename_file`) publishes a `vault:change` event on success, same as the web UI and REST API. All open sessions with access to the vault are notified — including the calling user's own browser tabs, since an MCP write bypasses them entirely and has no local state to already reflect the change.

## Available Resources

| URI Pattern | Description |
|-------------|-------------|
| `vault://<vaultId>/` | Directory tree as JSON |
| `vault://<vaultId>/<path>` | File content (`text/markdown` for `.md`, `text/plain` for others) |

## Token Management

- Each user can have up to **10 active tokens**
- Tokens expire after the configured period (7–365 days, default: 90)
- Tokens can be revoked immediately via the web UI or API
- Token usage is logged (last used timestamp visible in token list)
- Tokens are automatically invalidated when a user is deleted or suspended

## Configuration

| Variable | Default | Description |
|----------|---------|-------------|
| `SLATEBASE_FEATURE_MCP` | `true` | Enable/disable the MCP server (overrides the `mcp` feature toggle) |
| `SLATEBASE_MCP_MAX_FILE_SIZE` | `5242880` | Max file size for MCP reads (5 MB) |
| `SLATEBASE_MCP_RATE_LIMIT` | `60` | Max requests per minute per token |

MCP is controlled by the `mcp` feature toggle, a `cold` toggle (requires a server restart to take effect). Set `SLATEBASE_FEATURE_MCP=false` to completely disable the MCP server (no routes registered, `.well-known/mcp.json` returns 404).

## Security

- Tokens are stored as **SHA-256 hashes** — the raw value is never persisted
- Each token is scoped to the creating user's vault permissions (read-only shares = read-only MCP access)
- **Rate limiting** prevents abuse (HTTP 429 with `Retry-After` header)
- All MCP access is logged in the **audit trail**
- Path traversal protection on all file operations
- Write tools check `checkWriteAccess()` — read-only shares cannot write via MCP

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST/GET/DELETE | `/api/v1/mcp` | Bearer Token | MCP Streamable HTTP transport |
| GET | `/api/v1/mcp/tokens` | Session | List user's API tokens |
| POST | `/api/v1/mcp/tokens` | Session + CSRF | Create new API token |
| DELETE | `/api/v1/mcp/tokens/:tokenId` | Session + CSRF | Revoke a token |
| GET | `/.well-known/mcp.json` | None | MCP discovery metadata |
