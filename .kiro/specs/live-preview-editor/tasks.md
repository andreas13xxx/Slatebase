# Implementation Plan: Live Preview Editor (CodeMirror 6 Migration)

## Overview

Migration des Slatebase-Editors von `<textarea>` zu CodeMirror 6 in drei Phasen:
- Phase 1: CM6 als Source-Editor (Syntax-Highlighting, Vim-Mode, Toolbar, Per-Tab State)
- Phase 2: Live Preview (Inline-Rendering via Decorations + Widgets)
- Phase 3: Plugin-Integration (registerEditorExtension, registerEditorSuggest, editorCallback)

Alle Aufgaben verwenden TypeScript und integrieren sich in die bestehende Frontend-Architektur (React 19, Vite, CSS Custom Properties, useReducer/Context).

## Tasks

- [x] 1. Phase 1 — CM6 Grundintegration und Infrastruktur
  - [x] 1.1 Install CodeMirror 6 dependencies and create module structure
    - Install pinned versions: `@codemirror/view`, `@codemirror/state`, `@codemirror/commands`, `@codemirror/language`, `@codemirror/lang-markdown`, `@codemirror/language-data`, `@codemirror/autocomplete`, `@codemirror/search`, `@lezer/highlight`
    - Create `frontend/src/editor/` directory with barrel export `index.ts`
    - Define `IEditorHandle` interface and `EditorFormattingAction` type in `frontend/src/editor/types.ts`
    - _Requirements: 1.1, 1.2, 1.3_

  - [x] 1.2 Implement SlatebaseTheme (CM6 Theme Extension)
    - Create `frontend/src/editor/theme.ts` with `createSlatebaseTheme()` returning a CM6 `EditorView.theme()` using only CSS Custom Properties (`var(--*)`)
    - Create `createSlatebaseHighlightStyle()` mapping Lezer syntax tags to Design Token colors
    - Cover: cursor, selection, active-line, search-highlights, gutter, bracket matching
    - Ensure Dark/Light mode works via CSS variable resolution (no hardcoded colors)
    - _Requirements: 9.1, 9.2, 9.3, 9.4_

  - [x]* 1.3 Write property test for theme token resolution (Property 5)
    - **Property 5: Theme token resolution consistency**
    - Verify all CM6 theme style rules reference `var(--*)` custom properties (never hardcoded color literals)
    - Use fast-check with minimum 100 iterations
    - **Validates: Requirements 9.1, 9.2**

  - [x] 1.4 Implement useEditorStateStore (per-tab state management)
    - Create `frontend/src/editor/state-store.ts` with module-level `Map<string, EditorTabState>`
    - Implement `getState(tabId)`, `saveState(tabId, entry)`, `removeState(tabId)`, `updateContent(tabId, newContent)`
    - `updateContent` must preserve undo history (insert content as transaction, not replace state)
    - Configure `history({ newGroupDelay: 300 })` with max 200 undo steps
    - _Requirements: 1.10, 2.1, 2.2, 2.3, 2.5_

  - [x]* 1.5 Write property test for tab state isolation (Property 2)
    - **Property 2: Tab state isolation**
    - For any sequence of tab switches between N open tabs, restoring a tab reproduces the exact cursor position and scroll position
    - Use fast-check with minimum 100 iterations
    - **Validates: Requirements 1.10, 2.1, 2.2**

  - [x] 1.6 Implement CodeMirrorEditor component
    - Create `frontend/src/editor/CodeMirrorEditor.tsx` implementing `CodeMirrorEditorProps`
    - Mount CM6 `EditorView` in a container div (flex: 1 to fill parent)
    - Wire `EditorView.updateListener` to trigger `onContentChange` on doc changes
    - Apply extensions: markdown language, language-data, history, search, SlatebaseTheme
    - Support `readOnly` via `EditorState.readOnly` extension
    - Support `showLineNumbers` via `lineNumbers()` extension (togglable)
    - Expose `IEditorHandle` via `editorRef` (useImperativeHandle)
    - On mount: restore state from `useEditorStateStore` or create fresh state
    - On unmount / tab switch: save current state (cursor, scroll, EditorState) to store
    - On `tabId` change: swap EditorState (save old, restore/create new)
    - _Requirements: 1.1, 1.6, 1.8, 1.9, 1.10, 2.1, 2.2, 2.6_

  - [x]* 1.7 Write property test for content round-trip (Property 1)
    - **Property 1: Editor content round-trip preservation**
    - For any valid string content, setting it in CM6 and reading via `state.doc.toString()` produces identical output
    - Use fast-check with minimum 100 iterations, arbitrary unicode strings
    - **Validates: Requirements 1.1, 2.6**

  - [x]* 1.8 Write property test for undo/redo determinism (Property 3)
    - **Property 3: Undo/Redo determinism**
    - For any sequence of edits followed by K undo operations, content equals the state K edits prior (within 200-step limit)
    - Use fast-check with minimum 100 iterations
    - **Validates: Requirements 5.1, 5.3**

