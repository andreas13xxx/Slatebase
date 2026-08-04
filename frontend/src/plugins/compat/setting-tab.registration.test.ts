/**
 * Regression test: the obsidian shim namespace must be fully populated
 * *synchronously* when `setting-tab` is imported.
 *
 * Why this matters:
 * `plugin-loader.ts` injects a set of throwaway fallback stubs for the same API
 * names into the evaluated plugin bundle (see the `require('obsidian')` shim).
 * Every layer registers with `if (!window.obsidian[x])` guards, so the *first*
 * writer claims a name permanently. Those loader stubs are installed
 * synchronously the moment a plugin bundle evaluates.
 *
 * Registering the real implementations on a deferred promise (`import().then()`)
 * therefore lost the race whenever a plugin loaded before the promise settled:
 * the cheap stubs won and the real implementations were silently discarded —
 * non-deterministically, depending only on microtask timing.
 *
 * The snapshot below is taken at module top level, which runs in the same
 * synchronous turn as the `setting-tab` module body — no microtask gap. Anything
 * registered via a deferred import is therefore absent from it.
 */
import { describe, it, expect } from 'vitest'
import './setting-tab'

// Captured synchronously, immediately after setting-tab's module body ran.
const snapshot: Record<string, unknown> = { ...(window.obsidian ?? {}) }

describe('setting-tab global registration', () => {
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

  describe('registers the real implementations, not the loader fallback stubs', () => {
    it('parseYaml parses YAML, unlike the loader stub which is JSON.parse', () => {
      const parseYaml = snapshot['parseYaml'] as (s: string) => unknown

      // The plugin-loader fallback is `JSON.parse` wrapped in try/catch and
      // returns {} for any real YAML frontmatter.
      expect(parseYaml('title: Hello')).toEqual({ title: 'Hello' })
    })

    it('prepareFuzzySearch matches, unlike the loader stub which always returns null', () => {
      const prepareFuzzySearch = snapshot['prepareFuzzySearch'] as (
        q: string,
      ) => (text: string) => unknown

      expect(prepareFuzzySearch('abc')('abc')).not.toBeNull()
    })
  })
})
