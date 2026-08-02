---
tags: [advanced]
---

# MCP Context Server

> [!warning] Experimental Feature
> The MCP Context Server is experimental. It must be enabled by an admin via Feature Toggles.

The Model Context Protocol (MCP) allows AI assistants to read from and write to your Slatebase vaults — turning your knowledge base into context for AI conversations.

---

## What is MCP?

MCP is a standard protocol that lets AI clients (like Claude, Cursor, etc.) interact with external data sources. Slatebase implements an MCP server that exposes your vault content as resources and tools.

---

## Available Tools

When an AI client connects to Slatebase's MCP server, it can:

| Tool | Description |
|------|-------------|
| `list_vaults` | List all vaults the token has access to |
| `get_vault_structure` | Get the file tree of a vault |
| `search_vault` | Full-text search within a vault |
| `read_file` | Read the content of a file |
| `write_file` | Create or update a file |
| `create_directory` | Create a folder |
| `delete_file` | Delete a file |
| `move_file` | Move or rename a file |
| `rename_file` | Rename a file |

---

## Creating an API Token

1. Go to **Settings → MCP Tokens** (or via Command Palette)
2. Click **Create Token**
3. Enter a descriptive name (e.g., "Claude Desktop")
4. Copy the token — **it's only shown once!**
5. The token appears in your token list

### Token Limits

- Maximum 10 tokens per user
- Rate limit: 60 requests per minute per token
- Tokens can be revoked at any time

---

## Configuring AI Clients

### General Configuration

AI clients need:
- **Server URL:** `https://your-slatebase.com/api/v1/mcp`
- **Transport:** Streamable HTTP
- **Authentication:** Bearer token (your API token)

### Discovery Endpoint

Slatebase provides a discovery endpoint at:
```
https://your-slatebase.com/.well-known/mcp.json
```

Some AI clients can auto-configure from this URL.

---

## Security Considerations

> [!danger] Token Security
> - Tokens grant access to your vaults — treat them like passwords
> - Revoke tokens you no longer use
> - Write access lets the AI modify your files
> - Use separate tokens for different AI clients

---

## Use Cases

- **Research assistant** — AI reads your notes for context when answering questions
- **Writing helper** — AI accesses your style guides and templates
- **Knowledge synthesis** — AI connects information across your vault
- **Automated organization** — AI helps tag, categorize, or restructure notes

---

> [!tip] Start Read-Only
> When first connecting an AI client, consider creating a read-only token (by configuring access appropriately). Once you trust the integration, enable write access.

> [!todo] Exercise
> 1. Go to Settings → MCP Tokens
> 2. Create a test token
> 3. Note the server URL from the settings
> 4. (Optional) Configure your AI client with the token
> 5. Revoke the test token when done

---

## Related Features

- [[Features/Settings]] — Token management in settings
- [[Features/Search and Replace]] — Search via MCP
- [[Features/Vault Management]] — Vault access control
