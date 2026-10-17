import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PaneTreeProvider } from '../state/paneTreeContext'
import { EditorHeaderRow } from './EditorHeaderRow'

vi.mock('../state/navigationHistoryContext', () => ({
  useNavigationHistory: () => ({ goBack: vi.fn(), goForward: vi.fn(), canGoBack: false, canGoForward: false }),
}))

function renderRow() {
  return render(
    <PaneTreeProvider>
      <EditorHeaderRow><span data-testid="crumb">pfad</span></EditorHeaderRow>
    </PaneTreeProvider>,
  )
}

describe('EditorHeaderRow', () => {
  it('shows back/forward, the breadcrumb slot and the menu button', () => {
    renderRow()
    expect(screen.getByLabelText('Zurück')).toBeTruthy()
    expect(screen.getByLabelText('Vor')).toBeTruthy()
    expect(screen.getByTestId('crumb')).toBeTruthy()
    expect(screen.getByRole('button', { name: /menü|menu/i })).toBeTruthy()
  })

  it('opens a menu with pane commands; focus/close are disabled with a single pane', () => {
    renderRow()
    fireEvent.click(screen.getByRole('button', { name: /menü|menu/i }))
    const items = screen.getAllByRole('menuitem')
    expect(items.length).toBe(8)
    const close = items.find((i) => /schließen|close pane/i.test(i.textContent ?? '') && !/andere|other/i.test(i.textContent ?? ''))
    expect(close?.getAttribute('aria-disabled') ?? close?.hasAttribute('disabled')).toBeTruthy()
  })
})
