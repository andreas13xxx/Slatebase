// MCP Tool Handler — query_base
//
// Evaluates an Obsidian-compatible `.base` file server-side: reads and parses
// it, fetches candidate rows (with property + file metadata) from the link
// index, applies the base's filters with the shared expression engine from
// `@slatebase/shared-contracts` (the same code the frontend runs), evaluates
// formula columns and returns the resulting table as JSON.

import fs from 'node:fs/promises'
import { z } from 'zod'
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import {
  parseBase,
  buildQuerySpec,
  filterRows,
  evaluateFormulaColumn,
  formatFormulaValue,
} from '@slatebase/shared-contracts'
import type { BaseDocument, BaseRow, BaseView } from '@slatebase/shared-contracts'
import { VaultNotFoundError, VaultAccessDeniedError } from '../business/index.js'
import { PathTraversalError } from '../vault/index.js'
import type { ILinkIndex } from '../link-index/index.js'
import type { ToolHandlerDeps } from './tool-handlers.js'
import { mcpToolError, mcpToolSuccess } from './tool-results.js'
import {
  MCP_ERROR_ACCESS_DENIED,
  MCP_ERROR_NOT_FOUND,
  MCP_ERROR_FILE_TOO_LARGE,
  MCP_ERROR_INVALID_PARAMS,
  MCP_ERROR_STORAGE,
} from './error-codes.js'

const READ_ATTEMPTS = 3
const READ_RETRY_DELAY_MS = 50

/** Reads a text file, retrying transient lock errors (EPERM/EACCES/EBUSY). */
async function readWithRetry(file: string): Promise<string> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fs.readFile(file, 'utf-8')
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code
      const transient = code === 'EPERM' || code === 'EACCES' || code === 'EBUSY'
      if (!transient || attempt >= READ_ATTEMPTS) throw error
      await new Promise((resolve) => setTimeout(resolve, READ_RETRY_DELAY_MS * attempt))
    }
  }
}

const DEFAULT_LIMIT = 100
const MAX_LIMIT = 1000

/** Picks the requested view by name, or the first one (a synthetic table when the base has none). */
function selectView(doc: BaseDocument, name: string | undefined): BaseView | { error: string } {
  const views = doc.views ?? []
  if (name === undefined) return views[0] ?? { type: 'table' }
  const found = views.find((v) => v.name === name)
  if (found) return found
  const known = views.map((v) => v.name).filter((n): n is string => n !== undefined)
  return { error: `View not found: ${name}. Available views: ${known.length > 0 ? known.join(', ') : '(none named)'}` }
}

/**
 * Column ids to output: the view's explicit order, else the declared properties
 * plus formulas. A cards view's `groupBy` property is always included so a
 * client can actually group the rows.
 */
function outputColumns(doc: BaseDocument, view: BaseView): string[] {
  const columns = view.order && view.order.length > 0
    ? [...view.order]
    : ['file.name', ...Object.keys(doc.properties ?? {}), ...Object.keys(doc.formulas ?? {}).map((f) => `formula.${f}`)]
  const groupBy = view.groupBy?.property
  if (groupBy !== undefined && !columns.includes(groupBy)) columns.push(groupBy)
  return columns
}

/** One cell as JSON: formulas evaluated, single-element property lists unwrapped. */
function cellValue(doc: BaseDocument, row: BaseRow, column: string): unknown {
  const formulaId = column.startsWith('formula.') ? column.slice('formula.'.length) : column
  if (doc.formulas && formulaId in doc.formulas) {
    const r = evaluateFormulaColumn(doc, row, formulaId)
    return r.ok ? formatFormulaValue(r.value) : `#ERR: ${r.error}`
  }
  if (column === 'file.name') return row.fileName
  const key = column.startsWith('note.') ? column.slice('note.'.length) : column
  const v = row.values[key] ?? row.values[column]
  if (Array.isArray(v)) return v.length === 1 ? v[0] : v
  return v ?? null
}

