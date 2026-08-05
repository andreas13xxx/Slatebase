/**
 * CodeBlockProcessorRegistry — Central registry for Obsidian-compatible code block processors.
 *
 * Plugins use `plugin.registerMarkdownCodeBlockProcessor(language, handler)` to register
 * custom renderers for fenced code blocks. When Markdown containing ` ```language ` is rendered,
 * the handler receives the source text and a container element to render into.
 *
 * Architecture:
 * - Module-level singleton (same pattern as realtimeVaultBridge, file-view-registry)
 * - ViewMode calls `processCodeBlocks(containerEl, sourcePath)` after rendering HTML
 * - Each handler gets: (source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext)
 * - Lifecycle: MarkdownRenderChild attached to container for cleanup when DOM is removed
 *
 * @module code-block-processor-registry
 */

import {
  scanFencedCodeBlocks,
  matchRenderedBlocks,
  toSectionInfo,
  type MarkdownSectionInformation,
} from './markdown-sections'

export type { MarkdownSectionInformation }

// ─── Section Info ────────────────────────────────────────────────────────────

/**
 * Section info per rendered container, populated by {@link processCodeBlocks}.
 *
 * A WeakMap so entries disappear with the DOM nodes; rendered output is replaced
 * on every edit and must not be retained.
 */
const sectionInfoByElement = new WeakMap<HTMLElement, MarkdownSectionInformation>()

/**
 * Resolve section info for an element by walking up to the nearest container
 * that has a known source range. Plugins usually pass a node they created
 * *inside* the container they were handed, so an exact match is not enough.
 */
function resolveSectionInfo(el: HTMLElement | null): MarkdownSectionInformation | null {
  for (let node = el; node; node = node.parentElement) {
    const info = sectionInfoByElement.get(node)
    if (info) return info
  }
  return null
}

// ─── Types ───────────────────────────────────────────────────────────────────

/**
 * MarkdownPostProcessorContext — Context passed to code block handlers.
 * Provides source file info and lifecycle management.
 */
export interface MarkdownPostProcessorContext {
  /** Unique document ID (tab/view identifier). */
  docId: string
  /** Path to the source markdown file (for resolving relative links). */
  sourcePath: string
  /** Frontmatter of the source file (if available). */
  frontmatter: Record<string, unknown> | null
  /** Add a child component for lifecycle management. */
  addChild(child: MarkdownRenderChild): void
  /**
   * Which lines of the source document produced `el`.
   *
   * Resolved for fenced code blocks, which is what plugins like Tasks and
   * Dataview need in order to write edits back. Returns null when the element
   * cannot be traced to a source range — including when no source was supplied,
   * and for elements outside a code block, whose positions Slatebase's render
   * pipeline does not carry through.
   */
  getSectionInfo(el: HTMLElement): MarkdownSectionInformation | null
}

/**
 * MarkdownRenderChild — Lifecycle component for rendered code block content.
 * When the container element is removed from the DOM, unload() is called.
 */
export class MarkdownRenderChild {
  containerEl: HTMLElement
  private _onunload: (() => void) | null = null

  constructor(containerEl: HTMLElement) {
    this.containerEl = containerEl
  }

  load(): void {}

  unload(): void {
    if (this._onunload) {
      this._onunload()
    }
  }

  onload(): void {}

  onunload(): void {}

  /** Register a callback for cleanup. */
  register(cb: () => void): void {
    this._onunload = cb
  }

  /** Register an event ref for auto-cleanup. */
  registerEvent(_ref: unknown): void {}

  /** Register a DOM event for auto-cleanup. */
  registerDomEvent(_el: EventTarget, _type: string, _cb: EventListener): void {}

  /** Register an interval for auto-cleanup. */
  registerInterval(id: number): number {
    return id
  }
}

/**
 * CodeBlockHandler — Function signature for a code block processor.
 *
 * @param source - The text content of the code block (without the ``` delimiters)
 * @param el - A container div element to render into (replaces the <pre><code>)
 * @param ctx - Context with source file info and lifecycle management
 */
export type CodeBlockHandler = (
  source: string,
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext,
) => Promise<void> | void

/**
 * MarkdownPostProcessor — General post-processor that runs on rendered HTML sections.
 */
export type MarkdownPostProcessor = (
  el: HTMLElement,
  ctx: MarkdownPostProcessorContext,
) => Promise<void> | void

/** A registered code block processor entry. */
interface CodeBlockRegistration {
  language: string
  handler: CodeBlockHandler
  pluginId: string
  sortOrder: number
}

