# Implementation Plan: Properties-Editor & Suchoperatoren

## Overview

Vier Task-Gruppen, lose sequenziell geordnet: Gruppe 1 (Property-Type-Registry) und Gruppe 2 (Property-Value-Index) sind Backend-Grundlagen, die von Gruppe 3 (Such-Operatoren) und Gruppe 4 (Properties-Editor) konsumiert werden. Gruppe 3 und 4 können nach Abschluss der Grundlagen parallel bearbeitet werden. Gruppe 5 (Property-Metadaten-API) kann jederzeit nach Gruppe 2 umgesetzt werden.

## Tasks

- [x] 1. Property-Type-Registry (Backend)
  - [x] 1.1 Create property-type module with types and validation
    - Create `backend/src/property-type/types.ts` with `PropertyType` enum, `PropertyTypeEntry`, `PropertyTypeOptions`, `PropertyTypeRegistry`, `IPropertyTypeService` interface
    - Create `backend/src/property-type/validation.ts` with Zod schemas (`propertyTypeSchema`, `propertyTypeEntrySchema`, `propertyTypeRegistrySchema`)
    - Create `backend/src/property-type/index.ts` barrel export
    - _Requirements: 1.1, 1.2, 1.3, 1.9_

  - [x] 1.2 Implement PropertyTypeStore
    - Create `backend/src/property-type/property-type-store.ts` implementing `IPropertyTypeService`
    - Use `KeyedJsonFileStore<PropertyTypeRegistry>` pattern (keyed by vaultId, storage path: `data/vaults/<vaultId>/.slatebase/property-types.json`)
    - Default value: `{ entries: [] }` for missing files (Requirement 1.7)
    - `getRegistry()`: read from store, return entries
    - `saveRegistry()`: validate via Zod schema (max 200 entries), write atomically
    - `upsertEntry()`: read → find/replace by key → write (merge, not full replace)
    - Enforce `tags`/`aliases` key type lock (Requirement 1.8): reject type changes for these reserved keys
    - _Requirements: 1.1, 1.7, 1.8, 1.9_

  - [x] 1.3 Create REST endpoints for property-type management
    - Create `backend/src/api/propertyTypeRoutes.ts` with three routes:
      - `GET /api/v1/vaults/:vaultId/property-types` — returns registry array (read-access check)
      - `PUT /api/v1/vaults/:vaultId/property-types` — replaces entire registry (write-access check)
      - `PUT /api/v1/vaults/:vaultId/property-types/:key` — upserts single entry (write-access check)
    - Use `access-check.ts` pattern for session + vault existence + access validation
    - Zod validation on request bodies before passing to service
    - Wire into composition root (`backend/src/index.ts`): instantiate `PropertyTypeStore`, register routes
    - _Requirements: 1.4, 1.5, 1.6_

  - [x] 1.4 Tests for property-type module
    - Unit tests for `PropertyTypeStore`: create/read/upsert/max-entries/reserved-keys
    - Integration tests for REST endpoints: auth check, read-access, write-access, validation errors (invalid type, key too long, >200 entries)
    - _Requirements: 1.1–1.9_

- [x] 2. Property-Value-Index (Backend)
  - [x] 2.1 Extend LinkIndexService with inverse property index
    - Add `private propertyValueIndex: Map<string, Map<string, Set<string>>>` to `LinkIndexService`
    - Add private helper `rebuildPropertyValueIndex()`: iterates `fileProperties`, populates inverse index (key-lowercase → value-lowercase → Set<filePath>)
    - Call `rebuildPropertyValueIndex()` at end of `rebuild()` and after `loadFromDisk()` deserializes `fileProperties`
    - Extend `updateFile(path, content)`: before updating `fileProperties` for `path`, remove old entries from inverse index; after adding new entries, insert into inverse index
    - Extend `removeFile(path)`: remove all old property entries from inverse index
    - _Requirements: 4.1, 4.2, 4.3, 4.5_

  - [x] 2.2 Implement query methods on LinkIndexService
    - Implement `getFilesByProperty(key: string, value?: string): string[]` — lookup in inverse index, case-insensitive (Requirement 4.6); if value omitted, union all value-sets for the key
    - Implement `getPropertyKeys(): Array<{ key: string; count: number }>` — iterate `propertyValueIndex`, count unique file paths per key (union of all value sets)
    - Implement `getPropertyValues(key: string, limit = 100): Array<{ value: string; count: number }>` — for given key, list all values sorted by count desc, capped at limit
    - Implement `queryByProperties(filters: PropertyFilter[]): string[]` — AND-combine filter results (eq/neq/contains/exists/not_exists operators), max 500 results
    - Export `PropertyFilter` interface from `link-index/types.ts`
    - _Requirements: 4.4, 4.6, 7.1, 7.2, 7.5_

  - [x] 2.3 Tests for property-value-index
    - Unit tests: `getFilesByProperty` with/without value, case-insensitive matching, key not found returns empty
    - Unit tests: `getPropertyKeys` returns correct counts, `getPropertyValues` respects limit and sorting
    - Unit tests: `queryByProperties` with eq/neq/contains/exists/not_exists, AND combination, max-500 cap
    - Integration test: `updateFile` + `removeFile` keep inverse index consistent (add file → query finds it, remove file → query no longer finds it)
    - _Requirements: 4.1–4.6_

