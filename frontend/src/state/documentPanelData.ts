/**
 * Document-derived panel data (outline, forward/backlinks, tags, properties)
 * for the active document — hoisted out of the old right-side-only
 * ContextPanel.tsx so either side panel can host these built-in views.
 * Unlike panel layout state (`panelState.ts`), this doesn't belong to a
 * specific side: it's a single, app-wide slice of "what does the currently
 * open document look like," fetched once and read by whichever panel
 * currently has Outline/Links/Tags/Properties in its tab order.
 */

import { useCallback, useEffect, useReducer, useRef } from 'react'
import type { Dispatch } from 'react'
import type { IApiClient } from '../api'
import type { DirectoryTree } from '../types'
import { onRealtimeVaultChange } from './realtimeVaultBridge'
import {
  loadOutline,
  loadForwardLinks,
  loadBacklinks,
  loadUnlinkedMentions,
  loadTags,
  loadProperties,
  expandTag,
} from './documentPanelActions'

// ─── Constants ───────────────────────────────────────────────────────────────

/** Debounce delay for content-change updates (outline, forward links, properties). */
const CONTENT_DEBOUNCE_MS = 500

/** Debounce delay for backlinks re-fetch triggered by remote vault changes. */
const BACKLINKS_REFRESH_DEBOUNCE_MS = 1000

/** Debounce delay for Ungelinkte_Erwähnung re-fetch triggered by remote vault changes. */
const UNLINKED_MENTIONS_REFRESH_DEBOUNCE_MS = 1000

// ─── Types ───────────────────────────────────────────────────────────────────

/** Heading entry for the outline view. */
export interface OutlineHeading {
  text: string
  level: 1 | 2 | 3 | 4 | 5 | 6
  anchor: string
}

/** Link entry for the links view. */
export interface LinkEntry {
  target: string
  displayName: string
  resolved: boolean
}

/** Tag entry for the tags view. */
export interface TagEntry {
  name: string
  count: number
}

/** A single Ungelinkte_Erwähnung: a plain-text occurrence of the active file's name in another file. */
export interface UnlinkedMentionEntry {
  filePath: string
  /** The full line containing the first unlinked occurrence, used as a display snippet. */
  snippet: string
  lineNumber: number
}

/** Document-derived panel data. */
export interface DocumentPanelState {
  outline: {
    headings: OutlineHeading[]
    activeAnchor: string | null
  }
  links: {
    forward: LinkEntry[]
    backlinks: LinkEntry[]
    backlinksLoading: boolean
    backlinksError: string | null
    unlinkedMentions: UnlinkedMentionEntry[]
    unlinkedMentionsLoading: boolean
    unlinkedMentionsError: string | null
  }
  tags: {
    entries: TagEntry[]
    loading: boolean
    expandedTag: string | null
    tagFiles: string[]
  }
  properties: {
    data: Record<string, unknown> | null
    parseError: string | null
    rawFrontmatter: string | null
  }
}

export type DocumentPanelAction =
  | { type: 'SET_OUTLINE'; headings: OutlineHeading[] }
  | { type: 'SET_ACTIVE_ANCHOR'; anchor: string | null }
  | { type: 'SET_FORWARD_LINKS'; links: LinkEntry[] }
  | { type: 'SET_BACKLINKS'; backlinks: LinkEntry[] }
  | { type: 'SET_BACKLINKS_LOADING'; loading: boolean }
  | { type: 'SET_BACKLINKS_ERROR'; error: string | null }
  | { type: 'SET_UNLINKED_MENTIONS'; entries: UnlinkedMentionEntry[] }
  | { type: 'SET_UNLINKED_MENTIONS_LOADING'; loading: boolean }
  | { type: 'SET_UNLINKED_MENTIONS_ERROR'; error: string | null }
  | { type: 'SET_TAGS'; entries: TagEntry[] }
  | { type: 'SET_TAGS_LOADING'; loading: boolean }
  | { type: 'SET_TAG_EXPANDED'; tag: string | null; files: string[] }
  | { type: 'SET_PROPERTIES'; data: Record<string, unknown> | null; parseError: string | null; rawFrontmatter: string | null }
  | { type: 'RESET_DOCUMENT_STATE' }

function createInitialState(): DocumentPanelState {
  return {
    outline: { headings: [], activeAnchor: null },
    links: {
      forward: [],
      backlinks: [],
      backlinksLoading: false,
      backlinksError: null,
      unlinkedMentions: [],
      unlinkedMentionsLoading: false,
      unlinkedMentionsError: null,
    },
    tags: { entries: [], loading: false, expandedTag: null, tagFiles: [] },
    properties: { data: null, parseError: null, rawFrontmatter: null },
  }
}

