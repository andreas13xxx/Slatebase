/**
 * Tests for the fallback shim layer.
 *
 * These implementations previously lived as a JavaScript string inside
 * plugin-loader.ts and were therefore untestable. The most valuable assertions
 * here are the two properties that string form kept getting wrong: that the
 * fallbacks never overwrite a real implementation, and that the regex-heavy
 * helpers survived being un-escaped from the template literal.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { registerFallbackShims } from './fallback-shims'

type Obs = Record<string, unknown>

/** Every API name the loader's injected string used to provide. */
const EXPECTED_NAMES = [
  'AbstractInputSuggest', 'BaseComponent', 'ColorComponent', 'Component',
  'ConfirmationModal', 'EditableFileView', 'EditorSuggest', 'Events',
  'ExtraButtonComponent', 'FileSystemAdapter', 'Keymap', 'MarkdownPreviewRenderer',
  'MarkdownRenderChild', 'MarkdownRenderer', 'MarkdownView', 'MomentFormatComponent',
  'Notice', 'Plugin', 'ProgressBarComponent', 'Scope', 'SearchComponent',
  'SettingPage', 'ValueComponent', 'addIcon', 'apiVersion', 'debounce',
  'getAllTags', 'getFrontMatterInfo', 'getIcon', 'getIconIds', 'getLanguage',
  'getLinkpath', 'htmlToMarkdown', 'normalizePath', 'parseLinktext', 'parseYaml',
  'prepareFuzzySearch', 'prepareSimpleSearch', 'removeIcon', 'request',
  'requestUrl', 'requireApiVersion', 'sanitizeHTMLToDom', 'setIcon', 'stringifyYaml',
] as const

describe('registerFallbackShims', () => {
  let original: Obs | undefined

  beforeEach(() => {
    original = window.obsidian
    window.obsidian = {}
  })

  afterEach(() => {
    window.obsidian = original
  })

  it('registers every API the loader string used to provide', () => {
    registerFallbackShims()
    const obs = window.obsidian as Obs

    for (const name of EXPECTED_NAMES) {
      expect(obs[name], `missing fallback: ${name}`).toBeDefined()
    }
  })

  it('never overwrites an already-registered real implementation', () => {
    const real = () => 'real'
    const obs: Obs = { parseYaml: real, normalizePath: real, Notice: real }
    window.obsidian = obs

    registerFallbackShims()

    expect(obs['parseYaml']).toBe(real)
    expect(obs['normalizePath']).toBe(real)
    expect(obs['Notice']).toBe(real)
  })

  it('is idempotent across repeated calls', () => {
    registerFallbackShims()
    const obs = window.obsidian as Obs
    const first = obs['parseYaml']

    registerFallbackShims()

    expect(obs['parseYaml']).toBe(first)
  })

  describe('normalizePath', () => {
    // The string version carried quadruple-escaped regexes (/\\\\/g, /\\/\\//g)
    // that had to be decoded by hand during extraction — worth pinning down.
    it.each([
      ['a\\b\\c', 'a/b/c'],
      ['foo//bar', 'foo/bar'],
      ['/leading', 'leading'],
      ['already/fine', 'already/fine'],
    ])('normalizes %j to %j', (input, expected) => {
      registerFallbackShims()
      const normalizePath = (window.obsidian as Obs)['normalizePath'] as (p: string) => string

      expect(normalizePath(input)).toBe(expected)
    })
  })

  describe('getAllTags', () => {
    beforeEach(() => registerFallbackShims())
    const getAllTags = (): ((c: unknown) => string[] | null) =>
      (window.obsidian as Obs)['getAllTags'] as (c: unknown) => string[] | null

    it('returns null for a missing cache', () => {
      expect(getAllTags()(null)).toBeNull()
    })

    it('collects inline tags', () => {
      expect(getAllTags()({ tags: [{ tag: '#a' }, { tag: '#b' }] })).toEqual(['#a', '#b'])
    })

    it('prefixes bare frontmatter tags with #', () => {
      expect(getAllTags()({ frontmatter: { tags: ['x', '#y'] } })).toEqual(['#x', '#y'])
    })

    it('splits a comma-separated frontmatter string', () => {
      expect(getAllTags()({ frontmatter: { tags: 'x, y' } })).toEqual(['#x', '#y'])
    })
  })

  describe('lifecycle base classes', () => {
    it('Plugin extends whichever Component is registered', () => {
      class RealComponent {}
      window.obsidian = { Component: RealComponent }

      registerFallbackShims()
      const Plugin = (window.obsidian as Obs)['Plugin'] as new (app?: unknown) => object

      expect(new Plugin({})).toBeInstanceOf(RealComponent)
    })

    it('Component load/unload drives the onload/onunload hooks', () => {
      registerFallbackShims()
      const Component = (window.obsidian as Obs)['Component'] as new () => {
        load(): void
        unload(): void
        onload(): void
        onunload(): void
      }

      const calls: string[] = []
      const c = new Component()
      c.onload = () => calls.push('load')
      c.onunload = () => calls.push('unload')

      c.load()
      c.unload()

      expect(calls).toEqual(['load', 'unload'])
    })
  })

  describe('getFrontMatterInfo', () => {
    beforeEach(() => registerFallbackShims())
    const info = (c: string): { exists: boolean; frontmatter: string } =>
      ((window.obsidian as Obs)['getFrontMatterInfo'] as (c: string) => {
        exists: boolean
        frontmatter: string
      })(c)

    it('reports no frontmatter when the document does not open with ---', () => {
      expect(info('# Heading').exists).toBe(false)
    })

    it('extracts the frontmatter block', () => {
      const result = info('---\ntitle: x\n---\nbody')
      expect(result.exists).toBe(true)
      expect(result.frontmatter).toBe('title: x')
    })
  })
})
