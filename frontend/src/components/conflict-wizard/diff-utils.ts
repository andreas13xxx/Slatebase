/**
 * Pure diff utility functions for the conflict resolution wizard.
 * Implements line-level Myers diff algorithm — no external dependencies.
 */

/** A contiguous block of lines with the same change type. */
export interface DiffHunk {
  /** Whether lines are equal, inserted, or deleted. */
  type: 'equal' | 'insert' | 'delete'
  /** The lines in this hunk. */
  lines: string[]
  /** 0-based starting line index in the old text. */
  oldStart: number
  /** 0-based starting line index in the new text. */
  newStart: number
}

/** A group of hunks for display, possibly collapsed. */
export interface GroupedHunk {
  /** Whether this group contains changes (insert/delete). */
  hasChanges: boolean
  /** The diff hunks in this group. */
  hunks: DiffHunk[]
  /** For collapsed equal sections: the number of hidden lines. */
  collapsedLineCount?: number
}

/** Text file extensions that support diff view. */
const TEXT_EXTENSIONS = new Set([
  '.md', '.txt', '.json', '.csv', '.yaml', '.yml',
  '.xml', '.html', '.css', '.js', '.ts',
])

/**
 * Determines if a file is text-diffable based on its extension.
 * Case-insensitive comparison. Files without an extension return false.
 */
export function isTextFile(filePath: string): boolean {
  const lastDot = filePath.lastIndexOf('.')
  if (lastDot === -1) return false
  // Ensure dot is in the filename portion, not a directory separator
  const lastSep = Math.max(filePath.lastIndexOf('/'), filePath.lastIndexOf('\\'))
  if (lastDot <= lastSep) return false
  const ext = filePath.slice(lastDot).toLowerCase()
  return TEXT_EXTENSIONS.has(ext)
}

/**
 * Computes a line-level diff between two texts using the Myers diff algorithm.
 * Returns an array of DiffHunks in order.
 */
export function computeDiff(oldText: string, newText: string): DiffHunk[] {
  const oldLines = splitLines(oldText)
  const newLines = splitLines(newText)

  const editScript = myersDiff(oldLines, newLines)
  return buildHunks(editScript, oldLines, newLines)
}

/**
 * Groups hunks for display with context collapsing.
 * Equal sections with more than `contextLines * 2` lines are collapsed,
 * showing only contextLines at start/end.
 */
export function groupHunks(hunks: DiffHunk[], contextLines = 3): GroupedHunk[] {
  if (hunks.length === 0) return []

  const result: GroupedHunk[] = []

  for (const hunk of hunks) {
    if (hunk.type !== 'equal') {
      // Change hunk — add to current change group or start a new one
      if (result.length > 0 && result[result.length - 1]!.hasChanges) {
        result[result.length - 1]!.hunks.push(hunk)
      } else {
        result.push({ hasChanges: true, hunks: [hunk] })
      }
    } else {
      // Equal hunk — decide whether to collapse
      const lineCount = hunk.lines.length
      const threshold = contextLines * 2

      if (lineCount <= threshold) {
        // Small equal section: attach to adjacent change groups as context
        // If previous group has changes, append this as trailing context
        if (result.length > 0 && result[result.length - 1]!.hasChanges) {
          result[result.length - 1]!.hunks.push(hunk)
        } else {
          result.push({ hasChanges: false, hunks: [hunk] })
        }
      } else {
        // Large equal section: split into leading context, collapsed, trailing context
        const leadingLines = hunk.lines.slice(0, contextLines)
        const trailingLines = hunk.lines.slice(lineCount - contextLines)
        const collapsedCount = lineCount - contextLines * 2

        // Attach leading context to previous change group
        if (result.length > 0 && result[result.length - 1]!.hasChanges) {
          const leadingHunk: DiffHunk = {
            type: 'equal',
            lines: leadingLines,
            oldStart: hunk.oldStart,
            newStart: hunk.newStart,
          }
          result[result.length - 1]!.hunks.push(leadingHunk)
        } else {
          // First hunk is equal — show leading context as a standalone group
          if (leadingLines.length > 0) {
            const leadingHunk: DiffHunk = {
              type: 'equal',
              lines: leadingLines,
              oldStart: hunk.oldStart,
              newStart: hunk.newStart,
            }
            result.push({ hasChanges: false, hunks: [leadingHunk] })
          }
        }

        // Add collapsed section
        result.push({
          hasChanges: false,
          hunks: [],
          collapsedLineCount: collapsedCount,
        })

        // Trailing context becomes start of next group (will attach to next change)
        const trailingHunk: DiffHunk = {
          type: 'equal',
          lines: trailingLines,
          oldStart: hunk.oldStart + lineCount - contextLines,
          newStart: hunk.newStart + lineCount - contextLines,
        }
        result.push({ hasChanges: false, hunks: [trailingHunk] })
      }
    }
  }

  return result
}

