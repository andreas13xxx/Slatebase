import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, act } from '@testing-library/react'
import { CanvasView } from './CanvasView'
import { LONG_PRESS_MS } from '../../hooks/useLongPress'

const content = JSON.stringify({
  nodes: [
    { id: 'n1', type: 'text', text: 'eins', x: 0, y: 0, width: 200, height: 100 },
    { id: 'n2', type: 'text', text: 'zwei', x: 400, y: 0, width: 200, height: 100 },
  ],
  edges: [{ id: 'e1', fromNode: 'n1', fromSide: 'right', toNode: 'n2', toSide: 'left' }],
})

function renderCanvas() {
  return render(
    <CanvasView
      vaultId="v" filePath="a.canvas" content={content} readOnly={false}
      onSave={vi.fn().mockResolvedValue(undefined)} onFileOpen={vi.fn()} directoryTree={null}
    />,
  )
}

function hold(el: Element) {
  fireEvent.pointerDown(el, { pointerType: 'touch', isPrimary: true, clientX: 10, clientY: 10 })
  act(() => { vi.advanceTimersByTime(LONG_PRESS_MS) })
}

describe('CanvasView touch long-press', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('fires contextmenu on the pressed node so the node menu can resolve it', () => {
    const { container } = renderCanvas()
    const root = container.querySelector('.canvas-view') as HTMLElement
    const node = container.querySelector('[data-node-id="n1"]') as HTMLElement
    const seen = vi.fn()
    root.addEventListener('contextmenu', (e) => seen(e.target))
    hold(node)
    expect(seen).toHaveBeenCalledTimes(1)
    expect((seen.mock.calls[0]?.[0] as Element).closest('[data-node-id]')).toBe(node)
  })

  it('does not arm the canvas timer for presses on an edge', () => {
    const { container } = renderCanvas()
    const root = container.querySelector('.canvas-view') as HTMLElement
    const edge = container.querySelector('.canvas-edge-hit') as Element
    const seen = vi.fn()
    root.addEventListener('contextmenu', (e) => seen(e.target))
    hold(edge)
    // Only the edge's own event reaches the container, no second one from the canvas timer.
    expect(seen).toHaveBeenCalledTimes(1)
    expect(seen).toHaveBeenCalledWith(edge)
  })
})
