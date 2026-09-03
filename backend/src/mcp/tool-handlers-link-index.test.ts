// MCP write/delete/move/rename — link index synchronization
//
// The MCP tools call vaultService directly, so without this wiring an MCP
// client could delete a note and leave its tags and properties in the link
// index — where the Graph and the context panel's Tags view read them from.

import { describe, it, expect, vi } from 'vitest'
import { registerToolHandlers } from './tool-handlers.js'
import type { ToolHandlerDeps } from './tool-handlers.js'
import type { IVaultService, IVaultAccessControl } from '../business/index.js'
import type { ILogger } from '../logger/index.js'
import type { McpConfig } from './config.js'
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js'

function createMockLogger(): ILogger {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as ILogger
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

function createHook(): NonNullable<ToolHandlerDeps['linkIndexHook']> {
  return { onFileSaved: vi.fn(), onFileDeleted: vi.fn(), onFileRenamed: vi.fn() }
}

function buildHandlers(vaultService: IVaultService, linkIndexHook: NonNullable<ToolHandlerDeps['linkIndexHook']>) {
  const server = createMockServer()
  registerToolHandlers(server as never, {
    vaultService,
    vaultAccessControl: createAllowingAccessControl(),
    logger: createMockLogger(),
    mcpConfig: { maxFileSize: 1_000_000 } as McpConfig,
    getUserId: () => 'user-1',
    linkIndexHook,
  })
  return server.handlers
}

describe('MCP tools keep the link index in sync', () => {
  it('drops a deleted note from the index', async () => {
    const vaultService = { deleteContent: vi.fn().mockResolvedValue(undefined) } as unknown as IVaultService
    const hook = createHook()
    const handlers = buildHandlers(vaultService, hook)

    await handlers.get('delete_file')!({ vaultId: 'v1', path: 'Notes/Note.md' })

    expect(hook.onFileDeleted).toHaveBeenCalledWith('v1', 'Notes/Note.md')
  })

  it('drops a deleted folder from the index', async () => {
    const vaultService = { deleteContent: vi.fn().mockResolvedValue(undefined) } as unknown as IVaultService
    const hook = createHook()
    const handlers = buildHandlers(vaultService, hook)

    await handlers.get('delete_file')!({ vaultId: 'v1', path: 'Projekte/Alpha' })

    expect(hook.onFileDeleted).toHaveBeenCalledWith('v1', 'Projekte/Alpha')
  })

  it('re-indexes a written markdown file', async () => {
    const vaultService = {
      saveFile: vi.fn().mockResolvedValue({ path: 'Note.md', name: 'Note.md', size: 6, etag: 'e1' }),
    } as unknown as IVaultService
    const hook = createHook()
    const handlers = buildHandlers(vaultService, hook)

    await handlers.get('write_file')!({ vaultId: 'v1', path: 'Note.md', content: '#alpha' })

    expect(hook.onFileSaved).toHaveBeenCalledWith('v1', 'Note.md', '#alpha')
  })

  it('leaves binary writes out of the index', async () => {
    const vaultService = {
      saveFile: vi.fn().mockResolvedValue({ path: 'img.png', name: 'img.png', size: 3, etag: 'e1' }),
    } as unknown as IVaultService
    const hook = createHook()
    const handlers = buildHandlers(vaultService, hook)

    await handlers.get('write_file')!({
      vaultId: 'v1',
      path: 'img.png',
      content: Buffer.from('abc').toString('base64'),
      encoding: 'base64',
    })

    expect(hook.onFileSaved).not.toHaveBeenCalled()
  })

  it('moves a note to its new path in the index', async () => {
    const vaultService = {
      getVaultTree: vi.fn(),
      moveContent: vi.fn().mockResolvedValue({ newPath: 'Moved/Note.md' }),
    } as unknown as IVaultService
    const hook = createHook()
    const handlers = buildHandlers(vaultService, hook)

    await handlers.get('move_file')!({ vaultId: 'v1', sourcePath: 'Note.md', destinationPath: 'Moved/Note.md' })

    expect(hook.onFileRenamed).toHaveBeenCalledWith('v1', 'Note.md', 'Moved/Note.md')
  })

  it('re-homes a moved folder in the index', async () => {
    const vaultService = {
      getVaultTree: vi.fn(),
      moveContent: vi.fn().mockResolvedValue({ newPath: 'Archiv/Projekte' }),
    } as unknown as IVaultService
    const hook = createHook()
    const handlers = buildHandlers(vaultService, hook)

    await handlers.get('move_file')!({ vaultId: 'v1', sourcePath: 'Projekte', destinationPath: 'Archiv/Projekte' })

    // The folder path has no extension — guarding on one used to leave every
    // note inside it filed under its old path.
    expect(hook.onFileRenamed).toHaveBeenCalledWith('v1', 'Projekte', 'Archiv/Projekte')
  })

  it('renames a note in the index', async () => {
    const vaultService = {
      getVaultTree: vi.fn(),
      renameContent: vi.fn().mockResolvedValue({ newPath: 'Renamed.md' }),
    } as unknown as IVaultService
    const hook = createHook()
    const handlers = buildHandlers(vaultService, hook)

    await handlers.get('rename_file')!({ vaultId: 'v1', path: 'Note.md', newName: 'Renamed.md' })

    expect(hook.onFileRenamed).toHaveBeenCalledWith('v1', 'Note.md', 'Renamed.md')
  })

  it('renames a folder in the index', async () => {
    const vaultService = {
      getVaultTree: vi.fn(),
      renameContent: vi.fn().mockResolvedValue({ newPath: 'Archiv' }),
    } as unknown as IVaultService
    const hook = createHook()
    const handlers = buildHandlers(vaultService, hook)

    await handlers.get('rename_file')!({ vaultId: 'v1', path: 'Projekte', newName: 'Archiv' })

    expect(hook.onFileRenamed).toHaveBeenCalledWith('v1', 'Projekte', 'Archiv')
  })
})