function documentPanelReducer(state: DocumentPanelState, action: DocumentPanelAction): DocumentPanelState {
  switch (action.type) {
    case 'SET_OUTLINE':
      return { ...state, outline: { ...state.outline, headings: action.headings } }
    case 'SET_ACTIVE_ANCHOR':
      return { ...state, outline: { ...state.outline, activeAnchor: action.anchor } }
    case 'SET_FORWARD_LINKS':
      return { ...state, links: { ...state.links, forward: action.links } }
    case 'SET_BACKLINKS':
      return { ...state, links: { ...state.links, backlinks: action.backlinks, backlinksLoading: false, backlinksError: null } }
    case 'SET_BACKLINKS_LOADING':
      return { ...state, links: { ...state.links, backlinksLoading: action.loading } }
    case 'SET_BACKLINKS_ERROR':
      return { ...state, links: { ...state.links, backlinksError: action.error, backlinksLoading: false } }
    case 'SET_UNLINKED_MENTIONS':
      return { ...state, links: { ...state.links, unlinkedMentions: action.entries, unlinkedMentionsLoading: false, unlinkedMentionsError: null } }
    case 'SET_UNLINKED_MENTIONS_LOADING':
      return { ...state, links: { ...state.links, unlinkedMentionsLoading: action.loading } }
    case 'SET_UNLINKED_MENTIONS_ERROR':
      return { ...state, links: { ...state.links, unlinkedMentionsError: action.error, unlinkedMentionsLoading: false } }
    case 'SET_TAGS':
      return { ...state, tags: { ...state.tags, entries: action.entries, loading: false } }
    case 'SET_TAGS_LOADING':
      return { ...state, tags: { ...state.tags, loading: action.loading } }
    case 'SET_TAG_EXPANDED':
      return { ...state, tags: { ...state.tags, expandedTag: action.tag, tagFiles: action.files } }
    case 'SET_PROPERTIES':
      return { ...state, properties: { data: action.data, parseError: action.parseError, rawFrontmatter: action.rawFrontmatter } }
    case 'RESET_DOCUMENT_STATE':
      return {
        ...state,
        outline: { headings: [], activeAnchor: null },
        links: {
          forward: [],
          backlinks: [],
          backlinksLoading: false,
          backlinksError: null,
          unlinkedMentions: [],
          unlinkedMentionsLoading: false,
          unlinkedMentionsError: null,
        },
        tags: { ...state.tags, expandedTag: null, tagFiles: [] },
        properties: { data: null, parseError: null, rawFrontmatter: null },
      }
  }
}

export interface UseDocumentPanelDataParams {
  documentContent: string | null
  documentPath: string | null
  vaultId: string | null
  apiClient: IApiClient | null | undefined
  directoryTree: DirectoryTree | null
}

export interface UseDocumentPanelDataResult {
  state: DocumentPanelState
  dispatch: Dispatch<DocumentPanelAction>
  /** Scrolls the active document to the given heading anchor. */
  onHeadingClick: (anchor: string) => void
  /** Expands/collapses a tag, fetching its file list on first expand. */
  onTagClick: (tagName: string) => void
}

/**
 * Owns the outline/links/tags/properties data for the currently active
 * document — the 4 effects (document switch, debounced content re-parse,
 * vault-change tag reload, realtime backlinks refresh) that used to live
 * directly in ContextPanel.tsx, now independent of which panel renders them.
 */
