import { describe, expect, it } from 'vitest'
import { Hono } from 'hono'
import type { Context, Next } from 'hono'
import type { AuditEntry, IAuditService } from '../audit/index.js'
import type { SessionContext } from '../auth/index.js'
import type { ILogger } from '../logger/index.js'
import { createPublicShareService } from '../public-share/index.js'
import { createMockStore, createMockVaultAccess } from '../public-share/test-helpers.js'
import { createPublicShareManagementRoutes, createPublicShareReaderRoutes } from './publicShareRoutes.js'

const logger: ILogger = { debug() {}, info() {}, warn() {}, error() {} }
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47])
const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'

function setup(options: { requestsPerMinute?: number; passwordAttempts?: number } = {}) {
  const files: Record<string, string | Buffer> = {
    'Note.md': '---\nsecret: 1\n---\n# Hi\n![[pic.png]] ![[drawing.svg]] ![[Inner]]',
    'Inner.md': 'inner text',
    'pic.png': PNG,
    'drawing.svg': Buffer.from(SVG),
    'Other.md': 'not embedded',
  }
  const service = createPublicShareService({ store: createMockStore(), vault: createMockVaultAccess(files) })
  const audit: Array<Omit<AuditEntry, 'timestamp'>> = []
  const auditService = { log: async (entry: Omit<AuditEntry, 'timestamp'>) => { audit.push(entry) } } as unknown as IAuditService

  let session: SessionContext = { userId: 'u1', username: 'alice', role: 'user', sessionId: 's1' }
  const app = new Hono()
  app.use('*', async (c: Context, next: Next) => {
    c.set('session', session)
    c.set('clientIp', c.req.header('x-test-ip') ?? '10.0.0.1')
    await next()
  })
  app.route('/api/v1', createPublicShareManagementRoutes({ service, auditService, logger }))
  app.route(
    '/api/v1/public/s',
    createPublicShareReaderRoutes({
      service,
      auditService,
      logger,
      cookieConfig: { trustedProxies: [], cookieSecureMode: 'false' },
      ...options,
    }),
  )

  const json = (body: unknown) => ({ method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })
  const create = async (body: Record<string, unknown> = { path: 'Note.md' }, vaultId = 'v1') => {
    const res = await app.request(`/api/v1/vaults/${vaultId}/public-shares`, json(body))
    return { res, body: (await res.json()) as { token: string; share: { id: string }; path: string } }
  }

  return { app, service, audit, files, json, create, setSession: (s: SessionContext) => { session = s } }
}

