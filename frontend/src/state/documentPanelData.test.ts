import { describe, it, expect, vi } from 'vitest'
import { renderHook, waitFor } from '@testing-library/react'
import { applyDocumentTags, useDocumentPanelData } from './documentPanelData'
import type { IApiClient, VaultTagsResponse } from '../api'
import type { DirectoryTree } from '../types'

function makeTree(files: string[]): DirectoryTree {
  return {
    name: 'root',
    type: 'directory',
    path: '',
    children: files.map((f) => ({ name: f, type: 'file' as const, path: f })),
  }
}

/**
 * API client whose tag response can be swapped at any point, mirroring the
 * backend dropping a deleted note's tags from the index. Keyed on the current
 * server state rather than a call count: expanding a tag hits the same
 * endpoint, so counting calls would advance the fixture unintentionally.
 */
function createApiClient(initial: VaultTagsResponse): {
  apiClient: IApiClient
  serve: (response: VaultTagsResponse) => void
} {
  let current = initial
  const getVaultTags = vi.fn().mockImplementation(() => Promise.resolve(current))
  return {
    apiClient: { getVaultTags } as unknown as IApiClient,
    serve: (response) => { current = response },
  }
}

interface PanelProps {
  directoryTree: DirectoryTree | null
  documentPath?: string | null
  documentContent?: string | null
}

function renderPanel(apiClient: IApiClient, directoryTree: DirectoryTree | null, document?: PanelProps) {
  return renderHook(
    (props: PanelProps) =>
      useDocumentPanelData({
        documentContent: props.documentContent ?? null,
        documentPath: props.documentPath ?? null,
        vaultId: 'vault-1',
        apiClient,
        directoryTree: props.directoryTree,
      }),
    { initialProps: { directoryTree, ...document } },
  )
}

describe('useDocumentPanelData — vault-wide tags', () => {
  it('re-fetches tags when the vault file set changes, dropping a deleted note tag', async () => {
    const { apiClient, serve } = createApiClient({
      tags: [{ name: 'alpha', count: 1, files: ['gone.md'] }, { name: 'beta', count: 1, files: ['kept.md'] }],
    })

    const { result, rerender } = renderPanel(apiClient, makeTree(['gone.md', 'kept.md']))

    await waitFor(() => {
      expect(result.current.state.tags.entries.map((t) => t.name)).toEqual(['alpha', 'beta'])
    })

    // The delete refreshes the vault tree — that new identity is what tells the
    // panel its vault-wide tag list is out of date.
    serve({ tags: [{ name: 'beta', count: 1, files: ['kept.md'] }] })
    rerender({ directoryTree: makeTree(['kept.md']) })

    await waitFor(() => {
      expect(result.current.state.tags.entries.map((t) => t.name)).toEqual(['beta'])
    })
  })

  it('does not flip the list into its loading state on a refresh', async () => {
    const { apiClient } = createApiClient({ tags: [{ name: 'alpha', count: 1, files: ['a.md'] }] })

    const { result, rerender } = renderPanel(apiClient, makeTree(['a.md']))
    await waitFor(() => {
      expect(result.current.state.tags.entries).toHaveLength(1)
    })

    rerender({ directoryTree: makeTree(['a.md', 'b.md']) })

    // A list already on screen must not blank out to "Loading…" mid-refresh.
    expect(result.current.state.tags.loading).toBe(false)
  })

  it('drops a deleted file from an already-expanded tag', async () => {
    const { apiClient, serve } = createApiClient({
      tags: [{ name: 'alpha', count: 2, files: ['gone.md', 'kept.md'] }],
    })

    const { result, rerender } = renderPanel(apiClient, makeTree(['gone.md', 'kept.md']))
    await waitFor(() => {
      expect(result.current.state.tags.entries).toHaveLength(1)
    })

    result.current.onTagClick('alpha')
    await waitFor(() => {
      expect(result.current.state.tags.tagFiles).toEqual(['gone.md', 'kept.md'])
    })

    serve({ tags: [{ name: 'alpha', count: 1, files: ['kept.md'] }] })
    rerender({ directoryTree: makeTree(['kept.md']) })

    await waitFor(() => {
      expect(result.current.state.tags.tagFiles).toEqual(['kept.md'])
    })
    expect(result.current.state.tags.expandedTag).toBe('alpha')
  })

  it('collapses an expanded tag whose last note was deleted', async () => {
    const { apiClient, serve } = createApiClient({
      tags: [{ name: 'alpha', count: 1, files: ['gone.md'] }, { name: 'beta', count: 1, files: ['kept.md'] }],
    })

    const { result, rerender } = renderPanel(apiClient, makeTree(['gone.md', 'kept.md']))
    await waitFor(() => {
      expect(result.current.state.tags.entries).toHaveLength(2)
    })

    result.current.onTagClick('alpha')
    await waitFor(() => {
      expect(result.current.state.tags.expandedTag).toBe('alpha')
    })

    serve({ tags: [{ name: 'beta', count: 1, files: ['kept.md'] }] })
    rerender({ directoryTree: makeTree(['kept.md']) })

    await waitFor(() => {
      expect(result.current.state.tags.expandedTag).toBeNull()
    })
    expect(result.current.state.tags.tagFiles).toEqual([])
  })
})

