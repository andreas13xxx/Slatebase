import { useState, useEffect, useRef, useCallback, type Dispatch } from 'react'
import { Search, FilePlus, Clock } from 'lucide-react'
import type { IApiClient } from '../api'
import type { DirectoryTree, AppAction } from '../types'
import type { TabAction } from '../state/tabState'
import { useFocusTrap } from '../hooks/useFocusTrap'
import { collectFilesSorted } from '../plugins/link-resolver'
import { fuzzyMatch } from '../utils/fuzzyMatch'
import { openTab } from '../state/tabActions'
import { getRecent } from '../state/recentFilesStore'
import { extractErrorMessage } from '../utils/error'

export interface QuickSwitcherProps {
  isOpen: boolean
  onClose: () => void
  vaultId: string
  directoryTree: DirectoryTree | null
  apiClient: IApiClient
  tabDispatch: Dispatch<TabAction>
  appDispatch: Dispatch<AppAction>
}

/** Maximum number of fuzzy-matched results displayed. */
const MAX_RESULTS = 50
/** Maximum number of recent-file suggestions shown for an empty query. */
const MAX_RECENT = 20

interface FileCandidate {
  name: string
  path: string
}

type SwitcherEntry =
  | { kind: 'file'; name: string; path: string }
  | { kind: 'create'; name: string; path: string }

/**
 * QuickSwitcher — modal overlay for fuzzy-opening any file in the vault by name.
 * Wires the `switcher:open` core command (previously a no-op) to real behavior.
 *
 * Structurally mirrors CommandPalette.tsx: same overlay/focus-trap/keyboard pattern,
 * reuses its `.command-palette-*` CSS classes for a consistent look.
 *
 * Validates: Requirements 2.1–2.10
 */
