/**
 * Indent guides (app.json `showIndentGuide`): a thin vertical line at every indentation level of a
 * line's leading whitespace, as in Obsidian's editor. Each level is a decorated span over one tab, or
 * over `tabSize` spaces, so a guide sits exactly where the text indents, in any font. Leftover spaces
 * (an indent that is not a whole level) get no line.
 *
 * @module indent-guides
 */
import { RangeSetBuilder, type Extension } from '@codemirror/state'
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view'

const guide = Decoration.mark({ class: 'cm-indent-guide' })

/** The guide spans of one line: `from` is the line start, `text` its content. */
export function indentGuideRanges(from: number, text: string, tabSize: number): Array<[number, number]> {
  const ranges: Array<[number, number]> = []
  let offset = 0
  while (offset < text.length) {
    if (text[offset] === '\t') {
      ranges.push([from + offset, from + offset + 1])
      offset += 1
    } else if (text[offset] === ' ') {
      let end = offset
      while (end < text.length && text[end] === ' ') end++
      // Whole levels of spaces only; a tab after spaces starts the next run
      for (let start = offset; start + tabSize <= end; start += tabSize) ranges.push([from + start, from + start + tabSize])
      offset = end
    } else {
      break
    }
  }
  return ranges
}

function buildGuides(view: EditorView): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>()
  const tabSize = view.state.tabSize
  let lastLine = -1
  for (const { from, to } of view.visibleRanges) {
    let pos = from
    while (pos <= to) {
      const line = view.state.doc.lineAt(pos)
      if (line.number !== lastLine) {
        lastLine = line.number
        // Only the leading whitespace matters; a long line is not read to its end
        const text = line.text.slice(0, 200)
        for (const [start, end] of indentGuideRanges(line.from, text, tabSize)) builder.add(start, end, guide)
      }
      pos = line.to + 1
    }
  }
  return builder.finish()
}

const indentGuidePlugin = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet
    constructor(view: EditorView) {
      this.decorations = buildGuides(view)
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || update.startState.tabSize !== update.state.tabSize) {
        this.decorations = buildGuides(update.view)
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
)

const indentGuideTheme = EditorView.baseTheme({
  '.cm-indent-guide': {
    boxShadow: 'inset 1px 0 0 var(--indent-guide-color, var(--background-modifier-border, rgba(128, 128, 128, 0.35)))',
  },
})

/** The extension that draws the guides. */
export function indentGuides(): Extension {
  return [indentGuidePlugin, indentGuideTheme]
}