describe('management routes', () => {
  it('creates a link and returns the token once', async () => {
    const { create, app } = setup()
    const { res, body } = await create()
    expect(res.status).toBe(201)
    expect(body.token).toMatch(/^[A-Za-z0-9_-]{20,}$/)
    expect(body.path).toBe(`/s/${body.token}`)
    expect(JSON.stringify(body.share)).not.toContain('Hash')

    const list = (await (await app.request('/api/v1/vaults/v1/public-shares')).json()) as { shares: unknown[] }
    expect(list.shares).toHaveLength(1)
    expect(JSON.stringify(list)).not.toContain(body.token)
  })

  it('maps errors: invalid body 400, hidden path 400, duplicate 409', async () => {
    const { create, app, json } = setup()
    expect((await app.request('/api/v1/vaults/v1/public-shares', { method: 'POST', body: 'nope' })).status).toBe(400)
    expect((await app.request('/api/v1/vaults/v1/public-shares', json({}))).status).toBe(400)
    expect((await create({ path: '.obsidian/x.md' })).res.status).toBe(400)
    expect((await create({ path: 'Note.md' })).res.status).toBe(201)
    expect((await create({ path: 'Note.md' })).res.status).toBe(409)
  })

  it('previews embeds', async () => {
    const { app } = setup()
    const res = await app.request('/api/v1/vaults/v1/public-shares/preview?path=Note.md')
    expect(res.status).toBe(200)
    const body = (await res.json()) as { embeds: Array<{ ref: string; kind: string }> }
    expect(body.embeds.map((e) => e.ref).sort()).toEqual(['Inner', 'drawing.svg', 'pic.png'])
    expect((await app.request('/api/v1/vaults/v1/public-shares/preview')).status).toBe(400)
  })

  it('updates and revokes, but never across vaults', async () => {
    const { create, app, json } = setup()
    const { body } = await create()
    const id = body.share.id

    expect((await app.request(`/api/v1/vaults/other/public-shares/${id}`, { ...json({ password: 'long-enough-password' }), method: 'PUT' })).status).toBe(404)
    expect((await app.request(`/api/v1/vaults/other/public-shares/${id}`, { method: 'DELETE' })).status).toBe(404)

    const put = await app.request(`/api/v1/vaults/v1/public-shares/${id}`, { ...json({ password: 'long-enough-password' }), method: 'PUT' })
    expect(put.status).toBe(200)
    expect(((await put.json()) as { share: { passwordProtected: boolean } }).share.passwordProtected).toBe(true)

    expect((await app.request(`/api/v1/vaults/v1/public-shares/${id}`, { method: 'DELETE' })).status).toBe(204)
    expect((await app.request(`/api/v1/public/s/${body.token}`)).status).toBe(404)
  })

  it('lists own links and revokes only own links via /public-shares', async () => {
    const { create, app, setSession } = setup()
    const { body } = await create()
    const mine = (await (await app.request('/api/v1/public-shares')).json()) as { shares: unknown[] }
    expect(mine.shares).toHaveLength(1)

    setSession({ userId: 'u2', username: 'bob', role: 'user', sessionId: 's2' })
    const others = (await (await app.request('/api/v1/public-shares')).json()) as { shares: unknown[] }
    expect(others.shares).toHaveLength(0)
    expect((await app.request(`/api/v1/public-shares/${body.share.id}`, { method: 'DELETE' })).status).toBe(404)

    setSession({ userId: 'u1', username: 'alice', role: 'user', sessionId: 's1' })
    expect((await app.request(`/api/v1/public-shares/${body.share.id}`, { method: 'DELETE' })).status).toBe(204)
  })

  it('audits create, update and revoke without the token', async () => {
    const { create, app, json, audit } = setup()
    const { body } = await create()
    await app.request(`/api/v1/vaults/v1/public-shares/${body.share.id}`, { ...json({ expiresAt: '2999-01-01T00:00:00.000Z' }), method: 'PUT' })
    await app.request(`/api/v1/vaults/v1/public-shares/${body.share.id}`, { method: 'DELETE' })
    await new Promise((r) => setTimeout(r, 0))
    expect(audit.map((a) => a.action)).toEqual(['PUBLIC_SHARE_CREATED', 'PUBLIC_SHARE_UPDATED', 'PUBLIC_SHARE_REVOKED'])
    expect(JSON.stringify(audit)).not.toContain(body.token)
    expect(audit.every((a) => a.userId === 'u1' && a.success)).toBe(true)
  })
})

