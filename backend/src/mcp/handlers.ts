// MCP Handlers — Resource and Tool handler implementations

import fs from 'node:fs/promises'
import path from 'node:path'
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { RequestHandlerExtra } from '@modelcontextprotocol/sdk/shared/protocol.js'
import type { ServerRequest, ServerNotification } from '@modelcontextprotocol/sdk/types.js'
import type { McpConfig } from './config.js'
import type { ILogger } from '../logger/index.js'
import type { IVaultService, IVaultAccessControl } from '../business/index.js'
import { VaultNotFoundError, VaultAccessDeniedError } from '../business/index.js'
import { PathTraversalError, isBinaryContent } from '../vault/index.js'
import type { IVaultReader, DirectoryTree } from '../vault/index.js'

// ─── MCP Error Codes ─────────────────────────────────────────────────────────

/** Access denied — user does not have permission for this vault. */
const MCP_ERROR_ACCESS_DENIED = -32001
/** Resource not found — file or vault does not exist. */
const MCP_ERROR_NOT_FOUND = -32002
/** Binary file or invalid path — cannot serve binary content. */
const MCP_ERROR_BINARY_FILE = -32003
/** File too large — exceeds configured maxFileSize. */
const MCP_ERROR_FILE_TOO_LARGE = -32004

// ─── Interface ───────────────────────────────────────────────────────────────

/**
 * Registers MCP resources and tools on an McpServer instance.
 * Each handler delegates to existing Slatebase services.
 */
export interface IMcpHandlers {
  /** Register all resources and tools on the given McpServer. */
  register(server: McpServer): void
}

// ─── Helper Types ────────────────────────────────────────────────────────────

/** Dependencies injected into McpHandlers via constructor. */
export interface McpHandlersDeps {
  vaultService: IVaultService
  vaultAccessControl: IVaultAccessControl
  vaultReader: IVaultReader
  logger: ILogger
  mcpConfig: McpConfig
}

/** Shorthand for the extra parameter passed to MCP handler callbacks. */
type HandlerExtra = RequestHandlerExtra<ServerRequest, ServerNotification>

// ─── Implementation ──────────────────────────────────────────────────────────

/**
 * Implements MCP resource and tool handlers.
 * Delegates vault operations to existing Slatebase services while enforcing
 * access control, path validation, binary detection, and file size limits.
 */
export class McpHandlers implements IMcpHandlers {
  private readonly vaultService: IVaultService
  private readonly vaultAccessControl: IVaultAccessControl
  /** Used by tool handlers (Task 6.2). */
  readonly vaultReader: IVaultReader
  private readonly logger: ILogger
  private readonly mcpConfig: McpConfig

  constructor(deps: McpHandlersDeps) {
    this.vaultService = deps.vaultService
    this.vaultAccessControl = deps.vaultAccessControl
    this.vaultReader = deps.vaultReader
    this.logger = deps.logger
    this.mcpConfig = deps.mcpConfig
  }

  /**
   * Registers all MCP resource handlers on the given McpServer instance.
   * Tool handlers are registered separately in Task 6.2.
   */
  register(server: McpServer): void {
    this.registerResourceHandlers(server)
  }

  // ─── Resource Handlers ───────────────────────────────────────────────────

  /**
   * Registers the vault resource template with list and read callbacks.
   * URI pattern: vault://{vaultId}/{+path}
   * - vault://<vaultId>/ → directory tree as JSON
   * - vault://<vaultId>/<path> → file content as text
   */
  private registerResourceHandlers(server: McpServer): void {
    const template = new ResourceTemplate('vault://{vaultId}/{+path}', {
      list: async (extra) => {
        return await this.handleResourcesList(extra)
      },
    })

    server.resource(
      'vault',
      template,
      {
        description: 'Access vault files and directory structures',
        mimeType: 'text/plain',
      },
      async (uri, variables, extra) => {
        return await this.handleResourceRead(uri, variables, extra)
      },
    )
  }

  /**
   * Handles resources/list — returns all accessible vaults as resources.
   * Each vault is listed with its root URI for directory tree access.
   * Filters vaults by the authenticated user's permissions.
   */
  private async handleResourcesList(extra: HandlerExtra): Promise<{ resources: Array<{ uri: string; name: string; description?: string; mimeType?: string }> }> {
    const userId = this.extractUserId(extra)

    const vaults = await this.vaultService.getVaultList(userId)

    const resources = vaults.map((vault) => ({
      uri: `vault://${vault.id}/`,
      name: vault.name,
      description: `Vault: ${vault.name} (${vault.id})`,
      mimeType: 'application/json',
    }))

    this.logger.debug('MCP resources/list', { userId, vaultCount: resources.length })

    return { resources }
  }

