/**
 * Document panel action creators — standalone async functions that parse content
 * or call the API and dispatch appropriate DocumentPanelActions.
 *
 * Pattern: parse/fetch data → dispatch result or error state.
 * All actions handle errors gracefully (dispatch error state, don't throw).
 */

import type { Dispatch } from 'react'
import type { DocumentPanelAction, LinkEntry, TagEntry, UnlinkedMentionEntry } from './documentPanelData'
import type { IApiClient } from '../api'
import type { SearchFileResult } from './searchState'
import { extractErrorMessage } from '../utils/error'
import type { DirectoryTree } from '../types'
import { extractHeadings } from '../components/context-panel/utils/extractHeadings'
import { extractWikilinks } from '../plugins/wikilink/extract'
import { resolveWikilinkTarget } from '../plugins/link-resolver'

/**
 * Parses headings from markdown content and dispatches SET_OUTLINE.
 *
 * @param dispatch - The document panel dispatch function
 * @param content - Raw markdown content of the active document
 */
export function loadOutline(
  dispatch: Dispatch<DocumentPanelAction>,
  content: string,
): void {
  try {
    const headings = extractHeadings(content)
    dispatch({ type: 'SET_OUTLINE', headings })
  } catch {
    // On parse failure, dispatch empty headings
    dispatch({ type: 'SET_OUTLINE', headings: [] })
  }
}

/**
 * Extracts wikilinks from markdown content and dispatches SET_FORWARD_LINKS.
 * Resolves each link target against the vault tree to determine if it exists.
 *
 * @param dispatch - The document panel dispatch function
 * @param content - Raw markdown content of the active document
 * @param vaultTree - The vault's directory tree for link resolution (or null)
 */
export function loadForwardLinks(
  dispatch: Dispatch<DocumentPanelAction>,
  content: string,
  vaultTree: DirectoryTree | null,
  sourcePath?: string,
): void {
  try {
    const wikilinks = extractWikilinks(content)
    const links: LinkEntry[] = wikilinks.map((link) => {
      const resolved = resolveWikilinkTarget(link.target, vaultTree, sourcePath) !== null
      const displayName = link.display || link.target
      return {
        target: link.target,
        displayName,
        resolved,
      }
    })
    dispatch({ type: 'SET_FORWARD_LINKS', links })
  } catch {
    // On extraction failure, dispatch empty forward links
    dispatch({ type: 'SET_FORWARD_LINKS', links: [] })
  }
}

/**
 * Fetches backlinks from the backend and dispatches SET_BACKLINKS.
 * Sets loading state before the request and error state on failure.
 *
 * @param dispatch - The document panel dispatch function
 * @param apiClient - The API client instance
 * @param vaultId - The current vault ID
 * @param filePath - The relative file path of the active document
 */
export async function loadBacklinks(
  dispatch: Dispatch<DocumentPanelAction>,
  apiClient: IApiClient,
  vaultId: string,
  filePath: string,
): Promise<void> {
  dispatch({ type: 'SET_BACKLINKS_LOADING', loading: true })
  dispatch({ type: 'SET_BACKLINKS_ERROR', error: null })
  try {
    const response = await apiClient.getBacklinks(vaultId, filePath)
    const backlinks: LinkEntry[] = response.backlinks.map((sourcePath) => ({
      target: sourcePath,
      displayName: formatLinkDisplayName(sourcePath),
      resolved: true, // Backlinks always reference existing files
    }))
    dispatch({ type: 'SET_BACKLINKS', backlinks })
  } catch (err: unknown) {
    const message = extractErrorMessage(err)
    dispatch({ type: 'SET_BACKLINKS_ERROR', error: message })
  }
}

/** Response shape from the search endpoint (searchVault returns `unknown`, see searchActions.ts). */
interface SearchVaultResponse {
  results: SearchFileResult[]
}

/**
 * Finds Ungelinkte_Erwähnungen (Requirement 2) of `targetFilePath` across the vault:
 * files whose content contains the active file's name as plain text, outside of
 * an existing wikilink that already resolves to it. Dispatches SET_UNLINKED_MENTIONS
 * on success or SET_UNLINKED_MENTIONS_ERROR on failure.
 *
 * Runs independently of and after loadForwardLinks/loadBacklinks — does not block
 * the rest of the Links_View from rendering (Requirement 2.10).
 *
 * @param dispatch - The document panel dispatch function
 * @param apiClient - The API client instance
 * @param vaultId - The current vault ID
 * @param filePath - The relative file path of the active document
 * @param vaultTree - The vault's directory tree, used to resolve wikilinks found on candidate lines
 * @param signal - Optional AbortSignal; if aborted before the response resolves, no action is dispatched (staleness guard for fast document switches, Requirement 2.9)
 */
export async function loadUnlinkedMentions(
  dispatch: Dispatch<DocumentPanelAction>,
  apiClient: IApiClient,
  vaultId: string,
  filePath: string,
  vaultTree: DirectoryTree | null,
  signal?: AbortSignal,
): Promise<void> {
  dispatch({ type: 'SET_UNLINKED_MENTIONS_LOADING', loading: true })
  dispatch({ type: 'SET_UNLINKED_MENTIONS_ERROR', error: null })

  const baseName = extractBaseName(filePath)
  if (baseName === '') {
    dispatch({ type: 'SET_UNLINKED_MENTIONS', entries: [] })
    return
  }

  try {
    const params: Record<string, string> = {
      query: baseName,
      caseSensitive: 'false',
      regex: 'false',
      contextLines: '0',
      maxResults: '50',
    }
    const rawResult = await apiClient.searchVault(vaultId, params)
    if (signal?.aborted) return

    const { results } = rawResult as SearchVaultResponse
    const entries: UnlinkedMentionEntry[] = []
    for (const fileResult of results) {
      if (fileResult.filePath === filePath) continue
      const firstUnlinkedHit = fileResult.hits.find(
        (hit) => !lineHasWikilinkTo(hit.matchLine, fileResult.filePath, filePath, vaultTree),
      )
      if (firstUnlinkedHit) {
        entries.push({
          filePath: fileResult.filePath,
          snippet: firstUnlinkedHit.matchLine.trim(),
          lineNumber: firstUnlinkedHit.line,
        })
      }
    }

    if (signal?.aborted) return
    dispatch({ type: 'SET_UNLINKED_MENTIONS', entries })
  } catch (err: unknown) {
    if (signal?.aborted) return
    const message = extractErrorMessage(err)
    dispatch({ type: 'SET_UNLINKED_MENTIONS_ERROR', error: message })
  }
}

