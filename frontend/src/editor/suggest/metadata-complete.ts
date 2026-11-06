/**
 * CodeMirror 6 completion source for `#tags` in the text and for property names
 * and values inside the YAML frontmatter.
 *
 * Obsidian suggests tags while typing `#`, and property names/values while
 * editing the Properties block. The candidates come from the vault's metadata
 * index (`getVaultTags`, `getGraphMeta`), fetched lazily and cached briefly so
 * typing never waits on the network after the first popup.
 *
 * Candidates are plain strings and are inserted as document text only, never
 * rendered as HTML.
 *
 * shortcut: property values are offered only for `tags`/`tag` and checkbox-typed
 * keys; vault-wide value lists need a backend endpoint.
 *
 * @module metadata-complete
 */

import type { CompletionSource, CompletionResult, Completion } from '@codemirror/autocomplete'
import type { EditorState } from '@codemirror/state'
import type { PropertyTypeEntry } from '../../state/propertyTypes'

/** Where the completion source gets its candidates from. */
export interface MetadataSuggestSource {
  /** All tag names of the vault, without the leading `#`. */
  getTags(): Promise<string[]>
  /** All frontmatter property keys of the vault. */
  getPropertyKeys(): Promise<string[]>
  /** Likely values for a property key (may be empty). */
  getPropertyValues(key: string): Promise<string[]>
}

/** The slice of the API client the source needs. */
export interface MetadataSuggestApiClient {
  getVaultTags?: (vaultId: string) => Promise<{ tags: Array<{ name: string }> }>
  getGraphMeta?: (vaultId: string) => Promise<{ propertyKeys: Array<{ key: string }> }>
}

/** How long fetched candidates stay valid (ms). */
const CACHE_TTL_MS = 30_000

/**
 * Builds a source that reads from the API and caches each list for a short time.
 * A failed request yields an empty list: a missing suggestion must never block typing.
 */
export function createApiMetadataSource(
  apiClient: MetadataSuggestApiClient | null | undefined,
  vaultId: string,
  getTypeRegistry: () => PropertyTypeEntry[] | null | undefined = () => null,
): MetadataSuggestSource {
  const cache = new Map<string, { at: number; value: Promise<string[]> }>()
  const cached = (key: string, load: () => Promise<string[]>): Promise<string[]> => {
    const hit = cache.get(key)
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value
    const value = load().catch(() => [] as string[])
    cache.set(key, { at: Date.now(), value })
    return value
  }
  const tags = () => cached('tags', async () => {
    if (!apiClient?.getVaultTags || !vaultId) return []
    return (await apiClient.getVaultTags(vaultId)).tags.map((t) => t.name.replace(/^#/, ''))
  })
  return {
    getTags: tags,
    getPropertyKeys: () => cached('keys', async () => {
      if (!apiClient?.getGraphMeta || !vaultId) return []
      return (await apiClient.getGraphMeta(vaultId)).propertyKeys.map((k) => k.key)
    }),
    getPropertyValues: async (key) => {
      if (key === 'tags' || key === 'tag') return tags()
      const entry = getTypeRegistry()?.find((e) => e.key === key)
      return entry?.type === 'checkbox' ? ['true', 'false'] : []
    },
  }
}

/** End offset of the frontmatter block, or null when the document has none. */
function frontmatterEnd(state: EditorState): number | null {
  const { doc } = state
  if (doc.lines < 2 || doc.line(1).text.trimEnd() !== '---') return null
  for (let n = 2; n <= doc.lines; n++) {
    const text = doc.line(n).text.trimEnd()
    if (text === '---' || text === '...') return doc.line(n).to
  }
  return doc.line(doc.lines).to // still being typed: no closing fence yet
}

/** The key a `- item` list line belongs to (nearest preceding non-list `key:` line). */
function listOwnerKey(state: EditorState, lineNo: number): string | null {
  for (let n = lineNo - 1; n >= 2; n--) {
    const text = state.doc.line(n).text
    if (/^\s*-(\s|$)/.test(text)) continue
    const m = /^([^\s:#][^:]*):\s*$/.exec(text)
    return m?.[1]?.trim() ?? null
  }
  return null
}

function toOptions(values: string[], type: Completion['type'], detail: string): Completion[] {
  return values.map((v) => ({ label: v, type, detail }))
}

/**
 * Creates the completion source. `getSource` is read on every request so it
 * follows vault/tab changes without rebuilding the editor extensions.
 */
export function createMetadataCompletions(
  getSource: () => MetadataSuggestSource | null,
  labels: { tag: string; property: string; value: string } = { tag: 'Tag', property: 'Eigenschaft', value: 'Wert' },
): CompletionSource {
  return async (context): Promise<CompletionResult | null> => {
    const source = getSource()
    if (!source) return null
    const { state, pos } = context
    const line = state.doc.lineAt(pos)
    const before = line.text.slice(0, pos - line.from)
    const fmEnd = frontmatterEnd(state)
    const inFrontmatter = fmEnd !== null && line.number >= 2 && pos <= fmEnd && line.text.trimEnd() !== '---'

    if (inFrontmatter) {
      // Property name: only a bare key is being typed at the start of the line.
      const keyMatch = /^([A-Za-z0-9_-]*)$/.exec(before)
      if (keyMatch && (keyMatch[1] || context.explicit)) {
        const typed = keyMatch[1] ?? ''
        const keys = await source.getPropertyKeys()
        return {
          from: pos - typed.length,
          options: keys.map((k) => ({ label: k, type: 'property', detail: labels.property, apply: `${k}: ` })),
          validFor: /^[A-Za-z0-9_-]*$/,
        }
      }
      // Property value: `key: va`, `key: [a, b` or a `- item` list line.
      let key: string | null = null
      const inline = /^([^\s:#][^:]*):\s+\[?(?:[^\],]*,\s*)*[^\s,\][]*$/.exec(before)
      if (inline) key = inline[1]?.trim() ?? null
      else if (/^\s*-\s+[^\s,]*$/.test(before)) key = listOwnerKey(state, line.number)
      if (!key) return null
      const values = await source.getPropertyValues(key)
      if (values.length === 0) return null
      const typed = /([^\s,\][-]*)$/.exec(before)?.[1] ?? ''
      return { from: pos - typed.length, options: toOptions(values, 'text', labels.value), validFor: /^[^\s,\][]*$/ }
    }

    // `#tag` in the text: a `#` that starts a word.
    const tagMatch = /(?:^|[\s(])#([^\s#,.;:!?'"()[\]{}]*)$/.exec(before)
    if (!tagMatch) return null
    const typed = tagMatch[1] ?? ''
    // A bare `#` is a heading marker unless the user asked explicitly.
    if (typed === '' && !context.explicit) return null
    const tags = await source.getTags()
    return {
      from: pos - typed.length,
      options: toOptions(tags, 'keyword', labels.tag),
      validFor: /^[^\s#,.;:!?'"()[\]{}]*$/,
    }
  }
}
