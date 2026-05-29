import { describe, it, expect } from 'vitest'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { toMarkdown } from 'mdast-util-to-markdown'
import { embedSyntax } from './syntax'
import { embedFromMarkdown, embedToMarkdown } from './mdast-util'
import type { EmbedNode } from '../types'

/**
 * Minimal verification tests for embed mdast-util.
 * Full test suite is in task 3.4.
 */
describe('embed mdast-util', () => {
  function parseEmbed(input: string): EmbedNode | undefined {
    const tree = fromMarkdown(input, {
      extensions: [embedSyntax()],
      mdastExtensions: [embedFromMarkdown()],
    })
    const paragraph = tree.children[0]
    if (paragraph && 'children' in paragraph) {
      return (paragraph as { children: Array<{ type: string }> }).children.find(
        (n) => n.type === 'embed'
      ) as EmbedNode | undefined
    }
    return undefined
  }

  describe('embedFromMarkdown', () => {
    it('parses image embed with correct embedType', () => {
      const node = parseEmbed('![[photo.png]]')
      expect(node).toBeDefined()
      expect(node!.type).toBe('embed')
      expect(node!.target).toBe('photo.png')
      expect(node!.heading).toBeNull()
      expect(node!.embedType).toBe('image')
    })

    it('parses note embed without extension', () => {
      const node = parseEmbed('![[my-note]]')
      expect(node).toBeDefined()
      expect(node!.target).toBe('my-note')
      expect(node!.heading).toBeNull()
      expect(node!.embedType).toBe('note')
    })

    it('parses note embed with heading', () => {
      const node = parseEmbed('![[document.md#Section]]')
      expect(node).toBeDefined()
      expect(node!.target).toBe('document.md')
      expect(node!.heading).toBe('Section')
      expect(node!.embedType).toBe('note')
    })

    it('parses image embed with various extensions', () => {
      for (const ext of ['.jpg', '.jpeg', '.gif', '.svg', '.webp', '.avif', '.bmp']) {
        const node = parseEmbed(`![[file${ext}]]`)
        expect(node).toBeDefined()
        expect(node!.embedType).toBe('image')
      }
    })
  })

  describe('embedToMarkdown', () => {
    it('serializes embed without heading', () => {
      const tree = fromMarkdown('![[image.png]]', {
        extensions: [embedSyntax()],
        mdastExtensions: [embedFromMarkdown()],
      })
      const md = toMarkdown(tree, { extensions: [embedToMarkdown()] })
      expect(md.trim()).toBe('![[image.png]]')
    })

    it('serializes embed with heading', () => {
      const tree = fromMarkdown('![[note.md#Intro]]', {
        extensions: [embedSyntax()],
        mdastExtensions: [embedFromMarkdown()],
      })
      const md = toMarkdown(tree, { extensions: [embedToMarkdown()] })
      expect(md.trim()).toBe('![[note.md#Intro]]')
    })
  })

  describe('round-trip', () => {
    it('preserves embed node through parse-serialize-parse', () => {
      const input = '![[photo.jpg]]'
      const tree1 = fromMarkdown(input, {
        extensions: [embedSyntax()],
        mdastExtensions: [embedFromMarkdown()],
      })
      const serialized = toMarkdown(tree1, { extensions: [embedToMarkdown()] })
      const tree2 = fromMarkdown(serialized, {
        extensions: [embedSyntax()],
        mdastExtensions: [embedFromMarkdown()],
      })

      const node1 = ((tree1.children[0] as { children: Array<{ type: string }> }).children).find(
        (n) => n.type === 'embed'
      ) as EmbedNode
      const node2 = ((tree2.children[0] as { children: Array<{ type: string }> }).children).find(
        (n) => n.type === 'embed'
      ) as EmbedNode

      expect(node2.target).toBe(node1.target)
      expect(node2.heading).toBe(node1.heading)
      expect(node2.embedType).toBe(node1.embedType)
    })
  })
})
