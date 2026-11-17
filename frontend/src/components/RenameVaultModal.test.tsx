import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { RenameVaultModal } from './RenameVaultModal'

describe('RenameVaultModal', () => {
  it('submits the trimmed new name', () => {
    const onSubmit = vi.fn()
    render(<RenameVaultModal open currentName="Alt" onSubmit={onSubmit} onCancel={vi.fn()} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '  Neu  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }))
    expect(onSubmit).toHaveBeenCalledWith('Neu')
  })

  it('cancels without a request when the name is unchanged', () => {
    const onSubmit = vi.fn()
    const onCancel = vi.fn()
    render(<RenameVaultModal open currentName="Alt" onSubmit={onSubmit} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: 'Speichern' }))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(onCancel).toHaveBeenCalled()
  })

  it('shows a server error', () => {
    render(<RenameVaultModal open currentName="Alt" error="Name existiert" onSubmit={vi.fn()} onCancel={vi.fn()} />)
    expect(screen.getByRole('alert').textContent).toBe('Name existiert')
  })
})
