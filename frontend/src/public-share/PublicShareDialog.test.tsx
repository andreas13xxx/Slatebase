import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { axe } from 'vitest-axe'
import type { IApiClient } from '../api'
import { PublicShareDialog } from './PublicShareDialog'
import { formatShareDate, kindLabel, linkUrl, toExpiryIso } from './publicShareFormat'
import type { CreatedPublicShare, EmbedPreviewEntry, PublicShareSummary } from './types'

const summary = (overrides: Partial<PublicShareSummary> = {}): PublicShareSummary => ({
  id: 'share-1', tokenHint: 'wxyz', vaultId: 'v1', filePath: 'Notes/Preise.md', createdBy: 'u1',
  createdAt: '2026-10-23T10:00:00.000Z', passwordProtected: false, ...overrides,
})

const embeds: EmbedPreviewEntry[] = [
  { ref: 'Logo.png', kind: 'asset' },
  { ref: 'Inner', kind: 'note' },
  { ref: 'Tasks.base', kind: 'unavailable' },
]

function createApi(overrides: Record<string, unknown> = {}) {
  const created: CreatedPublicShare = { share: summary(), token: 'tok123', path: '/s/tok123' }
  const api = {
    listPublicShares: vi.fn().mockResolvedValue([]),
    previewPublicShare: vi.fn().mockResolvedValue(embeds),
    createPublicShare: vi.fn().mockResolvedValue(created),
    updatePublicShare: vi.fn().mockResolvedValue(summary({ passwordProtected: true })),
    revokePublicShare: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }
  return api
}

function open(api: ReturnType<typeof createApi>, onClose = vi.fn()) {
  const view = render(<PublicShareDialog apiClient={api as unknown as IApiClient} vaultId="v1" filePath="Notes/Preise.md" onClose={onClose} />)
  return { ...view, onClose }
}

