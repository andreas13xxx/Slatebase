/**
 * ThemesSection — Settings section for the vault's Obsidian themes.
 * Lives under the Vault category: themes are vault content (`.obsidian/themes/`) and the
 * selection applies to everyone who opens the vault.
 *
 * Tabs: "Installiert" (the vault's themes), "Entdecken" (the community catalog) and "Importieren" (upload a
 * theme.css). "Entdecken" exists only while the server's `obsidian-theme-store` feature is on, because it is the
 * one part of themes that makes the server contact GitHub.
 *
 * @module components/settings/ThemesSection
 */
import { useCallback, useId, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useAppContext } from '../../state'
import { useFeatureContext } from '../../state/featureContext'
import { ThemeImport } from './ThemeImport'
import { ThemeManager } from './ThemeManager'
import { ThemeStoreBrowser } from './ThemeStoreBrowser'
import { SettingSection } from './ui'

type ThemesTab = 'installed' | 'discover' | 'import'

const TABS: ReadonlyArray<{ id: ThemesTab; label: string }> = [
  { id: 'installed', label: 'Installiert' },
  { id: 'discover', label: 'Entdecken' },
  { id: 'import', label: 'Importieren' },
]

/** Wraps ThemeManager (and, with the store feature on, the catalog browser) with the section title/description. */
export function ThemesSection() {
  const { isEnabled } = useFeatureContext()
  const { state } = useAppContext()
  const storeEnabled = isEnabled('obsidian-theme-store')
  const tabs = useMemo(() => (storeEnabled ? TABS : TABS.filter((t) => t.id !== 'discover')), [storeEnabled])
  const [tab, setTab] = useState<ThemesTab>('installed')
  const baseId = useId()
  const tabRefs = useRef<Record<ThemesTab, HTMLButtonElement | null>>({ installed: null, discover: null, import: null })

  // Arrow keys move between the tabs, as the ARIA tabs pattern expects.
  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') return
    e.preventDefault()
    const order = tabs.map((t) => t.id)
    const index = order.indexOf(tab)
    const next =
      e.key === 'Home' ? 0
        : e.key === 'End' ? order.length - 1
          : (index + (e.key === 'ArrowRight' ? 1 : -1) + order.length) % order.length
    const target = order[next]
    if (target === undefined) return
    setTab(target)
    tabRefs.current[target]?.focus()
  }, [tab, tabs])

  // Feature switched off while the discover tab was open: fall back to the installed themes.
  const shown: ThemesTab = tabs.some((t) => t.id === tab) ? tab : 'installed'

  return (
    <SettingSection title="Themes" description="Obsidian-Themes für diesen Vault installieren und auswählen.">
      <div className="themes-tabs" role="tablist" aria-label="Themes">
        {tabs.map((t) => (
          <button
            key={t.id}
            ref={(node) => { tabRefs.current[t.id] = node }}
            type="button"
            role="tab"
            id={`${baseId}-tab-${t.id}`}
            aria-selected={shown === t.id}
            aria-controls={`${baseId}-panel-${t.id}`}
            tabIndex={shown === t.id ? 0 : -1}
            className="themes-tab"
            onClick={() => setTab(t.id)}
            onKeyDown={handleKeyDown}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div
        role="tabpanel"
        id={`${baseId}-panel-${shown}`}
        aria-labelledby={`${baseId}-tab-${shown}`}
      >
        {shown === 'installed' && <ThemeManager />}
        {shown === 'discover' && <ThemeStoreBrowser key={state.selectedVaultId ?? ''} />}
        {shown === 'import' && <ThemeImport key={state.selectedVaultId ?? ''} />}
      </div>
    </SettingSection>
  )
}
