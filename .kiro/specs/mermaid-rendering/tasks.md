# Implementation Plan: Mermaid Rendering

## Overview

Dieses Feature integriert Mermaid-Diagramm-Rendering in die bestehende ViewMode-Komponente. Mermaid-Code-Blöcke werden als SVG-Diagramme gerendert statt mit highlight.js hervorgehoben. Die Implementierung nutzt lazy loading (dynamischer `import()`), Theme-Erkennung via MutationObserver, Fehler-Isolation pro Diagramm und einen 5-Sekunden-Timeout.

## Tasks

- [x] 1. Install mermaid package and set up component file
  - [x] 1.1 Install mermaid npm package with pinned version
    - Run `npm install mermaid@11.4.1` (pinned, no caret) in the frontend directory
    - Verify `package.json` has exact version without `^` or `~`
    - _Requirements: 2.1, 6.1_

  - [x] 1.2 Create MermaidRenderer.tsx with types, constants, and utility functions
    - Create `frontend/src/components/MermaidRenderer.tsx`
    - Define `MermaidRendererProps` interface (`code: string`, `diagramKey: string`)
    - Define `RenderState` discriminated union type (`loading | rendered | error | timeout | load-failed`)
    - Define constants: `RENDER_TIMEOUT_MS = 5000`, `DIAGRAM_ID_PREFIX = 'mermaid-diagram-'`
    - Implement `generateDiagramId()` with monotonically increasing counter
    - Implement `getEffectiveTheme()` — reads `data-theme` attribute from `document.documentElement`, falls back to `prefers-color-scheme` media query
    - Implement `getMermaidTheme()` — maps `'light'` → `'default'`, `'dark'` → `'dark'`
    - Implement `loadMermaid()` — module-level cached `import('mermaid')` promise, returns mermaid default export or null on failure
    - _Requirements: 2.4, 3.1, 3.2, 3.4, 5.1_

- [x] 2. Implement MermaidRenderer component core logic
  - [x] 2.1 Implement MermaidRenderer React component with rendering lifecycle
    - Use `useState<RenderState>` initialized to `{ status: 'loading' }`
    - In `useEffect`: call `loadMermaid()`, on failure set state to `load-failed`
    - On load success: call `mermaid.initialize({ securityLevel: 'strict', theme: getMermaidTheme(getEffectiveTheme()), startOnLoad: false, suppressErrors: true })`
    - Implement `renderWithTimeout()` using `Promise.race` with `setTimeout` for 5s timeout
    - Call `mermaid.render(generateDiagramId(), code)` within timeout wrapper
    - On success: set state to `{ status: 'rendered', svg }`
    - On error: distinguish timeout vs render error, set appropriate state
    - Handle component unmount (abort pending renders via cleanup flag)
    - _Requirements: 2.1, 2.3, 4.1, 5.4, 5.5, 8.1_

  - [x] 2.2 Implement theme change re-rendering with MutationObserver
    - In a separate `useEffect`: create `MutationObserver` on `document.documentElement` observing `data-theme` attribute changes
    - On attribute change: re-initialize mermaid with new theme, re-render current diagram
    - On re-render error: keep last successful SVG, log error to console
    - Clean up observer on unmount
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [x] 2.3 Implement render output (JSX) for all states
    - `loading`: render `<div class="view-mode-mermaid mermaid-loading">` with text "Diagramm wird geladen…" (centered, muted color)
    - `rendered`: render `<div class="view-mode-mermaid">` with `dangerouslySetInnerHTML={{ __html: svg }}` and `overflow: auto`
    - `error`: render `<div class="view-mode-mermaid mermaid-error">` with error message paragraph + `<pre><code>` block showing raw source code
    - `timeout`: render same structure as error with message "Diagramm-Rendering abgebrochen (Timeout)" + raw source
    - `load-failed`: render plain code block identical to unsupported language (same as `renderCodeBlock` fallback)
    - Export `MermaidRenderer` as named export
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 5.2, 5.5, 7.1_

