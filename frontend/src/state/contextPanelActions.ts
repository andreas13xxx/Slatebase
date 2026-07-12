/**
 * Context panel action creators — standalone async functions that parse content
 * or call the API and dispatch appropriate ContextPanelActions.
 *
 * Pattern: parse/fetch data → dispatch result or error state.
 * All actions handle errors gracefully (dispatch error state, don't throw).
 */

import type { Dispatch } from 'react'
import type { ContextPanelAction, LinkEntry, TagEntry } from './contextPanelState'
import type { IApiClient } from '../api'
import { extractErrorMessage } from '../utils/error'
import type { DirectoryTree } from '../types'
import { extractHeadings } from '../components/context-panel/utils/extractHeadings'
import { extractWikilinks } from '../plugins/wikilink/extract'
import { parseFrontmatter } from '../components/context-panel/utils/parseFrontmatter'
import { resolveWikilinkTarget } from '../plugins/link-resolver'

/**
 * Parses headings from markdown content and dispatches SET_OUTLINE.
 *
 * @param dispatch - The context panel dispatch function
 * @param content - Raw markdown content of the active document
 */
export function loadOutline(
  dispatch: Dispatch<ContextPanelAction>,
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
 * @param dispatch - The context panel dispatch function
 * @param content - Raw markdown content of the active document
 * @param vaultTree - The vault's directory tree for link resolution (or null)
 */
export function loadForwardLinks(
  dispatch: Dispatch<ContextPanelAction>,
  content: string,
  vaultTree: DirectoryTree | null,
): void {
  try {
    const wikilinks = extractWikilinks(content)
    const links: LinkEntry[] = wikilinks.map((link) => {
      const resolved = resolveWikilinkTarget(link.target, vaultTree) !== null
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
 * @param dispatch - The context panel dispatch function
 * @param apiClient - The API client instance
 * @param vaultId - The current vault ID
 * @param filePath - The relative file path of the active document
 */
export async function loadBacklinks(
  dispatch: Dispatch<ContextPanelAction>,
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

/**
 * Fetches vault-wide tags from the backend and dispatches SET_TAGS.
 * Sets loading state before the request.
 *
 * @param dispatch - The context panel dispatch function
 * @param apiClient - The API client instance
 * @param vaultId - The current vault ID
 */
export async function loadTags(
  dispatch: Dispatch<ContextPanelAction>,
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
 * Parses YAML frontmatter from markdown content and dispatches SET_PROPERTIES.
 *
 * @param dispatch - The context panel dispatch function
 * @param content - Raw markdown content of the active document
 */
export function loadProperties(
  dispatch: Dispatch<ContextPanelAction>,
  content: string,
): void {
  try {
    const result = parseFrontmatter(content)
    dispatch({
      type: 'SET_PROPERTIES',
      data: result.data,
      parseError: result.parseError,
      rawFrontmatter: result.rawFrontmatter,
    })
  } catch {
    // On unexpected failure, dispatch null properties
    dispatch({
      type: 'SET_PROPERTIES',
      data: null,
      parseError: null,
      rawFrontmatter: null,
    })
  }
}

/**
 * Fetches files for a specific tag and dispatches SET_TAG_EXPANDED.
 * Uses the tags endpoint response which includes file lists per tag.
 *
 * @param dispatch - The context panel dispatch function
 * @param apiClient - The API client instance
 * @param vaultId - The current vault ID
 * @param tagName - The tag name to expand (without # prefix)
 */
export async function expandTag(
  dispatch: Dispatch<ContextPanelAction>,
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


