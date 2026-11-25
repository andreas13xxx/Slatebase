/**
 * The extension set of an embedded Markdown editor a plugin builds through
 * Obsidian's internal MarkdownEditor class (TaskNotes' task details, Kanban's
 * card editor). It reuses the main editor's building blocks — the same
 * Markdown language (with `tokenClassNodeProp`), theme, highlighting and Live
 * Preview — so the text there renders like everywhere else in Slatebase.
 *
 * Deliberately left out: spellcheck, the editor context menu, folding,
 * autocompletion and plugin extensions. Those belong to the main editor.
 *
 * Registered with `embedded-editor-bridge.ts` on import.
 *
 * @module embedded-markdown-extensions
 */

import { EditorView, drawSelection, keymap } from '@codemirror/view'
import type { Extension } from '@codemirror/state'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { GFM } from '@lezer/markdown'
import { history, historyKeymap, defaultKeymap } from '@codemirror/commands'
import { tokenClassNodePropSource } from './token-class-node-prop'
import { createSlatebaseTheme, createSlatebaseHighlightStyle } from './theme'
import { createLivePreviewField } from './live-preview'
import { setEmbeddedEditorExtensionsFactory } from './embedded-editor-bridge'
import { getActiveVaultShimRef } from '../plugins/compat/shims/vault-shim'
import type { DirectoryTree } from '../types'

const markdownParserWithProps = (markdownLanguage.parser as unknown as { configure(spec: Record<string, unknown>): unknown }).configure({
  props: [tokenClassNodePropSource],
}) as typeof markdownLanguage.parser

const markdownLanguageWithProps: typeof markdownLanguage = Object.create(markdownLanguage, {
  parser: { value: markdownParserWithProps, configurable: true },
})

/** Vault id and tree of the open vault, for link resolution in Live Preview; null without a vault. */
function renderContext(): { vaultId: string; directoryTree: DirectoryTree } | null {
  const vault = getActiveVaultShimRef() as { getRenderContext?(): { vaultId: string; directoryTree: DirectoryTree } } | null
  return vault?.getRenderContext?.() ?? null
}

/** Builds the extensions for one embedded editor. */
export function createEmbeddedMarkdownExtensions(): Extension[] {
  const context = renderContext()
  const extensions: Extension[] = [
    markdown({ base: markdownLanguageWithProps, codeLanguages: languages, extensions: GFM }),
    createSlatebaseTheme(),
    createSlatebaseHighlightStyle(),
    EditorView.editorAttributes.of({ class: 'cm-s-obsidian' }),
    EditorView.lineWrapping,
    drawSelection(),
    history(),
    keymap.of([...historyKeymap, ...defaultKeymap]),
  ]
  // Live Preview needs the vault to resolve links and embeds; without one the text stays source.
  if (context) {
    extensions.push(createLivePreviewField({ vaultId: context.vaultId, directoryTree: context.directoryTree }))
  }
  return extensions
}

setEmbeddedEditorExtensionsFactory(createEmbeddedMarkdownExtensions)