- [x] 2. Phase 1 — Editor-Integration in bestehende Architektur
  - [x] 2.1 Implement formatting actions (toolbar support)
    - Create `frontend/src/editor/formatting.ts` with `applyFormatting(view: EditorView, action: EditorFormattingAction)` function
    - Implement all actions: heading1-3, bold, italic, strikethrough, code, link, bulletList, numberedList, task, quote, horizontalRule, table
    - Each action uses CM6 transactions (replaceSelection, cursor manipulation)
    - _Requirements: 1.7, 3.2_

  - [x]* 2.2 Write property test for formatting idempotence (Property 9)
    - **Property 9: Formatting action idempotence on structure**
    - For any formatting action applied to a selection, the result contains exactly one additional formatting marker pair
    - Use fast-check with minimum 100 iterations
    - **Validates: Requirements 1.7, 3.2**

  - [x] 2.3 Implement image paste and drag-and-drop handlers
    - Create `frontend/src/editor/image-paste.ts` with CM6 `EditorView.domEventHandlers` for `paste` and `drop`
    - Intercept only `image/*` MIME types on paste (text paste passes through unchanged)
    - Upload via existing API, insert placeholder `![Uploading...](...)`, replace with `![[filename.png]]` on success
    - Support drag-and-drop of image files (upload + embed link) and markdown files (wikilink)
    - _Requirements: 4.1, 4.2, 4.3, 4.4_

  - [x]* 2.4 Write property test for image paste non-interception (Property 4)
    - **Property 4: Image paste preserves non-image clipboard**
    - For any paste event without `image/*` MIME type, editor processes as normal text insertion
    - Use fast-check with minimum 100 iterations
    - **Validates: Requirements 4.4**

  - [x] 2.5 Implement keybindings integration
    - Create `frontend/src/editor/keybindings.ts` with CM6 keymap that maps existing `keybindingsStore` shortcuts to CM6 commands
    - Standard keybindings: Ctrl+Z, Ctrl+Y, Ctrl+A, Tab/Shift+Tab, Ctrl+D
    - Editor formatting: Ctrl+B (bold), Ctrl+I (italic), Ctrl+K (link), etc. from keybindingsStore
    - Support `slatebase:editor-command` CustomEvent listener (commands from CommandPaletteContainer operate on CM6)
    - _Requirements: 3.1, 3.2, 3.3_

  - [x] 2.6 Implement Vim mode extension (optional activation)
    - Install pinned `@replit/codemirror-vim`
    - Create `frontend/src/editor/vim-mode.ts` wrapping the vim extension in a Compartment for toggle
    - Integrate with Settings (new option under "Editor" in unified settings)
    - Graceful fallback: if load fails, show toast, continue with standard keybindings
    - _Requirements: 3.4_

  - [x] 2.7 Implement bracket auto-close extension
    - Create `frontend/src/editor/bracket-close.ts` using `@codemirror/autocomplete` closeBrackets
    - Configurable via Settings (EditorPreferences.bracketAutoClose)
    - _Requirements: 3.5_

  - [x] 2.8 Implement auto-save listener extension
    - Create `frontend/src/editor/auto-save.ts` with `EditorView.updateListener` that triggers on doc changes
    - Maintain 2s debounce behavior (existing pattern)
    - Call `onContentChange(newContent)` — same interface as current textarea onChange
    - _Requirements: 1.5, 2.6, 8.5_

  - [x] 2.9 Rework EditMode to use CodeMirrorEditor instead of textarea
    - Modify `frontend/src/components/EditMode.tsx`:
      - Replace `<textarea>` with `<CodeMirrorEditor>` component
      - Remove `useHistoryStack` hook usage (CM6 history replaces it)
      - Remove manual line numbers component (CM6 renders natively)
      - Wire toolbar buttons to `editorRef.current.applyFormatting(action)`
      - Wire undo/redo buttons to `editorRef.current.undo()` / `editorRef.current.redo()`
      - Keep `slatebase:editor-command` CustomEvent listener (delegate to CM6)
      - Keep `onContentChange` prop (auto-save unchanged)
      - Pass `readOnly`, `showLineNumbers`, `tabId`, `filePath` props
    - _Requirements: 1.1, 1.5, 1.6, 1.7, 1.8, 1.9, 10.1, 10.2, 10.3, 10.4, 10.5_

  - [x]* 2.10 Write property test for external content update preserving history (Property 10)
    - **Property 10: External content update preserves history**
    - For any external update applied when editBuffer === null, undo history length does not decrease
    - Use fast-check with minimum 100 iterations
    - **Validates: Requirements 2.4, 5.4**

