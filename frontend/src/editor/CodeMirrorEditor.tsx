import React, { useRef, useEffect, useImperativeHandle, useCallback, useState } from 'react'
import { ExternalLink, Copy, FileText, FolderOpen } from 'lucide-react'
import { EditorState, Compartment, Annotation, type Extension } from '@codemirror/state'
import { EditorView, lineNumbers as cmLineNumbers, dropCursor, keymap } from '@codemirror/view'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { GFM } from '@lezer/markdown'
import { tokenClassNodePropSource } from './token-class-node-prop'

/**
 * Pre-configured Markdown parser with tokenClassNodeProp set on all NodeTypes.
 * This ensures Lezer trees have the prop values that plugins like Dataview expect.
 * Created at module level (singleton) — reused for all editor instances.
 */
const markdownParserWithProps = (markdownLanguage.parser as unknown as { configure(spec: Record<string, unknown>): unknown }).configure({
  props: [tokenClassNodePropSource],
}) as typeof markdownLanguage.parser

/**
 * Markdown Language instance with our configured parser.
 * Uses Object.create to inherit all Language behavior while swapping the parser.
 */
const markdownLanguageWithProps: typeof markdownLanguage = Object.create(markdownLanguage, {
  parser: { value: markdownParserWithProps, configurable: true },
})
import { search } from '@codemirror/search'
import { undo as cmUndo, redo as cmRedo, defaultKeymap, historyKeymap, indentWithTab } from '@codemirror/commands'
import { autocompletion, type CompletionSource } from '@codemirror/autocomplete'
import type { IEditorHandle, EditorFormattingAction } from './types'
import { createSlatebaseTheme, createSlatebaseHighlightStyle } from './theme'
import { getEditorState, saveEditorState, editorHistoryExtension } from './state-store'
import { applyFormatting as applyFormattingAction } from './formatting'
import { createLivePreviewCompartmentExtension, createLivePreviewField, createLivePreviewClickHandler, createLinkContextMenuHandler, type LivePreviewOptions } from './live-preview'
import { warnOnce } from '../plugins/compat/log'
import { setActiveEditorView, setActiveEditorContainerEl, getActivePluginExtensions, getActivePluginCompletions } from './plugin-extensions'
import { editorInfoField, editorEditorField, editorLivePreviewField, livePreviewStateTracker } from './editor-state-fields'
import { setEditorInfo, setEditorEditor, setEditorLivePreview, type EditorFileInfo } from './editor-state-fields'
import { EditorShim } from '../plugins/compat/editor-shim'
import { ContextMenu, type ContextMenuItem } from '../components/ContextMenu'
import { buildEditorContextMenuItems } from './editor-context-menu'
import {
  spellcheckExtension, misspelledWordAt, setSpellcheckLanguage, suggestCorrections,
  DEFAULT_SPELLCHECK_LANGUAGE, type SpellcheckLanguage,
} from './spellcheck'
import { buildTFileFromPath } from '../plugins/compat/plugin-event-bridge'
import { buildPluginMenuItems } from '../plugins/compat/plugin-menu-bridge'
import { revealInExplorer } from '../state/fileNavigation'
import { codeFolding } from '@codemirror/language'
import { markdownFoldService } from './folding'
import { isEmbeddableFile } from '../utils/internalLink'
import { showToast } from '../components/ToastNotification'
import './live-preview/live-preview.css'

/** MIME types accepted for clipboard-paste upload (screenshots and PDF files). */
function isPasteableFile(file: File): boolean {
  return file.type.startsWith('image/') || file.type === 'application/pdf'
}

/**
 * Marks a dispatch that replaces the document to match an externally-changed
 * `content` prop (e.g. a realtime reload after another client/MCP tool saved
 * the file) rather than the user typing. The updateListener checks for this
 * annotation so that sync doesn't get reported back through onContentChange —
 * without it, syncing content would look like a user edit, arming the
 * auto-save debounce and marking the tab's editBuffer non-null, which would
 * then block the *next* realtime reload (see EditMode's "no unsaved edits" guard).
 */
