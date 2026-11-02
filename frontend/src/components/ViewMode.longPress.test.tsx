import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, fireEvent, act } from '@testing-library/react'
import { ViewMode } from './ViewMode'
import { AppContext } from '../state'
import type { AppContextValue } from '../state'
import { LONG_PRESS_MS } from '../hooks/useLongPress'

function renderView(content: string) {
  const ctx = { state: { vaults: [], vaultTrees: {}, selectedVaultId: null }, dispatch: vi.fn(), apiClient: {} } as unknown as AppContextValue
  return render(
    <AppContext.Provider value={ctx}>
      <ViewMode content={content} vaultId="v" directoryTree={null} />
    </AppContext.Provider>,
  )
}

function hold(el: Element) {
  fireEvent.pointerDown(el, { pointerType: 'touch', isPrimary: true, clientX: 4, clientY: 4 })
  act(() => { vi.advanceTimersByTime(LONG_PRESS_MS) })
}

describe('ViewMode touch long-press', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })

  it('opens the link menu when an external link is held', () => {
    const { container, queryByRole } = renderView('[site](https://example.com)')
    hold(container.querySelector('a.view-mode-link--external') as Element)
    expect(queryByRole('menu')).not.toBeNull()
  })

  it('leaves plain text to the native selection', () => {
    const { container, queryByRole } = renderView('just text')
    hold(container.querySelector('p') as Element)
    expect(queryByRole('menu')).toBeNull()
  })

  it('ignores links that belong to a nested ViewMode (embedded note)', () => {
    const { container, queryByRole } = renderView('text')
    const nested = document.createElement('div')
    nested.setAttribute('data-viewmode-id', 'inner')
    nested.innerHTML = '<a class="view-mode-link--external" href="https://example.com">e</a>'
    container.querySelector('article')?.appendChild(nested)
    hold(nested.querySelector('a') as Element)
    expect(queryByRole('menu')).toBeNull()
  })
})