- [x] 3. Checkpoint — Phase 1 complete
  - Ensure all tests pass, ask the user if questions arise.
  - Verify: CM6 renders in EditMode, syntax highlighting works, tab switch preserves state, toolbar actions work, auto-save fires, vim mode toggleable, image paste functional.

- [x] 4. Phase 2 — Live Preview Extension
  - [x] 4.1 Implement LivePreviewExtension core (StateField + ViewPlugin)
    - Create `frontend/src/editor/live-preview/index.ts` with barrel export
    - Create `frontend/src/editor/live-preview/live-preview-extension.ts` with `createLivePreviewExtension(options)`
    - Implement `LivePreviewState` StateField: parse document via Lezer Markdown tree, create DecorationSet
    - Implement cursor tracking: when cursor enters a decorated range, reveal raw Markdown markers
    - Wrap in Compartment for toggle on/off
    - _Requirements: 6.1, 6.3, 6.4, 6.5_

  - [x] 4.2 Implement inline decorations (headings, bold, italic, strikethrough, code)
    - Create `frontend/src/editor/live-preview/inline-decorations.ts`
    - Heading: `Decoration.line()` with heading-level CSS class (h1-h6 font sizes)
    - Bold/Italic/Strikethrough: `Decoration.mark()` with CSS class, hide markers when cursor outside
    - Inline code: `Decoration.mark()` with monospace background
    - _Requirements: 6.2 (headings, bold, italic, strikethrough, inline code)_

  - [x] 4.3 Implement link and wikilink decorations
    - Create `frontend/src/editor/live-preview/link-decorations.ts`
    - `[text](url)`: Decoration.mark() for clickable link, hide URL when cursor outside
    - `[[wikilink]]`: Decoration.mark() for internal link (clickable, opens file via callback)
    - Click handling via ViewPlugin DOM event handlers
    - _Requirements: 6.2 (links, wikilinks)_

  - [x] 4.4 Implement widget decorations (embeds, checkboxes, callouts, code blocks, blockquotes)
    - Create `frontend/src/editor/live-preview/widget-decorations.ts`
    - `![[embed]]`: Decoration.widget() for inline image/PDF preview
    - `- [ ] task`: Decoration.widget() for clickable checkbox
    - `> [!type]` callouts: Decoration.widget() or Decoration.line() for colored container with icon
    - Fenced code blocks: Decoration.mark() with syntax highlighting + language label
    - `> blockquote`: Decoration.line() with indented sidebar
    - _Requirements: 6.2 (embeds, tasks, callouts, code blocks, blockquotes)_

  - [x]* 4.5 Write property test for cursor reveal/hide (Property 6)
    - **Property 6: Live Preview syntax reveal on cursor entry**
    - For any formatted element, moving cursor INTO its range reveals raw markers, moving OUT hides them
    - Use fast-check with minimum 100 iterations
    - **Validates: Requirements 6.3, 6.4**

  - [x] 4.6 Implement Live Preview toggle and persistence
    - Add Live Preview toggle button in EditorToolbar (or keybinding)
    - Persist mode (source vs. live-preview) per-user via keybindingsStore or preferences
    - Auto-disable Live Preview for files >50.000 chars with info notice
    - Respect feature toggle `live-preview` (hot, default: true) — if false, only source mode available
    - _Requirements: 6.1, 6.6, 8.2, 10.7, 10.8_

  - [x] 4.7 Implement Live Preview CSS (consistent with ViewMode)
    - Create `frontend/src/editor/live-preview/live-preview.css`
    - Heading sizes, blockquote styling, code-block backgrounds consistent with existing ViewMode CSS
    - Use Design Tokens (CSS Custom Properties) — no hardcoded colors
    - _Requirements: 9.5_

