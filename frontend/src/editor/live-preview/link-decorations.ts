import { Decoration, type EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view'
import type { EditorState, Range, Extension } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'
import type { HideableRange } from './inline-decorations'

/**
 * Options for link decoration behavior.
 */
export interface LinkDecorationOptions {
  /** Callback when an internal (wikilink) link is clicked. */
  onInternalLinkClick?: (target: string) => void
}

/**
 * Result of building link decorations from the document.
 */
export interface LinkDecorationResult {
  /** All decoration ranges (marks for links + replace for hidden parts). */
  decorations: Range<Decoration>[]
  /** Ranges that should be hidden when cursor is outside (URL portions, brackets). */
  hideableRanges: HideableRange[]
}

/**
 * Regex source for detecting [[wikilink]] and [[target|alias]] syntax
 * (not in Lezer grammar). Exported as a source string rather than a
 * shared RegExp instance so every caller gets its own non-stateful
 * (fresh `lastIndex`) matcher — see `createWikilinkRegex`.
 */
const WIKILINK_PATTERN = '\\[\\[([^\\]|]+)(?:\\|([^\\]]+))?\\]\\]'

/** Creates a fresh `g`-flagged RegExp for wikilink matching (never share one instance across calls). */
export function createWikilinkRegex(): RegExp {
  return new RegExp(WIKILINK_PATTERN, 'g')
}

/**
 * Resolves the real link target from a raw wikilink target match.
 *
 * `[^\]|]+` (the target group) stops at the first `|` whether or not it's
 * backslash-escaped, since a literal `\` isn't excluded from the char
 * class — so an escaped pipe (`[[Target\|Alias]]`, the convention for
 * keeping an aliased wikilink intact inside a GFM table cell, where `|`
 * is also the column delimiter) leaves a trailing backslash on the
 * captured target. Strip it: the backslash is punctuation for the table
 * parser, not part of the link target.
 */
export function resolveWikilinkMatchTarget(rawTarget: string, hasAlias: boolean): string {
  return hasAlias && rawTarget.endsWith('\\') ? rawTarget.slice(0, -1) : rawTarget
}

/**
 * Build link and wikilink decorations from the document.
 * Handles both standard Markdown links [text](url) and Obsidian [[wikilinks]].
 *
 * Standard links are found via the Lezer syntax tree (Link nodes).
 * Wikilinks are found via regex since they are not part of the standard Markdown grammar.
 *
 * @param state - The current editor state
 * @param _options - Link decoration options (callbacks for click handling)
 * @returns Decoration ranges and hideable ranges for cursor-aware show/hide
 */
export function buildLinkDecorations(
  state: EditorState,
  _options: LinkDecorationOptions
): LinkDecorationResult {
  const decorations: Range<Decoration>[] = []
  const hideableRanges: HideableRange[] = []
  const tree = syntaxTree(state)
  const doc = state.doc

  // 1. Standard Markdown links [text](url) — found via Lezer tree
  tree.iterate({
    enter(node) {
      if (node.name === 'Link') {
        const linkFrom = node.from
        const linkTo = node.to
        const linkText = doc.sliceString(linkFrom, linkTo)

        // Parse manually from the link text for reliable positions
        const openBracket = linkText.indexOf('[')
        const closeBracket = linkText.indexOf(']')
        const openParen = linkText.indexOf('](')
        const closeParen = linkText.lastIndexOf(')')

        if (openBracket === -1 || closeBracket === -1 || openParen === -1 || closeParen === -1) {
          return
        }

        // Absolute positions
        const absLabelStart = linkFrom + openBracket + 1 // after [
        const absLabelEnd = linkFrom + openParen // before ]
        const absUrlStart = linkFrom + openParen + 2 // after ](
        const absUrlEnd = linkFrom + closeParen // before )

        // Extract the URL text for data attribute
        const url = doc.sliceString(absUrlStart, absUrlEnd)

        if (absLabelStart >= absLabelEnd || absUrlStart > absUrlEnd) {
          return
        }

        // Mark the label text as a clickable link
        decorations.push(
          Decoration.mark({
            class: 'cm-lp-link',
            attributes: { 'data-url': url }
          }).range(absLabelStart, absLabelEnd)
        )

        // Hide the opening bracket [
        const openBracketFrom = linkFrom + openBracket
        const openBracketTo = openBracketFrom + 1
        decorations.push(
          Decoration.replace({}).range(openBracketFrom, openBracketTo)
        )
        hideableRanges.push({ from: openBracketFrom, to: openBracketTo, groupFrom: linkFrom, groupTo: linkTo })

        // Hide the ](url) part
        const hideFrom = linkFrom + openParen // start at ]
        const hideTo = linkFrom + closeParen + 1 // include )
        decorations.push(
          Decoration.replace({}).range(hideFrom, hideTo)
        )
        hideableRanges.push({ from: hideFrom, to: hideTo, groupFrom: linkFrom, groupTo: linkTo })
      }
    }
  })

  // 2. Wikilinks [[target]] and [[target|alias]] — found via regex
  const docText = doc.toString()
  let match: RegExpExecArray | null

  const wikilinkRegex = createWikilinkRegex()
  while ((match = wikilinkRegex.exec(docText)) !== null) {
    const fullMatchFrom = match.index
    const fullMatchTo = fullMatchFrom + match[0].length

    // Skip embeds — `![[target|size]]` is handled entirely by the embed
    // widget system (widget-decorations.ts). Without this guard, the `|size`
    // gets misread as a link alias here too, and both decoration passes
    // compete: the embed widget hides on cursor-enter to reveal raw source,
    // but this pass's own alias decorations remain layered on top, hiding
    // everything except the size number.
    if (fullMatchFrom > 0 && docText[fullMatchFrom - 1] === '!') continue

    // Skip if inside a code block — `[[...]]` in a fenced or inline code
    // span is literal text, not a wikilink (matches the same guard used
    // for the ==highlight== and #tag regex passes in inline-decorations.ts).
    let insideCode = false
    tree.iterate({
      from: fullMatchFrom, to: fullMatchTo,
      enter(n) {
        if (n.name === 'FencedCode' || n.name === 'InlineCode' || n.name === 'CodeBlock') {
          insideCode = true
          return false
        }
      }
    })
    if (insideCode) continue

    const rawTarget = match[1] ?? ''
    const alias = match[2]
    const target = resolveWikilinkMatchTarget(rawTarget, alias !== undefined)

    if (alias) {
      // [[target|alias]] — show only alias
      // Hide [[ prefix
      const prefixFrom = fullMatchFrom
      const prefixTo = fullMatchFrom + 2
      decorations.push(
        Decoration.replace({}).range(prefixFrom, prefixTo)
      )
      hideableRanges.push({ from: prefixFrom, to: prefixTo, groupFrom: fullMatchFrom, groupTo: fullMatchTo })

      // Hide target| part (between [[ and alias). Uses `rawTarget.length`
      // (not the backslash-stripped `target`) since this is real source
      // text being hidden, e.g. `Features/Wikilinks\|`.
      const targetPipeFrom = fullMatchFrom + 2
      const targetPipeTo = fullMatchFrom + 2 + rawTarget.length + 1 // target + |
      decorations.push(
        Decoration.replace({}).range(targetPipeFrom, targetPipeTo)
      )
      hideableRanges.push({ from: targetPipeFrom, to: targetPipeTo, groupFrom: fullMatchFrom, groupTo: fullMatchTo })

      // Mark the alias text as clickable wikilink
      const aliasFrom = targetPipeTo
      const aliasTo = fullMatchTo - 2 // before ]]
      decorations.push(
        Decoration.mark({
          class: 'cm-lp-wikilink',
          attributes: { 'data-target': target }
        }).range(aliasFrom, aliasTo)
      )

      // Hide ]] suffix
      const suffixFrom = fullMatchTo - 2
      const suffixTo = fullMatchTo
      decorations.push(
        Decoration.replace({}).range(suffixFrom, suffixTo)
      )
      hideableRanges.push({ from: suffixFrom, to: suffixTo, groupFrom: fullMatchFrom, groupTo: fullMatchTo })
    } else {
      // [[target]] — show target text
      // Hide [[ prefix
      const prefixFrom = fullMatchFrom
      const prefixTo = fullMatchFrom + 2
      decorations.push(
        Decoration.replace({}).range(prefixFrom, prefixTo)
      )
      hideableRanges.push({ from: prefixFrom, to: prefixTo, groupFrom: fullMatchFrom, groupTo: fullMatchTo })

      // Mark the target text as clickable wikilink
      const targetFrom = fullMatchFrom + 2
      const targetTo = fullMatchTo - 2
      decorations.push(
        Decoration.mark({
          class: 'cm-lp-wikilink',
          attributes: { 'data-target': target }
        }).range(targetFrom, targetTo)
      )

      // Hide ]] suffix
      const suffixFrom = fullMatchTo - 2
      const suffixTo = fullMatchTo
      decorations.push(
        Decoration.replace({}).range(suffixFrom, suffixTo)
      )
      hideableRanges.push({ from: suffixFrom, to: suffixTo, groupFrom: fullMatchFrom, groupTo: fullMatchTo })
    }
  }

  return { decorations, hideableRanges }
}

/**
 * Creates a ViewPlugin that handles click events on link decorations.
 * When a decorated link is clicked with Ctrl/Cmd held, it opens the URL
 * or triggers the internal link callback.
 *
 * Behavior:
 * - `cm-lp-link` (standard links): opens URL in new tab via window.open
 * - `cm-lp-wikilink` (internal links): calls onInternalLinkClick callback
 * - Only activates on Ctrl+Click (Windows/Linux) or Cmd+Click (macOS) — Obsidian behavior
 *
 * @param options - Link decoration options with callbacks
 * @returns A CM6 Extension (ViewPlugin with DOM event handlers)
 */
export function createLinkClickHandler(options: LinkDecorationOptions): Extension {
  return ViewPlugin.define(
    () => ({
      update(_update: ViewUpdate) {
        // No-op: this plugin only handles DOM events
      }
    }),
    {
      eventHandlers: {
        mousedown(event: MouseEvent, _view: EditorView) {
          // Only handle Ctrl+Click (Win/Linux) or Cmd+Click (macOS)
          const isMod = event.ctrlKey || event.metaKey
          if (!isMod) {
            return false
          }

          const target = event.target as HTMLElement | null
          if (!target) {
            return false
          }

          // Check if clicked element has link class
          const linkElement = target.closest('.cm-lp-link') as HTMLElement | null
          const wikilinkElement = target.closest('.cm-lp-wikilink') as HTMLElement | null

          if (linkElement) {
            const url = linkElement.getAttribute('data-url')
            if (url) {
              event.preventDefault()
              window.open(url, '_blank', 'noopener,noreferrer')
              return true
            }
          }

          if (wikilinkElement) {
            const wikilinkTarget = wikilinkElement.getAttribute('data-target')
            if (wikilinkTarget && options.onInternalLinkClick) {
              event.preventDefault()
              options.onInternalLinkClick(wikilinkTarget)
              return true
            }
          }

          return false
        }
      }
    }
  )
}
