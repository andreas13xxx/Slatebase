import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { LinkNodeRenderer } from './LinkNodeRenderer'
import { CanvasProvider } from '../../state/canvasContext'
import type { LinkNode } from '../../canvas/types'

function renderLink(url: string) {
  const node: LinkNode = { id: 'l1', type: 'link', x: 0, y: 0, width: 100, height: 60, url }
  render(
    <CanvasProvider content={JSON.stringify({ nodes: [node], edges: [] })} readOnly={false} onSave={vi.fn().mockResolvedValue(undefined)}>
      <LinkNodeRenderer node={node} selected={false} onSelect={vi.fn()} readOnly={false} />
    </CanvasProvider>
  )
  return screen.getByRole('button', { name: `Link: ${url}` })
}

describe('LinkNodeRenderer external opening', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it.each(['https://example.com', 'HTTP://example.com'])('opens %s on double-click and Enter', (url) => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    const node = renderLink(url)
    fireEvent.doubleClick(node)
    fireEvent.keyDown(node, { key: 'Enter' })
    expect(openSpy).toHaveBeenCalledTimes(2)
    expect(openSpy).toHaveBeenCalledWith(url, '_blank', 'noopener,noreferrer')
  })

  it.each(['javascript:alert(1)', 'JavaScript:alert(1)', 'data:text/html,x', 'vbscript:msgbox(1)'])(
    'does not open %s on double-click or Enter',
    (url) => {
      const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
      const node = renderLink(url)
      fireEvent.doubleClick(node)
      fireEvent.keyDown(node, { key: 'Enter' })
      expect(openSpy).not.toHaveBeenCalled()
    },
  )
})
