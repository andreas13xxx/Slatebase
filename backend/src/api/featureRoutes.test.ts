import { describe, it, expect, vi } from 'vitest'
import { Hono } from 'hono'
import { createAdminFeatureRoutes, createPublicFeatureRoutes } from './featureRoutes.js'
import type { FeatureRouteDeps } from './featureRoutes.js'
import type { IFeatureToggleService, FeatureToggleState, FeatureToggleUpdateResult } from '../feature-toggle/index.js'
import { FeatureNotFoundError } from '../feature-toggle/index.js'
import type { IAuditService } from '../audit/index.js'
import type { SessionContext } from '../auth/index.js'

// ─── Mock Factories ──────────────────────────────────────────────────────────

function createMockFeatureToggleService(overrides: Partial<IFeatureToggleService> = {}): IFeatureToggleService {
  return {
    isEnabled: vi.fn().mockReturnValue(true),
    setEnabled: vi.fn().mockReturnValue({ name: 'chat', enabled: true, restartRequired: false }),
    getAll: vi.fn().mockReturnValue([]),
    get: vi.fn().mockReturnValue(undefined),
    onChange: vi.fn(),
    ...overrides,
  }
}

function createMockAuditService(): IAuditService {
  return {
    log: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20, totalPages: 0 }),
  }
}

function createAdminApp(deps: FeatureRouteDeps): Hono {
  const app = new Hono()

  // Simulate session middleware that sets session context
  app.use('*', async (c, next) => {
    c.set('session', {
      userId: 'admin-user-1',
      username: 'admin',
      role: 'admin',
      sessionId: 'session-1',
    } satisfies SessionContext)
    c.set('clientIp', '192.168.1.100')
    await next()
  })

  const featureApp = createAdminFeatureRoutes(deps)
  app.route('/', featureApp)
  return app
}

