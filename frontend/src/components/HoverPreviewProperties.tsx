/**
 * HoverPreviewProperties — the editable frontmatter block shown at the top of a
 * hover preview popover.
 *
 * Obsidian 1.9.10 made the property editor available inside the page preview
 * (and Canvas); this is Slatebase's counterpart for the hover preview. Unlike
 * the in-document FrontmatterWidget — which dispatches straight into the live
 * CodeMirror view — the previewed note is a *different*, read-only file, so a
 * commit rewrites the frontmatter in the fetched content string and saves it
 * back through the API, then hands the new content up so the popover re-renders.
 *
 * It reuses the same `PropertiesEditor` the sidebar/document use, so the type
 * controls, inference and type-registry behaviour are identical everywhere.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { PropertiesEditor } from './context-panel/PropertiesEditor'
import { parseFrontmatter } from './context-panel/utils/parseFrontmatter'
import { applyFrontmatterChange } from '../utils/frontmatterWriter'
import type { IApiClient } from '../api'
import type { PropertyType, PropertyTypeEntry } from '../state/propertyTypes'

export interface HoverPreviewPropertiesProps {
  /** Full markdown content of the previewed note (including frontmatter). */
  content: string
  vaultId: string
  filePath: string
  apiClient: IApiClient
  hasWriteAccess: boolean
  /** Called with the full new content after a successful save, so the popover re-renders. */
  onContentChange: (newContent: string) => void
}

export function HoverPreviewProperties({
  content,
  vaultId,
  filePath,
  apiClient,
  hasWriteAccess,
  onContentChange,
}: HoverPreviewPropertiesProps) {
  const [typeRegistry, setTypeRegistry] = useState<PropertyTypeEntry[] | null>(null)

  // Load the vault's property-type registry once per vault, same source the
  // sidebar/document editors read.
  useEffect(() => {
    let cancelled = false
    apiClient
      .getPropertyTypes(vaultId)
      .then((registry) => {
        if (!cancelled) setTypeRegistry(registry.entries ?? [])
      })
      .catch(() => {
        if (!cancelled) setTypeRegistry([])
      })
    return () => {
      cancelled = true
    }
  }, [apiClient, vaultId])

  const { data, parseError, rawFrontmatter } = useMemo(() => parseFrontmatter(content), [content])

  // Latest content including edits committed this render cycle. React only
  // re-renders (and refreshes `content`) on the next cycle, so two commits in
  // the same cycle would both read the stale `content` prop and the first edit
  // would be silently overwritten. `commit` advances this ref synchronously and
  // `current()` reads from it, so each edit builds on the previous result. It is
  // re-synced to `content` whenever a fresh server copy arrives.
  const latestContentRef = useRef(content)
  useEffect(() => {
    latestContentRef.current = content
  }, [content])

  // Preserve the on-disk key order across a commit so a save doesn't reshuffle
  // the user's frontmatter.
  const keyOrder = useMemo(() => (data ? Object.keys(data) : []), [data])

  const commit = useCallback(
    (newData: Record<string, unknown>): void => {
      const base = latestContentRef.current
      const newContent = applyFrontmatterChange(base, newData, keyOrder)
      if (newContent === base) return
      // Advance the ref synchronously so a second edit in the same render cycle
      // reads this result, not the stale `content` prop.
      latestContentRef.current = newContent
      // Optimistically hand the new content up so the popover reflects the edit
      // immediately; the save round-trip then persists it.
      onContentChange(newContent)
      void apiClient.saveFile(vaultId, filePath, newContent).catch(() => {
        // On failure, roll the preview back to the server's last-known content.
        latestContentRef.current = content
        onContentChange(content)
      })
    },
    [apiClient, vaultId, filePath, content, keyOrder, onContentChange],
  )

  const current = useCallback(
    (): Record<string, unknown> => parseFrontmatter(latestContentRef.current).data ?? {},
    [],
  )

  // No frontmatter at all, and no write access to add any → render nothing, so
  // the popover stays compact for plain notes.
  if (data === null && parseError === null && !hasWriteAccess) return null

  return (
    <div className="hover-preview__properties">
      <PropertiesEditor
        data={data}
        parseError={parseError}
        rawFrontmatter={rawFrontmatter}
        typeRegistry={typeRegistry}
        hasDocument={true}
        isMarkdown={true}
        onCommit={(key, value) => {
          if (!hasWriteAccess) return
          const next = current()
          next[key] = value
          commit(next)
        }}
        onAddProperty={(key, value) => {
          if (!hasWriteAccess) return
          const next = current()
          next[key] = value
          commit(next)
        }}
        onDeleteProperty={(key) => {
          if (!hasWriteAccess) return
          const next = current()
          delete next[key]
          commit(next)
        }}
        onRenameProperty={(oldKey, newKey) => {
          if (!hasWriteAccess) return
          const source = current()
          const renamed: Record<string, unknown> = {}
          for (const [k, v] of Object.entries(source)) {
            renamed[k === oldKey ? newKey : k] = v
          }
          commit(renamed)
        }}
        onTypeChange={(key, type: PropertyType) => {
          if (!hasWriteAccess) return
          void apiClient.setPropertyType(vaultId, key, type).catch(() => {})
        }}
      />
    </div>
  )
}
