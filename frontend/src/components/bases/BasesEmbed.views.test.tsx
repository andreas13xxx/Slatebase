import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'
import { BasesEmbed, type IBasesEmbedApiClient } from './BasesEmbed'
import { embedViewKind } from './pickEmbedView'
import { dispatchRealtimeVaultChange } from '../../state/realtimeVaultBridge'

function client(rows: Array<{ path: string; fileName: string; values: Record<string, string[]> }> = []): IBasesEmbedApiClient {
  return {
    fetchFileContent: vi.fn(),
    queryBase: vi.fn().mockResolvedValue({ rows, total: rows.length }),
  }
}

describe('embedViewKind', () => {
  it('maps view types to renderers', () => {
    expect(embedViewKind({ type: 'table' })).toBe('table')
    expect(embedViewKind({ type: 'list' })).toBe('list')
    expect(embedViewKind({ type: 'cards' })).toBe('cards')
    expect(embedViewKind({ type: 'cards', groupBy: { property: 'status' } })).toBe('kanban')
    expect(embedViewKind({ type: 'kanban', groupBy: { property: 'status' } })).toBe('kanban')
    expect(embedViewKind({ type: 'map' })).toBe('table')
    expect(embedViewKind({ type: 'plugin-x' })).toBe('table')
  })
})

describe('BasesEmbed view types', () => {
  it('renders a list view as a list, not a table', async () => {
    const api = client([{ path: 'a.md', fileName: 'a', values: {} }])
    render(<BasesEmbed vaultId="v1" source={'views:\n  - type: list\n'} onOpenNote={vi.fn()} apiClient={api} />)
    expect(await screen.findByRole('list', { name: 'Listen-Ansicht' })).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('renders an ungrouped cards view as the card grid', async () => {
    const api = client([{ path: 'a.md', fileName: 'a', values: {} }])
    render(<BasesEmbed vaultId="v1" source={'views:\n  - type: cards\n'} onOpenNote={vi.fn()} apiClient={api} />)
    expect(await screen.findByRole('list', { name: 'Karten-Ansicht' })).toBeTruthy()
  })
})

describe('BasesEmbed live refresh', () => {
  it('re-queries on a vault change and keeps showing the old rows meanwhile', async () => {
    const api = client([{ path: 'a.md', fileName: 'a', values: {} }])
    const { container } = render(
      <BasesEmbed vaultId="v1" source={'views:\n  - type: list\n'} onOpenNote={vi.fn()} apiClient={api} />,
    )
    await screen.findByRole('list', { name: 'Listen-Ansicht' })
    expect(api.queryBase).toHaveBeenCalledTimes(1)

    ;(api.queryBase as ReturnType<typeof vi.fn>).mockResolvedValue({
      rows: [{ path: 'a.md', fileName: 'a', values: {} }, { path: 'b.md', fileName: 'b', values: {} }], total: 2,
    })
    act(() => { dispatchRealtimeVaultChange({ vaultId: 'v1' } as never) })

    expect(container.querySelector('.bases-embed--loading')).toBeNull()
    await waitFor(() => expect(api.queryBase).toHaveBeenCalledTimes(2))
    expect(await screen.findByText('b')).toBeTruthy()
  })

  it('ignores a change in another vault', async () => {
    const api = client([{ path: 'a.md', fileName: 'a', values: {} }])
    render(<BasesEmbed vaultId="v1" source={'views:\n  - type: list\n'} onOpenNote={vi.fn()} apiClient={api} />)
    await screen.findByRole('list', { name: 'Listen-Ansicht' })
    act(() => { dispatchRealtimeVaultChange({ vaultId: 'other' } as never) })
    await new Promise((r) => setTimeout(r, 50))
    expect(api.queryBase).toHaveBeenCalledTimes(1)
  })
})
