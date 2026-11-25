/**
 * The built-in places that can show a page preview — Obsidian's "Page preview" hover sources.
 *
 * `id` is the key in the vault's `.obsidian/page-preview.json` and the `source` of a hover
 * request. Slatebase's own rendered links use the bus id `internal-link`, stored under `preview`
 * (see `pagePreviewKey`). Obsidian's "Properties view" source is not offered: Slatebase's
 * properties list holds property names, not notes, so there is nothing to preview there.
 *
 * @module state/pagePreviewSources
 */

import type { TranslationKey } from '../i18n'

export interface PagePreviewSourceDef {
  id: string
  labelKey: TranslationKey
}

export const PAGE_PREVIEW_SOURCES: readonly PagePreviewSourceDef[] = [
  { id: 'search', labelKey: 'pagePreview.sources.search' },
  { id: 'preview', labelKey: 'pagePreview.sources.preview' },
  { id: 'editor', labelKey: 'pagePreview.sources.editor' },
  { id: 'tab-header', labelKey: 'pagePreview.sources.tabHeader' },
  { id: 'file-explorer', labelKey: 'pagePreview.sources.fileExplorer' },
  { id: 'bookmarks', labelKey: 'pagePreview.sources.bookmarks' },
  { id: 'outline', labelKey: 'pagePreview.sources.outline' },
  { id: 'bases', labelKey: 'pagePreview.sources.bases' },
  { id: 'graph', labelKey: 'pagePreview.sources.graph' },
]