describe('useDocumentPanelData — live tags of the open document', () => {
  it('shows a tag the moment it is typed, before any save', async () => {
    const { apiClient } = createApiClient({ tags: [{ name: 'alt', count: 1, files: ['note.md'] }] })

    const { result, rerender } = renderPanel(apiClient, makeTree(['note.md']), {
      directoryTree: makeTree(['note.md']),
      documentPath: 'note.md',
      documentContent: '#alt',
    })

    await waitFor(() => {
      expect(result.current.state.tags.entries.map((t) => t.name)).toEqual(['alt'])
    })

    rerender({ directoryTree: makeTree(['note.md']), documentPath: 'note.md', documentContent: '#alt #neu' })

    await waitFor(() => {
      expect(result.current.state.tags.entries.map((t) => t.name).sort()).toEqual(['alt', 'neu'])
    })
    // The backend list is untouched — this is an overlay, not a refetch.
    expect(result.current.state.tags.entries.find((t) => t.name === 'neu')).toMatchObject({
      count: 1,
      files: ['note.md'],
    })
  })

  it('drops a tag the moment it is deleted from its last note', async () => {
    const { apiClient } = createApiClient({ tags: [{ name: 'alt', count: 1, files: ['note.md'] }] })

    const { result, rerender } = renderPanel(apiClient, makeTree(['note.md']), {
      directoryTree: makeTree(['note.md']),
      documentPath: 'note.md',
      documentContent: '#alt',
    })

    await waitFor(() => {
      expect(result.current.state.tags.entries).toHaveLength(1)
    })

    rerender({ directoryTree: makeTree(['note.md']), documentPath: 'note.md', documentContent: 'nichts mehr' })

    await waitFor(() => {
      expect(result.current.state.tags.entries).toEqual([])
    })
  })

  it('leaves the count of a tag other notes still carry', async () => {
    const { apiClient } = createApiClient({
      tags: [{ name: 'geteilt', count: 2, files: ['note.md', 'other.md'] }],
    })

    const { result, rerender } = renderPanel(apiClient, makeTree(['note.md', 'other.md']), {
      directoryTree: makeTree(['note.md', 'other.md']),
      documentPath: 'note.md',
      documentContent: '#geteilt',
    })

    await waitFor(() => {
      expect(result.current.state.tags.entries[0]).toMatchObject({ count: 2 })
    })

    rerender({
      directoryTree: makeTree(['note.md', 'other.md']),
      documentPath: 'note.md',
      documentContent: 'weg damit',
    })

    await waitFor(() => {
      expect(result.current.state.tags.entries[0]).toMatchObject({ count: 1, files: ['other.md'] })
    })
  })
})

describe('useDocumentPanelData — tags after a save', () => {
  it('re-fetches the vault list when another document takes over', async () => {
    // A save re-indexes the note without changing the file set, so nothing else
    // would tell the panel its list is behind.
    const { apiClient, serve } = createApiClient({ tags: [{ name: 'alt', count: 1, files: ['note.md'] }] })

    const { result, rerender } = renderPanel(apiClient, makeTree(['note.md', 'other.md']), {
      directoryTree: makeTree(['note.md', 'other.md']),
      documentPath: 'note.md',
      documentContent: '#alt #neu',
    })

    await waitFor(() => {
      expect(result.current.state.tags.entries.map((t) => t.name).sort()).toEqual(['alt', 'neu'])
    })

    serve({
      tags: [{ name: 'alt', count: 1, files: ['note.md'] }, { name: 'neu', count: 1, files: ['note.md'] }],
    })
    rerender({
      directoryTree: makeTree(['note.md', 'other.md']),
      documentPath: 'other.md',
      documentContent: 'nichts',
    })

    // Without the re-fetch, `neu` would vanish with the overlay that carried it.
    await waitFor(() => {
      expect(result.current.state.tags.entries.map((t) => t.name).sort()).toEqual(['alt', 'neu'])
    })
  })
})

describe('applyDocumentTags', () => {
  const entries = [
    { name: 'alt', count: 2, files: ['note.md', 'other.md'] },
    { name: 'fremd', count: 1, files: ['other.md'] },
  ]

  it('is a no-op without an open document', () => {
    expect(applyDocumentTags(entries, null, ['neu'])).toBe(entries)
    expect(applyDocumentTags(entries, 'note.md', null)).toBe(entries)
  })

  it('adds the open document to a tag it just gained', () => {
    const result = applyDocumentTags(entries, 'note.md', ['alt', 'fremd'])

    expect(result.find((t) => t.name === 'fremd')).toMatchObject({
      count: 2,
      files: ['other.md', 'note.md'],
    })
  })

  it('removes the open document from a tag it just lost', () => {
    const result = applyDocumentTags(entries, 'note.md', [])

    expect(result.find((t) => t.name === 'alt')).toMatchObject({ count: 1, files: ['other.md'] })
  })

  it('leaves other notes tags alone', () => {
    const result = applyDocumentTags(entries, 'note.md', [])

    expect(result.find((t) => t.name === 'fremd')).toMatchObject({ count: 1, files: ['other.md'] })
  })

  it('lands on the same answer once the save makes the tag official', () => {
    const beforeSave = applyDocumentTags(entries, 'note.md', ['alt', 'neu'])
    const afterSave = applyDocumentTags(
      [...entries, { name: 'neu', count: 1, files: ['note.md'] }],
      'note.md',
      ['alt', 'neu'],
    )

    expect(afterSave).toEqual(beforeSave)
  })

  it('passes entries without a file list through untouched', () => {
    const noFiles = [{ name: 'alt', count: 2 }]

    expect(applyDocumentTags(noFiles, 'note.md', [])).toEqual(noFiles)
  })
})
