/**
 * Turns editor text into the list of words worth spell checking.
 *
 * nspell ships no tokenizer on purpose ("delegating tokenization to
 * implementors"), and for a Markdown note the tokenizer is most of the work:
 * checking raw text would underline every code identifier, URL, LaTeX command
 * and wikilink target in the document, which is exactly the noise that makes
 * people switch a spellchecker off.
 *
 * Two exclusion passes run before any word is emitted:
 *
 * 1. **Syntax tree** — code, HTML, link targets and similar non-prose nodes are
 *    skipped wholesale via the Lezer Markdown tree the editor already parses,
 *    so no second parser is needed.
 * 2. **Regex** — constructs the Markdown grammar doesn't model: `[[wikilinks]]`,
 *    `$math$`, `%%comments%%`, `#tags`, bare URLs, and YAML frontmatter.
 *
 * @module spellcheck/tokenizer
 */
import { syntaxTree } from '@codemirror/language'
import type { EditorState } from '@codemirror/state'

/** One checkable word with its absolute document position. */
export interface WordToken {
  /** Absolute document offset of the word's first character. */
  from: number
  /** Absolute document offset just past the word's last character. */
  to: number
  /** The word itself, apostrophes normalised away at the edges. */
  word: string
}

/**
 * Syntax nodes whose entire subtree is skipped. `CodeText`/`InlineCode` carry
 * source code and `URL`/`Autolink`/`LinkLabel` carry link targets — neither is
 * prose, both would produce false positives.
 *
 * Two deliberate absences: `LinkTitle`, because the quoted title in
 * `[text](url "title")` really is prose, and `HTMLBlock`, because Lezer makes
 * the whole block one opaque node — skipping it would silently stop checking
 * the perfectly ordinary German inside `<div align="center">…</div>`. The tags
 * themselves are stripped by the regex pass instead.
 */
const SKIPPED_NODES = new Set([
  'CodeText', 'CodeBlock', 'FencedCode', 'InlineCode', 'CodeInfo', 'CodeMark',
  'Comment', 'CommentBlock', 'HTMLTag',
  'ProcessingInstruction', 'ProcessingInstructionBlock',
  'URL', 'Autolink', 'LinkLabel', 'Entity', 'Escape', 'HorizontalRule',
])

/**
 * Letters plus combining marks, with apostrophes allowed inside (English
 * "don't"). Hyphens are word *separators*, not word characters: German
 * hyphenated compounds ("E-Mail-Adresse") are only partially present in
 * Hunspell dictionaries, so checking the parts is far less noisy than
 * checking the whole.
 */
