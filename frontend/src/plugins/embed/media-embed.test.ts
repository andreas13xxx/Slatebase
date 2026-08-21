import { describe, it, expect } from 'vitest'
import { fromMarkdown } from 'mdast-util-from-markdown'
import { detectEmbedType, embedSyntax } from './syntax'
import { embedFromMarkdown } from './mdast-util'
import type { EmbedNode } from '../types'
import { AUDIO_EXTENSIONS, VIDEO_EXTENSIONS } from '../types'

describe('detectEmbedType — audio/video extensions', () => {
  describe('audio extensions', () => {
    it.each(['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac', '.wma'])(
      'detects %s as audio',
      (ext) => {
        expect(detectEmbedType(`recording${ext}`)).toBe('audio')
      }
    )

    it('is case-insensitive', () => {
      expect(detectEmbedType('file.MP3')).toBe('audio')
      expect(detectEmbedType('file.Wav')).toBe('audio')
      expect(detectEmbedType('file.OGG')).toBe('audio')
    })
  })

  describe('video extensions', () => {
    it.each(['.mp4', '.webm', '.ogv', '.mov', '.mkv'])(
      'detects %s as video',
      (ext) => {
        expect(detectEmbedType(`clip${ext}`)).toBe('video')
      }
    )

    it('is case-insensitive', () => {
      expect(detectEmbedType('video.MP4')).toBe('video')
      expect(detectEmbedType('video.WebM')).toBe('video')
      expect(detectEmbedType('video.MKV')).toBe('video')
    })
  })

  describe('priority order preserved', () => {
    it('image still wins for image extensions', () => {
      expect(detectEmbedType('photo.png')).toBe('image')
      expect(detectEmbedType('image.jpg')).toBe('image')
      expect(detectEmbedType('pic.svg')).toBe('image')
    })

    it('pdf still wins for .pdf', () => {
      expect(detectEmbedType('document.pdf')).toBe('pdf')
    })

    it('note is the fallback for unknown extensions', () => {
      expect(detectEmbedType('note.md')).toBe('note')
      expect(detectEmbedType('data.json')).toBe('note')
      expect(detectEmbedType('file')).toBe('note')
    })
  })
})

describe('embed mdast-util — audio/video embedType', () => {
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

  it('parses audio embed with correct embedType', () => {
    const node = parseEmbed('![[recording.mp3]]')
    expect(node).toBeDefined()
    expect(node!.type).toBe('embed')
    expect(node!.target).toBe('recording.mp3')
    expect(node!.embedType).toBe('audio')
  })

  it('parses video embed with correct embedType', () => {
    const node = parseEmbed('![[clip.mp4]]')
    expect(node).toBeDefined()
    expect(node!.type).toBe('embed')
    expect(node!.target).toBe('clip.mp4')
    expect(node!.embedType).toBe('video')
  })

  it('parses video embed with display parameter', () => {
    const node = parseEmbed('![[video.webm|640]]')
    expect(node).toBeDefined()
    expect(node!.target).toBe('video.webm')
    expect(node!.display).toBe('640')
    expect(node!.embedType).toBe('video')
  })

  it('parses audio embed with all audio extensions', () => {
    for (const ext of AUDIO_EXTENSIONS) {
      const node = parseEmbed(`![[file${ext}]]`)
      expect(node).toBeDefined()
      expect(node!.embedType).toBe('audio')
    }
  })

  it('parses video embed with all video extensions', () => {
    for (const ext of VIDEO_EXTENSIONS) {
      const node = parseEmbed(`![[file${ext}]]`)
      expect(node).toBeDefined()
      expect(node!.embedType).toBe('video')
    }
  })
})