- [x] 3. Integrate into ViewMode and add CSS
  - [x] 3.1 Integrate MermaidRenderer into ViewMode's renderCodeBlock function
    - Add import of `MermaidRenderer` at top of `ViewMode.tsx`
    - In `renderCodeBlock()`: add check at the top — if `lang && lang.toLowerCase() === 'mermaid'`, return `createElement(MermaidRenderer, { code, diagramKey: key, key })`
    - Non-mermaid blocks remain unchanged (existing highlight.js logic)
    - _Requirements: 1.1, 1.2, 1.3, 1.4_

  - [x] 3.2 Add CSS styles for MermaidRenderer containers
    - Add styles in existing `App.css` or a new `MermaidRenderer.css` (co-located):
    - `.view-mode-mermaid`: border `var(--border-subtle)`, border-radius `var(--radius-md)`, background `var(--bg-surface)`, padding, text-align center, overflow auto
    - `.view-mode-mermaid svg`: max-width 100%, height auto (responsive)
    - `.mermaid-error`: background `var(--danger-bg)`, border-color `var(--danger-border)`, text-align left
    - `.mermaid-error pre code`: standard monospace styling
    - `.mermaid-loading`: color `var(--text-muted)`, text-align center, padding
    - All tokens must already exist in `index.css` — verify and use only existing tokens
    - Dark mode variants handled automatically via existing token system
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

- [x] 4. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 5. Write tests for MermaidRenderer
  - [x] 5.1 Write unit tests for MermaidRenderer component
    - Create `frontend/src/components/MermaidRenderer.test.tsx`
    - Mock `mermaid` module with `vi.mock('mermaid', ...)`
    - Test loading state: verify "Diagramm wird geladen…" text appears initially
    - Test successful render: mock `mermaid.render` returning SVG string, verify SVG is inserted inline
    - Test error state: mock `mermaid.render` throwing, verify error message + raw source displayed
    - Test timeout state: mock `mermaid.render` with delayed promise (> 5s via fake timers), verify timeout message
    - Test load failure: mock dynamic import rejection, verify plain code block fallback
    - Test unique IDs: call `generateDiagramId()` multiple times, assert all distinct
    - Test theme detection: mock `document.documentElement.getAttribute('data-theme')`, verify correct theme mapping
    - Test directive pass-through: verify code string passed unmodified to `mermaid.render()`
    - _Requirements: 2.1, 2.3, 2.4, 4.1, 4.2, 4.3, 4.4, 5.2, 5.5, 6.2_

  - [ ]* 5.2 Write property test for code block routing correctness
    - **Property 1: Code block routing correctness**
    - **Validates: Requirements 1.1, 1.2, 1.4**
    - Use fast-check to generate random strings
    - For strings that are case-insensitive "mermaid": assert rendered output contains `.view-mode-mermaid` container
    - For strings that are NOT case-insensitive "mermaid": assert rendered output does NOT contain `.view-mode-mermaid`

  - [ ]* 5.3 Write property test for unique diagram IDs
    - **Property 3: Unique diagram IDs**
    - **Validates: Requirements 2.4**
    - Use fast-check to generate N (1–100) calls to `generateDiagramId()`
    - Assert all returned IDs are distinct (Set size equals array length)

  - [ ]* 5.4 Write property test for error fallback rendering
    - **Property 4: Error fallback rendering**
    - **Validates: Requirements 4.1, 4.2, 4.3**
    - Use fast-check to generate random error messages and code strings
    - Mock `mermaid.render` to throw with generated message
    - Assert DOM contains: `.mermaid-error` class, error message text, `<pre><code>` with raw source

  - [ ]* 5.5 Write property test for directive pass-through
    - **Property 6: Directive pass-through**
    - **Validates: Requirements 6.2**
    - Use fast-check to generate diagram definitions with `%%{init: {...}}%%` directives prepended
    - Assert the full text (including directives) is passed unmodified to `mermaid.render()`

- [x] 6. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- The mermaid package is ~1MB and loaded lazily via dynamic `import()` — never part of the initial bundle
- All CSS uses existing design tokens from `index.css` — no hardcoded colors
- The implementation language is TypeScript/React (consistent with existing frontend code)
- `fast-check` is already in devDependencies — no additional test dependencies needed
- MutationObserver pattern is used because the theme system is DOM-attribute-based, not React-state-based
- Security: `securityLevel: 'strict'` is mandatory — sanitizes embedded HTML/JS in diagram definitions
- Mermaid directives (`%%{init: ...}%%`) are passed through unmodified to support Obsidian compatibility
- Error isolation: each MermaidRenderer instance manages its own state independently

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["1.2"] },
    { "id": 2, "tasks": ["2.1"] },
    { "id": 3, "tasks": ["2.2", "2.3"] },
    { "id": 4, "tasks": ["3.1", "3.2"] },
    { "id": 5, "tasks": ["5.1"] },
    { "id": 6, "tasks": ["5.2", "5.3", "5.4", "5.5"] }
  ]
}
```
