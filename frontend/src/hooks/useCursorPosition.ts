/**
 * useCursorPosition — polls the active CM6 editor for the cursor's
 * line/column (Requirement 5). Polls at 100ms (Requirement 5.2's update
 * budget). Returns null whenever no CM6 editor is mounted.
 */
import { useEffect, useState } from 'react'
import { getActiveEditorView } from '../editor/plugin-extensions'

export interface CursorPosition {
  /** 1-indexed. */
  line: number
  /** 1-indexed. */
  column: number
  /** Number of lines spanned by a non-empty selection, else null. */
  selectedLines: number | null
}

const POLL_INTERVAL_MS = 100

function positionsEqual(a: CursorPosition | null, b: CursorPosition | null): boolean {
  if (a === null || b === null) return a === b
  return a.line === b.line && a.column === b.column && a.selectedLines === b.selectedLines
}

function readPosition(): CursorPosition | null {
  const view = getActiveEditorView()
  if (!view) return null

  const { main } = view.state.selection
  const line = view.state.doc.lineAt(main.head)
  const column = main.head - line.from + 1

  let selectedLines: number | null = null
  if (!main.empty) {
    const fromLine = view.state.doc.lineAt(main.from).number
    const toLine = view.state.doc.lineAt(main.to).number
    selectedLines = toLine - fromLine + 1
  }

  return { line: line.number, column, selectedLines }
}

export function useCursorPosition(): CursorPosition | null {
  const [position, setPosition] = useState<CursorPosition | null>(readPosition)

  useEffect(() => {
    const interval = setInterval(() => {
      setPosition((prev) => {
        const next = readPosition()
        return positionsEqual(prev, next) ? prev : next
      })
    }, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [])

  return position
}

/**
 * Move the cursor to the given 1-indexed line in the active editor, clamping
 * out-of-range values to the nearest valid line (Requirement 5.5).
 * No-op if no CM6 editor is mounted.
 */
export function goToLine(lineNumber: number): void {
  const view = getActiveEditorView()
  if (!view) return

  const totalLines = view.state.doc.lines
  const clamped = Math.max(1, Math.min(Math.trunc(lineNumber) || 1, totalLines))
  const line = view.state.doc.line(clamped)

  view.dispatch({
    selection: { anchor: line.from },
    scrollIntoView: true,
  })
  view.focus()
}
