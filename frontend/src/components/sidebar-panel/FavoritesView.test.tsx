import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { AuthProvider } from '../../state/authContext'
import { AppProvider } from '../../state'
import { SearchProvider } from '../../state/searchContext'
import { createInitialState } from '../../state/panelState'
import { favoritesStore, add, addHeadingBookmark, addBlockBookmark, addSearchBookmark, getForVault } from '../../state/favoritesStore'
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
})
