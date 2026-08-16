/**
 * useWordStats — polls the active CM6 editor for word/character counts.
 *
 * Requirement 4: shows word/character counts for the active file, plus
 * selection counts when a non-empty selection exists. Polls at 300ms
 * (Requirement 4.2's debounce) rather than subscribing to CM6 transactions
 * directly, so it needs no changes to the core editor's extension wiring.
 * Returns EMPTY_STATS whenever no CM6 editor is mounted (no active tab, or
 * the active tab is not in edit mode — Requirement 4.4).
 */
import { useEffect, useState } from 'react'
import { getActiveEditorView } from '../editor/plugin-extensions'

export interface WordStats {
  words: number
  characters: number
  /** null when the selection is empty. */
  selectedWords: number | null
  /** null when the selection is empty. */
  selectedCharacters: number | null
}

const POLL_INTERVAL_MS = 300

/** Markdown control characters stripped before counting words (Requirement 4.5). */
const MARKDOWN_SYNTAX_CHARS = /[#*_`[\]]/g

export const EMPTY_WORD_STATS: WordStats = {
  words: 0,
  characters: 0,
  selectedWords: null,
  selectedCharacters: null,
}

/** Counts whitespace-separated tokens after stripping Markdown control characters. */
export function countWords(text: string): number {
  const stripped = text.replace(MARKDOWN_SYNTAX_CHARS, '')
  const trimmed = stripped.trim()
  if (trimmed === '') return 0
  return trimmed.split(/\s+/).length
}

function statsEqual(a: WordStats, b: WordStats): boolean {
  return (
    a.words === b.words &&
    a.characters === b.characters &&
    a.selectedWords === b.selectedWords &&
    a.selectedCharacters === b.selectedCharacters
  )
}

function readStats(): WordStats {
  const view = getActiveEditorView()
  if (!view) return EMPTY_WORD_STATS

  const content = view.state.doc.toString()
  const { from, to } = view.state.selection.main
  const selectedText = from === to ? '' : view.state.sliceDoc(from, to)

  return {
    words: countWords(content),
    characters: content.length,
    selectedWords: selectedText === '' ? null : countWords(selectedText),
    selectedCharacters: selectedText === '' ? null : selectedText.length,
  }
}

export function useWordStats(): WordStats {
  const [stats, setStats] = useState<WordStats>(readStats)

  useEffect(() => {
    const interval = setInterval(() => {
      setStats((prev) => {
        const next = readStats()
        return statsEqual(prev, next) ? prev : next
      })
    }, POLL_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [])

  return stats
}