export function QuickSwitcher({
  isOpen,
  onClose,
  vaultId,
  directoryTree,
  apiClient,
  tabDispatch,
  appDispatch,
}: QuickSwitcherProps) {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const containerRef = useFocusTrap<HTMLDivElement>({
    isActive: isOpen,
    onEscape: onClose,
    returnFocusOnDeactivate: true,
  })

  useEffect(() => {
    if (isOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setQuery('')
      setSelectedIndex(0)
      setCreateError(null)
      requestAnimationFrame(() => {
        inputRef.current?.focus()
      })
    }
  }, [isOpen])

  const entries = buildEntries(query, vaultId, directoryTree)
  const totalItems = entries.length

  useEffect(() => {
    if (selectedIndex >= totalItems) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSelectedIndex(Math.max(0, totalItems - 1))
    }
  }, [totalItems, selectedIndex])

  useEffect(() => {
    if (!listRef.current) return
    const selectedEl = listRef.current.querySelector('[aria-selected="true"]')
    if (selectedEl && typeof selectedEl.scrollIntoView === 'function') {
      selectedEl.scrollIntoView({ block: 'nearest' })
    }
  }, [selectedIndex])

  const handleOpenFile = useCallback((path: string, name: string) => {
    void openTab(tabDispatch, appDispatch, apiClient, vaultId, path, name)
    onClose()
  }, [tabDispatch, appDispatch, apiClient, vaultId, onClose])

  const handleCreateFile = useCallback(async (path: string, name: string) => {
    setCreating(true)
    setCreateError(null)
    try {
      await apiClient.saveFile(vaultId, path, '')
      const tree = await apiClient.fetchVaultTree(vaultId)
      appDispatch({ type: 'VAULT_TREE_LOADED', payload: { vaultId, tree } })
      void openTab(tabDispatch, appDispatch, apiClient, vaultId, path, name)
      onClose()
    } catch (err: unknown) {
      // Requirement 2.8: keep the switcher open, show the reason inline.
      setCreateError(extractErrorMessage(err, `„${name}“ konnte nicht erstellt werden.`))
    } finally {
      setCreating(false)
    }
  }, [apiClient, vaultId, appDispatch, tabDispatch, onClose])

  const handleSelect = useCallback((entry: SwitcherEntry) => {
    if (entry.kind === 'create') {
      void handleCreateFile(entry.path, entry.name)
    } else {
      handleOpenFile(entry.path, entry.name)
    }
  }, [handleCreateFile, handleOpenFile])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault()
        setSelectedIndex((prev) => (prev < totalItems - 1 ? prev + 1 : prev))
        break
      case 'ArrowUp':
        e.preventDefault()
        setSelectedIndex((prev) => (prev > 0 ? prev - 1 : prev))
        break
      case 'Enter':
        e.preventDefault()
        if (totalItems > 0) {
          const selected = entries[selectedIndex]
          if (selected) handleSelect(selected)
        }
        break
    }
  }, [entries, selectedIndex, totalItems, handleSelect])

  const handleOverlayClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose()
  }, [onClose])

  if (!isOpen) return null

  const activeDescendant = totalItems > 0 ? `quick-switcher-item-${selectedIndex}` : undefined
  const showingRecent = query.trim().length === 0

  return (
    <div className="command-palette-overlay" onClick={handleOverlayClick} role="presentation">
      <div
        ref={containerRef}
        className="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Schnellwechsler"
      >
        <div className="command-palette-search">
          <Search size={14} className="command-palette-search-icon" />
          <input
            ref={inputRef}
            type="text"
            className="command-palette-input"
            placeholder="Datei öffnen oder erstellen…"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelectedIndex(0)
              setCreateError(null)
            }}
            onKeyDown={handleKeyDown}
            role="combobox"
            aria-expanded="true"
            aria-controls="quick-switcher-list"
            aria-activedescendant={activeDescendant}
            aria-autocomplete="list"
          />
        </div>

        {createError && (
          <div className="command-palette-empty" role="alert">{createError}</div>
        )}

        <ul
          ref={listRef}
          id="quick-switcher-list"
          className="command-palette-list"
          role="listbox"
          aria-label="Dateien"
        >
          {totalItems === 0 ? (
            <li className="command-palette-empty" role="option" aria-selected={false}>
              Keine Dateien gefunden
            </li>
          ) : (
            <>
              {showingRecent && (
                <li className="command-palette-section-header" aria-hidden="true">
                  <Clock size={12} className="command-palette-section-icon" />
                  Zuletzt geöffnet
                </li>
              )}
              {entries.map((entry, index) => (
                <li
                  key={`${entry.kind}-${entry.path}`}
                  id={`quick-switcher-item-${index}`}
                  className={`command-palette-item${index === selectedIndex ? ' command-palette-item--selected' : ''}`}
                  role="option"
                  aria-selected={index === selectedIndex}
                  aria-disabled={creating}
                  onClick={() => handleSelect(entry)}
                >
                  {entry.kind === 'create' ? (
                    <>
                      <span className="command-palette-item-name">
                        <FilePlus size={13} style={{ marginRight: 6, verticalAlign: 'text-bottom' }} />
                        Neue Datei „{entry.name}“ erstellen
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="command-palette-item-name">{entry.name}</span>
                      <span className="command-palette-item-path">{entry.path}</span>
                    </>
                  )}
                </li>
              ))}
            </>
          )}
        </ul>
      </div>
    </div>
  )
}

/** Builds the ranked list of file entries (or recent files) plus an optional create-new entry. */
function buildEntries(query: string, vaultId: string, tree: DirectoryTree | null): SwitcherEntry[] {
  const trimmed = query.trim()

  if (trimmed.length === 0) {
    const recent = getRecent()
      .filter((r) => r.vaultId === vaultId)
      .slice(0, MAX_RECENT)
    return recent.map((r) => ({ kind: 'file', name: r.path.split('/').pop() ?? r.path, path: r.path }))
  }

  const allFiles: FileCandidate[] = tree ? collectFilesSorted(tree) : []
  const scored: Array<{ file: FileCandidate; score: number }> = []
  for (const file of allFiles) {
    const score = fuzzyMatch(trimmed, file.path)
    if (score !== null) scored.push({ file, score })
  }
  scored.sort((a, b) => a.score - b.score)

  const results: SwitcherEntry[] = scored
    .slice(0, MAX_RESULTS)
    .map(({ file }) => ({ kind: 'file', name: file.name, path: file.path }))

  const targetName = trimmed.endsWith('.md') ? trimmed : `${trimmed}.md`
  const targetPath = targetName
  const exactMatch = allFiles.some((f) => f.path.toLowerCase() === targetPath.toLowerCase())
  if (!exactMatch) {
    results.push({ kind: 'create', name: targetName, path: targetPath })
  }

  return results
}
