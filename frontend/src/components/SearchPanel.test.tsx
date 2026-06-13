import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import React from 'react'
import { SearchPanel } from './SearchPanel'
import { SearchContext, type SearchContextValue } from '../state/searchContext'
import { AppContext, type AppContextValue } from '../state'
import { initialSearchState, type SearchState, type SearchAction } from '../state/searchState'
import type { VaultInfo } from '../types'
import type { Dispatch } from 'react'

const mockApiClient = {
  searchVault: vi.fn().mockResolvedValue({ results: [], totalHits: 0, truncated: false, truncationMessage: null }),
  searchMultiVault: vi.fn().mockResolvedValue({ results: [], totalHits: 0, truncated: false, truncationMessage: null }),
  replaceInVault: vi.fn().mockResolvedValue({ totalReplacements: 0, fileCount: 0, files: [], failed: [] }),
} as unknown as AppContextValue['apiClient']

const mockAppContextValue: AppContextValue = {
  state: { vaults: [], selectedVaultId: null, directoryTree: null, vaultTrees: {}, vaultTreesLoading: new Set(), loading: false, error: null },
  dispatch: vi.fn(),
  apiClient: mockApiClient,
} as unknown as AppContextValue

function createWrapper(stateOverrides: Partial<SearchState> = {}, dispatch?: Dispatch<SearchAction>) {
  const mockDispatch = dispatch ?? vi.fn()
  const value: SearchContextValue = {
    state: { ...initialSearchState, ...stateOverrides },
    dispatch: mockDispatch,
  }
  return {
    wrapper: ({ children }: { children: React.ReactNode }) => (
      React.createElement(AppContext.Provider, { value: mockAppContextValue },
        React.createElement(SearchContext.Provider, { value }, children)
      )
    ),
    dispatch: mockDispatch,
  }
}

const defaultProps = {
  vaults: [{ id: 'vault1', name: 'TestVault', permission: 'owner' }] as VaultInfo[],
  selectedVaultId: 'vault1',
  hasWriteAccess: true,
  onNavigateToResult: vi.fn(),
}

