// Shared semantic-version comparison helper

/**
 * Compares two dot-separated version strings segment by segment, numerically
 * (e.g. "1.9.9" < "1.10.0"). Handles version strings with differing numbers
 * of segments (missing segments are treated as 0).
 *
 * @returns -1 if a < b, 0 if equal, 1 if a > b
 */
export function compareSemver(a: string, b: string): -1 | 0 | 1 {
  const partsA = a.split('.').map(Number)
  const partsB = b.split('.').map(Number)
  const maxLength = Math.max(partsA.length, partsB.length)

  for (let i = 0; i < maxLength; i++) {
    const segA = partsA[i] ?? 0
    const segB = partsB[i] ?? 0
    if (segA < segB) return -1
    if (segA > segB) return 1
  }

  return 0
}
