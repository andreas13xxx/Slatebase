import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NodeAnchors } from './NodeAnchors'
import { CanvasProvider, useCanvasContext } from '../../state/canvasContext'

function makeContent() {
  return JSON.stringify({
    nodes: [
      { id: 'n1', type: 'text', x: 0, y: 0, width: 100, height: 100, text: 'n1' },
      { id: 'n2', type: 'text', x: 300, y: 0, width: 100, height: 100, text: 'n2' },
    ],
    edges: [],
  })
}

function EdgeCount() {
  const { state } = useCanvasContext()
  return <span data-testid="edge-count">{state.document?.edges.length ?? -1}</span>
}

function Harness({ visible }: { visible: boolean }) {
  return (
    <CanvasProvider content={makeContent()} readOnly={false} onSave={vi.fn().mockResolvedValue(undefined)}>
      <div data-node-id="n2" style={{ position: 'absolute' }}>
        <span>drop target</span>
      </div>
      <NodeAnchors nodeId="n1" width={100} height={100} visible={visible} />
      <EdgeCount />
    </CanvasProvider>
  )
}

afterEach(() => {
  window.dispatchEvent(new MouseEvent('mouseup'))
})

describe('NodeAnchors', () => {
  it('renders nothing when not visible', () => {
    const { container } = render(<Harness visible={false} />)
    expect(container.querySelectorAll('.canvas-node__anchor')).toHaveLength(0)
  })

  it('renders all 4 anchors when visible', async () => {
    render(<Harness visible={true} />)
    await waitFor(() => expect(screen.getByTestId('edge-count')).toHaveTextContent('0'))
    expect(screen.getAllByRole('button', { name: /Verbindungsanker/ })).toHaveLength(4)
  })

  it('creates an edge when dragging from an anchor and dropping on another node', async () => {
    render(<Harness visible={true} />)
    await waitFor(() => expect(screen.getByTestId('edge-count')).toHaveTextContent('0'))

    const dropTarget = screen.getByText('drop target').closest('[data-node-id]') as HTMLElement
    vi.spyOn(dropTarget, 'getBoundingClientRect').mockReturnValue({
      left: 300, top: 0, width: 100, height: 100, right: 400, bottom: 100, x: 300, y: 0, toJSON: () => ({}),
    })

    const rightAnchor = screen.getByLabelText('Verbindungsanker right')
    await userEvent.pointer([
      { keys: '[MouseLeft>]', target: rightAnchor },
      { target: dropTarget, coords: { clientX: 310, clientY: 50 } },
      { keys: '[/MouseLeft]', target: dropTarget },
    ])

    await waitFor(() => expect(screen.getByTestId('edge-count')).toHaveTextContent('1'))
  })

  it('does not create an edge when dropping outside any node', async () => {
    render(<Harness visible={true} />)
    await waitFor(() => expect(screen.getByTestId('edge-count')).toHaveTextContent('0'))

    const topAnchor = screen.getByLabelText('Verbindungsanker top')
    await userEvent.pointer([
      { keys: '[MouseLeft>]', target: topAnchor },
      { keys: '[/MouseLeft]', target: document.body },
    ])

    expect(screen.getByTestId('edge-count')).toHaveTextContent('0')
  })
})
