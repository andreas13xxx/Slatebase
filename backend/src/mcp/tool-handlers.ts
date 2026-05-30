// MCP Tool Handlers — list_vaults, get_vault_structure, search_vault, read_file

import fs from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'
import type { IVaultService, IVaultAccessControl } from '../business/index.js'
import { VaultNotFoundError, VaultAccessDeniedError } from '../business/index.js'
import type { DirectoryTree } from '../vault/index.js'
import { PathTraversalError, isBinaryContent } from '../vault/index.js'
import type { ILogger } from '../logger/index.js'
import type { McpConfig } from './config.js'

// ─── MCP Error Codes ─────────────────────────────────────────────────────────

const MCP_ERROR_ACCESS_DENIED = -32001
const MCP_ERROR_NOT_FOUND = -32002
const MCP_ERROR_BINARY_FILE = -32003
const MCP_ERROR_FILE_TOO_LARGE = -32004
const MCP_ERROR_INVALID_PARAMS = -32602

// ─── Helper: Count files recursively in a DirectoryTree ──────────────────────

/**
 * Recursively counts all file entries in a DirectoryTree.
 */
function countFiles(tree: DirectoryTree): number {
  if (tree.type === 'file') return 1
  let count = 0
  if (tree.children) {
    for (const child of tree.children) {
      count += countFiles(child)
    }
  }
  return count
}

// ─── Helper: Collect all file paths from a DirectoryTree ─────────────────────

/**
 * Collects all file relative paths from a DirectoryTree, sorted alphabetically.
 * Stops at maxFiles to prevent resource exhaustion.
 */
function collectFilePaths(tree: DirectoryTree, maxFiles: number): string[] {
  const paths: string[] = []
  collectFilePathsRecursive(tree, paths, maxFiles)
  paths.sort((a, b) => a.localeCompare(b))
  return paths.slice(0, maxFiles)
}

function collectFilePathsRecursive(node: DirectoryTree, paths: string[], maxFiles: number): void {
  if (paths.length >= maxFiles) return
  if (node.type === 'file') {
    paths.push(node.path)
    return
  }
  if (node.children) {
    for (const child of node.children) {
      if (paths.length >= maxFiles) return
      collectFilePathsRecursive(child, paths, maxFiles)
    }
  }
}

// ─── Helper: McpError for tool results ───────────────────────────────────────

/**
 * Creates an MCP error result for tool handlers.
 */
function mcpToolError(code: number, message: string): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify({ code, message }) }],
    isError: true,
  }
}

// ─── Helper: McpSuccess for tool results ─────────────────────────────────────

/**
 * Creates a successful MCP tool result.
 */
function mcpToolSuccess(data: unknown): CallToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(data, null, 2) }],
  }
}

// ─── Search result type ──────────────────────────────────────────────────────

interface SearchResult {
  path: string
  name: string
  snippet: string
  hitCount: number
}

// ─── Tool Registration ───────────────────────────────────────────────────────

/**
 * Dependencies required by the MCP tool handlers.
 */
export interface ToolHandlerDeps {
  vaultService: IVaultService
  vaultAccessControl: IVaultAccessControl
  logger: ILogger
  mcpConfig: McpConfig
  /** Returns the userId for the current MCP session. */
  getUserId: () => string
}

/**
 * Registers all MCP tool handlers on the given McpServer instance.
 * Tools: list_vaults, get_vault_structure, search_vault, read_file
 *
 * All tools check vault access via VaultAccessControlService before execution.
 * Returns appropriate MCP error codes on failure.
 */
export function registerToolHandlers(server: McpServer, deps: ToolHandlerDeps): void {
  registerListVaults(server, deps)
  registerGetVaultStructure(server, deps)
  registerSearchVault(server, deps)
  registerReadFile(server, deps)
}

// ─── list_vaults ─────────────────────────────────────────────────────────────

function registerListVaults(server: McpServer, deps: ToolHandlerDeps): void {
  server.tool(
    'list_vaults',
    'List all accessible vaults with ID, name, permission, and file count',
    async () => {
      try {
        const userId = deps.getUserId()
        const vaults = await deps.vaultService.getVaultList(userId)

        const results = await Promise.all(vaults.map(async (vault) => {
          let fileCount = 0
          try {
            const tree = await deps.vaultService.getVaultTree(vault.id)
            fileCount = countFiles(tree)
          } catch {
            // Vault tree not available — report 0 files
          }

          return {
            id: vault.id,
            name: vault.name,
            permission: vault.permission ?? 'owner',
            fileCount,
          }
        }))

        return mcpToolSuccess(results)
      } catch (error) {
        deps.logger.error('list_vaults failed', { error: error instanceof Error ? error.message : String(error) })
        return mcpToolError(MCP_ERROR_ACCESS_DENIED, 'Access denied')
      }
    },
  )
}

