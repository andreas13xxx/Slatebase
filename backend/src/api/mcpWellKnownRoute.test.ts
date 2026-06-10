/**
 * Unit tests for the MCP well-known discovery endpoint.
 */

import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import { createMcpWellKnownHandler } from './mcpWellKnownRoute.js'
import type { IFeatureToggleService } from '../feature-toggle/types.js'

function createMockFeatureToggleService(mcpEnabled: boolean): IFeatureToggleService {
  return {
    isEnabled: (name: string) => name === 'mcp' ? mcpEnabled : false,
    setEnabled: () => ({ name: 'mcp', enabled: mcpEnabled, restartRequired: false }),
    getAll: () => [],
    get: () => undefined,
    onChange: () => {},
  }
}

function createTestApp(mcpEnabled: boolean): Hono {
  const app = new Hono()
  app.get('/.well-known/mcp.json', createMcpWellKnownHandler(createMockFeatureToggleService(mcpEnabled)))
  return app
}

describe('GET /.well-known/mcp.json', () => {
  it('returns 200 with discovery metadata when MCP is enabled', async () => {
    const app = createTestApp(true)

    const res = await app.request('/.well-known/mcp.json')

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('application/json')

    const body = await res.json()
    expect(body).toEqual({
      endpoint: '/api/v1/mcp',
      authentication: {
        type: 'bearer',
        token_url: '/api/v1/mcp/tokens',
      },
      capabilities: ['resources', 'tools'],
    })
  })

  it('returns 404 when MCP is disabled', async () => {
    const app = createTestApp(false)

    const res = await app.request('/.well-known/mcp.json')

    expect(res.status).toBe(404)

    const body = await res.json() as { code: string; message: string; timestamp: string }
    expect(body.code).toBe('NOT_FOUND')
    expect(body.message).toBe('Not found')
    expect(body.timestamp).toBeDefined()
  })

  it('returns correct content-type header', async () => {
    const app = createTestApp(true)

    const res = await app.request('/.well-known/mcp.json')

    expect(res.headers.get('content-type')).toContain('application/json')
  })

  it('does not require authentication', async () => {
    const app = createTestApp(true)

    // No Authorization header — should still succeed
    const res = await app.request('/.well-known/mcp.json')

    expect(res.status).toBe(200)
  })
})