- [x] 3. Such-Operatoren (Backend + Frontend)
  - [x] 3.1 Implement query parser
    - Create `backend/src/search/query-parser.ts` with `parseSearchQuery(raw: string): ParsedQuery`
    - Tokenization regex for operator extraction: `-?` prefix + `path|file|tag|property` keyword + `:` + quoted or unquoted value
    - Handle `property:key=value` split at first `=`
    - Collect unmatched text as `freeText` (trimmed, normalized whitespace)
    - Unknown `foo:bar` patterns kept as free-text (Requirement 5.8)
    - Support quoted values with escaped quotes: `path:"My Folder/**"` (Requirement 5.7)
    - Export `ParsedQuery` and `ParsedOperator` types from `search/types.ts`
    - _Requirements: 5.1, 5.7, 5.8, 5.11_

  - [x] 3.2 Implement glob-match utility
    - Create `backend/src/search/glob-match.ts` with `globMatch(filePath: string, pattern: string): boolean`
    - Support: `*` (any chars in single segment), `**` (any depth), `?` (single char)
    - Case-insensitive matching (consistent with platform-agnostic vault paths)
    - No external dependency — simple regex-translation implementation (~40 lines)
    - _Requirements: 5.10_

  - [x] 3.3 Integrate operator pre-filtering into SearchService
    - Add private method `resolveOperatorFilters(vaultId, operators, allFiles): Promise<string[] | null>` to `SearchService`
    - Inclusion phase: for each non-negated operator, resolve candidate set (`path:` via globMatch, `file:` via substring, `tag:` via `linkIndex.getFilesByTag()`, `property:` via `linkIndex.getFilesByProperty()`); intersect all inclusion sets (AND — Requirements 5.4, 5.5)
    - Exclusion phase: for each negated operator, resolve and subtract from candidates (Requirement 5.6)
    - No operators → return null (legacy path, no filtering)
    - In `search()`: call `parseSearchQuery(options.query)` at the top; if operators present, resolve filters and use filtered file list; replace `options.query` with `parsed.freeText` for the matcher
    - File-listing mode: if `freeText` is empty and operators are present, return all matching files with empty matchText (Requirement 5.3) — new private helper `buildFileListingResponse()`
    - Operator filtering is always case-insensitive regardless of `caseSensitive` option (Requirement 5.9)
    - _Requirements: 5.2, 5.3, 5.4, 5.5, 5.6, 5.9_

  - [x] 3.4 Frontend: operator syntax highlighting
    - Create `frontend/src/components/search-operator-highlight.ts` with `highlightSearchQuery(query: string): HighlightedSegment[]` — mirrors backend parsing regex client-side
    - Extend `SearchPanel.tsx`: add a shadow `<div>` behind the transparent search `<input>` that renders highlighted `<span>` segments for operator keywords, values, and negation prefixes
    - Add CSS classes: `.search-operator-keyword`, `.search-operator-value`, `.search-operator-negation` with Design Token colors
    - _Requirements: 6.1_

  - [x] 3.5 Frontend: operator autocomplete
    - Extend `SearchPanel.tsx`: detect cursor position after a completed operator prefix (e.g. `tag:▌`); show a dropdown with filtered suggestions
    - Data sources loaded on SearchPanel mount (cached in component state):
      - `tag:` → `apiClient.getGraphTags(vaultId)` (existing endpoint)
      - `property:` → `apiClient.getGraphMeta(vaultId).propertyKeys` (existing endpoint)
      - `path:` → top-level directory names from the loaded `DirectoryTree`
    - Dropdown is keyboard-navigable (ArrowUp/Down, Enter to select, Escape to close — same pattern as CommandPalette)
    - Selected value is inserted at cursor position, replacing any partial input after the `:`
    - No autocomplete for `file:` (too many candidates) or for incomplete prefixes (Requirement 6.3)
    - _Requirements: 6.2, 6.3, 6.4, 6.5_

  - [x] 3.6 Frontend: operator help popover and file-listing mode
    - Create `frontend/src/components/SearchOperatorHelp.tsx` — small popover with static table of operators + examples, triggered by a `?` icon button next to the search input
    - Extend `SearchPanel.tsx` result rendering: when results have empty `matchText` (file-listing mode from Requirement 5.3), render as a plain file list without context snippets; each entry clickable (opens file)
    - _Requirements: 6.6, 6.7_

  - [x] 3.7 Tests for search operators
    - Unit tests for `parseSearchQuery`: single operator, multiple operators, negation, quoted values, unknown operators as freetext, property with key=value split, empty freetext
    - Unit tests for `globMatch`: `*`, `**`, `?`, case-insensitivity, edge cases (empty pattern, pattern = `**`)
    - Integration test for `SearchService.search()`: operators filter files correctly (tag, path, property, file, negation combinations); file-listing mode returns files without matchText; mixed operators + freetext
    - Unit tests for `highlightSearchQuery`: correct segment types for complex queries
    - Component test for SearchPanel: autocomplete appears after `tag:`, keyboard navigation works, selection inserts value
    - _Requirements: 5.1–5.11, 6.1–6.7_

