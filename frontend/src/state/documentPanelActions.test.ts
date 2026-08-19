import { describe, it, expect, vi } from 'vitest'
import { loadUnlinkedMentions, linkUnlinkedMention } from './documentPanelActions'
import type { DocumentPanelAction } from './documentPanelData'
import type { IApiClient } from '../api'
import type { DirectoryTree, FileContent, FileSaveResult } from '../types'

/** A vault tree with one file ("Hello.md") linked from "Linked.md" and mentioned in "Unlinked.md". */
const tree: DirectoryTree = {
  name: 'root',
  type: 'directory',
  path: '',
  children: [
    { name: 'Hello.md', type: 'file', path: 'Hello.md' },
    { name: 'Linked.md', type: 'file', path: 'Linked.md' },
    { name: 'Unlinked.md', type: 'file', path: 'Unlinked.md' },
    { name: 'Mixed.md', type: 'file', path: 'Mixed.md' },
  ],
}

function createMockApiClient(overrides: Partial<IApiClient> = {}): IApiClient {
  return { ...overrides } as unknown as IApiClient
}

function collectActions(dispatch: ReturnType<typeof vi.fn>): DocumentPanelAction[] {
  return dispatch.mock.calls.map((call) => call[0] as DocumentPanelAction)
}

describe('loadUnlinkedMentions', () => {
  it('finds a plain-text mention and dispatches it as an unlinked mention', async () => {
    const dispatch = vi.fn()
    const searchVault = vi.fn().mockResolvedValue({
      results: [
        {
          filePath: 'Unlinked.md',
          fileName: 'Unlinked.md',
          hitCount: 1,
          hits: [{ line: 3, matchText: 'Hello', contextBefore: [], contextAfter: [], matchLine: 'I mentioned Hello here without linking it.' }],
        },
      ],
    })
    const apiClient = createMockApiClient({ searchVault })

    await loadUnlinkedMentions(dispatch, apiClient, 'vault-1', 'Hello.md', tree)

    expect(searchVault).toHaveBeenCalledWith('vault-1', expect.objectContaining({ query: 'Hello' }))
    const actions = collectActions(dispatch)
    expect(actions).toContainEqual({
      type: 'SET_UNLINKED_MENTIONS',
      entries: [{ filePath: 'Unlinked.md', snippet: 'I mentioned Hello here without linking it.', lineNumber: 3 }],
    })
  })

  it('excludes matches that are already inside a wikilink resolving to the active file', async () => {
    const dispatch = vi.fn()
    const searchVault = vi.fn().mockResolvedValue({
      results: [
        {
          filePath: 'Linked.md',
          fileName: 'Linked.md',
          hitCount: 1,
          hits: [{ line: 1, matchText: 'Hello', contextBefore: [], contextAfter: [], matchLine: 'See [[Hello]] for details.' }],
        },
      ],
    })
    const apiClient = createMockApiClient({ searchVault })

    await loadUnlinkedMentions(dispatch, apiClient, 'vault-1', 'Hello.md', tree)

    const actions = collectActions(dispatch)
    expect(actions).toContainEqual({ type: 'SET_UNLINKED_MENTIONS', entries: [] })
  })

  it('picks the first unlinked hit in a file even if an earlier hit is already linked', async () => {
    const dispatch = vi.fn()
    const searchVault = vi.fn().mockResolvedValue({
      results: [
        {
          filePath: 'Mixed.md',
          fileName: 'Mixed.md',
          hitCount: 2,
          hits: [
            { line: 1, matchText: 'Hello', contextBefore: [], contextAfter: [], matchLine: 'See [[Hello]] for details.' },
            { line: 5, matchText: 'Hello', contextBefore: [], contextAfter: [], matchLine: 'Also mentioned: Hello, unlinked this time.' },
          ],
        },
      ],
    })
    const apiClient = createMockApiClient({ searchVault })

    await loadUnlinkedMentions(dispatch, apiClient, 'vault-1', 'Hello.md', tree)

    const actions = collectActions(dispatch)
    expect(actions).toContainEqual({
      type: 'SET_UNLINKED_MENTIONS',
      entries: [{ filePath: 'Mixed.md', snippet: 'Also mentioned: Hello, unlinked this time.', lineNumber: 5 }],
    })
  })

  it('excludes the active file itself from results', async () => {
    const dispatch = vi.fn()
    const searchVault = vi.fn().mockResolvedValue({
      results: [
        {
          filePath: 'Hello.md',
          fileName: 'Hello.md',
          hitCount: 1,
          hits: [{ line: 1, matchText: 'Hello', contextBefore: [], contextAfter: [], matchLine: '# Hello' }],
        },
      ],
    })
    const apiClient = createMockApiClient({ searchVault })

    await loadUnlinkedMentions(dispatch, apiClient, 'vault-1', 'Hello.md', tree)

    const actions = collectActions(dispatch)
    expect(actions).toContainEqual({ type: 'SET_UNLINKED_MENTIONS', entries: [] })
  })

  it('does not call searchVault for a file with no usable base name', async () => {
    const dispatch = vi.fn()
    const searchVault = vi.fn()
    const apiClient = createMockApiClient({ searchVault })

    await loadUnlinkedMentions(dispatch, apiClient, 'vault-1', '.md', tree)

    expect(searchVault).not.toHaveBeenCalled()
    expect(collectActions(dispatch)).toContainEqual({ type: 'SET_UNLINKED_MENTIONS', entries: [] })
  })

  it('dispatches an error state when the search fails', async () => {
    const dispatch = vi.fn()
    const apiClient = createMockApiClient({ searchVault: vi.fn().mockRejectedValue(new Error('boom')) })

    await loadUnlinkedMentions(dispatch, apiClient, 'vault-1', 'Hello.md', tree)

    const actions = collectActions(dispatch)
    expect(actions.some((a) => a.type === 'SET_UNLINKED_MENTIONS_ERROR' && a.error === 'boom')).toBe(true)
  })

  it('does not dispatch a result once the signal has been aborted', async () => {
    const dispatch = vi.fn()
    const controller = new AbortController()
    const searchVault = vi.fn().mockImplementation(async () => {
      controller.abort()
      return { results: [] }
    })
    const apiClient = createMockApiClient({ searchVault })

    await loadUnlinkedMentions(dispatch, apiClient, 'vault-1', 'Hello.md', tree, controller.signal)

    const actions = collectActions(dispatch)
    expect(actions.some((a) => a.type === 'SET_UNLINKED_MENTIONS')).toBe(false)
  })
})