const externalContentSync = Annotation.define<boolean>()

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
  /** Whether the editor content is width-constrained (Obsidian's "readable line length"). Defaults to true. */
  readableLineLength?: boolean
  /** Whether Slatebase's own spellchecker underlines unknown words. */
  spellcheck?: boolean
  /** Dictionary the spellchecker checks against. */
  spellcheckLanguage?: SpellcheckLanguage
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
  /** Optional handler for image/PDF paste from clipboard. Called once per pasted file. */
  onImagePaste?: (file: File) => Promise<{ uploaded: Array<{ fileName: string; path: string }> }>
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
  filePath,
  livePreview = false,
  livePreviewOptions,
  showLineNumbers = false,
  readableLineLength = true,
  spellcheck = true,
  spellcheckLanguage = DEFAULT_SPELLCHECK_LANGUAGE,
  vimMode: _vimMode,
  bracketAutoClose: _bracketAutoClose,
  pluginExtensions: _pluginExtensions,
  pluginCompletions: _pluginCompletions,
  editorRef,
  onImagePaste,
}: CodeMirrorEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const prevTabIdRef = useRef<string>(tabId)
  const onContentChangeRef = useRef(onContentChange)
  // Read by the mount-effect's contextmenu listener, which only re-runs on
  // tabId change — without this ref, toggling line numbers would leave the
  // context menu's checkbox showing the state from whenever the tab was
  // last (re)mounted instead of the current one.
  const showLineNumbersRef = useRef(showLineNumbers)
  // Same reasoning as showLineNumbersRef — the context menu's checkbox needs
  // the current value without re-running the mount-effect's listener.
  const readableLineLengthRef = useRef(readableLineLength)
  // Ditto for the spellcheck submenu's checkbox and language radio group.
  const spellcheckRef = useRef(spellcheck)
  const spellcheckLanguageRef = useRef(spellcheckLanguage)
  // Guards the async suggestion fetch: a right-click on a second word (or a
  // closed menu) must not be overwritten by suggestions for the first one.
  const suggestionRequestRef = useRef(0)
  // The paste domEventHandler is baked into the extensions built once per
  // tab mount (see buildExtensions) — read through refs so prop changes
  // don't need a full editor remount to take effect.
  const onImagePasteRef = useRef(onImagePaste)
  const readOnlyRef = useRef(readOnly)
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; items: ContextMenuItem[] } | null>(null)

  // Compartments for dynamic reconfiguration
  const readOnlyCompartment = useRef(new Compartment())
  const lineNumbersCompartment = useRef(new Compartment())
  const livePreviewCompartment = useRef(new Compartment())
  const spellcheckCompartment = useRef(new Compartment())

  // Keep onContentChange ref up to date without recreating extensions
  useEffect(() => {
    onContentChangeRef.current = onContentChange
  }, [onContentChange])

  useEffect(() => {
    showLineNumbersRef.current = showLineNumbers
  }, [showLineNumbers])

  useEffect(() => {
    readableLineLengthRef.current = readableLineLength
  }, [readableLineLength])

  useEffect(() => {
    spellcheckRef.current = spellcheck
    spellcheckLanguageRef.current = spellcheckLanguage
  }, [spellcheck, spellcheckLanguage])

  useEffect(() => {
    onImagePasteRef.current = onImagePaste
  }, [onImagePaste])

  useEffect(() => {
    readOnlyRef.current = readOnly
  }, [readOnly])

  /**
   * Shows a link-specific context menu (Obsidian's `file-menu` for internal
   * wikilinks, `url-menu` for external ones) instead of the generic editor
   * menu — wired into Live Preview's rendered link elements via
   * `LivePreviewOptions.onLinkContextMenu` (see live-preview-extension.ts).
   */
  function handleLinkContextMenu(
    x: number,
    y: number,
    link: { kind: 'internal'; target: string } | { kind: 'external'; url: string },
  ): void {
    if (link.kind === 'external') {
      setContextMenu({
        x, y,
        items: [
          { id: 'open', label: 'Link öffnen', icon: <ExternalLink size={14} />, run: () => window.open(link.url, '_blank', 'noopener,noreferrer') },
          { id: 'copy', label: 'Link kopieren', icon: <Copy size={14} />, run: () => { void navigator.clipboard.writeText(link.url).catch(() => {}) } },
          ...buildPluginMenuItems('url-menu', [link.url], 'editor-link-url-menu'),
        ],
      })
      return
    }

    const file = buildTFileFromPath(link.target)
    setContextMenu({
      x, y,
      items: [
        { id: 'open', label: 'Öffnen', icon: <FileText size={14} />, run: () => livePreviewOptions?.onInternalLinkClick?.(link.target) },
        { id: 'reveal', label: 'Im Explorer zeigen', icon: <FolderOpen size={14} />, run: () => revealInExplorer(link.target) },
        { id: 'copy', label: 'Link kopieren', icon: <Copy size={14} />, run: () => { void navigator.clipboard.writeText(link.target).catch(() => {}) } },
        ...buildPluginMenuItems('file-menu', [file, 'link-context-menu'], 'editor-link-file-menu'),
      ],
    })
  }

  /**
   * Opens the editor context menu at `x`/`y`, offering spelling corrections for
   * the misspelled word at `pos` (if any).
   *
   * Suggestions are fetched from the spellcheck worker *after* the menu is
   * already on screen and swapped in when they arrive — computing them first
   * would add a visible delay to every right-click on a typo.
   *
   * Shared by the mouse handler and the keyboard-triggered `showContextMenu()`;
   * reads all editor state through refs, so it never needs rebuilding.
   */
  const openContextMenuAt = useCallback((view: EditorView, x: number, y: number, pos: number | null): void => {
    const misspelled = pos === null ? null : misspelledWordAt(view.state, pos)

    const buildItems = (suggestions: string[] | null): ContextMenuItem[] =>
      buildEditorContextMenuItems(view, showLineNumbersRef.current, readableLineLengthRef.current, {
        misspelled,
        suggestions,
        enabled: spellcheckRef.current,
        language: spellcheckLanguageRef.current,
      })

    setContextMenu({ x, y, items: buildItems(misspelled ? null : []) })
    if (!misspelled) return

    const requestId = ++suggestionRequestRef.current
    void suggestCorrections(misspelled.word).then((suggestions) => {
      // A second right-click, or a closed menu, wins over a late response.
      if (requestId !== suggestionRequestRef.current) return
      setContextMenu((previous) => (previous ? { ...previous, items: buildItems(suggestions) } : previous))
    })
  }, [])

  /**
   * Merges the caller-supplied Live Preview options with the link-context-menu
   * callback above — kept out of `CodeMirrorEditorProps`/`LivePreviewOptions`'s
   * caller-facing shape since it's purely an internal wiring detail of this
   * component, not something a parent needs to configure.
   */
  const buildLivePreviewOptionsWithMenu = useCallback((): LivePreviewOptions => ({
    ...(livePreviewOptions ?? { vaultId: '', directoryTree: null }),
    onLinkContextMenu: handleLinkContextMenu,
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [livePreviewOptions])

  /**
   * Build the extensions array for a fresh EditorState.
   */
  const buildExtensions = useCallback((): Extension[] => {
    // Auto-disable Live Preview for files >50,000 chars
    const effectiveLivePreview = livePreview && content.length <= 50000
    if (livePreview && content.length > 50000) {
      warnOnce('CodeMirrorEditor.livePreviewAutoDisabled', '[CodeMirrorEditor] Live Preview auto-disabled: file exceeds 50,000 characters')
    }

    // Collect plugin-provided completions
    const pluginCompletionSources = getActivePluginCompletions()

    const extensions: Extension[] = [
      // Obsidian-compatible StateFields — MUST be before plugin extensions
      // so that plugins can access them via view.state.field() during initialization.
      // Use .init() to provide correct initial values so ViewPlugins that read
      // these fields in their constructor get the right data (not defaults).
      editorInfoField.init(() => ({
        app: (window as unknown as { app?: unknown }).app ?? null,
        file: filePath ? {
          path: filePath,
          basename: filePath.replace(/\.[^.]+$/, '').split('/').pop() ?? '',
          extension: filePath.split('.').pop() ?? 'md',
          name: filePath.split('/').pop() ?? '',
        } : null,
        editor: undefined,
      })),
      editorEditorField,
      editorLivePreviewField.init(() => livePreview),
      // Obsidian's `livePreviewState` plus the pointer tracking that fills it.
      livePreviewStateTracker,
      markdown({
        base: markdownLanguageWithProps,
        codeLanguages: languages,
        extensions: GFM,
      }),
      createSlatebaseTheme(),
      createSlatebaseHighlightStyle(),
      EditorView.lineWrapping,
      // Multi-cursor support — off by default in CM6. Needed for Obsidian's
      // editor:add-cursor-above/below core commands (see core-commands.ts);
      // relaxing this only permits multi-range selections, it doesn't change
      // any single-cursor editing behavior.
      EditorState.allowMultipleSelections.of(true),
      // Shows a cursor following the mouse while a file is dragged over the
      // editor, so the drop position (e.g. for an image) is visible before release.
      dropCursor(),
      editorHistoryExtension,
      search(),
      // Markdown-specific fold-by-heading/fold-by-nested-list support for the
      // fold-all/fold-less/fold-more/toggle-fold/unfold-all commands
      // (core-commands.ts) — see folding.ts's module docstring for why this
      // needs a custom foldService instead of CM6's syntax-node-based folding.
      codeFolding(),
      markdownFoldService,
      EditorView.updateListener.of((update) => {
        if (update.docChanged && !update.transactions.some((tr) => tr.annotation(externalContentSync))) {
          onContentChangeRef.current(update.state.doc.toString())
        }
      }),
      EditorView.domEventHandlers({
        paste(event, view) {
          if (readOnlyRef.current) return false
          const onPaste = onImagePasteRef.current
          if (!onPaste) return false
          // Only intercept genuine file pastes (screenshots, copied PDFs) —
          // plain text paste (even from rich sources) carries no File entries.
          const files = event.clipboardData?.files
          const pasteFiles = files ? Array.from(files).filter(isPasteableFile) : []
          if (pasteFiles.length === 0) return false

          event.preventDefault()
          let insertPos = view.state.selection.main.from

          void (async () => {
            for (const file of pasteFiles) {
              try {
                const result = await onPaste(file)
                const embeds = result.uploaded
                  .filter((u) => isEmbeddableFile(u.fileName))
                  .map((u) => `![[${u.fileName}]]`)
                if (embeds.length === 0) continue
                const text = embeds.join('\n')
                view.dispatch({
                  changes: { from: insertPos, insert: text },
                  selection: { anchor: insertPos + text.length },
                })
                insertPos += text.length
              } catch (err) {
                const reason = err instanceof Error ? err.message : 'Upload fehlgeschlagen'
                showToast('error', `"${file.name || 'Zwischenablage'}": ${reason}`)
              }
            }
          })()

          return true
        },
      }),
      readOnlyCompartment.current.of(EditorState.readOnly.of(readOnly)),
      lineNumbersCompartment.current.of(
        showLineNumbers ? cmLineNumbers() : []
      ),
      spellcheckCompartment.current.of(
        spellcheck ? spellcheckExtension() : []
      ),
      createLivePreviewCompartmentExtension(
        livePreviewCompartment.current,
        buildLivePreviewOptionsWithMenu(),
        effectiveLivePreview
      ),
      // Plugin-provided CM6 extensions (each in its own Compartment)
      ...getActivePluginExtensions(),
      // Core key bindings (Enter, Backspace, Tab, undo/redo shortcuts, etc.).
      // Placed after plugin extensions so a plugin's own keymap gets first
      // chance to handle a key and can fall through to these defaults.
      keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
    ]

    // Include autocompletion with plugin completions if any are registered
    if (pluginCompletionSources.length > 0) {
      extensions.push(autocompletion({ override: pluginCompletionSources }))
    }

    return extensions
  }, [readOnly, showLineNumbers, spellcheck, livePreview, livePreviewOptions, content, buildLivePreviewOptionsWithMenu])

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
    // Captured here (not re-read in cleanup) so the class removal below always
    // targets the same node the mount branch marked, even if `container` has
    // already been detached from the DOM by the time cleanup runs.
    let editorArea: HTMLElement | null = null

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

    // Suppress the browser's native context menu inside the editor in favor
    // of our own (native editing actions + plugin 'editor-menu' items — see
    // editor-context-menu.ts).
    const handleContextMenu = (e: MouseEvent) => {
      // A right-click on a rendered Live Preview link is handled by
      // createLinkContextMenuHandler (live-preview-extension.ts), which runs
      // first (its listener sits on an element inside this container) and
      // calls preventDefault() itself when it shows a link-specific menu —
      // don't also show the generic one in that case.
      if (e.defaultPrevented) return
      e.preventDefault()
      openContextMenuAt(view, e.clientX, e.clientY, view.posAtCoords({ x: e.clientX, y: e.clientY }))
    }
    container.addEventListener('contextmenu', handleContextMenu)

    // Register the active EditorView with the plugin extension manager
    setActiveEditorView(view)
    // Expose an ancestor of the mount node as the "MarkdownView.containerEl" that
    // plugins like Editing Toolbar query for an insertion point via
    // containerEl.querySelector('.markdown-source-view'). The marker class goes on
    // cm-editor-wrapper's *parent* rather than cm-editor-wrapper itself: the wrapper
    // has `overflow: hidden` (see live-preview.css), which would clip an
    // absolutely-positioned toolbar bar inserted inside it. containerEl is then the
    // grandparent, since containerEl must be a strict ancestor of the marked element.
    editorArea = container.parentElement
    editorArea?.classList.add('markdown-source-view')
    setActiveEditorContainerEl(editorArea?.parentElement ?? editorArea ?? null)

    // Initialize Obsidian-compatible StateFields with current context
    const fileInfo: EditorFileInfo = {
      app: (window as unknown as { app?: unknown }).app ?? null,
      file: filePath ? {
        path: filePath,
        basename: filePath.replace(/\.[^.]+$/, '').split('/').pop() ?? '',
        extension: filePath.split('.').pop() ?? 'md',
        name: filePath.split('/').pop() ?? '',
      } : null,
      // Real Obsidian's MarkdownFileInfo.editor is always a live Editor for an
      // open file — plugins that read it via `state.field(editorInfoField)`
      // (rather than the separate editorEditorField) rely on that guarantee
      // without a null-check (obsidian-outliner's Settings.ts does exactly
      // this: `state.field(editorInfoField).editor.getCursor()`). Leaving this
      // undefined broke every such plugin the moment any OTHER plugin's CM6
      // extension triggered a transaction — EditorShim.create() is stateless
      // (proxies to the currently-active view via setActiveEditorView() below,
      // same as editorEditorField), so a fresh instance here is equivalent to
      // the one WorkspaceShim hands out elsewhere.
      editor: EditorShim.create(),
    }
    view.dispatch({
      effects: [
        setEditorInfo.of(fileInfo),
        setEditorEditor.of(view),
        setEditorLivePreview.of(livePreview),
      ],
    })

    // Restore scroll position if available
    if (stored) {
      view.scrollDOM.scrollTop = stored.scrollTop
      view.scrollDOM.scrollLeft = stored.scrollLeft
    }

    // Cleanup on unmount
    return () => {
      container.removeEventListener('contextmenu', handleContextMenu)
      if (viewRef.current) {
        saveCurrentState(tabId)
        setActiveEditorView(null)
        setActiveEditorContainerEl(null)
        editorArea?.classList.remove('markdown-source-view')
        viewRef.current.destroy()
        viewRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tabId])

  // Sync the document when `content` changes without the tab itself changing —
  // e.g. a realtime vault:change reload after another client or an MCP tool
  // saved the file externally. Skipped whenever the prop already matches the
  // doc, which is always the case while the user is typing (content mirrors
  // what was just typed), so this never fights the user's own edits or resets
  // the cursor mid-keystroke. The mount effect above already seeds the doc
  // from `content` for a fresh or tab-switched view, so this only fires for a
  // genuine external change to the already-mounted tab.
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const currentDoc = view.state.doc.toString()
    if (currentDoc === content) return
    view.dispatch({
      changes: { from: 0, to: currentDoc.length, insert: content },
      annotations: externalContentSync.of(true),
    })
  }, [content])

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

  // Add/remove the spellcheck extension on prop change.
  //
  // The browser's own spellchecker is switched off unconditionally: it draws a
  // second, differently-styled underline under the same words, and its
  // suggestions are unreachable anyway — they live only in the native context
  // menu, which this editor replaces with its own (see handleContextMenu).
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.contentDOM.setAttribute('spellcheck', 'false')
    view.dispatch({
      effects: spellcheckCompartment.current.reconfigure(
        spellcheck ? spellcheckExtension() : []
      ),
    })
  }, [spellcheck])

  // Load the selected dictionary. The worker ignores a repeat of the language
  // it already has, so this is free on every render but the first.
  useEffect(() => {
    if (!spellcheck) return
    setSpellcheckLanguage(spellcheckLanguage)
  }, [spellcheck, spellcheckLanguage])

  // Reconfigure livePreview compartment on prop change
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    // Auto-disable Live Preview for files >50,000 chars
    const docLength = view.state.doc.length
    const effectiveLivePreview = livePreview && docLength <= 50000
    if (livePreview && docLength > 50000) {
      warnOnce('CodeMirrorEditor.livePreviewAutoDisabled', '[CodeMirrorEditor] Live Preview auto-disabled: file exceeds 50,000 characters')
    }
    const options = buildLivePreviewOptionsWithMenu()
    view.dispatch({
      effects: livePreviewCompartment.current.reconfigure(
        effectiveLivePreview
          ? [createLivePreviewField(options), createLivePreviewClickHandler(options), createLinkContextMenuHandler(options)]
          : []
      ),
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [livePreview, livePreviewOptions])

  // Update editorLivePreviewField StateField when live preview mode changes
  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    view.dispatch({ effects: setEditorLivePreview.of(livePreview) })
  }, [livePreview])

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
    insertAtPos(text: string, pos: number) {
      const view = viewRef.current
      if (!view) return
      const clamped = Math.max(0, Math.min(pos, view.state.doc.length))
      view.dispatch({
        changes: { from: clamped, insert: text },
        selection: { anchor: clamped + text.length },
      })
    },
    showContextMenu() {
      const view = viewRef.current
      if (!view) return
      // Same fallback as editor-suggest-popover.ts's position(): coordsAtPos
      // returns null for an off-screen/hidden position (e.g. scrolled out of view).
      const coords = view.coordsAtPos(view.state.selection.main.head) ?? view.dom.getBoundingClientRect()
      openContextMenuAt(view, coords.left, coords.bottom, view.state.selection.main.head)
    },
  }), [openContextMenuAt])

  return (
    <>
      <div
        ref={containerRef}
        className={`cm-editor-wrapper${readableLineLength ? '' : ' cm-full-width'}`}
      />
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={contextMenu.items}
          onClose={() => setContextMenu(null)}
          onSelect={() => setContextMenu(null)}
        />
      )}
    </>
  )
}