- [x] 4. Properties-Editor (Frontend)
  - [x] 4.1 Implement frontmatter writer utility
    - Create `frontend/src/utils/frontmatterWriter.ts` with:
      - `locateFrontmatterBlock(content): { from, to, raw } | null` — finds byte boundaries of the YAML block (between `---` delimiters)
      - `serializeFrontmatter(data, originalKeyOrder?): string` — converts Record to YAML text (preserves key order, correct formatting for arrays/booleans/dates)
      - `applyFrontmatterChange(content, data, originalKeyOrder?): string` — replaces or creates frontmatter block in full document content
    - No `yaml` package for serialization (only for parsing) — custom line builder for Obsidian-compatible output
    - Handle edge cases: no existing frontmatter (prepend new block), empty data after deletion (remove block entirely)
    - _Requirements: 3.4, 3.5_

  - [x] 4.2 Extend document panel state for property types
    - Add `typeRegistry: PropertyTypeEntry[] | null` to `DocumentPanelState.properties`
    - Add `SET_PROPERTY_TYPE_REGISTRY` action and reducer case
    - Create `loadPropertyTypes(dispatch, apiClient, vaultId)` in `documentPanelActions.ts` — fetches `GET /vaults/:vaultId/property-types` once per vault switch
    - Wire `loadPropertyTypes` call in `useDocumentPanelData` on vault change (not on every document switch)
    - Add `IApiClient` methods: `getPropertyTypes(vaultId)`, `savePropertyTypes(vaultId, registry)`, `upsertPropertyType(vaultId, entry)`
    - _Requirements: 1.4, 3.1_

  - [x] 4.3 Implement property type controls
    - Create `frontend/src/components/context-panel/property-controls/` directory with individual control components:
      - `TextPropertyControl.tsx` — single-line text input, Enter/Blur commits
      - `NumberPropertyControl.tsx` — numeric input with validation
      - `DatePropertyControl.tsx` — native `<input type="date">` or manual ISO field
      - `DatetimePropertyControl.tsx` — native `<input type="datetime-local">`
      - `CheckboxPropertyControl.tsx` — toggle switch
      - `ListPropertyControl.tsx` — chip editor (add/remove/reorder chips)
      - `TagsPropertyControl.tsx` — chip editor with autocomplete dropdown (tags from vault)
    - Each control: accepts `value`, `onChange(newValue)`, optional `options` (allowedValues)
    - Each control: handles focus, keyboard (Escape=cancel, Enter=commit for text/number)
    - Shared CSS in `property-controls.css` using Design Tokens
    - _Requirements: 3.3_

  - [x] 4.4 Implement PropertiesEditor main component
    - Create `frontend/src/components/context-panel/PropertiesEditor.tsx` replacing `PropertiesView` in edit mode
    - Props: `data`, `parseError`, `typeRegistry`, `onCommit(key, value)`, `onAddProperty(key, value)`, `onDeleteProperty(key)`, `onRenameProperty(oldKey, newKey)`, `tagSuggestions`, `propertySuggestions`
    - Renders a list of `PropertyRow` components (key cell + value control based on resolved type)
    - Type resolution order: Registry entry → Type-Inference from value (Requirement 2.1)
    - Type mismatch badge when registry type ≠ actual value type (Requirement 2.3)
    - "Add property" row at the bottom with key autocomplete (from `propertySuggestions`) and initial type inference
    - Delete button per property row (Requirement 3.8)
    - Inline rename on key double-click (Requirement 3.10)
    - Parse error state: show error + raw YAML, no editing (Requirement 3.9)
    - Non-markdown file state: placeholder message (Requirement 3.12)
    - Create `PropertiesEditor.css`
    - _Requirements: 3.1–3.12, 2.1–2.3_

  - [x] 4.5 Wire PropertiesEditor into the side panel
    - In the component that renders the "Properties" tab view (inside `SidePanel.tsx` or its child): conditionally render `PropertiesEditor` (when document is editable) vs. `PropertiesView` (read-only)
    - Determine editability: vault write-access + active tab is a markdown file + not in view-only mode
    - Implement `handlePropertyCommit(key, newValue)`:
      1. Build updated data object from current `state.properties.data`
      2. Call `applyFrontmatterChange(documentContent, updatedData, originalKeyOrder)` to get new full content
      3. Call the content-change callback (same path as manual CM6 edits) to trigger `UPDATE_TAB_CONTENT` + auto-save
    - Implement `handleAddProperty(key, value)` and `handleDeleteProperty(key)` similarly (modify data, apply, commit)
    - Pass vault-wide tag suggestions from the existing tags state (`state.tags.entries`)
    - Pass property-key suggestions from the type registry or from `GraphMeta.propertyKeys`
    - _Requirements: 3.1, 3.2, 3.4, 3.5, 3.6, 3.11_

  - [ ] 4.6 Optional: register property type from editor
    - In `PropertiesEditor`: when a user manually changes a property's type via a type-selector dropdown (small gear icon per row), call `apiClient.upsertPropertyType(vaultId, { key, type })` to persist the choice in the registry
    - Show a subtle "Typ gespeichert" toast on success
    - This is the explicit "register in registry" action (Requirement 2.2 — inference result is NOT auto-saved, only explicit user action saves)
    - _Requirements: 2.2, 3.7_

  - [x] 4.7 Tests for Properties-Editor
    - Unit tests for `frontmatterWriter`: `locateFrontmatterBlock` (with/without frontmatter, CRLF), `serializeFrontmatter` (scalars, arrays, booleans, dates, key order preservation), `applyFrontmatterChange` (existing block update, new block creation, block removal on empty data)
    - Component tests for `PropertiesEditor`: renders correct controls per type, commit triggers content change, add/delete/rename property flows, type mismatch badge visibility, parse error fallback
    - Component tests for individual property controls: `CheckboxPropertyControl` toggle, `ListPropertyControl` add/remove chips, `TagsPropertyControl` autocomplete
    - _Requirements: 2.1–2.3, 3.1–3.12_

