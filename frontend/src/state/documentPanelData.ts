/**
 * Document-derived panel data (outline, forward/backlinks, tags) for the
 * active document — hoisted out of the old right-side-only ContextPanel.tsx
 * so either side panel can host these built-in views. Unlike panel layout
 * state (`panelState.ts`), this doesn't belong to a specific side: it's a
 * single, app-wide slice of "what does the currently open document look
 * like," fetched once and read by whichever panel currently has
 * Outline/Links/Tags in its tab order.
 *
 * Frontmatter properties are NOT part of this state: editing them happens
 * inline in the document itself (see FrontmatterWidget in
 * editor/live-preview/widget-decorations.ts), and browsing/curating the
 * vault-wide property registry is PropertiesOverview's own self-contained
 * concern (components/context-panel/PropertiesOverview.tsx).
 */

import { useCallback, useEffect, useMemo, useReducer, useRef } from 'react'
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
  loadDocumentTags,
  expandTag,
} from './documentPanelActions'

// ─── Constants ───────────────────────────────────────────────────────────────

/** Debounce delay for content-change updates (outline, forward links). */
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
  /**
   * Files carrying this tag. Comes along with the tag list from the same
   * request the expand uses, so a refresh can correct an already-open tag's
   * file list without a second round-trip. Optional: consumers that only
   * render the tag row don't need to supply it.
   */
  files?: string[]
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
    /**
     * Tags of the open document as it currently reads in the editor, including
     * unsaved edits — `null` when no markdown document is open. The vault-wide
     * `entries` only change when the backend re-indexes on save, so a tag being
     * typed or deleted right now is layered on top of them from here.
     */
    documentTags: string[] | null
    /** Path `documentTags` was parsed from, so the overlay edits the right file. */
    documentTagsPath: string | null
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
  | { type: 'SET_DOCUMENT_TAGS'; path: string | null; tags: string[] | null }
  | { type: 'RESET_DOCUMENT_STATE' }

/** Order-insensitive comparison, so a re-parse that found nothing new is a no-op. */
function sameTags(a: string[] | null, b: string[] | null): boolean {
  if (a === b) return true
  if (a === null || b === null || a.length !== b.length) return false
  const set = new Set(a)
  return b.every((tag) => set.has(tag))
}

/**
 * Layers the open document's current tags over the vault-wide list.
 *
 * The list comes from the link index, which only learns about a tag once the
 * note is saved. Rather than wait for that round-trip, the open document's
 * contribution is recomputed here: its saved contribution is subtracted and its
 * current one added, so a tag typed just now appears immediately and one just
 * deleted disappears — and re-applying after the save that makes it official
 * lands on the same answer.
 *
 * Entries without a `files` list are passed through untouched: without it there
 * is no way to tell whether the open document is already counted.
 *
 * @param entries - Vault-wide tag list as the backend reported it
 * @param documentPath - Path of the open document, or null when none is
 * @param documentTags - Its tags as currently edited, or null when unknown
 */
