import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { SidebarToolbar } from './SidebarToolbar'
import {
  __resetToolbarStoreForTests,
  getToolbarPrefs,
  setToolbarOrder,
  setEntryHidden,
} from '../state/toolbarStore'
import type { RibbonIconEntry } from '../plugins/compat/ribbon-icon-registry'

// ─── Context mocks ───────────────────────────────────────────────────────────

const pluginRibbonCallback = vi.fn()
let ribbonIcons: RibbonIconEntry[] = []
let enabledFeatures = new Set<string>(['obsidian-plugin-compat'])

vi.mock('../state/featureContext', () => ({
  useFeatureContext: () => ({ isEnabled: (id: string) => enabledFeatures.has(id) }),
}))

vi.mock('../plugins/compat/plugin-context', () => ({
  usePluginContext: () => ({ ribbonIcons }),
}))

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeRibbonEntry(pluginId: string, title: string): RibbonIconEntry {
  return {
    pluginId,
    icon: 'dice',
    title,
    callback: pluginRibbonCallback,
    element: document.createElement('div'),
  }
}

function renderToolbar(props: Partial<React.ComponentProps<typeof SidebarToolbar>> = {}) {
  return render(
    <SidebarToolbar
      vaultId="vault-1"
      vaultPermission="owner"
      onCreateVault={vi.fn()}
      onCreateFile={vi.fn()}
      onCreateCanvas={vi.fn()}
      onImportFile={vi.fn()}
      onImportFolder={vi.fn()}
      onExportVault={vi.fn()}
      onNavigate={vi.fn()}
      onOpenGraph={vi.fn()}
      isAdmin={false}
      {...props}
    />
  )
}

/** Ids of the rendered buttons, in display order. */
function renderedLabels(): string[] {
  return within(screen.getByRole('toolbar')).getAllByRole('button').map((b) => b.getAttribute('aria-label') ?? '')
}

/**
 * Activates a context-menu entry. The clickable element is the `<button>`
 * inside the `role="menuitem"` list item, not the item itself.
 */
function clickMenuItem(name: string | RegExp, role: 'menuitem' | 'menuitemcheckbox' = 'menuitem') {
  const item = screen.getByRole(role, { name })
  const button = item.querySelector('button')
  if (!button) throw new Error(`Menu item "${String(name)}" has no button`)
  fireEvent.click(button)
}

/** Opens a context menu item's submenu (activating a submenu entry opens it). */
function openSubmenu(name: string | RegExp) {
  clickMenuItem(name)
}

