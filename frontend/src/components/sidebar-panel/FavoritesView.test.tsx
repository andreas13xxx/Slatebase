import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, createEvent, within } from '@testing-library/react'
import { AuthProvider } from '../../state/authContext'
import { AppProvider } from '../../state'
import { SearchProvider } from '../../state/searchContext'
import { createInitialState } from '../../state/panelState'
import { favoritesStore, add, addHeadingBookmark, addBlockBookmark, addSearchBookmark, addGroup, moveEntry, getForVault } from '../../state/favoritesStore'
import { FavoritesView } from './FavoritesView'

function renderView(props: Partial<Parameters<typeof FavoritesView>[0]> = {}) {
  const onOpenFile = vi.fn()
  const onOpenSearch = vi.fn()
  const panelState = createInitialState(['explorer', 'favorites', 'recent'])
  const panelDispatch = vi.fn()
  const utils = render(
    <AuthProvider>
      <AppProvider>
        <SearchProvider>
          <FavoritesView vaultId="vault1" onOpenFile={onOpenFile} onOpenSearch={onOpenSearch} panelState={panelState} panelDispatch={panelDispatch} {...props} />
        </SearchProvider>
      </AppProvider>
    </AuthProvider>
  )
  return { ...utils, onOpenFile, onOpenSearch, panelState, panelDispatch }
}

