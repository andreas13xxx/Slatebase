import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { installObsidianGlobals } from '../../plugins/compat/install-globals'
import { BasesView } from './BasesView'
import type { IApiClient } from '../../api'
import type { BaseQueryResultWire } from '@slatebase/shared-contracts'

installObsidianGlobals()

const result: BaseQueryResultWire = {
  rows: [{ path: 'a.md', fileName: 'Task A', values: { status: ['todo'] } }],
  total: 1,
}

const source = [
  'views:',
  '  - type: cards',
  '    name: Board',
  '    groupBy:',
  '      property: status',
  '    order: [file.name, status]',
  'properties:',
  '  status: {}',
].join('\n')

function makeApi(saveFile: ReturnType<typeof vi.fn>): IApiClient {
  return {
    queryBase: vi.fn().mockResolvedValue(result),
    getPropertyTypes: vi.fn().mockResolvedValue({ entries: [] }),
    fetchFileContent: vi.fn(),
    saveFile,
    fetchVaultTree: vi.fn().mockResolvedValue({ type: 'directory', path: '', name: '', children: [] }),
  } as unknown as IApiClient
}

describe('BasesView — creating an entry', () => {
  it('shows the error when the note cannot be created (instead of doing nothing)', async () => {
    const saveFile = vi.fn().mockRejectedValue(new Error('Speicherplatz erschöpft'))
    render(<BasesView apiClient={makeApi(saveFile)} vaultId="v1" source={source} readOnly={false} onOpenNote={() => {}} onSaveSource={() => {}} />)
    await waitFor(() => expect(screen.getByText('Task A')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Neuer Eintrag in todo' }))
    expect(await screen.findByText(/Speicherplatz erschöpft/)).toBeTruthy()
    // It is an action error: dismissable, and not mistaken for a failed query.
    fireEvent.click(screen.getByRole('button', { name: 'Schließen' }))
    expect(screen.queryByText(/Speicherplatz erschöpft/)).toBeNull()
  })

  it('clears the error when the next attempt starts', async () => {
    const saveFile = vi.fn().mockRejectedValueOnce(new Error('Netzwerk weg')).mockResolvedValue({ path: 'x', name: 'x', size: 0, etag: 'e' })
    render(<BasesView apiClient={makeApi(saveFile)} vaultId="v1" source={source} readOnly={false} onOpenNote={() => {}} onSaveSource={() => {}} />)
    await waitFor(() => expect(screen.getByText('Task A')).toBeTruthy())
    const add = () => fireEvent.click(screen.getByRole('button', { name: 'Neuer Eintrag in todo' }))
    add()
    expect(await screen.findByText(/Netzwerk weg/)).toBeTruthy()
    add()
    await waitFor(() => expect(saveFile).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByText(/Netzwerk weg/)).toBeNull())
  })

  it('writes a column value with special characters as quoted YAML', async () => {
    const special: BaseQueryResultWire = { rows: [{ path: 'a.md', fileName: 'Task A', values: { status: ['Phase: 2'] } }], total: 1 }
    const saveFile = vi.fn().mockResolvedValue({ path: 'x', name: 'x', size: 0, etag: 'e' })
    const api = makeApi(saveFile)
    vi.mocked(api.queryBase).mockResolvedValue(special)
    render(<BasesView apiClient={api} vaultId="v1" source={source} readOnly={false} onOpenNote={() => {}} onSaveSource={() => {}} />)
    await waitFor(() => expect(screen.getByText('Task A')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Neuer Eintrag in Phase: 2' }))
    await waitFor(() => expect(saveFile).toHaveBeenCalled())
    expect(saveFile.mock.calls[0]?.[2]).toContain('status: "Phase: 2"')
  })
})
