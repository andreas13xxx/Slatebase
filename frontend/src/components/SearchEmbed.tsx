/**
 * SearchEmbed — a ```` ```query ```` block: runs the block's text as a vault
 * search and shows the matches live (re-runs when the vault changes).
 *
 * Used by reading view and by the Live Preview widget. The block's text, the
 * file names and the matched lines come from vault content and are therefore
 * untrusted: everything is rendered as React text, never as HTML.
 */

import { memo, useContext, useEffect, useState } from 'react'
import { AppContext } from '../state'
import { onRealtimeVaultChange } from '../state/realtimeVaultBridge'
import { useTranslation } from '../i18n'
import type { SearchFileResult } from '../state/searchState'
import './SearchEmbed.css'

/** The part of the API client the embed needs. */
export interface ISearchEmbedApiClient {
  searchVault(vaultId: string, params: Record<string, string>): Promise<unknown>
}

export interface SearchEmbedProps {
  vaultId: string
  /** The search query (the text of the code block). */
  query: string
  /** Open a note by its vault-relative path. */
  onOpenNote: (path: string) => void
  /** Explicit client (CM6 widget); falls back to AppContext in reading view. */
  apiClient?: ISearchEmbedApiClient | null
}

/** Narrows a host client that may lack `searchVault` (the editor's client type is a union of capabilities). */
export function hasSearch<T extends object>(client: T | null | undefined): client is T & ISearchEmbedApiClient {
  return !!client && typeof (client as Partial<ISearchEmbedApiClient>).searchVault === 'function'
}

/** Most files and hits per file shown; the embed is a preview, the search panel shows the rest. */
const MAX_RESULTS = 100
const MAX_HITS_PER_FILE = 5
const MAX_LINE_LENGTH = 200
/** Quiet time after the last vault change before the query re-runs. */
const REFRESH_DEBOUNCE_MS = 1000

interface SearchResponse {
  results: SearchFileResult[]
  totalHits: number
  truncated?: boolean
}

export const SearchEmbed = memo(function SearchEmbed({ vaultId, query, onOpenNote, apiClient: explicitClient }: SearchEmbedProps) {
  const { t } = useTranslation()
  const appContext = useContext(AppContext)
  const apiClient: ISearchEmbedApiClient | null = explicitClient ?? appContext?.apiClient ?? null
  const trimmed = query.trim()

  const [response, setResponse] = useState<SearchResponse | null>(null)
  const [error, setError] = useState(false)
  const [refreshTick, setRefreshTick] = useState(0)

  useEffect(() => {
    if (!apiClient || trimmed === '') return
    let cancelled = false
    void (async () => {
      try {
        const raw = await apiClient.searchVault(vaultId, {
          query: trimmed, caseSensitive: 'false', regex: 'false', contextLines: '0', maxResults: String(MAX_RESULTS),
        })
        if (cancelled) return
        setResponse(raw as SearchResponse)
        setError(false)
      } catch {
        // A failed background refresh keeps the last good result.
        if (!cancelled) setError(true)
      }
    })()
    return () => { cancelled = true }
  }, [apiClient, vaultId, trimmed, refreshTick])

  // A burst of vault changes (typing in an open note saves repeatedly) triggers one re-query.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const off = onRealtimeVaultChange((event) => {
      if (event.vaultId !== vaultId) return
      clearTimeout(timer)
      timer = setTimeout(() => setRefreshTick((n) => n + 1), REFRESH_DEBOUNCE_MS)
    })
    return () => { off(); clearTimeout(timer) }
  }, [vaultId])

  let body
  if (trimmed === '') body = <p className="search-embed__status">{t('searchEmbed.empty')}</p>
  else if (!apiClient || (error && !response)) body = <p className="search-embed__status" role="alert">{t('searchEmbed.error')}</p>
  else if (!response) body = <p className="search-embed__status" role="status">{t('common.loading')}</p>
  else if (response.results.length === 0) body = <p className="search-embed__status">{t('searchEmbed.noResults')}</p>
  else {
    body = (
      <ul className="search-embed__files">
        {response.results.map((file) => (
          <li key={file.filePath} className="search-embed__file">
            <button type="button" className="search-embed__file-link" onClick={() => onOpenNote(file.filePath)}>
              {file.fileName}
            </button>
            <ul className="search-embed__hits">
              {file.hits.slice(0, MAX_HITS_PER_FILE).map((hit) => (
                <li key={`${hit.line}:${hit.matchText}`} className="search-embed__hit">
                  <span className="search-embed__line">{hit.line}</span>
                  <span className="search-embed__text">{hit.matchLine.trim().slice(0, MAX_LINE_LENGTH)}</span>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <div className="search-embed" role="region" aria-label={`${t('searchEmbed.label')}: ${trimmed}`}>
      <div className="search-embed__header">
        <span className="search-embed__query">{trimmed}</span>
        {response && trimmed !== '' && (
          <span className="search-embed__count">
            {t('searchEmbed.count', { files: response.results.length })}{response.truncated ? '+' : ''}
          </span>
        )}
      </div>
      {body}
    </div>
  )
})
