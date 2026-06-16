# Implementation Plan: Mermaid Rendering

## Overview

This plan implements native Mermaid diagram rendering in ViewMode by creating a lazy-loaded `MermaidRenderer` component, a `useColorScheme` hook for theme reactivity, modifying the existing `renderCodeBlock` function to route mermaid blocks, and adding CSS styles using existing design tokens. Property-based tests validate correctness properties from the design.

## Tasks

- [ ] 1. Create the `useColorScheme` hook
  - [ ] 1.1 Create `frontend/src/hooks/useColorScheme.ts`
    - Export a `ColorScheme` type (`'light' | 'dark'`)
    - Implement the `useColorScheme` hook that reads initial value from `document.documentElement.getAttribute('data-theme')`
    - Set up a `MutationObserver` on `<html>` to watch for `data-theme` attribute changes
    - Listen to `window.matchMedia('(prefers-color-scheme: dark)')` change events
    - Return `'dark'` if `data-theme="dark"` OR (no explicit data-theme AND system prefers dark), else `'light'`
    - Clean up observer and listener on unmount
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [ ]* 1.2 Write unit tests for `useColorScheme`
    - Test that it returns `'light'` when `data-theme="light"` is set
    - Test that it returns `'dark'` when `data-theme="dark"` is set
    - Test that it falls back to `prefers-color-scheme` when no `data-theme` is set
    - Test that it re-renders when `data-theme` attribute changes
    - Test cleanup of MutationObserver on unmount
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

- [ ] 2. Create the `MermaidRenderer` component with lazy loading
  - [ ] 2.1 Create `frontend/src/components/MermaidRenderer.tsx` with the `useMermaidLoader` singleton hook
    - Implement a module-level singleton promise for the mermaid dynamic import (`import('mermaid')`)
    - Implement the `useMermaidLoader` hook returning `{ status, mermaid, error }` state
    - Ensure the import is triggered only once across all component instances
    - On successful load, call `mermaid.initialize()` with `securityLevel: 'strict'`, `startOnLoad: false`, `suppressErrorRendering: true`
    - Handle import errors by setting status to `'error'`
    - _Requirements: 5.1, 5.3, 8.1_

  - [ ] 2.2 Implement the `MermaidRenderer` component with rendering logic
    - Define `MermaidRendererProps` interface with `definition: string` and `diagramKey: string`
    - Implement `generateDiagramId` using module-level counter and `diagramKey`
    - Implement `buildMermaidConfig` that returns config with `theme: 'default'` for light and `theme: 'dark'` for dark color schemes
    - Use `useColorScheme` hook to get current color scheme and trigger re-renders on change
    - Call `mermaid.initialize()` with updated config when color scheme changes, then re-render
    - Implement `renderWithTimeout` using `Promise.race` with a 5-second timeout
    - Call `mermaid.render(id, definition)` and set SVG result on success
    - Render inline SVG using `dangerouslySetInnerHTML` inside a `.view-mode-mermaid` container
    - _Requirements: 2.1, 2.3, 2.4, 2.5, 3.1, 3.2, 3.3, 5.4, 8.1_

  - [ ] 2.3 Implement loading, error, and timeout states in `MermaidRenderer`
    - Show a loading placeholder (`<div class="view-mode-mermaid view-mode-mermaid--loading">Diagramm wird geladen…</div>`) while the library loads
    - On init failure, render the definition as a plain `<pre><code>` block (identical to normal code block display)
    - On render error, show error message in `.mermaid-error` element plus raw source in `<pre><code>` inside a `.view-mode-mermaid--error` container
    - On timeout (>5s), show "Diagramm-Rendering-Timeout (> 5s)" message plus raw source in the same error container format
    - Ensure errors in one instance do not affect other `MermaidRenderer` instances
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 5.2, 5.5_

  - [ ]* 2.4 Write property test for Code Block Routing
    - **Property 1: Code Block Routing**
    - Generate random code blocks with random language tags (including case variants of "mermaid" like "Mermaid", "MERMAID", "mErMaId")
    - Verify that blocks with mermaid tag produce a container with class `view-mode-mermaid`, while non-mermaid tags produce a container with class `view-mode-code`
    - Use fast-check `fc.string()` and `fc.constantFrom()` for tag generation
    - Minimum 100 iterations
    - **Validates: Requirements 1.1, 1.2, 1.4**

  - [ ]* 2.5 Write property test for Inline SVG Rendering
    - **Property 2: Inline SVG Rendering with Correct Container**
    - Generate random valid SVG strings as mock mermaid render output
    - Verify the output is an inline SVG element (not `<img>`) wrapped in a container with class `view-mode-mermaid`
    - Mock `mermaid.render` to return the generated SVG
    - Minimum 100 iterations
    - **Validates: Requirements 2.3, 7.1**

  - [ ]* 2.6 Write property test for Unique Diagram IDs
    - **Property 3: Unique Diagram IDs**
    - Generate arrays of 2-20 diagram definitions and render them all
    - Collect all IDs passed to `mermaid.render()` and verify all are distinct strings
    - Use fast-check `fc.array()` with `fc.string()` for definitions
    - Minimum 100 iterations
    - **Validates: Requirements 2.4**

  - [ ]* 2.7 Write property test for Error Fallback Completeness
    - **Property 4: Error Fallback Completeness**
    - Generate random error messages and diagram source strings
    - Mock `mermaid.render` to throw with the generated error message
    - Verify the fallback view contains both the error message AND the complete raw source text in a `<pre><code>` block
    - Minimum 100 iterations
    - **Validates: Requirements 4.1, 4.2, 4.3**

