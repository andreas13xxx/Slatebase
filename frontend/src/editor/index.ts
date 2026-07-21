export type { IEditorHandle, EditorFormattingAction } from './types'
export { createSlatebaseTheme, createSlatebaseHighlightStyle } from './theme'
export type { EditorStateEntry } from './state-store'
export {
  getEditorState,
  saveEditorState,
  removeEditorState,
  updateEditorContent,
  editorHistoryExtension
} from './state-store'
export { applyFormatting } from './formatting'
export { createKeybindingsExtension, createEditorCommandHandler } from './keybindings'
export { CodeMirrorEditor } from './CodeMirrorEditor'
export type { CodeMirrorEditorProps } from './CodeMirrorEditor'
export { createBracketCloseExtension } from './bracket-close'
export { createAutoSaveExtension } from './auto-save'
export { createImagePasteExtension } from './image-paste'
export type { ImagePasteOptions } from './image-paste'
export { createVimModeExtension } from './vim-mode'
export type { LivePreviewOptions, LivePreviewState } from './live-preview'
export { createLivePreviewExtension, createLivePreviewCompartmentExtension, createLivePreviewField } from './live-preview'
export type { LinkDecorationOptions, LinkDecorationResult } from './live-preview'
export { buildLinkDecorations, createLinkClickHandler } from './live-preview'
export type { IPluginExtensionManager } from './plugin-extensions'
export {
  setActiveEditorView,
  registerPluginExtension,
  removePluginExtensions,
  getActivePluginExtensions,
  registerPluginCompletionSource,
  removePluginCompletionSources,
  getActivePluginCompletions,
  resetPluginExtensions,
} from './plugin-extensions'
export type { Pos, IEditor, IEditorTransaction } from './editor-shim'
export { EditorShim, posToOffset, offsetToPos } from './editor-shim'