describe('linkUnlinkedMention', () => {
  it('replaces the first occurrence on the recorded line with a wikilink and saves', async () => {
    const fetchFileContent = vi.fn().mockResolvedValue({
      path: 'Unlinked.md',
      name: 'Unlinked.md',
      content: 'Intro line.\nI mentioned Hello here without linking it.\nOutro line.',
      size: 100,
      encoding: 'utf-8',
    } satisfies FileContent)
    const saveFile = vi.fn().mockResolvedValue({} as FileSaveResult)
    const apiClient = createMockApiClient({ fetchFileContent, saveFile })

    await linkUnlinkedMention(apiClient, 'vault-1', { filePath: 'Unlinked.md', snippet: '', lineNumber: 2 }, 'Hello')

    expect(saveFile).toHaveBeenCalledWith(
      'vault-1',
      'Unlinked.md',
      'Intro line.\nI mentioned [[Hello]] here without linking it.\nOutro line.',
    )
  })

  it('does nothing when the recorded line no longer contains the mention', async () => {
    const fetchFileContent = vi.fn().mockResolvedValue({
      path: 'Unlinked.md',
      name: 'Unlinked.md',
      content: 'Intro line.\nThis line changed entirely.\nOutro line.',
      size: 100,
      encoding: 'utf-8',
    } satisfies FileContent)
    const saveFile = vi.fn()
    const apiClient = createMockApiClient({ fetchFileContent, saveFile })

    await linkUnlinkedMention(apiClient, 'vault-1', { filePath: 'Unlinked.md', snippet: '', lineNumber: 2 }, 'Hello')

    expect(saveFile).not.toHaveBeenCalled()
  })
})
