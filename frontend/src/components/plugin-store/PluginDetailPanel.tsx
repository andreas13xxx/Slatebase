/**
 * PluginDetailPanel — Modal overlay showing plugin details and README.md.
 *
 * Fetches the plugin's README from GitHub via the backend proxy,
 * renders it as HTML using a simple markdown-to-HTML conversion,
 * and provides install/update actions.
 */
import { useState, useEffect, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { X, Loader2, ExternalLink } from 'lucide-react'
import type { IApiClient } from '../../api'
import { useTranslation } from '../../i18n'
import { extractErrorMessage } from '../../utils/error'
import { useFocusTrap } from '../../hooks/useFocusTrap'
import { markdownToHtml } from '../../utils/simpleMarkdownToHtml'
import type { PluginStoreDisplayEntry } from './types'

/** Props for the PluginDetailPanel component. */
export interface PluginDetailPanelProps {
  /** Plugin data to display. */
  plugin: PluginStoreDisplayEntry
  /** API client for fetching README and performing actions. */
  apiClient: IApiClient
  /** Called when user clicks install. */
  onInstall: (pluginId: string, repo: string) => void
  /** Called when user clicks update. */
  onUpdate: (pluginId: string) => void
  /** Called when user closes the panel. */
  onClose: () => void
}

/**
 * Modal panel that shows full plugin details including the README.md
 * fetched from GitHub.
 */
export function PluginDetailPanel({
  plugin,
  apiClient,
  onInstall,
  onUpdate,
  onClose,
}: PluginDetailPanelProps) {
  const { t } = useTranslation()
  const [readme, setReadme] = useState<string | null>(null)
  const [readmeLoading, setReadmeLoading] = useState(true)
  const [readmeError, setReadmeError] = useState<string | null>(null)

  // Fetch README on mount
  useEffect(() => {
    let cancelled = false

    async function loadReadme() {
      setReadmeLoading(true)
      setReadmeError(null)
      try {
        const content = await apiClient.getPluginReadme(plugin.repo)
        if (!cancelled) {
          setReadme(content)
        }
      } catch (err: unknown) {
        if (!cancelled) {
          setReadmeError(extractErrorMessage(err, t('pluginStore.detailReadmeError')))
        }
      } finally {
        if (!cancelled) {
          setReadmeLoading(false)
        }
      }
    }

    void loadReadme()
    return () => { cancelled = true }
  }, [apiClient, plugin.repo, t])

  // Focus trap: Tab cycling + Escape → close
  const containerRef = useFocusTrap<HTMLDivElement>({
    isActive: true,
    onEscape: onClose,
    returnFocusOnDeactivate: true,
  })

  // Close on overlay click (not panel itself)
  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }, [onClose])

  const isBusy = plugin.status === 'installing' || plugin.status === 'updating'
  const isDesktopOnly = plugin.status === 'desktop-only'

  return createPortal(
    <div className="plugin-detail-overlay" onClick={handleOverlayClick} role="dialog" aria-modal="true">
      <div ref={containerRef} className="plugin-detail-panel">
        {/* Header */}
        <div className="plugin-detail-panel__header">
          <div className="plugin-detail-panel__header-info">
            <span className="plugin-detail-panel__title">{plugin.name}</span>
            <span className="plugin-detail-panel__subtitle">
              {t('pluginStore.detailBy')} {plugin.author}
              {plugin.installedVersion && ` · ${t('pluginStore.detailVersion')} ${plugin.installedVersion}`}
            </span>
          </div>
          <button
            className="plugin-detail-panel__close"
            onClick={onClose}
            aria-label={t('pluginStore.detailClose')}
          >
            <X size={18} />
          </button>
        </div>

        {/* Actions bar */}
        <div className="plugin-detail-panel__actions">
          {plugin.hasUpdate && (
            <button
              className="plugin-store-card__button plugin-store-card__button--update"
              disabled={isBusy}
              onClick={() => onUpdate(plugin.id)}
            >
              {isBusy && <Loader2 size={14} className="spin" aria-hidden="true" />}
              {t('pluginStore.update')}
            </button>
          )}
          {!plugin.isInstalled && !isDesktopOnly && (
            <button
              className="plugin-store-card__button plugin-store-card__button--install"
              disabled={isBusy}
              onClick={() => onInstall(plugin.id, plugin.repo)}
            >
              {isBusy && <Loader2 size={14} className="spin" aria-hidden="true" />}
              {t('pluginStore.install')}
            </button>
          )}
          {plugin.isInstalled && !plugin.hasUpdate && (
            <span className="plugin-store-card__badge plugin-store-card__badge--installed">
              {t('pluginStore.installed')}
            </span>
          )}
          <a
            className="plugin-store-card__release-link"
            href={`https://github.com/${plugin.repo}`}
            target="_blank"
            rel="noopener noreferrer"
          >
            <ExternalLink size={12} aria-hidden="true" />
            {t('pluginStore.detailRepo')}
          </a>
        </div>

        {/* README content */}
        <div className="plugin-detail-panel__content">
          {readmeLoading && (
            <div className="plugin-detail-panel__loading">
              <Loader2 size={18} className="spin" aria-hidden="true" />
              <span>{t('pluginStore.detailLoadingReadme')}</span>
            </div>
          )}
          {readmeError && (
            <div className="plugin-detail-panel__error">
              {readmeError}
            </div>
          )}
          {!readmeLoading && !readmeError && readme !== null && (
            <div
              className="plugin-detail-panel__readme"
              dangerouslySetInnerHTML={{ __html: markdownToHtml(readme, plugin.repo) }}
            />
          )}
          {!readmeLoading && !readmeError && readme === null && (
            <div className="plugin-detail-panel__error">
              {t('pluginStore.detailNoReadme')}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}
