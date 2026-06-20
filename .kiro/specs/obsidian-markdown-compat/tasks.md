# Implementation Plan: Obsidian Markdown Kompatibilität

## Overview

Implementierung von vier modularen remark-Plugins (Wikilink, Embed, Callout, Tag) für Obsidian-kompatibles Markdown-Rendering. Jedes Plugin folgt dem micromark-Extension-Pattern (Syntax → mdast-util → Plugin-Wrapper) bzw. dem MDAST-Transformer-Pattern (Callout). Integration in die bestehende ViewMode-Komponente mit CSS Design Tokens für konsistentes Styling.

## Tasks

- [x] 1. Shared Types und Plugin-Infrastruktur
  - [x] 1.1 Create MDAST node type definitions and plugin infrastructure
    - Create `frontend/src/plugins/types.ts` with `WikilinkNode`, `EmbedNode`, `CalloutNode`, `TagNode`, `WikilinkInfo`, `CalloutTypeConfig`, `IMAGE_EXTENSIONS`
    - Add mdast module augmentation for `PhrasingContentMap` and `BlockContentMap`
    - Create `frontend/src/plugins/index.ts` barrel export (initially empty, extended as plugins are added)
    - _Requirements: 11.1, 11.2, 11.3, 11.4_

- [x] 2. Wikilink Plugin
  - [x] 2.1 Implement wikilink micromark syntax extension
    - Create `frontend/src/plugins/wikilink/syntax.ts`
    - Tokenize `[[target]]`, `[[target|display]]`, `[[target#heading]]`, `[[#heading]]` patterns
    - Handle special characters in targets (spaces, umlauts, punctuation)
    - Skip wikilink syntax inside code blocks and inline code
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 1.6_

  - [x] 2.2 Implement wikilink mdast-util (fromMarkdown + toMarkdown)
    - Create `frontend/src/plugins/wikilink/mdast-util.ts`
    - `wikilinkFromMarkdown()`: Convert tokens to `WikilinkNode` with correct `target`, `display`, `heading` fields
    - `wikilinkToMarkdown()`: Serialize `WikilinkNode` back to `[[target]]`, `[[target|display]]`, `[[target#heading]]`, `[[#heading]]`
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 13.1, 13.2, 13.3, 13.4_

  - [x] 2.3 Implement wikilink remark plugin wrapper
    - Create `frontend/src/plugins/wikilink/plugin.ts`
    - Register micromark extension and mdast-util extensions on `this.data()`
    - Export `remarkWikilink` as named export
    - _Requirements: 11.1_

  - [x] 2.4 Implement extractWikilinks utility
    - Create `frontend/src/plugins/wikilink/extract.ts`
    - Parse markdown with `remarkWikilink`, walk tree collecting `WikilinkNode` instances
    - Skip wikilinks inside code/inlineCode nodes
    - Return `WikilinkInfo[]` with target, display, heading, position
    - _Requirements: 17.1, 17.2, 17.3, 17.4_

  - [ ]* 2.5 Write unit tests for wikilink plugin
    - Create `frontend/src/plugins/wikilink/wikilink.test.ts`
    - Test all wikilink variants (simple, display text, heading, same-page heading)
    - Test special characters, code-block immunity, serialization round-trip
    - Test `extractWikilinks` utility
    - _Requirements: 1.1–1.7, 13.1–13.5, 17.1–17.4_

- [x] 3. Embed Plugin
  - [x] 3.1 Implement embed micromark syntax extension
    - Create `frontend/src/plugins/embed/syntax.ts`
    - Tokenize `![[target]]` and `![[target#heading]]` patterns
    - Detect embed type from file extension (image vs. note using `IMAGE_EXTENSIONS`)
    - Skip embed syntax inside code blocks and inline code
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

  - [x] 3.2 Implement embed mdast-util (fromMarkdown + toMarkdown)
    - Create `frontend/src/plugins/embed/mdast-util.ts`
    - `embedFromMarkdown()`: Convert tokens to `EmbedNode` with `target`, `heading`, `embedType`
    - `embedToMarkdown()`: Serialize `EmbedNode` back to `![[target]]` or `![[target#heading]]`
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 14.1, 14.2_

  - [x] 3.3 Implement embed remark plugin wrapper
    - Create `frontend/src/plugins/embed/plugin.ts`
    - Register micromark extension and mdast-util extensions
    - Export `remarkEmbed` as named export
    - _Requirements: 11.2_

  - [ ]* 3.4 Write unit tests for embed plugin
    - Create `frontend/src/plugins/embed/embed.test.ts`
    - Test image embed, note embed, heading fragment, no-extension fallback
    - Test code-block immunity, serialization round-trip
    - _Requirements: 4.1–4.6, 14.1–14.3_

