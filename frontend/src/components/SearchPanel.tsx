import React, { useState, useRef, useCallback, useEffect } from 'react'
import { Search, ChevronDown, ChevronRight, Loader2, Replace, FileText } from 'lucide-react'
import { useSearchContext } from '../state/searchContext'
import { useAppContext } from '../state'
import { performSearch, performMultiVaultSearch, performReplace, performSingleReplace } from '../state/searchActions'
import { ConfirmModal } from './ConfirmModal'
import type { SearchFileResult } from '../state/searchState'
import type { VaultInfo } from '../types'
import type { ISearchApiClient } from '../state/searchActions'
import './SearchPanel.css'

/**
 * Props for the SearchPanel component.
 */
export interface SearchPanelProps {
  vaults: VaultInfo[]
  selectedVaultId: string | null
  hasWriteAccess: boolean
  onNavigateToResult: (vaultId: string, filePath: string, line: number) => void
}

/**
 * SearchPanel — main search and replace component.
 * Displays search input, replace section, toggle options, vault scope selector,
 * and results area with loading/empty states.
 * Implements 300ms debounce on input and AbortController for request cancellation.
 */
export function SearchPanel({
  vaults,
  selectedVaultId,
  hasWriteAccess,
  onNavigateToResult,
}: SearchPanelProps) {
  const { state, dispatch } = useSearchContext()
  const { apiClient } = useAppContext()
  const [replaceExpanded, setReplaceExpanded] = useState(false)
  const [showReplaceConfirm, setShowReplaceConfirm] = useState(false)

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  /**
   * Triggers a search after debounce. Uses AbortController to cancel
   * any in-flight request before starting a new one.
   */
  const triggerSearch = useCallback((query: string) => {
    // Abort any in-flight request
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
      abortControllerRef.current = null
    }

    if (!query.trim()) {
      dispatch({ type: 'CLEAR_RESULTS' })
      return
    }

    const controller = new AbortController()
    abortControllerRef.current = controller

    // Use the authenticated ApiClient from AppContext as ISearchApiClient adapter
    const searchApiClient: ISearchApiClient = {
      searchVault: (vaultId: string, params: Record<string, string>) =>
        apiClient!.searchVault(vaultId, params),
      searchMultiVault: (params: Record<string, string>) =>
        apiClient!.searchMultiVault(params),
      replaceInVault: (vaultId: string, body) =>
        apiClient!.replaceInVault(vaultId, body as object),
    }

    const searchOptions = {
      query,
      caseSensitive: state.caseSensitive,
      regex: state.regex,
    }

    if (state.scope === 'all') {
      performMultiVaultSearch(dispatch, searchApiClient, searchOptions, controller.signal)
    } else if (selectedVaultId) {
      performSearch(dispatch, searchApiClient, selectedVaultId, searchOptions, controller.signal)
    }
  }, [dispatch, state.caseSensitive, state.regex, state.scope, selectedVaultId, apiClient])

  /**
   * Builds an API client adapter for replace operations using the authenticated ApiClient.
   */
  const buildReplaceApiClient = useCallback((): ISearchApiClient => {
    return {
      searchVault: (vaultId: string, params: Record<string, string>) =>
        apiClient!.searchVault(vaultId, params),
      searchMultiVault: (params: Record<string, string>) =>
        apiClient!.searchMultiVault(params),
      replaceInVault: (vaultId: string, body) =>
        apiClient!.replaceInVault(vaultId, body as object),
    }
  }, [apiClient])

  /**
   * Handles a single-hit replace operation for a specific file.
   */
  const handleSingleReplace = useCallback(async (filePath: string) => {
    if (!selectedVaultId || !state.query.trim()) return

    const apiClient = buildReplaceApiClient()

    await performSingleReplace(dispatch, apiClient, selectedVaultId, {
      query: state.query,
      replacement: state.replacement,
      caseSensitive: state.caseSensitive,
      regex: state.regex,
      filePath,
    })

    // Re-trigger search to refresh results
    setTimeout(() => {
      triggerSearch(state.query)
    }, 100)
  }, [selectedVaultId, state.query, state.replacement, state.caseSensitive, state.regex, dispatch, buildReplaceApiClient, triggerSearch])

  /**
   * Handles confirming the "Replace All" operation.
   */
  const handleReplaceAllConfirm = useCallback(async () => {
    if (!selectedVaultId || !state.query.trim()) return

    setShowReplaceConfirm(false)
    const apiClient = buildReplaceApiClient()

    await performReplace(dispatch, apiClient, selectedVaultId, {
      query: state.query,
      replacement: state.replacement,
      caseSensitive: state.caseSensitive,
      regex: state.regex,
    })

    // Re-trigger search to refresh results after replace
    setTimeout(() => {
      triggerSearch(state.query)
    }, 100)
  }, [selectedVaultId, state.query, state.replacement, state.caseSensitive, state.regex, dispatch, buildReplaceApiClient, triggerSearch])

  /**
   * Derives replace feedback directly from state — no useEffect needed.
   */
  const replaceFeedback: { type: 'success' | 'error'; message: string } | null =
    state.replaceError
      ? { type: 'error', message: state.replaceError }
      : state.lastReplaceResult
        ? {
            type: 'success',
            message: state.lastReplaceResult.totalReplacements > 0
              ? `${state.lastReplaceResult.totalReplacements} Ersetzung${state.lastReplaceResult.totalReplacements !== 1 ? 'en' : ''} in ${state.lastReplaceResult.fileCount} Datei${state.lastReplaceResult.fileCount !== 1 ? 'en' : ''} durchgeführt`
              : 'Keine Treffer zum Ersetzen gefunden',
          }
        : null

  /**
   * Computes the replace preview counts for the confirmation dialog.
   */
  const replacePreviewCounts = state.results
    ? { fileCount: state.results.length, hitCount: state.totalHits }
    : { fileCount: 0, hitCount: 0 }

  /**
   * Handles search input changes with 300ms debounce.
   */
  const handleQueryChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const newQuery = e.target.value
    dispatch({ type: 'SET_QUERY', payload: newQuery })

    // Clear previous debounce timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current)
    }

    // If input is empty, clear results immediately
    if (!newQuery.trim()) {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
        abortControllerRef.current = null
      }
      dispatch({ type: 'CLEAR_RESULTS' })
      return
    }

    // Set new 300ms debounce timer
    debounceTimerRef.current = setTimeout(() => {
      triggerSearch(newQuery)
    }, 300)
  }, [dispatch, triggerSearch])

  /**
   * Handles replacement input changes.
   */
  const handleReplacementChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    dispatch({ type: 'SET_REPLACEMENT', payload: e.target.value })
  }, [dispatch])

  /**
   * Toggles case-sensitive option and re-triggers search.
   */
  const handleToggleCaseSensitive = useCallback(() => {
    const newValue = !state.caseSensitive
    dispatch({ type: 'SET_OPTION', payload: { key: 'caseSensitive', value: newValue } })
    if (state.query.trim()) {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
      debounceTimerRef.current = setTimeout(() => {
        triggerSearch(state.query)
      }, 300)
    }
  }, [dispatch, state.caseSensitive, state.query, triggerSearch])

  /**
   * Toggles regex option and re-triggers search.
   */
  const handleToggleRegex = useCallback(() => {
    const newValue = !state.regex
    dispatch({ type: 'SET_OPTION', payload: { key: 'regex', value: newValue } })
    if (state.query.trim()) {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
      debounceTimerRef.current = setTimeout(() => {
        triggerSearch(state.query)
      }, 300)
    }
  }, [dispatch, state.regex, state.query, triggerSearch])

  /**
   * Handles vault scope change and re-triggers search.
   */
  const handleScopeChange = useCallback((e: React.ChangeEvent<HTMLSelectElement>) => {
    const newScope = e.target.value as 'single' | 'all'
    dispatch({ type: 'SET_OPTION', payload: { key: 'scope', value: newScope } })
    if (state.query.trim()) {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
      debounceTimerRef.current = setTimeout(() => {
        triggerSearch(state.query)
      }, 300)
    }
  }, [dispatch, state.query, triggerSearch])

  /**
   * Toggles replace section visibility.
   */
  const handleToggleReplace = useCallback(() => {
    setReplaceExpanded(prev => !prev)
  }, [])

  // Cleanup timers and abort controllers on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current)
      }
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [])

  const hasResults = state.results !== null && state.results.length > 0
  const showNoResults = !state.loading && state.results !== null && state.results.length === 0 && state.query.trim().length > 0
  const showError = !state.loading && state.error !== null
  const showReplaceActions = replaceExpanded && hasWriteAccess && hasResults && !state.loading

  /**
   * Handles clicking on a search hit to navigate to the file at the specific line.
   */
  const handleHitClick = useCallback((vaultId: string, filePath: string, line: number) => {
    const resultId = `${vaultId}::${filePath}:${line}`
    dispatch({ type: 'SET_ACTIVE_RESULT', payload: resultId })
    onNavigateToResult(vaultId, filePath, line)
  }, [dispatch, onNavigateToResult])

  /**
   * Generates the unique result ID for a given hit.
   */
  const getResultId = useCallback((vaultId: string, filePath: string, line: number): string => {
    return `${vaultId}::${filePath}:${line}`
  }, [])

  return (
    <div className="search-panel">
      <div className="search-panel__header">
        <div className="search-panel__input-row">
          <div className="search-panel__input-wrapper">
            <Search size={14} className="search-panel__input-icon" />
            <input
              type="text"
              className="search-panel__input"
              placeholder="Suchen..."
              value={state.query}
              onChange={handleQueryChange}
              aria-label="Suchen"
            />
          </div>
          <button
            className={`search-panel__toggle ${state.caseSensitive ? 'search-panel__toggle--active' : ''}`}
            title="Groß-/Kleinschreibung"
            onClick={handleToggleCaseSensitive}
            aria-pressed={state.caseSensitive}
            aria-label="Groß-/Kleinschreibung"
          >
            Aa
          </button>
          <button
            className={`search-panel__toggle ${state.regex ? 'search-panel__toggle--active' : ''}`}
            title="Regulärer Ausdruck"
            onClick={handleToggleRegex}
            aria-pressed={state.regex}
            aria-label="Regulärer Ausdruck"
          >
            .*
          </button>
        </div>

        <div className="search-panel__replace-section">
          <button
            className="search-panel__replace-toggle"
            onClick={handleToggleReplace}
            title={replaceExpanded ? 'Ersetzen einklappen' : 'Ersetzen ausklappen'}
            aria-expanded={replaceExpanded}
            aria-label="Ersetzen-Bereich umschalten"
          >
            {replaceExpanded
              ? <ChevronDown size={14} />
              : <ChevronRight size={14} />
            }
            <span className="search-panel__replace-label">Ersetzen</span>
          </button>
          {replaceExpanded && hasWriteAccess && (
            <div className="search-panel__replace-input-row">
              <input
                type="text"
                className="search-panel__replace-input"
                placeholder="Ersetzen..."
                value={state.replacement}
                onChange={handleReplacementChange}
                aria-label="Ersetzen"
              />
              {showReplaceActions && (
                <button
                  className="search-panel__replace-all-btn"
                  onClick={() => setShowReplaceConfirm(true)}
                  disabled={state.replaceLoading}
                  title="Alle Treffer ersetzen"
                  aria-label="Alle ersetzen"
                >
                  <Replace size={12} />
                  <span>Alle ersetzen</span>
                </button>
              )}
            </div>
          )}
          {replaceExpanded && hasWriteAccess && replaceFeedback && (
            <div className={`search-panel__replace-feedback search-panel__replace-feedback--${replaceFeedback.type}`}>
              {replaceFeedback.message}
            </div>
          )}
          {replaceExpanded && hasWriteAccess && state.replaceLoading && (
            <div className="search-panel__replace-feedback search-panel__replace-feedback--loading">
              <Loader2 size={12} className="search-panel__spinner" />
              <span>Ersetzen läuft...</span>
            </div>
          )}
        </div>

        <div className="search-panel__scope">
          <select
            className="search-panel__scope-select"
            value={state.scope}
            onChange={handleScopeChange}
            aria-label="Suchbereich"
          >
            <option value="single">Aktueller Vault</option>
            <option value="all">Alle Vaults</option>
          </select>
        </div>
      </div>

      <div className="search-panel__results">
        {state.loading && (
          <div className="search-panel__loading">
            <Loader2 size={20} className="search-panel__spinner" />
            <span className="search-panel__loading-text">Suche läuft...</span>
          </div>
        )}

        {showNoResults && (
          <div className="search-panel__empty">
            Keine Ergebnisse
          </div>
        )}

        {showError && (
          <div className="search-panel__error">
            {state.error}
          </div>
        )}

        {hasResults && !state.loading && (
          <div className="search-panel__results-list">
            <div className="search-panel__results-summary">
              {state.totalHits} Treffer
              {state.truncated && state.truncationMessage && (
                <span className="search-panel__truncation-hint">
                  {' '}— {state.truncationMessage}
                </span>
              )}
            </div>

            {state.scope === 'all' && state.vaultResults ? (
              <SearchResultsMultiVault
                vaultResults={state.vaultResults}
                vaults={vaults}
                activeResultId={state.activeResultId}
                query={state.query}
                onHitClick={handleHitClick}
                getResultId={getResultId}
                onReplace={replaceExpanded && hasWriteAccess ? handleSingleReplace : undefined}
                replaceLoading={state.replaceLoading}
              />
            ) : (
              <SearchResultsFileGroups
                results={state.results!}
                vaultId={selectedVaultId ?? ''}
                activeResultId={state.activeResultId}
                query={state.query}
                onHitClick={handleHitClick}
                getResultId={getResultId}
                onReplace={replaceExpanded && hasWriteAccess ? handleSingleReplace : undefined}
                replaceLoading={state.replaceLoading}
              />
            )}
          </div>
        )}
      </div>

      <ConfirmModal
        open={showReplaceConfirm}
        title="Alle ersetzen"
        message={`${replacePreviewCounts.hitCount} Treffer in ${replacePreviewCounts.fileCount} Datei${replacePreviewCounts.fileCount !== 1 ? 'en' : ''} ersetzen?`}
        confirmLabel="Ersetzen"
        cancelLabel="Abbrechen"
        variant="primary"
        onConfirm={handleReplaceAllConfirm}
        onCancel={() => setShowReplaceConfirm(false)}
      />
    </div>
  )
}


