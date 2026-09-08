import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import { createHealthRoutes } from './healthRoutes.js'

function createApp(isReady: () => boolean): Hono {
  const app = new Hono()
  app.route('', createHealthRoutes({ isReady }))
  return app
}

describe('healthRoutes', () => {
  describe('GET /healthz', () => {
    it('always returns 200, regardless of readiness', async () => {
      const app = createApp(() => false)
      const res = await app.request('/healthz')

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ status: 'ok' })
    })
  })

  describe('GET /readyz', () => {
    it('returns 200 when isReady() returns true', async () => {
      const app = createApp(() => true)
      const res = await app.request('/readyz')

      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ status: 'ok' })
    })

    it('returns 503 when isReady() returns false', async () => {
      const app = createApp(() => false)
      const res = await app.request('/readyz')

      expect(res.status).toBe(503)
      expect(await res.json()).toEqual({ status: 'unavailable' })
    })
  })
})
