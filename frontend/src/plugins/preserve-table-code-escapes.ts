/**
 * Counters `mdast-util-gfm-table`'s pipe-unescaping inside inline code spans.
 *
 * GFM tables use `\|` to keep a literal `|` from being misread as a column
 * delimiter (e.g. `` `[[Target\|Alias]]` ``). `mdast-util-gfm-table`
 * deliberately unescapes `\|` back to `|` in the resulting text — including
 * inside inline code spans (see its `exitCodeText` override) — reasoning
 * that the backslash was only ever table-delimiter punctuation.
 *
 * Obsidian doesn't do this: a code span's content is always verbatim,
 * regardless of surrounding table syntax, matching plain CommonMark (code
 * spans are never escape-processed). To match Obsidian's rendering, this
 * plugin re-registers a `codeText` handler — after remarkGfm, so it wins,
 * see `mdast-util-from-markdown`'s extension-merging order — that restores
 * the verbatim (un-unescaped) behavior.
 */
import type { Plugin } from 'unified'
import type { Root } from 'mdast'
import type { Extension as FromMarkdownExtension, CompileContext, Token } from 'mdast-util-from-markdown'

function exitCodeText(this: CompileContext, token: Token): void {
  const value = this.resume()
  const node = this.stack[this.stack.length - 1]
  if (node && node.type === 'inlineCode') {
    node.value = value
  }
  this.exit(token)
}

function preserveTableCodeEscapes(): FromMarkdownExtension {
  return {
    exit: {
      codeText: exitCodeText,
    },
  }
}

/** Remark plugin — must be registered after `remarkGfm` to take effect. */
export const remarkPreserveTableCodeEscapes: Plugin<[], Root> = function () {
  const data = this.data()
  const fromMarkdownExtensions =
    data.fromMarkdownExtensions ?? (data.fromMarkdownExtensions = [])
  fromMarkdownExtensions.push(preserveTableCodeEscapes())
}