- [x] 5. Checkpoint — Phase 2 complete
  - Ensure all tests pass, ask the user if questions arise.
  - Verify: Live Preview toggles on/off, headings render large, bold/italic hide markers, links clickable, embeds show preview, cursor reveals syntax, feature toggle respected, large files degrade gracefully.

- [x] 6. Phase 3 — Plugin-Integration
  - [x] 6.1 Implement PluginExtensionManager (Compartment-based)
    - Create `frontend/src/editor/plugin-extensions.ts` implementing `IPluginExtensionManager`
    - Each plugin gets its own CM6 Compartment for isolated enable/disable
    - `registerExtension(pluginId, extension)`: store in compartment, apply on next reconfigure
    - `removeExtensions(pluginId)`: reconfigure compartment to empty (no full editor recreate)
    - `registerCompletionSource(pluginId, source)`: integrate into CM6 autocompletion
    - `removeCompletionSources(pluginId)`: remove from autocompletion
    - Wrap each plugin extension evaluation in try/catch (faulty plugin doesn't crash editor)
    - _Requirements: 7.1, 7.2, 7.5, 7.6_

  - [x]* 6.2 Write property test for plugin extension isolation (Property 7)
    - **Property 7: Plugin extension isolation**
    - For any plugin registering an extension, disabling removes exactly its extensions, editor continues without errors
    - Use fast-check with minimum 100 iterations
    - **Validates: Requirements 7.5, 7.6**

  - [x] 6.3 Rework EditorShim to wrap CM6 EditorView
    - Modify `frontend/src/plugins/compat/shims/editor-shim.ts` (or create new)
    - Implement full `IEditor` interface delegating to CM6 `EditorView` state/dispatch
    - Methods: getCursor, setCursor, getSelection, replaceSelection, replaceRange, getRange, getValue, setValue, getLine, lineCount, lastLine, getDoc, somethingSelected, listSelections, setSelection, focus, scrollIntoView, getScrollInfo, exec, undo, redo, wordAt, transaction
    - Implement `IEditorTransaction` for batch operations
    - _Requirements: 7.3, 7.4, 10.6_

  - [x]* 6.4 Write property test for EditorShim API equivalence (Property 8)
    - **Property 8: EditorShim API equivalence**
    - For any valid Pos within document bounds, `EditorShim.getRange(from, to)` returns same substring as line-based extraction
    - Use fast-check with minimum 100 iterations
    - **Validates: Requirements 7.4**

  - [x] 6.5 Integrate plugin extensions into CodeMirrorEditor
    - Pass `pluginExtensions` and `pluginCompletions` props to CodeMirrorEditor
    - Wire `registerEditorExtension` from plugin compat layer to PluginExtensionManager
    - Wire `registerEditorSuggest` to PluginExtensionManager.registerCompletionSource
    - Support `editorCallback: (editor, view) => {}` — editor is EditorShim, view is MarkdownView-like object
    - _Requirements: 7.1, 7.2, 7.3_

- [x] 7. Checkpoint — Phase 3 complete
  - Ensure all tests pass, ask the user if questions arise.
  - Verify: plugins can register extensions, extensions apply to editor, plugin disable removes extensions cleanly, EditorShim methods work correctly, autocompletion from plugins works.

- [x] 8. Final integration and cleanup
  - [x] 8.1 Remove legacy editor code
    - Remove `useHistoryStack` hook usage from EditMode (CM6 history replaces it)
    - Remove `LineNumbers.tsx` component (CM6 renders line numbers natively)
    - Verify `useLineNumbers` hook still works (translates to CM6 lineNumbers extension)
    - Keep `slatebase:editor-command` event listener (already wired to CM6)
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

  - [x]* 8.2 Write unit tests for CodeMirrorEditor component
    - Mount component, verify content changes trigger `onContentChange`
    - Verify read-only state prevents edits
    - Verify tab switch preserves and restores editor state
    - Verify auto-save debounce triggers after 2s inactivity
    - _Requirements: 1.1, 1.9, 1.10, 2.6_

  - [x]* 8.3 Write unit tests for EditorShim
    - Test all IEditor methods against a CM6 EditorView
    - Test getCursor, replaceRange, getValue, getLine, lineCount, transaction
    - _Requirements: 7.4_

  - [x]* 8.4 Write integration tests for editor workflow
    - Test `slatebase:editor-command` CustomEvent dispatches to CM6
    - Test feature toggle `live-preview` controls Live Preview availability
    - Test toolbar buttons execute CM6 transactions
    - Test external content update (SSE vault:change) with editBuffer === null
    - _Requirements: 2.4, 3.3, 10.5, 10.7_

- [x] 9. Final checkpoint — Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.
  - Full verification: CM6 editor works end-to-end, all phases functional, plugin compat operational, no regressions in existing functionality.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation per phase
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The implementation language is TypeScript (as specified in the design document)
- All CSS must use Design Tokens (CSS Custom Properties) — no hardcoded colors
- Feature toggle `live-preview` (hot, default: true) controls only Live Preview availability, CM6 is always used

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "1.4"] },
    { "id": 2, "tasks": ["1.3", "1.5", "1.6"] },
    { "id": 3, "tasks": ["1.7", "1.8", "2.1", "2.3", "2.5", "2.7", "2.8"] },
    { "id": 4, "tasks": ["2.2", "2.4", "2.6", "2.9"] },
    { "id": 5, "tasks": ["2.10"] },
    { "id": 6, "tasks": ["4.1"] },
    { "id": 7, "tasks": ["4.2", "4.3", "4.4"] },
    { "id": 8, "tasks": ["4.5", "4.6", "4.7"] },
    { "id": 9, "tasks": ["6.1"] },
    { "id": 10, "tasks": ["6.2", "6.3"] },
    { "id": 11, "tasks": ["6.4", "6.5"] },
    { "id": 12, "tasks": ["8.1"] },
    { "id": 13, "tasks": ["8.2", "8.3", "8.4"] }
  ]
}
```
