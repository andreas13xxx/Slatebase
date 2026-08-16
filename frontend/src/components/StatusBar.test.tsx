import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import { useEffect } from 'react'
import { EditorView } from '@codemirror/view'
import { EditorState } from '@codemirror/state'
import { AppProvider, useAppContext } from '../state'
import { setActiveEditorView } from '../editor/plugin-extensions'
import { addStatusBarItem, removeStatusBarItemsForPlugin, clearAllStatusBarItems } from '../plugins/compat/status-bar-registry'
import { useStatusBarItemVisibility, type BuiltinStatusBarItemId } from '../hooks/useStatusBarItemVisibility'
import { StatusBar } from './StatusBar'
import type { VaultInfo } from '../types'

/** Exposes a toggle button for a given item — useStatusBarItemVisibility is a
 * module-level singleton store, so tests must go through its own toggle()
 * (which notifies subscribers) rather than writing localStorage directly,
 * which a prior test's read may have already cached past. */
function ItemToggleHarness({ id }: { id: BuiltinStatusBarItemId }) {
  const { toggle } = useStatusBarItemVisibility(id)
  return <button onClick={toggle}>{`toggle-${id}`}</button>
}

/** Dispatches VAULTS_LOADED + VAULT_SELECTED on mount so tests can control vault state. */
function VaultSeeder({ vault }: { vault: VaultInfo }) {
  const { dispatch } = useAppContext()
  useEffect(() => {
    dispatch({ type: 'VAULTS_LOADED', payload: [vault] })
    dispatch({ type: 'VAULT_SELECTED', payload: vault.id })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}

function renderStatusBar(vault?: VaultInfo) {
  return render(
    <AppProvider>
      {vault && <VaultSeeder vault={vault} />}
      <StatusBar />
    </AppProvider>
  )
}

function createView(doc: string): EditorView {
  return new EditorView({ state: EditorState.create({ doc }), parent: document.body })
}

const testVault: VaultInfo = { id: 'vault1', name: 'My Vault' }

describe('StatusBar', () => {
  beforeEach(() => {
    localStorage.clear()
    setActiveEditorView(null)
    clearAllStatusBarItems()
  })

  afterEach(() => {
    setActiveEditorView(null)
    clearAllStatusBarItems()
  })

  it('hides the clock when its item toggle is off', () => {
    render(
      <AppProvider>
        <ItemToggleHarness id="clock" />
        <StatusBar />
      </AppProvider>
    )
    expect(document.querySelector('.status-bar__clock')).toBeInTheDocument()

    fireEvent.click(screen.getByText('toggle-clock'))
    expect(document.querySelector('.status-bar__clock')).not.toBeInTheDocument()

    // Restore — useStatusBarItemVisibility is a module-level singleton shared across tests.
    fireEvent.click(screen.getByText('toggle-clock'))
  })

  it('renders the clock by default', () => {
    renderStatusBar()
    expect(screen.getByLabelText('Statusleiste')).toBeInTheDocument()
    expect(document.querySelector('.status-bar__clock')).toBeInTheDocument()
  })

  it('shows the vault name when a vault is selected', () => {
    renderStatusBar(testVault)
    expect(screen.getByText('My Vault')).toBeInTheDocument()
  })

  it('does not show word stats or cursor position when no editor is active', () => {
    renderStatusBar()
    expect(document.querySelector('.status-bar__word-stats')).not.toBeInTheDocument()
    expect(document.querySelector('.status-bar__cursor-position')).not.toBeInTheDocument()
  })

  it('shows word stats and cursor position once an editor becomes active', async () => {
    vi.useFakeTimers()
    const view = createView('hello world')
    renderStatusBar()

    act(() => {
      setActiveEditorView(view)
      vi.advanceTimersByTime(300)
    })

    expect(document.querySelector('.status-bar__word-stats')).toBeInTheDocument()
    expect(document.querySelector('.status-bar__cursor-position')).toBeInTheDocument()

    view.destroy()
    vi.useRealTimers()
  })

  describe('plugin item diffing (Requirement 7)', () => {
    it('renders plugin items registered before mount', () => {
      const el = addStatusBarItem('pluginA')
      el.textContent = 'Plugin A'

      renderStatusBar()

      expect(screen.getByText('Plugin A')).toBeInTheDocument()
    })

    it('does not remove an existing plugin element when a second plugin registers', () => {
      const elA = addStatusBarItem('pluginA')
      elA.textContent = 'Plugin A'
      renderStatusBar()

      act(() => {
        const elB = addStatusBarItem('pluginB')
        elB.textContent = 'Plugin B'
      })

      // Same DOM node reference must still be attached — not torn out and rebuilt.
      expect(document.body.contains(elA)).toBe(true)
      expect(elA.isConnected).toBe(true)
      expect(screen.getByText('Plugin A')).toBe(elA)
      expect(screen.getByText('Plugin B')).toBeInTheDocument()
    })

    it('removes only the deregistered plugin element', () => {
      const elA = addStatusBarItem('pluginA')
      elA.textContent = 'Plugin A'
      const elB = addStatusBarItem('pluginB')
      elB.textContent = 'Plugin B'
      renderStatusBar()

      act(() => {
        removeStatusBarItemsForPlugin('pluginA')
      })

      expect(elA.isConnected).toBe(false)
      expect(elB.isConnected).toBe(true)
      expect(screen.getByText('Plugin B')).toBeInTheDocument()
    })

    it('reflects in-place mutations to a plugin element without remounting it', () => {
      const elA = addStatusBarItem('pluginA')
      elA.textContent = 'Initial'
      renderStatusBar()

      act(() => {
        elA.textContent = 'Updated'
      })

      expect(elA.isConnected).toBe(true)
      expect(screen.getByText('Updated')).toBe(elA)
    })
  })
})
