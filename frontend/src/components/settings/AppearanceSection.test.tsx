import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AppProvider } from '../../state'
import { AppearanceSection } from './AppearanceSection'

/** SnippetManager (rendered inside AppearanceSection) needs AppContext; with no
 * vault selected in the default state it renders null, so no apiClient mock is needed. */
function renderSection() {
  return render(
    <AppProvider>
      <AppearanceSection />
    </AppProvider>
  )
}

describe('AppearanceSection', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('shows the global status bar toggle', () => {
    renderSection()
    expect(screen.getByLabelText('Statusleiste anzeigen')).toBeChecked()
  })

  it('shows one toggle per built-in status bar item when the status bar is visible', () => {
    renderSection()

    expect(screen.getByLabelText('Uhr')).toBeInTheDocument()
    expect(screen.getByLabelText('Vault-Name')).toBeInTheDocument()
    expect(screen.getByLabelText('Wort- und Zeichenanzahl')).toBeInTheDocument()
    expect(screen.getByLabelText('Cursor-Position')).toBeInTheDocument()
  })

  it('hides the per-item toggles when the global status bar toggle is off', () => {
    renderSection()

    const globalToggle = screen.getByLabelText('Statusleiste anzeigen')
    fireEvent.click(globalToggle)
    expect(screen.queryByLabelText('Wort- und Zeichenanzahl')).not.toBeInTheDocument()

    // Restore — useStatusBar is a module-level singleton shared across tests in this file.
    fireEvent.click(globalToggle)
  })

  it('toggling an item persists independently of the others', () => {
    renderSection()

    fireEvent.click(screen.getByLabelText('Wort- und Zeichenanzahl'))

    expect(screen.getByLabelText('Wort- und Zeichenanzahl')).not.toBeChecked()
    expect(screen.getByLabelText('Cursor-Position')).toBeChecked()
    expect(localStorage.getItem('slatebase:statusBarItem:wordStats')).toBe('false')
  })

  it('does not render the snippet manager list when no vault is selected', () => {
    renderSection()
    expect(screen.queryByText('Keine CSS-Snippets in diesem Vault.')).not.toBeInTheDocument()
  })
})
