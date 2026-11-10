import { render, screen, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { installObsidianGlobals } from '../../plugins/compat/install-globals'
import { BasesView } from './BasesView'
import type { IApiClient } from '../../api'
import type { BaseQueryResultWire } from '@slatebase/shared-contracts'

installObsidianGlobals()

const result: BaseQueryResultWire = {
  rows: [
    { path: 'a.md', fileName: 'A', values: {} },
    { path: 'b.md', fileName: 'B', values: {} },
    { path: 'c.md', fileName: 'C', values: {} },
  ],
  total: 3,
}

function api(): IApiClient {
  return {
    queryBase: vi.fn().mockResolvedValue(result),
    getPropertyTypes: vi.fn().mockResolvedValue({ entries: [] }),
    fetchFileContent: vi.fn(),
    saveFile: vi.fn(),
  } as unknown as IApiClient
}

const source = (limit: boolean) => [
  'views:',
  '  - type: table',
  '    name: Tabelle',
  ...(limit ? ['    limit: 2'] : []),
  '    order: [file.name]',
].join('\n')

const mount = (src: string) =>
  render(<BasesView apiClient={api()} vaultId="v1" source={src} readOnly={false} onOpenNote={() => {}} onSaveSource={() => {}} />)

describe('BasesView limit hint (Obsidian 1.15)', () => {
  it('says how many of the matches are shown when the view limit hides some', async () => {
    mount(source(true))
    expect(await screen.findByText('Zeigt 2 von 3 (Limit der Ansicht)')).toBeTruthy()
  })

  it('shows no hint when the view has no limit', async () => {
    mount(source(false))
    await waitFor(() => expect(screen.getByText('C')).toBeTruthy())
    expect(screen.queryByText(/Zeigt .* von/)).toBeNull()
  })
})
