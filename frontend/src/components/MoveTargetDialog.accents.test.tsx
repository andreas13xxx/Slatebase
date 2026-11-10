import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MoveTargetDialog } from './MoveTargetDialog'

describe('MoveTargetDialog — accent-insensitive filter (Obsidian 1.15)', () => {
  it('finds "Café Übersicht" when typing "cafe uber"', () => {
    render(
      <MoveTargetDialog
        itemName="note.md"
        vaultName="Vault"
        folders={['Café Übersicht', 'Archiv']}
        currentFolder=""
        onSelect={vi.fn()}
        onClose={vi.fn()}
      />,
    )
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'cafe uber' } })
    expect(screen.queryByRole('button', { name: /Café Übersicht/ })).not.toBeNull()
    expect(screen.queryByRole('button', { name: /Archiv/ })).toBeNull()
  })
})
