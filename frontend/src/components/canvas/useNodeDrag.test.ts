import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import React from 'react'
import { useNodeDrag } from './useNodeDrag'
import { useCanvasContext, CanvasProvider } from '../../state/canvasContext'

function makeContent(nodes: Array<{ id: string; x: number; y: number }>) {
  return JSON.stringify({
    nodes: nodes.map((n) => ({ id: n.id, type: 'text', x: n.x, y: n.y, width: 100, height: 100, text: n.id })),
    edges: [],
  })
}

function useHarness(nodeId: string, readOnly: boolean) {
  const drag = useNodeDrag(nodeId, readOnly)
  const ctx = useCanvasContext()
  return { drag, ctx }
}

function renderHarness(nodeId: string, readOnly: boolean, content: string) {
  return renderHook(() => useHarness(nodeId, readOnly), {
    wrapper: ({ children }) =>
      React.createElement(CanvasProvider, { content, readOnly, onSave: vi.fn().mockResolvedValue(undefined) }, children),
  })
}

function fakeMouseDown(clientX: number, clientY: number): React.MouseEvent {
  return {
    button: 0,
    clientX,
    clientY,
    stopPropagation: () => {},
    preventDefault: () => {},
  } as unknown as React.MouseEvent
}

afterEach(() => {
  // useNodeDrag adds window listeners that are only removed on mouseup;
  // clear them between tests in case a test didn't reach mouseup.
  const dummyUp = new MouseEvent('mouseup')
  window.dispatchEvent(dummyUp)
})

describe('useNodeDrag', () => {
  it('moves the node by the mouse delta on drag', async () => {
    const { result } = renderHarness('n1', false, makeContent([{ id: 'n1', x: 0, y: 0 }]))
    await waitFor(() => expect(result.current.ctx.state.document).not.toBeNull())

    act(() => {
      result.current.drag.onDragStart(fakeMouseDown(100, 100))
    })
    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 110, clientY: 105 }))
    })
    act(() => {
      window.dispatchEvent(new MouseEvent('mouseup'))
    })

    const node = result.current.ctx.state.document!.nodes.find(n => n.id === 'n1')!
    expect(node.x).toBe(10)
    expect(node.y).toBe(5)
  })

  it('does not start a drag when readOnly is true', async () => {
    const { result } = renderHarness('n1', true, makeContent([{ id: 'n1', x: 0, y: 0 }]))
    await waitFor(() => expect(result.current.ctx.state.document).not.toBeNull())

    act(() => {
      result.current.drag.onDragStart(fakeMouseDown(100, 100))
    })
    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 200, clientY: 200 }))
    })

    const node = result.current.ctx.state.document!.nodes.find(n => n.id === 'n1')!
    expect(node.x).toBe(0)
    expect(node.y).toBe(0)
  })

  it('ignores non-primary mouse buttons', async () => {
    const { result } = renderHarness('n1', false, makeContent([{ id: 'n1', x: 0, y: 0 }]))
    await waitFor(() => expect(result.current.ctx.state.document).not.toBeNull())

    act(() => {
      result.current.drag.onDragStart({ ...fakeMouseDown(100, 100), button: 2 } as React.MouseEvent)
    })
    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 200, clientY: 200 }))
    })

    const node = result.current.ctx.state.document!.nodes.find(n => n.id === 'n1')!
    expect(node.x).toBe(0)
  })

  it('ignores tiny movements below the 2px drag threshold', async () => {
    const { result } = renderHarness('n1', false, makeContent([{ id: 'n1', x: 0, y: 0 }]))
    await waitFor(() => expect(result.current.ctx.state.document).not.toBeNull())

    act(() => {
      result.current.drag.onDragStart(fakeMouseDown(100, 100))
    })
    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 101, clientY: 101 }))
    })

    const node = result.current.ctx.state.document!.nodes.find(n => n.id === 'n1')!
    expect(node.x).toBe(0)
    expect(node.y).toBe(0)
  })

  it('moves all selected nodes together in a multi-drag', async () => {
    const content = makeContent([{ id: 'n1', x: 0, y: 0 }, { id: 'n2', x: 50, y: 50 }])
    const { result } = renderHarness('n1', false, content)
    await waitFor(() => expect(result.current.ctx.state.document).not.toBeNull())

    act(() => {
      result.current.ctx.dispatch({ type: 'SELECT_NODES', payload: { nodeIds: ['n1', 'n2'] } })
    })
    act(() => {
      result.current.drag.onDragStart(fakeMouseDown(0, 0))
    })
    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 20 }))
    })

    const n1 = result.current.ctx.state.document!.nodes.find(n => n.id === 'n1')!
    const n2 = result.current.ctx.state.document!.nodes.find(n => n.id === 'n2')!
    expect(n1.x).toBe(20)
    expect(n1.y).toBe(20)
    expect(n2.x).toBe(70)
    expect(n2.y).toBe(70)
  })

  it('removes the window listeners on mouseup', async () => {
    const { result } = renderHarness('n1', false, makeContent([{ id: 'n1', x: 0, y: 0 }]))
    await waitFor(() => expect(result.current.ctx.state.document).not.toBeNull())

    act(() => {
      result.current.drag.onDragStart(fakeMouseDown(0, 0))
    })
    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 20, clientY: 20 }))
      window.dispatchEvent(new MouseEvent('mouseup'))
    })
    // A further move after mouseup should not move the node any more.
    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove', { clientX: 500, clientY: 500 }))
    })

    const node = result.current.ctx.state.document!.nodes.find(n => n.id === 'n1')!
    expect(node.x).toBe(20)
    expect(node.y).toBe(20)
  })
})
