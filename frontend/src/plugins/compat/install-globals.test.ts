/**
 * Regression test: `installObsidianGlobals()` must populate the whole namespace
 * *synchronously*, before it returns.
 *
 * Why this matters:
 * `plugin-loader.ts` hands `window.obsidian` to every evaluated plugin bundle,
 * and `registerFallbackShims()` fills any name still unclaimed with a minimal
 * no-op. Every layer registers with `if (!window.obsidian[x])` guards, so the
 * *first* writer claims a name permanently.
 *
 * Registering the real implementations on a deferred promise (`import().then()`)
 * therefore lost the race whenever a plugin loaded before the promise settled:
 * the cheap fallbacks won and the real implementations were silently discarded —
 * non-deterministically, depending only on microtask timing.
 *
 * The snapshot below is taken at module top level, in the same synchronous turn
 * as the install call — no microtask gap. Anything registered via a deferred
 * import is therefore absent from it.
 */
import { describe, it, expect } from 'vitest'
import { installObsidianGlobals } from './install-globals'

// Captured synchronously, in the same turn as the install call — no microtask gap.
installObsidianGlobals()
const snapshot: Record<string, unknown> = { ...(window.obsidian ?? {}) }

describe('installObsidianGlobals', () => {
  describe('registers shims synchronously on import', () => {
    it.each([
      'SuggestModal',
      'FuzzySuggestModal',
      'MarkdownRenderer',
      'Editor',
    ])('%s is available without awaiting a microtask', (name) => {
      expect(snapshot[name]).toBeTypeOf('function')
    })
  })

  describe('registers obsidian-api-extensions synchronously on import', () => {
    it.each([
      'Events',
      'Scope',
      'Keymap',
      'parseYaml',
      'getAllTags',
      'prepareFuzzySearch',
      'ExtraButtonComponent',
      'MarkdownPreviewRenderer',
    ])('%s is available without awaiting a microtask', (name) => {
      expect(snapshot[name]).toBeDefined()
    })
  })

  describe('registers the real implementations, not the fallback shims', () => {
    it('parseYaml parses YAML, unlike the fallback which is JSON.parse', () => {
      const parseYaml = snapshot['parseYaml'] as (s: string) => unknown

      // The fallback is `JSON.parse` wrapped in try/catch and returns {} for
      // any real YAML frontmatter.
      expect(parseYaml('title: Hello')).toEqual({ title: 'Hello' })
    })

    it('prepareFuzzySearch matches, unlike the fallback which always returns null', () => {
      const prepareFuzzySearch = snapshot['prepareFuzzySearch'] as (
        q: string,
      ) => (text: string) => unknown

      expect(prepareFuzzySearch('abc')('abc')).not.toBeNull()
    })
  })

  describe('window globals plugin bundles read directly', () => {
    it.each([
      'moment',
      'createEl',
      'createDiv',
      'createSpan',
      'createFragment',
      'activeWindow',
      'activeDocument',
      'sleep',
      'nextFrame',
      'CodeMirror',
    ])('installs window.%s', (name) => {
      expect((window as unknown as Record<string, unknown>)[name]).toBeDefined()
    })
  })

  describe('idempotency', () => {
    it('a repeated call does not replace already-registered implementations', () => {
      const before = window.obsidian as Record<string, unknown>
      const parseYaml = before['parseYaml']
      const Plugin = before['Plugin']

      installObsidianGlobals()

      expect(before['parseYaml']).toBe(parseYaml)
      expect(before['Plugin']).toBe(Plugin)
    })
  })
})
