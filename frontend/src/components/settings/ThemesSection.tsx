/**
 * ThemesSection — Settings section for the vault's Obsidian themes.
 * Lives under the Vault category: themes are vault content (`.obsidian/themes/`) and the
 * selection applies to everyone who opens the vault.
 *
 * Two tabs: "Installiert" (the vault's themes, import) and "Entdecken" (the community catalog). The second
 * exists only while the server's `obsidian-theme-store` feature is on, because it is the one part of themes
 * that makes the server contact GitHub.
 *
 * @module components/settings/ThemesSection
 */
import { useCallback, useId, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import { useFeatureContext } from '../../state/featureContext'
import { ThemeManager } from './ThemeManager'
import { ThemeStoreBrowser } from './ThemeStoreBrowser'
import { SettingSection } from './ui'

type ThemesTab = 'installed' | 'discover'

const TABS: ReadonlyArray<{ id: ThemesTab; label: string }> = [
  { id: 'installed', label: 'Installiert' },
  { id: 'discover', label: 'Entdecken' },
]

/** Wraps ThemeManager (and, with the store feature on, the catalog browser) with the section title/description. */
export function ThemesSection() {
  const { isEnabled } = useFeatureContext()
  const storeEnabled = isEnabled('obsidian-theme-store')
  const [tab, setTab] = useState<ThemesTab>('installed')
  const baseId = useId()
  const tabRefs = useRef<Record<ThemesTab, HTMLButtonElement | null>>({ installed: null, discover: null })

  // Arrow keys move between the tabs, as the ARIA tabs pattern expects.
  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft' && e.key !== 'Home' && e.key !== 'End') return
    e.preventDefault()
    const order = TABS.map((t) => t.id)
    const index = order.indexOf(tab)
    const next =
      e.key === 'Home' ? 0
        : e.key === 'End' ? order.length - 1
          : (index + (e.key === 'ArrowRight' ? 1 : -1) + order.length) % order.length
    const target = order[next]
    if (target === undefined) return
    setTab(target)
    tabRefs.current[target]?.focus()
  }, [tab])

  // Feature switched off while the discover tab was open: fall back to the installed themes.
  const shown: ThemesTab = storeEnabled ? tab : 'installed'

  return (
    <SettingSection title="Themes" description="Obsidian-Themes für diesen Vault installieren und auswählen.">
      {storeEnabled && (
        <div className="themes-tabs" role="tablist" aria-label="Themes">
          {TABS.map((t) => (
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
      )}

      <div
        role={storeEnabled ? 'tabpanel' : undefined}
        id={`${baseId}-panel-${shown}`}
        aria-labelledby={storeEnabled ? `${baseId}-tab-${shown}` : undefined}
      >
        {shown === 'installed' ? <ThemeManager /> : <ThemeStoreBrowser />}
      </div>
    </SettingSection>
  )
}
