/**
 * PluginStoreCard — Individual plugin card in the store browser.
 *
 * Displays plugin info (name, author, description), version details,
 * status badges, and action buttons (install/update). Handles loading
 * states and error display.
 */
import { ExternalLink, Loader2, Check, Download, Clock } from 'lucide-react'
import { useTranslation, type TranslateFn } from '../../i18n'
import type { PluginStoreDisplayEntry } from './types'

/** Props for the PluginStoreCard component. */
export interface PluginStoreCardProps {
  /** Plugin data enriched with local state for display. */
  plugin: PluginStoreDisplayEntry
  /** Called when the user clicks "Installieren". */
  onInstall: (pluginId: string, repo: string) => void
  /** Called when the user clicks "Aktualisieren". */
  onUpdate: (pluginId: string) => void
  /** Called when the user clicks the card itself (opens detail). */
  onClick?: (plugin: PluginStoreDisplayEntry) => void
}

/**
 * Plugin card component showing plugin info, status badges, and action buttons.
 *
 * Display varies based on plugin status:
 * - Available: Shows "Installieren" button
 * - Installed: Shows "Installiert" badge with check icon
 * - Update available: Shows version diff and "Aktualisieren" button
 * - Desktop-only: Grayed out with disabled button
 * - Installing/Updating: Spinner with disabled button
 */
export function PluginStoreCard({ plugin, onInstall, onUpdate, onClick }: PluginStoreCardProps) {
  const { t } = useTranslation()

  const isDesktopOnly = plugin.status === 'desktop-only'
  const isInstalling = plugin.status === 'installing'
  const isUpdating = plugin.status === 'updating'
  const isBusy = isInstalling || isUpdating

  const cardClassName = [
    'plugin-store-card',
    isDesktopOnly ? 'plugin-store-card--desktop-only' : '',
    isBusy ? 'plugin-store-card--installing' : '',
  ].filter(Boolean).join(' ')

  return (
    <div className={cardClassName} onClick={() => onClick?.(plugin)} role="button" tabIndex={0} onKeyDown={(e) => { if (e.key === 'Enter') onClick?.(plugin) }}>
      <div className="plugin-store-card__header">
        <span className="plugin-store-card__name">{plugin.name}</span>
        <span className="plugin-store-card__version">{renderVersion(plugin)}</span>
      </div>

      <div className="plugin-store-card__meta">
        <span className="plugin-store-card__author">{plugin.author}</span>
        <span className="plugin-store-card__description">{plugin.description}</span>
      </div>

      {(plugin.downloads !== undefined || plugin.updatedAt) && (
        <div className="plugin-store-card__stats">
          {plugin.downloads !== undefined && (
            <span className="plugin-store-card__stat">
              <Download size={12} aria-hidden="true" />
              {formatDownloads(plugin.downloads)}
            </span>
          )}
          {plugin.updatedAt && (
            <span className="plugin-store-card__stat">
              <Clock size={12} aria-hidden="true" />
              {formatRelativeDate(plugin.updatedAt)}
            </span>
          )}
        </div>
      )}

      <div className="plugin-store-card__footer">
        <div className="plugin-store-card__badges">
          {plugin.isInstalled && !plugin.hasUpdate && (
            <span className="plugin-store-card__badge plugin-store-card__badge--installed">
              <Check size={14} aria-hidden="true" />
              {t('pluginStore.installed')}
            </span>
          )}
          {plugin.hasUpdate && (
            <span className="plugin-store-card__badge plugin-store-card__badge--update">
              {t('pluginStore.updateAvailable')}
            </span>
          )}
          {isDesktopOnly && (
            <span className="plugin-store-card__badge plugin-store-card__badge--desktop">
              {t('pluginStore.desktopOnly')}
            </span>
          )}
        </div>

        <div className="plugin-store-card__actions">
          {renderActionButton(plugin, isBusy, isDesktopOnly, t, onInstall, onUpdate)}
          {plugin.hasUpdate && plugin.releaseUrl && (
            <a
              className="plugin-store-card__release-link"
              href={plugin.releaseUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink size={12} aria-hidden="true" />
              {t('pluginStore.releaseNotes')}
            </a>
          )}
        </div>
      </div>

      {plugin.error && (
        <div className="plugin-store-card__error">
          {plugin.error}
        </div>
      )}
    </div>
  )
}

/**
 * Renders the version string based on plugin state.
 * Only shows version for installed plugins:
 * - Installed with update: "v1.0.0 → v1.1.0"
 * - Installed, no update: "v1.0.0"
 * - Not installed: empty (no version info available without individual manifest fetch)
 */
function renderVersion(plugin: PluginStoreDisplayEntry): string {
  if (plugin.isInstalled && plugin.hasUpdate && plugin.installedVersion && plugin.latestVersion) {
    return `v${plugin.installedVersion} → v${plugin.latestVersion}`
  }
  if (plugin.isInstalled && plugin.installedVersion) {
    return `v${plugin.installedVersion}`
  }
  return ''
}

/**
 * Renders the appropriate action button based on plugin status.
 */
function renderActionButton(
  plugin: PluginStoreDisplayEntry,
  isBusy: boolean,
  isDesktopOnly: boolean,
  t: TranslateFn,
  onInstall: (pluginId: string, repo: string) => void,
  onUpdate: (pluginId: string) => void,
): React.ReactNode {
  // Update available — show "Aktualisieren" button
  if (plugin.hasUpdate) {
    return (
      <button
        className="plugin-store-card__button plugin-store-card__button--update"
        disabled={isBusy}
        onClick={(e) => { e.stopPropagation(); onUpdate(plugin.id) }}
      >
        {isBusy && <Loader2 size={14} className="spin" aria-hidden="true" />}
        {t('pluginStore.update')}
      </button>
    )
  }

  // Already installed, no update — no action button needed (badge handles it)
  if (plugin.isInstalled) {
    return null
  }

  // Not installed — show "Installieren" button
  return (
    <button
      className="plugin-store-card__button plugin-store-card__button--install"
      disabled={isBusy || isDesktopOnly}
      onClick={(e) => { e.stopPropagation(); onInstall(plugin.id, plugin.repo) }}
    >
      {isBusy && <Loader2 size={14} className="spin" aria-hidden="true" />}
      {t('pluginStore.install')}
    </button>
  )
}

/**
 * Formats a download count with K/M suffixes for readability.
 * Examples: 950 → "950", 1200 → "1.2K", 1500000 → "1.5M"
 */
function formatDownloads(count: number): string {
  if (count >= 1_000_000) {
    return `${(count / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  }
  if (count >= 1_000) {
    return `${(count / 1_000).toFixed(1).replace(/\.0$/, '')}K`
  }
  return String(count)
}

/**
 * Formats an ISO 8601 date string as a relative time label.
 * Examples: "vor 3 Tagen", "vor 2 Monaten", "vor 1 Jahr"
 */
function formatRelativeDate(isoDate: string): string {
  const date = new Date(isoDate)
  const now = Date.now()
  const diffMs = now - date.getTime()

  if (diffMs < 0) return date.toLocaleDateString()

  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24))

  if (diffDays === 0) return 'heute'
  if (diffDays === 1) return 'gestern'
  if (diffDays < 30) return `vor ${diffDays} Tagen`

  const diffMonths = Math.floor(diffDays / 30)
  if (diffMonths === 1) return 'vor 1 Monat'
  if (diffMonths < 12) return `vor ${diffMonths} Monaten`

  const diffYears = Math.floor(diffDays / 365)
  if (diffYears === 1) return 'vor 1 Jahr'
  return `vor ${diffYears} Jahren`
}
