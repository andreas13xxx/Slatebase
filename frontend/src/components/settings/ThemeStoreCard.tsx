/**
 * ThemeStoreCard — one community theme in the store browser: screenshot, name, author, modes and the install state.
 *
 * Presentational: all state (installing, errors, versions) comes from ThemeStoreBrowser.
 */
import { useState } from 'react'
import { Check, Image as ImageIcon, Loader2 } from 'lucide-react'
import { storeThemeScreenshotUrl } from '../../api'
import type { CommunityTheme, ThemeStoreUpdate } from '../../api'
import { Button } from './ui'

export interface ThemeStoreCardProps {
  theme: CommunityTheme
  /** Version of the installed theme with this name; undefined if it is not installed. `''` = installed, no version. */
  installedVersion: string | undefined
  /** Newer version in the catalog, if the update check found one. */
  update: ThemeStoreUpdate | undefined
  /** An install or update of this theme is running. */
  busy: boolean
  /** Why the last install attempt failed, if it did. */
  error: string | undefined
  onInstall: () => void
  onUpdate: () => void
}

/** Mode names are spelled out so the badge never relies on color alone. */
const MODE_LABEL: Record<'dark' | 'light', string> = { dark: 'Dunkel', light: 'Hell' }

export function ThemeStoreCard({ theme, installedVersion, update, busy, error, onInstall, onUpdate }: ThemeStoreCardProps) {
  // A failed image (missing file, unsupported type, offline) shows the placeholder; it never blocks anything.
  const [imageFailed, setImageFailed] = useState(false)
  const installed = installedVersion !== undefined
  const modes = theme.modes.length > 0 ? theme.modes.map((m) => MODE_LABEL[m]).join(' · ') : 'Modus unbekannt'

  return (
    <li className="theme-store-card" data-repo={theme.repo}>
      <div className="theme-store-card__image">
        {imageFailed ? (
          <span className="theme-store-card__placeholder"><ImageIcon size={20} aria-hidden="true" /> Keine Vorschau</span>
        ) : (
          <img
            src={storeThemeScreenshotUrl(theme.repo)}
            alt={`Vorschau von ${theme.name}`}
            loading="lazy"
            onError={() => setImageFailed(true)}
          />
        )}
      </div>

      <div className="theme-store-card__body">
        <h4 className="theme-store-card__name">{theme.name}</h4>
        <p className="theme-store-card__meta">
          {theme.author !== '' ? `von ${theme.author} · ` : ''}{modes}
          {theme.legacy && <span className="theme-store-card__legacy"> · Veraltet</span>}
        </p>

        <div className="theme-store-card__actions">
          {busy ? (
            <span className="theme-store-card__status" role="status">
              <Loader2 size={14} className="theme-store-card__spinner" aria-hidden="true" /> Wird geladen…
            </span>
          ) : update !== undefined ? (
            <>
              <span className="theme-store-card__status">{update.installedVersion} → {update.latestVersion}</span>
              <Button size="sm" variant="primary" onClick={onUpdate} aria-label={`${theme.name} aktualisieren`}>Aktualisieren</Button>
            </>
          ) : installed ? (
            <span className="theme-store-card__status">
              <Check size={14} aria-hidden="true" /> Installiert{installedVersion !== '' ? ` (${installedVersion})` : ''}
            </span>
          ) : (
            <Button size="sm" variant="secondary" onClick={onInstall} aria-label={`${theme.name} installieren`}>Installieren</Button>
          )}
        </div>

        {error !== undefined && <p className="theme-store-card__error" role="alert">{error}</p>}
      </div>
    </li>
  )
}
