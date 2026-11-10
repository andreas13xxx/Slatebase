import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CommandPalette } from './CommandPalette'
import type { Command } from '../plugins/compat/command-registry'

function cmd(id: string, name: string): Command {
  return { id, name, callback: vi.fn(), pluginId: 'p' }
}

describe('CommandPalette — accent-insensitive search (Obsidian 1.15)', () => {
  it('finds "Café öffnen" when typing "cafe offnen"', async () => {
    const user = userEvent.setup()
    render(
      <CommandPalette
        commands={[cmd('p:a', 'Café öffnen'), cmd('p:b', 'Datei speichern')]}
        isOpen
        onClose={vi.fn()}
        onExecute={vi.fn()}
      />,
    )
    await user.type(screen.getByRole('combobox'), 'cafe offnen')
    expect(screen.getByText('Café öffnen')).toBeTruthy()
    expect(screen.queryByText('Datei speichern')).toBeNull()
  })
})