/** A registered general post-processor entry. */
interface PostProcessorRegistration {
  processor: MarkdownPostProcessor
  pluginId: string
  sortOrder: number
}

// ─── Module-Level State ──────────────────────────────────────────────────────

/** Registered code block processors (language → handler). */
const codeBlockProcessors: Map<string, CodeBlockRegistration> = new Map()

/** Registered general post-processors (sorted by sortOrder). */
const postProcessors: PostProcessorRegistration[] = []

/** Active render children (for lifecycle cleanup). */
const activeRenderChildren: Set<MarkdownRenderChild> = new Set()

// ─── Registration API ────────────────────────────────────────────────────────

/**
 * Register a code block processor for a specific language.
 * When markdown containing ` ```language ` is rendered, the handler is called.
 *
 * @param language - The code block language identifier (e.g. 'dataview', 'tasks', 'mermaid')
 * @param handler - The rendering function
 * @param pluginId - The owning plugin ID (for cleanup on deactivation)
 * @param sortOrder - Processing order (lower = earlier, default 0)
 */
export function registerCodeBlockProcessor(
  language: string,
  handler: CodeBlockHandler,
  pluginId: string,
  sortOrder: number = 0,
): void {
  codeBlockProcessors.set(language.toLowerCase(), { language, handler, pluginId, sortOrder })
}

/**
 * Register a general Markdown post-processor.
 * Runs on every rendered section after initial HTML generation.
 *
 * @param processor - The post-processing function
 * @param pluginId - The owning plugin ID
 * @param sortOrder - Processing order (lower = earlier, default 0)
 */
export function registerPostProcessor(
  processor: MarkdownPostProcessor,
  pluginId: string,
  sortOrder: number = 0,
): void {
  postProcessors.push({ processor, pluginId, sortOrder })
  postProcessors.sort((a, b) => a.sortOrder - b.sortOrder)
}

/**
 * Remove all code block processors and post-processors for a plugin.
 * Called during plugin deactivation.
 */
export function unregisterAllForPlugin(pluginId: string): void {
  for (const [lang, reg] of codeBlockProcessors) {
    if (reg.pluginId === pluginId) {
      codeBlockProcessors.delete(lang)
    }
  }
  // Remove post-processors for this plugin
  for (let i = postProcessors.length - 1; i >= 0; i--) {
    if (postProcessors[i]!.pluginId === pluginId) {
      postProcessors.splice(i, 1)
    }
  }
}

/**
 * Check if a code block processor is registered for a given language.
 */
export function hasCodeBlockProcessor(language: string): boolean {
  return codeBlockProcessors.has(language.toLowerCase())
}

/**
 * Get the code block handler for a given language (if registered).
 * Used by Live Preview to render plugin code blocks as widgets.
 */
export function getCodeBlockHandler(language: string): CodeBlockHandler | null {
  const registration = codeBlockProcessors.get(language.toLowerCase())
  return registration?.handler ?? null
}

/**
 * Get all registered code block languages.
 */
export function getRegisteredLanguages(): string[] {
  return [...codeBlockProcessors.keys()]
}

// ─── Processing API (called by ViewMode after rendering) ─────────────────────

/**
 * Process all code blocks in a rendered container element.
 *
 * Scans for `<pre><code class="language-xxx">` elements, checks if a handler
 * is registered for that language, and if so:
 * 1. Extracts the source text from the <code> element
 * 2. Creates a replacement <div> container
 * 3. Calls the registered handler with (source, container, context)
 * 4. Replaces the <pre> element with the rendered container
 *
 * @param containerEl - The root element containing rendered markdown HTML
 * @param sourcePath - The source file path (for context)
 * @param frontmatter - The file's frontmatter (if available)
 * @param markdownSource - The full Markdown source. Supplying it enables
 *        `ctx.getSectionInfo()`; without it that returns null as before.
 * @returns Array of MarkdownRenderChild instances (for lifecycle management)
 */
