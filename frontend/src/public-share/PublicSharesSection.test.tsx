import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { axe } from 'vitest-axe'
import { useEffect } from 'react'
import { AppProvider, useAppContext } from '../state'
import type { IApiClient } from '../api'
import { PublicSharesSection } from './PublicSharesSection'
import type { PublicShareSummary } from './types'

const shares: PublicShareSummary[] = [
  { id: 'a', tokenHint: 'aaaa', vaultId: 'v1', filePath: 'Notes/Preise.md', createdBy: 'u1', createdAt: '2026-10-23T10:00:00.000Z', passwordProtected: true, expiresAt: '2999-01-01T00:00:00.000Z' },
  { id: 'b', tokenHint: 'bbbb', vaultId: 'gone', filePath: 'Alt.md', createdBy: 'u1', createdAt: '2026-10-20T10:00:00.000Z', passwordProtected: false, lastAccessAt: '2026-10-22T08:00:00.000Z' },
]

function Seeder() {
  const { dispatch } = useAppContext()
  useEffect(() => {
    dispatch({ type: 'VAULTS_LOADED', payload: [{ id: 'v1', name: 'Mein Vault' }] })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}

function renderSection(api: Record<string, unknown>) {
  const apiClient = api as unknown as IApiClient
  return render(
    <AppProvider apiClient={apiClient}>
      <Seeder />
      <PublicSharesSection apiClient={apiClient} />
    </AppProvider>,
  )
}

afterEach(cleanup)

describe('PublicSharesSection', () => {
  it('lists the own links with vault name, expiry, password and last access', async () => {
    renderSection({ listMyPublicShares: vi.fn().mockResolvedValue(shares) })
    const table = await screen.findByRole('table', { name: 'Deine öffentlichen Links' })
    const rows = within(table).getAllByRole('row')
    expect(rows).toHaveLength(3)
    expect(within(rows[1]!).getByText('Notes/Preise.md')).toBeInTheDocument()
    expect(within(rows[1]!).getByText('Mein Vault')).toBeInTheDocument()
    expect(within(rows[1]!).getByText('ja')).toBeInTheDocument()
    expect(within(rows[2]!).getByText('Unbekannter Vault')).toBeInTheDocument()
    expect(within(rows[2]!).getByText('unbegrenzt')).toBeInTheDocument()
    expect(within(rows[1]!).getByText('noch nie')).toBeInTheDocument()
  })

  it('says so when there are no links', async () => {
    renderSection({ listMyPublicShares: vi.fn().mockResolvedValue([]) })
    expect(await screen.findByText('Du hast noch keine öffentlichen Links erzeugt.')).toBeInTheDocument()
  })

  it('revokes only after confirmation, then reloads', async () => {
    const listMyPublicShares = vi.fn().mockResolvedValueOnce(shares).mockResolvedValueOnce([shares[1]])
    const revokeMyPublicShare = vi.fn().mockResolvedValue(undefined)
    renderSection({ listMyPublicShares, revokeMyPublicShare })

    fireEvent.click(await screen.findByRole('button', { name: 'Link zu Notes/Preise.md widerrufen' }))
    expect(revokeMyPublicShare).not.toHaveBeenCalled()
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Widerrufen' }))

    await waitFor(() => expect(revokeMyPublicShare).toHaveBeenCalledWith('a'))
    await waitFor(() => expect(screen.queryByText('Notes/Preise.md')).toBeNull())
  })

  it('does not revoke when the confirmation is cancelled', async () => {
    const revokeMyPublicShare = vi.fn()
    renderSection({ listMyPublicShares: vi.fn().mockResolvedValue(shares), revokeMyPublicShare })
    fireEvent.click(await screen.findByRole('button', { name: 'Link zu Alt.md widerrufen' }))
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: /Abbrechen|Cancel/ }))
    expect(revokeMyPublicShare).not.toHaveBeenCalled()
  })

  it('shows a load error', async () => {
    renderSection({ listMyPublicShares: vi.fn().mockRejectedValue(new Error('offline')) })
    expect(await screen.findByRole('alert')).toHaveTextContent('offline')
  })

  it('has no accessibility violations', async () => {
    const { container } = renderSection({ listMyPublicShares: vi.fn().mockResolvedValue(shares) })
    await screen.findByRole('table')
    expect(await axe(container)).toHaveNoViolations()
  }, 30000)
})
