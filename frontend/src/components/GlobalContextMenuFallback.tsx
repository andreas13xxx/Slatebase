/**
 * Suppresses the browser's native context menu on every remaining
 * non-interactive surface of the app — settings pages, modal bodies, empty
 * sidebar/panel space, plain chrome — that isn't already covered by a
 * feature-specific menu (file explorer, editor, tabs, links, search,
 * outline, graph, canvas, ...). Those all call `e.preventDefault()`
 * themselves; since this listener sits on `document` and DOM events bubble
 * from the actual target outward, it only ever runs for a right-click no
 * inner handler already claimed (checked via `e.defaultPrevented`).
 *
 * Genuinely interactive elements are left alone on purpose — inputs,
 * textareas, embeds, and real external links keep their native menu (copy
 * link, paste, browser spellcheck, ...), which the user still wants there.
 *
 * When there's a live text selection under the click, shows a single
 * "Kopieren" item; otherwise just swallows the event with nothing shown —
 * the same as right-clicking blank space in most desktop apps.
 *
 * Mounted once near the root (see App.tsx), independent of vault/auth
 * state, the same way GlobalTooltip is.
 *
 * @module GlobalContextMenuFallback
 */
import { useEffect, useState } from 'react'
import { Copy } from 'lucide-react'
import { ContextMenu, type ContextMenuItem } from './ContextMenu'

/** Elements (and their descendants) whose native context menu is left alone. */
const INTERACTIVE_SELECTOR = 'input, textarea, select, [contenteditable="true"], iframe, video, audio, embed, object, a[href]'

export function GlobalContextMenuFallback() {
  const [menu, setMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null)

  useEffect(() => {
    function handleContextMenu(e: MouseEvent): void {
      if (e.defaultPrevented) return
      if (!(e.target instanceof Element)) return
      if (e.target.closest(INTERACTIVE_SELECTOR)) return

      e.preventDefault()

      const selectedText = window.getSelection()?.toString() ?? ''
      if (!selectedText) return

      const items: ContextMenuItem[] = [
        { id: 'copy', label: 'Kopieren', icon: <Copy size={14} />, run: () => { void navigator.clipboard.writeText(selectedText).catch(() => {}) } },
      ]
      setMenu({ x: e.clientX, y: e.clientY, items })
    }

    document.addEventListener('contextmenu', handleContextMenu)
    return () => document.removeEventListener('contextmenu', handleContextMenu)
  }, [])

  if (!menu) return null

  return (
    <ContextMenu
      x={menu.x}
      y={menu.y}
      items={menu.items}
      onClose={() => setMenu(null)}
      onSelect={() => setMenu(null)}
    />
  )
}
