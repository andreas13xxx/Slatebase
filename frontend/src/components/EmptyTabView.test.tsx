import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { axe } from 'vitest-axe'
import { EmptyTabView } from './EmptyTabView'

function setup(recent: { vaultId: string; path: string; timestamp: string }[] = []) {
  const handlers = { onRunCommand: vi.fn(), onOpenFile: vi.fn(), onClose: vi.fn() }
  const view = render(<EmptyTabView recentFiles={recent} {...handlers} />)
  return { handlers, ...view }
}

describe('EmptyTabView', () => {
  it('runs the matching core command for each create/jump button', () => {
    const { handlers } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Neue Notiz erstellen' }))
    fireEvent.click(screen.getByRole('button', { name: 'Neues Canvas erstellen' }))
    fireEvent.click(screen.getByRole('button', { name: 'Neue Base erstellen' }))
    fireEvent.click(screen.getByRole('button', { name: 'Zu Datei springen' }))
    expect(handlers.onRunCommand.mock.calls.map(([id]) => id)).toEqual([
      'file-explorer:new-file',
      'canvas:new-file',
      'bases:new-file',
      'switcher:open',
    ])
  })

  it('closes the tab', () => {
    const { handlers } = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Schließen' }))
    expect(handlers.onClose).toHaveBeenCalledTimes(1)
  })

  it('lists recent files and opens one', () => {
    const { handlers } = setup([{ vaultId: 'v', path: 'Notes/a.md', timestamp: '2026-01-01T00:00:00Z' }])
    fireEvent.click(screen.getByRole('button', { name: 'Notes/a.md' }))
    expect(handlers.onOpenFile).toHaveBeenCalledWith('Notes/a.md')
  })

  it('hides the recent section when there is nothing recent', () => {
    setup()
    expect(screen.queryByText('Zuletzt geöffnet')).toBeNull()
  })

  it('has no accessibility violations', async () => {
    const { container } = setup([{ vaultId: 'v', path: 'a.md', timestamp: '2026-01-01T00:00:00Z' }])
    expect(await axe(container)).toHaveNoViolations()
  })
})
