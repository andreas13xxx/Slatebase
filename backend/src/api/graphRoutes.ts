// Graph Routes — Route module for knowledge graph API endpoints

import path from 'node:path'
import type { Context } from 'hono'
import { Hono } from 'hono'
import { z } from 'zod'
import type { ILinkIndex } from '../link-index/types.js'
import type { IVaultAccessControl } from '../business/index.js'
import { VaultAccessDeniedError } from '../business/index.js'
import type { IVaultRegistry } from '../vault/registry.js'
import type { IVaultReader, DirectoryTree } from '../vault/index.js'
import type { ILogger } from '../logger/index.js'
import type { SessionContext } from '../auth/index.js'
import type { RouteModule } from './index.js'

// --- Helper: API Error Response ---

interface ApiError {
  code: string
  message: string
  timestamp: string
}

/**
 * Creates a structured API error response object.
 */
function createApiError(code: string, message: string): ApiError {
  return {
    code,
    message,
    timestamp: new Date().toISOString(),
  }
}

// --- Zod Schemas ---

/**
 * Schema for the `path` query parameter on the backlinks endpoint.
 * Must be a non-empty string.
 */
const backlinkPathSchema = z.object({
  path: z.string().min(1, 'path query parameter must not be empty'),
})

// --- GraphRouteDependencies ---

/**
 * Dependencies required by the graph route module.
 */
export interface GraphRouteDependencies {
  /** Factory to get the ILinkIndex instance for a given vaultId. */
  getLinkIndex: (vaultId: string) => ILinkIndex | undefined
  accessControl: IVaultAccessControl
  vaultRegistry: IVaultRegistry
  vaultReader: IVaultReader
  logger: ILogger
}

// --- GraphRouteModule ---

/**
 * Route module for knowledge graph endpoints.
 * Registers routes under /vaults/:vaultId/graph and /vaults/:vaultId/backlinks.
 * Requires read or write permission on the vault.
 */
export class GraphRouteModule implements RouteModule {
  private readonly getLinkIndex: (vaultId: string) => ILinkIndex | undefined
  private readonly accessControl: IVaultAccessControl
  private readonly vaultRegistry: IVaultRegistry
  private readonly vaultReader: IVaultReader
  private readonly logger: ILogger

  constructor(deps: GraphRouteDependencies) {
    this.getLinkIndex = deps.getLinkIndex
    this.accessControl = deps.accessControl
    this.vaultRegistry = deps.vaultRegistry
    this.vaultReader = deps.vaultReader
    this.logger = deps.logger
  }

  /**
   * Registers graph routes on the provided Hono router.
   */
  register(router: Hono): void {
    router.get('/vaults/:vaultId/graph', (c) => this.getGraph(c))
    router.get('/vaults/:vaultId/backlinks', (c) => this.getBacklinks(c))
    router.get('/vaults/:vaultId/tags', (c) => this.getTags(c))
  }

  // ─── Route Handlers ──────────────────────────────────────────────────────

  /**
   * GET /vaults/:vaultId/graph
   * Returns the full graph structure (nodes + edges) for the vault.
   * Requires read or write permission. Triggers lazy-init if index not ready.
   * Returns empty graph for vaults without a link index (e.g. newly created vaults).
   */
  private async getGraph(c: Context): Promise<Response> {
    const vaultId = c.req.param('vaultId') as string

    const authResult = await this.checkAccess(c, vaultId)
    if (!authResult.authorized) {
      return authResult.response
    }

    const linkIndex = this.getLinkIndex(vaultId)
    if (linkIndex === undefined) {
      // Vault exists (checkAccess passed) but no link index yet (e.g. newly created empty vault).
      // Return an empty graph instead of 404.
      return c.json({ nodes: [], edges: [] }, 200)
    }

    // Lazy-init: if index not ready, trigger rebuild then respond
    if (!linkIndex.isReady()) {
      this.logger.info('Link index not ready, triggering rebuild', { vaultId })
      await linkIndex.rebuild()
    }

    const graphData = linkIndex.getGraph()
    return c.json(graphData, 200)
  }