describe('SearchPanel — Replace UI', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('hides replace input when user has no write access', () => {
    const { wrapper } = createWrapper()
    render(
      React.createElement(SearchPanel, { ...defaultProps, hasWriteAccess: false }),
      { wrapper },
    )

    // Expand replace section
    const toggleBtn = screen.getByLabelText('Ersetzen-Bereich umschalten')
    fireEvent.click(toggleBtn)

    // Replace input should NOT be visible
    expect(screen.queryByLabelText('Ersetzen')).toBeNull()
  })

  it('shows replace input when user has write access and section is expanded', () => {
    const { wrapper } = createWrapper()
    render(
      React.createElement(SearchPanel, { ...defaultProps, hasWriteAccess: true }),
      { wrapper },
    )

    // Expand replace section
    const toggleBtn = screen.getByLabelText('Ersetzen-Bereich umschalten')
    fireEvent.click(toggleBtn)

    // Replace input should be visible
    expect(screen.getByLabelText('Ersetzen')).toBeTruthy()
  })

  it('shows "Alle ersetzen" button when replace expanded, write access, and results exist', () => {
    const { wrapper } = createWrapper({
      query: 'test',
      results: [
        { filePath: 'a.md', fileName: 'a.md', hits: [{ line: 1, matchText: 'test', contextBefore: [], contextAfter: [], matchLine: 'this is a test' }], hitCount: 1 },
      ],
      totalHits: 1,
    })
    render(
      React.createElement(SearchPanel, { ...defaultProps, hasWriteAccess: true }),
      { wrapper },
    )

    // Expand replace section
    const toggleBtn = screen.getByLabelText('Ersetzen-Bereich umschalten')
    fireEvent.click(toggleBtn)

    expect(screen.getByLabelText('Alle ersetzen')).toBeTruthy()
  })

  it('does NOT show "Alle ersetzen" button when no results', () => {
    const { wrapper } = createWrapper({
      query: 'test',
      results: [],
      totalHits: 0,
    })
    render(
      React.createElement(SearchPanel, { ...defaultProps, hasWriteAccess: true }),
      { wrapper },
    )

    // Expand replace section
    const toggleBtn = screen.getByLabelText('Ersetzen-Bereich umschalten')
    fireEvent.click(toggleBtn)

    expect(screen.queryByLabelText('Alle ersetzen')).toBeNull()
  })

  it('does NOT show "Alle ersetzen" button when user has no write access', () => {
    const { wrapper } = createWrapper({
      query: 'test',
      results: [
        { filePath: 'a.md', fileName: 'a.md', hits: [{ line: 1, matchText: 'test', contextBefore: [], contextAfter: [], matchLine: 'this is a test' }], hitCount: 1 },
      ],
      totalHits: 1,
    })
    render(
      React.createElement(SearchPanel, { ...defaultProps, hasWriteAccess: false }),
      { wrapper },
    )

    // Expand replace section
    const toggleBtn = screen.getByLabelText('Ersetzen-Bereich umschalten')
    fireEvent.click(toggleBtn)

    expect(screen.queryByLabelText('Alle ersetzen')).toBeNull()
  })

  it('shows confirmation modal when "Alle ersetzen" is clicked', () => {
    const { wrapper } = createWrapper({
      query: 'test',
      results: [
        { filePath: 'a.md', fileName: 'a.md', hits: [{ line: 1, matchText: 'test', contextBefore: [], contextAfter: [], matchLine: 'this is a test' }], hitCount: 1 },
        { filePath: 'b.md', fileName: 'b.md', hits: [{ line: 5, matchText: 'test', contextBefore: [], contextAfter: [], matchLine: 'another test' }], hitCount: 1 },
      ],
      totalHits: 2,
    })
    render(
      React.createElement(SearchPanel, { ...defaultProps, hasWriteAccess: true }),
      { wrapper },
    )

    // Expand replace section
    const toggleBtn = screen.getByLabelText('Ersetzen-Bereich umschalten')
    fireEvent.click(toggleBtn)

    // Click "Alle ersetzen"
    fireEvent.click(screen.getByLabelText('Alle ersetzen'))

    // Confirmation modal should appear with preview
    expect(screen.getByText('2 Treffer in 2 Dateien ersetzen?')).toBeTruthy()
    // Modal has "Ersetzen" confirm button and "Abbrechen" cancel button
    const modal = screen.getByRole('alertdialog')
    expect(modal).toBeTruthy()
    expect(screen.getByText('Abbrechen')).toBeTruthy()
  })

  it('shows per-file replace button next to each file in results when replace is expanded', () => {
    const { wrapper } = createWrapper({
      query: 'hello',
      results: [
        { filePath: 'file1.md', fileName: 'file1.md', hits: [{ line: 3, matchText: 'hello', contextBefore: [], contextAfter: [], matchLine: 'say hello world' }], hitCount: 1 },
      ],
      totalHits: 1,
    })
    render(
      React.createElement(SearchPanel, { ...defaultProps, hasWriteAccess: true }),
      { wrapper },
    )

    // Expand replace section
    const toggleBtn = screen.getByLabelText('Ersetzen-Bereich umschalten')
    fireEvent.click(toggleBtn)

    // Per-file replace button should exist
    expect(screen.getByLabelText('Ersetzen in file1.md')).toBeTruthy()
  })

  it('does NOT show per-file replace button when replace section is collapsed', () => {
    const { wrapper } = createWrapper({
      query: 'hello',
      results: [
        { filePath: 'file1.md', fileName: 'file1.md', hits: [{ line: 3, matchText: 'hello', contextBefore: [], contextAfter: [], matchLine: 'say hello world' }], hitCount: 1 },
      ],
      totalHits: 1,
    })
    render(
      React.createElement(SearchPanel, { ...defaultProps, hasWriteAccess: true }),
      { wrapper },
    )

    // Replace section is collapsed by default
    expect(screen.queryByLabelText('Ersetzen in file1.md')).toBeNull()
  })

  it('shows success feedback after replace result', () => {
    const { wrapper } = createWrapper({
      query: 'test',
      lastReplaceResult: {
        totalReplacements: 5,
        fileCount: 2,
        files: [{ path: 'a.md', replacements: 3 }, { path: 'b.md', replacements: 2 }],
        failed: [],
      },
    })
    render(
      React.createElement(SearchPanel, { ...defaultProps, hasWriteAccess: true }),
      { wrapper },
    )

    // Expand replace section so feedback is visible
    const toggleBtn = screen.getByLabelText('Ersetzen-Bereich umschalten')
    fireEvent.click(toggleBtn)

    expect(screen.getByText('5 Ersetzungen in 2 Dateien durchgeführt')).toBeTruthy()
  })

  it('shows error feedback after replace error', () => {
    const { wrapper } = createWrapper({
      query: 'test',
      replaceError: 'Keine Schreibberechtigung',
    })
    render(
      React.createElement(SearchPanel, { ...defaultProps, hasWriteAccess: true }),
      { wrapper },
    )

    // Expand replace section so feedback is visible
    const toggleBtn = screen.getByLabelText('Ersetzen-Bereich umschalten')
    fireEvent.click(toggleBtn)

    expect(screen.getByText('Keine Schreibberechtigung')).toBeTruthy()
  })

  it('closes confirmation modal when "Abbrechen" is clicked', () => {
    const { wrapper } = createWrapper({
      query: 'test',
      results: [
        { filePath: 'a.md', fileName: 'a.md', hits: [{ line: 1, matchText: 'test', contextBefore: [], contextAfter: [], matchLine: 'test line' }], hitCount: 1 },
      ],
      totalHits: 1,
    })
    render(
      React.createElement(SearchPanel, { ...defaultProps, hasWriteAccess: true }),
      { wrapper },
    )

    // Expand replace section and open confirm
    const toggleBtn = screen.getByLabelText('Ersetzen-Bereich umschalten')
    fireEvent.click(toggleBtn)
    fireEvent.click(screen.getByLabelText('Alle ersetzen'))

    // Modal should be open
    expect(screen.getByText('1 Treffer in 1 Datei ersetzen?')).toBeTruthy()

    // Cancel
    fireEvent.click(screen.getByText('Abbrechen'))

    // Modal should be closed
    expect(screen.queryByText('1 Treffer in 1 Datei ersetzen?')).toBeNull()
  })
})
