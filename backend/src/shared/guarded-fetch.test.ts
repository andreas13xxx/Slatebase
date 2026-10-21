import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import { GuardedFetchError, guardedFetch } from './guarded-fetch.js'

/** Local HTTP server standing in for the upstream; records the headers of every request. */
let server: Server
let base: string
const seenHeaders: IncomingMessage['headers'][] = []

function handler(req: IncomingMessage, res: ServerResponse): void {
  seenHeaders.push(req.headers)
  const url = req.url ?? '/'
  if (url === '/ok') {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('hello')
  } else if (url === '/missing') {
    res.writeHead(404)
    res.end('nope')
  } else if (url === '/redirect-ok') {
    res.writeHead(302, { Location: '/ok' })
    res.end()
  } else if (url === '/redirect-foreign') {
    res.writeHead(302, { Location: 'http://evil.example.test/steal' })
    res.end()
  } else if (url === '/redirect-loop') {
    res.writeHead(302, { Location: '/redirect-loop' })
    res.end()
  } else if (url === '/big-declared') {
    res.writeHead(200, { 'Content-Length': '5000' })
    res.end('a'.repeat(5000))
  } else if (url === '/big-streamed') {
    res.writeHead(200) // chunked: no Content-Length, so only the streaming limit can catch it
    res.write('a'.repeat(3000))
    res.end('a'.repeat(3000))
  } else if (url === '/slow') {
    // never answers within the test timeout
    setTimeout(() => res.end('late'), 2000)
  } else {
    res.writeHead(500)
    res.end()
  }
}

beforeAll(async () => {
  server = createServer(handler)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

const options = { allowedHosts: new Set(['127.0.0.1']), maxBytes: 4096, protocols: ['http:'] as const }

async function failureOf(promise: Promise<unknown>): Promise<GuardedFetchError> {
  try {
    await promise
  } catch (error: unknown) {
    if (error instanceof GuardedFetchError) return error
    throw error
  }
  throw new Error('expected guardedFetch to fail')
}

describe('guardedFetch', () => {
  it('returns status, headers and body of an allowed host', async () => {
    const result = await guardedFetch(`${base}/ok`, options)
    expect(result.status).toBe(200)
    expect(result.body.toString()).toBe('hello')
    expect(result.finalUrl).toBe(`${base}/ok`)
  })

  it('returns a non-2xx status with an empty body instead of throwing', async () => {
    const result = await guardedFetch(`${base}/missing`, options)
    expect(result.status).toBe(404)
    expect(result.body.length).toBe(0)
  })

  it('follows a redirect within the allowlist', async () => {
    const result = await guardedFetch(`${base}/redirect-ok`, options)
    expect(result.status).toBe(200)
    expect(result.finalUrl).toBe(`${base}/ok`)
  })

  it('rejects a redirect to a host outside the allowlist without requesting it', async () => {
    const error = await failureOf(guardedFetch(`${base}/redirect-foreign`, options))
    expect(error.kind).toBe('host-not-allowed')
    expect(error.url).toContain('evil.example.test')
  })

  it('rejects a start URL outside the allowlist or with a disallowed protocol', async () => {
    expect((await failureOf(guardedFetch('http://evil.example.test/x', options))).kind).toBe('host-not-allowed')
    expect((await failureOf(guardedFetch(`${base}/ok`, { ...options, protocols: ['https:'] }))).kind).toBe('host-not-allowed')
    expect((await failureOf(guardedFetch('not a url', options))).kind).toBe('host-not-allowed')
  })

  it('stops following redirects after the limit', async () => {
    const error = await failureOf(guardedFetch(`${base}/redirect-loop`, { ...options, maxRedirects: 3 }))
    expect(error.kind).toBe('too-many-redirects')
  })

  it('rejects a declared body over the limit', async () => {
    expect((await failureOf(guardedFetch(`${base}/big-declared`, options))).kind).toBe('too-large')
  })

  it('aborts a chunked body that grows past the limit while streaming', async () => {
    const error = await failureOf(guardedFetch(`${base}/big-streamed`, { ...options, maxBytes: 4000 }))
    expect(error.kind).toBe('too-large')
  })

  it('accepts a body of exactly maxBytes', async () => {
    const result = await guardedFetch(`${base}/big-declared`, { ...options, maxBytes: 5000 })
    expect(result.body.length).toBe(5000)
  })

  it('times out', async () => {
    const error = await failureOf(guardedFetch(`${base}/slow`, { ...options, timeoutMs: 100 }))
    expect(error.kind).toBe('timeout')
  })

  it('reports a refused connection as a network error, not as a status', async () => {
    const error = await failureOf(guardedFetch('http://127.0.0.1:1/x', options))
    expect(error.kind).toBe('network')
  })

  it('never sends credentials', async () => {
    seenHeaders.length = 0
    await guardedFetch(`${base}/ok`, { ...options, userAgent: 'Test/1.0', accept: 'application/json' })
    const headers = seenHeaders[0]
    expect(headers?.['authorization']).toBeUndefined()
    expect(headers?.['cookie']).toBeUndefined()
    expect(headers?.['user-agent']).toBe('Test/1.0')
    expect(headers?.['accept']).toBe('application/json')
  })
})
