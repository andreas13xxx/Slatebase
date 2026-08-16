/**
 * CSS Snippet store — thin async wrapper over IApiClient's snippet endpoints.
 *
 * Unlike favoritesStore (a module-level singleton read from many scattered
 * UI locations), CSS snippets are only managed from one place (Settings >
 * Appearance), so this follows the project's "Action Creator" pattern
 * instead (standalone async functions taking `apiClient` explicitly — see
 * lessons-learned.md's Architektur-Patterns) rather than holding hidden
 * module-level state that would need its own initialize()/disconnect()
 * wiring for no benefit.
 */
import type { IApiClient, SnippetMeta } from '../api'

/** A CSS snippet merged with its activation status (Requirement 8.1). */
export interface CssSnippet {
  id: string
  filename: string
  size: number
  updatedAt: string
  enabled: boolean
}

export interface ISnippetStore {
  /** List all snippets for a vault, merged with their activation status. */
  listForVault(apiClient: IApiClient, vaultId: string): Promise<CssSnippet[]>
  /** Create a new snippet (upload or empty — content may be ''). Rejects if the filename already exists. */
  create(apiClient: IApiClient, vaultId: string, filename: string, content: string): Promise<CssSnippet>
  /** Load a snippet's CSS content. */
  loadContent(apiClient: IApiClient, vaultId: string, snippetId: string): Promise<string>
  /** Save (overwrite) a snippet's CSS content. */
  saveContent(apiClient: IApiClient, vaultId: string, snippetId: string, content: string): Promise<void>
  /** Enable or disable a snippet, persisting the change to the registry. */
  setEnabled(apiClient: IApiClient, vaultId: string, snippetId: string, enabled: boolean): Promise<void>
  /** Delete a snippet. */
  remove(apiClient: IApiClient, vaultId: string, snippetId: string): Promise<void>
}

function toCssSnippet(meta: SnippetMeta, enabled: boolean): CssSnippet {
  return { id: meta.id, filename: meta.filename, size: meta.size, updatedAt: meta.updatedAt, enabled }
}

/** List all snippets for a vault, merged with their activation status. */
export async function listForVault(apiClient: IApiClient, vaultId: string): Promise<CssSnippet[]> {
  const [{ snippets }, registry] = await Promise.all([
    apiClient.listSnippets(vaultId),
    apiClient.loadSnippetRegistry(vaultId),
  ])
  return snippets.map((meta) => toCssSnippet(meta, registry.snippets[meta.id]?.enabled ?? false))
}

/** Create a new snippet (upload or empty — content may be ''). Rejects if the filename already exists. */
export async function create(apiClient: IApiClient, vaultId: string, filename: string, content: string): Promise<CssSnippet> {
  const meta = await apiClient.createSnippet(vaultId, filename, content)
  return toCssSnippet(meta, false)
}

/** Load a snippet's CSS content. */
export async function loadContent(apiClient: IApiClient, vaultId: string, snippetId: string): Promise<string> {
  return apiClient.loadSnippetContent(vaultId, snippetId)
}

/** Save (overwrite) a snippet's CSS content. */
export async function saveContent(apiClient: IApiClient, vaultId: string, snippetId: string, content: string): Promise<void> {
  await apiClient.saveSnippetContent(vaultId, snippetId, content)
}

/** Enable or disable a snippet, persisting the change to the registry. */
export async function setEnabled(apiClient: IApiClient, vaultId: string, snippetId: string, enabled: boolean): Promise<void> {
  const registry = await apiClient.loadSnippetRegistry(vaultId)
  const updated = {
    version: 1 as const,
    snippets: {
      ...registry.snippets,
      [snippetId]: { enabled, updatedAt: new Date().toISOString() },
    },
  }
  await apiClient.saveSnippetRegistry(vaultId, updated)
}

/** Delete a snippet. */
export async function remove(apiClient: IApiClient, vaultId: string, snippetId: string): Promise<void> {
  await apiClient.deleteSnippet(vaultId, snippetId)
}

/** Bundled snippet store implementing ISnippetStore. */
export const snippetStore: ISnippetStore = {
  listForVault,
  create,
  loadContent,
  saveContent,
  setEnabled,
  remove,
}