// ─── Helper Components for Results Display ───────────────────────────────────

interface SearchResultsFileGroupsProps {
  results: SearchFileResult[]
  vaultId: string
  activeResultId: string | null
  query: string
  onHitClick: (vaultId: string, filePath: string, line: number) => void
  getResultId: (vaultId: string, filePath: string, line: number) => string
  onReplace?: (filePath: string) => void
  replaceLoading?: boolean
}

/**
 * Renders search results grouped by file for a single vault.
 */
function SearchResultsFileGroups({
  results,
  vaultId,
  activeResultId,
  query,
  onHitClick,
  getResultId,
  onReplace,
  replaceLoading,
}: SearchResultsFileGroupsProps) {
  return (
    <div className="search-panel__file-groups">
      {results.map((fileResult) => (
        <SearchFileGroup
          key={fileResult.filePath}
          fileResult={fileResult}
          vaultId={vaultId}
          activeResultId={activeResultId}
          query={query}
          onHitClick={onHitClick}
          getResultId={getResultId}
          onReplace={onReplace}
          replaceLoading={replaceLoading}
        />
      ))}
    </div>
  )
}

interface SearchResultsMultiVaultProps {
  vaultResults: Record<string, SearchFileResult[]>
  vaults: VaultInfo[]
  activeResultId: string | null
  query: string
  onHitClick: (vaultId: string, filePath: string, line: number) => void
  getResultId: (vaultId: string, filePath: string, line: number) => string
  onReplace?: (filePath: string) => void
  replaceLoading?: boolean
}

