/**
 * PluginDetailPanel — Modal overlay showing plugin details and README.md.
 *
 * Fetches the plugin's README from GitHub via the backend proxy,
 * renders it as HTML using a simple markdown-to-HTML conversion,
 * and provides install/update actions.
 */
import { useState, useEffect, useCallback } from 'react'
import { X, Loader2, ExternalLink } from 'lucide-react'
import type { IApiClient } from '../../api'
import { useTranslation } from '../../i18n'
import { extractErrorMessage } from '../../utils/error'
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

  // Close on Escape key
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        onClose()
      }
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [onClose])

  // Close on overlay click (not panel itself)
  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }, [onClose])

  const isBusy = plugin.status === 'installing' || plugin.status === 'updating'
  const isDesktopOnly = plugin.status === 'desktop-only'

  return (
    <div className="plugin-detail-overlay" onClick={handleOverlayClick} role="dialog" aria-modal="true">
      <div className="plugin-detail-panel">
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
    </div>
  )
}

/**
 * Simple Markdown → HTML conversion for README display.
 * Handles headings, bold, italic, code blocks, inline code, links, images,
 * lists, blockquotes, and horizontal rules.
 * Relative image URLs are resolved against the GitHub raw content URL.
 */
function markdownToHtml(markdown: string, repo: string): string {
  const rawBase = `https://raw.githubusercontent.com/${repo}/HEAD/`

  let html = markdown
    // Escape HTML entities first
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // Code blocks (fenced)
  html = html.replace(/```[\s\S]*?```/g, (match) => {
    const content = match.replace(/```\w*\n?/, '').replace(/\n?```$/, '')
    return `<pre><code>${content}</code></pre>`
  })

  // Headings
  html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>')
  html = html.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>')
  html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>')
  html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>')
  html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>')
  html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>')

  // Horizontal rule
  html = html.replace(/^---+$/gm, '<hr>')

  // Images (before links since ![...] includes [...)
  html = html.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (_match, alt, src) => {
    const resolvedSrc = resolveUrl(src as string, rawBase)
    return `<img src="${resolvedSrc}" alt="${alt as string}" />`
  })

  // Links
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')

  // Bold
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/__(.+?)__/g, '<strong>$1</strong>')

  // Italic
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')
  html = html.replace(/_(.+?)_/g, '<em>$1</em>')

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')

  // Blockquotes
  html = html.replace(/^&gt;\s+(.+)$/gm, '<blockquote>$1</blockquote>')

  // Unordered lists
  html = html.replace(/^[-*]\s+(.+)$/gm, '<li>$1</li>')
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>')

  // Paragraphs (lines not already wrapped in a block element)
  html = html.replace(/^(?!<[a-z]|$)(.+)$/gm, '<p>$1</p>')

  // Clean up empty paragraphs
  html = html.replace(/<p>\s*<\/p>/g, '')

  return html
}

/**
 * Resolves a potentially relative URL against a base URL.
 */
function resolveUrl(src: string, base: string): string {
  if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('//')) {
    return src
  }
  return base + src.replace(/^\.\//, '')
}