export function useDocumentPanelData({
  documentContent,
  documentPath,
  vaultId,
  apiClient,
  directoryTree,
}: UseDocumentPanelDataParams): UseDocumentPanelDataResult {
  const [state, dispatch] = useReducer(documentPanelReducer, undefined, createInitialState)

  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const backlinksRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const unlinkedMentionsRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const unlinkedMentionsAbortRef = useRef<AbortController | null>(null)
  const prevDocumentPathRef = useRef<string | null>(null)
  const prevVaultIdRef = useRef<string | null>(null)

  // ─── Document Switch: Reset + Load All ─────────────────────────────────────

  useEffect(() => {
    const pathChanged = documentPath !== prevDocumentPathRef.current

    if (pathChanged) {
      dispatch({ type: 'RESET_DOCUMENT_STATE' })

      if (documentContent !== null && documentPath !== null) {
        loadOutline(dispatch, documentContent)
        loadForwardLinks(dispatch, documentContent, directoryTree, documentPath ?? undefined)
        loadProperties(dispatch, documentContent)
      }

      if (documentPath !== null && vaultId !== null && apiClient) {
        void loadBacklinks(dispatch, apiClient, vaultId, documentPath)

        // Ungelinkte_Erwähnungen: independent, non-blocking search — runs after
        // the above, discarded if the document changes again before it resolves
        // (Requirements 2.9, 2.10).
        unlinkedMentionsAbortRef.current?.abort()
        const controller = new AbortController()
        unlinkedMentionsAbortRef.current = controller
        void loadUnlinkedMentions(dispatch, apiClient, vaultId, documentPath, directoryTree, controller.signal)
      }

      prevDocumentPathRef.current = documentPath
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentPath])

  // ─── Content Change: Debounced Update ──────────────────────────────────────

  useEffect(() => {
    if (documentPath !== prevDocumentPathRef.current) return
    if (documentContent === null) return

    if (debounceTimerRef.current !== null) {
      clearTimeout(debounceTimerRef.current)
    }

    debounceTimerRef.current = setTimeout(() => {
      loadOutline(dispatch, documentContent)
      loadForwardLinks(dispatch, documentContent, directoryTree, documentPath ?? undefined)
      loadProperties(dispatch, documentContent)
      debounceTimerRef.current = null
    }, CONTENT_DEBOUNCE_MS)

    return () => {
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentContent])

  // ─── Vault Change: Load Tags ───────────────────────────────────────────────

  useEffect(() => {
    if (vaultId !== prevVaultIdRef.current) {
      if (vaultId !== null && apiClient) {
        void loadTags(dispatch, apiClient, vaultId)
      } else {
        dispatch({ type: 'SET_TAGS', entries: [] })
      }
      prevVaultIdRef.current = vaultId
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultId])

  // ─── Live Backlinks: Refresh on Remote Vault Changes ───────────────────────

  useEffect(() => {
    if (documentPath === null || vaultId === null || !apiClient) return

    const unsubscribe = onRealtimeVaultChange((event) => {
      if (event.vaultId !== vaultId) return
      if (event.action !== 'saved' && event.action !== 'renamed' && event.action !== 'deleted') return

      if (backlinksRefreshTimerRef.current !== null) {
        clearTimeout(backlinksRefreshTimerRef.current)
      }
      backlinksRefreshTimerRef.current = setTimeout(() => {
        backlinksRefreshTimerRef.current = null
        void loadBacklinks(dispatch, apiClient, vaultId, documentPath)
      }, BACKLINKS_REFRESH_DEBOUNCE_MS)

      // Ungelinkte_Erwähnungen live-refresh (Requirement 2.11) — independently
      // debounced so a failure here doesn't block the backlinks refresh above.
      if (event.action === 'saved' || event.action === 'deleted') {
        if (unlinkedMentionsRefreshTimerRef.current !== null) {
          clearTimeout(unlinkedMentionsRefreshTimerRef.current)
        }
        unlinkedMentionsRefreshTimerRef.current = setTimeout(() => {
          unlinkedMentionsRefreshTimerRef.current = null
          unlinkedMentionsAbortRef.current?.abort()
          const controller = new AbortController()
          unlinkedMentionsAbortRef.current = controller
          void loadUnlinkedMentions(dispatch, apiClient, vaultId, documentPath, directoryTree, controller.signal)
        }, UNLINKED_MENTIONS_REFRESH_DEBOUNCE_MS)
      }
    })

    return () => {
      unsubscribe()
      if (backlinksRefreshTimerRef.current !== null) {
        clearTimeout(backlinksRefreshTimerRef.current)
        backlinksRefreshTimerRef.current = null
      }
      if (unlinkedMentionsRefreshTimerRef.current !== null) {
        clearTimeout(unlinkedMentionsRefreshTimerRef.current)
        unlinkedMentionsRefreshTimerRef.current = null
      }
    }
  }, [documentPath, vaultId, apiClient, directoryTree])

  const onHeadingClick = useCallback((anchor: string) => {
    const element = document.getElementById(anchor)
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }
  }, [])

  const onTagClick = useCallback((tagName: string) => {
    if (state.tags.expandedTag === tagName) {
      dispatch({ type: 'SET_TAG_EXPANDED', tag: null, files: [] })
    } else if (vaultId && apiClient) {
      void expandTag(dispatch, apiClient, vaultId, tagName)
    }
  }, [state.tags.expandedTag, vaultId, apiClient])

  return { state, dispatch, onHeadingClick, onTagClick }
}
