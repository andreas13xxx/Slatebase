# Implementation Plan: Editor-Erweiterungen — Mathe & Medien

## Overview

Zwei unabhängige Task-Gruppen: KaTeX-Mathe (Tasks 1–6) und Audio/Video-Embeds (Tasks 7–9). Die Gruppen hängen nicht voneinander ab und können in beliebiger Reihenfolge oder parallel umgesetzt werden. Innerhalb jeder Gruppe sind die Tasks sequenziell sinnvoll.

## Tasks

- [x] 1. KaTeX-Loader und Dependency-Setup
  - Install `katex` as pinned dependency (`npm install katex@<latest-stable>` with exact version)
  - Verify license (MIT), download count, last update, `npm audit` — per Dependency-Regeln
  - Create `frontend/src/components/katex-loader.ts` with `loadKaTeX()` (module-level cached promise, identical pattern to `loadMermaid()` in `MermaidRenderer.tsx`)
  - Implement CSS injection: on first successful KaTeX load, inject a `<link rel="stylesheet" href="...katex.min.css">` into `<head>` (or use Vite's CSS import side-effect if it correctly code-splits)
  - Export `MATH_RENDER_TIMEOUT_MS = 2000` and a `renderMathToString(katex, source, displayMode)` helper that wraps `katex.renderToString` with `throwOnError: true, strict: false, trust: false`
  - _Requirements: 1.4, 1.7, 6.1_

- [x] 2. Math syntax plugin (micromark + mdast-util + remark)
  - Create `frontend/src/plugins/math/syntax.ts` with a micromark extension hooking character code 36 (`$`):
    - Inline math tokenizer: `$<non-ws>...<non-ws>$<non-digit>` — tokens: `inlineMath`, `inlineMathMarker`, `inlineMathValue`
    - Block math tokenizer: `$$` at line start opens, next `$$` at line start closes — tokens: `mathBlock`, `mathBlockFence`, `mathBlockValue`
    - Single-line block math: `$$..content..$$` on one line (displayMode: true)
    - Boundary rules per Requirement 1.2: no whitespace after opening `$`, no whitespace before closing `$`, no digit after closing `$`, no newline within inline math, escaped `\$` not treated as delimiter
  - Create `frontend/src/plugins/math/mdast-util.ts`:
    - Define `MathInlineNode` (type: 'mathInline', value: string) and `MathBlockNode` (type: 'mathBlock', value: string) interfaces
    - Implement `mathFromMarkdown()` — enter/exit handlers for both token types
    - Implement `mathToMarkdown()` — serialize back to `$value$` / `$$\nvalue\n$$`
  - Create `frontend/src/plugins/math/plugin.ts`:
    - `remarkMath()` attaches the syntax extension and mdast-util handlers
  - Register both node types in `frontend/src/plugins/types.ts` mdast module augmentation
  - Export via barrel in `frontend/src/plugins/math/index.ts`
  - _Requirements: 1.1, 1.2, 2.1, 2.2, 2.6_

- [x] 3. Math rendering in Reading View (ViewMode)
  - Create `frontend/src/components/MathRenderer.tsx`:
    - Props: `source: string`, `displayMode: boolean`
    - State machine: `loading | rendered | error | timeout | load-failed` (same pattern as `MermaidRenderer`)
    - `useEffect` with `cancelled` flag: call `loadKaTeX()`, on success render via `renderMathToString()`, on KaTeX parse error → `error` state with message, on timeout → `timeout` state, on load failure → `load-failed` state
    - Rendered state: `<span|div className="math math-inline|math-block" dangerouslySetInnerHTML={{ __html: html }} />`
    - Error state: `<span|div className="math math-inline|math-block math-error" title={message}>{source}</span|div>`
    - Load-failed state: `<span|div className="math math-inline|math-block math-load-failed">{source}</span|div>`
  - Register `remarkMath` in ViewMode's remark pipeline (alongside `remarkWikilink`, `remarkEmbed`, etc.)
  - Add MDAST visitor cases in the rendering function:
    - `node.type === 'mathInline'` → `<MathRenderer source={node.value} displayMode={false} />`
    - `node.type === 'mathBlock'` → `<MathRenderer source={node.value} displayMode={true} />`
  - Add CSS for `.math-block` (display: block, text-align: center, margin-block), `.math-inline` (display: inline, vertical-align: baseline), `.math-error` (color: var(--text-error), border-bottom dashed), `.math-load-failed` (opacity reduced)
  - _Requirements: 1.1, 1.5, 1.6, 1.7, 2.1, 2.5, 6.2, 6.3, 6.4_

- [x] 4. Math rendering in Live Preview
  - **Inline math** — extend `frontend/src/editor/live-preview/inline-decorations.ts`:
    - Add regex detection for `$...$` with boundary rules (same rules as the micromark tokenizer) in the inline-decoration scan
    - Skip matches inside `FencedCode`/`InlineCode`/`CodeBlock` nodes (tree-iterate check, same guard as existing link/embed decorations)
    - Create `InlineMathWidget extends WidgetType`:
      - `toDOM()`: create `<span class="cm-lp-math-inline">` with `textContent = source` initially; call `loadKaTeX().then(...)` to replace with rendered HTML; on error add `.cm-lp-math-error` class
      - `eq(other)`: compare source strings
    - Apply `Decoration.replace({ widget })` with cursor-awareness (skip decoration when cursor is within the `$...$` range, same `HideableRange` mechanism as bold/italic)
  - **Block math** — extend `frontend/src/editor/live-preview/widget-decorations.ts`:
    - Add detection in `buildWidgetDecorations()` for `$$...$$` blocks (multiline and single-line): regex scan on document text, before the code-block-processor check
    - Skip matches inside `FencedCode`/`CodeBlock` syntax tree nodes
    - Create `BlockMathWidget extends WidgetType`:
      - `toDOM()`: create `<div class="cm-lp-math-block">` with loading text; async-render via `loadKaTeX()`; on error show source with error class
      - Click handler: move cursor to the start of the `$$` block
      - `eq(other)`: compare source strings
    - Apply `Decoration.replace({ widget })` with cursor-awareness (hide widget when cursor is within the `$$...$$` range)
  - Add CSS classes `.cm-lp-math-inline`, `.cm-lp-math-block`, `.cm-lp-math-error` in `live-preview.css`
  - _Requirements: 1.3, 2.3, 2.4, 2.6, 6.3, 6.4_

- [x] 5. Plugin compat — replace renderMath/finishRenderMath/loadMathJax stubs
  - In `frontend/src/plugins/compat/obsidian-api-extensions.ts`, replace `registerUnsupportedLoaders()`'s math section (lines 930–952) with real KaTeX-backed implementations:
    - `loadMathJax`: calls `loadKaTeX()`, returns the result (non-null = success, null = failed)
    - `renderMath(source, display)`: returns an element synchronously with raw text; asynchronously hydrates with rendered KaTeX HTML once loaded (Requirement 3.2 hydration pattern); on KaTeX parse error, adds `.math-error` class and keeps raw text
    - `finishRenderMath()`: awaits `loadKaTeX()` and resolves (signals "math rendering is available")
  - Remove the `warnNoOp` calls for these three functions (they're no longer unsupported)
  - Keep `loadPrism` and `loadPdfJs` stubs unchanged
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 6. Tests for KaTeX
  - Unit tests for `plugins/math/syntax.ts`:
    - Inline math: basic `$x$`, boundary rules (no space after open, no space before close, no digit after close), escaped `\$`, nested dollar signs `$a$b$c$` (shortest match), code-span immunity
    - Block math: multiline `$$\n...\n$$`, single-line `$$...$$`, code-fence immunity, empty block
  - Unit tests for `MathRenderer.tsx`:
    - Successful render (mock katex), error state (invalid LaTeX), timeout state, load-failed state
    - DisplayMode: `math-block` class present, inline: `math-inline` class present
  - Unit tests for `katex-loader.ts`:
    - Module-level caching (second call returns same promise), CSS injection occurs once
  - Integration test for plugin compat:
    - `renderMath('x^2', false)` returns element that initially shows 'x^2' text, then (after loadKaTeX resolves) contains rendered HTML
    - `loadMathJax()` resolves after katex loads
  - _Requirements: 1.2, 1.5, 1.6, 1.7, 2.1, 2.6, 3.1, 3.2_

- [x] 7. Media embed type extensions
  - Add `AUDIO_EXTENSIONS` and `VIDEO_EXTENSIONS` arrays to `frontend/src/plugins/types.ts`:
    - Audio: `.mp3`, `.wav`, `.ogg`, `.flac`, `.m4a`, `.aac`, `.wma`
    - Video: `.mp4`, `.webm`, `.ogv`, `.mov`, `.mkv`
  - Extend `EmbedNode.embedType` type from `'image' | 'pdf' | 'note'` to `'image' | 'pdf' | 'audio' | 'video' | 'note'`
  - Extend `detectEmbedType()` in `frontend/src/plugins/embed/syntax.ts`:
    - Add audio check after PDF, video check after audio (priority: image > pdf > audio > video > note)
  - Add `AUDIO_EXTENSIONS` and `VIDEO_EXTENSIONS` Sets to `frontend/src/editor/live-preview/widget-decorations.ts` (parallel to existing IMAGE_EXTENSIONS/PDF_EXTENSIONS Sets)
  - Extend `EmbedKind` type in `widget-decorations.ts` to include `'audio' | 'video'`
  - Extend the `kind` assignment in `buildWidgetDecorations()` to check audio/video sets
  - _Requirements: 4.1, 4.6, 5.1, 5.7_

- [x] 8. Audio/Video rendering in Reading View and Live Preview
  - **Reading View** — extend `renderEmbedNode()` in `ViewMode.tsx`:
    - Add `case 'audio'`: resolve path via `resolveWikilinkTarget()`, render `<audio controls preload="metadata">` with `<source src={buildRawSrc(...)}>`, missing → "Audio nicht gefunden: {target}" placeholder
    - Add `case 'video'`: resolve path, render `<video controls preload="metadata">` with `<source src={buildRawSrc(...)}>`, apply `parseEmbedImageStyle(node.display)` for width/height, missing → "Video nicht gefunden: {target}" placeholder
  - **Live Preview** — extend `EmbedWidget` in `widget-decorations.ts`:
    - Add `this.kind === 'audio'` branch in `toDOM()` → `buildAudioDOM()`: creates `<audio controls preload="metadata" class="cm-lp-embed-audio">` with `<source src={this.buildRawSrc()}>`, `aria-label` from filename
    - Add `this.kind === 'video'` branch in `toDOM()` → `buildVideoDOM()`: creates `<video controls preload="metadata" class="cm-lp-embed-video">` with `<source>`, calls `applyEmbedImageSize(video, this.display)` for width/height from display param, `aria-label` from filename
  - Add CSS: `.view-mode-audio-embed` (max-width: 100%), `.view-mode-video-embed` (max-width: 100%), `.cm-lp-embed-audio` (max-width: 100%), `.cm-lp-embed-video` (max-width: 100%, display: block)
  - _Requirements: 4.2, 4.3, 4.4, 4.5, 5.2, 5.3, 5.4, 5.5, 5.6_

- [x] 9. Tests for media embeds
  - Unit tests for `detectEmbedType()`:
    - Each audio extension → 'audio', each video extension → 'video'
    - Existing image/pdf/note behavior unchanged
    - Case-insensitive (`.MP4` → 'video')
    - Priority: `.pdf` still wins over theoretical overlap (none exists, but regression-safe)
  - Component tests for ViewMode audio/video rendering:
    - Audio embed renders `<audio controls>` with correct `src` URL
    - Video embed renders `<video controls>` with correct `src` URL and size style from display param
    - Missing file renders placeholder text
  - Component tests for Live Preview:
    - `![[test.mp3]]` creates an audio widget with `<audio controls>`
    - `![[test.mp4|640]]` creates a video widget with width style applied
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3, 5.4, 5.6_

