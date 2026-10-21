import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { ILogger } from '../logger/index.js'
import { MAX_THEME_CSS_SIZE } from '../themes/validation.js'
import {
  ThemeAssetTooLargeError,
  ThemeFilesNotFoundError,
  ThemeManifestInvalidError,
  ThemeStoreFetchError,
} from './errors.js'
import { ThemeStoreClient } from './theme-store-client.js'

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)])
const CATALOG = [
  { name: 'Good', author: 'a', repo: 'o/good', screenshot: 'screenshot.png', modes: ['dark', 'light'] },
  { name: 'Legacy', author: 'a', repo: 'o/legacy', screenshot: '', modes: ['dark'], legacy: true },
  { name: 'Bad repo', author: 'a', repo: '../escape', screenshot: '', modes: [] },
  { name: '', author: 'a', repo: 'o/noname', screenshot: '', modes: [] },
  'not an object',
]

/** Paths the local stand-in for raw.githubusercontent.com has been asked for. */
const requests: string[] = []

function respond(req: IncomingMessage, res: ServerResponse): void {
  const url = req.url ?? '/'
  requests.push(url)
  const send = (status: number, body: string | Buffer = '', type = 'text/plain') => {
    res.writeHead(status, { 'Content-Type': type })
    res.end(body)
  }
  if (url.endsWith('/community-css-themes.json')) return send(200, JSON.stringify(CATALOG), 'application/json')
  if (url === '/o/good/HEAD/manifest.json') return send(200, '\uFEFF' + JSON.stringify({ name: 'Good', version: '1.2.0' }), 'application/json')
  if (url === '/o/good/HEAD/theme.css') return send(200, 'body { --x: 1 }')
  if (url === '/o/good/HEAD/screenshot.png') return send(200, PNG, 'image/png')
  if (url === '/o/fake/HEAD/screenshot.png') return send(200, '<svg onload="alert(1)"/>', 'image/png')
  if (url === '/o/big/HEAD/manifest.json') return send(200, JSON.stringify({ name: 'Big' }))
  if (url === '/o/big/HEAD/theme.css') return send(200, Buffer.alloc(MAX_THEME_CSS_SIZE + 1, 'a'), 'text/css')
  if (url === '/o/exact/HEAD/manifest.json') return send(200, JSON.stringify({ name: 'Exact' }))
  if (url === '/o/exact/HEAD/theme.css') return send(200, Buffer.alloc(MAX_THEME_CSS_SIZE, 'a'), 'text/css')
  if (url === '/o/notjson/HEAD/manifest.json') return send(200, '{ nope')
  if (url === '/o/notjson/HEAD/theme.css') return send(200, 'a{}')
  if (url === '/o/array/HEAD/manifest.json') return send(200, '[1,2]')
  if (url === '/o/array/HEAD/theme.css') return send(200, 'a{}')
  if (url === '/o/nocss/HEAD/manifest.json') return send(200, JSON.stringify({ name: 'NoCss' }))
  if (url === '/o/broken/HEAD/manifest.json') return send(503)
  send(404)
}

let server: Server
let base: string
const warnings: string[] = []
const logger: ILogger = {
  debug: () => undefined,
  info: () => undefined,
  warn: (message) => { warnings.push(message) },
  error: () => undefined,
}

beforeAll(async () => {
  server = createServer(respond)
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
})

afterAll(async () => {
  server.closeAllConnections()
  await new Promise<void>((resolve) => server.close(() => resolve()))
})

const client = () => new ThemeStoreClient(logger, { rawBaseUrl: base })

describe('fetchCatalog', () => {
  it('returns valid entries and skips malformed ones with a warning', async () => {
    warnings.length = 0
    const entries = await client().fetchCatalog()
    expect(entries.map((e) => e.name)).toEqual(['Good', 'Legacy'])
    expect(entries[1]?.legacy).toBe(true)
    expect(warnings.filter((m) => m === 'Skipping malformed community theme entry')).toHaveLength(3)
  })
})

describe('fetchThemeFiles', () => {
  it('returns css and the parsed manifest (BOM tolerated)', async () => {
    const files = await client().fetchThemeFiles('o/good')
    expect(files.css).toBe('body { --x: 1 }')
    expect(files.manifest).toEqual({ name: 'Good', version: '1.2.0' })
  })

  it('accepts a stylesheet of exactly the limit and rejects one byte more', async () => {
    expect((await client().fetchThemeFiles('o/exact')).css.length).toBe(MAX_THEME_CSS_SIZE)
    await expect(client().fetchThemeFiles('o/big')).rejects.toBeInstanceOf(ThemeAssetTooLargeError)
  })

  it('names the missing file when the repo has no theme.css or no manifest.json', async () => {
    await expect(client().fetchThemeFiles('o/nocss')).rejects.toMatchObject({ name: 'ThemeFilesNotFoundError', missing: 'theme.css' })
    await expect(client().fetchThemeFiles('o/none')).rejects.toBeInstanceOf(ThemeFilesNotFoundError)
  })

  it('rejects a manifest that is not a JSON object', async () => {
    await expect(client().fetchThemeFiles('o/notjson')).rejects.toBeInstanceOf(ThemeManifestInvalidError)
    await expect(client().fetchThemeFiles('o/array')).rejects.toBeInstanceOf(ThemeManifestInvalidError)
  })

  it('reports a 5xx as a fetch error, never as "files not found"', async () => {
    await expect(client().fetchManifest('o/broken')).rejects.toBeInstanceOf(ThemeStoreFetchError)
  })

  it('never builds a URL from an invalid repo', async () => {
    requests.length = 0
    await expect(client().fetchThemeFiles('../etc')).rejects.toBeInstanceOf(ThemeStoreFetchError)
    await expect(client().fetchThemeFiles('a/b/c')).rejects.toBeInstanceOf(ThemeStoreFetchError)
    expect(requests).toEqual([])
  })
})

describe('fetchScreenshot', () => {
  it('returns a PNG with the type taken from its bytes', async () => {
    const shot = await client().fetchScreenshot('o/good', './screenshot.png')
    expect(shot?.contentType).toBe('image/png')
    expect(shot?.data.length).toBe(PNG.length)
  })

  it('ignores the upstream Content-Type: an SVG labelled image/png is rejected', async () => {
    expect(await client().fetchScreenshot('o/fake', 'screenshot.png')).toBeNull()
  })

  it('returns null for a missing file, an empty or traversing path and an invalid repo', async () => {
    expect(await client().fetchScreenshot('o/good', 'nope.png')).toBeNull()
    expect(await client().fetchScreenshot('o/good', '')).toBeNull()
    expect(await client().fetchScreenshot('o/good', '../x.png')).toBeNull()
    expect(await client().fetchScreenshot('../bad', 'screenshot.png')).toBeNull()
  })
})

describe('host restriction', () => {
  it('only requests the configured origin', async () => {
    requests.length = 0
    await client().fetchThemeFiles('o/good')
    expect(requests.every((r) => r.startsWith('/o/good/HEAD/'))).toBe(true)
  })

  it('reports an unreachable origin as a fetch error', async () => {
    const dead = new ThemeStoreClient(logger, { rawBaseUrl: 'http://127.0.0.1:1' })
    await expect(dead.fetchCatalog()).rejects.toBeInstanceOf(ThemeStoreFetchError)
  })
})
