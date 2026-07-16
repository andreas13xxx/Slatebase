/**
 * SettingsNavList — Category and section navigation list for the settings sidebar.
 *
 * Renders sections grouped under category headings. Supports search filtering
 * (case-insensitive label matching), vault-section disabling when no vault is selected,
 * admin-section hiding for non-admin users, and keyboard navigation.
 *
 * @module components/settings/SettingsNavList
 */

import { useCallback, useRef } from 'react'
import type { SettingsAction, SettingsCategory, SettingsSection } from '../../state/settingsState'
import type { SettingsNavState } from '../../state/settingsState'
import type { ISettingsRegistry, ISettingsSectionDef } from '../../state/settingsRegistry'
import './SettingsNavList.css'

/**
 * German labels for settings sections used in search matching.
 * Maps section ID to its display label.
 */
const SECTION_LABELS: Record<SettingsSection, string> = {
  'profile': 'Profil',
  'password': 'Passwort ändern',
  'sessions': 'Sitzungen',
  'mcp-tokens': 'MCP-Tokens',
  'keybindings': 'Tastaturkürzel',
  'appearance': 'Darstellung',
  'delete-account': 'Konto löschen',
  'sync': 'Synchronisation',
  'plugins': 'Plugins',
  'vault-config': 'Vault-Konfiguration',
  'server-config': 'Serverkonfiguration',
  'user-management': 'Benutzerverwaltung',
  'vault-management': 'Vault-Verwaltung',
  'feature-toggles': 'Feature-Toggles',
  'server-restart': 'Neustart',
}

/**
 * German labels for category headings.
 */
const CATEGORY_LABELS: Record<SettingsCategory, string> = {
  'account': 'Konto',
  'vault': 'Vault',
  'administration': 'Administration',
}

/** Props for the SettingsNavList component. */
export interface SettingsNavListProps {
  /** Current settings navigation state. */
  state: SettingsNavState
  /** Whether the current user has admin role. */
  isAdmin: boolean
  /** Section registry instance for querying available sections. */
  registry: ISettingsRegistry
  /** Dispatch function for settings actions. */
  dispatch: React.Dispatch<SettingsAction>
  /** Callback after navigation (for mobile close). */
  onNavSelect?: () => void
  /** The app's currently active vault ID (used to enable/disable vault sections). */
  activeVaultId?: string | null
}

/** A filtered section with its resolved label. */
interface ResolvedSection {
  def: ISettingsSectionDef
  label: string
}

/**
 * SettingsNavList — Renders a grouped navigation list of settings sections.
 *
 * - Gets all visible categories via `registry.getCategories(isAdmin)`
 * - For each category, gets sections via `registry.getSections(category, isAdmin)`
 * - Filters sections by case-insensitive label match when searchQuery is non-empty
 * - Groups filtered results under category headings
 * - Shows "Keine Ergebnisse" message when no sections match
 * - Vault sections (requiresVault: true) are disabled when selectedVaultId is null
 * - Active section has aria-current="page"
 * - Keyboard: Arrow Up/Down to move focus, Enter to activate
 */
export function SettingsNavList({ state, isAdmin, registry, dispatch, onNavSelect, activeVaultId }: SettingsNavListProps) {
  const listRef = useRef<HTMLUListElement>(null)

  const handleSectionClick = useCallback((category: SettingsCategory, section: SettingsSection) => {
    dispatch({ type: 'NAVIGATE', payload: { category, section } })
    onNavSelect?.()
  }, [dispatch, onNavSelect])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLUListElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return

    e.preventDefault()
    const list = listRef.current
    if (list === null) return

    const buttons = Array.from(list.querySelectorAll<HTMLButtonElement>(
      'button.settings-nav-list__section-btn:not(:disabled)'
    ))
    if (buttons.length === 0) return

    const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement)

    let nextIndex: number
    if (e.key === 'ArrowDown') {
      nextIndex = currentIndex < buttons.length - 1 ? currentIndex + 1 : 0
    } else {
      nextIndex = currentIndex > 0 ? currentIndex - 1 : buttons.length - 1
    }

    const nextBtn = buttons[nextIndex]
    if (nextBtn !== undefined) {
      nextBtn.focus()
    }
  }, [])

  // Build filtered sections grouped by category
  const categories = registry.getCategories(isAdmin)
  const query = state.searchQuery.trim().toLowerCase()

  const groupedSections: Array<{ category: SettingsCategory; sections: ResolvedSection[] }> = []

  for (const category of categories) {
    const sections = registry.getSections(category, isAdmin)
    const resolved: ResolvedSection[] = []

    for (const def of sections) {
      const label = SECTION_LABELS[def.id]
      if (query === '' || label.toLowerCase().includes(query)) {
        resolved.push({ def, label })
      }
    }

    if (resolved.length > 0) {
      groupedSections.push({ category, sections: resolved })
    }
  }

  // No results message
  if (groupedSections.length === 0) {
    return (
      <p className="settings-nav-list__no-results">
        Keine Ergebnisse
      </p>
    )
  }

  return (
    <ul
      ref={listRef}
      className="settings-nav-list"
      role="list"
      onKeyDown={handleKeyDown}
    >
      {groupedSections.map(({ category, sections }) => (
        <li key={category} role="presentation">
          <p className="settings-nav-list__category-heading">
            {CATEGORY_LABELS[category]}
          </p>
          <ul role="list" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {sections.map(({ def, label }) => {
              const isActive = state.category === def.category && state.section === def.id
              const vaultId = activeVaultId !== undefined ? activeVaultId : state.selectedVaultId
              const isDisabled = def.requiresVault && vaultId === null

              return (
                <li key={def.id} role="presentation">
                  <button
                    type="button"
                    className="settings-nav-list__section-btn"
                    aria-current={isActive ? 'page' : undefined}
                    disabled={isDisabled}
                    onClick={() => { handleSectionClick(def.category, def.id) }}
                  >
                    {label}
                  </button>
                </li>
              )
            })}
          </ul>
        </li>
      ))}
    </ul>
  )
}