// ---------- Internal helpers ----------

/** Splits text into lines. Empty string yields empty array. */
function splitLines(text: string): string[] {
  if (text === '') return []
  return text.split('\n')
}

/** Edit operation types for the Myers algorithm. */
type EditOp = { type: 'equal'; line: string }
  | { type: 'insert'; line: string }
  | { type: 'delete'; line: string }

/**
 * Myers diff algorithm — finds the shortest edit script.
 * Returns an array of edit operations (equal/insert/delete) in order.
 *
 * Implementation based on "An O(ND) Difference Algorithm" by Eugene W. Myers.
 */
function myersDiff(oldLines: string[], newLines: string[]): EditOp[] {
  const n = oldLines.length
  const m = newLines.length
  const max = n + m

  // Both empty
  if (max === 0) return []

  // Optimization: one side empty
  if (n === 0) {
    return newLines.map(line => ({ type: 'insert' as const, line }))
  }
  if (m === 0) {
    return oldLines.map(line => ({ type: 'delete' as const, line }))
  }

  // V stores the furthest-reaching x-coordinate for each diagonal k.
  // Index into v: k + offset (so negative k values map to positive indices).
  const offset = max
  const vSize = 2 * max + 1

  // Store a snapshot of v at each step d for backtracking.
  const traces: number[][] = []

  const v = new Array<number>(vSize).fill(0)

  // Forward pass: find the shortest edit distance d.
  outer:
  for (let d = 0; d <= max; d++) {
    // Snapshot v before mutating for this step
    traces.push([...v])

    for (let k = -d; k <= d; k += 2) {
      // Decide whether to move down (insert) or right (delete)
      let x: number
      if (k === -d || (k !== d && v[k - 1 + offset]! < v[k + 1 + offset]!)) {
        x = v[k + 1 + offset]!  // down: x stays, y increases (insert from new)
      } else {
        x = v[k - 1 + offset]! + 1  // right: x increases (delete from old)
      }

      let y = x - k

      // Follow diagonal (matching lines)
      while (x < n && y < m && oldLines[x] === newLines[y]) {
        x++
        y++
      }

      v[k + offset] = x

      // Reached end of both sequences
      if (x >= n && y >= m) {
        break outer
      }
    }
  }

  // Backtrack to reconstruct the edit script
  const ops: EditOp[] = []
  let x = n
  let y = m

  for (let d = traces.length - 1; d >= 0; d--) {
    const k = x - y

    // Determine previous k (where we came from)
    let prevK: number
    if (k === -d || (k !== d && traces[d]![k - 1 + offset]! < traces[d]![k + 1 + offset]!)) {
      prevK = k + 1
    } else {
      prevK = k - 1
    }

    const prevX = traces[d]![prevK + offset]!
    const prevY = prevX - prevK

    // Trace diagonal (equal lines) backwards
    while (x > prevX && y > prevY) {
      x--
      y--
      ops.push({ type: 'equal', line: oldLines[x]! })
    }

    // The single edit step that moved from prevK to k
    if (d > 0) {
      if (prevK === k + 1) {
        // Came from above: insert (y decreased going back means insert going forward)
        y--
        ops.push({ type: 'insert', line: newLines[y]! })
      } else {
        // Came from left: delete
        x--
        ops.push({ type: 'delete', line: oldLines[x]! })
      }
    }
  }

  ops.reverse()
  return ops
}

/**
 * Converts a flat edit script into grouped DiffHunks.
 */
function buildHunks(editScript: EditOp[], _oldLines: string[], _newLines: string[]): DiffHunk[] {
  if (editScript.length === 0) return []

  const hunks: DiffHunk[] = []
  let oldIdx = 0
  let newIdx = 0
  let currentType: 'equal' | 'insert' | 'delete' | null = null
  let currentLines: string[] = []
  let currentOldStart = 0
  let currentNewStart = 0

  for (const op of editScript) {
    if (op.type !== currentType) {
      // Flush previous hunk
      if (currentType !== null && currentLines.length > 0) {
        hunks.push({
          type: currentType,
          lines: currentLines,
          oldStart: currentOldStart,
          newStart: currentNewStart,
        })
      }
      currentType = op.type
      currentLines = []
      currentOldStart = oldIdx
      currentNewStart = newIdx
    }

    currentLines.push(op.line)

    if (op.type === 'equal') {
      oldIdx++
      newIdx++
    } else if (op.type === 'delete') {
      oldIdx++
    } else {
      newIdx++
    }
  }

  // Flush last hunk
  if (currentType !== null && currentLines.length > 0) {
    hunks.push({
      type: currentType,
      lines: currentLines,
      oldStart: currentOldStart,
      newStart: currentNewStart,
    })
  }

  return hunks
}