describe('FavoritesView', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('shows the empty state when no vault is selected', () => {
    renderView({ vaultId: null })
    expect(screen.getByText('Kein Vault ausgewählt')).toBeInTheDocument()
  })

  it('shows the empty state when the vault has no favorites', () => {
    renderView()
    expect(screen.getByText('Keine Favoriten in diesem Vault')).toBeInTheDocument()
  })

  it('renders a file bookmark and opens it on click', () => {
    add('vault1', 'notes/a.md')
    const { onOpenFile } = renderView()

    fireEvent.click(screen.getByText('a'))
    expect(onOpenFile).toHaveBeenCalledWith('vault1', 'notes/a.md')
  })

  it('renders a heading bookmark with file › heading text', () => {
    addHeadingBookmark('vault1', 'notes/a.md', 'Introduction')
    renderView()

    expect(screen.getByText('a › Introduction')).toBeInTheDocument()
  })

  it('opens the underlying file when clicking a block bookmark', () => {
    addBlockBookmark('vault1', 'notes/a.md', 'blk1')
    const { onOpenFile } = renderView()

    fireEvent.click(screen.getByText('a › ^blk1'))
    expect(onOpenFile).toHaveBeenCalledWith('vault1', 'notes/a.md')
  })

  it('invokes onOpenSearch (not onOpenFile) for a search bookmark', () => {
    addSearchBookmark('vault1', 'TODO', true, false)
    const { onOpenFile, onOpenSearch } = renderView()

    fireEvent.click(screen.getByText('TODO'))
    expect(onOpenSearch).toHaveBeenCalledWith({ query: 'TODO', caseSensitive: true, regex: false })
    expect(onOpenFile).not.toHaveBeenCalled()
  })

  it('without an onOpenSearch override, dispatches the shared open-search event and runs the query', () => {
    addSearchBookmark('vault1', 'TODO', true, false)
    const handler = vi.fn()
    window.addEventListener('slatebase:open-search', handler)
    const searchVault = vi.fn().mockResolvedValue({ results: [], totalHits: 0, truncated: false, truncationMessage: null })
    const mockApiClient = { searchVault } as unknown as Parameters<typeof AppProvider>[0]['apiClient']

    render(
      <AuthProvider>
        <AppProvider apiClient={mockApiClient}>
          <SearchProvider>
            <FavoritesView
              vaultId="vault1"
              onOpenFile={vi.fn()}
              panelState={createInitialState(['explorer', 'favorites', 'recent'])}
              panelDispatch={vi.fn()}
            />
          </SearchProvider>
        </AppProvider>
      </AuthProvider>
    )

    fireEvent.click(screen.getByText('TODO'))

    expect(handler).toHaveBeenCalled()
    expect(searchVault).toHaveBeenCalledWith('vault1', expect.objectContaining({ query: 'TODO', caseSensitive: 'true', regex: 'false' }))
    window.removeEventListener('slatebase:open-search', handler)
  })

  describe('context menu', () => {
    it('opens on right-click and offers remove/reveal/rename for a file bookmark', () => {
      add('vault1', 'notes/a.md')
      renderView()

      fireEvent.contextMenu(screen.getByText('a'))

      expect(screen.getByText('Aus Favoriten entfernen')).toBeInTheDocument()
      expect(screen.getByText('Im Datei-Explorer anzeigen')).toBeInTheDocument()
      expect(screen.getByText('Umbenennen')).toBeInTheDocument()
    })

    it('omits "Im Datei-Explorer anzeigen" for a search bookmark', () => {
      addSearchBookmark('vault1', 'TODO', false, false)
      renderView()

      fireEvent.contextMenu(screen.getByText('TODO'))

      expect(screen.queryByText('Im Datei-Explorer anzeigen')).not.toBeInTheDocument()
      expect(screen.getByText('Aus Favoriten entfernen')).toBeInTheDocument()
    })

    it('removes the entry when "Aus Favoriten entfernen" is selected', () => {
      add('vault1', 'notes/a.md')
      renderView()

      fireEvent.contextMenu(screen.getByText('a'))
      fireEvent.click(screen.getByText('Aus Favoriten entfernen'))

      expect(getForVault('vault1')).toHaveLength(0)
    })

    it('opens the rename editor when "Umbenennen" is selected', () => {
      add('vault1', 'notes/a.md')
      renderView()

      fireEvent.contextMenu(screen.getByText('a'))
      fireEvent.click(screen.getByText('Umbenennen'))

      expect(screen.getByDisplayValue('a')).toBeInTheDocument()
    })

    it('closes the menu without action on Escape', () => {
      add('vault1', 'notes/a.md')
      renderView()

      fireEvent.contextMenu(screen.getByText('a'))
      fireEvent.keyDown(document, { key: 'Escape' })

      expect(screen.queryByText('Aus Favoriten entfernen')).not.toBeInTheDocument()
      expect(getForVault('vault1')).toHaveLength(1)
    })
  })

  describe('rename', () => {
    it('sets a custom label and displays it instead of the filename', () => {
      add('vault1', 'notes/a.md')
      renderView()

      fireEvent.contextMenu(screen.getByText('a'))
      fireEvent.click(screen.getByText('Umbenennen'))
      const input = screen.getByDisplayValue('a')
      fireEvent.change(input, { target: { value: 'My Important Note' } })
      fireEvent.keyDown(input, { key: 'Enter' })

      expect(screen.getByText('My Important Note')).toBeInTheDocument()
      expect(getForVault('vault1')[0]!.label).toBe('My Important Note')
    })

    it('clears the label when reset to the original filename', () => {
      add('vault1', 'notes/a.md')
      favoritesStore.setLabel('vault1', getForVault('vault1')[0]!.id, 'Custom')
      renderView()

      fireEvent.contextMenu(screen.getByText('Custom'))
      fireEvent.click(screen.getByText('Umbenennen'))
      const input = screen.getByDisplayValue('Custom')
      fireEvent.change(input, { target: { value: 'a' } })
      fireEvent.keyDown(input, { key: 'Enter' })

      expect(screen.getByText('a')).toBeInTheDocument()
      expect(getForVault('vault1')[0]!.label).toBeUndefined()
    })

    it('cancels without change on Escape', () => {
      add('vault1', 'notes/a.md')
      renderView()

      fireEvent.contextMenu(screen.getByText('a'))
      fireEvent.click(screen.getByText('Umbenennen'))
      fireEvent.keyDown(screen.getByDisplayValue('a'), { key: 'Escape' })

      expect(screen.getByText('a')).toBeInTheDocument()
      expect(getForVault('vault1')[0]!.label).toBeUndefined()
    })
  })

  describe('drag-and-drop reorder', () => {
    it('moves an entry to a new position on drop', () => {
      add('vault1', 'a')
      add('vault1', 'b.md')
      add('vault1', 'c.md')
      renderView()

      const items = screen.getAllByRole('listitem')
      const dataTransfer = { effectAllowed: '', dropEffect: '', setData: vi.fn(), getData: vi.fn() }

      fireEvent.dragStart(within(items[0]!).getByText('a'), { dataTransfer })
      fireEvent.dragOver(items[2]!, { dataTransfer })
      fireEvent.drop(items[2]!, { dataTransfer })

      expect(getForVault('vault1').map((e) => e.path)).toEqual(['b.md', 'c.md', 'a'])
    })
  })
  describe('groups', () => {
    const idOf = (path: string) => getForVault('vault1').find((e) => e.path === path)!.id
    const dataTransfer = () => ({ effectAllowed: '', dropEffect: '', setData: vi.fn(), getData: vi.fn() })
    /** jsdom has no DragEvent, so the pointer position is put on the event by hand. */
    const dragAt = (type: 'dragOver' | 'drop', el: Element, dt: ReturnType<typeof dataTransfer>, clientY: number) => {
      const event = createEvent[type](el, { dataTransfer: dt })
      Object.defineProperty(event, 'clientY', { value: clientY })
      fireEvent(el, event)
    }

    it('shows the group toolbar button even without bookmarks, and creates a group in rename mode', () => {
      renderView()

      fireEvent.click(screen.getByRole('button', { name: 'Neue Gruppe' }))

      expect(getForVault('vault1')).toMatchObject([{ type: 'group', label: 'Neue Gruppe' }])
      expect(screen.getByDisplayValue('Neue Gruppe')).toBeInTheDocument()
    })

    it('shows the entries of a group indented under it, and folds them on click', () => {
      const g = addGroup('vault1', 'Work')!
      add('vault1', 'in.md')
      moveEntry('vault1', idOf('in.md'), g)
      add('vault1', 'out.md')
      renderView()

      expect(screen.getByText('in')).toBeInTheDocument()
      const groupButton = screen.getByText('Work').closest('button')!
      expect(groupButton).toHaveAttribute('aria-expanded', 'true')

      fireEvent.click(groupButton)

      expect(screen.queryByText('in')).not.toBeInTheDocument()
      expect(screen.getByText('out')).toBeInTheDocument()
      expect(groupButton).toHaveAttribute('aria-expanded', 'false')
      fireEvent.click(groupButton)
      expect(screen.getByText('in')).toBeInTheDocument()
    })

    it('does not open anything when a group is clicked', () => {
      addGroup('vault1', 'Work')
      const { onOpenFile } = renderView()
      fireEvent.click(screen.getByText('Work'))
      expect(onOpenFile).not.toHaveBeenCalled()
    })

    it('moves an entry into a group from its context menu, and back out', () => {
      addGroup('vault1', 'Work')
      add('vault1', 'a.md')
      renderView()

      fireEvent.contextMenu(screen.getByText('a'))
      fireEvent.click(screen.getByText('Verschieben nach „Work“'))
      expect(getForVault('vault1').find((e) => e.path === 'a.md')?.parentId).toBe(getForVault('vault1')[0]!.id)

      fireEvent.contextMenu(screen.getByText('a'))
      expect(screen.queryByText('Verschieben nach „Work“')).not.toBeInTheDocument()
      fireEvent.click(screen.getByText('Aus Gruppe herausnehmen'))
      expect(getForVault('vault1').find((e) => e.path === 'a.md')?.parentId).toBeUndefined()
    })

    it('offers a group no move into itself or into its own content', () => {
      const outer = addGroup('vault1', 'Outer')!
      addGroup('vault1', 'Inner', outer)
      addGroup('vault1', 'Other')
      renderView()

      fireEvent.contextMenu(screen.getByText('Outer'))

      expect(screen.getByText('Verschieben nach „Other“')).toBeInTheDocument()
      expect(screen.queryByText('Verschieben nach „Inner“')).not.toBeInTheDocument()
      expect(screen.queryByText('Verschieben nach „Outer“')).not.toBeInTheDocument()
    })

    it('creates a subgroup from the context menu of a group', () => {
      addGroup('vault1', 'Work')
      renderView()

      fireEvent.contextMenu(screen.getByText('Work'))
      fireEvent.click(screen.getByText('Neue Untergruppe'))

      const [work, sub] = getForVault('vault1')
      expect(sub).toMatchObject({ type: 'group', parentId: work!.id })
    })

    it('moves a dragged entry into a group when dropped on the lower part of it', () => {
      addGroup('vault1', 'Work')
      add('vault1', 'a.md')
      renderView()
      const items = screen.getAllByRole('listitem')
      const dt = dataTransfer()
      items[0]!.getBoundingClientRect = () => ({ top: 0, height: 20, bottom: 20, left: 0, right: 100, width: 100, x: 0, y: 0, toJSON: () => ({}) })

      fireEvent.dragStart(within(items[1]!).getByText('a'), { dataTransfer: dt })
      dragAt('dragOver', items[0]!, dt, 15)
      dragAt('drop', items[0]!, dt, 15)

      expect(getForVault('vault1').find((e) => e.path === 'a.md')?.parentId).toBe(getForVault('vault1')[0]!.id)
    })

    it('puts a dragged entry before a group when dropped on the upper part of it', () => {
      const g = addGroup('vault1', 'Work')!
      add('vault1', 'a.md')
      moveEntry('vault1', idOf('a.md'), g)
      add('vault1', 'b.md')
      renderView()
      const items = screen.getAllByRole('listitem') // Work, a (inside), b
      const dt = dataTransfer()
      items[0]!.getBoundingClientRect = () => ({ top: 0, height: 20, bottom: 20, left: 0, right: 100, width: 100, x: 0, y: 0, toJSON: () => ({}) })

      fireEvent.dragStart(within(items[2]!).getByText('b'), { dataTransfer: dt })
      dragAt('dragOver', items[0]!, dt, 2)
      dragAt('drop', items[0]!, dt, 2)

      expect(getForVault('vault1').filter((e) => e.parentId === undefined).map((e) => e.path || e.label)).toEqual(['b.md', 'Work'])
    })

    it('deletes an empty group at once, and asks before deleting one with content', () => {
      const empty = addGroup('vault1', 'Empty')!
      const full = addGroup('vault1', 'Full')!
      add('vault1', 'a.md')
      moveEntry('vault1', idOf('a.md'), full)
      renderView()

      fireEvent.contextMenu(screen.getByText('Empty'))
      fireEvent.click(screen.getByText('Gruppe löschen'))
      expect(getForVault('vault1').some((e) => e.id === empty)).toBe(false)

      fireEvent.contextMenu(screen.getByText('Full'))
      fireEvent.click(screen.getByText('Gruppe löschen'))
      expect(getForVault('vault1').some((e) => e.id === full)).toBe(true) // asks first
      expect(screen.getByText(/enthält Lesezeichen/)).toBeInTheDocument()

      fireEvent.click(screen.getByRole('button', { name: 'Löschen' }))
      expect(getForVault('vault1')).toHaveLength(0)
    })

    it('renames a group', () => {
      const g = addGroup('vault1', 'Old')!
      renderView()

      fireEvent.contextMenu(screen.getByText('Old'))
      fireEvent.click(screen.getByText('Umbenennen'))
      const input = screen.getByDisplayValue('Old')
      fireEvent.change(input, { target: { value: 'Renamed' } })
      fireEvent.keyDown(input, { key: 'Enter' })

      expect(getForVault('vault1').find((e) => e.id === g)?.label).toBe('Renamed')
    })
  })
})
