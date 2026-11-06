/**
 * Text-scoped search operators (`line:`, `section:`, `block:`, `content:`,
 * `task:`, `task-todo:`, `task-done:`, `match-case:`, `ignore-case:`).
 *
 * Each operator names a scope (a line, a section, a block, a task line or the
 * whole file) and a set of terms; the scope matches when it contains every
 * term. A file satisfies an operator when at least one scope matches. Pure
 * functions over the file content, no I/O.
 */

import type { ParsedOperator, TextOperatorType } from './query-parser.js'

/** A matched line, in the shape the search service builds hits from. */
export interface ScopedHit {
  lineIndex: number
  matchText: string
  matchLine: string
}

const TASK_LINE = /^\s*[-*+]\s+\[(.)\]\s/
const HEADING_LINE = /^#{1,6}\s/

/** Splits the lines into `[start, end)` ranges for a scope. */
function ranges(lines: string[], type: TextOperatorType): Array<[number, number]> {
  switch (type) {
    case 'section': {
      const out: Array<[number, number]> = []
      let start = 0
      for (let i = 1; i < lines.length; i++) {
        if (HEADING_LINE.test(lines[i]!)) { out.push([start, i]); start = i }
      }
      out.push([start, lines.length])
      return out
    }
    case 'block': {
      const out: Array<[number, number]> = []
      let start = -1
      for (let i = 0; i <= lines.length; i++) {
        const blank = i === lines.length || lines[i]!.trim() === ''
        if (!blank && start < 0) start = i
        if (blank && start >= 0) { out.push([start, i]); start = -1 }
      }
      return out
    }
    case 'line':
    case 'task':
    case 'task-todo':
    case 'task-done':
      return lines.map((_, i): [number, number] => [i, i + 1])
    default:
      return [[0, lines.length]] // content, match-case, ignore-case: the whole file
  }
}

/** Whether a line may be a scope of this operator (task operators only look at task lines). */
function lineAllowed(line: string, type: TextOperatorType): boolean {
  if (type !== 'task' && type !== 'task-todo' && type !== 'task-done') return true
  const mark = TASK_LINE.exec(line)?.[1]
  if (mark === undefined) return false
  if (type === 'task-todo') return mark === ' '
  if (type === 'task-done') return mark !== ' '
  return true
}

/**
 * Evaluates one text operator against the file's lines.
 * Returns the hit lines when the operator is satisfied, `null` when it is not.
 */
export function matchTextOperator(
  lines: string[],
  op: ParsedOperator,
  defaultCaseSensitive: boolean,
): ScopedHit[] | null {
  const type = op.type as TextOperatorType
  const terms = op.terms ?? []
  if (terms.length === 0) return null
  const caseSensitive = type === 'match-case' ? true : type === 'ignore-case' ? false : defaultCaseSensitive
  const norm = (s: string) => (caseSensitive ? s : s.toLowerCase())
  const needles = terms.map(norm)

  const hits: ScopedHit[] = []
  let satisfied = false
  for (const [from, to] of ranges(lines, type)) {
    const scopeLines = lines.slice(from, to)
    if (scopeLines.length === 0) continue
    if (type === 'task' || type === 'task-todo' || type === 'task-done') {
      if (!lineAllowed(scopeLines[0]!, type)) continue
    }
    const text = norm(scopeLines.join('\n'))
    if (!needles.every((n) => text.includes(n))) continue
    satisfied = true
    // Report every line of the scope that contains a term.
    scopeLines.forEach((line, k) => {
      const hay = norm(line)
      const idx = needles.map((n) => hay.indexOf(n)).filter((p) => p >= 0)
      if (idx.length === 0) return
      const first = Math.min(...idx)
      const needle = needles.find((n) => hay.indexOf(n) === first)!
      hits.push({ lineIndex: from + k, matchText: line.slice(first, first + needle.length), matchLine: line })
    })
  }
  return satisfied ? hits : null
}

/**
 * Applies all text operators to a file. Returns `null` when the file does not
 * satisfy them (a positive operator unmet, or a negated one met), otherwise the
 * hit lines of the positive operators, sorted and de-duplicated by line.
 */
export function matchTextOperators(
  content: string,
  operators: ParsedOperator[],
  defaultCaseSensitive: boolean,
): ScopedHit[] | null {
  const lines = content.split('\n')
  const hits = new Map<number, ScopedHit>()
  for (const op of operators) {
    const result = matchTextOperator(lines, op, defaultCaseSensitive)
    if (op.negated) {
      if (result !== null) return null
      continue
    }
    if (result === null) return null
    for (const h of result) if (!hits.has(h.lineIndex)) hits.set(h.lineIndex, h)
  }
  return [...hits.values()].sort((a, b) => a.lineIndex - b.lineIndex)
}