beforeEach(() => {
  __resetToolbarStoreForTests()
  ribbonIcons = []
  enabledFeatures = new Set(['obsidian-plugin-compat'])
  pluginRibbonCallback.mockClear()
})

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('SidebarToolbar — built-in buttons', () => {
  it('renders the new palette / switcher / random-note / template buttons', () => {
    renderToolbar()
    expect(screen.getByLabelText(/Befehlspalette öffnen/)).toBeTruthy()
    expect(screen.getByLabelText(/Schnellwechsler öffnen/)).toBeTruthy()
    expect(screen.getByLabelText('Zufällige Notiz öffnen')).toBeTruthy()
    expect(screen.getByLabelText('Vorlage einfügen')).toBeTruthy()
    expect(screen.getByLabelText('Werkzeugleiste ausblenden')).toBeTruthy()
  })

  it('invokes the handler behind each new button', () => {
    const onOpenCommandPalette = vi.fn()
    const onOpenQuickSwitcher = vi.fn()
    const onOpenRandomNote = vi.fn()
    const onInsertTemplate = vi.fn()
    renderToolbar({ onOpenCommandPalette, onOpenQuickSwitcher, onOpenRandomNote, onInsertTemplate })

    fireEvent.click(screen.getByLabelText(/Befehlspalette öffnen/))
    fireEvent.click(screen.getByLabelText(/Schnellwechsler öffnen/))
    fireEvent.click(screen.getByLabelText('Zufällige Notiz öffnen'))
    fireEvent.click(screen.getByLabelText('Vorlage einfügen'))

    expect(onOpenCommandPalette).toHaveBeenCalledOnce()
    expect(onOpenQuickSwitcher).toHaveBeenCalledOnce()
    expect(onOpenRandomNote).toHaveBeenCalledOnce()
    expect(onInsertTemplate).toHaveBeenCalledOnce()
  })

  it('hides the whole toolbar from its own button', () => {
    renderToolbar()
    fireEvent.click(screen.getByLabelText('Werkzeugleiste ausblenden'))
    expect(getToolbarPrefs().visible).toBe(false)
  })

  it('marks vault-scoped buttons unavailable without a vault, without firing them', () => {
    const onOpenRandomNote = vi.fn()
    renderToolbar({ vaultId: null, onOpenRandomNote })
    const button = screen.getByLabelText('Zufällige Notiz öffnen')
    expect(button.getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(button)
    expect(onOpenRandomNote).not.toHaveBeenCalled()
    expect(screen.getByLabelText(/Befehlspalette öffnen/).getAttribute('aria-disabled')).toBeNull()
  })

  it('still offers the context menu on an unavailable button', () => {
    renderToolbar({ vaultId: null })
    fireEvent.contextMenu(screen.getByLabelText('Zufällige Notiz öffnen'))
    clickMenuItem('Ausblenden')
    expect(getToolbarPrefs().hidden).toContain('random-note')
  })

  it('applies the docking side as a class', () => {
    renderToolbar()
    expect(screen.getByRole('toolbar').className).toContain('app-toolbar--left')
  })
})

describe('SidebarToolbar — plugin ribbon icons', () => {
  it('renders a plugin ribbon icon as an ordinary toolbar button', () => {
    ribbonIcons = [makeRibbonEntry('my-plugin', 'Mein Plugin')]
    renderToolbar()
    const button = screen.getByLabelText('Mein Plugin')
    expect(button.className).toContain('toolbar-btn')
    // Obsidian's own ribbon class stays on it, for plugin stylesheets
    expect(button.className).toContain('side-dock-ribbon-action')
    fireEvent.click(button)
    expect(pluginRibbonCallback).toHaveBeenCalledOnce()
  })

  it('omits plugin ribbon icons when the compat feature is off', () => {
    ribbonIcons = [makeRibbonEntry('my-plugin', 'Mein Plugin')]
    enabledFeatures = new Set()
    renderToolbar()
    expect(screen.queryByLabelText('Mein Plugin')).toBeNull()
  })

  it('gives two icons with the same title from one plugin distinct ids', () => {
    ribbonIcons = [makeRibbonEntry('my-plugin', 'Aktion'), makeRibbonEntry('my-plugin', 'Aktion')]
    renderToolbar()
    expect(screen.getAllByLabelText('Aktion')).toHaveLength(2)
  })
})

describe('SidebarToolbar — button context menu', () => {
  it('hides the right-clicked button', () => {
    renderToolbar()
    fireEvent.contextMenu(screen.getByLabelText('Graph'))
    clickMenuItem('Ausblenden')

    expect(getToolbarPrefs().hidden).toContain('graph')
    expect(screen.queryByLabelText('Graph')).toBeNull()
  })

  it('moves the right-clicked button to the start', () => {
    renderToolbar()
    fireEvent.contextMenu(screen.getByLabelText('Graph'))
    clickMenuItem('An den Anfang verschieben')

    expect(renderedLabels()[0]).toBe('Graph')
    expect(getToolbarPrefs().order[0]).toBe('graph')
  })

  it('offers the same move actions for a plugin ribbon icon (parity)', () => {
    ribbonIcons = [makeRibbonEntry('my-plugin', 'Mein Plugin')]
    renderToolbar()
    fireEvent.contextMenu(screen.getByLabelText('Mein Plugin'))
    clickMenuItem('An den Anfang verschieben')

    expect(renderedLabels()[0]).toBe('Mein Plugin')
    expect(getToolbarPrefs().order[0]).toBe('plugin:my-plugin:Mein Plugin')
  })

  it('disables the move actions that would leave the list', () => {
    renderToolbar()
    const first = renderedLabels()[0]!
    fireEvent.contextMenu(screen.getByLabelText(first))
    expect(screen.getByRole('menuitem', { name: 'Nach vorn verschieben' }).getAttribute('aria-disabled')).toBe('true')
    expect(screen.getByRole('menuitem', { name: 'Nach hinten verschieben' }).getAttribute('aria-disabled')).toBeNull()
  })

  it('assigns a colour to the button', () => {
    renderToolbar()
    fireEvent.contextMenu(screen.getByLabelText('Graph'))
    openSubmenu('Farbe wählen')
    clickMenuItem('Rot', 'menuitemcheckbox')

    expect(getToolbarPrefs().colors.graph).toBe('#ef4444')
    expect(screen.getByLabelText('Graph').style.color).toBe('rgb(239, 68, 68)')
  })

  it('clears a colour again via "Standard"', () => {
    renderToolbar()
    fireEvent.contextMenu(screen.getByLabelText('Graph'))
    openSubmenu('Farbe wählen')
    clickMenuItem('Rot', 'menuitemcheckbox')

    fireEvent.contextMenu(screen.getByLabelText('Graph'))
    openSubmenu('Farbe wählen')
    clickMenuItem('Standard', 'menuitemcheckbox')

    expect(getToolbarPrefs().colors.graph).toBeUndefined()
  })
})

describe('SidebarToolbar — toolbar context menu', () => {
  it('lists every button, hidden ones included, with its state', () => {
    setEntryHidden('graph', true)
    renderToolbar()
    fireEvent.contextMenu(screen.getByRole('toolbar'))
    openSubmenu('Buttons')

    const graphItem = screen.getByRole('menuitemcheckbox', { name: 'Graph' })
    expect(graphItem.getAttribute('aria-checked')).toBe('false')
    expect(screen.getByRole('menuitemcheckbox', { name: 'Papierkorb' }).getAttribute('aria-checked')).toBe('true')
  })

  it('brings a hidden button back and stays open for the next toggle', () => {
    setEntryHidden('graph', true)
    renderToolbar()
    fireEvent.contextMenu(screen.getByRole('toolbar'))
    openSubmenu('Buttons')
    clickMenuItem('Graph', 'menuitemcheckbox')

    expect(getToolbarPrefs().hidden).not.toContain('graph')
    // keepOpen: the submenu is still there for the next button
    expect(screen.getByRole('menuitemcheckbox', { name: 'Papierkorb' })).toBeTruthy()
  })

  it('docks the toolbar to the right', () => {
    renderToolbar()
    fireEvent.contextMenu(screen.getByRole('toolbar'))
    openSubmenu('Position')
    clickMenuItem('Rechts vom Editor', 'menuitemcheckbox')

    expect(getToolbarPrefs().position).toBe('right')
    expect(screen.getByRole('toolbar').className).toContain('app-toolbar--right')
  })

  it('hides the whole toolbar', () => {
    renderToolbar()
    fireEvent.contextMenu(screen.getByRole('toolbar'))
    clickMenuItem('Werkzeugleiste ausblenden')
    expect(getToolbarPrefs().visible).toBe(false)
  })

  it('resets order, hidden entries and colours', () => {
    setToolbarOrder(['graph', 'trash'])
    setEntryHidden('trash', true)
    renderToolbar()
    fireEvent.contextMenu(screen.getByRole('toolbar'))
    clickMenuItem('Layout zurücksetzen')

    expect(getToolbarPrefs().order).toEqual([])
    expect(getToolbarPrefs().hidden).toEqual([])
  })
})

describe('SidebarToolbar — drag and drop', () => {
  it('reorders built-in buttons by dragging one onto another', () => {
    renderToolbar()
    const before = renderedLabels()
    const source = screen.getByLabelText('Graph')

    fireEvent.dragStart(source)
    fireEvent.dragEnter(screen.getByLabelText(before[0]!))
    fireEvent.dragEnd(source)

    expect(renderedLabels()[0]).toBe('Graph')
  })

  it('reorders a plugin ribbon icon by dragging it, exactly like a built-in', () => {
    ribbonIcons = [makeRibbonEntry('my-plugin', 'Mein Plugin')]
    renderToolbar()
    const before = renderedLabels()
    const source = screen.getByLabelText('Mein Plugin')

    fireEvent.dragStart(source)
    fireEvent.dragEnter(screen.getByLabelText(before[0]!))
    fireEvent.dragEnd(source)

    expect(renderedLabels()[0]).toBe('Mein Plugin')
    expect(getToolbarPrefs().order[0]).toBe('plugin:my-plugin:Mein Plugin')
  })

  it('does nothing when a button is dropped on itself', () => {
    renderToolbar()
    const before = renderedLabels()
    const source = screen.getByLabelText('Graph')

    fireEvent.dragStart(source)
    fireEvent.dragEnter(source)
    fireEvent.dragEnd(source)

    expect(renderedLabels()).toEqual(before)
    expect(getToolbarPrefs().order).toEqual([])
  })
})