  /**
   * Handles resources/read for both directory tree and file content.
   * - If path is empty or '/' → returns directory tree as JSON
   * - Otherwise → returns file content with appropriate MIME type
   */
  private async handleResourceRead(
    uri: URL,
    variables: Record<string, string | string[]>,
    extra: HandlerExtra,
  ): Promise<{ contents: Array<{ uri: string; text: string; mimeType?: string }> }> {
    const userId = this.extractUserId(extra)

    const vaultId = typeof variables['vaultId'] === 'string'
      ? variables['vaultId']
      : Array.isArray(variables['vaultId']) ? variables['vaultId'][0] : undefined

    const rawPath = typeof variables['path'] === 'string'
      ? variables['path']
      : Array.isArray(variables['path']) ? variables['path'][0] : undefined

    if (!vaultId) {
      throw new McpError(MCP_ERROR_NOT_FOUND, 'Missing vaultId in resource URI')
    }

    // Check access control
    try {
      await this.vaultAccessControl.checkReadAccess(vaultId, userId)
    } catch (error) {
      if (error instanceof VaultAccessDeniedError) {
        throw new McpError(MCP_ERROR_ACCESS_DENIED, 'Access denied')
      }
      throw new McpError(-32603, 'Internal error')
    }

    // Determine if this is a root/directory request or a file request
    const filePath = rawPath ?? ''
    const isRootRequest = filePath === '' || filePath === '/'

    if (isRootRequest) {
      return await this.handleDirectoryTreeRead(vaultId, uri.href)
    }

    return await this.handleFileRead(vaultId, filePath, uri.href)
  }

  /**
   * Returns the directory tree for a vault as JSON.
   * Assumes access control has already been checked.
   */
  private async handleDirectoryTreeRead(
    vaultId: string,
    uriString: string,
  ): Promise<{ contents: Array<{ uri: string; text: string; mimeType?: string }> }> {
    let tree: DirectoryTree
    try {
      tree = this.vaultService.getVaultTree(vaultId)
    } catch (error) {
      if (error instanceof VaultNotFoundError) {
        throw new McpError(MCP_ERROR_NOT_FOUND, `Vault not found: ${vaultId}`)
      }
      throw error
    }

    this.logger.debug('MCP resource read: directory tree', { vaultId })

    return {
      contents: [{
        uri: uriString,
        text: JSON.stringify(tree, null, 2),
        mimeType: 'application/json',
      }],
    }
  }

  /**
   * Returns file content for a specific path within a vault.
   * Validates path traversal, binary detection, and file size.
   * Assumes access control has already been checked.
   */
  private async handleFileRead(
    vaultId: string,
    filePath: string,
    uriString: string,
  ): Promise<{ contents: Array<{ uri: string; text: string; mimeType?: string }> }> {
    // Resolve vault path (validates path traversal)
    let resolvedPath: string
    try {
      resolvedPath = this.vaultService.resolveFilePath(vaultId, filePath)
    } catch (error) {
      if (error instanceof VaultNotFoundError) {
        throw new McpError(MCP_ERROR_NOT_FOUND, `Vault not found: ${vaultId}`)
      }
      if (error instanceof PathTraversalError) {
        throw new McpError(-32602, `Invalid file path: ${filePath}`)
      }
      throw error
    }

    // Check file existence
    let stat: Awaited<ReturnType<typeof fs.stat>>
    try {
      stat = await fs.stat(resolvedPath)
    } catch {
      throw new McpError(MCP_ERROR_NOT_FOUND, `File not found: ${filePath}`)
    }

    // File size check
    if (stat.size > this.mcpConfig.maxFileSize) {
      throw new McpError(
        MCP_ERROR_FILE_TOO_LARGE,
        `File too large: ${stat.size} bytes (max: ${this.mcpConfig.maxFileSize} bytes)`,
      )
    }

    // Binary detection: read first 8192 bytes
    const sampleSize = Math.min(stat.size, 8192)
    if (sampleSize > 0) {
      const fileHandle = await fs.open(resolvedPath, 'r')
      try {
        const buffer = Buffer.alloc(sampleSize)
        await fileHandle.read(buffer, 0, sampleSize, 0)
        if (isBinaryContent(buffer)) {
          throw new McpError(MCP_ERROR_BINARY_FILE, 'Binary files not supported')
        }
      } finally {
        await fileHandle.close()
      }
    }

    // Read full file content
    const content = await fs.readFile(resolvedPath, 'utf-8')

    // Determine MIME type
    const mimeType = getMimeType(filePath)

    this.logger.debug('MCP resource read: file', { vaultId, filePath, size: stat.size })

    return {
      contents: [{
        uri: uriString,
        text: content,
        mimeType,
      }],
    }
  }

  // ─── Utilities ─────────────────────────────────────────────────────────────

  /**
   * Extracts the userId from the MCP request handler extra context.
   * The userId is set by the transport layer (mcpRoutes) after token validation
   * and stored in authInfo.extra.userId.
   *
   * @throws McpError with -32001 if no userId is available
   */
  private extractUserId(extra: HandlerExtra): string {
    const userId = extra.authInfo?.extra?.['userId']
    if (typeof userId !== 'string' || userId === '') {
      throw new McpError(MCP_ERROR_ACCESS_DENIED, 'Access denied: no authenticated user')
    }
    return userId
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Determines the MIME type for a file based on its extension.
 * .md files get text/markdown, all others get text/plain.
 */
function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase()
  if (ext === '.md') {
    return 'text/markdown'
  }
  return 'text/plain'
}

/**
 * MCP protocol error with a numeric code and message.
 * Thrown from handlers to signal MCP-level errors to the client.
 */
export class McpError extends Error {
  constructor(
    public readonly code: number,
    message: string,
  ) {
    super(message)
    this.name = 'McpError'
  }
}
