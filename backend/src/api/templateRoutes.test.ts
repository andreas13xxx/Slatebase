// Template Routes — Unit Tests

import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import { createTemplateRoutes } from './templateRoutes.js'
import type { TemplateRouteDependencies } from './templateRoutes.js'
import type { ITemplateService, TemplateInfo } from '../template/types.js'
import type { IVaultAccessControl } from '../business/index.js'
import type { IVaultRegistry } from '../vault/registry.js'
import type { IEventBus } from '../realtime/types.js'
import type { ILogger } from '../logger/index.js'
import { TemplateNotFoundError, TemplateConflictError } from '../template/errors.js'
import { VaultAccessDeniedError } from '../business/index.js'

// --- Mock Factories ---

function createMockLogger(): ILogger {
  return {
    info: () => {},
    warn: () => {},
    error: () => {},
    debug: () => {},
    child: () => createMockLogger(),
  } as unknown as ILogger
}

function createMockTemplateService(overrides: Partial<ITemplateService> = {}): ITemplateService {
  return {
    listTemplates: async () => [],
    createFromTemplate: async () => ({ path: 'test.md', content: '# Test' }),
    ...overrides,
  }
}

function createMockAccessControl(overrides: Partial<IVaultAccessControl> = {}): IVaultAccessControl {
  return {
    checkReadAccess: async () => {},
    checkWriteAccess: async () => {},
    ...overrides,
  } as unknown as IVaultAccessControl
}

function createMockVaultRegistry(): IVaultRegistry {
  return {
    findById: () => ({ id: 'vault1', name: 'Test', storagePath: '/data/vaults/vault1', ownerId: 'user1' }),
  } as unknown as IVaultRegistry
}

function createMockEventBus(): IEventBus {
  return {
    publish: () => {},
  } as unknown as IEventBus
}

function createTestApp(deps: Partial<TemplateRouteDependencies> = {}): Hono {
  const fullDeps: TemplateRouteDependencies = {
    templateService: createMockTemplateService(),
    accessControl: createMockAccessControl(),
    vaultRegistry: createMockVaultRegistry(),
    eventBus: createMockEventBus(),
    logger: createMockLogger(),
    ...deps,
  }

  const app = new Hono()
  // Simulate auth middleware setting session
  app.use('*', async (c, next) => {
    c.set('session' as never, { userId: 'user1', username: 'testuser', role: 'user' } as never)
    await next()
  })
  const routes = createTemplateRoutes(fullDeps)
  app.route('/api/v1', routes)
  return app
}

// --- Tests ---

describe('GET /api/v1/vaults/:vaultId/templates', () => {
  it('returns 200 with empty template list', async () => {
    const app = createTestApp()
    const res = await app.request('/api/v1/vaults/vault1/templates')

    expect(res.status).toBe(200)
    const body = await res.json() as { templates: TemplateInfo[] }
    expect(body.templates).toEqual([])
  })

  it('returns 200 with templates list', async () => {
    const templates: TemplateInfo[] = [
      { name: 'Daily Note', path: 'Daily Note.md' },
      { name: 'Meeting', path: 'Meeting.md' },
    ]
    const app = createTestApp({
      templateService: createMockTemplateService({
        listTemplates: async () => templates,
      }),
    })

    const res = await app.request('/api/v1/vaults/vault1/templates')

    expect(res.status).toBe(200)
    const body = await res.json() as { templates: TemplateInfo[] }
    expect(body.templates).toEqual(templates)
  })

  it('returns 404 when vault not found', async () => {
    const app = createTestApp({
      vaultRegistry: { findById: () => null } as unknown as IVaultRegistry,
    })

    const res = await app.request('/api/v1/vaults/unknown/templates')

    expect(res.status).toBe(404)
    const body = await res.json() as { code: string }
    expect(body.code).toBe('VAULT_NOT_FOUND')
  })

  it('returns 403 when read access denied', async () => {
    const app = createTestApp({
      accessControl: createMockAccessControl({
        checkReadAccess: async () => {
          throw new VaultAccessDeniedError('vault1', 'user1', 'read')
        },
      }),
    })

    const res = await app.request('/api/v1/vaults/vault1/templates')

    expect(res.status).toBe(403)
    const body = await res.json() as { code: string }
    expect(body.code).toBe('FORBIDDEN')
  })
})

