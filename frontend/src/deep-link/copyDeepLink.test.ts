import { describe, it, expect, vi, afterEach } from 'vitest'
import { buildActiveTabLink, isVaultFileTabPath, writeToClipboard } from './copyDeepLink'

describe('isVaultFileTabPath', () => {
  it.each(['__graph__', '__view::activity', '__webview::https://x.test', '__local-graph::a.md'])(
    'treats %s as a view, not a file',
    (p) => expect(isVaultFileTabPath(p)).toBe(false),
  )

  it('rejects unsafe paths and accepts ordinary notes, incl. underscore folders', () => {
    expect(isVaultFileTabPath('../x.md')).toBe(false)
    expect(isVaultFileTabPath('_drafts/a.md')).toBe(true)
    expect(isVaultFileTabPath('Ordner/Notiz.md')).toBe(true)
  })
})

describe('buildActiveTabLink', () => {
  const origin = 'https://s.example'

  it('links the active file', () => {
    expect(buildActiveTabLink(origin, 'v1', 'A/B.md')).toBe('https://s.example/open?vault=v1&file=A%2FB.md')
  })

  it('falls back to the vault for view tabs and when nothing is open', () => {
    expect(buildActiveTabLink(origin, 'v1', '__graph__')).toBe('https://s.example/open?vault=v1')
    expect(buildActiveTabLink(origin, 'v1', null)).toBe('https://s.example/open?vault=v1')
  })

  it('returns null without a vault', () => {
    expect(buildActiveTabLink(origin, null, 'a.md')).toBeNull()
  })
})

describe('writeToClipboard', () => {
  afterEach(() => {
    Object.assign(navigator, { clipboard: undefined })
  })

  it('writes and reports success', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })
    await expect(writeToClipboard('x')).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledWith('x')
  })

  it('reports failure when the API is missing or rejects', async () => {
    Object.assign(navigator, { clipboard: undefined })
    await expect(writeToClipboard('x')).resolves.toBe(false)
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } })
    await expect(writeToClipboard('x')).resolves.toBe(false)
  })
})