- [ ] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 4. Modify `renderCodeBlock` and add CSS styles
  - [ ] 4.1 Modify the `renderCodeBlock` function in `frontend/src/components/ViewMode.tsx`
    - Add `import { MermaidRenderer } from './MermaidRenderer'` at the top of the file
    - Add mermaid detection branch at the beginning of `renderCodeBlock`: `if (lang && lang.toLowerCase() === 'mermaid') { return createElement(MermaidRenderer, { definition: code, diagramKey: key }) }`
    - Ensure the existing highlight.js path remains unchanged for non-mermaid blocks
    - Ensure blocks with no language tag continue to render as plain monospace (existing behavior preserved)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 6.4_

  - [ ] 4.2 Add Mermaid CSS styles to `frontend/src/App.css`
    - Add `.view-mode-mermaid` base styles: `display: block`, `margin: 1.5em 0`, `padding: 16px`, `border: 1px solid var(--border-subtle)`, `border-radius: var(--radius-md)`, `background: var(--bg-surface)`, `text-align: center`, `overflow: auto`
    - Add `.view-mode-mermaid svg` responsive styles: `max-width: 100%`, `height: auto`
    - Add `.view-mode-mermaid--loading` styles: flexbox centered, `min-height: 80px`, `color: var(--text-muted)`, `font-style: italic`
    - Add `.view-mode-mermaid--error` styles: `border-color: var(--danger-border)`, `background: var(--danger-bg)`, `text-align: left`
    - Add `.view-mode-mermaid--error .mermaid-error` styles: `color: var(--danger-text)`, `font-size: 13px`, `margin-bottom: 8px`, `font-weight: 500`
    - Add `.view-mode-mermaid--error pre` and `.view-mode-mermaid--error pre code` styles using existing design tokens
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [ ]* 4.3 Write property test for Error Isolation
    - **Property 5: Error Isolation**
    - Generate N mermaid code blocks (2-10) where exactly one contains an invalid definition
    - Render a full markdown document containing these blocks
    - Verify the N-1 valid blocks render as SVG and the 1 invalid shows the error fallback
    - Verify all non-mermaid content in the document is unaffected
    - Minimum 100 iterations
    - **Validates: Requirements 4.5**

  - [ ]* 4.4 Write property test for Conditional Library Loading
    - **Property 6: Conditional Library Loading**
    - Generate random markdown documents, some with mermaid blocks and some without
    - Verify the mermaid dynamic import is triggered if and only if at least one mermaid code block exists
    - Mock the dynamic `import()` call and track whether it was invoked
    - Minimum 100 iterations
    - **Validates: Requirements 5.3**

- [ ] 5. Directive tolerance and integration wiring
  - [ ] 5.1 Add directive handling support in `MermaidRenderer`
    - Ensure the component passes diagram definitions containing `%%{init: {...}}%%` directives directly to `mermaid.render()` without preprocessing
    - Verify that the mermaid library (with `securityLevel: 'strict'`) handles valid directives and ignores unknown ones
    - Add no additional parsing or filtering logic for directives (rely on mermaid.js built-in behavior)
    - _Requirements: 6.1, 6.2, 6.3_

  - [ ]* 5.2 Write property test for Directive Tolerance
    - **Property 7: Directive Tolerance**
    - Generate diagram definitions with random directive strings (both valid mermaid directives and unknown/unsupported ones)
    - Verify the renderer does not crash on any directive input
    - Verify valid directives are passed through to mermaid and unknown directives are silently ignored
    - Minimum 100 iterations
    - **Validates: Requirements 6.2, 6.3**

  - [ ]* 5.3 Write unit tests for `MermaidRenderer` component
    - Test loading placeholder is shown while library loads (text "Diagramm wird geladen…")
    - Test fallback to plain code block when mermaid init fails
    - Test `theme: 'default'` is applied in light mode
    - Test `theme: 'dark'` is applied in dark mode
    - Test re-render occurs on theme change
    - Test timeout triggers fallback after 5s
    - Test SVG is rendered with max-width 100% (responsive)
    - Test `securityLevel: 'strict'` is used in mermaid config
    - Test inline SVG has overflow: auto on container
    - _Requirements: 2.5, 3.1, 3.2, 3.3, 4.4, 5.2, 5.5, 7.6, 8.1_

- [ ] 6. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The `mermaid` npm package must be added as a runtime dependency to `frontend/package.json` before implementation begins
- All CSS uses existing design tokens (`--border-subtle`, `--radius-md`, `--bg-surface`, `--text-muted`, `--danger-*`) — no new tokens needed
- The `fast-check` library is already available in `devDependencies` (^3.23.2)
- Property-based test file location: `frontend/src/components/MermaidRenderer.pbt.test.tsx`

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2", "2.1"] },
    { "id": 2, "tasks": ["2.2"] },
    { "id": 3, "tasks": ["2.3", "4.2"] },
    { "id": 4, "tasks": ["2.4", "2.5", "2.6", "2.7", "4.1"] },
    { "id": 5, "tasks": ["4.3", "4.4", "5.1"] },
    { "id": 6, "tasks": ["5.2", "5.3"] }
  ]
}
```