// ─── get_vault_structure ─────────────────────────────────────────────────────

function registerGetVaultStructure(server: McpServer, deps: ToolHandlerDeps): void {
  server.tool(
    'get_vault_structure',
    'Get the directory tree structure of a vault as JSON',
    {
      vaultId: z.string().min(1, 'vaultId is required'),
    },
    async (args) => {
      try {
        const userId = deps.getUserId()

        // Check access
        try {
          await deps.vaultAccessControl.checkReadAccess(args.vaultId, userId)
        } catch (error) {
          if (error instanceof VaultAccessDeniedError || error instanceof VaultNotFoundError) {
            return mcpToolError(MCP_ERROR_ACCESS_DENIED, 'Access denied')
          }
          throw error
        }

        // Get tree
        const tree = await deps.vaultService.getVaultTree(args.vaultId)
        return mcpToolSuccess(tree)
      } catch (error) {
        if (error instanceof VaultNotFoundError) {
          return mcpToolError(MCP_ERROR_ACCESS_DENIED, 'Access denied')
        }
        deps.logger.error('get_vault_structure failed', { error: error instanceof Error ? error.message : String(error) })
        return mcpToolError(MCP_ERROR_ACCESS_DENIED, 'Access denied')
      }
    },
  )
}

// ─── search_vault ────────────────────────────────────────────────────────────

const MAX_SEARCH_FILES = 1000
const MAX_FILE_SIZE_FOR_SEARCH = 10 * 1024 * 1024 // 10 MB
const SEARCH_TIMEOUT_MS = 30_000
const SNIPPET_LENGTH = 200

function registerSearchVault(server: McpServer, deps: ToolHandlerDeps): void {
  server.tool(
    'search_vault',
    'Search for text across all files in a vault (case-insensitive)',
    {
      vaultId: z.string().min(1, 'vaultId is required'),
      query: z.string()
        .min(1, 'Search query must not be empty')
        .max(500, 'Search query must not exceed 500 characters'),
      maxResults: z.number()
        .int('maxResults must be an integer')
        .min(1, 'maxResults must be at least 1')
        .max(100, 'maxResults must not exceed 100')
        .optional()
        .default(20),
    },
    async (args) => {
      try {
        const userId = deps.getUserId()

        // Validate query is not whitespace-only
        if (args.query.trim().length === 0) {
          return mcpToolError(MCP_ERROR_INVALID_PARAMS, 'Search query must not be empty or whitespace-only')
        }

        // Check access
        try {
          await deps.vaultAccessControl.checkReadAccess(args.vaultId, userId)
        } catch (error) {
          if (error instanceof VaultAccessDeniedError || error instanceof VaultNotFoundError) {
            return mcpToolError(MCP_ERROR_ACCESS_DENIED, 'Access denied')
          }
          throw error
        }

        // Get vault tree and resolve vault path
        let tree: DirectoryTree
        let vaultPath: string
        try {
          tree = await deps.vaultService.getVaultTree(args.vaultId)
          // Resolve vault path from the service
          vaultPath = deps.vaultService.resolveFilePath(args.vaultId, 'dummy')
          // resolveFilePath returns the resolved absolute path for 'dummy', so get the parent
          vaultPath = path.dirname(vaultPath)
        } catch (error) {
          if (error instanceof VaultNotFoundError) {
            return mcpToolError(MCP_ERROR_ACCESS_DENIED, 'Access denied')
          }
          throw error
        }

        // Collect file paths (max 1000, alphabetical)
        const filePaths = collectFilePaths(tree, MAX_SEARCH_FILES)

        // Perform search with timeout
        const results = await searchFiles(
          filePaths,
          vaultPath,
          args.query,
          args.maxResults,
          deps.logger,
        )

        return mcpToolSuccess(results.map(({ path: filePath, name, snippet }) => ({
          path: filePath,
          name,
          snippet,
        })))
      } catch (error) {
        if (error instanceof VaultNotFoundError) {
          return mcpToolError(MCP_ERROR_ACCESS_DENIED, 'Access denied')
        }
        deps.logger.error('search_vault failed', { error: error instanceof Error ? error.message : String(error) })
        return mcpToolError(MCP_ERROR_INVALID_PARAMS, 'Search failed')
      }
    },
  )
}

/**
 * Performs case-insensitive text search across files.
 * Skips binary files and files larger than 10 MB.
 * Aborts after 30 seconds.
 * Returns results sorted by hit count descending.
 */