export function applyDocumentTags(
  entries: TagEntry[],
  documentPath: string | null,
  documentTags: string[] | null,
): TagEntry[] {
  if (documentPath === null || documentTags === null) return entries

  const current = new Set(documentTags)
  const result: TagEntry[] = []
  const seen = new Set<string>()

  for (const entry of entries) {
    seen.add(entry.name)

    if (!entry.files) {
      result.push(entry)
      continue
    }

    const counted = entry.files.includes(documentPath)
    const shouldCount = current.has(entry.name)
    if (counted === shouldCount) {
      result.push(entry)
      continue
    }

    const files = shouldCount
      ? [...entry.files, documentPath]
      : entry.files.filter((file) => file !== documentPath)

    // The open document was the tag's last note — the tag is gone with it.
    if (files.length === 0) continue

    result.push({ ...entry, count: files.length, files })
  }

  for (const name of documentTags) {
    if (seen.has(name)) continue
    seen.add(name)
    result.push({ name, count: 1, files: [documentPath] })
  }

  return result
}

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
    tags: { entries: [], loading: false, expandedTag: null, tagFiles: [], documentTags: null, documentTagsPath: null },
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
    case 'SET_TAGS': {
      const expanded = state.tags.expandedTag
      if (expanded === null) {
        return { ...state, tags: { ...state.tags, entries: action.entries, loading: false } }
      }
      // Keep an open tag in sync with the refreshed list: the tag itself can be
      // gone (its last note was deleted), or still exist with fewer files.
      const match = action.entries.find((entry) => entry.name === expanded)
      if (!match) {
        return { ...state, tags: { ...state.tags, entries: action.entries, loading: false, expandedTag: null, tagFiles: [] } }
      }
      return {
        ...state,
        tags: {
          ...state.tags,
          entries: action.entries,
          loading: false,
          tagFiles: match.files ?? state.tags.tagFiles,
        },
      }
    }
    case 'SET_TAGS_LOADING':
      return { ...state, tags: { ...state.tags, loading: action.loading } }
    case 'SET_TAG_EXPANDED':
      return { ...state, tags: { ...state.tags, expandedTag: action.tag, tagFiles: action.files } }
    case 'SET_DOCUMENT_TAGS': {
      const unchanged =
        state.tags.documentTagsPath === action.path &&
        sameTags(state.tags.documentTags, action.tags)
      if (unchanged) return state
      return { ...state, tags: { ...state.tags, documentTags: action.tags, documentTagsPath: action.path } }
    }
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
        tags: { ...state.tags, expandedTag: null, tagFiles: [], documentTags: null, documentTagsPath: null },
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
 * Owns the outline/links/tags data for the currently active document — the 4
 * effects (document switch, debounced content re-parse, vault-change tag
 * reload, realtime backlinks refresh) that used to live directly in
 * ContextPanel.tsx, now independent of which panel renders them.
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
        loadDocumentTags(dispatch, documentPath, documentContent)
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
      loadDocumentTags(dispatch, documentPath, documentContent)
      debounceTimerRef.current = null
    }, CONTENT_DEBOUNCE_MS)

    return () => {
      if (debounceTimerRef.current !== null) {
        clearTimeout(debounceTimerRef.current)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [documentContent])

  // ─── Vault, File-Set or Document Change: Load Tags ─────────────────────────
  //
  // The tag list is vault-wide, not document-scoped, so it goes stale whenever
  // files elsewhere in the vault change — most visibly on delete, where the
  // removed note's tags kept showing up until the vault was switched or the app
  // reloaded. `directoryTree` is the signal for that: it is re-fetched (new
  // object identity) after every create/delete/move/rename, local or remote.
  //
  // `documentPath` is the second trigger, and it covers saves. A save re-indexes
  // the note without touching the file set, so the list would stay stale — while
  // that note is open the live overlay below hides that, but the overlay drops
  // away the moment another document takes its place. Re-fetching on the switch
  // hands over to a list that already knows what the save produced.
  //
  // Only a switch to a different vault shows the loading state; a refresh after
  // a mutation corrects a list that is already on screen.

  useEffect(() => {
    const vaultChanged = vaultId !== prevVaultIdRef.current
    prevVaultIdRef.current = vaultId

    if (vaultId === null || !apiClient) {
      dispatch({ type: 'SET_TAGS', entries: [] })
      return
    }

    void loadTags(dispatch, apiClient, vaultId, vaultChanged)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [vaultId, directoryTree, documentPath])

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

  // The vault-wide list only moves when the backend re-indexes on save; the
  // open document's own tags are layered on live so setting or deleting one
  // shows up in the panel as it is typed rather than a save later.
  const liveTags = useMemo(
    () => applyDocumentTags(state.tags.entries, state.tags.documentTagsPath, state.tags.documentTags),
    [state.tags.entries, state.tags.documentTagsPath, state.tags.documentTags],
  )

  const liveTagFiles = useMemo(() => {
    if (state.tags.expandedTag === null) return state.tags.tagFiles
    const match = liveTags.find((entry) => entry.name === state.tags.expandedTag)
    return match?.files ?? state.tags.tagFiles
  }, [liveTags, state.tags.expandedTag, state.tags.tagFiles])

  const liveState = useMemo(
    () => ({ ...state, tags: { ...state.tags, entries: liveTags, tagFiles: liveTagFiles } }),
    [state, liveTags, liveTagFiles],
  )

  return { state: liveState, dispatch, onHeadingClick, onTagClick }
}
