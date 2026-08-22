import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { GroupNodeRenderer } from './GroupNodeRenderer'
import { CanvasProvider } from '../../state/canvasContext'
import type { GroupNode } from '../../canvas/types'

function makeGroup(overrides: Partial<GroupNode> = {}): GroupNode {
  return { id: 'g1', type: 'group', x: 0, y: 0, width: 200, height: 150, ...overrides }
}

function makeContent(node: GroupNode) {
  return JSON.stringify({ nodes: [node], edges: [] })
}

function renderGroup(node: GroupNode, props: { selected?: boolean; readOnly?: boolean; onSelect?: (a: boolean) => void } = {}) {
  const onSelect = props.onSelect ?? vi.fn()
  const { container } = render(
    <CanvasProvider content={makeContent(node)} readOnly={props.readOnly ?? false} onSave={vi.fn().mockResolvedValue(undefined)}>
      <GroupNodeRenderer node={node} selected={props.selected ?? false} onSelect={onSelect} readOnly={props.readOnly ?? false} />
    </CanvasProvider>
  )
  return { onSelect, container }
}

describe('GroupNodeRenderer', () => {
  it('renders the group label when set', () => {
    renderGroup(makeGroup({ label: 'My Group' }))
    expect(screen.getByText('My Group')).toBeInTheDocument()
    expect(screen.getByRole('group', { name: 'Gruppe: My Group' })).toBeInTheDocument()
  })

  it('falls back to a generic aria-label when there is no label', () => {
    renderGroup(makeGroup({ label: undefined }))
    expect(screen.getByRole('group', { name: 'Gruppe' })).toBeInTheDocument()
  })

  it('calls onSelect on mouse down', async () => {
    const { onSelect } = renderGroup(makeGroup())
    await userEvent.click(screen.getByRole('group'))
    expect(onSelect).toHaveBeenCalledWith(false)
  })

  it('calls onSelect with additive=true on shift-click', () => {
    const { onSelect } = renderGroup(makeGroup())
    fireEvent.mouseDown(screen.getByRole('group'), { button: 0, shiftKey: true })
    expect(onSelect).toHaveBeenCalledWith(true)
  })

  it('selects on Enter and Space key press', async () => {
    const { onSelect } = renderGroup(makeGroup())
    const el = screen.getByRole('group')
    el.focus()
    await userEvent.keyboard('{Enter}')
    await userEvent.keyboard(' ')
    expect(onSelect).toHaveBeenCalledTimes(2)
  })

  it('shows resize handles and anchors only when selected and not read-only', () => {
    const { container } = renderGroup(makeGroup(), { selected: true, readOnly: false })
    expect(container.querySelectorAll('.canvas-node__resize-handle').length).toBeGreaterThan(0)
    expect(container.querySelectorAll('.canvas-node__anchor').length).toBeGreaterThan(0)
  })

  it('hides resize handles and anchors when not selected', () => {
    const { container } = renderGroup(makeGroup(), { selected: false })
    expect(container.querySelectorAll('.canvas-node__resize-handle')).toHaveLength(0)
    expect(container.querySelectorAll('.canvas-node__anchor')).toHaveLength(0)
  })

  it('hides resize handles when read-only even if selected', () => {
    const { container } = renderGroup(makeGroup(), { selected: true, readOnly: true })
    expect(container.querySelectorAll('.canvas-node__resize-handle')).toHaveLength(0)
  })

  it('applies the color class derived from the node color', () => {
    const { container } = renderGroup(makeGroup({ color: '2' }))
    expect(container.querySelector('.canvas-node--group')).toHaveClass('canvas-color-2')
  })
})
