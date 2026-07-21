import { Compartment, type Extension } from '@codemirror/state'
import { StateField } from '@codemirror/state'
import { type DecorationSet, Decoration, EditorView } from '@codemirror/view'
import type { Range } from '@codemirror/state'
import type { DirectoryTree } from '../../types'
import { buildInlineDecorations, type HideableRange } from './inline-decorations'
import { buildLinkDecorations } from './link-decorations'
import { buildWidgetDecorations } from './widget-decorations'

/**
 * Options for creating the Live Preview extension.
 */
export interface LivePreviewOptions {
  /** Vault ID for resolving embeds and wikilinks. */
  vaultId: string
  /** Directory tree for link resolution. */
  directoryTree: DirectoryTree | null
  /** Auth token for image URLs. */
  token?: string
  /** Callback when an internal link is clicked. */
  onInternalLinkClick?: (target: string) => void
  /** Callback when a checkbox is toggled. */
  onCheckboxToggle?: (line: number, checked: boolean) => void
}

/**
 * Represents the live preview state — decorations built from the document
 * with cursor-aware reveal/hide logic.
 */
export interface LivePreviewState {
  /** Set of decoration ranges currently "revealed" (cursor is inside). */
  revealedRanges: DecorationSet
  /** All active decorations (headings, bold, links, etc.). */
  decorations: DecorationSet
}

/**
 * Builds decoration ranges from the Lezer Markdown syntax tree.
 * Uses buildInlineDecorations for headings, bold, italic, strikethrough, inline code.
 * Uses buildLinkDecorations for standard links [text](url) and wikilinks [[target]].
 * Uses buildWidgetDecorations for embeds, checkboxes, callouts, code blocks, blockquotes.
 *
 * @param state - The current editor state
 * @param options - Live preview options (used for link resolution, callbacks, etc.)
 * @returns Object with decoration ranges and hideable marker ranges
 */
function buildDecorations(
  state: import('@codemirror/state').EditorState,
  options: LivePreviewOptions
): { decorations: Range<Decoration>[]; hideableRanges: HideableRange[] } {
  // Phase 1: Inline decorations (headings, bold, italic, strikethrough, inline code)
  const inline = buildInlineDecorations(state)

  // Phase 2: Link decorations (standard links [text](url) + wikilinks [[target]])
  const links = buildLinkDecorations(state, {
    onInternalLinkClick: options.onInternalLinkClick,
  })

  // Phase 3: Widget decorations (embeds, checkboxes, callouts, code blocks, blockquotes)
  const widgets = buildWidgetDecorations(state, {
    vaultId: options.vaultId,
    token: options.token,
    onCheckboxToggle: options.onCheckboxToggle,
  })

  // Merge all decorations and hideable ranges
  const decorations = [
    ...inline.decorations,
    ...links.decorations,
    ...widgets.decorations,
  ]

  const hideableRanges = [
    ...inline.hideableRanges,
    ...links.hideableRanges,
    ...widgets.hideableRanges,
  ]

  return { decorations, hideableRanges }
}

/**
 * Filters decorations by removing replace decorations whose hideable range
 * belongs to a group that the cursor is inside. When the cursor is anywhere
 * within a formatting node (between groupFrom and groupTo), ALL markers of
 * that node are revealed so the raw Markdown syntax becomes visible.
 *
 * Non-replace decorations (mark, line) are always kept.
 *
 * @param decorations - All computed decorations
 * @param hideableRanges - Ranges where Decoration.replace() hides markers
 * @param cursorFrom - Cursor selection start position
 * @param cursorTo - Cursor selection end position
 * @returns A DecorationSet with cursor-intersecting replace decorations removed
 */
function filterDecorationsForCursor(
  decorations: Range<Decoration>[],
  hideableRanges: HideableRange[],
  cursorFrom: number,
  cursorTo: number
): DecorationSet {
  // Find which GROUP ranges the cursor is inside.
  // A group is "active" if the cursor is anywhere between groupFrom and groupTo.
  const activeGroups = hideableRanges.filter(
    range => cursorFrom >= range.groupFrom && cursorTo <= range.groupTo
  )

  // If no groups are active, return all decorations as-is
  if (activeGroups.length === 0) {
    return Decoration.set(decorations, true)
  }

  // Collect all individual hideable ranges that belong to active groups
  const revealedSet = new Set<string>()
  for (const range of hideableRanges) {
    // Check if this range belongs to an active group
    const belongsToActiveGroup = activeGroups.some(
      active => range.groupFrom === active.groupFrom && range.groupTo === active.groupTo
    )
    if (belongsToActiveGroup) {
      revealedSet.add(`${range.from}:${range.to}`)
    }
  }

  // Filter out decorations that match revealed ranges
  const filtered: Range<Decoration>[] = []
  for (const deco of decorations) {
    if (revealedSet.has(`${deco.from}:${deco.to}`)) {
      continue
    }
    filtered.push(deco)
  }

  return Decoration.set(filtered, true)
}

/**
 * Creates the StateField that manages live preview decorations.
 * The field recalculates decorations when the document changes or cursor moves.
 *
 * @param options - Live preview options
 * @returns A StateField extension that provides decorations
 */
export function createLivePreviewField(options: LivePreviewOptions): Extension {
  const field = StateField.define<DecorationSet>({
    create(state) {
      const { decorations, hideableRanges } = buildDecorations(state, options)
      const cursor = state.selection.main
      return filterDecorationsForCursor(decorations, hideableRanges, cursor.from, cursor.to)
    },

    update(value, tr) {
      // Recalculate if document changed or selection moved
      if (tr.docChanged || tr.selection) {
        const { decorations, hideableRanges } = buildDecorations(tr.state, options)
        const cursor = tr.state.selection.main
        return filterDecorationsForCursor(decorations, hideableRanges, cursor.from, cursor.to)
      }

      return value
    },

    provide(field) {
      return EditorView.decorations.from(field)
    }
  })

  return field
}

/**
 * Creates the Live Preview extension set.
 * Returns a Compartment-wrapped extension that can be toggled on/off.
 *
 * The extension uses a CM6 StateField to:
 * 1. Parse the document via the Lezer Markdown syntax tree
 * 2. Create decorations for formatted elements (headings, bold, italic, etc.)
 * 3. Track cursor position — when cursor enters a decorated range, remove
 *    that decoration to reveal raw Markdown syntax
 * 4. Re-apply decorations when cursor leaves the range
 *
 * @param options - Configuration for link resolution, callbacks, etc.
 * @returns A CM6 Extension (Compartment-wrapped for toggle support)
 */
export function createLivePreviewExtension(options: LivePreviewOptions): Extension {
  const compartment = new Compartment()
  return compartment.of(createLivePreviewField(options))
}

/**
 * Creates a live preview extension wrapped in the provided Compartment.
 * This allows external toggle control (enable/disable live preview).
 *
 * @param compartment - The Compartment instance for toggle control
 * @param options - Configuration for the live preview extension
 * @param enabled - Whether live preview is enabled
 * @returns The Compartment configuration (pass to EditorView.dispatch as effect)
 */
export function createLivePreviewCompartmentExtension(
  compartment: Compartment,
  options: LivePreviewOptions,
  enabled: boolean
): Extension {
  if (!enabled) {
    return compartment.of([])
  }
  return compartment.of(createLivePreviewField(options))
}
