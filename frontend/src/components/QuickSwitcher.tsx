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
import { getAliasEntriesSnapshot, type AliasEntry } from '../state/aliasStore'
import { extractErrorMessage } from '../utils/error'
import { useTranslation } from '../i18n'

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
  | { kind: 'file'; name: string; path: string; viaAlias?: string }
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
  const { t } = useTranslation()
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

  const entries = buildEntries(query, vaultId, directoryTree, getAliasEntriesSnapshot())
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
      setCreateError(extractErrorMessage(err, t('quickSwitcher.createError', { name })))
    } finally {
      setCreating(false)
    }
  }, [apiClient, vaultId, appDispatch, tabDispatch, onClose, t])

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
        aria-label={t('quickSwitcher.dialogLabel')}
      >
        <div className="command-palette-search">
          <Search size={14} className="command-palette-search-icon" />
          <input
            ref={inputRef}
            type="text"
            className="command-palette-input"
            placeholder={t('quickSwitcher.placeholder')}
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
          aria-label={t('quickSwitcher.listLabel')}
        >
          {totalItems === 0 ? (
            <li className="command-palette-empty" role="option" aria-selected={false}>
              {t('quickSwitcher.noResults')}
            </li>
          ) : (
            <>
              {showingRecent && (
                <li className="command-palette-section-header" aria-hidden="true">
                  <Clock size={12} className="command-palette-section-icon" />
                  {t('quickSwitcher.recentHeader')}
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
                        {t('quickSwitcher.createFile', { name: entry.name })}
                      </span>
                    </>
                  ) : (
                    <>
                      <span className="command-palette-item-name">
                        {entry.viaAlias
                          ? t('quickSwitcher.viaAlias', { alias: entry.viaAlias, name: entry.name })
                          : entry.name}
                      </span>
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
function buildEntries(
  query: string,
  vaultId: string,
  tree: DirectoryTree | null,
  aliasEntries: readonly AliasEntry[],
): SwitcherEntry[] {
  const trimmed = query.trim()

  if (trimmed.length === 0) {
    const recent = getRecent()
      .filter((r) => r.vaultId === vaultId)
      .slice(0, MAX_RECENT)
    return recent.map((r) => ({ kind: 'file', name: r.path.split('/').pop() ?? r.path, path: r.path }))
  }

  const allFiles: FileCandidate[] = tree ? collectFilesSorted(tree) : []

  // Score file-name/path matches and alias-text matches together, so the best
  // fuzzy score wins regardless of which produced it. Keep the best score per
  // path: a file reached both by name and by an alias appears once.
  const bestByPath = new Map<string, { score: number; entry: SwitcherEntry }>()

  const consider = (path: string, score: number, entry: SwitcherEntry): void => {
    const prev = bestByPath.get(path)
    if (!prev || score < prev.score) {
      bestByPath.set(path, { score, entry })
    }
  }

  for (const file of allFiles) {
    const score = fuzzyMatch(trimmed, file.path)
    if (score !== null) {
      consider(file.path, score, { kind: 'file', name: file.name, path: file.path })
    }
  }

  for (const { alias, path } of aliasEntries) {
    const score = fuzzyMatch(trimmed, alias)
    if (score !== null) {
      // A name match for the same file wins (lower score); the alias entry only
      // takes the slot if it scores better or the file had no name match.
      consider(path, score, {
        kind: 'file',
        name: path.split('/').pop() ?? path,
        path,
        viaAlias: alias,
      })
    }
  }

  const scored = Array.from(bestByPath.values()).sort((a, b) => a.score - b.score)
  const results: SwitcherEntry[] = scored.slice(0, MAX_RESULTS).map((s) => s.entry)

  const targetName = trimmed.endsWith('.md') ? trimmed : `${trimmed}.md`
  const targetPath = targetName
  const exactMatch = allFiles.some((f) => f.path.toLowerCase() === targetPath.toLowerCase())
  if (!exactMatch) {
    results.push({ kind: 'create', name: targetName, path: targetPath })
  }

  return results
}