/**
 * Renders search results grouped first by vault, then by file.
 * Vault groups are sorted alphabetically by vault name.
 */
function SearchResultsMultiVault({
  vaultResults,
  vaults,
  activeResultId,
  query,
  onHitClick,
  getResultId,
  onReplace,
  replaceLoading,
}: SearchResultsMultiVaultProps) {
  // Build sorted vault entries
  const sortedVaultEntries = Object.entries(vaultResults)
    .map(([vaultId, results]) => {
      const vault = vaults.find(v => v.id === vaultId)
      return { vaultId, vaultName: vault?.name ?? vaultId, results }
    })
    .sort((a, b) => a.vaultName.localeCompare(b.vaultName))

  return (
    <div className="search-panel__vault-groups">
      {sortedVaultEntries.map(({ vaultId, vaultName, results }) => (
        <div key={vaultId} className="search-panel__vault-group">
          <div className="search-panel__vault-header">
            {vaultName}
          </div>
          {results.map((fileResult) => (
            <SearchFileGroup
              key={`${vaultId}::${fileResult.filePath}`}
              fileResult={fileResult}
              vaultId={vaultId}
              activeResultId={activeResultId}
              query={query}
              onHitClick={onHitClick}
              getResultId={getResultId}
              onReplace={onReplace}
              replaceLoading={replaceLoading}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

interface SearchFileGroupProps {
  fileResult: SearchFileResult
  vaultId: string
  activeResultId: string | null
  query: string
  onHitClick: (vaultId: string, filePath: string, line: number) => void
  getResultId: (vaultId: string, filePath: string, line: number) => string
  onReplace?: (filePath: string) => void
  replaceLoading?: boolean
}

/**
 * Renders a collapsible file group with its search hits.
 * Each hit is clickable and navigates to the file at the matched line.
 */
function SearchFileGroup({
  fileResult,
  vaultId,
  activeResultId,
  query,
  onHitClick,
  getResultId,
  onReplace,
  replaceLoading,
}: SearchFileGroupProps) {
  const [expanded, setExpanded] = useState(true)

  return (
    <div className="search-panel__file-group">
      <div className="search-panel__file-header">
        <button
          className="search-panel__file-header-toggle"
          onClick={() => setExpanded(prev => !prev)}
          title={fileResult.filePath}
          aria-expanded={expanded}
        >
          {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <FileText size={12} className="search-panel__file-icon" />
          <span className="search-panel__file-name">{fileResult.fileName}</span>
          <span className="search-panel__file-count">{fileResult.hitCount}</span>
        </button>
        {onReplace && (
          <button
            className="search-panel__replace-hit-btn"
            onClick={() => onReplace(fileResult.filePath)}
            disabled={replaceLoading}
            title={`Treffer in ${fileResult.fileName} ersetzen`}
            aria-label={`Ersetzen in ${fileResult.fileName}`}
          >
            <Replace size={11} />
          </button>
        )}
      </div>
      {expanded && (
        <div className="search-panel__hits">
          {fileResult.hits.map((hit) => {
            const resultId = getResultId(vaultId, fileResult.filePath, hit.line)
            const isActive = resultId === activeResultId
            return (
              <button
                key={resultId}
                className={`search-panel__hit ${isActive ? 'search-panel__hit--active' : ''}`}
                onClick={() => onHitClick(vaultId, fileResult.filePath, hit.line)}
                title={`${fileResult.filePath}:${hit.line}`}
              >
                <span className="search-panel__hit-line">{hit.line}</span>
                <span className="search-panel__hit-text">
                  <HighlightedText text={hit.matchLine} query={query} />
                </span>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

interface HighlightedTextProps {
  text: string
  query: string
}

/**
 * Renders text with the search query highlighted using a distinct background color.
 */
function HighlightedText({ text, query }: HighlightedTextProps) {
  if (!query) {
    return <>{text}</>
  }

  // Escape regex special characters for plain-text matching
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const parts = text.split(new RegExp(`(${escapedQuery})`, 'gi'))

  return (
    <>
      {parts.map((part, i) => {
        const isMatch = part.toLowerCase() === query.toLowerCase()
        return isMatch ? (
          <mark key={i} className="search-panel__highlight">{part}</mark>
        ) : (
          <span key={i}>{part}</span>
        )
      })}
    </>
  )
}