/**
 * Converts a single Ungelinkte_Erwähnung into a real wikilink (Requirement 2.7).
 * Fetches the mention's file, replaces the first case-insensitive occurrence of
 * `activeFileBaseName` found on the recorded line with `[[activeFileBaseName]]`,
 * and saves. Only that one occurrence is rewritten — not every occurrence in the
 * file — to avoid unintentionally linking unrelated text elsewhere in the file.
 * The Links_View refreshes itself afterwards via the existing realtime
 * saved-event listener; no explicit refresh call is needed here.
 */
export async function linkUnlinkedMention(
  apiClient: IApiClient,
  vaultId: string,
  entry: UnlinkedMentionEntry,
  activeFileBaseName: string,
): Promise<void> {
  const file = await apiClient.fetchFileContent(vaultId, entry.filePath)
  const lines = file.content.split('\n')
  const lineIndex = entry.lineNumber - 1
  const line = lines[lineIndex]
  if (line === undefined) return

  const pattern = new RegExp(escapeRegExp(activeFileBaseName), 'i')
  const match = pattern.exec(line)
  if (!match) return

  const before = line.slice(0, match.index)
  const after = line.slice(match.index + match[0].length)
  lines[lineIndex] = `${before}[[${activeFileBaseName}]]${after}`

  await apiClient.saveFile(vaultId, entry.filePath, lines.join('\n'))
}

/** Escapes regex metacharacters so a filename can be used as a literal search pattern. */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Extracts the file name without its `.md` extension from a (possibly nested) path.
 * Returns an empty string for a path with no usable base name.
 */
function extractBaseName(filePath: string): string {
  const segments = filePath.split('/')
  const last = segments[segments.length - 1] ?? ''
  return last.replace(/\.md$/i, '')
}

/**
 * Checks whether a single line already contains a wikilink resolving to `targetFilePath`.
 * A line-level check (not a character-offset check) — search hits don't carry a column,
 * so a line with both a wikilink and a separate plain-text mention is treated as fully
 * linked. Acceptable simplification: the common case is one or the other, not both.
 */
function lineHasWikilinkTo(
  line: string,
  sourceFilePath: string,
  targetFilePath: string,
  vaultTree: DirectoryTree | null,
): boolean {
  try {
    const links = extractWikilinks(line)
    return links.some((link) => resolveWikilinkTarget(link.target, vaultTree, sourceFilePath) === targetFilePath)
  } catch {
    return false
  }
}

/**
 * Fetches vault-wide tags from the backend and dispatches SET_TAGS.
 * Sets loading state before the request.
 *
 * @param dispatch - The document panel dispatch function
 * @param apiClient - The API client instance
 * @param vaultId - The current vault ID
 */
export async function loadTags(
  dispatch: Dispatch<DocumentPanelAction>,
  apiClient: IApiClient,
  vaultId: string,
): Promise<void> {
  dispatch({ type: 'SET_TAGS_LOADING', loading: true })
  try {
    const response = await apiClient.getVaultTags(vaultId)
    const entries: TagEntry[] = response.tags.map((tag) => ({
      name: tag.name,
      count: tag.count,
    }))
    dispatch({ type: 'SET_TAGS', entries })
  } catch {
    // On failure, dispatch empty tags (loading will be set to false by SET_TAGS)
    dispatch({ type: 'SET_TAGS', entries: [] })
  }
}

/**
 * Fetches files for a specific tag and dispatches SET_TAG_EXPANDED.
 * Uses the tags endpoint response which includes file lists per tag.
 *
 * @param dispatch - The document panel dispatch function
 * @param apiClient - The API client instance
 * @param vaultId - The current vault ID
 * @param tagName - The tag name to expand (without # prefix)
 */
export async function expandTag(
  dispatch: Dispatch<DocumentPanelAction>,
  apiClient: IApiClient,
  vaultId: string,
  tagName: string,
): Promise<void> {
  try {
    const response = await apiClient.getVaultTags(vaultId)
    const tagInfo = response.tags.find((t) => t.name === tagName)
    const files = tagInfo?.files ?? []
    dispatch({ type: 'SET_TAG_EXPANDED', tag: tagName, files })
  } catch {
    // On failure, expand with empty file list
    dispatch({ type: 'SET_TAG_EXPANDED', tag: tagName, files: [] })
  }
}

/**
 * Formats a file path as a display name for link entries.
 * Shows filename without extension if no path prefix, otherwise relative path.
 */
function formatLinkDisplayName(filePath: string): string {
  const parts = filePath.split('/')
  const fileName = parts[parts.length - 1] ?? filePath
  // Remove .md extension for display
  if (fileName.endsWith('.md')) {
    return parts.length > 1
      ? filePath.slice(0, -3)
      : fileName.slice(0, -3)
  }
  return filePath
}
