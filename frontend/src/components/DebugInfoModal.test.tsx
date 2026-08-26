import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, afterEach } from 'vitest'
import { DebugInfoModal } from './DebugInfoModal'

describe('DebugInfoModal', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders nothing when closed', () => {
    vi.stubGlobal('fetch', vi.fn())
    render(<DebugInfoModal open={false} onClose={vi.fn()} vaultName={null} />)
    expect(document.querySelector('.info-modal')).toBeNull()
  })

  it('shows the installed version, browser, and active vault name', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ version: '1.2.3' }) }))

    render(<DebugInfoModal open onClose={vi.fn()} vaultName="My Vault" />)

    await waitFor(() => expect(screen.getByText('1.2.3')).toBeInTheDocument())
    expect(screen.getByText('My Vault')).toBeInTheDocument()
    expect(screen.getByText(navigator.userAgent)).toBeInTheDocument()
  })

  it('shows a "no vault selected" placeholder when vaultName is null', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ version: '1.2.3' }) }))

    render(<DebugInfoModal open onClose={vi.fn()} vaultName={null} />)

    await waitFor(() => expect(screen.getByText('Kein Vault ausgewählt')).toBeInTheDocument())
  })

  it('copies the debug info to the clipboard and shows a confirmation', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ version: '1.2.3' }) }))
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.assign(navigator, { clipboard: { writeText } })

    render(<DebugInfoModal open onClose={vi.fn()} vaultName="My Vault" />)
    await waitFor(() => expect(screen.getByText('1.2.3')).toBeInTheDocument())

    screen.getByText('In Zwischenablage kopieren').click()

    await waitFor(() => expect(writeText).toHaveBeenCalled())
    expect(writeText.mock.calls[0]![0]).toContain('1.2.3')
    await waitFor(() => expect(screen.getByText('Kopiert')).toBeInTheDocument())
  })
})
