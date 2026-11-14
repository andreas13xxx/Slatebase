import { describe, it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

type Listener = (event: Record<string, unknown>) => void

/** Runs public/sw.js against a fake worker scope and returns its listeners. */
function loadWorker(fetchImpl: (req: unknown) => Promise<unknown>, cached: unknown) {
  const listeners: Record<string, Listener> = {}
  const cache = { add: vi.fn().mockResolvedValue(undefined), match: vi.fn().mockResolvedValue(cached) }
  const caches = {
    open: vi.fn().mockResolvedValue(cache),
    keys: vi.fn().mockResolvedValue(['old', 'slatebase-offline-v1']),
    delete: vi.fn().mockResolvedValue(true),
  }
  const scope = {
    addEventListener: (type: string, fn: Listener) => { listeners[type] = fn },
    skipWaiting: vi.fn(),
    clients: { claim: vi.fn() },
  }
  class FakeRequest { constructor(public url: string) {} }
  const source = readFileSync(resolve(process.cwd(), 'public/sw.js'), 'utf8')
  new Function('self', 'caches', 'fetch', 'Request', 'Response', source)(
    scope, caches, fetchImpl, FakeRequest, { error: () => 'network-error' },
  )
  return { listeners, caches, cache }
}

function fetchEvent(mode: string, method = 'GET') {
  const respondWith = vi.fn()
  return { event: { request: { mode, method }, respondWith }, respondWith }
}

describe('public/sw.js', () => {
  it('answers a failed page navigation with the cached offline page', async () => {
    const offline = { page: 'offline' }
    const { listeners } = loadWorker(() => Promise.reject(new Error('down')), offline)
    const { event, respondWith } = fetchEvent('navigate')
    listeners['fetch']!(event)
    expect(await respondWith.mock.calls[0]![0]).toBe(offline)
  })

  it('passes a working navigation through to the network', async () => {
    const live = { page: 'live' }
    const { listeners } = loadWorker(() => Promise.resolve(live), null)
    const { event, respondWith } = fetchEvent('navigate')
    listeners['fetch']!(event)
    expect(await respondWith.mock.calls[0]![0]).toBe(live)
  })

  it('never intercepts API calls, assets or non-GET requests', () => {
    const { listeners } = loadWorker(() => Promise.reject(new Error('down')), null)
    for (const [mode, method] of [['cors', 'GET'], ['no-cors', 'GET'], ['same-origin', 'GET'], ['navigate', 'POST']] as const) {
      const { event, respondWith } = fetchEvent(mode, method)
      listeners['fetch']!(event)
      expect(respondWith).not.toHaveBeenCalled()
    }
  })

  it('drops old caches on activate', async () => {
    const { listeners, caches } = loadWorker(() => Promise.resolve(null), null)
    const waitUntil = vi.fn()
    listeners['activate']!({ waitUntil })
    await waitUntil.mock.calls[0]![0]
    expect(caches.delete).toHaveBeenCalledWith('old')
    expect(caches.delete).not.toHaveBeenCalledWith('slatebase-offline-v1')
  })
})
