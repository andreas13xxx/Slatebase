import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MoveTargetDialog } from './MoveTargetDialog'

function setup() {
  const onSelect = vi.fn()
  const onClose = vi.fn()
  render(
    <MoveTargetDialog
      itemName="note.md"
      vaultName="Vault"
      folders={['', 'work', 'work/archive', 'private']}
      currentFolder="work"
      onSelect={onSelect}
      onClose={onClose}
    />,
  )
  return { onSelect, onClose }
}

describe('MoveTargetDialog', () => {
  it('selects a folder with one tap', () => {
    const { onSelect } = setup()
    fireEvent.click(screen.getByRole('button', { name: /^archive/ }))
    expect(onSelect).toHaveBeenCalledWith('work/archive')
  })

  it('offers the vault root as ""', () => {
    const { onSelect } = setup()
    fireEvent.click(screen.getByRole('button', { name: /Vault-Stammordner|Vault root/ }))
    expect(onSelect).toHaveBeenCalledWith('')
  })

  it('disables the current folder', () => {
    setup()
    expect((screen.getByRole('button', { name: /work.*(aktueller Ort|current location)/ }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('shows the parent path of nested folders and finds the root by its label or vault name', () => {
    setup()
    expect(screen.getByRole('button', { name: /^archive\s*work$/ })).toBeTruthy() // parent hint
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'vault' } })
    expect(screen.getByRole('button', { name: /Vault-Stammordner|Vault root/ })).toBeTruthy()
  })

  it('filters by the search text and closes on overlay click', () => {
    const { onClose } = setup()
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'priv' } })
    expect(screen.queryByRole('button', { name: /^archive/ })).toBeNull()
    expect(screen.getByRole('button', { name: 'private' })).toBeTruthy()
    fireEvent.click(document.querySelector('.move-target-overlay') as HTMLElement)
    expect(onClose).toHaveBeenCalled()
  })
})
