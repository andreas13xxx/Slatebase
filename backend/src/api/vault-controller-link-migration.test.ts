// VaultController — Link-Migration integration on move/rename
//
// Covers the wiring added for Prio 15 "Link-Migration" (see
// .kiro/specs/graph-polish-link-integrity/): moveContent/renameContent must
// snapshot the pre-operation tree, invoke LinkIndexHook.migrateLinks for the
// file (or every descendant file of a moved folder), publish a 'saved'
// vault:change event per migrated file, and surface partial failures as
// linkMigrationWarnings on the 200 response without failing the rename/move.

import { describe, it, expect, vi } from 'vitest'
import { Hono } from 'hono'
import { VaultController } from './index.js'
import type { LinkIndexHook } from './index.js'
import type { IVaultService } from '../business/index.js'
import type { ILogger } from '../logger/index.js'
import type { DirectoryTree } from '../vault/index.js'
import type { IEventBus } from '../realtime/types.js'

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
    initializeVaults: vi.fn(),
    getVaultList: vi.fn(),
    getVaultTree: vi.fn().mockResolvedValue(tree),
    getFileContent: vi.fn(),
    resolveFilePath: vi.fn(),
    saveFile: vi.fn(),
    createVault: vi.fn(),
    deleteVault: vi.fn(),
    deleteVaultWithChecks: vi.fn(),
    transferOwnership: vi.fn(),
    deleteContent: vi.fn(),
    moveContent: vi.fn(),
    renameContent: vi.fn(),
    ...overrides,
  } as unknown as IVaultService
}

function createMockEventBus(): IEventBus {
  return { publish: vi.fn(), subscribe: vi.fn() } as unknown as IEventBus
}

function buildApp(vaultService: IVaultService, hook: LinkIndexHook | undefined, eventBus: IEventBus) {
  const controller = new VaultController(vaultService, createMockLogger())
  if (hook) controller.setLinkIndexHook(hook)
  controller.setEventBus(eventBus)

  const app = new Hono()
  app.use('*', async (c, next) => {
    c.set('session' as never, { userId: 'user-1', username: 'alice', role: 'user' } as never)
    await next()
  })
  app.put('/vaults/:vaultId/move', (c) => controller.moveContent(c))
  app.put('/vaults/:vaultId/rename', (c) => controller.renameContent(c))
  return app
}

const emptyMigration = { migratedFiles: [], failedFiles: [] }

describe('VaultController — Link-Migration on rename', () => {
  it('snapshots the tree, invokes migrateLinks for the renamed file, and returns plain result on success', async () => {
    const tree = dir('vault', '', [file('Note.md', 'Note.md')])
    const vaultService = createMockVaultService(tree, {
      renameContent: vi.fn().mockResolvedValue({ newPath: 'Renamed.md' }),
    })
    const migrateLinks = vi.fn().mockResolvedValue(emptyMigration)
    const hook: LinkIndexHook = { onFileSaved: vi.fn(), onFileDeleted: vi.fn(), onFileRenamed: vi.fn(), migrateLinks }
    const app = buildApp(vaultService, hook, createMockEventBus())

    const res = await app.request('/vaults/v1/rename', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: 'Note.md', newName: 'Renamed.md' }),
    })

    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body).toEqual({ newPath: 'Renamed.md' })
    expect(migrateLinks).toHaveBeenCalledWith('v1', 'Note.md', 'Renamed.md', tree)
    expect(vaultService.getVaultTree).toHaveBeenCalledWith('v1')
  })

  it('publishes a saved vault:change event for every file migrateLinks actually rewrote', async () => {
    const tree = dir('vault', '', [file('Note.md', 'Note.md'), file('Referrer.md', 'Referrer.md')])
    const vaultService = createMockVaultService(tree, {
      renameContent: vi.fn().mockResolvedValue({ newPath: 'Renamed.md' }),
    })
    const migrateLinks = vi.fn().mockResolvedValue({
      migratedFiles: [{ path: 'Referrer.md', replacements: 1 }],
      failedFiles: [],
    })
    const hook: LinkIndexHook = { onFileSaved: vi.fn(), onFileDeleted: vi.fn(), onFileRenamed: vi.fn(), migrateLinks }
    const eventBus = createMockEventBus()
    const app = buildApp(vaultService, hook, eventBus)

    await app.request('/vaults/v1/rename', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: 'Note.md', newName: 'Renamed.md' }),
    })

    expect(eventBus.publish).toHaveBeenCalledWith(expect.objectContaining({
      type: 'vault:change',
      payload: expect.objectContaining({ vaultId: 'v1', action: 'saved', path: 'Referrer.md' }),
    }))
    // ...and the rename itself still publishes its own 'renamed' event.
    expect(eventBus.publish).toHaveBeenCalledWith(expect.objectContaining({
      type: 'vault:change',
      payload: expect.objectContaining({ vaultId: 'v1', action: 'renamed', path: 'Renamed.md' }),
    }))
  })

  it('surfaces partial migration failures as linkMigrationWarnings without failing the rename', async () => {
    const tree = dir('vault', '', [file('Note.md', 'Note.md')])
    const vaultService = createMockVaultService(tree, {
      renameContent: vi.fn().mockResolvedValue({ newPath: 'Renamed.md' }),
    })
    const migrateLinks = vi.fn().mockResolvedValue({
      migratedFiles: [],
      failedFiles: [{ path: 'Broken.md', reason: 'disk full' }],
    })
    const hook: LinkIndexHook = { onFileSaved: vi.fn(), onFileDeleted: vi.fn(), onFileRenamed: vi.fn(), migrateLinks }
    const app = buildApp(vaultService, hook, createMockEventBus())

    const res = await app.request('/vaults/v1/rename', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: 'Note.md', newName: 'Renamed.md' }),
    })

    expect(res.status).toBe(200)
    const body = await res.json() as Record<string, unknown>
    expect(body['newPath']).toBe('Renamed.md')
    expect(body['linkMigrationWarnings']).toEqual([{ path: 'Broken.md', reason: 'disk full' }])
  })

  it('does not snapshot the tree or call migrateLinks when no LinkIndexHook is set', async () => {
    const tree = dir('vault', '', [file('Note.md', 'Note.md')])
    const vaultService = createMockVaultService(tree, {
      renameContent: vi.fn().mockResolvedValue({ newPath: 'Renamed.md' }),
    })
    const app = buildApp(vaultService, undefined, createMockEventBus())

    const res = await app.request('/vaults/v1/rename', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: 'Note.md', newName: 'Renamed.md' }),
    })

    expect(res.status).toBe(200)
    expect(vaultService.getVaultTree).not.toHaveBeenCalled()
  })
})

