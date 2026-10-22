/**
 * EmbeddedWebFrame — inline sandboxed iframe for `![](url)` auto-embed (R4).
 *
 * Renders a small external web page inline in a note. This is gated behind an
 * opt-in per-user+vault setting (`webEmbedEnabled`, default OFF): auto-loading a
 * third-party URL from a document is a tracking / referer / clickjacking surface,
 * and in a shared vault it would make a reader's browser fetch URLs an author
 * put there. When the setting is off the caller renders the URL as a plain link
 * instead of mounting this.
 *
 * Sandbox is tighter than the WebViewer tab: the embed URL is author-supplied
 * (it sits in a note a reader opens), not reader-chosen, so `allow-same-origin`
 * is deliberately NOT granted here — combined with `allow-scripts` it would let
 * the framed page remove its own sandboxing. Scripts/forms/popups + no-referrer,
 * only http(s) URLs. The WebViewer tab keeps `allow-same-origin` (user-chosen URL).
 */

import { memo } from 'react'
import { ExternalLink } from 'lucide-react'
import { parseWebUrl } from './web-url'
import './WebViewer.css'

export interface EmbeddedWebFrameProps {
  url: string
}

export const EmbeddedWebFrame = memo(function EmbeddedWebFrame({ url }: EmbeddedWebFrameProps) {
  const { valid, displayUrl } = parseWebUrl(url)

  if (!valid) {
    // Not an http(s) URL — fall back to a plain link rather than an empty frame.
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="web-embed__fallback-link">
        {url}
      </a>
    )
  }

  return (
    <span className="web-embed">
      <span className="web-embed__header">
        <a
          className="web-embed__url"
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          title={url}
        >
          {displayUrl}
          <ExternalLink size={11} aria-hidden="true" />
        </a>
      </span>
      <iframe
        src={url}
        className="web-embed__frame"
        sandbox="allow-scripts allow-forms allow-popups"
        title={`Eingebettete Webseite: ${displayUrl}`}
        loading="lazy"
        referrerPolicy="no-referrer"
      />
    </span>
  )
})
