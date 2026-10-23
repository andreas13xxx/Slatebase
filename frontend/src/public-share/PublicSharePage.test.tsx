import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react'
import { axe } from 'vitest-axe'
import { PublicSharePage } from './PublicSharePage'
import type { PublicNoteView } from './types'

const view: PublicNoteView = {
  title: 'Preisliste',
  markdown: '# Preise\n\nSiehe [[Geheim]] und [Extern](https://example.org).\n\n![[Logo.png]]\n\n![[Inner]]\n\n![[Weg]]',
  embeds: {
    'Logo.png': { kind: 'asset', contentType: 'image/png' },
    Inner: { kind: 'note', markdown: 'Eingebetteter Text' },
    Weg: { kind: 'unavailable' },
  },
}

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), { status })
}

function mockFetch(...responses: Response[]) {
  const fn = vi.fn()
  for (const r of responses) fn.mockResolvedValueOnce(r)
  vi.stubGlobal('fetch', fn)
  return fn
}

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  document.title = ''
})

describe('PublicSharePage', () => {
  it('renders the note like the reading view, with embeds inlined', async () => {
    mockFetch(json(200, view))
    const { container } = render(<PublicSharePage token="tok" />)

    expect(await screen.findByRole('heading', { level: 1, name: 'Preisliste' })).toBeInTheDocument()
    await waitFor(() => expect(document.title).toBe('Preisliste'))
    expect(await screen.findByText('Eingebetteter Text')).toBeInTheDocument()

    const img = container.querySelector('img.view-mode-image') as HTMLImageElement
    expect(img.getAttribute('src')).toBe('/api/v1/public/s/tok/asset?ref=Logo.png')
  })

  it('shows wikilinks as plain text and keeps external links', async () => {
    mockFetch(json(200, view))
    const { container } = render(<PublicSharePage token="tok" />)
    await screen.findByText('Eingebetteter Text')

    expect(screen.getByText('Geheim')).toBeInTheDocument()
    expect(container.querySelector('a[data-link-path]')).toBeNull()
    expect(screen.queryByRole('link', { name: 'Geheim' })).toBeNull()
    expect(screen.getByRole('link', { name: 'Extern' })).toHaveAttribute('href', 'https://example.org')
  })

  it('shows a generic notice for unavailable embeds, without names', async () => {
    mockFetch(json(200, view))
    const { container } = render(<PublicSharePage token="tok" />)
    await screen.findByText('Eingebetteter Text')

    const notice = await screen.findByText('Eingebetteter Inhalt nicht verfügbar')
    expect(notice).toBeInTheDocument()
    expect(container.textContent).not.toContain('nicht gefunden')
    expect(container.textContent).not.toContain('Weg')
  })

  it('never calls an authenticated vault or file API', async () => {
    const fetchMock = mockFetch(json(200, view))
    const { container } = render(<PublicSharePage token="tok" />)
    await screen.findByText('Eingebetteter Text')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(String(fetchMock.mock.calls[0]![0])).toBe('/api/v1/public/s/tok')
    for (const el of container.querySelectorAll('[src], [href]')) {
      const url = el.getAttribute('src') ?? el.getAttribute('href') ?? ''
      expect(url).not.toMatch(/\/api\/v1\/vaults\//)
    }
  })

  it('sets no-referrer and noindex while mounted', async () => {
    mockFetch(json(200, view))
    const { unmount } = render(<PublicSharePage token="tok" />)
    await screen.findByText('Eingebetteter Text')
    expect(document.head.querySelector('meta[name="referrer"]')).toHaveAttribute('content', 'no-referrer')
    expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute('content', 'noindex, nofollow')
    unmount()
    expect(document.head.querySelector('meta[name="referrer"]')).toBeNull()
  })

  it('shows a dead-link message for 404', async () => {
    mockFetch(json(404))
    render(<PublicSharePage token="tok" />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Link nicht verfügbar')
  })

  it('treats a network failure as unknown and offers a retry', async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(json(200, view))
    vi.stubGlobal('fetch', fetchMock)
    render(<PublicSharePage token="tok" />)

    expect(await screen.findByRole('alert')).toHaveTextContent('konnte nicht geladen werden')
    expect(screen.queryByText('Link nicht verfügbar')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Erneut versuchen' }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Preisliste' })).toBeInTheDocument()
  })

  describe('password', () => {
    it('asks for the password, reports a wrong one, and opens the note after unlocking', async () => {
      const fetchMock = mockFetch(json(401), json(401), json(204), json(200, view))
      render(<PublicSharePage token="tok" />)

      const input = await screen.findByLabelText('Passwort')
      const open = screen.getByRole('button', { name: 'Öffnen' })
      expect(open).toBeDisabled()

      fireEvent.change(input, { target: { value: 'falsch' } })
      fireEvent.click(open)
      expect(await screen.findByRole('alert')).toHaveTextContent('Das Passwort ist falsch.')
      expect(input).toHaveAttribute('aria-invalid', 'true')

      fireEvent.change(input, { target: { value: 'richtig' } })
      fireEvent.click(screen.getByRole('button', { name: 'Öffnen' }))
      expect(await screen.findByRole('heading', { level: 1, name: 'Preisliste' })).toBeInTheDocument()

      const unlockCall = fetchMock.mock.calls[2]! as [string, RequestInit]
      expect(unlockCall[0]).toBe('/api/v1/public/s/tok/unlock')
      expect(JSON.parse(unlockCall[1].body as string)).toEqual({ password: 'richtig' })
    })

    it('reports rate limiting', async () => {
      mockFetch(json(401), json(429))
      render(<PublicSharePage token="tok" />)
      fireEvent.change(await screen.findByLabelText('Passwort'), { target: { value: 'x' } })
      fireEvent.click(screen.getByRole('button', { name: 'Öffnen' }))
      await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Zu viele Versuche'))
    })
  })

  it('has no accessibility violations (note, password form, error)', async () => {
    mockFetch(json(200, view))
    const note = render(<PublicSharePage token="tok" />)
    await screen.findByText('Eingebetteter Text')
    expect(await axe(note.container)).toHaveNoViolations()
    note.unmount()

    mockFetch(json(401))
    const form = render(<PublicSharePage token="tok" />)
    await screen.findByLabelText('Passwort')
    expect(await axe(form.container)).toHaveNoViolations()
    form.unmount()

    mockFetch(json(404))
    const gone = render(<PublicSharePage token="tok" />)
    await screen.findByRole('alert')
    expect(await axe(gone.container)).toHaveNoViolations()
  }, 30000)
})
