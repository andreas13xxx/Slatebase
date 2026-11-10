/**
 * BasesView — Kanban grouped by `file.folder` (Obsidian 1.14.2): dragging a card
 * moves the note into the column's folder (vault move, not a frontmatter write);
 * "Neue Notiz" creates a note in the column's folder.
 */

import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { installObsidianGlobals } from '../../plugins/compat/install-globals'
import { BasesView } from './BasesView'
import type { IApiClient } from '../../api'
import type { BaseQueryResultWire } from '@slatebase/shared-contracts'

installObsidianGlobals()

const folderResult: BaseQueryResultWire = {
  rows: [
    { path: 'Projekte/a.md', fileName: 'Task A', values: { 'file.folder': 'Projekte' } },
    { path: 'Archiv/b.md', fileName: 'Task B', values: { 'file.folder': 'Archiv' } },
  ],
  total: 2,
}

const folderSource = [
  'views:',
  '  - type: cards',
  '    name: Board',
  '    groupBy:',
  '      property: file.folder',
  '    order: [file.name]',
].join('\n')

function dt(): DataTransfer {
  const store: Record<string, string> = {}
  return {
    effectAllowed: '', dropEffect: '',
    setData: (k: string, v: string) => { store[k] = v },
    getData: (k: string) => store[k] ?? '',
  } as unknown as DataTransfer
}

function makeApi(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    queryBase: vi.fn().mockResolvedValue(folderResult),
    getPropertyTypes: vi.fn().mockResolvedValue({ entries: [] }),
    fetchFileContent: vi.fn(),
    saveFile: vi.fn().mockResolvedValue({ path: 'x', name: 'x', size: 0, etag: 'e' }),
    moveContent: vi.fn().mockResolvedValue(undefined),
    fetchVaultTree: vi.fn().mockResolvedValue({ type: 'directory', path: '', name: '', children: [] }),
    ...overrides,
  } as unknown as IApiClient
}

async function dragAToArchiv(apiClient: IApiClient): Promise<void> {
  render(
    <BasesView apiClient={apiClient} vaultId="v1" source={folderSource} readOnly={false} onOpenNote={() => {}} onSaveSource={() => {}} />,
  )
  await waitFor(() => expect(screen.getByText('Task A')).toBeTruthy())
  const data = dt()
  fireEvent.dragStart(screen.getByText('Task A').closest('button') as HTMLElement, { dataTransfer: data })
  const archiv = screen.getByText('Archiv').closest('section') as HTMLElement
  fireEvent.dragOver(archiv, { dataTransfer: data })
  fireEvent.drop(archiv, { dataTransfer: data })
}

describe('BasesView Kanban by file.folder', () => {
  it('moves the note into the target folder instead of writing frontmatter', async () => {
    const apiClient = makeApi()
    await dragAToArchiv(apiClient)
    await waitFor(() => expect(apiClient.moveContent).toHaveBeenCalledWith('v1', 'Projekte/a.md', 'Archiv/a.md'))
    expect(apiClient.fetchFileContent).not.toHaveBeenCalled()
    expect(apiClient.saveFile).not.toHaveBeenCalled()
  })

  it('shows an error and leaves the card when the move fails', async () => {
    const apiClient = makeApi({ moveContent: vi.fn().mockRejectedValue(new Error('Ziel existiert bereits')) })
    await dragAToArchiv(apiClient)
    expect(await screen.findByText(/Ziel existiert bereits/)).toBeTruthy()
    expect(screen.getByText('Task A')).toBeTruthy()
  })

  it('creates a new note in the folder of the column', async () => {
    const onOpenNote = vi.fn()
    const apiClient = makeApi()
    render(
      <BasesView apiClient={apiClient} vaultId="v1" source={folderSource} readOnly={false} onOpenNote={onOpenNote} onSaveSource={() => {}} />,
    )
    await waitFor(() => expect(screen.getByText('Task B')).toBeTruthy())
    const archiv = screen.getByText('Archiv').closest('section') as HTMLElement
    fireEvent.click(archiv.querySelector('.bases-kanban__add') as HTMLElement)
    await waitFor(() => expect(apiClient.saveFile).toHaveBeenCalled())
    expect(vi.mocked(apiClient.saveFile).mock.calls[0]?.[1]).toBe('Archiv/Unbenannt.md')
    await waitFor(() => expect(onOpenNote).toHaveBeenCalledWith('Archiv/Unbenannt.md'))
  })
})
