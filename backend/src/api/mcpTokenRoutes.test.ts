// Unit tests for mcpTokenRoutes — Input validation (400 responses)

import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import type { SessionContext } from '../auth/index.js'
import type { ILogger } from '../logger/index.js'
import type { IMcpTokenService } from '../mcp/token-service.js'
import type { ApiTokenInfo, TokenCreateResult, McpTokenContext } from '../mcp/types.js'
import { createMcpTokenRoutes } from './mcpTokenRoutes.js'

// ─── Mock Factories ──────────────────────────────────────────────────────────

function createMockLogger(): ILogger {
  return { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} }
}

function createMockTokenService(overrides: Partial<IMcpTokenService> = {}): IMcpTokenService {
  return {
    createToken: async (): Promise<TokenCreateResult> => ({
      token: 'a'.repeat(128),
      tokenId: 'tok-1',
      name: 'Test Token',
      expiresAt: '2025-06-01T00:00:00.000Z',
    }),
    validateToken: async (): Promise<McpTokenContext> => ({
      tokenId: 'tok-1',
      userId: 'user-1',
      tokenName: 'Test Token',
    }),
    listTokens: async (): Promise<ApiTokenInfo[]> => [],
    revokeToken: async () => {},
    invalidateAllForUser: async () => {},
    recordUsage: () => {},
    ...overrides,
  }
}

// ─── Test App Factory ────────────────────────────────────────────────────────

const defaultSession: SessionContext = {
  userId: 'user-1',
  username: 'testuser',
  role: 'user',
  sessionId: 'session-1',
}

function createTestApp(options: {
  tokenService?: IMcpTokenService
  session?: SessionContext | null
} = {}) {
  const logger = createMockLogger()
  const tokenService = options.tokenService ?? createMockTokenService()

  const app = new Hono()

  // Simulate auth middleware setting session context
  if (options.session !== null) {
    const session = options.session ?? defaultSession
    app.use('*', async (c, next) => {
      c.set('session' as never, session as never)
      return next()
    })
  }

  const routes = createMcpTokenRoutes({ tokenService, logger })
  app.route('/mcp/tokens', routes)
  return app
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('MCP Token Routes — Input Validation', () => {
  describe('POST /mcp/tokens', () => {
    it('returns 400 when body is not valid JSON', async () => {
      const app = createTestApp()

      const res = await app.request('/mcp/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: 'not json',
      })
      expect(res.status).toBe(400)

      const body = await res.json() as { code: string; message: string; timestamp: string }
      expect(body.code).toBe('VALIDATION_ERROR')
      expect(body).toHaveProperty('timestamp')
    })

    it('returns 400 when name is missing', async () => {
      const app = createTestApp()

      const res = await app.request('/mcp/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiryDays: 30 }),
      })
      expect(res.status).toBe(400)

      const body = await res.json() as { code: string }
      expect(body.code).toBe('VALIDATION_ERROR')
    })

    it('returns 400 when name is empty string', async () => {
      const app = createTestApp()

      const res = await app.request('/mcp/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: '', expiryDays: 30 }),
      })
      expect(res.status).toBe(400)

      const body = await res.json() as { code: string }
      expect(body.code).toBe('VALIDATION_ERROR')
    })

    it('returns 400 when expiryDays is below minimum (7)', async () => {
      const app = createTestApp()

      const res = await app.request('/mcp/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test', expiryDays: 1 }),
      })
      expect(res.status).toBe(400)

      const body = await res.json() as { code: string }
      expect(body.code).toBe('VALIDATION_ERROR')
    })

    it('returns 400 when expiryDays exceeds maximum (365)', async () => {
      const app = createTestApp()

      const res = await app.request('/mcp/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Test', expiryDays: 999 }),
      })
      expect(res.status).toBe(400)

      const body = await res.json() as { code: string }
      expect(body.code).toBe('VALIDATION_ERROR')
    })

    it('returns 201 with valid payload', async () => {
      const app = createTestApp()

      const res = await app.request('/mcp/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'My Token', expiryDays: 30 }),
      })
      expect(res.status).toBe(201)
    })

    it('returns 401 when not authenticated', async () => {
      const app = createTestApp({ session: null })

      const res = await app.request('/mcp/tokens', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'My Token', expiryDays: 30 }),
      })
      expect(res.status).toBe(401)

      const body = await res.json() as { code: string }
      expect(body.code).toBe('UNAUTHORIZED')
    })
  })

  describe('DELETE /mcp/tokens/:tokenId', () => {
    it('returns 204 on successful revocation', async () => {
      const app = createTestApp()

      const res = await app.request('/mcp/tokens/valid-token-id', {
        method: 'DELETE',
      })
      expect(res.status).toBe(204)
    })

    it('returns 401 when not authenticated', async () => {
      const app = createTestApp({ session: null })

      const res = await app.request('/mcp/tokens/some-token', {
        method: 'DELETE',
      })
      expect(res.status).toBe(401)

      const body = await res.json() as { code: string }
      expect(body.code).toBe('UNAUTHORIZED')
    })
  })

  describe('GET /mcp/tokens', () => {
    it('returns 200 with token list', async () => {
      const app = createTestApp()

      const res = await app.request('/mcp/tokens')
      expect(res.status).toBe(200)

      const body = await res.json()
      expect(Array.isArray(body)).toBe(true)
    })

    it('returns 401 when not authenticated', async () => {
      const app = createTestApp({ session: null })

      const res = await app.request('/mcp/tokens')
      expect(res.status).toBe(401)

      const body = await res.json() as { code: string }
      expect(body.code).toBe('UNAUTHORIZED')
    })
  })
})
