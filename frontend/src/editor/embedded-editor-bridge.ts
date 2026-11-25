/**
 * Bridge between the plugin compat layer and the editor module for embedded
 * Markdown editors.
 *
 * Plugins (TaskNotes' details field, Kanban's card editor) build small inline
 * editors on Obsidian's internal MarkdownEditor class, which the compat layer
 * fakes in `plugins/compat/embed-registry.ts`. That module must not import the
 * editor module itself: the live-preview code imports the compat layer, so a
 * direct import would be a cycle at module load. The editor side registers its
 * extension factory here instead (see `embedded-markdown-extensions.ts`), and
 * the compat side asks for it when it builds a view.
 *
 * @module embedded-editor-bridge
 */

import type { Extension } from '@codemirror/state'

/** Builds the CM6 extensions that give an embedded editor Slatebase's Markdown look. */
export type EmbeddedEditorExtensionsFactory = () => Extension[]

let factory: EmbeddedEditorExtensionsFactory | null = null

/** Registers the factory. Called once when the editor module loads. */
export function setEmbeddedEditorExtensionsFactory(next: EmbeddedEditorExtensionsFactory | null): void {
  factory = next
}

/**
 * The extensions for a new embedded editor, or an empty list while no editor
 * module is loaded (tests, or a failure inside the factory) — the embedded
 * editor then stays a plain text editor rather than failing to build.
 */
export function getEmbeddedEditorExtensions(): Extension[] {
  if (!factory) return []
  try {
    return factory()
  } catch {
    return []
  }
}
