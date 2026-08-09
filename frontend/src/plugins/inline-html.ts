/**
 * Shared allowlist/parsing logic for rendering a safe subset of inline raw HTML
 * (e.g. `<font color="#ff0000">text</font>`) found in Markdown content.
 *
 * Used by both the CM6 Live Preview editor (inline-decorations.ts, which wraps
 * matched content in a styled `<span>`) and the static reading view
 * (ViewMode.tsx, which renders the actual semantic element). Keeping the
 * allowlist and attribute parsing in one place means both surfaces agree on
 * what's safe to render.
 *
 * @module inline-html
 */

/**
 * Inline HTML tags allowed to render as real formatting, mapped to their
 * allowed attribute names. Anything not listed here (including all `on*`
 * event handlers and tags like `script`/`iframe`) is left as literal text.
 */
export const INLINE_HTML_ALLOWLIST: Record<string, string[]> = {
  font: ['color', 'face', 'size'],
  mark: ['style'],
  span: ['style'],
  b: [],
  strong: [],
  i: [],
  em: [],
  u: [],
  s: [],
  strike: [],
  sub: [],
  sup: [],
  small: [],
  kbd: [],
  abbr: ['title'],
  code: [],
}

export const INLINE_HTML_OPEN_TAG_RE = /^<([a-zA-Z][a-zA-Z0-9]*)((?:\s+[^<>]*)?)\s*>$/
export const INLINE_HTML_CLOSE_TAG_RE = /^<\/([a-zA-Z][a-zA-Z0-9]*)\s*>$/

/** Parses a CSS `style` attribute string into a React style object (kebab-case -> camelCase). */
export function parseStyleString(style: string): Record<string, string> {
  const result: Record<string, string> = {}
  for (const decl of style.split(';')) {
    const idx = decl.indexOf(':')
    if (idx === -1) continue
    const prop = decl.slice(0, idx).trim()
    const value = decl.slice(idx + 1).trim()
    if (!prop || !value) continue
    const camel = prop.startsWith('--') ? prop : prop.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase())
    result[camel] = value
  }
  return result
}

/**
 * Parses and allowlist-filters the attributes of an inline HTML opening tag.
 * Uses a detached <template> so the browser's own attribute parser is reused
 * instead of a hand-rolled one; the template is never inserted into the live
 * document, so nothing in it executes. Returns null if the tag isn't allowlisted.
 */
export function parseInlineHtmlAttrs(tagName: string, attrString: string): Record<string, string> | null {
  const allowed = INLINE_HTML_ALLOWLIST[tagName]
  if (allowed === undefined) return null
  if (!attrString.trim()) return {}
  const template = document.createElement('template')
  template.innerHTML = `<${tagName}${attrString}></${tagName}>`
  const el = template.content.firstElementChild
  if (!el) return {}
  const result: Record<string, string> = {}
  for (const attr of Array.from(el.attributes)) {
    const name = attr.name.toLowerCase()
    if (!allowed.includes(name)) continue
    if (name === 'style' && /url\s*\(|expression\s*\(|javascript:/i.test(attr.value)) continue
    result[name] = attr.value
  }
  return result
}

/** Legacy HTML `<font size="1-7">` values mapped to CSS font-size keywords. */
const FONT_SIZE_MAP: Record<string, string> = {
  '1': 'x-small', '2': 'small', '3': 'medium', '4': 'large',
  '5': 'x-large', '6': 'xx-large', '7': 'xxx-large',
}

/**
 * Converts an allowlisted tag + its (already-filtered) attributes into an
 * inline CSS declaration string. Used where the rendering target has no
 * native semantics for the tag itself (e.g. a CM6 decoration wraps content
 * in a plain `<span>`), so the tag's meaning has to be expressed as CSS.
 */
export function inlineHtmlToCssText(tagName: string, attrs: Record<string, string>): string {
  const decls: string[] = []
  switch (tagName) {
    case 'font':
      if (attrs.color) decls.push(`color: ${attrs.color}`)
      if (attrs.face) decls.push(`font-family: ${attrs.face}`)
      if (attrs.size) decls.push(`font-size: ${FONT_SIZE_MAP[attrs.size] ?? attrs.size}`)
      break
    case 'mark':
      decls.push(attrs.style || 'background-color: #fff3a0')
      break
    case 'span':
      if (attrs.style) decls.push(attrs.style)
      break
    case 'b':
    case 'strong':
      decls.push('font-weight: bold')
      break
    case 'i':
    case 'em':
      decls.push('font-style: italic')
      break
    case 'u':
      decls.push('text-decoration: underline')
      break
    case 's':
    case 'strike':
      decls.push('text-decoration: line-through')
      break
    case 'sub':
      decls.push('vertical-align: sub', 'font-size: smaller')
      break
    case 'sup':
      decls.push('vertical-align: super', 'font-size: smaller')
      break
    case 'small':
      decls.push('font-size: smaller')
      break
    case 'kbd':
      decls.push('font-family: monospace', 'background: rgba(127,127,127,0.15)', 'border-radius: 3px', 'padding: 0.1em 0.35em')
      break
    case 'code':
      decls.push('font-family: monospace', 'background: rgba(127,127,127,0.15)', 'border-radius: 3px', 'padding: 0.1em 0.3em')
      break
    case 'abbr':
      decls.push('text-decoration: underline dotted', 'cursor: help')
      break
  }
  return decls.join('; ')
}
