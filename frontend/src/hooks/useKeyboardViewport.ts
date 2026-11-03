import { useEffect } from 'react'

/** Insets below this are browser chrome or rounding, not an on-screen keyboard. */
const KEYBOARD_MIN_PX = 100
/** Space kept between the caret and the keyboard when it is scrolled into view. */
const CARET_MARGIN_PX = 24

interface ViewportLike {
  innerHeight: number
  visualViewport: { height: number; offsetTop: number; scale: number } | null
}

/**
 * Height the on-screen keyboard covers, in px (0 when none).
 *
 * iOS Safari keeps the layout viewport at full height and only shrinks the
 * visual viewport; Chrome on Android resizes the layout viewport itself, which
 * yields 0 here (nothing to compensate). A pinch-zoomed page also has a smaller
 * visual viewport, so it is ignored.
 */
export function computeKeyboardInset(win: ViewportLike): number {
  const vv = win.visualViewport
  if (!vv || vv.scale > 1.01) return 0
  const inset = win.innerHeight - vv.height - vv.offsetTop
  return inset >= KEYBOARD_MIN_PX ? Math.round(inset) : 0
}

/** Nearest ancestor that scrolls vertically. */
function scrollParent(el: Element | null): HTMLElement | null {
  for (let node = el; node; node = node.parentElement) {
    if (!(node instanceof HTMLElement)) continue
    const overflowY = getComputedStyle(node).overflowY
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) return node
  }
  return null
}

/**
 * Scrolls the text caret above the keyboard if it ended up behind it. Only for the editor
 * (contenteditable): native inputs and textareas are scrolled into view by the browser itself.
 */
function revealCaret(visibleBottom: number): void {
  const active = document.activeElement
  if (!(active instanceof HTMLElement) || !active.isContentEditable) return
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return
  const range = selection.getRangeAt(0)
  if (!active.contains(range.commonAncestorContainer)) return
  const rect = range.getBoundingClientRect()
  // A caret on an empty line can report a zero rect: nothing reliable to scroll to.
  if (rect.width === 0 && rect.height === 0 && rect.top === 0) return
  const overflow = rect.bottom + CARET_MARGIN_PX - visibleBottom
  if (overflow <= 0) return
  const parent = scrollParent(active)
  if (parent) parent.scrollTop += overflow
}

/**
 * Keeps the app usable while the iPad's on-screen keyboard is open.
 *
 * Publishes the covered height as `--keyboard-inset` on `<html>` (App.css pads
 * `.app` by it, so the editor shrinks above the keyboard instead of hiding
 * behind it), toggles `keyboard-open`, and scrolls the caret into view.
 */
export function useKeyboardViewport(): void {
  useEffect(() => {
    const vv = window.visualViewport
    if (!vv) return
    const root = document.documentElement
    let inset = 0

    const reveal = () => {
      // Wait for the resized layout before measuring the caret.
      requestAnimationFrame(() => revealCaret(window.innerHeight - inset))
    }

    const update = () => {
      const next = computeKeyboardInset(window)
      if (next !== inset || root.style.getPropertyValue('--keyboard-inset') === '') {
        inset = next
        root.style.setProperty('--keyboard-inset', `${inset}px`)
        root.classList.toggle('keyboard-open', inset > 0)
      }
      if (inset > 0) {
        // iOS pans the page up to the focused field; the layout is resized instead, so pan back.
        if (window.scrollX !== 0 || window.scrollY !== 0) window.scrollTo(0, 0)
        reveal()
      }
    }

    // Moving to another field while the keyboard stays open changes no viewport size.
    const onFocusIn = () => { if (inset > 0) reveal() }

    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    document.addEventListener('focusin', onFocusIn)
    update()
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
      document.removeEventListener('focusin', onFocusIn)
      root.style.removeProperty('--keyboard-inset')
      root.classList.remove('keyboard-open')
    }
  }, [])
}