const WORD_PATTERN = /[\p{L}\p{M}](?:[\p{L}\p{M}'’]*[\p{L}\p{M}])?/gu

/** Constructs the Markdown grammar doesn't model, all excluded from checking. */
const EXCLUDED_PATTERNS: readonly RegExp[] = [
  /!?\[\[[^\]\n]*\]\]/g,                                    // [[wikilink]], ![[embed]]
  /\$\$[\s\S]*?\$\$/g,                                      // $$ block math $$
  /\$[^$\n]+\$/g,                                           // $inline math$
  /%%[\s\S]*?%%/g,                                          // %% Obsidian comment %%
  /(?:^|\s)#[\p{L}\p{N}_/-]+/gu,                            // #tag, #nested/tag
  /<!--[\s\S]*?-->/g,                                       // <!-- HTML comment -->
  /<\/?[A-Za-z][^>\n]*>/g,                                  // <div class="x">, </div>
  /\b(?:https?:\/\/|www\.)\S+/gu,                           // bare URL
  /[\w.+-]+@[\w-]+\.[\w.-]+/gu,                             // e-mail address
]

/** A half-open `[from, to)` document range that must not be spell checked. */
interface ExcludedRange { from: number; to: number }

/**
 * The YAML frontmatter block, if the document opens with one.
 *
 * Handled positionally rather than through the syntax tree because the editor
 * configures `markdown()` without the frontmatter extension — the block is
 * plain paragraph text as far as Lezer is concerned.
 */
function frontmatterRange(state: EditorState): ExcludedRange | null {
  if (state.doc.lines < 2 || state.doc.line(1).text.trim() !== '---') return null
  for (let lineNo = 2; lineNo <= state.doc.lines; lineNo++) {
    const line = state.doc.line(lineNo)
    if (line.text.trim() === '---') return { from: 0, to: line.to }
  }
  return null
}

/** Collects every range inside `[from, to)` that the two exclusion passes reject. */
function collectExcludedRanges(state: EditorState, from: number, to: number, text: string): ExcludedRange[] {
  const excluded: ExcludedRange[] = []

  syntaxTree(state).iterate({
    from,
    to,
    enter(node) {
      if (!SKIPPED_NODES.has(node.name)) return true
      excluded.push({ from: node.from, to: node.to })
      // Nothing inside a code block or link target is prose either.
      return false
    },
  })

  const frontmatter = frontmatterRange(state)
  if (frontmatter && frontmatter.to > from && frontmatter.from < to) {
    excluded.push(frontmatter)
  }

  for (const pattern of EXCLUDED_PATTERNS) {
    // Each pattern is a module-level literal with /g, so lastIndex has to be
    // reset — otherwise the second call would resume mid-text.
    pattern.lastIndex = 0
    let match: RegExpExecArray | null
    while ((match = pattern.exec(text)) !== null) {
      excluded.push({ from: from + match.index, to: from + match.index + match[0].length })
      // A zero-length match would spin forever.
      if (match[0].length === 0) pattern.lastIndex++
    }
  }

  return excluded.sort((a, b) => a.from - b.from)
}

/**
 * Whether a word is worth checking at all.
 *
 * Acronyms (`API`) and mixed-case identifiers (`GitHub`, `useState`) are
 * skipped: neither German nor English writes a capital inside a word, so an
 * internal capital reliably marks a name or a code symbol rather than
 * something a dictionary should know.
 */
function isCheckable(word: string): boolean {
  if (word.length < 2) return false
  if (word === word.toUpperCase()) return false
  return !/[\p{Lu}]/u.test(word.slice(1))
}

/**
 * Strips apostrophes at the word edges, and the English possessive suffix —
 * Hunspell dictionaries list "Anna", not "Anna's".
 */
function normaliseWord(word: string): string {
  return word
    .replace(/^['’]+|['’]+$/g, '')
    .replace(/['’]s$/i, '')
}

/**
 * Extracts the checkable words in `[from, to)`.
 *
 * The range is widened to whole lines first, so a viewport boundary landing in
 * the middle of a fenced code block or a `$$…$$` formula doesn't cause the
 * excluded-range passes to miss it.
 */
export function collectWords(state: EditorState, from: number, to: number): WordToken[] {
  const start = state.doc.lineAt(Math.max(0, from)).from
  const end = state.doc.lineAt(Math.min(state.doc.length, to)).to
  if (end <= start) return []

  const text = state.sliceDoc(start, end)
  const excluded = collectExcludedRanges(state, start, end, text)

  const tokens: WordToken[] = []
  let excludedIndex = 0

  WORD_PATTERN.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = WORD_PATTERN.exec(text)) !== null) {
    const wordFrom = start + match.index
    const wordTo = wordFrom + match[0].length

    // `excluded` is sorted and the matches arrive left to right, so the cursor
    // only ever moves forward — no rescanning the whole list per word.
    while (excludedIndex < excluded.length && excluded[excludedIndex]!.to <= wordFrom) {
      excludedIndex++
    }
    const overlapping = excluded[excludedIndex]
    if (overlapping && overlapping.from < wordTo) continue

    const word = normaliseWord(match[0])
    if (!isCheckable(word)) continue

    // `normaliseWord` only strips from the edges, so the result is a
    // contiguous slice of the match — offset it so that replacing the
    // token from the context menu can't swallow a trailing "'s".
    const leading = match[0].length - match[0].replace(/^['’]+/, '').length
    tokens.push({ from: wordFrom + leading, to: wordFrom + leading + word.length, word })
  }

  return tokens
}