describe('POST /api/v1/vaults/:vaultId/templates/create', () => {
  it('returns 201 with path and content on success', async () => {
    const app = createTestApp({
      templateService: createMockTemplateService({
        createFromTemplate: async () => ({
          path: 'notes/daily.md',
          content: '# Daily\n\nContent here',
        }),
      }),
    })

    const res = await app.request('/api/v1/vaults/vault1/templates/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        templateName: 'Daily Note',
        targetDir: 'notes',
        fileName: 'daily',
      }),
    })

    expect(res.status).toBe(201)
    const body = await res.json() as { path: string; content: string }
    expect(body.path).toBe('notes/daily.md')
    expect(body.content).toBe('# Daily\n\nContent here')
  })

  it('returns 400 for invalid body (missing templateName)', async () => {
    const app = createTestApp()

    const res = await app.request('/api/v1/vaults/vault1/templates/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetDir: 'notes',
        fileName: 'daily',
      }),
    })

    expect(res.status).toBe(400)
    const body = await res.json() as { code: string }
    expect(body.code).toBe('VALIDATION_ERROR')
  })

  it('returns 400 for invalid body (empty fileName)', async () => {
    const app = createTestApp()

    const res = await app.request('/api/v1/vaults/vault1/templates/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        templateName: 'Daily',
        targetDir: '',
        fileName: '',
      }),
    })

    expect(res.status).toBe(400)
    const body = await res.json() as { code: string }
    expect(body.code).toBe('VALIDATION_ERROR')
  })

  it('returns 404 when template not found', async () => {
    const app = createTestApp({
      templateService: createMockTemplateService({
        createFromTemplate: async () => {
          throw new TemplateNotFoundError('Unknown')
        },
      }),
    })

    const res = await app.request('/api/v1/vaults/vault1/templates/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        templateName: 'Unknown',
        targetDir: '',
        fileName: 'test',
      }),
    })

    expect(res.status).toBe(404)
    const body = await res.json() as { code: string }
    expect(body.code).toBe('TEMPLATE_NOT_FOUND')
  })

  it('returns 409 when file already exists (conflict)', async () => {
    const app = createTestApp({
      templateService: createMockTemplateService({
        createFromTemplate: async () => {
          throw new TemplateConflictError('notes/daily.md')
        },
      }),
    })

    const res = await app.request('/api/v1/vaults/vault1/templates/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        templateName: 'Daily',
        targetDir: 'notes',
        fileName: 'daily',
      }),
    })

    expect(res.status).toBe(409)
    const body = await res.json() as { code: string }
    expect(body.code).toBe('TEMPLATE_CONFLICT')
  })

  it('returns 403 when write access denied', async () => {
    const app = createTestApp({
      accessControl: createMockAccessControl({
        checkWriteAccess: async () => {
          throw new VaultAccessDeniedError('vault1', 'user1', 'write')
        },
      }),
    })

    const res = await app.request('/api/v1/vaults/vault1/templates/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        templateName: 'Daily',
        targetDir: '',
        fileName: 'test',
      }),
    })

    expect(res.status).toBe(403)
    const body = await res.json() as { code: string }
    expect(body.code).toBe('FORBIDDEN')
  })

  it('returns 404 when vault not found', async () => {
    const app = createTestApp({
      vaultRegistry: { findById: () => null } as unknown as IVaultRegistry,
    })

    const res = await app.request('/api/v1/vaults/unknown/templates/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        templateName: 'Daily',
        targetDir: '',
        fileName: 'test',
      }),
    })

    expect(res.status).toBe(404)
    const body = await res.json() as { code: string }
    expect(body.code).toBe('VAULT_NOT_FOUND')
  })
})
