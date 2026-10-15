// Shared MCP tool result builders

import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

/**
 * Creates an MCP error result for tool handlers.
 */
export function mcpToolError(code: number, message: string): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify({ code, message }) }],
    isError: true,
  }
}

/**
 * Creates a successful MCP tool result.
 */
export function mcpToolSuccess(data: unknown): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  }
}
