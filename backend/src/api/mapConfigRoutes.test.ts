// Integration tests for mapConfigRoutes — the public map tile config read.

import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { Hono } from 'hono'
import { mapConfigRoutes } from './mapConfigRoutes.js'

function createApp(): Hono {
  const app = new Hono()
  app.route('', mapConfigRoutes)
  return app
}

describe('GET /api/v1/map-config', () => {
  const originalUrl = process.env['SLATEBASE_MAP_TILE_URL']
  const originalAttr = process.env['SLATEBASE_MAP_TILE_ATTRIBUTION']

  beforeEach(() => {
    delete process.env['SLATEBASE_MAP_TILE_URL']
    delete process.env['SLATEBASE_MAP_TILE_ATTRIBUTION']
  })

  afterEach(() => {
    if (originalUrl === undefined) delete process.env['SLATEBASE_MAP_TILE_URL']
    else process.env['SLATEBASE_MAP_TILE_URL'] = originalUrl
    if (originalAttr === undefined) delete process.env['SLATEBASE_MAP_TILE_ATTRIBUTION']
    else process.env['SLATEBASE_MAP_TILE_ATTRIBUTION'] = originalAttr
  })

  it('returns empty strings when no tile server is configured', async () => {
    const res = await createApp().request('/api/v1/map-config')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ tileUrl: '', attribution: '' })
  })

  it('returns the configured tile URL and attribution', async () => {
    process.env['SLATEBASE_MAP_TILE_URL'] = 'https://tiles.example.com/{z}/{x}/{y}.png'
    process.env['SLATEBASE_MAP_TILE_ATTRIBUTION'] = '© Example'
    const res = await createApp().request('/api/v1/map-config')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({
      tileUrl: 'https://tiles.example.com/{z}/{x}/{y}.png',
      attribution: '© Example',
    })
  })

  it('treats a whitespace-only tile URL as unconfigured', async () => {
    process.env['SLATEBASE_MAP_TILE_URL'] = '   '
    const res = await createApp().request('/api/v1/map-config')
    expect(await res.json()).toEqual({ tileUrl: '', attribution: '' })
  })
})
