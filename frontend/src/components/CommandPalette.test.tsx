import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CommandPalette } from './CommandPalette'
import type { Command } from '../plugins/compat/command-registry'

function createCommand(overrides: Partial<Command> = {}): Command {
  return {
    id: 'test-plugin:test-cmd',
    name: 'Test Command',
    callback: vi.fn(),
    pluginId: 'test-plugin',
    ...overrides,
  }
}

function createCommands(count: number): Command[] {
  return Array.from({ length: count }, (_, i) => createCommand({
    id: `plugin:cmd-${i}`,
    name: `Command ${i}`,
    pluginId: 'plugin',
  }))
}

describe('CommandPalette', () => {
  const defaultProps = {
    commands: [
      createCommand({ id: 'p1:open', name: 'Open File', pluginId: 'p1' }),
      createCommand({ id: 'p1:save', name: 'Save File', pluginId: 'p1' }),
      createCommand({ id: 'p2:search', name: 'Search Vault', pluginId: 'p2' }),
    ],
    isOpen: true,
    onClose: vi.fn(),
    onExecute: vi.fn(),
  }

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <CommandPalette {...defaultProps} isOpen={false} />
    )
    expect(container.firstChild).toBeNull()
  })

  it('renders modal overlay when isOpen is true', () => {
    render(<CommandPalette {...defaultProps} />)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true')
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-label', 'Command Palette')
  })

  it('shows all commands when no search query', () => {
    render(<CommandPalette {...defaultProps} />)
    expect(screen.getByText('Open File')).toBeInTheDocument()
    expect(screen.getByText('Save File')).toBeInTheDocument()
    expect(screen.getByText('Search Vault')).toBeInTheDocument()
  })

  it('filters commands by case-insensitive substring match on name', async () => {
    const user = userEvent.setup()
    render(<CommandPalette {...defaultProps} />)

    const input = screen.getByRole('combobox')
    await user.type(input, 'save')

    expect(screen.getByText('Save File')).toBeInTheDocument()
    expect(screen.queryByText('Open File')).not.toBeInTheDocument()
    expect(screen.queryByText('Search Vault')).not.toBeInTheDocument()
  })

  it('filtering is case-insensitive', async () => {
    const user = userEvent.setup()
    render(<CommandPalette {...defaultProps} />)

    const input = screen.getByRole('combobox')
    await user.type(input, 'SEARCH')

    expect(screen.getByText('Search Vault')).toBeInTheDocument()
    expect(screen.queryByText('Open File')).not.toBeInTheDocument()
  })

  it('limits results to 50 items', () => {
    const manyCommands = createCommands(60)
    render(<CommandPalette {...defaultProps} commands={manyCommands} />)

    const items = screen.getAllByRole('option')
    expect(items.length).toBe(50)
  })

  it('shows empty state when no commands match', async () => {
    const user = userEvent.setup()
    render(<CommandPalette {...defaultProps} />)

    const input = screen.getByRole('combobox')
    await user.type(input, 'zzz-nonexistent')

    expect(screen.getByText('Keine Befehle gefunden')).toBeInTheDocument()
  })

  it('displays pluginId for each command', () => {
    render(<CommandPalette {...defaultProps} />)
    const pluginLabels = screen.getAllByText('p1')
    expect(pluginLabels.length).toBe(2) // Two commands from p1
    expect(screen.getByText('p2')).toBeInTheDocument()
  })

  describe('keyboard navigation', () => {
    it('selects first item by default', () => {
      render(<CommandPalette {...defaultProps} />)
      const items = screen.getAllByRole('option')
      expect(items[0]).toHaveAttribute('aria-selected', 'true')
    })

    it('moves selection down with ArrowDown', () => {
      render(<CommandPalette {...defaultProps} />)
      const input = screen.getByRole('combobox')

      fireEvent.keyDown(input, { key: 'ArrowDown' })
      const items = screen.getAllByRole('option')
      expect(items[1]).toHaveAttribute('aria-selected', 'true')
    })

    it('moves selection up with ArrowUp', () => {
      render(<CommandPalette {...defaultProps} />)
      const input = screen.getByRole('combobox')

      fireEvent.keyDown(input, { key: 'ArrowDown' })
      fireEvent.keyDown(input, { key: 'ArrowUp' })
      const items = screen.getAllByRole('option')
      expect(items[0]).toHaveAttribute('aria-selected', 'true')
    })

    it('does not go below last item', () => {
      render(<CommandPalette {...defaultProps} />)
      const input = screen.getByRole('combobox')

      fireEvent.keyDown(input, { key: 'ArrowDown' })
      fireEvent.keyDown(input, { key: 'ArrowDown' })
      fireEvent.keyDown(input, { key: 'ArrowDown' })
      fireEvent.keyDown(input, { key: 'ArrowDown' }) // Extra - should stay at last

      const items = screen.getAllByRole('option')
      expect(items[2]).toHaveAttribute('aria-selected', 'true')
    })

    it('does not go above first item', () => {
      render(<CommandPalette {...defaultProps} />)
      const input = screen.getByRole('combobox')

      fireEvent.keyDown(input, { key: 'ArrowUp' }) // Should stay at first
      const items = screen.getAllByRole('option')
      expect(items[0]).toHaveAttribute('aria-selected', 'true')
    })

    it('executes selected command on Enter', () => {
      render(<CommandPalette {...defaultProps} />)
      const input = screen.getByRole('combobox')

      fireEvent.keyDown(input, { key: 'ArrowDown' }) // Select second item
      fireEvent.keyDown(input, { key: 'Enter' })

      expect(defaultProps.onExecute).toHaveBeenCalledWith('p1:save')
      expect(defaultProps.onClose).toHaveBeenCalled()
    })

    it('closes palette on Escape', () => {
      render(<CommandPalette {...defaultProps} />)
      const input = screen.getByRole('combobox')

      fireEvent.keyDown(input, { key: 'Escape' })
      expect(defaultProps.onClose).toHaveBeenCalled()
    })
  })

  describe('click interaction', () => {
    it('executes command on click and closes palette', async () => {
      const user = userEvent.setup()
      render(<CommandPalette {...defaultProps} />)

      await user.click(screen.getByText('Search Vault'))

      expect(defaultProps.onExecute).toHaveBeenCalledWith('p2:search')
      expect(defaultProps.onClose).toHaveBeenCalled()
    })

    it('closes palette when clicking overlay backdrop', async () => {
      const user = userEvent.setup()
      render(<CommandPalette {...defaultProps} />)

      const overlay = screen.getByRole('presentation')
      await user.click(overlay)

      expect(defaultProps.onClose).toHaveBeenCalled()
    })

    it('does not close when clicking inside the palette', async () => {
      const onClose = vi.fn()
      render(<CommandPalette {...defaultProps} onClose={onClose} />)

      const dialog = screen.getByRole('dialog')
      fireEvent.click(dialog)

      expect(onClose).not.toHaveBeenCalled()
    })
  })

  describe('exception handling', () => {
    it('catches callback exceptions and still closes palette', () => {
      const onExecute = vi.fn(() => { throw new Error('callback error') })
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})

      render(<CommandPalette {...defaultProps} onExecute={onExecute} />)
      const input = screen.getByRole('combobox')

      fireEvent.keyDown(input, { key: 'Enter' })

      expect(onExecute).toHaveBeenCalled()
      expect(defaultProps.onClose).toHaveBeenCalled()
      expect(consoleSpy).toHaveBeenCalled()

      consoleSpy.mockRestore()
    })
  })

  describe('accessibility', () => {
    it('has proper ARIA roles', () => {
      render(<CommandPalette {...defaultProps} />)

      expect(screen.getByRole('dialog')).toBeInTheDocument()
      expect(screen.getByRole('combobox')).toBeInTheDocument()
      expect(screen.getByRole('listbox')).toBeInTheDocument()
      expect(screen.getAllByRole('option').length).toBeGreaterThan(0)
    })

    it('sets aria-activedescendant on input', () => {
      render(<CommandPalette {...defaultProps} />)
      const input = screen.getByRole('combobox')
      expect(input).toHaveAttribute('aria-activedescendant', 'command-palette-item-0')
    })

    it('updates aria-activedescendant on keyboard navigation', () => {
      render(<CommandPalette {...defaultProps} />)
      const input = screen.getByRole('combobox')

      fireEvent.keyDown(input, { key: 'ArrowDown' })
      expect(input).toHaveAttribute('aria-activedescendant', 'command-palette-item-1')
    })

    it('has aria-expanded on combobox', () => {
      render(<CommandPalette {...defaultProps} />)
      const input = screen.getByRole('combobox')
      expect(input).toHaveAttribute('aria-expanded', 'true')
    })

    it('listbox has aria-label', () => {
      render(<CommandPalette {...defaultProps} />)
      const listbox = screen.getByRole('listbox')
      expect(listbox).toHaveAttribute('aria-label', 'Befehle')
    })
  })

  describe('state reset', () => {
    it('resets search query when palette reopens', () => {
      const { rerender } = render(<CommandPalette {...defaultProps} />)

      // Type something
      const input = screen.getByRole('combobox')
      fireEvent.change(input, { target: { value: 'test' } })

      // Close and reopen
      rerender(<CommandPalette {...defaultProps} isOpen={false} />)
      rerender(<CommandPalette {...defaultProps} isOpen={true} />)

      const newInput = screen.getByRole('combobox')
      expect(newInput).toHaveValue('')
    })
  })
})
