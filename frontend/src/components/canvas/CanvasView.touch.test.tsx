import { describe, it, expect, vi } from 'vitest'
import { render, fireEvent } from '@testing-library/react'
import { CanvasView } from './CanvasView'

const content = JSON.stringify({
  nodes: [{ id: 'n1', type: 'text', text: 'eins', x: 0, y: 0, width: 200, height: 100 }],
  edges: [],
})

function renderCanvas() {
  const utils = render(
    <CanvasView
      vaultId="v" filePath="a.canvas" content={content} readOnly={false}
      onSave={vi.fn().mockResolvedValue(undefined)} onFileOpen={vi.fn()} directoryTree={null}
    />,
  )
  const root = utils.container.querySelector('.canvas-view') as HTMLElement
  const layer = utils.container.querySelector('.canvas-view__transform-layer') as HTMLElement
  return { ...utils, root, layer }
}

/** Reads `scale(z) translate(xpx, ypx)` from the transform layer (some CSSOMs drop a zero y). */
function viewportOf(layer: HTMLElement): { zoom: number; x: number; y: number } {
  const m = /scale\(([-\d.e]+)\) translate\(([-\d.e]+)px(?:, ([-\d.e]+)px)?\)/.exec(layer.style.transform)
  if (!m) throw new Error(`unexpected transform: ${layer.style.transform}`)
  return { zoom: Number(m[1]), x: Number(m[2]), y: Number(m[3] ?? 0) }
}

const touch = (id: number, x: number, y: number) => ({ pointerType: 'touch', pointerId: id, isPrimary: id === 1, clientX: x, clientY: y })

describe('CanvasView touch gestures', () => {
  it('pans with one finger on the background', () => {
    const { root, layer } = renderCanvas()
    const before = viewportOf(layer)
    fireEvent.pointerDown(root, touch(1, 100, 100))
    fireEvent.pointerMove(root, touch(1, 140, 120))
    fireEvent.pointerUp(root, touch(1, 140, 120))
    const after = viewportOf(layer)
    expect(after.x - before.x).toBeCloseTo(40 / before.zoom)
    expect(after.y - before.y).toBeCloseTo(20 / before.zoom)
  })

  it('zooms in when two fingers move apart, within the wheel clamps', () => {
    const { root, layer } = renderCanvas()
    const before = viewportOf(layer)
    fireEvent.pointerDown(root, touch(1, 100, 100))
    fireEvent.pointerDown(root, touch(2, 200, 100))
    fireEvent.pointerMove(root, touch(2, 300, 100))
    expect(viewportOf(layer).zoom).toBeCloseTo(before.zoom * 2)
    fireEvent.pointerMove(root, touch(2, 100000, 100))
    expect(viewportOf(layer).zoom).toBe(4)
  })

  it('does not pan when the finger goes down on a node', () => {
    const { root, layer, container } = renderCanvas()
    const node = container.querySelector('[data-node-id="n1"]') as HTMLElement
    const before = viewportOf(layer)
    fireEvent.pointerDown(node, touch(1, 100, 50))
    fireEvent.pointerMove(root, touch(1, 180, 90))
    expect(viewportOf(layer)).toEqual(before)
  })

  it('still pans with the middle mouse button', () => {
    const { root, layer } = renderCanvas()
    const before = viewportOf(layer)
    fireEvent.pointerDown(root, { pointerType: 'mouse', pointerId: 1, button: 1, clientX: 50, clientY: 50 })
    fireEvent.pointerMove(root, { pointerType: 'mouse', pointerId: 1, clientX: 80, clientY: 50 })
    fireEvent.pointerUp(root, { pointerType: 'mouse', pointerId: 1, clientX: 80, clientY: 50 })
    expect(viewportOf(layer).x - before.x).toBeCloseTo(30 / before.zoom)
  })

  it('does not pan with the left mouse button', () => {
    const { root, layer } = renderCanvas()
    const before = viewportOf(layer)
    fireEvent.pointerDown(root, { pointerType: 'mouse', pointerId: 1, button: 0, clientX: 50, clientY: 50 })
    fireEvent.pointerMove(root, { pointerType: 'mouse', pointerId: 1, clientX: 80, clientY: 50 })
    expect(viewportOf(layer)).toEqual(before)
  })

  it('zooms with the mouse wheel as before', () => {
    const { root, layer } = renderCanvas()
    const before = viewportOf(layer)
    fireEvent.wheel(root, { deltaY: -100 })
    expect(viewportOf(layer).zoom).toBeGreaterThan(before.zoom)
  })

  it('does not pan the viewport with a second finger while a node is being dragged', () => {
    const { root, layer, container } = renderCanvas()
    const node = container.querySelector('[data-node-id="n1"]') as HTMLElement
    const before = viewportOf(layer)
    fireEvent.pointerDown(node, touch(1, 100, 50))
    fireEvent.pointerDown(root, touch(2, 300, 300))
    fireEvent.pointerMove(root, touch(2, 360, 340))
    expect(viewportOf(layer)).toEqual(before)
  })

  it('pans again once the node finger is lifted', () => {
    const { root, layer, container } = renderCanvas()
    const node = container.querySelector('[data-node-id="n1"]') as HTMLElement
    fireEvent.pointerDown(node, touch(1, 100, 50))
    fireEvent.pointerUp(node, touch(1, 100, 50))
    const before = viewportOf(layer)
    fireEvent.pointerDown(root, touch(2, 300, 300))
    fireEvent.pointerMove(root, touch(2, 340, 300))
    expect(viewportOf(layer).x).not.toBe(before.x)
  })

  it('does not pan the canvas when space + left button goes down on a node', () => {
    const { root, layer, container } = renderCanvas()
    const node = container.querySelector('[data-node-id="n1"]') as HTMLElement
    fireEvent.keyDown(window, { key: ' ', code: 'Space' })
    const before = viewportOf(layer)
    fireEvent.pointerDown(node, { pointerType: 'mouse', pointerId: 1, button: 0, clientX: 50, clientY: 50 })
    fireEvent.pointerMove(root, { pointerType: 'mouse', pointerId: 1, clientX: 90, clientY: 50 })
    expect(viewportOf(layer)).toEqual(before)
  })
})
