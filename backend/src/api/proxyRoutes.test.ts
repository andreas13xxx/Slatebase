// Proxy Routes — Unit tests

import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Hono } from 'hono'
import type { Context } from 'hono'
import { createProxyRoutes } from './proxyRoutes.js'
import type { ProxyRoutesDeps } from './proxyRoutes.js'
import type { ILogger } from '../logger/index.js'
import { SlidingWindowRateLimiter } from '../shared/sliding-window-rate-limiter.js'

// `vi.mock` factories are hoisted above the file's top-level `const`s, so the mock
// functions referenced inside them must go through `vi.hoisted` instead.
const { mockDnsLookup, mockFetch } = vi.hoisted(() => ({
  mockDnsLookup: vi.fn(),
  mockFetch: vi.fn(),
}))

// The route resolves hostnames via `node:dns/promises` before ever touching the network,
// so DNS is mocked here rather than hit for real. Production code imports the *default*
// export (`import dns from 'node:dns/promises'`), so both the default and the named
// `lookup` must point at the same mock function.
vi.mock('node:dns/promises', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:dns/promises')>()
  const actualDefault = (actual as { default?: object }).default ?? {}
  return {
    ...actual,
    lookup: mockDnsLookup,
    default: { ...actualDefault, lookup: mockDnsLookup },
  }
})

// The actual HTTP call is mocked at the `undici.fetch` level — `Agent` is left real so the
// DNS-rebinding pinning logic (building a per-hop Agent with a custom `connect.lookup`) is
// still exercised, it just never opens a real socket because `fetch` never uses it for real.
vi.mock('undici', async (importOriginal) => {
  const actual = await importOriginal<typeof import('undici')>()
  return {
    ...actual,
    fetch: mockFetch,
  }
})

// ─── Mock Factories ──────────────────────────────────────────────────────────

function createMockLogger(): ILogger {
  return {
    debug: () => {},
    info: () => {},
    warn: () => {},
    error: () => {},
  }
}

/** A public (non-private) IPv4 address for tests that need one to resolve cleanly. */
const PUBLIC_IP = '93.184.216.34'
const PRIVATE_IP = '10.0.0.5'

function mockDnsResolves(address: string, family: 4 | 6 = 4): void {
  mockDnsLookup.mockResolvedValueOnce([{ address, family }])
}

function fakeUpstreamResponse(init: { status?: number; headers?: Record<string, string>; body?: string | Uint8Array } = {}): Response {
  const { status = 200, headers = { 'content-type': 'text/plain' }, body = 'ok' } = init
  return new Response(body, { status, headers }) as unknown as Response
}

// ─── Test App Setup ──────────────────────────────────────────────────────────

function createTestApp(overrides: Partial<ProxyRoutesDeps> = {}) {
  const defaultDeps: ProxyRoutesDeps = {
    logger: createMockLogger(),
    allowedOrigins: ['example.com', '*.wildcard.example.com'],
    rateLimiter: new SlidingWindowRateLimiter(60, 60_000),
    ...overrides,
  }

  const proxyRoutes = createProxyRoutes(defaultDeps)

  const app = new Hono()
  app.use('*', async (c: Context, next) => {
    c.set('session', { userId: 'user-1', username: 'testuser', role: 'user' })
    await next()
  })
  app.route('/api/v1', proxyRoutes)

  return { app, deps: defaultDeps }
}

