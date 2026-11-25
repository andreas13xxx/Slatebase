/**
 * Props that make an element ask for a page preview while the pointer rests on it.
 *
 * Spread the result onto the element: `<button {...hoverPreviewProps('file-explorer', path)}>`. The
 * popover (`HoverPreview`) decides whether it shows at all — the vault's page-preview.json can require
 * Ctrl for a source — so callers only name their source and the note.
 *
 * Only Markdown notes are previewed; anything else yields no props.
 *
 * @module components/hoverPreviewTrigger
 */
import type { MouseEvent } from 'react'
import { dismissHoverPreview, requestHoverPreview } from '../plugins/compat/hover-link-bus'

/**
 * Asks for a preview of one note anchored to an element. Same rules as hoverPreviewProps, for places
 * that already have their own mouse handlers (SVG nodes, imperative code). Only Markdown notes.
 */
export function showHoverPreview(source: string, path: string | null | undefined, element: Element, heading?: string | null): void {
  if (!path || !path.toLowerCase().endsWith('.md')) return
  requestHoverPreview({
    linkPath: path,
    targetEl: element as HTMLElement,
    source,
    ...(heading ? { heading } : {}),
  })
}

/** Withdraws the preview request of the element the pointer just left. */
export function hideHoverPreview(): void {
  dismissHoverPreview()
}

export interface HoverPreviewTriggerProps {
  onMouseEnter?: (event: MouseEvent<HTMLElement>) => void
  onMouseLeave?: () => void
}

/**
 * @param source  Hover source id (a key of `PAGE_PREVIEW_SOURCES`).
 * @param path    Vault-relative path of the note; null/empty or a non-note gives no props.
 * @param heading Optional heading: the preview then shows only that section.
 */
export function hoverPreviewProps(
  source: string,
  path: string | null | undefined,
  heading?: string | null,
): HoverPreviewTriggerProps {
  if (!path || !path.toLowerCase().endsWith('.md')) return {}
  return {
    onMouseEnter: (event) => showHoverPreview(source, path, event.currentTarget, heading),
    onMouseLeave: () => dismissHoverPreview(),
  }
}
