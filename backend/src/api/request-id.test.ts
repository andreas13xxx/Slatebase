import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import { createRequestIdMiddleware } from './request-id.js'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function appWithMiddleware(): Hono {
  const app = new Hono()
  app.use('*', createRequestIdMiddleware())
  app.get('/', (c) => c.json({ ok: true }))
  return app
}

describe('createRequestIdMiddleware', () => {
  it('reuses a safe incoming X-Request-Id', async () => {
    const res = await appWithMiddleware().request('/', { headers: { 'X-Request-Id': 'abc-123_DEF.~' } })
    expect(res.headers.get('X-Request-Id')).toBe('abc-123_DEF.~')
  })

  it('generates a UUID when no incoming id is present', async () => {
    const res = await appWithMiddleware().request('/')
    expect(res.headers.get('X-Request-Id')).toMatch(UUID_RE)
  })

  it('rejects an id with separator/control characters (injection surface) and generates a UUID', async () => {
    // A raw CR/LF value cannot be built via the Headers constructor, but a tab,
    // semicolon or angle brackets can slip through an upstream proxy and must not
    // be echoed into logs or the response header. The charset guard rejects them.
    for (const bad of ['has\ttab', 'a;b=c', 'a<b>c', 'a b']) {
      const res = await appWithMiddleware().request('/', { headers: { 'X-Request-Id': bad } })
      expect(res.headers.get('X-Request-Id')).not.toBe(bad)
      expect(res.headers.get('X-Request-Id')).toMatch(UUID_RE)
    }
  })

  it('rejects an over-long id (>128 chars) and generates a UUID', async () => {
    const res = await appWithMiddleware().request('/', { headers: { 'X-Request-Id': 'a'.repeat(129) } })
    expect(res.headers.get('X-Request-Id')).toMatch(UUID_RE)
  })
})
