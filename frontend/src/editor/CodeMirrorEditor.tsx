import React, { useRef, useEffect, useImperativeHandle, useCallback } from 'react'
import { EditorState, Compartment, type Extension } from '@codemirror/state'
import { EditorView, lineNumbers as cmLineNumbers } from '@codemirror/view'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { search } from '@codemirror/search'
import { undo as cmUndo, redo as cmRedo } from '@codemirror/commands'
import { autocompletion, type CompletionSource } from '@codemirror/autocomplete'
import type { IEditorHandle, EditorFormattingAction } from './types'
import { createSlatebaseTheme, createSlatebaseHighlightStyle } from './theme'
import { getEditorState, saveEditorState, editorHistoryExtension } from './state-store'
import { applyFormatting as applyFormattingAction } from './formatting'
import { createLivePreviewCompartmentExtension, createLivePreviewField, type LivePreviewOptions } from './live-preview'
import { setActiveEditorView, getActivePluginExtensions, getActivePluginCompletions } from './plugin-extensions'
import './live-preview/live-preview.css'

/**
 * Props for the CodeMirror 6 editor component.
 * Replaces the <textarea> in EditMode with a full CM6 EditorView.
 */
export interface CodeMirrorEditorProps {
  /** Current file content (server truth or editBuffer). */
  content: string
  /** Callback on content change (same interface as textarea onChange). */
  onContentChange: (content: string) => void
  /** Whether the editor is read-only. */
  readOnly?: boolean
  /** Unique tab ID for per-tab state management. */
  tabId: string
  /** File path for language detection and context. */
  filePath?: string
  /** Whether Live Preview mode is active. */
  livePreview?: boolean
  /** Options for the Live Preview extension (vault context, callbacks). */
  livePreviewOptions?: LivePreviewOptions
  /** Whether line numbers should be shown. */
  showLineNumbers?: boolean
  /** Whether Vim mode is enabled. */
  vimMode?: boolean
  /** Whether bracket auto-close is enabled. */
  bracketAutoClose?: boolean
  /** Plugin extensions to apply (from registerEditorExtension). */
  pluginExtensions?: Extension[]
  /** Plugin autocomplete providers (from registerEditorSuggest). */
  pluginCompletions?: CompletionSource[]
  /** Ref to expose imperative editor API to parent. */
  editorRef?: React.RefObject<IEditorHandle | null>
}

/**
 * CodeMirror 6 editor component.
 * Manages EditorView lifecycle, per-tab state persistence, and exposes
 * imperative handle for toolbar/command palette integration.
 */
