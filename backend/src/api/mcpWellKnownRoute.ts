/**
 * MCP well-known discovery endpoint.
 * Provides MCP server metadata at `/.well-known/mcp.json` for client auto-discovery.
 * No authentication required — publicly accessible.
 */

import type { Context } from 'hono'
import type { McpConfig } from '../mcp/config.js'

/**
 * MCP discovery metadata response shape.
 */
export interface McpDiscoveryResponse {
  endpoint: string
  authentication: {
    type: string
    token_url: string
  }
  capabilities: string[]
}

/**
 * Creates a handler for `GET /.well-known/mcp.json`.
 * Returns MCP server discovery metadata or HTTP 404 if MCP is disabled.
 *
 * @param mcpConfig - The MCP configuration (used to check enabled state)
 * @returns Hono route handler
 */
export function createMcpWellKnownHandler(mcpConfig: McpConfig): (c: Context) => Response {
  return (c: Context): Response => {
    if (!mcpConfig.enabled) {
      return c.json({ code: 'NOT_FOUND', message: 'Not found', timestamp: new Date().toISOString() }, 404)
    }

    const response: McpDiscoveryResponse = {
      endpoint: '/api/v1/mcp',
      authentication: {
        type: 'bearer',
        token_url: '/api/v1/mcp/tokens',
      },
      capabilities: ['resources', 'tools'],
    }

    return c.json(response, 200)
  }
}