  /**
   * GET /vaults/:vaultId/backlinks?path=<filePath>
   * Returns all files that link to the specified file path.
   * Requires read or write permission. Triggers lazy-init if index not ready.
   * Returns empty backlinks array for unknown file paths (200).
   */
  private async getBacklinks(c: Context): Promise<Response> {
    const vaultId = c.req.param('vaultId') as string

    const authResult = await this.checkAccess(c, vaultId)
    if (!authResult.authorized) {
      return authResult.response
    }

    // Validate path query parameter with Zod
    const rawPath = c.req.query('path')
    const parsed = backlinkPathSchema.safeParse({ path: rawPath })

    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0]
      const message = firstIssue ? firstIssue.message : 'Validation failed'
      const apiError = createApiError('INVALID_PATH', message)
      return c.json(apiError, 400)
    }

    const filePath = parsed.data.path

    const linkIndex = this.getLinkIndex(vaultId)
    if (linkIndex === undefined) {
      // Vault exists (checkAccess passed) but no link index yet — return empty backlinks.
      return c.json({ path: filePath, backlinks: [] }, 200)
    }

    // Lazy-init: if index not ready, trigger rebuild then respond
    if (!linkIndex.isReady()) {
      this.logger.info('Link index not ready, triggering rebuild', { vaultId })
      await linkIndex.rebuild()
    }

    // Returns empty array for unknown file paths (Requirement 3.7)
    const backlinks = linkIndex.getBacklinks(filePath)

    return c.json({ path: filePath, backlinks }, 200)
  }

  /**
   * GET /vaults/:vaultId/tags
   * Returns all tags found across all text files in the vault.
   * Each tag includes its name, the count of distinct files containing it,
   * and the list of file paths where it appears.
   * Requires read or write permission.
   * Skips unreadable files without error (logs warning).
   * Returns empty array for vaults with no tags.
   */
  private async getTags(c: Context): Promise<Response> {
    const vaultId = c.req.param('vaultId') as string

    const authResult = await this.checkAccess(c, vaultId)
    if (!authResult.authorized) {
      return authResult.response
    }

    // Get vault storage path from registry
    const entry = this.vaultRegistry.findById(vaultId)
    if (entry === null) {
      const apiError = createApiError('VAULT_NOT_FOUND', `Vault not found: ${vaultId}`)
      return c.json(apiError, 404)
    }

    const vaultPath = entry.storagePath

    // Read the vault tree to find all files
    let tree: DirectoryTree
    try {
      tree = await this.vaultReader.readDirectory(vaultPath, 50)
    } catch {
      const apiError = createApiError('VAULT_NOT_FOUND', `Vault not found: ${vaultId}`)
      return c.json(apiError, 404)
    }

    // Collect all file paths from the tree
    const filePaths = collectFilePaths(tree)

    // Extract tags from all text files
    const tagMap = new Map<string, Set<string>>()

    for (const filePath of filePaths) {
      // Only process text files (markdown, txt, etc.)
      if (!isTextFile(filePath)) continue

      try {
        const absolutePath = path.join(vaultPath, filePath)
        const fileContent = await this.vaultReader.readFile(absolutePath, 10 * 1024 * 1024)

        if (fileContent.isBinary) continue

        const tags = extractTagsFromContent(fileContent.content)
        for (const tag of tags) {
          const existing = tagMap.get(tag)
          if (existing) {
            existing.add(filePath)
          } else {
            tagMap.set(tag, new Set([filePath]))
          }
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error)
        this.logger.warn('Failed to read file for tag extraction', { vaultId, filePath, error: message })
        // Skip unreadable files without error (Requirement 4.8)
      }
    }

    // Build response
    const tags = Array.from(tagMap.entries()).map(([name, files]) => ({
      name,
      count: files.size,
      files: Array.from(files),
    }))

    return c.json({ tags }, 200)
  }

  // ─── Private Helpers ─────────────────────────────────────────────────────

  /**
   * Checks authentication and vault access (read or write permission).
   * Returns 401 if no session, 404 if vault not found, 403 if access denied.
   */
  private async checkAccess(
    c: Context,
    vaultId: string,
  ): Promise<{ authorized: true } | { authorized: false; response: Response }> {
    const session = c.get('session') as SessionContext | undefined
    if (session === undefined) {
      const error = createApiError('UNAUTHORIZED', 'Missing session context')
      return { authorized: false, response: c.json(error, 401) }
    }

    // Check vault existence
    const entry = this.vaultRegistry.findById(vaultId)
    if (entry === null) {
      const error = createApiError('VAULT_NOT_FOUND', `Vault not found: ${vaultId}`)
      return { authorized: false, response: c.json(error, 404) }
    }

    // Check read access (read or write permission satisfies this)
    try {
      await this.accessControl.checkReadAccess(vaultId, session.userId)
    } catch (error) {
      if (error instanceof VaultAccessDeniedError) {
        const apiError = createApiError('FORBIDDEN', error.message)
        return { authorized: false, response: c.json(apiError, 403) }
      }
      throw error
    }

    return { authorized: true }
  }
}

// --- Factory Function ---

/**
 * Creates a GraphRouteModule instance with the provided dependencies.
 * This is the primary entry point for wiring graph routes into the application.
 */
export function createGraphRoutes(deps: GraphRouteDependencies): GraphRouteModule {
  return new GraphRouteModule(deps)
}

// --- Tag Extraction Helpers ---

/** File extensions considered as text files for tag extraction. */
const TEXT_EXTENSIONS = new Set([
  '.md', '.txt', '.svg', '.html', '.csv', '.css', '.js', '.xml', '.canvas',
])

/**
 * Determines if a file path refers to a text file based on its extension.
 */
function isTextFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase()
  return TEXT_EXTENSIONS.has(ext)
}

/**
 * Recursively collects all file paths from a DirectoryTree.
 * Returns relative paths from the vault root.
 */
function collectFilePaths(tree: DirectoryTree): string[] {
  const paths: string[] = []

  function walk(node: DirectoryTree): void {
    if (node.type === 'file') {
      paths.push(node.path)
    } else if (node.children) {
      for (const child of node.children) {
        walk(child)
      }
    }
  }

  walk(tree)
  return paths
}

/**
 * Extracts tags from markdown/text content.
 * Tags match `#` followed by letters, digits, underscores, hyphens, and slashes.
 * Excludes tags inside fenced code blocks (``` ... ```) and inline code (` ... `).
 */
export function extractTagsFromContent(content: string): Set<string> {
  const tags = new Set<string>()

  // Remove fenced code blocks (``` ... ```)
  const withoutFencedCode = content.replace(/^```[^\n]*\n[\s\S]*?^```/gm, '')

  // Remove inline code (` ... `)
  const withoutCode = withoutFencedCode.replace(/`[^`]*`/g, '')

  // Match tags: # followed by letters, digits, underscores, hyphens, slashes
  // Must not be preceded by a word character (to avoid matching e.g. "C#")
  const tagRegex = /(?<![a-zA-Z0-9])#([a-zA-Z\u00C0-\u024F\u1E00-\u1EFF][a-zA-Z0-9\u00C0-\u024F\u1E00-\u1EFF_\-/]*)/g

  let match: RegExpExecArray | null
  while ((match = tagRegex.exec(withoutCode)) !== null) {
    const tagName = match[1]
    if (tagName !== undefined) {
      tags.add(tagName)
    }
  }

  return tags
}