async function postProxy(app: Hono, payload: Record<string, unknown>) {
  return app.request('/api/v1/proxy', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('proxyRoutes', () => {
  beforeEach(() => {
    mockDnsLookup.mockReset()
    mockFetch.mockReset()
  })

  describe('default-deny', () => {
    it('returns 403 PROXY_NOT_CONFIGURED when allowedOrigins is empty', async () => {
      const { app } = createTestApp({ allowedOrigins: [] })

      const res = await postProxy(app, { url: 'https://example.com/data' })

      expect(res.status).toBe(403)
      const body = await res.json() as { code: string }
      expect(body.code).toBe('PROXY_NOT_CONFIGURED')
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe('allowlist matching', () => {
    it('allows a request to an exact-match allowed host', async () => {
      mockDnsResolves(PUBLIC_IP)
      mockFetch.mockResolvedValueOnce(fakeUpstreamResponse({ body: 'hello' }))
      const { app } = createTestApp()

      const res = await postProxy(app, { url: 'https://example.com/data' })

      expect(res.status).toBe(200)
      const body = await res.json() as { status: number; text: string }
      expect(body.status).toBe(200)
      expect(body.text).toBe('hello')
    })

    it('allows a request to a host matching a wildcard pattern', async () => {
      mockDnsResolves(PUBLIC_IP)
      mockFetch.mockResolvedValueOnce(fakeUpstreamResponse())
      const { app } = createTestApp()

      const res = await postProxy(app, { url: 'https://sub.wildcard.example.com/data' })

      expect(res.status).toBe(200)
    })

    it('blocks a request to a host not on the allowlist', async () => {
      mockDnsResolves(PUBLIC_IP)
      const { app } = createTestApp()

      const res = await postProxy(app, { url: 'https://not-allowed.example.org/data' })

      expect(res.status).toBe(403)
      const body = await res.json() as { code: string }
      expect(body.code).toBe('PROXY_BLOCKED')
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })

  describe('SSRF / private address protection', () => {
    it('blocks a request whose hostname resolves to a private IP', async () => {
      mockDnsResolves(PRIVATE_IP)
      const { app } = createTestApp({ allowedOrigins: ['internal-looking.example.com'] })

      const res = await postProxy(app, { url: 'https://internal-looking.example.com/data' })

      expect(res.status).toBe(403)
      const body = await res.json() as { code: string }
      expect(body.code).toBe('PROXY_BLOCKED')
      expect(mockFetch).not.toHaveBeenCalled()
    })

    it('blocks a literal private IP URL outright', async () => {
      const { app } = createTestApp({ allowedOrigins: ['10.0.0.5'] })

      const res = await postProxy(app, { url: 'http://10.0.0.5/data' })

      expect(res.status).toBe(403)
      expect(mockDnsLookup).not.toHaveBeenCalled()
    })
  })

  describe('redirect re-validation', () => {
    it('blocks a redirect to a private/internal address', async () => {
      mockDnsResolves(PUBLIC_IP) // initial hop
      mockDnsResolves(PRIVATE_IP) // redirect target
      mockFetch.mockResolvedValueOnce(
        fakeUpstreamResponse({ status: 302, headers: { location: 'https://internal.example.com/data' } }),
      )
      const { app } = createTestApp({ allowedOrigins: ['example.com', 'internal.example.com'] })

      const res = await postProxy(app, { url: 'https://example.com/redirect' })

      expect(res.status).toBe(403)
      const body = await res.json() as { code: string; message: string }
      expect(body.code).toBe('PROXY_BLOCKED')
      expect(body.message).toMatch(/private\/internal/)
      expect(mockFetch).toHaveBeenCalledTimes(1) // never followed the redirect
    })

    it('blocks a redirect to a host outside the allowlist', async () => {
      mockDnsResolves(PUBLIC_IP) // initial hop
      mockDnsResolves(PUBLIC_IP) // redirect target (publicly resolvable, just not allowlisted)
      mockFetch.mockResolvedValueOnce(
        fakeUpstreamResponse({ status: 302, headers: { location: 'https://not-allowed.example.org/data' } }),
      )
      const { app } = createTestApp({ allowedOrigins: ['example.com'] })

      const res = await postProxy(app, { url: 'https://example.com/redirect' })

      expect(res.status).toBe(403)
      const body = await res.json() as { code: string; message: string }
      expect(body.message).toMatch(/not in the allowed origins list/)
      expect(mockFetch).toHaveBeenCalledTimes(1)
    })

    it('follows a redirect to an allowed, public target', async () => {
      mockDnsResolves(PUBLIC_IP) // initial hop
      mockDnsResolves(PUBLIC_IP) // redirect target
      mockFetch
        .mockResolvedValueOnce(fakeUpstreamResponse({ status: 302, headers: { location: 'https://example.com/final' } }))
        .mockResolvedValueOnce(fakeUpstreamResponse({ body: 'final content' }))
      const { app } = createTestApp()

      const res = await postProxy(app, { url: 'https://example.com/redirect' })

      expect(res.status).toBe(200)
      const body = await res.json() as { text: string }
      expect(body.text).toBe('final content')
      expect(mockFetch).toHaveBeenCalledTimes(2)
    })
  })

  describe('response size limit', () => {
    it('returns 502 RESPONSE_TOO_LARGE when the streamed body exceeds 50 MB', async () => {
      mockDnsResolves(PUBLIC_IP)
      const oversized = new Uint8Array(51 * 1024 * 1024)
      mockFetch.mockResolvedValueOnce(fakeUpstreamResponse({ body: oversized }))
      const { app } = createTestApp()

      const res = await postProxy(app, { url: 'https://example.com/huge' })

      expect(res.status).toBe(502)
      const body = await res.json() as { code: string }
      expect(body.code).toBe('RESPONSE_TOO_LARGE')
    })
  })

  describe('rate limiting', () => {
    it('returns 429 RATE_LIMITED once the per-user request budget is exhausted', async () => {
      mockDnsLookup.mockResolvedValue([{ address: PUBLIC_IP, family: 4 }])
      mockFetch.mockResolvedValue(fakeUpstreamResponse())
      const { app } = createTestApp({ rateLimiter: new SlidingWindowRateLimiter(2, 60_000) })

      const first = await postProxy(app, { url: 'https://example.com/a' })
      const second = await postProxy(app, { url: 'https://example.com/b' })
      const third = await postProxy(app, { url: 'https://example.com/c' })

      expect(first.status).toBe(200)
      expect(second.status).toBe(200)
      expect(third.status).toBe(429)
      const body = await third.json() as { code: string }
      expect(body.code).toBe('RATE_LIMITED')
      expect(third.headers.get('Retry-After')).not.toBeNull()
      expect(mockFetch).toHaveBeenCalledTimes(2) // the rate-limited request never reached fetch
    })
  })

  describe('request validation', () => {
    it('rejects a malformed URL', async () => {
      const { app } = createTestApp()

      const res = await postProxy(app, { url: 'not-a-url' })

      expect(res.status).toBe(400)
      expect(mockFetch).not.toHaveBeenCalled()
    })
  })
})
