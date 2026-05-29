// MCP Server Factory — Creates and configures McpServer instances

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { McpHandlers } from './handlers.js'
import type { ToolHandlerDeps } from './tool-handlers.js'
import { registerToolHandlers } from './tool-handlers.js'
import type { ILogger } from '../logger/index.js'

// ─── Constants ───────────────────────────────────────────────────────────────

/** Server name advertised to MCP clients. */
const SERVER_NAME = 'slatebase-mcp'

/** Server version. */
const SERVER_VERSION = '1.0.0'

// ─── Interface ───────────────────────────────────────────────────────────────

/**
 * Creates and configures an McpServer instance with all handlers registered.
 * Separates server creation from HTTP transport wiring.
 * A new server is created per session/connection (stateless HTTP transport pattern).
 */
export interface IMcpServerFactory {
  /** Create a configured McpServer instance with all handlers registered. */
  createServer(): McpServer
}

// ─── Dependencies ────────────────────────────────────────────────────────────

/**
 * Dependencies required by the McpServerFactory.
 * Includes everything needed by both resource handlers and tool handlers.
 */
export interface McpServerFactoryDeps {
  /** MCP resource handlers instance. */
  handlers: McpHandlers
  /** Tool handler dependencies (vault service, access control, logger, config, getUserId). */
  toolHandlerDeps: ToolHandlerDeps
  /** Logger instance. */
  logger: ILogger
}

// ─── Implementation ──────────────────────────────────────────────────────────

/**
 * Factory that creates fully configured McpServer instances.
 * Each call to `createServer()` produces a new McpServer with all resource
 * and tool handlers registered, suitable for one session/connection.
 *
 * Server capabilities:
 * - resources (listChanged: false)
 * - tools (listChanged: false)
 */
export class McpServerFactory implements IMcpServerFactory {
  private readonly handlers: McpHandlers
  private readonly toolHandlerDeps: ToolHandlerDeps
  private readonly logger: ILogger

  constructor(deps: McpServerFactoryDeps) {
    this.handlers = deps.handlers
    this.toolHandlerDeps = deps.toolHandlerDeps
    this.logger = deps.logger
  }

  /**
   * Creates a new McpServer instance configured with:
   * - Server name "slatebase-mcp", version "1.0.0"
   * - Capabilities: resources (listChanged: false), tools (listChanged: false)
   * - All resource handlers registered via McpHandlers.register()
   * - All tool handlers registered via registerToolHandlers()
   */
  createServer(): McpServer {
    const server = new McpServer(
      {
        name: SERVER_NAME,
        version: SERVER_VERSION,
      },
      {
        capabilities: {
          resources: { listChanged: false },
          tools: { listChanged: false },
        },
        instructions: 'Knowledge-Context-Server for Markdown vaults',
      },
    )

    // Register resource handlers (vault directory trees, file reads)
    this.handlers.register(server)

    // Register tool handlers (list_vaults, get_vault_structure, search_vault, read_file)
    registerToolHandlers(server, this.toolHandlerDeps)

    this.logger.debug('McpServer instance created', { name: SERVER_NAME, version: SERVER_VERSION })

    return server
  }
}
