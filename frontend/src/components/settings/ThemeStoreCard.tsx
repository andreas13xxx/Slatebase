/**
 * ThemeStoreCard — one community theme in the store browser: screenshot, name, author, modes and the install state.
 *
 * Presentational: all state (installing, errors, versions) comes from ThemeStoreBrowser.
 */
import { useTranslation } from '../../i18n'
import { useState } from 'react'
import { Check, Image as ImageIcon, Loader2 } from 'lucide-react'
import { storeThemeScreenshotUrl } from '../../api'
import type { CommunityTheme, ThemeStoreUpdate } from '../../api'
import { Button } from './ui'
import { formatDownloads } from './themeStoreFilter'

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
export function ThemeStoreCard({ theme, installedVersion, update, busy, error, onInstall, onUpdate }: ThemeStoreCardProps) {
  const { t } = useTranslation()
  // A failed image (missing file, unsupported type, offline) shows the placeholder; it never blocks anything.
  const [imageFailed, setImageFailed] = useState(false)
  const installed = installedVersion !== undefined
  const modes = theme.modes.length > 0 ? theme.modes.map((m) => (m === 'dark' ? t('settingsUi.modeDark') : t('settingsUi.modeLight'))).join(' · ') : t('settingsUi.modeUnknown')

  return (
    <li className="theme-store-card" data-repo={theme.repo}>
      <div className="theme-store-card__image">
        {imageFailed ? (
          <span className="theme-store-card__placeholder"><ImageIcon size={20} aria-hidden="true" /> {t('settingsUi.noPreview')}</span>
        ) : (
          <img
            src={storeThemeScreenshotUrl(theme.repo)}
            alt={t('settingsUi.previewOf', { name: theme.name })}
            loading="lazy"
            onError={() => setImageFailed(true)}
          />
        )}
      </div>

      <div className="theme-store-card__body">
        <h4 className="theme-store-card__name">{theme.name}</h4>
        <p className="theme-store-card__meta">
          {theme.author !== '' ? `von ${theme.author} · ` : ''}{modes}
          {theme.downloads !== undefined && ` · ${formatDownloads(theme.downloads)} Downloads`}
          {theme.legacy && <span className="theme-store-card__legacy"> · Veraltet</span>}
        </p>

        <div className="theme-store-card__actions">
          {busy ? (
            <span className="theme-store-card__status" role="status">
              <Loader2 size={14} className="theme-store-card__spinner" aria-hidden="true" /> {t('settingsUi.loading')}
            </span>
          ) : update !== undefined ? (
            <>
              <span className="theme-store-card__status">{update.installedVersion} → {update.latestVersion}</span>
              <Button size="sm" variant="primary" onClick={onUpdate} aria-label={t('settingsUi.updateNamed', { name: theme.name })}>{t('settingsUi.update')}</Button>
            </>
          ) : installed ? (
            <span className="theme-store-card__status">
              <Check size={14} aria-hidden="true" /> {t('settingsUi.installedLabel')}{installedVersion !== '' ? ` (${installedVersion})` : ''}
            </span>
          ) : (
            <Button size="sm" variant="secondary" onClick={onInstall} aria-label={t('settingsUi.installNamed', { name: theme.name })}>{t('settingsUi.install')}</Button>
          )}
        </div>

        {error !== undefined && <p className="theme-store-card__error" role="alert">{error}</p>}
      </div>
    </li>
  )
}
