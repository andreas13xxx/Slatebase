import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import React from 'react'
import { GraphView } from './GraphView'
import { AppContext, initialState } from '../state'
import { TabProvider } from '../state/tabContext'
import { resetGraphConfig } from './graph-config'
import type { IApiClient } from '../api'
import type { GraphData } from '../types'

const graph: GraphData = {
  nodes: [
    { id: 'A.md', type: 'file', path: 'A.md', label: 'A', exists: true },
    { id: 'B.md', type: 'file', path: 'B.md', label: 'B', exists: true },
  ],
  edges: [{ source: 'A.md', target: 'B.md', type: 'link' }],
}

function renderGraph() {
  const apiClient = {
    getGraph: vi.fn().mockResolvedValue(graph),
    getGraphMeta: vi.fn().mockResolvedValue({ tags: [], propertyKeys: [] }),
  } as unknown as IApiClient
  return render(
    React.createElement(
      AppContext.Provider,
      { value: { state: { ...initialState }, dispatch: vi.fn(), apiClient } },
      React.createElement(TabProvider, null, React.createElement(GraphView, { vaultId: 'v' })),
    ),
  )
}

function transform(svg: Element): string {
  return svg.querySelector('g[transform]')?.getAttribute('transform') ?? ''
}

function touch(pointerId: number, x: number, y: number) {
  return { pointerType: 'touch', pointerId, isPrimary: pointerId === 1, clientX: x, clientY: y, button: 0 }
}

describe('GraphView — touch', () => {
  beforeEach(() => resetGraphConfig())

  it('pans with one finger on the background', async () => {
    renderGraph()
    const svg = await screen.findByRole('img')
    await waitFor(() => expect(svg.querySelectorAll('[data-node-id]').length).toBe(2))
    expect(svg.style.touchAction).toBe('none')
    fireEvent.pointerDown(svg, touch(1, 100, 100))
    fireEvent.pointerMove(svg, touch(1, 140, 120))
    fireEvent.pointerUp(svg, touch(1, 140, 120))
    expect(transform(svg)).toContain('translate(40, 20)')
  })

  it('zooms with a two-finger pinch', async () => {
    renderGraph()
    const svg = await screen.findByRole('img')
    await waitFor(() => expect(svg.querySelectorAll('[data-node-id]').length).toBe(2))
    fireEvent.pointerDown(svg, touch(1, 100, 100))
    fireEvent.pointerDown(svg, touch(2, 200, 100))
    fireEvent.pointerMove(svg, touch(2, 300, 100))
    expect(transform(svg)).toContain('scale(2)')
    fireEvent.pointerUp(svg, touch(2, 300, 100))
    fireEvent.pointerUp(svg, touch(1, 100, 100))
  })
})