export function processCodeBlocks(
  containerEl: HTMLElement,
  sourcePath: string,
  frontmatter?: Record<string, unknown> | null,
  markdownSource?: string,
): MarkdownRenderChild[] {
  const children: MarkdownRenderChild[] = []

  // Find all <pre><code class="language-xxx"> elements
  const codeElements = [...containerEl.querySelectorAll('pre > code[class*="language-"]')]

  // Locate each rendered block in the source. Every language-tagged block takes
  // part in the matching, not just the ones with a handler, so that an unhandled
  // block in between cannot shift the alignment of the ones that follow.
  const languageOf = (codeEl: Element): string | null => {
    const langClass = codeEl.className.split(/\s+/).find((c) => c.startsWith('language-'))
    return langClass ? langClass.slice('language-'.length).toLowerCase() : null
  }

  const sourceBlocks = markdownSource ? scanFencedCodeBlocks(markdownSource) : []
  const matches = markdownSource
    ? matchRenderedBlocks(
        codeElements.map((el) => ({
          language: languageOf(el) ?? '',
          content: el.textContent ?? '',
        })),
        sourceBlocks,
      )
    : []

  for (const [index, codeEl] of codeElements.entries()) {
    const preEl = codeEl.parentElement
    if (!preEl) continue

    // Extract language from class (e.g. "language-dataview" → "dataview")
    const language = languageOf(codeEl)
    if (!language) continue

    // Check if we have a handler for this language
    const registration = codeBlockProcessors.get(language)
    if (!registration) continue

    // Extract source text
    const source = codeEl.textContent ?? ''

    // Create replacement container
    const container = document.createElement('div')
    container.className = `block-language-${language}`
    container.dataset.language = language

    // Create MarkdownRenderChild for lifecycle
    const renderChild = new MarkdownRenderChild(container)

    // Record where this block came from, so getSectionInfo can resolve it for
    // the container and for anything the handler renders inside it.
    const match = matches[index]
    if (match && markdownSource !== undefined) {
      sectionInfoByElement.set(container, toSectionInfo(markdownSource, match))
    }

    // Build context
    const ctx: MarkdownPostProcessorContext = {
      docId: `doc-${Date.now()}`,
      sourcePath,
      frontmatter: frontmatter ?? null,
      addChild(child: MarkdownRenderChild): void {
        activeRenderChildren.add(child)
        children.push(child)
      },
      getSectionInfo(el: HTMLElement): MarkdownSectionInformation | null {
        // Fall back to this block's own container: plugins sometimes pass an
        // element they have already detached from the DOM.
        return resolveSectionInfo(el) ?? sectionInfoByElement.get(container) ?? null
      },
    }

    // Replace the <pre> with our container
    preEl.replaceWith(container)

    // Call the handler (may be async — we don't await to avoid blocking render)
    try {
      const result = registration.handler(source, container, ctx)
      if (result instanceof Promise) {
        result.catch((err) => {
          console.error(`[CodeBlockProcessor] Handler error for language "${language}":`, err)
          container.textContent = `Error rendering ${language} block: ${err instanceof Error ? err.message : String(err)}`
        })
      }
    } catch (err) {
      console.error(`[CodeBlockProcessor] Handler error for language "${language}":`, err)
      container.textContent = `Error rendering ${language} block: ${err instanceof Error ? err.message : String(err)}`
    }

    activeRenderChildren.add(renderChild)
    children.push(renderChild)
  }

  return children
}

/**
 * Run registered post-processors on a rendered container.
 *
 * @param containerEl - The root element containing rendered markdown HTML
 * @param sourcePath - The source file path
 * @param frontmatter - The file's frontmatter
 */
export function runPostProcessors(
  containerEl: HTMLElement,
  sourcePath: string,
  frontmatter?: Record<string, unknown> | null,
): void {
  if (postProcessors.length === 0) return

  const ctx: MarkdownPostProcessorContext = {
    docId: `doc-${Date.now()}`,
    sourcePath,
    frontmatter: frontmatter ?? null,
    addChild(child: MarkdownRenderChild): void {
      activeRenderChildren.add(child)
    },
    getSectionInfo(el: HTMLElement): MarkdownSectionInformation | null {
      // Only elements inside a code-block container can be traced. Positions for
      // ordinary Markdown are not carried through the render pipeline, so a
      // post-processor inspecting a paragraph still gets null.
      return resolveSectionInfo(el)
    },
  }

  for (const { processor } of postProcessors) {
    try {
      const result = processor(containerEl, ctx)
      if (result instanceof Promise) {
        result.catch((err) => {
          console.error('[PostProcessor] Error:', err)
        })
      }
    } catch (err) {
      console.error('[PostProcessor] Error:', err)
    }
  }
}

/**
 * Cleanup all active render children.
 * Called when the view is unmounted or file changes.
 */
export function cleanupRenderChildren(): void {
  for (const child of activeRenderChildren) {
    try {
      child.unload()
    } catch {
      // Ignore cleanup errors
    }
  }
  activeRenderChildren.clear()
}

/**
 * Reset all registrations (for testing or full cleanup).
 */
export function resetCodeBlockProcessors(): void {
  codeBlockProcessors.clear()
  postProcessors.length = 0
  cleanupRenderChildren()
}