function createPublicApp(deps: FeatureRouteDeps): Hono {
  const app = new Hono()

  // Simulate session middleware
  app.use('*', async (c, next) => {
    c.set('session', {
      userId: 'user-1',
      username: 'user',
      role: 'user',
      sessionId: 'session-2',
    } satisfies SessionContext)
    await next()
  })

  const featureApp = createPublicFeatureRoutes(deps)
  app.route('/', featureApp)
  return app
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('featureRoutes', () => {
  describe('GET /features (admin)', () => {
    it('should return all feature toggles', async () => {
      const features: FeatureToggleState[] = [
        { name: 'chat', enabled: true, type: 'hot', description: 'Chat feature' },
        { name: 'vault-sync', enabled: false, type: 'hot', description: 'Vault sync' },
      ]
      const service = createMockFeatureToggleService({ getAll: vi.fn().mockReturnValue(features) })
      const app = createAdminApp({ featureToggleService: service })

      const res = await app.request('/features', { method: 'GET' })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toEqual(features)
      expect(service.getAll).toHaveBeenCalled()
    })

    it('should return empty array when no features registered', async () => {
      const service = createMockFeatureToggleService({ getAll: vi.fn().mockReturnValue([]) })
      const app = createAdminApp({ featureToggleService: service })

      const res = await app.request('/features', { method: 'GET' })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toEqual([])
    })
  })

  describe('PUT /features/:featureName (admin)', () => {
    it('should toggle a feature and return the result', async () => {
      const result: FeatureToggleUpdateResult = { name: 'chat', enabled: false, restartRequired: false }
      const service = createMockFeatureToggleService({
        setEnabled: vi.fn().mockReturnValue(result),
        get: vi.fn().mockReturnValue({ name: 'chat', enabled: true, type: 'hot', description: 'Chat' }),
      })
      const auditService = createMockAuditService()
      const app = createAdminApp({ featureToggleService: service, auditService })

      const res = await app.request('/features/chat', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: false }),
      })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toEqual(result)
      expect(service.setEnabled).toHaveBeenCalledWith('chat', false)
    })

    it('should create an audit log entry on toggle change', async () => {
      const result: FeatureToggleUpdateResult = { name: 'vault-sync', enabled: true, restartRequired: false }
      const service = createMockFeatureToggleService({
        setEnabled: vi.fn().mockReturnValue(result),
        get: vi.fn().mockReturnValue({ name: 'vault-sync', enabled: false, type: 'hot', description: 'Sync' }),
      })
      const auditService = createMockAuditService()
      const app = createAdminApp({ featureToggleService: service, auditService })

      await app.request('/features/vault-sync', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true }),
      })

      expect(auditService.log).toHaveBeenCalledWith({
        userId: 'admin-user-1',
        action: 'FEATURE_TOGGLED',
        target: 'vault-sync',
        ipAddress: '192.168.1.100',
        success: true,
        details: JSON.stringify({ oldEnabled: false, newEnabled: true }),
      })
    })

    it('should return 404 FEATURE_NOT_FOUND for unknown feature', async () => {
      const service = createMockFeatureToggleService({
        setEnabled: vi.fn().mockImplementation(() => {
          throw new FeatureNotFoundError('unknown-feature')
        }),
        get: vi.fn().mockReturnValue(undefined),
      })
      const app = createAdminApp({ featureToggleService: service })

      const res = await app.request('/features/unknown-feature', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true }),
      })

      expect(res.status).toBe(404)
      const body = await res.json()
      expect(body.code).toBe('FEATURE_NOT_FOUND')
    })

    it('should return 400 VALIDATION_ERROR when body is missing enabled field', async () => {
      const service = createMockFeatureToggleService()
      const app = createAdminApp({ featureToggleService: service })

      const res = await app.request('/features/chat', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.code).toBe('VALIDATION_ERROR')
    })

    it('should return 400 VALIDATION_ERROR when enabled is not a boolean', async () => {
      const service = createMockFeatureToggleService()
      const app = createAdminApp({ featureToggleService: service })

      const res = await app.request('/features/chat', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: 'yes' }),
      })

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.code).toBe('VALIDATION_ERROR')
    })

    it('should return 400 VALIDATION_ERROR for invalid JSON body', async () => {
      const service = createMockFeatureToggleService()
      const app = createAdminApp({ featureToggleService: service })

      const res = await app.request('/features/chat', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: 'not valid json',
      })

      expect(res.status).toBe(400)
      const body = await res.json()
      expect(body.code).toBe('VALIDATION_ERROR')
    })

    it('should return restartRequired: true for cold toggles', async () => {
      const result: FeatureToggleUpdateResult = { name: 'cold-feature', enabled: true, restartRequired: true }
      const service = createMockFeatureToggleService({
        setEnabled: vi.fn().mockReturnValue(result),
        get: vi.fn().mockReturnValue({ name: 'cold-feature', enabled: false, type: 'cold', description: 'Cold' }),
      })
      const app = createAdminApp({ featureToggleService: service })

      const res = await app.request('/features/cold-feature', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true }),
      })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body.restartRequired).toBe(true)
    })

    it('should work without auditService (optional dependency)', async () => {
      const result: FeatureToggleUpdateResult = { name: 'chat', enabled: true, restartRequired: false }
      const service = createMockFeatureToggleService({
        setEnabled: vi.fn().mockReturnValue(result),
        get: vi.fn().mockReturnValue({ name: 'chat', enabled: false, type: 'hot', description: 'Chat' }),
      })
      const app = createAdminApp({ featureToggleService: service })

      const res = await app.request('/features/chat', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: true }),
      })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toEqual(result)
    })
  })

  describe('GET /features (public)', () => {
    it('should return only name and enabled for all features', async () => {
      const features: FeatureToggleState[] = [
        { name: 'chat', enabled: true, type: 'hot', description: 'Chat feature' },
        { name: 'vault-sync', enabled: false, type: 'hot', description: 'Vault sync' },
        { name: 'mcp', enabled: true, type: 'cold', description: 'MCP server' },
      ]
      const service = createMockFeatureToggleService({ getAll: vi.fn().mockReturnValue(features) })
      const app = createPublicApp({ featureToggleService: service })

      const res = await app.request('/features', { method: 'GET' })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toEqual([
        { name: 'chat', enabled: true },
        { name: 'vault-sync', enabled: false },
        { name: 'mcp', enabled: true },
      ])
    })

    it('should not include type or description in public response', async () => {
      const features: FeatureToggleState[] = [
        { name: 'chat', enabled: true, type: 'hot', description: 'Secret description' },
      ]
      const service = createMockFeatureToggleService({ getAll: vi.fn().mockReturnValue(features) })
      const app = createPublicApp({ featureToggleService: service })

      const res = await app.request('/features', { method: 'GET' })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body[0]).not.toHaveProperty('type')
      expect(body[0]).not.toHaveProperty('description')
    })

    it('should return empty array when no features registered', async () => {
      const service = createMockFeatureToggleService({ getAll: vi.fn().mockReturnValue([]) })
      const app = createPublicApp({ featureToggleService: service })

      const res = await app.request('/features', { method: 'GET' })

      expect(res.status).toBe(200)
      const body = await res.json()
      expect(body).toEqual([])
    })
  })
})
