import { describe, expect, it, vi } from 'vitest'
import { buildPublicTree } from './buildPublicTree'
import { loadPublicNote, unlockPublicNote } from './publicShareApi'
import { embedRef, parsePublicVaultId, publicAssetUrl, toPublicVaultId, tokenFromPath } from './publicVault'
import type { PublicEmbedView } from './types'

describe('publicVault helpers', () => {
  it('round-trips the synthetic vault ID and rejects real vault IDs', () => {
    expect(parsePublicVaultId(toPublicVaultId('abc_-1'))).toBe('abc_-1')
    expect(parsePublicVaultId('a1b2c3d4e5f6')).toBeNull()
    expect(parsePublicVaultId('')).toBeNull()
  })

  it('builds asset URLs with an encoded reference', () => {
    expect(publicAssetUrl('tok', 'img/my pic.png')).toBe('/api/v1/public/s/tok/asset?ref=img%2Fmy%20pic.png')
  })

  it('builds embed references like the server', () => {
    expect(embedRef('N', null, null)).toBe('N')
    expect(embedRef('N', 'Sec', null)).toBe('N#Sec')
    expect(embedRef('N', 'Sec', 'b1')).toBe('N#^b1')
  })

  it('reads the token from /s/<token> only', () => {
    expect(tokenFromPath('/s/abcDEF_-123')).toBe('abcDEF_-123')
    expect(tokenFromPath('/s/abc/')).toBe('abc')
    for (const p of ['/', '/s', '/s/', '/s/a/b', '/s/a.b', '/x/s/abc', '/settings/abc', '/s/a%2Fb']) {
      expect(tokenFromPath(p)).toBeNull()
    }
  })
})

describe('buildPublicTree', () => {
  const embeds: Record<string, PublicEmbedView> = {
    Inner: { kind: 'note', markdown: 'x' },
    'Inner#Sec': { kind: 'note', markdown: 'y' },
    'Inner#^b': { kind: 'note', markdown: 'z' },
    'Notes/Deep.md': { kind: 'note', markdown: 'd' },
    'img/pic.png': { kind: 'asset', contentType: 'image/png' },
    'doc.pdf': { kind: 'asset', contentType: 'application/pdf' },
    Gone: { kind: 'unavailable' },
  }

  it('lists resolved embeds once, notes with .md and assets under their reference', () => {
    const paths = (buildPublicTree(embeds).children ?? []).map((c) => c.path).sort()
    expect(paths).toEqual(['Inner.md', 'Notes/Deep.md', 'doc.pdf', 'img/pic.png'])
  })

  it('leaves out unavailable embeds', () => {
    expect((buildPublicTree(embeds).children ?? []).some((c) => c.path.includes('Gone'))).toBe(false)
  })

  it('names files by their last segment', () => {
    const file = (buildPublicTree(embeds).children ?? []).find((c) => c.path === 'img/pic.png')
    expect(file).toMatchObject({ name: 'pic.png', type: 'file' })
  })

  it('handles an empty map', () => {
    expect(buildPublicTree({}).children).toEqual([])
  })
})

function response(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status })
}

describe('loadPublicNote', () => {
  const view = { title: 'T', markdown: 'm', embeds: {} }

  it('maps statuses to results', async () => {
    expect(await loadPublicNote('t', vi.fn().mockResolvedValue(response(200, view)))).toEqual({ status: 'ok', view })
    expect(await loadPublicNote('t', vi.fn().mockResolvedValue(response(404)))).toEqual({ status: 'notfound' })
    expect(await loadPublicNote('t', vi.fn().mockResolvedValue(response(401)))).toEqual({ status: 'password' })
    expect(await loadPublicNote('t', vi.fn().mockResolvedValue(response(429)))).toEqual({ status: 'limited' })
  })

  it('treats failures as unknown, never as "gone"', async () => {
    expect(await loadPublicNote('t', vi.fn().mockRejectedValue(new Error('offline')))).toEqual({ status: 'error' })
    expect(await loadPublicNote('t', vi.fn().mockResolvedValue(response(500)))).toEqual({ status: 'error' })
    expect(await loadPublicNote('t', vi.fn().mockResolvedValue(response(200, { nope: true })))).toEqual({ status: 'error' })
    expect(await loadPublicNote('t', vi.fn().mockResolvedValue(new Response('not json', { status: 200 })))).toEqual({ status: 'error' })
  })

  it('encodes the token', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(404))
    await loadPublicNote('a/b', fetchImpl)
    expect(fetchImpl.mock.calls[0]![0]).toBe('/api/v1/public/s/a%2Fb')
  })
})

describe('unlockPublicNote', () => {
  it('maps statuses', async () => {
    expect(await unlockPublicNote('t', 'pw', vi.fn().mockResolvedValue(response(204)))).toBe('ok')
    expect(await unlockPublicNote('t', 'pw', vi.fn().mockResolvedValue(response(401)))).toBe('wrong')
    expect(await unlockPublicNote('t', 'pw', vi.fn().mockResolvedValue(response(429)))).toBe('limited')
    expect(await unlockPublicNote('t', 'pw', vi.fn().mockResolvedValue(response(404)))).toBe('notfound')
    expect(await unlockPublicNote('t', 'pw', vi.fn().mockResolvedValue(response(500)))).toBe('error')
    expect(await unlockPublicNote('t', 'pw', vi.fn().mockRejectedValue(new Error('offline')))).toBe('error')
  })

  it('posts the password as JSON', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response(204))
    await unlockPublicNote('tok', 'secret-pw', fetchImpl)
    const [url, init] = fetchImpl.mock.calls[0]! as [string, RequestInit]
    expect(url).toBe('/api/v1/public/s/tok/unlock')
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body as string)).toEqual({ password: 'secret-pw' })
  })
})
