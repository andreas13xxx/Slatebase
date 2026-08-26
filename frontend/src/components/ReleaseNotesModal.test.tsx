import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { ReleaseNotesModal } from './ReleaseNotesModal'

describe('ReleaseNotesModal', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders nothing when closed', () => {
    vi.stubGlobal('fetch', vi.fn())
    render(<ReleaseNotesModal open={false} onClose={vi.fn()} />)
    expect(document.querySelector('.info-modal')).toBeNull()
  })

  it('shows a loading state, then renders fetched release notes as HTML', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: async () => [
        { tag_name: 'v1.0.0', name: 'v1.0.0', body: '**bold** release notes', html_url: 'https://example.com/v1.0.0' },
      ],
    }))

    render(<ReleaseNotesModal open onClose={vi.fn()} />)

    expect(screen.getByText(/Versionshinweise werden geladen/)).toBeInTheDocument()

    await waitFor(() => {
      expect(document.querySelector('.info-modal__markdown')).toBeInTheDocument()
    })

    expect(document.querySelector('.info-modal__markdown strong')?.textContent).toBe('bold')
  })

  it('shows an error message when the fetch fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')))

    render(<ReleaseNotesModal open onClose={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText(/konnten nicht geladen werden/)).toBeInTheDocument()
    })
  })

  it('calls onClose when the close button is clicked', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }))
    const onClose = vi.fn()

    render(<ReleaseNotesModal open onClose={onClose} />)
    await waitFor(() => expect(document.querySelector('.info-modal__close')).toBeInTheDocument())

    document.querySelector<HTMLButtonElement>('.info-modal__close')!.click()
    expect(onClose).toHaveBeenCalled()
  })
})
