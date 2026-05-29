/**
 * Unit tests for the MCP well-known discovery endpoint.
 */

import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import { createMcpWellKnownHandler } from './mcpWellKnownRoute.js'
import type { McpConfig } from '../mcp/config.js'

function createTestApp(mcpConfig: McpConfig): Hono {
  const app = new Hono()
  app.get('/.well-known/mcp.json', createMcpWellKnownHandler(mcpConfig))
  return app
}

function createEnabledConfig(): McpConfig {
  return {
    enabled: true,
    maxFileSize: 5242880,
    rateLimit: 60,
    maxTokensPerUser: 10,
  }
}

function createDisabledConfig(): McpConfig {
  return {
    enabled: false,
    maxFileSize: 5242880,
    rateLimit: 60,
    maxTokensPerUser: 10,
  }
}

describe('GET /.well-known/mcp.json', () => {
  it('returns 200 with discovery metadata when MCP is enabled', async () => {
    const app = createTestApp(createEnabledConfig())

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
    const app = createTestApp(createDisabledConfig())

    const res = await app.request('/.well-known/mcp.json')

    expect(res.status).toBe(404)

    const body = await res.json() as { code: string; message: string; timestamp: string }
    expect(body.code).toBe('NOT_FOUND')
    expect(body.message).toBe('Not found')
    expect(body.timestamp).toBeDefined()
  })

  it('returns correct content-type header', async () => {
    const app = createTestApp(createEnabledConfig())

    const res = await app.request('/.well-known/mcp.json')

    expect(res.headers.get('content-type')).toContain('application/json')
  })

  it('does not require authentication', async () => {
    const app = createTestApp(createEnabledConfig())

    // No Authorization header — should still succeed
    const res = await app.request('/.well-known/mcp.json')

    expect(res.status).toBe(200)
  })
})