- [x] 4. Callout Plugin
  - [x] 4.1 Implement callout MDAST transformer
    - Create `frontend/src/plugins/callout/transform.ts`
    - Visit `blockquote` nodes, detect `[!type]` pattern in first paragraph
    - Parse foldable markers (`+`/`-`), custom title, body content
    - Replace blockquote node with `CalloutNode` in parent
    - Handle unknown callout types gracefully
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6_

  - [x] 4.2 Implement callout serializer (toMarkdown)
    - Create `frontend/src/plugins/callout/serializer.ts`
    - Serialize `CalloutNode` back to `> [!type] Title` format
    - Handle foldable markers (`+`/`-`) and body lines with `> ` prefix
    - _Requirements: 15.1, 15.2, 15.3, 15.4_

  - [x] 4.3 Implement callout remark plugin wrapper
    - Create `frontend/src/plugins/callout/plugin.ts`
    - Register MDAST transformer via `this.data()` or tree transformation in `run` phase
    - Register toMarkdown extension for serialization
    - Export `remarkCallout` as named export
    - _Requirements: 11.3_

  - [ ]* 4.4 Write unit tests for callout plugin
    - Create `frontend/src/plugins/callout/callout.test.ts`
    - Test all callout variants (basic, custom title, foldable +/-, multi-line body)
    - Test unknown types, serialization round-trip
    - _Requirements: 6.1–6.7, 15.1–15.5_

- [x] 5. Tag Plugin
  - [x] 5.1 Implement tag micromark syntax extension
    - Create `frontend/src/plugins/tag/syntax.ts`
    - Tokenize `#tagname` and `#nested/tag` patterns
    - Distinguish from heading syntax (line-start `#`), URLs, code blocks
    - Only recognize tags starting with letter/underscore, containing letters/digits/underscores/hyphens/slashes
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

  - [x] 5.2 Implement tag mdast-util (fromMarkdown + toMarkdown)
    - Create `frontend/src/plugins/tag/mdast-util.ts`
    - `tagFromMarkdown()`: Convert tokens to `TagNode` with `tag` field
    - `tagToMarkdown()`: Serialize `TagNode` back to `#tagname`
    - _Requirements: 8.1, 8.2, 16.1, 16.2_

  - [x] 5.3 Implement tag remark plugin wrapper
    - Create `frontend/src/plugins/tag/plugin.ts`
    - Register micromark extension and mdast-util extensions
    - Export `remarkTag` as named export
    - _Requirements: 11.4_

  - [ ]* 5.4 Write unit tests for tag plugin
    - Create `frontend/src/plugins/tag/tag.test.ts`
    - Test simple tags, nested tags, heading distinction, code-block immunity, URL immunity
    - Test serialization round-trip
    - _Requirements: 8.1–8.7, 16.1–16.3_

- [x] 6. Checkpoint - Alle Plugins implementiert
  - Ensure all tests pass, ask the user if questions arise.

- [x] 7. Link Resolver und Heading Anchor
  - [x] 7.1 Implement link resolver module
    - Create `frontend/src/plugins/link-resolver.ts`
    - `resolveWikilinkTarget(target, tree)`: Case-insensitive search, `.md` extension fallback, path-based resolution
    - `collectFilesSorted(tree)`: Depth-first alphabetical file collection
    - `resolvePathTarget(target, files)`: Relative path resolution
    - Return `null` for unresolvable targets
    - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5, 10.6_

  - [x] 7.2 Implement heading anchor generation utility
    - Create `frontend/src/plugins/heading-anchor.ts`
    - `generateHeadingAnchor(text)`: Lowercase, spaces→hyphens, remove non-alphanumeric (keep hyphens, underscores, umlauts)
    - `createAnchorTracker()`: Track used anchors, return unique anchors with numeric suffixes
    - _Requirements: 3.1, 3.2, 3.3, 3.4_

  - [ ]* 7.3 Write unit tests for link resolver and heading anchor
    - Create `frontend/src/plugins/link-resolver.test.ts` and `frontend/src/plugins/heading-anchor.test.ts`
    - Test case-insensitive search, .md fallback, path resolution, ambiguous matches
    - Test anchor normalization, duplicate suffixes, special characters, umlauts
    - _Requirements: 10.1–10.6, 3.1–3.4_

