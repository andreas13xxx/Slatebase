import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, waitFor, act } from '@testing-library/react'
import React from 'react'
import { useNodeResize } from './useNodeResize'
import { useCanvasContext, CanvasProvider } from '../../state/canvasContext'

/** A pointer event for window listeners (jsdom's PointerEvent support varies): a MouseEvent with a pointerId. */
function pointerEvt(type: string, init: MouseEventInit = {}): Event {
  return Object.assign(new MouseEvent(type, init), { pointerId: 1 })
}

function makeContent(x: number, y: number, width: number, height: number) {
  return JSON.stringify({
    nodes: [{ id: 'n1', type: 'text', x, y, width, height, text: 'n1' }],
    edges: [],
  })
}

function useHarness(nodeId: string, readOnly: boolean) {
  const resize = useNodeResize(nodeId, readOnly)
  const ctx = useCanvasContext()
  return { resize, ctx }
}

function renderHarness(readOnly: boolean, content: string) {
  return renderHook(() => useHarness('n1', readOnly), {
    wrapper: ({ children }) =>
      React.createElement(CanvasProvider, { content, readOnly, onSave: vi.fn().mockResolvedValue(undefined) }, children),
  })
}

function fakeMouseDown(clientX: number, clientY: number): React.PointerEvent {
  return { clientX, clientY, pointerId: 1,
    stopPropagation: () => {}, preventDefault: () => {} } as unknown as React.PointerEvent
}

afterEach(() => {
  window.dispatchEvent(pointerEvt('pointerup'))
})

describe('useNodeResize', () => {
  it('grows width when dragging the "e" handle right', async () => {
    const { result } = renderHarness(false, makeContent(0, 0, 200, 100))
    await waitFor(() => expect(result.current.ctx.state.document).not.toBeNull())

    act(() => { result.current.resize.onResizeStart(fakeMouseDown(0, 0), 'e') })
    act(() => { window.dispatchEvent(pointerEvt('pointermove', { clientX: 50, clientY: 0 })) })

    const node = result.current.ctx.state.document!.nodes[0]!
    expect(node.width).toBe(250)
    expect(node.x).toBe(0)
  })

  it('grows width and shifts x when dragging the "w" handle left', async () => {
    const { result } = renderHarness(false, makeContent(100, 0, 200, 100))
    await waitFor(() => expect(result.current.ctx.state.document).not.toBeNull())

    act(() => { result.current.resize.onResizeStart(fakeMouseDown(0, 0), 'w') })
    act(() => { window.dispatchEvent(pointerEvt('pointermove', { clientX: -50, clientY: 0 })) })

    const node = result.current.ctx.state.document!.nodes[0]!
    expect(node.width).toBe(250)
    expect(node.x).toBe(50)
  })

  it('enforces the minimum width when shrinking below MIN_WIDTH (100)', async () => {
    const { result } = renderHarness(false, makeContent(0, 0, 200, 100))
    await waitFor(() => expect(result.current.ctx.state.document).not.toBeNull())

    act(() => { result.current.resize.onResizeStart(fakeMouseDown(0, 0), 'e') })
    act(() => { window.dispatchEvent(pointerEvt('pointermove', { clientX: -500, clientY: 0 })) })

    const node = result.current.ctx.state.document!.nodes[0]!
    expect(node.width).toBe(100)
  })

  it('enforces the minimum height when shrinking below MIN_HEIGHT (60)', async () => {
    const { result } = renderHarness(false, makeContent(0, 0, 200, 100))
    await waitFor(() => expect(result.current.ctx.state.document).not.toBeNull())

    act(() => { result.current.resize.onResizeStart(fakeMouseDown(0, 0), 's') })
    act(() => { window.dispatchEvent(pointerEvt('pointermove', { clientX: 0, clientY: -500 })) })

    const node = result.current.ctx.state.document!.nodes[0]!
    expect(node.height).toBe(60)
  })

  it('resizes both dimensions from a corner handle ("se")', async () => {
    const { result } = renderHarness(false, makeContent(0, 0, 200, 100))
    await waitFor(() => expect(result.current.ctx.state.document).not.toBeNull())

    act(() => { result.current.resize.onResizeStart(fakeMouseDown(0, 0), 'se') })
    act(() => { window.dispatchEvent(pointerEvt('pointermove', { clientX: 30, clientY: 40 })) })

    const node = result.current.ctx.state.document!.nodes[0]!
    expect(node.width).toBe(230)
    expect(node.height).toBe(140)
  })

  it('does nothing when readOnly is true', async () => {
    const { result } = renderHarness(true, makeContent(0, 0, 200, 100))
    await waitFor(() => expect(result.current.ctx.state.document).not.toBeNull())

    act(() => { result.current.resize.onResizeStart(fakeMouseDown(0, 0), 'e') })
    act(() => { window.dispatchEvent(pointerEvt('pointermove', { clientX: 100, clientY: 0 })) })

    const node = result.current.ctx.state.document!.nodes[0]!
    expect(node.width).toBe(200)
  })
})