export function registerQueryBase(
  server: McpServer,
  deps: ToolHandlerDeps,
  linkIndexResolver: (vaultId: string) => Promise<ILinkIndex | undefined>,
): void {
  server.tool(
    'query_base',
    'Evaluate a Bases (.base) file and return its rows as a table: applies the base filters, formulas, sort and limit of one view and returns the view\'s columns for every matching note.',
    {
      vaultId: z.string().min(1, 'vaultId is required'),
      path: z.string().min(1, 'Path of the .base file is required'),
      view: z.string()
        .optional()
        .describe('Name of the view to evaluate. Defaults to the first view of the base.'),
      limit: z.number()
        .int('limit must be an integer')
        .min(1, 'limit must be at least 1')
        .max(MAX_LIMIT, `limit must not exceed ${MAX_LIMIT}`)
        .optional()
        .default(DEFAULT_LIMIT)
        .describe('Maximum rows to return (applied on top of the view\'s own limit).'),
    },
    async (args) => {
      try {
        const userId = deps.getUserId()

        try {
          await deps.vaultAccessControl.checkReadAccess(args.vaultId, userId)
        } catch (error) {
          if (error instanceof VaultAccessDeniedError || error instanceof VaultNotFoundError) {
            return mcpToolError(MCP_ERROR_ACCESS_DENIED, 'Access denied')
          }
          throw error
        }

        if (!args.path.toLowerCase().endsWith('.base')) {
          return mcpToolError(MCP_ERROR_INVALID_PARAMS, 'Path must point to a .base file')
        }

        let resolvedPath: string
        try {
          resolvedPath = deps.vaultService.resolveFilePath(args.vaultId, args.path)
        } catch (error) {
          if (error instanceof PathTraversalError) return mcpToolError(MCP_ERROR_INVALID_PARAMS, 'Invalid file path')
          if (error instanceof VaultNotFoundError) return mcpToolError(MCP_ERROR_ACCESS_DENIED, 'Access denied')
          throw error
        }

        let stat: Awaited<ReturnType<typeof fs.stat>>
        try {
          stat = await fs.stat(resolvedPath)
        } catch {
          return mcpToolError(MCP_ERROR_NOT_FOUND, 'Resource not found')
        }
        if (!stat.isFile()) {
          return mcpToolError(MCP_ERROR_INVALID_PARAMS, 'Path must point to a .base file')
        }
        if (stat.size > deps.mcpConfig.maxFileSize) {
          return mcpToolError(MCP_ERROR_FILE_TOO_LARGE, `File too large: ${stat.size} bytes (max: ${deps.mcpConfig.maxFileSize} bytes)`)
        }

        let content: string
        try {
          content = await readWithRetry(resolvedPath)
        } catch (error) {
          // A failed read is "unknown", never "gone" (EPERM/EACCES from
          // antivirus/OneDrive is routine on Windows) — say so explicitly.
          deps.logger.warn('query_base could not read the base file', { error: error instanceof Error ? error.message : String(error) })
          return mcpToolError(MCP_ERROR_STORAGE, 'Could not read the .base file (temporarily locked?) — try again')
        }

        const parsed = parseBase(content)
        if (!parsed.success) {
          return mcpToolError(MCP_ERROR_INVALID_PARAMS, `Invalid .base file: ${parsed.errors.map((e) => e.message).join('; ')}`)
        }
        const doc = parsed.document

        const view = selectView(doc, args.view)
        if ('error' in view) return mcpToolError(MCP_ERROR_INVALID_PARAMS, view.error)

        const linkIndex = await linkIndexResolver(args.vaultId)
        if (!linkIndex || !linkIndex.isReady()) {
          return mcpToolError(MCP_ERROR_STORAGE, 'Link index not yet available for this vault')
        }

        // Filters + limit are evaluated here, not by the index (see buildQuerySpec).
        const candidates = await linkIndex.queryForBase(buildQuerySpec(doc, view))
        const { rows, total } = filterRows(candidates.rows, doc, view)

        const returned = rows.slice(0, args.limit)
        // `filterRows` counts matches before the view's own limit. The view limit
        // is part of the base's definition, not a truncation: report what the
        // view shows, so `truncated` only reflects the caller's `limit`.
        const available = rows.length
        const columns = outputColumns(doc, view)

        return mcpToolSuccess({
          base: args.path,
          view: { name: view.name ?? null, type: view.type },
          columns,
          rows: returned.map((row) => ({
            path: row.path,
            cells: Object.fromEntries(columns.map((c) => [c, cellValue(doc, row, c)])),
          })),
          total: available,
          matches: total,
          returned: returned.length,
          truncated: returned.length < available,
          ...(parsed.errors && parsed.errors.length > 0
            ? { warnings: parsed.errors.map((e) => e.message) }
            : {}),
        })
      } catch (error) {
        if (error instanceof VaultNotFoundError) {
          return mcpToolError(MCP_ERROR_ACCESS_DENIED, 'Access denied')
        }
        deps.logger.error('query_base failed', { error: error instanceof Error ? error.message : String(error) })
        return mcpToolError(MCP_ERROR_STORAGE, 'Failed to evaluate base')
      }
    },
  )
}
