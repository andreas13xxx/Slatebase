// MCP move_file/rename_file — Link-Migration integration
//
// Covers the wiring added so MCP-driven moves/renames also rewrite wikilinks
// elsewhere in the vault that pointed at the old path, matching the REST API
// (VaultController.moveContent/renameContent) — previously move_file/rename_file
// called vaultService directly and bypassed link migration entirely.

import { describe, it, expect, vi } from 'vitest'
import { registerToolHandlers } from './tool-handlers.js'
import type { ToolHandlerDeps } from './tool-handlers.js'
import type { IVaultService, IVaultAccessControl } from '../business/index.js'
import type { ILogger } from '../logger/index.js'
import type { McpConfig } from './config.js'
import type { DirectoryTree } from '../vault/index.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

function createMockLogger(): ILogger {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as ILogger
}

function file(name: string, path: string): DirectoryTree {
  return { name, type: 'file', path }
}

function dir(name: string, path: string, children: DirectoryTree[]): DirectoryTree {
  return { name, type: 'directory', path, children }
}

function createMockVaultService(tree: DirectoryTree, overrides: Partial<IVaultService> = {}): IVaultService {
  return {
    getVaultTree: vi.fn().mockResolvedValue(tree),
    moveContent: vi.fn(),
    renameContent: vi.fn(),
    ...overrides,
  } as unknown as IVaultService
}

function createAllowingAccessControl(): IVaultAccessControl {
  return { checkWriteAccess: vi.fn().mockResolvedValue(undefined) } as unknown as IVaultAccessControl
}

/** Minimal fake McpServer.tool() that just records the handler under its tool name. */
function createMockServer() {
  const handlers = new Map<string, (args: Record<string, unknown>) => Promise<CallToolResult>>()
  return {
    tool: vi.fn((...args: unknown[]) => {
      const name = args[0] as string
      const handler = args[args.length - 1] as (args: Record<string, unknown>) => Promise<CallToolResult>
      handlers.set(name, handler)
    }),
    handlers,
  }
}

function parseResult(result: CallToolResult): Record<string, unknown> {
  const text = (result.content[0] as { type: 'text'; text: string }).text
  return JSON.parse(text) as Record<string, unknown>
}

function buildDeps(vaultService: IVaultService, migrateLinks?: ToolHandlerDeps['migrateLinks']): ToolHandlerDeps {
  return {
    vaultService,
    vaultAccessControl: createAllowingAccessControl(),
    logger: createMockLogger(),
    mcpConfig: {} as McpConfig,
    getUserId: () => 'user-1',
    ...(migrateLinks ? { migrateLinks } : {}),
  }
}

const emptyMigration = { migratedFiles: [], failedFiles: [] }

describe('move_file — Link-Migration', () => {
  it('snapshots the tree and invokes migrateLinks for the moved file', async () => {
    const tree = dir('vault', '', [file('Note.md', 'Note.md')])
    const vaultService = createMockVaultService(tree, {
      moveContent: vi.fn().mockResolvedValue({ newPath: 'Moved/Note.md' }),
    })
    const migrateLinks = vi.fn().mockResolvedValue(emptyMigration)
    const server = createMockServer()
    registerToolHandlers(server as never, buildDeps(vaultService, migrateLinks))

    const handler = server.handlers.get('move_file')!
    const result = await handler({ vaultId: 'v1', sourcePath: 'Note.md', destinationPath: 'Moved/Note.md' })

    expect(vaultService.getVaultTree).toHaveBeenCalledWith('v1')
    expect(migrateLinks).toHaveBeenCalledWith('v1', 'Note.md', 'Moved/Note.md', tree)
    expect(parseResult(result)).toEqual({ sourcePath: 'Note.md', newPath: 'Moved/Note.md', message: 'Moved successfully' })
  })

  it('invokes migrateLinks once per descendant file for a folder move', async () => {
    const tree = dir('vault', '', [
      dir('Folder', 'Folder', [
        file('A.md', 'Folder/A.md'),
        dir('Sub', 'Folder/Sub', [file('B.md', 'Folder/Sub/B.md')]),
      ]),
    ])
    const vaultService = createMockVaultService(tree, {
      moveContent: vi.fn().mockResolvedValue({ newPath: 'Moved' }),
    })
    const migrateLinks = vi.fn().mockResolvedValue(emptyMigration)
    const server = createMockServer()
    registerToolHandlers(server as never, buildDeps(vaultService, migrateLinks))

    const handler = server.handlers.get('move_file')!
    await handler({ vaultId: 'v1', sourcePath: 'Folder', destinationPath: 'Moved' })

    expect(migrateLinks).toHaveBeenCalledWith('v1', 'Folder/A.md', 'Moved/A.md', tree)
    expect(migrateLinks).toHaveBeenCalledWith('v1', 'Folder/Sub/B.md', 'Moved/Sub/B.md', tree)
    expect(migrateLinks).toHaveBeenCalledTimes(2)
  })

  it('surfaces partial migration failures as linkMigrationWarnings without failing the move', async () => {
    const tree = dir('vault', '', [file('Note.md', 'Note.md')])
    const vaultService = createMockVaultService(tree, {
      moveContent: vi.fn().mockResolvedValue({ newPath: 'Moved/Note.md' }),
    })
    const migrateLinks = vi.fn().mockResolvedValue({
      migratedFiles: [],
      failedFiles: [{ path: 'Broken.md', reason: 'disk full' }],
    })
    const server = createMockServer()
    registerToolHandlers(server as never, buildDeps(vaultService, migrateLinks))

    const handler = server.handlers.get('move_file')!
    const result = await handler({ vaultId: 'v1', sourcePath: 'Note.md', destinationPath: 'Moved/Note.md' })

    const parsed = parseResult(result)
    expect(parsed['linkMigrationWarnings']).toEqual([{ path: 'Broken.md', reason: 'disk full' }])
  })

  it('does not snapshot the tree or call migrateLinks when the dependency is not configured', async () => {
    const tree = dir('vault', '', [file('Note.md', 'Note.md')])
    const vaultService = createMockVaultService(tree, {
      moveContent: vi.fn().mockResolvedValue({ newPath: 'Moved/Note.md' }),
    })
    const server = createMockServer()
    registerToolHandlers(server as never, buildDeps(vaultService, undefined))

    const handler = server.handlers.get('move_file')!
    const result = await handler({ vaultId: 'v1', sourcePath: 'Note.md', destinationPath: 'Moved/Note.md' })

    expect(vaultService.getVaultTree).not.toHaveBeenCalled()
    expect(parseResult(result)).not.toHaveProperty('linkMigrationWarnings')
  })
})

describe('rename_file — Link-Migration', () => {
  it('snapshots the tree and invokes migrateLinks for the renamed file', async () => {
    const tree = dir('vault', '', [file('Note.md', 'Note.md')])
    const vaultService = createMockVaultService(tree, {
      renameContent: vi.fn().mockResolvedValue({ newPath: 'Renamed.md' }),
    })
    const migrateLinks = vi.fn().mockResolvedValue(emptyMigration)
    const server = createMockServer()
    registerToolHandlers(server as never, buildDeps(vaultService, migrateLinks))

    const handler = server.handlers.get('rename_file')!
    const result = await handler({ vaultId: 'v1', path: 'Note.md', newName: 'Renamed.md' })

    expect(migrateLinks).toHaveBeenCalledWith('v1', 'Note.md', 'Renamed.md', tree)
    expect(parseResult(result)).toEqual({ oldPath: 'Note.md', newPath: 'Renamed.md', message: 'Renamed successfully' })
  })
})
