# Implementation Plan: Context Panel

## Overview

Das Context Panel ersetzt den Platzhalter im rechten Seitenpanel durch vier spezialisierte Ansichten (Outline, Links, Tags, Properties) mit Tab-Navigation, Drag & Drop Reordering, Split-Sections und reaktiven Datenquellen. Die Implementierung umfasst einen neuen Backend-Endpoint für vault-weite Tags, einen eigenen Frontend-State-Layer (Reducer + Provider), vier View-Komponenten und ein Tab-System mit Drag & Drop und Panel-Splitting.

## Tasks

- [x] 1. State Layer und Provider
  - [x] 1.1 Create context panel state types and reducer
    - Create `frontend/src/state/contextPanelState.ts` with all types (`ContextPanelViewId`, `SplitSection`, `OutlineHeading`, `LinkEntry`, `TagEntry`, `ContextPanelState`, `ContextPanelAction`)
    - Implement `contextPanelReducer` handling all action types (SET_TAB_ORDER, SET_ACTIVE_VIEW, SPLIT_VIEW, MERGE_SECTION, REMOVE_SECTION, RESIZE_SECTIONS, SET_OUTLINE, SET_ACTIVE_ANCHOR, SET_FORWARD_LINKS, SET_BACKLINKS, SET_BACKLINKS_LOADING, SET_BACKLINKS_ERROR, SET_TAGS, SET_TAGS_LOADING, SET_TAG_EXPANDED, SET_PROPERTIES, RESET_DOCUMENT_STATE)
    - Implement initial state with default tab order and single section
    - Enforce max 3 sections invariant in SPLIT_VIEW
    - Enforce minimum height fraction in RESIZE_SECTIONS
    - Implement equal height redistribution on split/merge
    - _Requirements: 1.1, 1.2, 7.1, 7.3, 7.4, 7.5, 7.6_

  - [x] 1.2 Create context panel context and provider
    - Create `frontend/src/state/contextPanelContext.ts` with `ContextPanelProvider` and `useContextPanelContext` hook
    - Provider wraps children with reducer state and dispatch
    - Load persisted layout from localStorage on mount
    - Save layout to localStorage on state changes (debounced)
    - Handle localStorage unavailability gracefully (fall back to defaults)
    - _Requirements: 6.4, 6.5, 7.8_

  - [x] 1.3 Create context panel action creators
    - Create `frontend/src/state/contextPanelActions.ts` with action creator functions
    - Implement `loadOutline(dispatch, content)` — parses headings from markdown content
    - Implement `loadForwardLinks(dispatch, content)` — extracts wikilinks using `extractWikilinks()`
    - Implement `loadBacklinks(dispatch, apiClient, vaultId, filePath)` — fetches from backlinks endpoint
    - Implement `loadTags(dispatch, apiClient, vaultId)` — fetches from new tags endpoint
    - Implement `loadProperties(dispatch, content)` — parses YAML frontmatter
    - Implement `expandTag(dispatch, apiClient, vaultId, tagName)` — fetches files for a tag
    - All actions handle errors gracefully (dispatch error state, don't throw)
    - _Requirements: 2.1, 3.2, 3.3, 4.1, 5.1_

  - [ ]* 1.4 Write unit tests for context panel reducer
    - Test all action types produce correct state transitions
    - Test tab reorder logic for all valid source/target combinations
    - Test split section creation, merge, and removal
    - Test height fraction redistribution after split/merge
    - Test maximum section count enforcement (max 3)
    - Test RESIZE_SECTIONS clamps to minimum height
    - Test RESET_DOCUMENT_STATE clears view-specific data
    - _Requirements: 1.2, 7.1, 7.3, 7.5, 7.6_

  - [ ]* 1.5 Write property tests for context panel state
    - **Property 2: Tab reorder produces correct insertion order**
    - **Property 11: Tab order persistence round-trip**
    - **Property 12: Split section creation distributes height equally**
    - **Property 13: Section resize maintains minimum height invariant**
    - **Property 14: Empty section removal on merge**
    - **Property 15: Maximum three sections invariant**
    - **Property 16: Layout persistence round-trip**
    - **Validates: Requirements 1.5, 6.1, 6.4, 7.1, 7.3, 7.4, 7.5, 7.6, 7.8**

- [x] 2. Backend Tags Endpoint
  - [x] 2.1 Implement tags endpoint in graph routes
    - Add `GET /vaults/:vaultId/tags` endpoint to `graphRoutes.ts` (or create new `tagRoutes.ts`)
    - Iterate over all text files in the vault using `IVaultReader`
    - Extract tags using regex matching `#tag` syntax (letters, digits, underscores, hyphens, slashes), excluding tags inside code blocks and inline code
    - Return `{ tags: Array<{ name: string, count: number, files: string[] }> }`
    - Reuse existing `checkAccess` pattern for auth/vault validation
    - Skip unreadable files without error (log warning)
    - Return empty array for vaults with no tags
    - _Requirements: 4.1, 4.2, 4.8_

  - [ ]* 2.2 Write unit tests for tags endpoint
    - Test returns correct tag counts for vault with known content
    - Test skips unreadable files without error
    - Test returns empty array for vault with no tags
    - Test respects access control (403 for unauthorized users)
    - Test returns 404 for non-existent vault
    - Test excludes tags inside code blocks and inline code
    - _Requirements: 4.1, 4.2, 4.8_

- [x] 3. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 4. Utility Functions
  - [x] 4.1 Implement heading extraction utility
    - Create `frontend/src/components/context-panel/utils/extractHeadings.ts`
    - Use regex `/^(#{1,6})\s+(.+)$/gm` to extract headings from markdown content
    - Strip inline formatting markers from heading text (bold, italic, code)
    - Generate anchors using existing `generateHeadingAnchor()` from `heading-anchor.ts` with `createAnchorTracker()` for duplicate handling
    - Return `OutlineHeading[]` in document order
    - _Requirements: 2.1_

  - [x] 4.2 Implement localStorage persistence utilities
    - Create `frontend/src/components/context-panel/utils/persistence.ts`
    - Implement `saveContextPanelLayout(userId, layout)` — serializes to localStorage key `slatebase_context_panel_${userId}`
    - Implement `loadContextPanelLayout(userId)` — deserializes from localStorage, validates structure
    - Handle localStorage unavailability (return null)
    - Handle corrupted/invalid data (discard, return null)
    - _Requirements: 6.4, 6.5, 7.8_

  - [x] 4.3 Implement frontmatter parsing utility
    - Create `frontend/src/components/context-panel/utils/parseFrontmatter.ts`
    - Extract YAML frontmatter block from markdown content (between `---` delimiters)
    - Parse using `yaml` package
    - Return `{ data: Record<string, unknown> | null, parseError: string | null, rawFrontmatter: string | null }`
    - Handle invalid YAML gracefully (return error + raw text)
    - Handle empty frontmatter (return null data)
    - _Requirements: 5.1, 5.6, 5.7_

  - [ ]* 4.4 Write property tests for utility functions
    - **Property 3: Heading extraction captures all headings with correct levels**
    - **Property 4: Heading anchor normalization is consistent**
    - **Property 5: Forward link extraction is complete**
    - **Property 7: Tags are sorted alphabetically case-insensitive**
    - **Property 8: Frontmatter key-value display completeness**
    - **Property 10: Array values render as comma-separated text**
    - **Validates: Requirements 2.1, 2.3, 3.2, 4.3, 5.1, 5.5**

- [x] 5. Tab Bar Component
  - [x] 5.1 Implement ContextPanelTabBar component
    - Create `frontend/src/components/context-panel/ContextPanelTabBar.tsx`
    - Render four tabs with icons (Lucide) and labels: "Gliederung", "Links", "Tags", "Eigenschaften"
    - Highlight active tab with visually distinct style (bottom border)
    - Implement HTML5 Drag API for tab reordering
    - Show vertical insertion line (2px, accent color) during drag at drop position
    - Show "not-allowed" cursor when dragging outside Tab_Bar boundaries
    - Prevent drag when only one tab in the bar
    - Support icon-only mode when panel width < 200px
    - Implement tab split: detect drag 30px below Tab_Bar bottom edge
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 6.1, 6.2, 6.3, 6.6, 7.1, 7.2, 8.1, 8.4_

  - [ ]* 5.2 Write unit tests for ContextPanelTabBar
    - Test renders all four tabs with correct labels and icons
    - Test click switches active tab
    - Test drag and drop reorders tabs
    - Test icon-only mode below 200px width
    - Test insertion line appears during drag
    - Test single tab is not draggable
    - _Requirements: 1.1, 1.2, 6.1, 8.1_

- [ ] 6. View Components
  - [x] 6.1 Implement OutlineView component
    - Create `frontend/src/components/context-panel/OutlineView.tsx`
    - Render headings as nested list with 12px indentation per level
    - Highlight the heading corresponding to the topmost visible heading (via IntersectionObserver or scroll position)
    - On heading click: scroll document to heading using smooth scrolling with `block: 'start'`
    - Show localized placeholder when no headings found
    - Show localized placeholder when no document is open
    - _Requirements: 2.1, 2.2, 2.3, 2.5, 2.7, 1.4_

  - [x] 6.2 Implement LinksView component
    - Create `frontend/src/components/context-panel/LinksView.tsx`
    - Render two sections: "Ausgehende Links" (forward) and "Eingehende Links" (backlinks)
    - Display link targets as filename without extension (or relative path if path prefix exists)
    - Visually distinguish resolved (normal opacity) vs unresolved (opacity 0.5, strikethrough) links
    - On resolved link click: open document in new editor tab
    - Unresolved links are non-interactive
    - Show loading state for backlinks
    - Show error message if backlinks API fails (forward links remain functional)
    - Show placeholder when no links found in respective section
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.9, 3.10, 1.4_

  - [x] 6.3 Implement TagsView component
    - Create `frontend/src/components/context-panel/TagsView.tsx`
    - Display tags sorted alphabetically (case-insensitive) with occurrence count
    - On tag click: expand to show list of files containing that tag
    - On file click: open file in new editor tab
    - Show loading indicator while tags are being fetched
    - Show placeholder when no tags found
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

  - [x] 6.4 Implement PropertiesView component
    - Create `frontend/src/components/context-panel/PropertiesView.tsx`
    - Render frontmatter as two-column table (key | value)
    - Indent nested objects by 1rem per level (max 5 levels, deeper as inline JSON)
    - Render array values as comma-separated inline text
    - Show error message + raw frontmatter as `<pre>` block on parse failure
    - Show placeholder when no frontmatter found
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7, 1.4_

  - [ ]* 6.5 Write unit tests for view components
    - Test OutlineView renders headings with correct indentation
    - Test OutlineView shows placeholder when no headings
    - Test LinksView renders forward and backlinks sections
    - Test LinksView distinguishes resolved/unresolved links visually
    - Test LinksView shows error state for backlinks
    - Test TagsView renders sorted tags with counts
    - Test TagsView expands tag to show files
    - Test PropertiesView renders key-value pairs
    - Test PropertiesView handles nested objects and arrays
    - Test PropertiesView shows error + raw frontmatter on parse failure
    - _Requirements: 2.1, 2.5, 3.1, 3.6, 3.10, 4.3, 4.6, 5.1, 5.2, 5.5, 5.6_

  - [ ]* 6.6 Write property tests for view rendering logic
    - **Property 6: Resolved vs unresolved link visual distinction**
    - **Property 9: Nested YAML indentation depth**
    - **Property 17: Responsive icon-only mode below 200px**
    - **Property 18: Text entries have tooltip with full text**
    - **Validates: Requirements 3.6, 5.2, 8.1, 8.2, 8.4**

- [x] 7. Checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

- [x] 8. Split Section Container
  - [x] 8.1 Implement SplitSectionContainer component
    - Create `frontend/src/components/context-panel/SplitSectionContainer.tsx`
    - Render sections as vertically stacked areas
    - Each section has its own TabBar (if multiple views assigned)
    - Display 4px resize handle between sections
    - Implement drag-to-resize between sections (enforce 80px minimum height)
    - Show drop indicator when tab is dragged below TabBar threshold (30px)
    - Handle section merge: when last view is dragged out, remove empty section
    - Redistribute height equally among remaining sections after removal
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6, 7.7, 7.9_

  - [ ]* 8.2 Write unit tests for SplitSectionContainer
    - Test renders single section by default
    - Test creates new section on tab split
    - Test enforces maximum 3 sections
    - Test resize handle adjusts heights
    - Test minimum 80px height constraint
    - Test empty section removal on merge
    - Test each section shows its own TabBar when multiple views
    - _Requirements: 7.1, 7.3, 7.4, 7.5, 7.6, 7.9_

- [x] 9. Main ContextPanel Component and Integration
  - [x] 9.1 Implement main ContextPanel component
    - Create `frontend/src/components/context-panel/ContextPanel.tsx`
    - Accept props: `documentContent`, `documentPath`, `vaultId`, `width`
    - Orchestrate data loading: on document change, dispatch RESET_DOCUMENT_STATE then load outline, links, properties
    - Debounce content-change updates (500ms)
    - Load backlinks when document path changes
    - Load tags when vault changes
    - Wire tab switching, reordering, splitting to reducer actions
    - _Requirements: 2.4, 2.6, 3.7, 3.8, 5.4_

  - [x] 9.2 Integrate ContextPanel into App.tsx
    - Add `ContextPanelProvider` to provider hierarchy (inside TabProvider and AppProvider)
    - Replace right panel placeholder with `ContextPanel` component
    - Pass active document content, path, vaultId, and panel width as props
    - Ensure existing useResize hook and toggle button continue to work
    - Apply responsive behavior: min-width 160px, max-width 500px
    - _Requirements: 8.3_

  - [x] 9.3 Add CSS styles for context panel
    - Create `frontend/src/components/context-panel/ContextPanel.css`
    - Define styles for tab bar (active state, drag indicators, icon-only mode)
    - Define styles for split sections (resize handle, drop zones)
    - Define styles for each view (outline indentation, link styling, tag list, properties table)
    - Use Design Tokens (CSS Custom Properties) for all colors
    - Support dark mode via existing token system
    - Implement text truncation with ellipsis and title attribute for tooltips
    - _Requirements: 8.1, 8.2, 8.3, 8.4_

  - [x] 9.4 Add i18n translations for context panel
    - Add `contextPanel.*` namespace to German translations (`de.ts`)
    - Add `contextPanel.*` namespace to English translations (`en.ts`)
    - Keys: tab labels, placeholder messages, error messages, section headers
    - _Requirements: 1.1, 1.4, 2.5, 3.9, 3.10, 4.6, 5.3_

  - [ ]* 9.5 Write integration tests for ContextPanel
    - Test document switch triggers view updates
    - Test debounce behavior (500ms delay on content change)
    - Test backlinks API integration (mock fetch, verify correct endpoint called)
    - Test tags API integration (mock fetch, verify loading/success/error states)
    - Test tab order persists to localStorage and restores on mount
    - Test split layout persists and restores
    - _Requirements: 2.4, 2.6, 3.7, 3.8, 6.4, 7.8_

- [x] 10. Final checkpoint - Ensure all tests pass
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- The backend tags endpoint extends the existing `graphRoutes.ts` module (or creates a new `tagRoutes.ts`)
- The frontend uses the existing `extractWikilinks()` from `plugins/wikilink/extract.ts` for forward link extraction
- Heading anchor generation reuses `generateHeadingAnchor()` from `plugins/heading-anchor.ts`
- All property-based tests go in `frontend/src/components/context-panel/context-panel.pbt.test.ts` using `fast-check`

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "2.1", "4.1", "4.2", "4.3"] },
    { "id": 1, "tasks": ["1.2", "1.3", "1.4", "2.2", "4.4"] },
    { "id": 2, "tasks": ["1.5", "5.1", "6.1", "6.2", "6.3", "6.4"] },
    { "id": 3, "tasks": ["5.2", "6.5", "6.6", "8.1"] },
    { "id": 4, "tasks": ["8.2", "9.1", "9.3", "9.4"] },
    { "id": 5, "tasks": ["9.2"] },
    { "id": 6, "tasks": ["9.5"] }
  ]
}
```
