// ─── Regex Safety Heuristic ───────────────────────────────────────────────────

import { RegexValidationError, RegexTooLongError } from './errors.js'

/** Maximum regex pattern length (characters), shared by search and replace. */
export const MAX_REGEX_LENGTH = 1000

/**
 * Validates a user-supplied regex pattern before it is ever compiled against
 * real content: length, JavaScript regex syntax, and the nested-quantifier
 * ReDoS heuristic (see hasNestedQuantifier below).
 *
 * @throws RegexTooLongError - pattern exceeds MAX_REGEX_LENGTH
 * @throws RegexValidationError - invalid syntax, or a catastrophic-backtracking shape
 */
export function validateRegexPattern(pattern: string): void {
  if (pattern.length > MAX_REGEX_LENGTH) {
    throw new RegexTooLongError(pattern.length)
  }

  try {
    new RegExp(pattern)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new RegexValidationError(pattern, reason)
  }

  if (hasNestedQuantifier(pattern)) {
    throw new RegexValidationError(
      pattern,
      'Pattern contains a nested quantifier (e.g. (a+)+) that can cause catastrophic backtracking',
    )
  }
}
//
// Detects the "nested quantifier" regex shape (e.g. (a+)+, (\d{1,50})*) that is
// responsible for the overwhelming majority of real-world catastrophic-
// backtracking (ReDoS) vulnerabilities: a group that is itself repeated
// (+, *, or an open/wide {n,}/{n,m}) while its own content also contains an
// unbounded or wide repetition creates exponentially many ways to partition a
// matching (or near-matching) input, which can hang the single-threaded
// JavaScript regex engine for a single exec() call — something no timeout
// check placed between calls can interrupt.
//
// This is intentionally a conservative heuristic, not a full ReDoS analyzer:
// it does not attempt to detect the rarer alternation-overlap shape (e.g.
// (a|a)+), and treats an exact-count quantifier ({n}, no comma) as safe since
// it introduces no repetition ambiguity. Some unusual-but-safe patterns may be
// rejected; that tradeoff is preferred over letting a dangerous pattern
// through.

/**
 * Returns true if `pattern` contains a quantified group whose own content
 * also contains a quantifier (nested/stacked repetition).
 */
export function hasNestedQuantifier(pattern: string): boolean {
  interface Frame {
    hasInnerQuantifier: boolean
  }

  const stack: Frame[] = [{ hasInnerQuantifier: false }]
  let i = 0

  function applyQuantifierCheck(atomEnd: number): number {
    const qLen = matchQuantifierAt(pattern, atomEnd)
    if (qLen > 0) {
      stack[stack.length - 1]!.hasInnerQuantifier = true
    }
    return qLen
  }

  while (i < pattern.length) {
    const ch = pattern[i]

    if (ch === '\\') {
      // Escaped character (\d, \s, \(, \\, ...) is a single atom.
      const atomEnd = Math.min(i + 2, pattern.length)
      i = atomEnd + applyQuantifierCheck(atomEnd)
      continue
    }

    if (ch === '[') {
      // Character class — its contents (including +, *, (, )) have no
      // regex-syntax meaning and must not be parsed as such.
      const atomEnd = skipCharacterClass(pattern, i)
      i = atomEnd + applyQuantifierCheck(atomEnd)
      continue
    }

    if (ch === '(') {
      stack.push({ hasInnerQuantifier: false })
      i++
      continue
    }

    if (ch === ')') {
      const closed = stack.pop()
      if (!closed) {
        // Unbalanced paren — not our job to validate syntax, just don't crash.
        i++
        continue
      }

      const qLen = matchQuantifierAt(pattern, i + 1)
      if (qLen > 0 && closed.hasInnerQuantifier) {
        return true
      }

      const parent = stack[stack.length - 1]
      if (parent && (qLen > 0 || closed.hasInnerQuantifier)) {
        // Propagate "this span contains a quantifier" upward so deeper
        // nesting (e.g. ((a+))+) is still caught at an outer level.
        parent.hasInnerQuantifier = true
      }

      i += 1 + qLen
      continue
    }

    // Any other single character is an ordinary atom (literal, ., |, ^, $, ...).
    const atomEnd = i + 1
    i = atomEnd + applyQuantifierCheck(atomEnd)
  }

  return false
}

/**
 * If `pattern` starts with a quantifier at `pos` — +, *, or a comma-containing
 * {n,}/{n,m} (optionally followed by a lazy `?`) — returns its length.
 * Returns 0 otherwise. An exact-count {n} (no comma) is deliberately not
 * matched: it introduces no repetition ambiguity and is not itself dangerous.
 */
function matchQuantifierAt(pattern: string, pos: number): number {
  const ch = pattern[pos]

  if (ch === '+' || ch === '*') {
    return pattern[pos + 1] === '?' ? 2 : 1
  }

  if (ch === '{') {
    const match = /^\{\d+,\d*\}/.exec(pattern.slice(pos))
    if (match) {
      const matchedLen = match[0].length
      return pattern[pos + matchedLen] === '?' ? matchedLen + 1 : matchedLen
    }
  }

  return 0
}

/**
 * Given `start` pointing at a `[`, returns the index just past the matching
 * `]` (handling a leading `^` and a leading literal `]`, and escaped chars
 * inside the class). If the class is unterminated, returns pattern.length.
 */
function skipCharacterClass(pattern: string, start: number): number {
  let i = start + 1
  if (pattern[i] === '^') i++
  if (pattern[i] === ']') i++ // a leading ] (possibly after ^) is a literal member

  while (i < pattern.length && pattern[i] !== ']') {
    if (pattern[i] === '\\') i++
    i++
  }

  return Math.min(i + 1, pattern.length)
}
