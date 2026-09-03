// VaultController — link index notification on delete
//
// A note's tags and properties live in the link index, and the context panel's
// Tags view reads them from there. If a delete doesn't reach the index, the
// deleted note's tags keep showing up in that list.

import { describe, it, expect, vi } from 'vitest'
import { Hono } from 'hono'
import { VaultController } from './index.js'
import type { LinkIndexHook } from './index.js'
import type { IVaultService } from '../business/index.js'
import type { ILogger } from '../logger/index.js'
import type { IEventBus } from '../realtime/types.js'

function createMockLogger(): ILogger {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } as unknown as ILogger
}

function createMockVaultService(): IVaultService {
  return {
    deleteContent: vi.fn().mockResolvedValue(undefined),
    getVaultTree: vi.fn(),
  } as unknown as IVaultService
}

function createHook(): LinkIndexHook {
  return {
    onFileSaved: vi.fn(),
    onFileDeleted: vi.fn(),
    onFileRenamed: vi.fn(),
    migrateLinks: vi.fn().mockResolvedValue({ migratedFiles: [], failedFiles: [] }),
  }
}

function buildApp(vaultService: IVaultService, hook: LinkIndexHook) {
  const controller = new VaultController(vaultService, createMockLogger())
  controller.setLinkIndexHook(hook)
  controller.setEventBus({ publish: vi.fn(), subscribe: vi.fn() } as unknown as IEventBus)

  const app = new Hono()
  app.use('*', async (c, next) => {
    c.set('session' as never, { userId: 'user-1', username: 'alice', role: 'user' } as never)
    await next()
  })
  app.delete('/vaults/:vaultId/content', (c) => controller.deleteContent(c))
  return app
}

describe('VaultController — link index notification on delete', () => {
  it('notifies the link index when a markdown file is deleted', async () => {
    const vaultService = createMockVaultService()
    const hook = createHook()
    const app = buildApp(vaultService, hook)

    const res = await app.request('/vaults/v1/content?path=Notes%2FNote.md', { method: 'DELETE' })

    expect(res.status).toBe(204)
    expect(hook.onFileDeleted).toHaveBeenCalledWith('v1', 'Notes/Note.md')
  })

  it('notifies the link index when a folder is deleted', async () => {
    const vaultService = createMockVaultService()
    const hook = createHook()
    const app = buildApp(vaultService, hook)

    // A folder path has no `.md` extension — guarding the hook on one used to
    // leave every tag of every note inside the folder in the index.
    const res = await app.request('/vaults/v1/content?path=Projekte%2FAlpha', { method: 'DELETE' })

    expect(res.status).toBe(204)
    expect(hook.onFileDeleted).toHaveBeenCalledWith('v1', 'Projekte/Alpha')
  })

  it('does not notify the link index when the delete itself fails', async () => {
    const vaultService = {
      deleteContent: vi.fn().mockRejectedValue(new Error('boom')),
      getVaultTree: vi.fn(),
    } as unknown as IVaultService
    const hook = createHook()
    const app = buildApp(vaultService, hook)

    await app.request('/vaults/v1/content?path=Notes%2FNote.md', { method: 'DELETE' })

    expect(hook.onFileDeleted).not.toHaveBeenCalled()
  })
})
