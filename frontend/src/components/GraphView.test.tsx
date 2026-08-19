import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react'
import React from 'react'
import { GraphView } from './GraphView'
import { AppContext, initialState } from '../state'
import { TabProvider } from '../state/tabContext'
import { dispatchRealtimeVaultChange } from '../state/realtimeVaultBridge'
import { resetGraphConfig } from './graph-config'
import type { IApiClient } from '../api'
import type { GraphData } from '../types'
import type { AppState } from '../types'

function createMockApiClient(overrides: Partial<IApiClient> = {}): IApiClient {
  return {
    getGraph: vi.fn(),
    getGraphMeta: vi.fn().mockResolvedValue({ tags: [], propertyKeys: [] }),
    ...overrides,
  } as unknown as IApiClient
}

function renderGraphView(apiClient: IApiClient, props: { vaultId: string; localGraphCenterPath?: string }) {
  const state: AppState = { ...initialState }
  return render(
    React.createElement(
      AppContext.Provider,
      { value: { state, dispatch: vi.fn(), apiClient } },
      React.createElement(TabProvider, null, React.createElement(GraphView, props)),
    ),
  )
}

/** Chain graph: A - B - C - D, all under a vault whose id is "vault-1". */
const chainGraph: GraphData = {
  nodes: [
    { id: 'A.md', type: 'file', path: 'A.md', label: 'A', exists: true },
    { id: 'B.md', type: 'file', path: 'B.md', label: 'B', exists: true },
    { id: 'C.md', type: 'file', path: 'C.md', label: 'C', exists: true },
    { id: 'D.md', type: 'file', path: 'D.md', label: 'D', exists: true },
  ],
  edges: [
    { source: 'A.md', target: 'B.md', type: 'link' },
    { source: 'B.md', target: 'C.md', type: 'link' },
    { source: 'C.md', target: 'D.md', type: 'link' },
  ],
}

/** Waits until the graph SVG's aria-label reflects the given node/edge counts (post d3-force tick). */
async function expectAriaLabel(text: string) {
  await waitFor(() => {
    expect(screen.getByRole('img').getAttribute('aria-label')).toBe(text)
  })
}

describe('GraphView — Lokaler Graph', () => {
  beforeEach(() => {
    resetGraphConfig()
  })

  it('renders the full vault graph when localGraphCenterPath is not provided', async () => {
    const apiClient = createMockApiClient({ getGraph: vi.fn().mockResolvedValue(chainGraph) })
    renderGraphView(apiClient, { vaultId: 'vault-1' })

    await screen.findByRole('img')
    await expectAriaLabel('Graph mit 4 Knoten und 3 Kanten')
  })

  it('renders only the 1-hop neighborhood when centered on a note', async () => {
    const apiClient = createMockApiClient({ getGraph: vi.fn().mockResolvedValue(chainGraph) })
    renderGraphView(apiClient, { vaultId: 'vault-1', localGraphCenterPath: 'B.md' })

    await screen.findByRole('img')
    // B's 1-hop neighborhood is {A, B, C} with edges A-B, B-C.
    await expectAriaLabel('Graph mit 3 Knoten und 2 Kanten')
  })

  it('expands the neighborhood when the hop stepper is increased, without refetching', async () => {
    const getGraph = vi.fn().mockResolvedValue(chainGraph)
    const apiClient = createMockApiClient({ getGraph })
    renderGraphView(apiClient, { vaultId: 'vault-1', localGraphCenterPath: 'B.md' })

    await screen.findByRole('img')
    expect(getGraph).toHaveBeenCalledTimes(1)

    const increaseButton = screen.getByLabelText('Nachbarschaftsradius erhöhen')
    fireEvent.click(increaseButton)

    // 2-hop neighborhood of B in the A-B-C-D chain is everything.
    await expectAriaLabel('Graph mit 4 Knoten und 3 Kanten')
    // Still a pure client-side filter — no second fetch.
    expect(getGraph).toHaveBeenCalledTimes(1)
  })

  it('synthesizes a standalone center node when the note has no links', async () => {
    const apiClient = createMockApiClient({ getGraph: vi.fn().mockResolvedValue(chainGraph) })
    renderGraphView(apiClient, { vaultId: 'vault-1', localGraphCenterPath: 'Isolated.md' })

    await screen.findByRole('img')
    await expectAriaLabel('Graph mit 1 Knoten und 0 Kanten')
  })

  it('shows a dedicated, non-retryable error state when the center note is deleted', async () => {
    const apiClient = createMockApiClient({ getGraph: vi.fn().mockResolvedValue(chainGraph) })
    renderGraphView(apiClient, { vaultId: 'vault-1', localGraphCenterPath: 'B.md' })

    await screen.findByRole('img')

    act(() => {
      dispatchRealtimeVaultChange({ vaultId: 'vault-1', action: 'deleted', path: 'B.md', userId: 'u1', username: 'other' })
    })

    expect(await screen.findByRole('alert')).toHaveTextContent('Die Datei "B.md" wurde gelöscht.')
  })

  it('does not scope the graph for a vault-wide GraphView (no localGraphCenterPath)', async () => {
    const apiClient = createMockApiClient({ getGraph: vi.fn().mockResolvedValue(chainGraph) })
    renderGraphView(apiClient, { vaultId: 'vault-1' })

    await screen.findByRole('img')
    // The Nachbarschaftsradius toolbar only renders in local-graph mode.
    expect(screen.queryByLabelText('Nachbarschaftsradius erhöhen')).not.toBeInTheDocument()
  })
})
