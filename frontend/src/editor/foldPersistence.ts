/**
 * Remembers which headings and lists a note had folded, per vault and file.
 *
 * CM6 keeps folds only inside the live `EditorState`. Slatebase rebuilds that
 * state when a tab's editor is re-mounted (it carries over document and
 * selection, not folds), so a fold vanished on every tab switch and every
 * reload. This module saves the folded ranges as line positions and re-applies
 * them, and backs Obsidian's `app.foldManager` for plugins.
 *
 * Like the tab and explorer state in `workspaceStore`, this is per-device view
 * state, not a setting: it lives in `localStorage`, scoped by vault.
 *
 * @module editor/foldPersistence
 */

import { foldable, foldedRanges, foldEffect, unfoldEffect } from '@codemirror/language'
import type { EditorState, Extension } from '@codemirror/state'
import { EditorView, ViewPlugin, type ViewUpdate } from '@codemirror/view'

/** One folded range, as 0-based line numbers (the shape Obsidian's `foldManager` uses). */
export interface FoldedLine {
  /** Line the fold starts on (the heading or list item that stays visible). */
  from: number
  /** Last line hidden by the fold. */
  to: number
  /** Start of the first line's text, to tell whether the document still matches. Absent for folds saved by a plugin. */
  text?: string
}

/** Folds of one file. */
export interface FileFolds {
  folds: FoldedLine[]
  /** Line count of the document when the folds were saved. */
  lines: number
}

interface StoredFileFolds extends FileFolds {
  savedAt: number
}

const STORAGE_PREFIX = 'slatebase:folds:'
/** Files remembered per vault; the least recently saved ones go first. */
export const MAX_FOLD_FILES = 200
/** Folds remembered per file. */
const MAX_FOLDS_PER_FILE = 500
const TEXT_PREFIX_LENGTH = 80
const SAVE_DELAY_MS = 500

/** The vault the open editor belongs to; `foldManager` has no vault of its own to ask. */
let activeVaultId: string | null = null

/** Tells the store which vault the editor works in. */
export function setFoldVault(vaultId: string | null): void {
  activeVaultId = vaultId
}

/** The vault set by {@link setFoldVault}. */
export function getFoldVault(): string | null {
  return activeVaultId
}

function isFoldedLine(value: unknown): value is FoldedLine {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return Number.isInteger(v['from']) && Number.isInteger(v['to']) && (v['from'] as number) >= 0
    && (v['to'] as number) >= (v['from'] as number) && (v['text'] === undefined || typeof v['text'] === 'string')
}

function isStoredFileFolds(value: unknown): value is StoredFileFolds {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Record<string, unknown>
  return Array.isArray(v['folds']) && v['folds'].every(isFoldedLine) && Number.isInteger(v['lines'])
    && typeof v['savedAt'] === 'number'
}

function readVault(vaultId: string): Record<string, StoredFileFolds> {
  try {
    const raw = localStorage.getItem(STORAGE_PREFIX + vaultId)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {}
    const result: Record<string, StoredFileFolds> = {}
    for (const [path, entry] of Object.entries(parsed)) {
      if (isStoredFileFolds(entry)) result[path] = entry
    }
    return result
  } catch {
    return {}
  }
}

function writeVault(vaultId: string, files: Record<string, StoredFileFolds>): void {
  try {
    const paths = Object.keys(files)
    if (paths.length > MAX_FOLD_FILES) {
      paths.sort((a, b) => files[b]!.savedAt - files[a]!.savedAt)
      for (const path of paths.slice(MAX_FOLD_FILES)) delete files[path]
    }
    if (Object.keys(files).length === 0) localStorage.removeItem(STORAGE_PREFIX + vaultId)
    else localStorage.setItem(STORAGE_PREFIX + vaultId, JSON.stringify(files))
  } catch {
    /* storage full or blocked: folds are a convenience, never worth an error */
  }
}

/** Folds saved for a file, or `null` when there are none. */
export function loadFileFolds(vaultId: string, path: string): FileFolds | null {
  const entry = readVault(vaultId)[path]
  return entry && entry.folds.length > 0 ? { folds: entry.folds, lines: entry.lines } : null
}

/** Saves a file's folds; an empty list forgets the file. */
export function saveFileFolds(vaultId: string, path: string, folds: FileFolds): void {
  const files = readVault(vaultId)
  if (folds.folds.length === 0) delete files[path]
  else files[path] = { folds: folds.folds.slice(0, MAX_FOLDS_PER_FILE), lines: folds.lines, savedAt: Date.now() }
  writeVault(vaultId, files)
}

/** Forgets a file's folds (file deleted). */
export function removeFileFolds(vaultId: string, path: string): void {
  saveFileFolds(vaultId, path, { folds: [], lines: 0 })
}

/** Reads the folds currently set in an editor state. */
export function captureFolds(state: EditorState): FileFolds {
  const folds: FoldedLine[] = []
  foldedRanges(state).between(0, state.doc.length, (from, to) => {
    const start = state.doc.lineAt(from)
    folds.push({ from: start.number - 1, to: state.doc.lineAt(to).number - 1, text: start.text.slice(0, TEXT_PREFIX_LENGTH) })
  })
  return { folds, lines: state.doc.lines }
}

/**
 * Folds a view's document the way a saved list says, skipping every fold whose
 * line no longer looks the same (text changed, or no text saved and the line
 * count differs) or can no longer be folded.
 *
 * @returns How many folds were applied.
 */
export function restoreFolds(view: EditorView, saved: FileFolds): number {
  const { state } = view
  const effects = []
  for (const fold of saved.folds) {
    if (fold.from >= state.doc.lines) continue
    const line = state.doc.line(fold.from + 1)
    const matches = fold.text !== undefined ? line.text.slice(0, TEXT_PREFIX_LENGTH) === fold.text : saved.lines === state.doc.lines
    if (!matches) continue
    const range = foldable(state, line.from, line.to)
    if (range) effects.push(foldEffect.of(range))
  }
  if (effects.length > 0) view.dispatch({ effects })
  return effects.length
}

/**
 * Extension that saves the editor's folds whenever they change (debounced) and
 * once more when the view goes away, so edits that moved lines are kept too.
 *
 * @param getTarget - The vault and file the view shows; read at save time, `null` skips saving.
 */
export function foldPersistence(getTarget: () => { vaultId: string; path: string } | null): Extension {
  return ViewPlugin.fromClass(class {
    private timer: ReturnType<typeof setTimeout> | null = null
    private touched = false
    private readonly view: EditorView

    constructor(view: EditorView) {
      this.view = view
    }

    update(update: ViewUpdate): void {
      const changed = update.transactions.some((tr) => tr.effects.some((e) => e.is(foldEffect) || e.is(unfoldEffect)))
      if (!changed) return
      this.touched = true
      if (this.timer !== null) clearTimeout(this.timer)
      this.timer = setTimeout(() => this.flush(), SAVE_DELAY_MS)
    }

    destroy(): void {
      if (this.timer !== null) clearTimeout(this.timer)
      // Also when only the text changed: edits above a fold move its line, and
      // the saved position would otherwise point at the wrong text. A view that
      // holds no folds and never changed any saves nothing, so a document that
      // had not loaded yet cannot wipe what was remembered.
      if (this.touched || foldedRanges(this.view.state).size > 0) this.flush()
    }

    private flush(): void {
      this.timer = null
      const target = getTarget()
      if (target) saveFileFolds(target.vaultId, target.path, captureFolds(this.view.state))
    }
  })
}
