import { describe, it, expect, vi, afterEach } from 'vitest'
import { buildActiveTabLink, copyLinkWithFeedback, isVaultFileTabPath, writeToClipboard } from './copyDeepLink'
import * as Toast from '../components/ToastNotification'

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

describe('copyLinkWithFeedback', () => {
  afterEach(() => {
    Object.assign(navigator, { clipboard: undefined })
    vi.restoreAllMocks()
  })

  it('speaks the active locale, not hard-coded German', async () => {
    const { I18nProvider } = await import('../i18n')
    const { render } = await import('@testing-library/react')
    const { createElement } = await import('react')
    render(createElement(I18nProvider, { initialLocale: 'en' }, null))
    // The provider mirrors its locale for hook-free callers in an effect.
    await vi.waitFor(async () => {
      const { translateNow } = await import('../i18n')
      expect(translateNow('deepLink.copied')).toBe('Link copied')
    })

    const toast = vi.spyOn(Toast, 'showToast').mockReturnValue('t')
    Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
    await copyLinkWithFeedback('v1', 'a.md')
    expect(toast).toHaveBeenCalledWith('success', 'Link copied')
    await copyLinkWithFeedback(null, null)
    expect(toast).toHaveBeenCalledWith('error', 'No vault open')
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