describe('reader routes', () => {
  it('serves the note without frontmatter, with embeds and anti-cache headers', async () => {
    const { create, app } = setup()
    const { body } = await create()
    const res = await app.request(`/api/v1/public/s/${body.token}`)
    expect(res.status).toBe(200)
    expect(res.headers.get('cache-control')).toBe('no-store')
    expect(res.headers.get('x-robots-tag')).toContain('noindex')
    const view = (await res.json()) as { title: string; markdown: string; embeds: Record<string, { kind: string }> }
    expect(view.title).toBe('Note')
    expect(view.markdown).not.toContain('secret')
    expect(view.embeds['Inner']).toEqual({ kind: 'note', markdown: 'inner text' })
    expect(JSON.stringify(view)).not.toContain('Other')
  })

  it('serves embedded assets inline, and forces SVG to download', async () => {
    const { create, app } = setup()
    const { body } = await create()
    const png = await app.request(`/api/v1/public/s/${body.token}/asset?ref=pic.png`)
    expect(png.status).toBe(200)
    expect(png.headers.get('content-type')).toBe('image/png')
    expect(png.headers.get('content-disposition')).toBe('inline')
    expect(png.headers.get('cache-control')).toBe('no-store')
    expect(Buffer.from(await png.arrayBuffer())).toEqual(PNG)

    const svg = await app.request(`/api/v1/public/s/${body.token}/asset?ref=drawing.svg`)
    expect(svg.headers.get('content-disposition')).toBe('attachment')
  })

  it('refuses assets that are not embedded and missing refs', async () => {
    const { create, app } = setup()
    const { body } = await create()
    for (const ref of ['Other.md', '../x', 'nope.png', '']) {
      expect((await app.request(`/api/v1/public/s/${body.token}/asset?ref=${encodeURIComponent(ref)}`)).status).toBe(404)
    }
    expect((await app.request(`/api/v1/public/s/${body.token}/asset`)).status).toBe(404)
  })

  it('answers unknown, revoked and expired links identically', async () => {
    const { create, app, service } = setup()
    const { body } = await create()
    await service.revoke(body.share.id)
    const unknown = await app.request('/api/v1/public/s/doesnotexist')
    const revoked = await app.request(`/api/v1/public/s/${body.token}`)
    expect(unknown.status).toBe(404)
    expect(revoked.status).toBe(404)
    const strip = async (r: Response) => ({ ...((await r.json()) as object), timestamp: '' })
    expect(await strip(unknown)).toEqual(await strip(revoked))
  })

  describe('password protection', () => {
    it('requires the password, unlocks with a link-scoped cookie, and keeps it per link', async () => {
      const { create, app, json } = setup()
      const a = await create({ path: 'Note.md', password: 'long-enough-password' })
      const b = await create({ path: 'Inner.md', password: 'long-enough-password' })

      const locked = await app.request(`/api/v1/public/s/${a.body.token}`)
      expect(locked.status).toBe(401)
      expect(((await locked.json()) as { code: string }).code).toBe('PASSWORD_REQUIRED')
      expect((await app.request(`/api/v1/public/s/${a.body.token}/asset?ref=pic.png`)).status).toBe(401)

      const wrong = await app.request(`/api/v1/public/s/${a.body.token}/unlock`, json({ password: 'wrong-password-123' }))
      expect(wrong.status).toBe(401)
      expect(wrong.headers.get('set-cookie')).toBeNull()

      const ok = await app.request(`/api/v1/public/s/${a.body.token}/unlock`, json({ password: 'long-enough-password' }))
      expect(ok.status).toBe(204)
      const setCookie = ok.headers.get('set-cookie')!
      expect(setCookie).toContain('HttpOnly')
      expect(setCookie).toContain('SameSite=Strict')
      expect(setCookie).toContain(`Path=/api/v1/public/s/${a.body.token}`)
      const cookie = setCookie.split(';')[0]!

      expect((await app.request(`/api/v1/public/s/${a.body.token}`, { headers: { cookie } })).status).toBe(200)
      expect((await app.request(`/api/v1/public/s/${a.body.token}/asset?ref=pic.png`, { headers: { cookie } })).status).toBe(200)
      // The cookie of link A does not open link B, even if sent along.
      expect((await app.request(`/api/v1/public/s/${b.body.token}`, { headers: { cookie } })).status).toBe(401)
    })

    it('invalidates the cookie when the password changes or is removed', async () => {
      const { create, app, json } = setup()
      const { body } = await create({ path: 'Note.md', password: 'long-enough-password' })
      const ok = await app.request(`/api/v1/public/s/${body.token}/unlock`, json({ password: 'long-enough-password' }))
      const cookie = ok.headers.get('set-cookie')!.split(';')[0]!

      await app.request(`/api/v1/vaults/v1/public-shares/${body.share.id}`, { ...json({ password: 'a-brand-new-password' }), method: 'PUT' })
      expect((await app.request(`/api/v1/public/s/${body.token}`, { headers: { cookie } })).status).toBe(401)

      await app.request(`/api/v1/vaults/v1/public-shares/${body.share.id}`, { ...json({ password: null }), method: 'PUT' })
      expect((await app.request(`/api/v1/public/s/${body.token}`)).status).toBe(200)
    })

    it('rejects forged and expired cookies', async () => {
      const { create, app } = setup()
      const { body } = await create({ path: 'Note.md', password: 'long-enough-password' })
      const name = `sb_share_${(await import('../public-share/index.js')).hashToken(body.token).slice(0, 16)}`
      for (const value of [`${Date.now() + 60_000}.forged`, `${Date.now() - 1000}.x`, 'garbage', '.']) {
        const res = await app.request(`/api/v1/public/s/${body.token}`, { headers: { cookie: `${name}=${value}` } })
        expect(res.status).toBe(401)
      }
    })

    it('blocks repeated wrong passwords per address and link', async () => {
      const { create, app, json } = setup({ passwordAttempts: 3 })
      const { body } = await create({ path: 'Note.md', password: 'long-enough-password' })
      const attempt = (ip: string, password = 'wrong-password-123') =>
        app.request(`/api/v1/public/s/${body.token}/unlock`, { ...json({ password }), headers: { 'content-type': 'application/json', 'x-test-ip': ip } })

      for (let i = 0; i < 3; i++) expect((await attempt('1.1.1.1')).status).toBe(401)
      const blocked = await attempt('1.1.1.1', 'long-enough-password')
      expect(blocked.status).toBe(429)
      expect(blocked.headers.get('retry-after')).not.toBeNull()
      // Another address is not affected.
      expect((await attempt('2.2.2.2', 'long-enough-password')).status).toBe(204)
    })

    it('treats unlock on an unknown or password-less link as not found', async () => {
      const { create, app, json } = setup()
      const { body } = await create()
      expect((await app.request(`/api/v1/public/s/${body.token}/unlock`, json({ password: 'whatever-password' }))).status).toBe(404)
      expect((await app.request('/api/v1/public/s/nope/unlock', json({ password: 'whatever-password' }))).status).toBe(404)
      expect((await app.request(`/api/v1/public/s/${body.token}/unlock`, json({}))).status).toBe(400)
    })
  })

  it('rate limits requests per address', async () => {
    const { create, app } = setup({ requestsPerMinute: 3 })
    const { body } = await create()
    const get = (ip: string) => app.request(`/api/v1/public/s/${body.token}`, { headers: { 'x-test-ip': ip } })
    for (let i = 0; i < 3; i++) expect((await get('3.3.3.3')).status).toBe(200)
    const limited = await get('3.3.3.3')
    expect(limited.status).toBe(429)
    expect(limited.headers.get('retry-after')).not.toBeNull()
    expect((await get('4.4.4.4')).status).toBe(200)
  })

  it('audits views and denials, never the token, and caps denial lines', async () => {
    const { create, app, audit } = setup()
    const { body } = await create()
    await app.request(`/api/v1/public/s/${body.token}`)
    for (let i = 0; i < 30; i++) await app.request(`/api/v1/public/s/missing${i}`)
    await new Promise((r) => setTimeout(r, 0))
    expect(audit.filter((a) => a.action === 'PUBLIC_SHARE_ACCESSED')).toHaveLength(1)
    const denied = audit.filter((a) => a.action === 'PUBLIC_SHARE_DENIED')
    expect(denied.length).toBeGreaterThan(0)
    expect(denied.length).toBeLessThanOrEqual(10)
    expect(denied.every((a) => a.userId === null && !a.success)).toBe(true)
    expect(JSON.stringify(audit)).not.toContain(body.token)
  })
})