- [x] 8. ViewMode Integration und Rendering
  - [x] 8.1 Integrate plugins into ViewMode pipeline
    - Modify `frontend/src/components/ViewMode.tsx` to add `remarkWikilink`, `remarkEmbed`, `remarkCallout`, `remarkTag` to the unified pipeline
    - Implement `createSafePipeline` for graceful degradation (skip failing plugins)
    - Maintain plugin order: Wikilink → Embed → Callout → Tag
    - _Requirements: 11.5, 11.6_

  - [x] 8.2 Implement wikilink rendering in ViewMode
    - Add `case 'wikilink'` to `renderPhrasingNode` switch
    - Render resolved links with `view-mode-link--internal` class, broken links with `view-mode-link--broken`
    - Wire `onInternalLinkClick` callback with resolved file path
    - Add heading anchor IDs to rendered headings (H1–H6) using `createAnchorTracker()`
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 3.1_

  - [x] 8.3 Implement embed rendering in ViewMode
    - Add `case 'embed'` to `renderBlockNode` switch
    - Render image embeds as `<img>` with vault API URL, show placeholder if not found
    - Render note embeds as nested markdown in visually distinct container
    - Implement heading-section extraction for `![[note#heading]]`
    - Add recursion depth counter (max 3 levels) with "Maximale Einbettungstiefe erreicht" message
    - Show loading indicator while fetching note content
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5, 5.6, 5.7_

  - [x] 8.4 Implement callout rendering in ViewMode
    - Add `case 'callout'` to `renderBlockNode` switch
    - Render with `CALLOUT_TYPE_MAP` (icon + color per type), fallback to `note` for unknown types
    - Use `<details>/<summary>` for foldable callouts, `open` attribute for `defaultOpen: true`
    - Render callout body as markdown (nested formatting, lists, code blocks)
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 7.6_

  - [x] 8.5 Implement tag rendering in ViewMode
    - Add `case 'tag'` to `renderPhrasingNode` switch
    - Render as inline element with `view-mode-tag` class and Lucide `Hash` icon
    - Wire `onTagClick` callback with full tag string
    - _Requirements: 9.1, 9.2, 9.3_

- [x] 9. CSS Design Tokens
  - [x] 9.1 Add Obsidian element CSS Design Tokens
    - Add callout color tokens to `frontend/src/index.css` (per callout type: note, info, tip, warning, danger, bug, example, quote, success, question, failure, abstract)
    - Add tag tokens (background, text, border for light and dark mode)
    - Add embed container tokens (border, background)
    - Add broken-link tokens (color, text-decoration)
    - Add Dark Mode overrides for all new tokens in `:root[data-theme="dark"]` and `@media (prefers-color-scheme: dark)` blocks
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 9.2, 9.4_

  - [x] 9.2 Add Obsidian element CSS classes to App.css
    - Add `.view-mode-callout`, `.view-mode-callout-header`, `.view-mode-callout-body` styles
    - Add `.view-mode-callout--{type}` modifier classes for each callout type
    - Add `.view-mode-tag` styles (inline, rounded, background, hover state)
    - Add `.view-mode-link--internal` and `.view-mode-link--broken` styles
    - Add `.view-mode-embed`, `.view-mode-embed--image`, `.view-mode-embed--note` container styles
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

- [x] 10. Checkpoint - Integration vollständig
  - Ensure all tests pass, ask the user if questions arise.

- [x] 11. Barrel Export und Finalisierung
  - [x] 11.1 Finalize barrel export and update ViewMode imports
    - Update `frontend/src/plugins/index.ts` to export all plugins, types, utilities
    - Ensure ViewMode imports from `../plugins` barrel
    - Verify no circular dependencies
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

- [ ] 12. Block References
  - [ ] 12.1 Implement block marker parser (MDAST transformer)
    - Create `frontend/src/plugins/block-ref/marker-parser.ts`
    - Visit paragraph, listItem, heading nodes; detect trailing ` ^block-id` pattern
    - Strip marker text from visible content, store as `blockId` property on node
    - Skip `^` inside code blocks/inline code
    - _Requirements: 17.1, 17.2, 17.3, 17.4, 17.5, 17.6_

  - [ ] 12.2 Implement block marker serializer (toMarkdown)
    - Create `frontend/src/plugins/block-ref/marker-serializer.ts`
    - Restore ` ^block-id` at end of serialized paragraph/listItem/heading
    - _Requirements: 17.7_

  - [ ] 12.3 Implement block marker remark plugin wrapper
    - Create `frontend/src/plugins/block-ref/plugin.ts`
    - Register MDAST transformer and toMarkdown extension
    - Export `remarkBlockRef` as named export
    - _Requirements: 17.1–17.7_

  - [ ] 12.4 Extend wikilink syntax for block references
    - Modify `frontend/src/plugins/wikilink/syntax.ts` to tokenize `#^block-id` fragments
    - Modify `frontend/src/plugins/wikilink/mdast-util.ts` to produce `blockRef` field (mutually exclusive with `heading`)
    - Modify serializer to output `[[target#^block-id]]` format
    - _Requirements: 18.1, 18.2, 18.3, 18.4, 18.5_

  - [ ] 12.5 Extend embed syntax for block references
    - Modify `frontend/src/plugins/embed/syntax.ts` to tokenize `#^block-id` fragments
    - Modify `frontend/src/plugins/embed/mdast-util.ts` to produce `blockRef` field (mutually exclusive with `heading`)
    - Modify serializer to output `![[target#^block-id]]` format
    - _Requirements: 19.1, 19.2, 19.3, 19.4_

  - [ ] 12.6 Implement block reference rendering in ViewMode
    - Extend wikilink rendering: navigate to target file + scroll to `#^block-id` element
    - Extend embed rendering: fetch target file, locate block by `blockId`, render only that block
    - Add `id="^{block-id}"` attributes to rendered blocks with `blockId` property
    - Show broken-link styling when block not found
    - _Requirements: 20.1, 20.2, 20.3, 20.4, 20.5_

  - [ ] 12.7 Extend extractWikilinks for block references
    - Modify `frontend/src/plugins/wikilink/extract.ts` to include `blockRef` in `WikilinkInfo`
    - Extend backend `wikilink-parser.ts` to extract `blockRef` from `[[target#^block-id]]` syntax
    - _Requirements: 21.1, 21.2, 21.3_

  - [ ]* 12.8 Write unit tests for block references
    - Test marker parsing (paragraph, list, heading, code-block immunity)
    - Test wikilink `#^block-id` parsing and serialization
    - Test embed `#^block-id` parsing and serialization
    - Test rendering with found/not-found blocks
    - _Requirements: 17.1–17.7, 18.1–18.5, 19.1–19.4, 20.1–20.5_

