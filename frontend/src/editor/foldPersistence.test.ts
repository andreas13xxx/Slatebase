import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { EditorView } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { codeFolding, foldAll, foldedRanges } from '@codemirror/language'
import { markdownFoldService } from './folding'
import {
  captureFolds, restoreFolds, loadFileFolds, saveFileFolds, foldPersistence, setFoldVault, MAX_FOLD_FILES,
} from './foldPersistence'
import { installObsidianGlobals } from '../plugins/compat/install-globals'

const DOC = '# Title\n\nIntro.\n\n## A\n\nBody A.\n\n## B\n\nBody B.'

function makeView(doc: string, target: { vaultId: string; path: string } | null = null): EditorView {
  return new EditorView({
    state: EditorState.create({ doc, extensions: [codeFolding(), markdownFoldService, foldPersistence(() => target)] }),
    parent: document.body,
  })
}

function foldCount(view: EditorView): number {
  return foldedRanges(view.state).size
}

beforeEach(() => { localStorage.clear() })
afterEach(() => { vi.useRealTimers() })

describe('captureFolds / restoreFolds', () => {
  it('re-applies folds on a fresh view of the same text', () => {
    const first = makeView(DOC)
    foldAll(first)
    const saved = captureFolds(first.state)
    first.destroy()

    const second = makeView(DOC)
    const applied = restoreFolds(second, saved)

    expect(applied).toBe(saved.folds.length)
    expect(foldCount(second)).toBe(foldCount(makeViewFolded()))
    second.destroy()
  })

  it('skips a fold whose line text changed', () => {
    const first = makeView(DOC)
    foldAll(first)
    const saved = captureFolds(first.state)
    first.destroy()

    const second = makeView(DOC.replace('# Title', '# Renamed'))
    restoreFolds(second, saved)

    expect(foldCount(second)).toBe(0)
    second.destroy()
  })

  it('trusts folds saved without text only while the line count matches', () => {
    const view = makeView(DOC)
    expect(restoreFolds(view, { folds: [{ from: 4, to: 7 }], lines: view.state.doc.lines })).toBe(1)
    view.destroy()
    const other = makeView(`${DOC}\nmore`)
    expect(restoreFolds(other, { folds: [{ from: 4, to: 7 }], lines: 3 })).toBe(0)
    other.destroy()
  })
})

describe('store', () => {
  it('round-trips per vault and file and forgets on an empty list', () => {
    saveFileFolds('v1', 'a.md', { folds: [{ from: 1, to: 3, text: 'x' }], lines: 9 })

    expect(loadFileFolds('v1', 'a.md')?.lines).toBe(9)
    expect(loadFileFolds('v2', 'a.md')).toBeNull()

    saveFileFolds('v1', 'a.md', { folds: [], lines: 9 })
    expect(loadFileFolds('v1', 'a.md')).toBeNull()
  })

  it('ignores corrupt storage', () => {
    localStorage.setItem('slatebase:folds:v1', '{not json')
    expect(loadFileFolds('v1', 'a.md')).toBeNull()
    localStorage.setItem('slatebase:folds:v1', JSON.stringify({ 'a.md': { folds: [{ from: 'x' }], lines: 1, savedAt: 1 } }))
    expect(loadFileFolds('v1', 'a.md')).toBeNull()
  })

  it('keeps at most MAX_FOLD_FILES files, dropping the oldest', () => {
    vi.useFakeTimers()
    for (let i = 0; i <= MAX_FOLD_FILES; i++) {
      vi.setSystemTime(1000 + i)
      saveFileFolds('v1', `f${i}.md`, { folds: [{ from: 0, to: 1 }], lines: 2 })
    }
    expect(loadFileFolds('v1', 'f0.md')).toBeNull()
    expect(loadFileFolds('v1', `f${MAX_FOLD_FILES}.md`)).not.toBeNull()
  })
})

describe('app.foldManager', () => {
  it('reads and writes the same store the editor restores from', () => {
    installObsidianGlobals()
    setFoldVault('v1')
    const foldManager = (window as unknown as { app: { foldManager: {
      load: (f: { path: string }) => { folds: unknown[]; lines: number } | null
      save: (f: { path: string }, i: { folds: Array<{ from: number; to: number }>; lines: number }) => void
    } } }).app.foldManager

    expect(foldManager.load({ path: 'n.md' })).toBeNull()
    foldManager.save({ path: 'n.md' }, { folds: [{ from: 1, to: 3 }], lines: 8 })

    expect(foldManager.load({ path: 'n.md' })).toEqual({ folds: [{ from: 1, to: 3 }], lines: 8 })
    expect(loadFileFolds('v1', 'n.md')?.lines).toBe(8)
  })
})

describe('foldPersistence extension', () => {
  it('saves after a fold change (debounced) and on destroy', () => {
    vi.useFakeTimers()
    const view = makeView(DOC, { vaultId: 'v1', path: 'n.md' })
    foldAll(view)
    expect(loadFileFolds('v1', 'n.md')).toBeNull()

    vi.advanceTimersByTime(600)
    expect(loadFileFolds('v1', 'n.md')?.folds.length).toBeGreaterThan(0)
    view.destroy()
  })

  it('does not wipe saved folds when a view that never folded is destroyed', () => {
    saveFileFolds('v1', 'n.md', { folds: [{ from: 4, to: 7, text: '## A' }], lines: 11 })
    const view = makeView('', { vaultId: 'v1', path: 'n.md' })
    view.destroy()

    expect(loadFileFolds('v1', 'n.md')).not.toBeNull()
  })
})

function makeViewFolded(): EditorView {
  const v = makeView(DOC)
  foldAll(v)
  return v
}
