/**
 * Subsequence-based fuzzy match, case-insensitive.
 *
 * Returns `null` if every character of `query` does not appear in `text` in
 * order (no match). Otherwise returns a score where **lower is better** —
 * rewards consecutive character matches and an early match position, the
 * same heuristic Obsidian's quick switcher and most fuzzy finders use.
 */
export function fuzzyMatch(query: string, text: string): number | null {
  if (query.length === 0) return 0

  const q = query.toLowerCase()
  const t = text.toLowerCase()

  let score = 0
  let textIndex = 0
  let consecutiveRun = 0

  for (let qi = 0; qi < q.length; qi++) {
    const char = q[qi]
    const foundAt = t.indexOf(char, textIndex)
    if (foundAt === -1) return null

    const gap = foundAt - textIndex
    if (gap === 0 && qi > 0) {
      // Consecutive match — cheaper the longer the run.
      consecutiveRun++
      score -= consecutiveRun
    } else {
      consecutiveRun = 0
      score += gap
    }

    // Matches nearer the start of the text are slightly preferred.
    score += foundAt * 0.01

    textIndex = foundAt + 1
  }

  return score
}