- [ ] 13. Property-Based Tests
  - [ ]* 13.1 Write property test for wikilink round-trip
    - **Property 1: Round-Trip-Invarianten (Wikilink)**
    - **Validates: Requirements 1.7, 13.5**
    - Generate arbitrary valid wikilink strings with fast-check, verify `parse(serialize(parse(input))) ≡ parse(input)`

  - [ ]* 13.2 Write property test for embed round-trip
    - **Property 1: Round-Trip-Invarianten (Embed)**
    - **Validates: Requirements 4.6, 14.3**
    - Generate arbitrary valid embed strings with fast-check, verify round-trip consistency

  - [ ]* 13.3 Write property test for callout round-trip
    - **Property 1: Round-Trip-Invarianten (Callout)**
    - **Validates: Requirements 6.7, 15.5**
    - Generate arbitrary valid callout blockquotes with fast-check, verify round-trip consistency

  - [ ]* 13.4 Write property test for tag round-trip
    - **Property 1: Round-Trip-Invarianten (Tag)**
    - **Validates: Requirements 8.7, 16.3**
    - Generate arbitrary valid tag strings with fast-check, verify round-trip consistency

  - [ ]* 13.5 Write property test for parser invariants
    - **Property 2: Parser-Invarianten**
    - **Validates: Requirements 1.6, 4.5, 8.3, 8.4, 3.4, 10.4**
    - Test code-block immunity: no Obsidian syntax recognized inside fenced code blocks
    - Test heading-anchor determinism: same text always produces same anchor
    - Test link-resolver consistency: same target + same tree always produces same result

  - [ ]* 13.6 Write property test for rendering invariants
    - **Property 3: Rendering-Invarianten**
    - **Validates: Requirements 2.2, 5.7, 7.6, 11.6**
    - Test broken-link consistency: link is broken iff `resolveWikilinkTarget()` returns `null`
    - Test callout fallback: unknown types always use `note` config
    - Test embed depth limit: nested embeds abort after exactly 3 levels

- [x] 14. Final Checkpoint
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for faster MVP
- Each task references specific requirements for traceability
- Checkpoints ensure incremental validation
- Property tests validate universal correctness properties from the design document
- Unit tests validate specific examples and edge cases
- No new npm dependencies needed — micromark, mdast-util-from-markdown, unist-util-visit are transitive deps of remark-parse/unified
- All code in `frontend/src/plugins/` directory
- Tests use Vitest + fast-check (already available as devDependency)

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1"] },
    { "id": 1, "tasks": ["2.1", "3.1", "5.1", "7.2"] },
    { "id": 2, "tasks": ["2.2", "3.2", "4.1", "5.2", "7.1"] },
    { "id": 3, "tasks": ["2.3", "2.4", "3.3", "4.2", "5.3"] },
    { "id": 4, "tasks": ["2.5", "3.4", "4.3", "5.4", "7.3"] },
    { "id": 5, "tasks": ["4.4", "11.1"] },
    { "id": 6, "tasks": ["8.1", "9.1"] },
    { "id": 7, "tasks": ["8.2", "8.3", "8.4", "8.5", "9.2"] },
    { "id": 8, "tasks": ["12.1", "12.2", "12.3"] },
    { "id": 9, "tasks": ["12.4", "12.5", "12.6", "12.7"] },
    { "id": 10, "tasks": ["12.8"] },
    { "id": 11, "tasks": ["13.1", "13.2", "13.3", "13.4", "13.5", "13.6"] }
  ]
}
```
