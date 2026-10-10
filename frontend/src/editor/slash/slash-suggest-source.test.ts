import { describe, it, expect, vi } from 'vitest'
import { createSlashSuggestSource } from './slash-suggest-source'
import type { EditorSuggestContext } from '../../plugins/compat/editor-suggest-manager'
import type { EditorPosition, IEditor } from '../../plugins/compat/editor-shim'
import type { ICommandRegistry } from '../../plugins/compat/command-registry'

// renderComponentIcon pulls in the whole icon resolver; stub it to a no-op so
// these logic tests don't depend on Lucide dynamic imports.
vi.mock('../../plugins/compat/obsidian-api-extensions', () => ({
  renderComponentIcon: () => {},
}))

/** A minimal fake command registry: `getCommand` resolves only listed ids. */
function fakeRegistry(knownIds: string[], onExecute: (id: string) => void): ICommandRegistry {
  return {
    getCommand: (id: string) => (knownIds.includes(id) ? ({ id, name: id } as never) : undefined),
    executeCommand: (id: string) => onExecute(id),
  } as unknown as ICommandRegistry
}

/** A fake EditorView capturing dispatched changes. */
function fakeView(dispatched: Array<Record<string, unknown>>) {
  return {
    dispatch: (spec: Record<string, unknown>) => dispatched.push(spec),
    state: { selection: { main: { from: 0, to: 0 } } },
  }
}

/** A fake IEditor whose offsets equal `ch` on line 0 (single-line docs). */
const fakeEditor = {
  posToOffset: (p: EditorPosition) => p.ch,
  offsetToPos: (o: number) => ({ line: 0, ch: o }),
} as unknown as IEditor

function contextFor(query: string, from: number, to: number): EditorSuggestContext {
  return {
    start: { line: 0, ch: from },
    end: { line: 0, ch: to },
    query,
    editor: fakeEditor,
    file: null as never,
  }
}

const ALL_IDS = [
  'editor:set-heading-1',
  'editor:set-heading-2',
  'editor:set-heading-3',
  'editor:toggle-bullet-list',
  'editor:toggle-numbered-list',
  'editor:toggle-checklist-status',
  'editor:toggle-blockquote',
  'editor:insert-codeblock',
  'editor:insert-callout',
  'editor:insert-table',
  'editor:insert-horizontal-rule',
  'editor:insert-wikilink',
  'insert-template',
]

describe('createSlashSuggestSource', () => {
  function make(opts?: { known?: string[]; onExecute?: (id: string) => void; view?: unknown }) {
    const executed: string[] = []
    const dispatched: Array<Record<string, unknown>> = []
    const view = opts?.view ?? fakeView(dispatched)
    const source = createSlashSuggestSource({
      getActiveEditorView: () => view as never,
      getCommandRegistry: () =>
        fakeRegistry(opts?.known ?? ALL_IDS, (id) => {
          executed.push(id)
          opts?.onExecute?.(id)
        }),
      getLocale: () => 'de',
    })
    return { source, executed, dispatched }
  }

  describe('getSuggestions', () => {
    it('returns every entry for an empty query, in declared order', () => {
      const { source } = make()
      const items = source.getSuggestions(contextFor('', 0, 1)) as Array<{ label: string }>
      // 13 core-command entries (all known) + date + time = 15
      expect(items).toHaveLength(15)
      expect(items[0].label).toBe('Überschrift 1')
    })

    it('filters by fuzzy match on the localized label', () => {
      const { source } = make()
      const items = source.getSuggestions(contextFor('tab', 0, 4)) as Array<{ label: string }>
      expect(items.some((i) => i.label === 'Tabelle')).toBe(true)
      expect(items.some((i) => i.label === 'Überschrift 1')).toBe(false)
    })

    it('omits entries whose core command does not resolve', () => {
      // Registry knows nothing → only the date/time direct-insert entries remain.
      const { source } = make({ known: [] })
      const items = source.getSuggestions(contextFor('', 0, 1)) as Array<{ label: string }>
      expect(items).toHaveLength(2)
      expect(items.map((i) => i.label).sort()).toEqual(['Datum einfügen', 'Zeit einfügen'])
    })
  })

  describe('selectSuggestion', () => {
    it('deletes the trigger text first, then runs the core command', () => {
      const { source, executed, dispatched } = make()
      source.context = contextFor('tab', 0, 4) // "/tab" occupies ch 0..4
      const items = source.getSuggestions(source.context) as unknown[]
      const table = (items as Array<{ label: string }>).findIndex((i) => i.label === 'Tabelle')
      source.selectSuggestion(items[table], new MouseEvent('click'))

      // Trigger text [0..4] deleted via an empty-insert change.
      expect(dispatched).toHaveLength(1)
      expect(dispatched[0]).toMatchObject({ changes: { from: 0, to: 4, insert: '' } })
      // Then the core command ran.
      expect(executed).toEqual(['editor:insert-table'])
    })

    it('runs a direct-insert entry (date) with no core command', () => {
      const { source, executed, dispatched } = make()
      source.context = contextFor('datum', 0, 6)
      const items = source.getSuggestions(source.context) as unknown[]
      const date = (items as Array<{ label: string }>).findIndex((i) => i.label === 'Datum einfügen')
      source.selectSuggestion(items[date], new MouseEvent('click'))

      // One dispatch deletes the trigger, one inserts the date → no core command.
      expect(executed).toEqual([])
      expect(dispatched.length).toBeGreaterThanOrEqual(1)
    })
  })
})
