import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { axe } from 'vitest-axe'
import { useEffect } from 'react'
import { AppProvider, useAppContext } from '../../state'
import { ThemesSection } from './ThemesSection'
import type { IApiClient, ThemeMeta } from '../../api'

const themes: ThemeMeta[] = [
  { id: 'Things', manifest: { name: 'Things', version: '2.1.0' }, size: 2048, updatedAt: '2026-10-17T00:00:00.000Z', externalHosts: [] },
  { id: 'Fancy', manifest: { name: 'Fancy' }, size: 100, updatedAt: '2026-10-17T00:00:00.000Z', externalHosts: ['fonts.googleapis.com'] },
]

function VaultSeeder() {
  const { dispatch } = useAppContext()
  useEffect(() => {
    dispatch({ type: 'VAULTS_LOADED', payload: [{ id: 'vault1', name: 'My Vault' }] })
    dispatch({ type: 'VAULT_SELECTED', payload: 'vault1' })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}

describe('ThemesSection accessibility', () => {
  it('has no axe violations with themes listed', async () => {
    const apiClient = {
      listThemes: vi.fn().mockResolvedValue({ themes, activeThemeId: 'Things' }),
    } as unknown as IApiClient

    const { container } = render(
      <AppProvider apiClient={apiClient}>
        <VaultSeeder />
        <ThemesSection />
      </AppProvider>,
    )
    await screen.findByRole('radio', { name: /Things/ })

    expect(await axe(container)).toHaveNoViolations()
  }, 30_000) // axe is slow on constrained machines; the default 5 s limit timed out

  it('exposes the import drop zone as a labelled, keyboard-focusable button', async () => {
    const apiClient = { listThemes: vi.fn().mockResolvedValue({ themes: [], activeThemeId: null }) } as unknown as IApiClient
    render(
      <AppProvider apiClient={apiClient}>
        <VaultSeeder />
        <ThemesSection />
      </AppProvider>,
    )

    const zone = await screen.findByRole('button', { name: /Theme importieren/ })
    expect(zone).toHaveAttribute('tabindex', '0')
  })
})
