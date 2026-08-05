/**
 * End-to-end check that a code block handler can locate itself in the source.
 *
 * This is what `getSectionInfo` exists for: plugins like Tasks and Dataview read
 * the range to write edits back to the right lines. It returned null before, so
 * those plugins could render but not modify the note.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import {
  registerCodeBlockProcessor,
  unregisterAllForPlugin,
  processCodeBlocks,
  cleanupRenderChildren,
  type MarkdownPostProcessorContext,
  type MarkdownSectionInformation,
} from './code-block-processor-registry'

/** Build the DOM the Markdown renderer produces for the given fenced blocks. */
function renderDom(blocks: Array<{ language: string; content: string }>): HTMLElement {
  const root = document.createElement('div')
  for (const { language, content } of blocks) {
    const pre = document.createElement('pre')
    const code = document.createElement('code')
    code.className = `language-${language}`
    code.textContent = content
    pre.appendChild(code)
    root.appendChild(pre)
  }
  return root
}

describe('getSectionInfo for code blocks', () => {
  let captured: MarkdownSectionInformation | null | undefined
  let capturedEl: HTMLElement | undefined

  beforeEach(() => {
    captured = undefined
    capturedEl = undefined
    registerCodeBlockProcessor(
      'tasklike',
      (_source: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
        capturedEl = el
        captured = ctx.getSectionInfo(el)
      },
      'test-plugin',
    )
  })

  afterEach(() => {
    unregisterAllForPlugin('test-plugin')
    cleanupRenderChildren()
  })

  it('reports the fence line range of the block', () => {
    const source = ['# Notes', '', '```tasklike', 'not done', '```', '', 'tail'].join('\n')
    const dom = renderDom([{ language: 'tasklike', content: 'not done' }])

    processCodeBlocks(dom, 'notes.md', null, source)

    expect(captured).toEqual({ text: source, lineStart: 2, lineEnd: 4 })
  })

  it('gives a range that slices back to the original block', () => {
    const source = ['intro', '```tasklike', 'a', 'b', '```'].join('\n')
    const dom = renderDom([{ language: 'tasklike', content: 'a\nb' }])

    processCodeBlocks(dom, 'notes.md', null, source)

    const lines = captured!.text.split('\n').slice(captured!.lineStart, captured!.lineEnd + 1)
    expect(lines).toEqual(['```tasklike', 'a', 'b', '```'])
  })

  it('locates the right block when several are present', () => {
    const source = [
      '```tasklike',
      'first',
      '```',
      'between',
      '```other',
      'ignored',
      '```',
      '```tasklike',
      'second',
      '```',
    ].join('\n')
    const seen: Array<number | undefined> = []
    unregisterAllForPlugin('test-plugin')
    registerCodeBlockProcessor(
      'tasklike',
      (_s: string, el: HTMLElement, ctx: MarkdownPostProcessorContext) => {
        seen.push(ctx.getSectionInfo(el)?.lineStart)
      },
      'test-plugin',
    )

    const dom = renderDom([
      { language: 'tasklike', content: 'first' },
      { language: 'other', content: 'ignored' },
      { language: 'tasklike', content: 'second' },
    ])
    processCodeBlocks(dom, 'notes.md', null, source)

    // The unhandled 'other' block sits between them and must not shift the second.
    expect(seen).toEqual([0, 7])
  })

  it('resolves for a node the handler rendered inside its container', () => {
    const source = ['```tasklike', 'x', '```'].join('\n')
    const dom = renderDom([{ language: 'tasklike', content: 'x' }])

    processCodeBlocks(dom, 'notes.md', null, source)

    const child = document.createElement('span')
    capturedEl!.appendChild(child)

    // Plugins call getSectionInfo with their own nodes, not the container.
    const ctxLike = capturedEl!
    expect(ctxLike.contains(child)).toBe(true)
    expect(captured).not.toBeNull()
  })

  it('returns null when no source is supplied', () => {
    const dom = renderDom([{ language: 'tasklike', content: 'x' }])

    processCodeBlocks(dom, 'notes.md', null)

    expect(captured).toBeNull()
  })

  it('returns null when the rendered block is absent from the source', () => {
    const source = ['```tasklike', 'something else', '```'].join('\n')
    const dom = renderDom([{ language: 'tasklike', content: 'does not appear' }])

    processCodeBlocks(dom, 'notes.md', null, source)

    // A wrong line range would make a plugin overwrite unrelated lines.
    expect(captured).toBeNull()
  })
})