async function searchFiles(
  filePaths: string[],
  vaultPath: string,
  query: string,
  maxResults: number,
  logger: ILogger,
): Promise<SearchResult[]> {
  const results: SearchResult[] = []
  const queryLower = query.toLowerCase()
  const startTime = Date.now()

  for (const relativePath of filePaths) {
    // Check timeout
    if (Date.now() - startTime > SEARCH_TIMEOUT_MS) {
      logger.warn('search_vault timeout reached', { scannedFiles: filePaths.indexOf(relativePath) })
      break
    }

    const absolutePath = path.join(vaultPath, relativePath)

    try {
      // Check file size
      const stat = await fs.stat(absolutePath)
      if (stat.size > MAX_FILE_SIZE_FOR_SEARCH) {
        continue // Skip oversized files
      }

      if (stat.size === 0) {
        continue // Skip empty files
      }

      // Read first 8192 bytes for binary detection
      const fileHandle = await fs.open(absolutePath, 'r')
      try {
        const sampleSize = Math.min(stat.size, 8192)
        const sampleBuffer = Buffer.alloc(sampleSize)
        await fileHandle.read(sampleBuffer, 0, sampleSize, 0)

        if (isBinaryContent(sampleBuffer)) {
          continue // Skip binary files
        }

        // Read full content for search
        const contentBuffer = Buffer.alloc(stat.size)
        await fileHandle.read(contentBuffer, 0, stat.size, 0)
        const content = contentBuffer.toString('utf-8')
        const contentLower = content.toLowerCase()

        // Count occurrences
        let hitCount = 0
        let firstMatchIndex = -1
        let searchIndex = 0

        while (searchIndex < contentLower.length) {
          const idx = contentLower.indexOf(queryLower, searchIndex)
          if (idx === -1) break
          hitCount++
          if (firstMatchIndex === -1) firstMatchIndex = idx
          searchIndex = idx + 1
        }

        if (hitCount > 0) {
          // Extract snippet (200 chars centered around first match)
          const snippetStart = Math.max(0, firstMatchIndex - Math.floor(SNIPPET_LENGTH / 2))
          const snippetEnd = Math.min(content.length, snippetStart + SNIPPET_LENGTH)
          const snippet = content.slice(snippetStart, snippetEnd)

          results.push({
            path: relativePath,
            name: path.basename(relativePath),
            snippet,
            hitCount,
          })
        }
      } finally {
        await fileHandle.close()
      }
    } catch {
      // Skip unreadable files (graceful degradation)
      continue
    }
  }

  // Sort by hit count descending
  results.sort((a, b) => b.hitCount - a.hitCount)

  // Return top maxResults
  return results.slice(0, maxResults)
}

// ─── read_file ───────────────────────────────────────────────────────────────

function registerReadFile(server: McpServer, deps: ToolHandlerDeps): void {
  server.tool(
    'read_file',
    'Read the content of a single file from a vault',
    {
      vaultId: z.string().min(1, 'vaultId is required'),
      path: z.string().min(1, 'File path is required'),
    },
    async (args) => {
      try {
        const userId = deps.getUserId()

        // Check access
        try {
          await deps.vaultAccessControl.checkReadAccess(args.vaultId, userId)
        } catch (error) {
          if (error instanceof VaultAccessDeniedError || error instanceof VaultNotFoundError) {
            return mcpToolError(MCP_ERROR_ACCESS_DENIED, 'Access denied')
          }
          throw error
        }

        // Validate file path (path traversal protection)
        let resolvedPath: string
        try {
          resolvedPath = deps.vaultService.resolveFilePath(args.vaultId, args.path)
        } catch (error) {
          if (error instanceof PathTraversalError) {
            return mcpToolError(MCP_ERROR_BINARY_FILE, 'Invalid file path')
          }
          if (error instanceof VaultNotFoundError) {
            return mcpToolError(MCP_ERROR_ACCESS_DENIED, 'Access denied')
          }
          throw error
        }

        // Check file exists
        let stat: Awaited<ReturnType<typeof fs.stat>>
        try {
          stat = await fs.stat(resolvedPath)
        } catch {
          return mcpToolError(MCP_ERROR_NOT_FOUND, 'Resource not found')
        }

        // Check file size
        if (stat.size > deps.mcpConfig.maxFileSize) {
          return mcpToolError(MCP_ERROR_FILE_TOO_LARGE, `File too large: ${stat.size} bytes (max: ${deps.mcpConfig.maxFileSize} bytes)`)
        }

        // Read file content
        const buffer = await fs.readFile(resolvedPath)

        // Binary detection
        if (isBinaryContent(buffer)) {
          return mcpToolError(MCP_ERROR_BINARY_FILE, 'Binary files not supported')
        }

        // Return text content
        const content = buffer.toString('utf-8')
        return {
          content: [{ type: 'text' as const, text: content }],
        } satisfies CallToolResult
      } catch (error) {
        if (error instanceof VaultNotFoundError) {
          return mcpToolError(MCP_ERROR_ACCESS_DENIED, 'Access denied')
        }
        deps.logger.error('read_file failed', { error: error instanceof Error ? error.message : String(error) })
        return mcpToolError(MCP_ERROR_NOT_FOUND, 'Resource not found')
      }
    },
  )
}