describe('VaultController — Link-Migration on move (folder)', () => {
  it('invokes migrateLinks once per descendant file when a folder is moved', async () => {
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
    const hook: LinkIndexHook = { onFileSaved: vi.fn(), onFileDeleted: vi.fn(), onFileRenamed: vi.fn(), migrateLinks }
    const app = buildApp(vaultService, hook, createMockEventBus())

    const res = await app.request('/vaults/v1/move', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sourcePath: 'Folder', destinationPath: 'Moved' }),
    })

    expect(res.status).toBe(200)
    expect(migrateLinks).toHaveBeenCalledWith('v1', 'Folder/A.md', 'Moved/A.md', tree)
    expect(migrateLinks).toHaveBeenCalledWith('v1', 'Folder/Sub/B.md', 'Moved/Sub/B.md', tree)
    expect(migrateLinks).toHaveBeenCalledTimes(2)
  })

  it('notifies the link index of a folder move with the folder path itself', async () => {
    const tree = dir('vault', '', [dir('Folder', 'Folder', [file('A.md', 'Folder/A.md')])])
    const vaultService = createMockVaultService(tree, {
      moveContent: vi.fn().mockResolvedValue({ newPath: 'Moved' }),
    })
    const onFileRenamed = vi.fn()
    const hook: LinkIndexHook = { onFileSaved: vi.fn(), onFileDeleted: vi.fn(), onFileRenamed, migrateLinks: vi.fn().mockResolvedValue(emptyMigration) }
    const app = buildApp(vaultService, hook, createMockEventBus())

    await app.request('/vaults/v1/move', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sourcePath: 'Folder', destinationPath: 'Moved' }),
    })

    // One call with the folder path, not one per descendant: the index re-homes
    // the whole subtree in a single pass rather than persisting per note.
    expect(onFileRenamed).toHaveBeenCalledTimes(1)
    expect(onFileRenamed).toHaveBeenCalledWith('v1', 'Folder', 'Moved')
  })

  it('re-homes the moved paths in the index before Link-Migration reads it', async () => {
    const tree = dir('vault', '', [dir('Folder', 'Folder', [file('A.md', 'Folder/A.md')])])
    const vaultService = createMockVaultService(tree, {
      moveContent: vi.fn().mockResolvedValue({ newPath: 'Moved' }),
    })
    const order: string[] = []
    const hook: LinkIndexHook = {
      onFileSaved: vi.fn(),
      onFileDeleted: vi.fn(),
      // Resolves on a later tick: only an awaited hook can still order ahead of
      // the migration, which resolves backlinks against the index.
      onFileRenamed: vi.fn().mockImplementation(async () => {
        await Promise.resolve()
        order.push('index')
      }),
      migrateLinks: vi.fn().mockImplementation(async () => {
        order.push('migrate')
        return emptyMigration
      }),
    }
    const app = buildApp(vaultService, hook, createMockEventBus())

    await app.request('/vaults/v1/move', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sourcePath: 'Folder', destinationPath: 'Moved' }),
    })

    expect(order).toEqual(['index', 'migrate'])
  })
})