- [x] 5. Property-Metadaten-API (Backend)
  - [x] 5.1 Create property metadata routes
    - Create `backend/src/api/propertyRoutes.ts` with:
      - `GET /api/v1/vaults/:vaultId/properties` — calls `linkIndex.getPropertyKeys()`, enriches with type info from `PropertyTypeStore.getRegistry(vaultId)`, returns `PropertyKeysResponse`
      - `GET /api/v1/vaults/:vaultId/properties/:key/values` — calls `linkIndex.getPropertyValues(key, limit)`, supports `?offset=&limit=` query params, returns `PropertyValuesResponse`
      - `POST /api/v1/vaults/:vaultId/properties/query` — validates body (max 10 filters), calls `linkIndex.queryByProperties(filters)`, returns `PropertyQueryResponse`
    - All routes: session auth + read-access check on vault
    - Zod validation for query body (filters array, max 10 entries, operator enum)
    - Wire into composition root, mount on vault router
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [x] 5.2 Tests for property metadata API
    - Integration tests: `GET /properties` returns keys with counts and types, `GET /properties/:key/values` pagination, `POST /properties/query` with various filter combinations
    - Auth/access tests: unauthenticated → 401, no access → 403
    - Validation tests: invalid filter operator → 400, too many filters → 400
    - _Requirements: 7.1–7.6_

