import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { GraphSettingsPanel } from './GraphSettingsPanel'
import { DEFAULT_GRAPH_CONFIG } from './graph-config'
import type { GraphConfig } from './graph-config'
import type { GraphMeta } from '../types'

describe('GraphSettingsPanel', () => {
  const defaultProps = {
    config: DEFAULT_GRAPH_CONFIG,
    meta: null as GraphMeta | null,
    onConfigChange: vi.fn(),
    onReset: vi.fn(),
  }

  it('renders toggle button', () => {
    render(<GraphSettingsPanel {...defaultProps} />)
    const toggle = screen.getByRole('button', { name: /einstellungen/i })
    expect(toggle).toBeInTheDocument()
  })

  it('panel is closed by default, opens on toggle click', () => {
    render(<GraphSettingsPanel {...defaultProps} />)
    // Panel should not be visible
    expect(screen.queryByRole('region')).not.toBeInTheDocument()

    // Click toggle
    fireEvent.click(screen.getByRole('button', { name: /einstellungen/i }))

    // Panel should now be visible
    expect(screen.getByRole('region')).toBeInTheDocument()
  })

  it('panel closes when toggle is clicked again', () => {
    render(<GraphSettingsPanel {...defaultProps} />)
    const toggle = screen.getByRole('button', { name: /einstellungen/i })

    fireEvent.click(toggle) // open
    expect(screen.getByRole('region')).toBeInTheDocument()

    fireEvent.click(toggle) // close
    expect(screen.queryByRole('region')).not.toBeInTheDocument()
  })

  it('color picker change calls onConfigChange', () => {
    const onConfigChange = vi.fn()
    render(<GraphSettingsPanel {...defaultProps} onConfigChange={onConfigChange} />)

    // Open panel
    fireEvent.click(screen.getByRole('button', { name: /einstellungen/i }))

    // Find the first color input and change it
    const colorInputs = document.querySelectorAll('input[type="color"]')
    const firstColorInput = colorInputs[0] as HTMLInputElement
    fireEvent.change(firstColorInput, { target: { value: '#ff0000' } })

    expect(onConfigChange).toHaveBeenCalledTimes(1)
    const newConfig = onConfigChange.mock.calls[0]?.[0] as GraphConfig
    expect(newConfig.colors.fileNode).toBe('#ff0000')
  })

  it('slider change calls onConfigChange with correct value', () => {
    const onConfigChange = vi.fn()
    render(<GraphSettingsPanel {...defaultProps} onConfigChange={onConfigChange} />)

    // Open panel
    fireEvent.click(screen.getByRole('button', { name: /einstellungen/i }))

    // Find repulsion slider
    const slider = screen.getByRole('slider', { name: /abstoßung/i })
    fireEvent.change(slider, { target: { value: '100' } })

    expect(onConfigChange).toHaveBeenCalledTimes(1)
    const newConfig = onConfigChange.mock.calls[0]?.[0] as GraphConfig
    expect(newConfig.layout.repulsion).toBe(100)
  })

  it('toggle Tags checkbox calls onConfigChange', () => {
    const onConfigChange = vi.fn()
    render(<GraphSettingsPanel {...defaultProps} onConfigChange={onConfigChange} />)

    // Open panel
    fireEvent.click(screen.getByRole('button', { name: /einstellungen/i }))

    // Find tags checkbox
    const checkbox = screen.getByLabelText(/tags anzeigen/i)
    fireEvent.click(checkbox)

    expect(onConfigChange).toHaveBeenCalledTimes(1)
    const newConfig = onConfigChange.mock.calls[0]?.[0] as GraphConfig
    expect(newConfig.nodes.showTags).toBe(true)
  })

  it('reset button calls onReset', () => {
    const onReset = vi.fn()
    render(<GraphSettingsPanel {...defaultProps} onReset={onReset} />)

    // Open panel
    fireEvent.click(screen.getByRole('button', { name: /einstellungen/i }))

    // Click reset
    fireEvent.click(screen.getByText(/zurücksetzen/i))

    expect(onReset).toHaveBeenCalledTimes(1)
  })

  it('property keys from meta are shown as checkboxes when showProperties is true', () => {
    const meta: GraphMeta = {
      tags: [{ name: 'tag1', count: 5 }],
      propertyKeys: [
        { key: 'status', count: 10 },
        { key: 'priority', count: 3 },
      ],
    }
    const configWithProps: GraphConfig = {
      ...DEFAULT_GRAPH_CONFIG,
      nodes: { ...DEFAULT_GRAPH_CONFIG.nodes, showProperties: true },
    }
    render(<GraphSettingsPanel {...defaultProps} config={configWithProps} meta={meta} />)

    // Open panel
    fireEvent.click(screen.getByRole('button', { name: /einstellungen/i }))

    // Property keys should be listed
    expect(screen.getByText('status')).toBeInTheDocument()
    expect(screen.getByText('priority')).toBeInTheDocument()
    expect(screen.getByText('(10)')).toBeInTheDocument()
    expect(screen.getByText('(3)')).toBeInTheDocument()
  })

  it('property keys are hidden when showProperties is false', () => {
    const meta: GraphMeta = {
      tags: [],
      propertyKeys: [{ key: 'status', count: 10 }],
    }
    render(<GraphSettingsPanel {...defaultProps} meta={meta} />)

    // Open panel
    fireEvent.click(screen.getByRole('button', { name: /einstellungen/i }))

    // Property key should NOT be visible (showProperties is false by default)
    expect(screen.queryByText('status')).not.toBeInTheDocument()
  })
})
