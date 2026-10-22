/**
 * WebViewer — renders an external web page inside a sandboxed iframe, as a tab.
 *
 * Backs the "Webseite öffnen" command (R4). The URL travels in the tab's
 * virtual path (`__webview::<url>`), so a web-viewer tab persists and restores
 * like any other tab. The iframe is sandboxed (scripts/same-origin/forms/popups
 * only — no top-navigation, no pointer-lock) and only `http(s)` URLs are
 * accepted; anything else renders an error instead of an iframe. CSP already
 * permits `frame-src 'self' https:`.
 *
 * This is the explicit, user-initiated viewer. The `![](url)` auto-embed in a
 * note (behind an opt-in setting) reuses the same sandbox in a smaller inline
 * frame — see EmbeddedWebFrame.
 */

import { memo, useMemo } from 'react'
import { ExternalLink, Globe } from 'lucide-react'
import { parseWebUrl } from './web-url'
import './WebViewer.css'

export interface WebViewerProps {
  /** The external URL to display. */
  url: string
}

export const WebViewer = memo(function WebViewer({ url }: WebViewerProps) {
  const { valid, displayUrl } = useMemo(() => parseWebUrl(url), [url])

  if (!valid) {
    return (
      <div className="web-viewer web-viewer--error" role="alert">
        Diese Adresse kann nicht angezeigt werden — nur <code>http(s)</code>-URLs werden unterstützt.
      </div>
    )
  }

  return (
    <div className="web-viewer">
      <div className="web-viewer__header">
        <Globe size={14} aria-hidden="true" />
        <span className="web-viewer__url" title={url}>{displayUrl}</span>
        <a
          className="web-viewer__external"
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="In neuem Tab öffnen"
          title="In neuem Tab öffnen"
        >
          <ExternalLink size={14} aria-hidden="true" />
        </a>
      </div>
      <iframe
        src={url}
        className="web-viewer__frame"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
        title={`Webseite: ${displayUrl}`}
        loading="lazy"
        referrerPolicy="no-referrer"
      />
    </div>
  )
})
