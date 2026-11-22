/**
 * Locates the innermost element of `root` that shows `text` (visible text, or a placeholder/aria-label/
 * title attribute), scrolls it into view and flashes a highlight. Sections load lazily and fetch their
 * data, so the text may not exist yet: the lookup retries on DOM changes until `timeoutMs` has passed.
 * Returns a cleanup function.
 */

const HIGHLIGHT_CLASS = 'settings-search-highlight'
const HIGHLIGHT_MS = 2500

function normalize(s: string): string {
  return s.replace(/\s+/g, ' ').trim().toLowerCase()
}

/** The first deepest element whose text (or label attribute) contains `text`. */
export function findTextElement(root: HTMLElement, text: string): HTMLElement | null {
  const needle = normalize(text)
  if (needle === '') return null
  for (const el of Array.from(root.querySelectorAll<HTMLElement>('*'))) {
    if (el.closest('.settings-content-heading') !== null) continue
    const attrs = [el.getAttribute('placeholder'), el.getAttribute('aria-label'), el.getAttribute('title')]
    const own = normalize(el.textContent ?? '').includes(needle)
    const viaAttr = attrs.some((a) => a !== null && normalize(a).includes(needle))
    if (!own && !viaAttr) continue
    // Prefer the deepest match: skip an element when a child matches as well.
    const childMatches = Array.from(el.children).some((c) => normalize(c.textContent ?? '').includes(needle))
    if (!childMatches) return el
  }
  return null
}

/** Reveals `text` inside `root`, waiting for it to appear. Returns a cleanup function. */
export function revealSettingText(root: HTMLElement, text: string, timeoutMs = 4000): () => void {
  let done = false
  let highlightTimer: ReturnType<typeof setTimeout> | null = null
  let highlighted: HTMLElement | null = null

  const attempt = (): boolean => {
    const el = findTextElement(root, text)
    if (el === null) return false
    done = true
    el.scrollIntoView({ block: 'center', behavior: 'auto' })
    el.classList.add(HIGHLIGHT_CLASS)
    highlighted = el
    highlightTimer = setTimeout(() => { el.classList.remove(HIGHLIGHT_CLASS) }, HIGHLIGHT_MS)
    return true
  }

  const observer = new MutationObserver(() => {
    if (!done && attempt()) observer.disconnect()
  })
  if (!attempt()) {
    observer.observe(root, { childList: true, subtree: true, characterData: true })
  }
  const giveUp = setTimeout(() => { observer.disconnect() }, timeoutMs)

  return () => {
    observer.disconnect()
    clearTimeout(giveUp)
    if (highlightTimer !== null) clearTimeout(highlightTimer)
    highlighted?.classList.remove(HIGHLIGHT_CLASS)
  }
}
