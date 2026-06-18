// Graph Routes — Route module for knowledge graph API endpoints

import type { Context } from 'hono'
import { Hono } from 'hono'
import { z } from 'zod'
import type { ILinkIndex } from '../link-index/types.js'
import type { IVaultAccessControl } from '../business/index.js'
import { VaultAccessDeniedError } from '../business/index.js'
import type { IVaultRegistry } from '../vault/registry.js'
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

/**
 * Schema for GET /graph query parameters.
 */
const graphQuerySchema = z.object({
  includeTags: z.enum(['true', 'false']).optional(),
  includeProperties: z.string().optional(),
}).strict().catch({ includeTags: undefined, includeProperties: undefined })

// --- GraphRouteDependencies ---

/**
 * Dependencies required by the graph route module.
 */
export interface GraphRouteDependencies {
  /** Factory to get the ILinkIndex instance for a given vaultId. */
  getLinkIndex: (vaultId: string) => ILinkIndex | undefined
  accessControl: IVaultAccessControl
  vaultRegistry: IVaultRegistry
  logger: ILogger
}

// --- GraphRouteModule ---

/**
 * Route module for knowledge graph endpoints.
 * Registers routes under /vaults/:vaultId/graph, /vaults/:vaultId/graph/meta,
 * /vaults/:vaultId/backlinks, and /vaults/:vaultId/tags.
 * Requires read or write permission on the vault.
 */
export class GraphRouteModule implements RouteModule {
  private readonly getLinkIndex: (vaultId: string) => ILinkIndex | undefined
  private readonly accessControl: IVaultAccessControl
  private readonly vaultRegistry: IVaultRegistry
  private readonly logger: ILogger

  constructor(deps: GraphRouteDependencies) {
    this.getLinkIndex = deps.getLinkIndex
    this.accessControl = deps.accessControl
    this.vaultRegistry = deps.vaultRegistry
    this.logger = deps.logger
  }

  /**
   * Registers graph routes on the provided Hono router.
   */
  register(router: Hono): void {
    router.get('/vaults/:vaultId/graph', (c) => this.getGraph(c))
    router.get('/vaults/:vaultId/graph/meta', (c) => this.getGraphMeta(c))
    router.get('/vaults/:vaultId/backlinks', (c) => this.getBacklinks(c))
    router.get('/vaults/:vaultId/tags', (c) => this.getTags(c))
  }

  // ─── Route Handlers ──────────────────────────────────────────────────────

  /**
   * GET /vaults/:vaultId/graph
   * Returns the full graph structure (nodes + edges) for the vault.
   * Supports optional query parameters:
   * - `includeTags=true` — include tag nodes and edges
   * - `includeProperties=key1,key2` — include property nodes for specific keys
   * Requires read or write permission. Triggers lazy-init if index not ready.
   * Returns empty graph for vaults without a link index.
   */
  private async getGraph(c: Context): Promise<Response> {
    const vaultId = c.req.param('vaultId') as string

    const authResult = await this.checkAccess(c, vaultId)
    if (!authResult.authorized) {
      return authResult.response
    }

    const linkIndex = this.getLinkIndex(vaultId)
    if (linkIndex === undefined) {
      return c.json({ nodes: [], edges: [] }, 200)
    }

    // Lazy-init: if index not ready, trigger rebuild then respond
    if (!linkIndex.isReady()) {
      this.logger.info('Link index not ready, triggering rebuild', { vaultId })
      await linkIndex.rebuild()
    }

    // Parse query parameters (invalid values are silently ignored via .catch())
    const rawQuery = {
      includeTags: c.req.query('includeTags'),
      includeProperties: c.req.query('includeProperties'),
    }
    const parsed = graphQuerySchema.parse(rawQuery)

    const options = {
      includeTags: parsed.includeTags === 'true',
      includePropertyKeys: parsed.includeProperties
        ? parsed.includeProperties.split(',').map((s) => s.trim()).filter((s) => s.length > 0)
        : undefined,
    }

    const graphData = linkIndex.getGraph(options)
    return c.json(graphData, 200)
  }

  /**
   * GET /vaults/:vaultId/graph/meta
   * Returns aggregated metadata (tags with counts, property keys with counts).
   * Useful for populating the graph settings panel.
   * Requires read or write permission. Triggers lazy-init if index not ready.
   */
  private async getGraphMeta(c: Context): Promise<Response> {
    const vaultId = c.req.param('vaultId') as string

    const authResult = await this.checkAccess(c, vaultId)
    if (!authResult.authorized) {
      return authResult.response
    }

    const linkIndex = this.getLinkIndex(vaultId)
    if (linkIndex === undefined) {
      return c.json({ tags: [], propertyKeys: [] }, 200)
    }

    if (!linkIndex.isReady()) {
      this.logger.info('Link index not ready, triggering rebuild', { vaultId })
      await linkIndex.rebuild()
    }

    const meta = linkIndex.getGraphMeta()
    return c.json(meta, 200)
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
      return c.json({ path: filePath, backlinks: [] }, 200)
    }

    if (!linkIndex.isReady()) {
      this.logger.info('Link index not ready, triggering rebuild', { vaultId })
      await linkIndex.rebuild()
    }

    const backlinks = linkIndex.getBacklinks(filePath)
    return c.json({ path: filePath, backlinks }, 200)
  }

  /**
   * GET /vaults/:vaultId/tags
   * Returns all tags found across all files in the vault.
   * Uses the link index for tag data (extracted during indexing).
   * Requires read or write permission.
   * Returns empty array for vaults with no tags.
   */
  private async getTags(c: Context): Promise<Response> {
    const vaultId = c.req.param('vaultId') as string

    const authResult = await this.checkAccess(c, vaultId)
    if (!authResult.authorized) {
      return authResult.response
    }

    const linkIndex = this.getLinkIndex(vaultId)
    if (linkIndex === undefined) {
      return c.json({ tags: [] }, 200)
    }

    if (!linkIndex.isReady()) {
      this.logger.info('Link index not ready, triggering rebuild', { vaultId })
      await linkIndex.rebuild()
    }

    // Use getGraphMeta to get tag data, then augment with file lists from graph
    const meta = linkIndex.getGraphMeta()

    // For backward compat, the tags endpoint also returns the `files` array.
    // We get this from the graph with includeTags=true.
    const graph = linkIndex.getGraph({ includeTags: true })

    // Build tag → files mapping from graph edges
    const tagFiles = new Map<string, string[]>()
    for (const edge of graph.edges) {
      if (edge.type === 'tag') {
        // target is `tag:<name>`, source is the file path
        const tagName = edge.target.slice(4) // remove 'tag:' prefix
        const existing = tagFiles.get(tagName)
        if (existing) {
          existing.push(edge.source)
        } else {
          tagFiles.set(tagName, [edge.source])
        }
      }
    }

    const tags = meta.tags.map((tag) => ({
      name: tag.name,
      count: tag.count,
      files: tagFiles.get(tag.name) ?? [],
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
