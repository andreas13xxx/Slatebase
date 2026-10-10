/**
 * Hover preview popover for internal links.
 *
 * Mounted once, near the root. It listens on the hover-link bus, so it serves
 * both Slatebase's own internal links and plugins that call
 * `workspace.trigger('hover-link', …)` — in Obsidian that call is picked up by
 * the core "Page preview" plugin, and this is its counterpart.
 *
 * @module HoverPreview
 */

import { useContext, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { AppContext } from '../state'
import { ViewMode } from './ViewMode'
import { HoverPreviewProperties } from './HoverPreviewProperties'
import { resolveWikilinkTarget } from '../plugins/link-resolver'
import { detectPlatform, readPlatformEnvironment } from '../plugins/compat/platform-detection'
import { onHoverPreview, type HoverPreviewRequest } from '../plugins/compat/hover-link-bus'
import { placeHoverPreview, type PopoverPlacement } from './hover-preview-position'
import { locateFrontmatterBlock } from '../utils/frontmatterWriter'
import './HoverPreview.css'

/** How long the pointer must rest on a link before a preview appears. */
const SHOW_DELAY_MS = 300
/** Grace period so the pointer can travel from the link into the popover. */
const HIDE_DELAY_MS = 200
/** Preview is a glance, not the whole note. */
const MAX_PREVIEW_CHARS = 2000

export function HoverPreview() {
  const appContext = useContext(AppContext)
  const apiClient = appContext?.apiClient ?? null
  const vaultId = appContext?.state.selectedVaultId ?? null
  const directoryTree = appContext?.state.directoryTree ?? null

  const [request, setRequest] = useState<HoverPreviewRequest | null>(null)
  const [content, setContent] = useState<string | null>(null)
  const [resolvedPath, setResolvedPath] = useState<string | null>(null)
  const [placement, setPlacement] = useState<PopoverPlacement | null>(null)
  const popoverRef = useRef<HTMLDivElement | null>(null)
  const showTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Hover has no meaning on a touch device — a tap would fire it on every link.
  // Computed once; the device does not change under a running session.
  const [isTouch] = useState(() => detectPlatform(readPlatformEnvironment()).isMobile)

  // Subscribe to preview requests.
  useEffect(() => {
    if (isTouch) return

    const clearTimers = (): void => {
      if (showTimer.current) clearTimeout(showTimer.current)
      if (hideTimer.current) clearTimeout(hideTimer.current)
    }

    return onHoverPreview(
      (next) => {
        clearTimers()
        showTimer.current = setTimeout(() => setRequest(next), SHOW_DELAY_MS)
      },
      () => {
        clearTimers()
        hideTimer.current = setTimeout(() => {
          setRequest(null)
          setContent(null)
          setResolvedPath(null)
          setPlacement(null)
        }, HIDE_DELAY_MS)
      },
    )
  }, [isTouch])

  // Dismiss on Escape or when the page scrolls out from under the anchor.
  useEffect(() => {
    if (!request) return
    const dismiss = (): void => {
      setRequest(null)
      setContent(null)
      setResolvedPath(null)
      setPlacement(null)
    }
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') dismiss()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('scroll', dismiss, true)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', dismiss, true)
    }
  }, [request])

  // Load the target note.
  useEffect(() => {
    if (!request || !apiClient || !vaultId) return
    let cancelled = false

    // Plugins pass a wikilink target rather than a path; our own links already
    // carry a resolved path.
    const path = request.linkPath.endsWith('.md')
      ? request.linkPath
      : (resolveWikilinkTarget(request.linkPath, directoryTree) ?? request.linkPath)

    apiClient
      .fetchFileContent(vaultId, path)
      .then((file) => {
        if (cancelled) return
        const text = file.content ?? ''
        setResolvedPath(path)
        setContent(
          text.length > MAX_PREVIEW_CHARS ? `${text.slice(0, MAX_PREVIEW_CHARS)}\n\n…` : text,
        )
      })
      .catch(() => {
        if (!cancelled) {
          setContent(null)
          setResolvedPath(null)
        }
      })

    return () => {
      cancelled = true
    }
  }, [request, apiClient, vaultId, directoryTree])

  // Position once the popover has a measurable size.
  useLayoutEffect(() => {
    if (!request || !popoverRef.current || content === null) return
    const anchor = request.targetEl.getBoundingClientRect()
    const box = popoverRef.current.getBoundingClientRect()

    setPlacement(
      placeHoverPreview(
        { top: anchor.top, left: anchor.left, width: anchor.width, height: anchor.height },
        { width: box.width, height: box.height },
        { width: window.innerWidth, height: window.innerHeight },
      ),
    )
  }, [request, content])

  if (isTouch || !request || content === null) return null

  const keepOpen = (): void => {
    if (hideTimer.current) clearTimeout(hideTimer.current)
  }
  const leave = (): void => {
    hideTimer.current = setTimeout(() => {
      setRequest(null)
      setContent(null)
      setResolvedPath(null)
      setPlacement(null)
    }, HIDE_DELAY_MS)
  }

  // Editing frontmatter is only safe when the full note is loaded — a truncated
  // preview would save a truncated note back. The loader appends "\n\n…" when it
  // cuts the content, which is the signal.
  const isTruncated = content.endsWith('\n\n…')
  const isMarkdown = (resolvedPath ?? '').toLowerCase().endsWith('.md')
  const selectedVault = appContext?.state.vaults.find((v) => v.id === vaultId)
  const hasWriteAccess = selectedVault?.permission === 'owner' || selectedVault?.permission === 'write'
  const propertiesEditable = !isTruncated && isMarkdown && resolvedPath !== null && apiClient !== null && vaultId !== null

  // When properties are shown as an editable block, strip the frontmatter from
  // the body so it is not rendered a second time by ViewMode's read-only table.
  let bodyContent = content
  if (propertiesEditable) {
    const location = locateFrontmatterBlock(content)
    if (location) {
      const blockEnd = content.indexOf('\n', location.to + 1)
      bodyContent = blockEnd === -1 ? '' : content.slice(blockEnd + 1)
    }
  }

  return (
    <div
      ref={popoverRef}
      className={`hover-preview hover-preview--${placement?.side ?? 'below'}`}
      // Hidden until measured, so it never flashes at the wrong position.
      style={{
        top: placement?.top ?? 0,
        left: placement?.left ?? 0,
        visibility: placement ? 'visible' : 'hidden',
      }}
      role="tooltip"
      onMouseEnter={keepOpen}
      onMouseLeave={leave}
    >
      <div className="hover-preview__content">
        {propertiesEditable && resolvedPath && apiClient && vaultId && (
          <HoverPreviewProperties
            content={content}
            vaultId={vaultId}
            filePath={resolvedPath}
            apiClient={apiClient}
            hasWriteAccess={hasWriteAccess}
            onContentChange={setContent}
          />
        )}
        <ViewMode
          content={bodyContent}
          vaultId={vaultId ?? ''}
          directoryTree={directoryTree}
          // No navigation from inside a preview, and no nested previews.
        />
      </div>
    </div>
  )
}