export function CodeMirrorEditor({
  content,
  onContentChange,
  readOnly = false,
  tabId,
  filePath: _filePath,
  livePreview = false,
  livePreviewOptions,
  showLineNumbers = false,
  vimMode: _vimMode,
  bracketAutoClose: _bracketAutoClose,
  pluginExtensions: _pluginExtensions,
  pluginCompletions: _pluginCompletions,
  editorRef,
}: CodeMirrorEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const prevTabIdRef = useRef<string>(tabId)
  const onContentChangeRef = useRef(onContentChange)

  // Compartments for dynamic reconfiguration
  const readOnlyCompartment = useRef(new Compartment())
  const lineNumbersCompartment = useRef(new Compartment())
  const livePreviewCompartment = useRef(new Compartment())

  // Keep onContentChange ref up to date without recreating extensions
  useEffect(() => {
    onContentChangeRef.current = onContentChange
  }, [onContentChange])

  /**
   * Build the extensions array for a fresh EditorState.
   */
  const buildExtensions = useCallback((): Extension[] => {
    // Auto-disable Live Preview for files >50,000 chars
    const effectiveLivePreview = livePreview && content.length <= 50000
    if (livePreview && content.length > 50000) {
      console.warn('[CodeMirrorEditor] Live Preview auto-disabled: file exceeds 50,000 characters')
    }

    // Collect plugin-provided completions
    const pluginCompletionSources = getActivePluginCompletions()

    const extensions: Extension[] = [
      markdown({ base: markdownLanguage, codeLanguages: languages }),
      createSlatebaseTheme(),
      createSlatebaseHighlightStyle(),
      editorHistoryExtension,
      search(),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          onContentChangeRef.current(update.state.doc.toString())
        }
      }),
      readOnlyCompartment.current.of(EditorState.readOnly.of(readOnly)),
      lineNumbersCompartment.current.of(
        showLineNumbers ? cmLineNumbers() : []
      ),
      createLivePreviewCompartmentExtension(
        livePreviewCompartment.current,
        livePreviewOptions ?? { vaultId: '', directoryTree: null },
        effectiveLivePreview
      ),
      // Plugin-provided CM6 extensions (each in its own Compartment)
      ...getActivePluginExtensions(),
    ]

    // Include autocompletion with plugin completions if any are registered
    if (pluginCompletionSources.length > 0) {
      extensions.push(autocompletion({ override: pluginCompletionSources }))
    }

    return extensions
  }, [readOnly, showLineNumbers, livePreview, livePreviewOptions, content])

  /**
   * Save the current editor state to the store.
   */
  const saveCurrentState = useCallback((id: string) => {
    const view = viewRef.current
    if (!view) return
    saveEditorState(id, {
      state: view.state,
      scrollTop: view.scrollDOM.scrollTop,
      scrollLeft: view.scrollDOM.scrollLeft,
    })
  }, [])

  // Mount / tab switch effect
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    // If tab changed, save old state
    if (prevTabIdRef.current !== tabId && viewRef.current) {
      saveCurrentState(prevTabIdRef.current)
      viewRef.current.destroy()
      viewRef.current = null
    }
    prevTabIdRef.current = tabId

    // If view already exists for current tab, skip creation
    if (viewRef.current) return

    // Restore or create EditorState
    const stored = getEditorState(tabId)
    let state: EditorState

    if (stored) {
      // Restore document content and selection from stored state,
      // but recreate extensions with fresh Compartments to avoid stale references.
      // Fresh Compartment instances on remount ≠ Compartments in stored state,
      // so reconfigure() would fail silently with the old state's compartments.
      state = EditorState.create({
        doc: stored.state.doc,
        selection: stored.state.selection,
        extensions: buildExtensions(),
      })
    } else {
      state = EditorState.create({
        doc: content,
        extensions: buildExtensions(),
      })
    }

    const view = new EditorView({
      state,
      parent: container,
    })

    viewRef.current = view

    // Register the active EditorView with the plugin extension manager
    setActiveEditorView(view)

    // Restore scroll position if available
    if (stored) {
      view.scrollDOM.scrollTop = stored.scrollTop
      view.scrollDOM.scrollLeft = stored.scrollLeft
    }

    // Cleanup on unmount
    return () => {
      if (viewRef.current) {
        saveCurrentState(tabId)
        setActiveEditorView(null)
        viewRef.current.destroy()
        viewRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId])

  // Reconfigure readOnly compartment on prop change
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: readOnlyCompartment.current.reconfigure(
        EditorState.readOnly.of(readOnly)
      ),
    })
  }, [readOnly])

  // Reconfigure lineNumbers compartment on prop change
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({
      effects: lineNumbersCompartment.current.reconfigure(
        showLineNumbers ? cmLineNumbers() : []
      ),
    })
  }, [showLineNumbers])

  // Reconfigure livePreview compartment on prop change
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    // Auto-disable Live Preview for files >50,000 chars
    const docLength = view.state.doc.length
    const effectiveLivePreview = livePreview && docLength <= 50000
    if (livePreview && docLength > 50000) {
      console.warn('[CodeMirrorEditor] Live Preview auto-disabled: file exceeds 50,000 characters')
    }
    const options = livePreviewOptions ?? { vaultId: '', directoryTree: null }
    view.dispatch({
      effects: livePreviewCompartment.current.reconfigure(
        effectiveLivePreview ? createLivePreviewField(options) : []
      ),
    })
  }, [livePreview, livePreviewOptions])

  // Expose imperative handle
  useImperativeHandle(editorRef, () => ({
    dispatch(tr) {
      viewRef.current?.dispatch(tr)
    },
    getState() {
      if (!viewRef.current) {
        throw new Error('EditorView not initialized')
      }
      return viewRef.current.state
    },
    getView() {
      return viewRef.current
    },
    focus() {
      viewRef.current?.focus()
    },
    applyFormatting(action: EditorFormattingAction) {
      const view = viewRef.current
      if (view) applyFormattingAction(view, action)
    },
    undo() {
      const view = viewRef.current
      if (view) cmUndo(view)
    },
    redo() {
      const view = viewRef.current
      if (view) cmRedo(view)
    },
    insertAtCursor(text: string) {
      const view = viewRef.current
      if (!view) return
      view.dispatch(view.state.replaceSelection(text))
    },
  }), [])

  return (
    <div
      ref={containerRef}
      className="cm-editor-wrapper"
    />
  )
}
