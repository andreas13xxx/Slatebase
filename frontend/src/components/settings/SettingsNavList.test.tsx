/**
 * Unit tests for SettingsNavList component.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { SettingsNavList } from './SettingsNavList'
import type { SettingsNavState } from '../../state/settingsState'
import { createSettingsRegistry } from '../../state/settingsRegistry'

function createState(overrides: Partial<SettingsNavState> = {}): SettingsNavState {
  return {
    category: 'account',
    section: 'profile',
    selectedVaultId: null,
    searchQuery: '',
    mobileNavOpen: false,
    ...overrides,
  }
}

describe('SettingsNavList', () => {
  const registry = createSettingsRegistry()

  it('renders all account and vault sections for non-admin', () => {
    const dispatch = vi.fn()
    render(
      <SettingsNavList
        state={createState()}
        isAdmin={false}
        registry={registry}
        dispatch={dispatch}
      />
    )

    expect(screen.getByText('Profil')).toBeInTheDocument()
    expect(screen.getByText('Passwort ändern')).toBeInTheDocument()
    expect(screen.getByText('Sitzungen')).toBeInTheDocument()
    expect(screen.getByText('MCP-Tokens')).toBeInTheDocument()
    expect(screen.getByText('Konto löschen')).toBeInTheDocument()
    expect(screen.getByText('Synchronisation')).toBeInTheDocument()
    expect(screen.getByText('Plugins')).toBeInTheDocument()
  })

  it('renders admin sections when isAdmin is true', () => {
    const dispatch = vi.fn()
    render(
      <SettingsNavList
        state={createState()}
        isAdmin={true}
        registry={registry}
        dispatch={dispatch}
      />
    )

    expect(screen.getByText('Serverkonfiguration')).toBeInTheDocument()
    expect(screen.getByText('Benutzerverwaltung')).toBeInTheDocument()
    expect(screen.getByText('Vault-Verwaltung')).toBeInTheDocument()
    expect(screen.getByText('Feature-Toggles')).toBeInTheDocument()
  })

  it('hides admin sections when isAdmin is false', () => {
    const dispatch = vi.fn()
    render(
      <SettingsNavList
        state={createState()}
        isAdmin={false}
        registry={registry}
        dispatch={dispatch}
      />
    )

    expect(screen.queryByText('Serverkonfiguration')).not.toBeInTheDocument()
    expect(screen.queryByText('Benutzerverwaltung')).not.toBeInTheDocument()
    expect(screen.queryByText('Administration')).not.toBeInTheDocument()
  })

  it('renders category headings', () => {
    const dispatch = vi.fn()
    render(
      <SettingsNavList
        state={createState()}
        isAdmin={true}
        registry={registry}
        dispatch={dispatch}
      />
    )

    expect(screen.getByText('Konto')).toBeInTheDocument()
    expect(screen.getByText('Vault')).toBeInTheDocument()
    expect(screen.getByText('Administration')).toBeInTheDocument()
  })

  it('filters sections by search query (case-insensitive)', () => {
    const dispatch = vi.fn()
    render(
      <SettingsNavList
        state={createState({ searchQuery: 'pass' })}
        isAdmin={false}
        registry={registry}
        dispatch={dispatch}
      />
    )

    expect(screen.getByText('Passwort ändern')).toBeInTheDocument()
    expect(screen.queryByText('Profil')).not.toBeInTheDocument()
    expect(screen.queryByText('Sitzungen')).not.toBeInTheDocument()
  })

  it('filters case-insensitively', () => {
    const dispatch = vi.fn()
    render(
      <SettingsNavList
        state={createState({ searchQuery: 'PROFIL' })}
        isAdmin={false}
        registry={registry}
        dispatch={dispatch}
      />
    )

    expect(screen.getByText('Profil')).toBeInTheDocument()
  })

  it('shows "Keine Ergebnisse" when search yields no matches', () => {
    const dispatch = vi.fn()
    render(
      <SettingsNavList
        state={createState({ searchQuery: 'xyznonexistent' })}
        isAdmin={false}
        registry={registry}
        dispatch={dispatch}
      />
    )

    expect(screen.getByText('Keine Ergebnisse')).toBeInTheDocument()
  })

  it('disables vault sections when activeVaultId is null', () => {
    const dispatch = vi.fn()
    render(
      <SettingsNavList
        state={createState({ selectedVaultId: null })}
        isAdmin={false}
        registry={registry}
        dispatch={dispatch}
        activeVaultId={null}
      />
    )

    const syncBtn = screen.getByText('Synchronisation')
    const pluginsBtn = screen.getByText('Plugins')
    expect(syncBtn).toBeDisabled()
    expect(pluginsBtn).toBeDisabled()
  })

  it('enables vault sections when activeVaultId is set', () => {
    const dispatch = vi.fn()
    render(
      <SettingsNavList
        state={createState({ selectedVaultId: null })}
        isAdmin={false}
        registry={registry}
        dispatch={dispatch}
        activeVaultId="abc123"
      />
    )

    const syncBtn = screen.getByText('Synchronisation')
    const pluginsBtn = screen.getByText('Plugins')
    expect(syncBtn).not.toBeDisabled()
    expect(pluginsBtn).not.toBeDisabled()
  })

  it('sets aria-current="page" on active section', () => {
    const dispatch = vi.fn()
    render(
      <SettingsNavList
        state={createState({ category: 'account', section: 'sessions' })}
        isAdmin={false}
        registry={registry}
        dispatch={dispatch}
      />
    )

    const sessionsBtn = screen.getByText('Sitzungen')
    expect(sessionsBtn).toHaveAttribute('aria-current', 'page')

    const profileBtn = screen.getByText('Profil')
    expect(profileBtn).not.toHaveAttribute('aria-current')
  })

  it('dispatches NAVIGATE and calls onNavSelect on click', () => {
    const dispatch = vi.fn()
    const onNavSelect = vi.fn()
    render(
      <SettingsNavList
        state={createState()}
        isAdmin={false}
        registry={registry}
        dispatch={dispatch}
        onNavSelect={onNavSelect}
      />
    )

    fireEvent.click(screen.getByText('Sitzungen'))

    expect(dispatch).toHaveBeenCalledWith({
      type: 'NAVIGATE',
      payload: { category: 'account', section: 'sessions' },
    })
    expect(onNavSelect).toHaveBeenCalledTimes(1)
  })

  it('does not dispatch when clicking a disabled vault section', () => {
    const dispatch = vi.fn()
    render(
      <SettingsNavList
        state={createState({ selectedVaultId: null })}
        isAdmin={false}
        registry={registry}
        dispatch={dispatch}
        activeVaultId={null}
      />
    )

    fireEvent.click(screen.getByText('Synchronisation'))
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('supports keyboard navigation (ArrowDown/ArrowUp)', () => {
    const dispatch = vi.fn()
    render(
      <SettingsNavList
        state={createState({ selectedVaultId: 'v1' })}
        isAdmin={false}
        registry={registry}
        dispatch={dispatch}
        activeVaultId="v1"
      />
    )

    const profileBtn = screen.getByText('Profil')
    profileBtn.focus()

    const list = profileBtn.closest('ul.settings-nav-list')!
    fireEvent.keyDown(list, { key: 'ArrowDown' })

    expect(document.activeElement).toBe(screen.getByText('Passwort ändern'))
  })

  it('groups filtered results under category headings', () => {
    const dispatch = vi.fn()
    render(
      <SettingsNavList
        state={createState({ searchQuery: 'Sync' })}
        isAdmin={false}
        registry={registry}
        dispatch={dispatch}
      />
    )

    // Only Vault category heading should show (Synchronisation matches)
    expect(screen.getByText('Vault')).toBeInTheDocument()
    expect(screen.getByText('Synchronisation')).toBeInTheDocument()
    expect(screen.queryByText('Konto')).not.toBeInTheDocument()
  })
})
