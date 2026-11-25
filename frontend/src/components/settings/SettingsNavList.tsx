/**
 * SettingsNavList — Category and section navigation list for the settings sidebar.
 *
 * Renders sections grouped under category headings. Supports search filtering
 * (case-insensitive label matching), vault-section disabling when no vault is selected,
 * admin-section hiding for non-admin users, and keyboard navigation.
 *
 * @module components/settings/SettingsNavList
 */

import { useCallback, useRef, useState } from 'react'
import {
  ChevronDown, ChevronRight, UserCircle, Archive, ShieldCheck, User, KeyRound, Shield,
  MonitorSmartphone, Bot, Share2, Keyboard, Palette, UserX, Puzzle, FolderCog,
  FileText, Lock, Paintbrush, Code, GitBranch, Mail, Server, Users, Database,
  ToggleRight, Power, Eye,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { SettingsAction, SettingsCategory, SettingsSection } from '../../state/settingsState'
import type { SettingsNavState } from '../../state/settingsState'
import type { ISettingsRegistry, ISettingsSectionDef } from '../../state/settingsRegistry'
import { SECTION_LABELS, CATEGORY_LABELS } from '../../state/settingsLabels'
import { sectionContentMatches, findSectionHits } from '../../state/settingsSearchIndex'
import { requestSettingsReveal } from '../../state/settingsSearchTarget'
import './SettingsNavList.css'

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
  /** Checks whether a backend feature toggle is enabled — disables sections gated behind an off feature. */
  isFeatureEnabled?: (featureName: string) => boolean
}

/** Icon per settings section. */
const SECTION_ICONS: Record<SettingsSection, LucideIcon> = {
  'profile': User,
  'password': KeyRound,
  'security': Shield,
  'sessions': MonitorSmartphone,
  'mcp-tokens': Bot,
  'public-shares': Share2,
  'keybindings': Keyboard,
  'appearance': Palette,
  'my-vaults': Archive,
  'delete-account': UserX,
  'plugins': Puzzle,
  'vault-config': FolderCog,
  'editor-files': FileText,
  'page-preview': Eye,
  'keychain': Lock,
  'themes': Paintbrush,
  'css-snippets': Code,
  'git-sync': GitBranch,
  'mail-import': Mail,
  'server-config': Server,
  'user-management': Users,
  'vault-management': Database,
  'feature-toggles': ToggleRight,
  'server-restart': Power,
}

/** Icon per settings category. */
const CATEGORY_ICONS: Record<SettingsCategory, LucideIcon> = {
  account: UserCircle,
  vault: Archive,
  administration: ShieldCheck,
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
export function SettingsNavList({ state, isAdmin, registry, dispatch, onNavSelect, activeVaultId, isFeatureEnabled }: SettingsNavListProps) {
  const listRef = useRef<HTMLUListElement>(null)
  const [collapsed, setCollapsed] = useState<ReadonlySet<SettingsCategory>>(new Set())

  const toggleCategory = useCallback((category: SettingsCategory) => {
    setCollapsed((prev) => {
      const next = new Set(prev)
      if (next.has(category)) next.delete(category)
      else next.add(category)
      return next
    })
  }, [])

  const handleSectionClick = useCallback((category: SettingsCategory, section: SettingsSection) => {
    dispatch({ type: 'NAVIGATE', payload: { category, section } })
    onNavSelect?.()
  }, [dispatch, onNavSelect])

  const handleHitClick = useCallback((category: SettingsCategory, section: SettingsSection, text: string) => {
    dispatch({ type: 'NAVIGATE', payload: { category, section } })
    requestSettingsReveal(section, text)
    onNavSelect?.()
  }, [dispatch, onNavSelect])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLUListElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return

    e.preventDefault()
    const list = listRef.current
    if (list === null) return

    const buttons = Array.from(list.querySelectorAll<HTMLButtonElement>(
      'button.settings-nav-list__section-btn:not(:disabled), button.settings-nav-list__hit-btn'
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
      if (query === '' || label.toLowerCase().includes(query) || sectionContentMatches(def.id, query)) {
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
      {groupedSections.map(({ category, sections }) => {
        // While searching, show every match regardless of collapse state.
        const isOpen = query !== '' || !collapsed.has(category)
        const CategoryIcon = CATEGORY_ICONS[category]
        const Chevron = isOpen ? ChevronDown : ChevronRight
        const listId = `settings-nav-category-${category}`
        return (
          <li key={category} role="presentation">
            <button
              type="button"
              className="settings-nav-list__category-heading"
              aria-expanded={isOpen}
              aria-controls={listId}
              onClick={() => { toggleCategory(category) }}
            >
              <Chevron size={14} aria-hidden="true" />
              <CategoryIcon size={14} aria-hidden="true" />
              <span>{CATEGORY_LABELS[category]}</span>
            </button>
            <ul
              id={listId}
              role="list"
              hidden={!isOpen}
              style={{ listStyle: 'none', margin: 0, padding: 0 }}
            >
              {sections.map(({ def, label }) => {
                const isActive = state.category === def.category && state.section === def.id
                const vaultId = activeVaultId !== undefined ? activeVaultId : state.selectedVaultId
                const noVaultSelected = def.requiresVault && vaultId === null
                const featureDisabled = def.feature !== undefined && isFeatureEnabled !== undefined && !isFeatureEnabled(def.feature)
                const isDisabled = noVaultSelected || featureDisabled
                const SectionIcon = SECTION_ICONS[def.id]

                return (
                  <li key={def.id} role="presentation">
                    <button
                      type="button"
                      className="settings-nav-list__section-btn"
                      aria-current={isActive ? 'page' : undefined}
                      disabled={isDisabled}
                      title={featureDisabled ? 'Dieses Feature ist deaktiviert. Bitte an einen Administrator wenden.' : undefined}
                      onClick={() => { handleSectionClick(def.category, def.id) }}
                    >
                      <SectionIcon size={15} aria-hidden="true" />
                      {label}
                    </button>
                    {query !== '' && !isDisabled && (
                      <ul className="settings-nav-list__hits" role="list">
                        {findSectionHits(def.id, query).filter((hit) => hit.toLowerCase() !== label.toLowerCase()).map((hit) => (
                          <li key={hit} role="presentation">
                            <button
                              type="button"
                              className="settings-nav-list__hit-btn"
                              title={hit}
                              onClick={() => { handleHitClick(def.category, def.id, hit) }}
                            >
                              {hit}
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                )
              })}
            </ul>
          </li>
        )
      })}
    </ul>
  )
}