beforeEach(() => {
  Object.assign(navigator, { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('PublicShareDialog', () => {
  it('opens as a labelled modal dialog and states what the link does', async () => {
    open(createApi())
    const dialog = await screen.findByRole('dialog', { name: /Öffentlicher Link: Preise\.md/ })
    expect(dialog).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByText(/Jede Person mit dem Link kann diese Notiz lesen/)).toBeInTheDocument()
    expect(screen.getByText(/immer den aktuellen Stand/)).toBeInTheDocument()
  })

  it('previews what the link would include, and flags unavailable embeds', async () => {
    open(createApi())
    expect(await screen.findByText('Der Link enthält zusätzlich')).toBeInTheDocument()
    expect(screen.getByText(/Logo\.png/)).toBeInTheDocument()
    expect(screen.getByText(/Inner/)).toBeInTheDocument()
    expect(screen.getByText(/nicht verfügbar \(fehlen/)).toBeInTheDocument()
    expect(screen.getByText('Tasks.base')).toBeInTheDocument()
  })

  it('creates a link with password and expiry and shows the URL once, copyable', async () => {
    const api = createApi()
    open(api)
    fireEvent.change(await screen.findByLabelText('Passwort (optional)'), { target: { value: 'long-enough-pw' } })
    fireEvent.change(screen.getByLabelText('Gültig bis (optional)'), { target: { value: '2999-12-31' } })
    fireEvent.click(screen.getByRole('button', { name: 'Link erzeugen' }))

    const url = await screen.findByLabelText(/Dein Link/)
    expect(url).toHaveValue(`${window.location.origin}/s/tok123`)
    expect(api.createPublicShare).toHaveBeenCalledWith('v1', {
      path: 'Notes/Preise.md',
      password: 'long-enough-pw',
      expiresAt: toExpiryIso('2999-12-31'),
    })

    fireEvent.click(screen.getByRole('button', { name: /Kopieren/ }))
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(`${window.location.origin}/s/tok123`))
  })

  it('creates a link without optional fields', async () => {
    const api = createApi()
    open(api)
    fireEvent.click(await screen.findByRole('button', { name: 'Link erzeugen' }))
    await screen.findByLabelText(/Dein Link/)
    expect(api.createPublicShare).toHaveBeenCalledWith('v1', { path: 'Notes/Preise.md' })
  })

  it('shows an error and keeps the form when creating fails', async () => {
    const api = createApi({ createPublicShare: vi.fn().mockRejectedValue(new Error('Das Passwort muss zwischen 8 und 256 Zeichen lang sein')) })
    open(api)
    fireEvent.click(await screen.findByRole('button', { name: 'Link erzeugen' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('zwischen 8 und 256')
    expect(screen.getByRole('button', { name: 'Link erzeugen' })).toBeEnabled()
  })

  describe('with an existing link', () => {
    const existing = summary({ passwordProtected: true, expiresAt: '2999-01-01T12:00:00.000Z', lastAccessAt: '2026-10-23T11:00:00.000Z' })

    it('lists its properties but cannot show the URL again', async () => {
      open(createApi({ listPublicShares: vi.fn().mockResolvedValue([summary({ id: 'other', filePath: 'Other.md' }), existing]) }))
      expect(await screen.findByText('Link widerrufen')).toBeInTheDocument()
      expect(screen.getByText('…wxyz')).toBeInTheDocument()
      expect(screen.queryByLabelText(/Dein Link/)).toBeNull()
      expect(screen.queryByRole('button', { name: 'Link erzeugen' })).toBeNull()
    })

    it('revokes the link and returns to the create form', async () => {
      const api = createApi({ listPublicShares: vi.fn().mockResolvedValue([existing]) })
      open(api)
      fireEvent.click(await screen.findByRole('button', { name: 'Link widerrufen' }))
      expect(await screen.findByRole('button', { name: 'Link erzeugen' })).toBeInTheDocument()
      expect(api.revokePublicShare).toHaveBeenCalledWith('v1', 'share-1')
    })

    it('gives the link a new URL in one step, keeping password and expiry', async () => {
      const api = createApi({
        listPublicShares: vi.fn().mockResolvedValue([existing]),
        regeneratePublicShare: vi.fn().mockResolvedValue({ share: existing, token: 'tok123', path: '/s/tok123' }),
      })
      open(api)
      fireEvent.click(await screen.findByRole('button', { name: 'Neuen Link erzeugen' }))
      expect(await screen.findByLabelText(/Dein Link/)).toHaveValue(`${window.location.origin}/s/tok123`)
      expect(api.regeneratePublicShare).toHaveBeenCalledWith('v1', 'share-1')
      expect(api.revokePublicShare).not.toHaveBeenCalled()
      expect(api.createPublicShare).not.toHaveBeenCalled()
      expect(screen.getByText('ja')).toBeInTheDocument()
    })

    it('keeps the old link when renewing fails', async () => {
      const api = createApi({
        listPublicShares: vi.fn().mockResolvedValue([existing]),
        regeneratePublicShare: vi.fn().mockRejectedValue(new Error('offline')),
      })
      open(api)
      fireEvent.click(await screen.findByRole('button', { name: 'Neuen Link erzeugen' }))
      expect(await screen.findByRole('alert')).toHaveTextContent('offline')
      expect(screen.getByRole('button', { name: 'Link widerrufen' })).toBeInTheDocument()
    })

    it('sets and removes password and expiry', async () => {
      const api = createApi({
        listPublicShares: vi.fn().mockResolvedValue([existing]),
        updatePublicShare: vi.fn().mockResolvedValue(existing),
      })
      open(api)
      fireEvent.change(await screen.findByLabelText('Neues Passwort'), { target: { value: 'another-long-pw' } })
      fireEvent.click(screen.getByRole('button', { name: 'Passwort setzen' }))
      await waitFor(() => expect(api.updatePublicShare).toHaveBeenCalledWith('v1', 'share-1', { password: 'another-long-pw' }))

      fireEvent.click(await screen.findByRole('button', { name: 'Passwort entfernen' }))
      await waitFor(() => expect(api.updatePublicShare).toHaveBeenCalledWith('v1', 'share-1', { password: null }))

      fireEvent.click(screen.getByRole('button', { name: 'Ablauf entfernen' }))
      await waitFor(() => expect(api.updatePublicShare).toHaveBeenCalledWith('v1', 'share-1', { expiresAt: null }))
    })
  })

  it('shows a load error without pretending there is no link', async () => {
    open(createApi({ listPublicShares: vi.fn().mockRejectedValue(new Error('offline')) }))
    expect(await screen.findByRole('alert')).toHaveTextContent('offline')
    expect(screen.queryByRole('button', { name: 'Link erzeugen' })).not.toBeNull()
  })

  it('closes on Escape and on a click outside, not on a click inside', async () => {
    const { onClose } = open(createApi())
    const dialog = await screen.findByRole('dialog')
    fireEvent.click(dialog)
    expect(onClose).not.toHaveBeenCalled()
    fireEvent.keyDown(dialog, { key: 'Escape' })
    expect(onClose).toHaveBeenCalledTimes(1)
    fireEvent.click(dialog.parentElement!)
    expect(onClose).toHaveBeenCalledTimes(2)
  })

  it('has no accessibility violations in the create and the manage state', async () => {
    const create = open(createApi())
    await screen.findByRole('button', { name: 'Link erzeugen' })
    expect(await axe(create.container)).toHaveNoViolations()
    create.unmount()

    const manage = open(createApi({ listPublicShares: vi.fn().mockResolvedValue([summary({ passwordProtected: true, expiresAt: '2999-01-01T12:00:00.000Z' })]) }))
    await screen.findByRole('button', { name: 'Link widerrufen' })
    expect(await axe(manage.container)).toHaveNoViolations()
  }, 30000)
})

describe('format helpers', () => {
  it('turns a date into the end of that day in local time', () => {
    const date = new Date(toExpiryIso('2030-03-04'))
    expect([date.getFullYear(), date.getMonth(), date.getDate(), date.getHours(), date.getMinutes()]).toEqual([2030, 2, 4, 23, 59])
  })

  it('formats dates and passes invalid ones through', () => {
    expect(formatShareDate('2026-10-23T10:00:00.000Z')).toMatch(/2026/)
    expect(formatShareDate('garbage')).toBe('garbage')
  })

  it('builds absolute URLs and German kind labels', () => {
    expect(linkUrl('/s/abc')).toBe(`${window.location.origin}/s/abc`)
    expect([kindLabel('note'), kindLabel('asset'), kindLabel('unavailable')]).toEqual(['Notiz', 'Datei', 'nicht verfügbar'])
  })
})
