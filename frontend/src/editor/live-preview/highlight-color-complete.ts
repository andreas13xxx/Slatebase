/**
 * CodeMirror 6 autocompletion source for highlight colors.
 *
 * Obsidian 1.14: "Typing == in the editor now suggests highlight colors."
 * When the user types the opening `==` of a highlight, this source offers the
 * five emoji colors (red/orange/green/blue/purple); accepting one inserts the
 * color emoji plus a space right after the `==`, so the result is
 * `==🔴 ` ready for the highlighted text. The default (no emoji) yellow needs
 * no suggestion — it is just `==text==`.
 *
 * The color set is imported from `plugins/highlight-colors.ts`, the same source
 * the two render paths use, so the menu can never offer a color the renderers
 * don't understand.
 *
 * @module highlight-color-complete
 */

import type { CompletionSource, CompletionResult } from '@codemirror/autocomplete'
import { HIGHLIGHT_COLORS } from '../../plugins/highlight-colors'

/**
 * Completion source that fires right after an opening `==`. It matches when the
 * text immediately before the cursor ends in `==` that is not itself preceded
 * by another `=` (so `===` or a closing `==` of an existing highlight does not
 * trigger it), and the `==` is not already followed by a color emoji.
 */
export const highlightColorCompletions: CompletionSource = (context): CompletionResult | null => {
  // Look back a few characters for the opening `==`.
  const before = context.state.sliceDoc(Math.max(0, context.pos - 3), context.pos)
  // Trigger only on exactly `==` at the cursor, not `===` and not after a `=` run.
  if (!/(?:^|[^=])==$/.test(before)) {
    if (!context.explicit) return null
    // On an explicit invoke (Ctrl+Space) still require the cursor to sit after `==`.
    if (!context.state.sliceDoc(Math.max(0, context.pos - 2), context.pos).endsWith('==')) return null
  }

  return {
    from: context.pos,
    // Keep the menu open as the user keeps typing the highlighted text.
    filter: false,
    options: HIGHLIGHT_COLORS
      .filter((c) => c.emoji !== null)
      .map((c) => ({
        label: `${c.emoji} ${c.label}`,
        // Insert the emoji + a space so the highlight becomes `==🔴 …`.
        apply: `${c.emoji} `,
        type: 'constant',
        detail: 'Hervorhebung',
      })),
  }
}
