import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DropZone } from './DropZone'

/** Minimal DataTransfer stand-in — jsdom has no real one. */
function dataTransfer(types: string[], files: File[] = []) {
  return { types, files, dropEffect: 'none', effectAllowed: 'all' }
}

/** The drag-over frame is the `--active` modifier on the wrapper. */
function frame(container: HTMLElement) {
  return container.querySelector('.drop-zone--active')
}

const externalDrag = () => dataTransfer(['Files'], [new File(['x'], 'image.png', { type: 'image/png' })])
const internalDrag = () => dataTransfer(['application/x-slatebase-path'])

describe('DropZone', () => {
  it('shows the frame while OS files are dragged over and clears it on drop', async () => {
    const onDrop = vi.fn().mockResolvedValue(undefined)
    const { container } = render(
      <DropZone onDrop={onDrop} targetPath="Notes">
        <div>editor</div>
      </DropZone>,
    )
    const zone = container.querySelector('.drop-zone')!

    fireEvent.dragEnter(zone, { dataTransfer: externalDrag() })
    expect(frame(container)).not.toBeNull()

    fireEvent.drop(zone, { dataTransfer: externalDrag() })
    expect(frame(container)).toBeNull()
    expect(onDrop).toHaveBeenCalledTimes(1)
  })

  it('ignores internal drags (File Explorer nodes carry no files)', () => {
    const { container } = render(
      <DropZone onDrop={vi.fn()}>
        <div>editor</div>
      </DropZone>,
    )
    const zone = container.querySelector('.drop-zone')!

    fireEvent.dragEnter(zone, { dataTransfer: internalDrag() })
    expect(frame(container)).toBeNull()

    // The stray dragLeave must not push the counter negative — a following
    // external drag has to light the frame up again.
    fireEvent.dragLeave(zone, { dataTransfer: internalDrag() })
    fireEvent.dragEnter(zone, { dataTransfer: externalDrag() })
    expect(frame(container)).not.toBeNull()
  })

  it('clears the frame when an inner handler swallows the drop', () => {
    const onDrop = vi.fn().mockResolvedValue(undefined)
    const { container } = render(
      <DropZone onDrop={onDrop}>
        {/* eslint-disable-next-line jsx-a11y-x/no-static-element-interactions -- test fixture standing in for the editor's own drop handler */}
        <div data-testid="inner" onDrop={(e) => { e.preventDefault(); e.stopPropagation() }}>
          editor
        </div>
      </DropZone>,
    )
    const zone = container.querySelector('.drop-zone')!

    fireEvent.dragEnter(zone, { dataTransfer: externalDrag() })
    expect(frame(container)).not.toBeNull()

    fireEvent.drop(screen.getByTestId('inner'), { dataTransfer: externalDrag() })
    expect(onDrop).not.toHaveBeenCalled()
    expect(frame(container)).toBeNull()
  })

  it('clears the frame when the drag is cancelled', () => {
    const { container } = render(
      <DropZone onDrop={vi.fn()}>
        <div>editor</div>
      </DropZone>,
    )
    const zone = container.querySelector('.drop-zone')!

    fireEvent.dragEnter(zone, { dataTransfer: externalDrag() })
    expect(frame(container)).not.toBeNull()

    fireEvent.dragEnd(zone, { dataTransfer: externalDrag() })
    expect(frame(container)).toBeNull()
  })

  it('keeps the frame while dragging across nested children', () => {
    const { container } = render(
      <DropZone onDrop={vi.fn()}>
        <div data-testid="child">editor</div>
      </DropZone>,
    )
    const zone = container.querySelector('.drop-zone')!
    const child = screen.getByTestId('child')

    fireEvent.dragEnter(zone, { dataTransfer: externalDrag() })
    fireEvent.dragEnter(child, { dataTransfer: externalDrag() })
    fireEvent.dragLeave(zone, { dataTransfer: externalDrag() })
    expect(frame(container)).not.toBeNull()

    fireEvent.dragLeave(child, { dataTransfer: externalDrag() })
    expect(frame(container)).toBeNull()
  })
})
