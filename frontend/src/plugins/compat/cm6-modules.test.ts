/**
 * Tests for the CodeMirror modules exposed to plugin bundles.
 *
 * `plugin-loader.ts` resolves `require('@codemirror/...')` and `require('@lezer/...')`
 * from the `window.__codemirror*` / `window.__lezer*` globals installed here. Three
 * of those used to resolve to empty objects or a fake parser:
 *
 * - `@codemirror/lint` and `@lezer/lr` returned `{}` / a dummy `LRParser`, even
 *   though both packages were already present in node_modules as transitive
 *   dependencies. They are direct dependencies now and wired to the real modules.
 * - `@codemirror/history` does not exist in CM6 at all — it was folded into
 *   `@codemirror/commands` during the beta. It now re-exports the real history API
 *   under the legacy module name instead of returning nothing.
 */
import { describe, it, expect, beforeAll } from 'vitest'
import * as CmCommands from '@codemirror/commands'
import { installObsidianGlobals } from './install-globals'

type Mod = Record<string, unknown>

const win = (): Record<string, unknown> => window as unknown as Record<string, unknown>

describe('CodeMirror modules exposed to plugin bundles', () => {
  beforeAll(() => {
    installObsidianGlobals()
  })

  describe('@codemirror/lint', () => {
    it('exposes the real module, not an empty stub', () => {
      const lint = win()['__codemirrorLint'] as Mod

      expect(lint).toBeDefined()
      expect(Object.keys(lint).length).toBeGreaterThan(0)
    })

    it.each(['linter', 'lintGutter', 'lintKeymap', 'setDiagnostics', 'forceLinting'])(
      'exports %s',
      (name) => {
        expect((win()['__codemirrorLint'] as Mod)[name]).toBeDefined()
      },
    )
  })

  describe('@lezer/lr', () => {
    it('exposes the real module, not the dummy LRParser stub', () => {
      const lr = win()['__lezerLr'] as Mod

      expect(lr['LRParser']).toBeTypeOf('function')
      // The old stub was a plain object literal carrying only `deserialize`.
      expect(lr['ExternalTokenizer']).toBeTypeOf('function')
      expect(lr['ContextTracker']).toBeTypeOf('function')
    })

    it('LRParser.deserialize is the real static, not a dummy returning {}', () => {
      const LRParser = (win()['__lezerLr'] as Mod)['LRParser'] as {
        deserialize?: unknown
      }

      expect(LRParser.deserialize).toBeTypeOf('function')
    })
  })

  describe('@codemirror/history (legacy module name)', () => {
    it('re-exports the real history API from @codemirror/commands', () => {
      const history = win()['__codemirrorHistory'] as Mod

      expect(history['history']).toBe(CmCommands.history)
      expect(history['undo']).toBe(CmCommands.undo)
      expect(history['redo']).toBe(CmCommands.redo)
      expect(history['historyKeymap']).toBe(CmCommands.historyKeymap)
    })

    it.each([
      'history',
      'historyField',
      'historyKeymap',
      'isolateHistory',
      'undo',
      'redo',
      'undoDepth',
      'redoDepth',
      'undoSelection',
      'redoSelection',
    ])('exports %s', (name) => {
      expect((win()['__codemirrorHistory'] as Mod)[name]).toBeDefined()
    })
  })

  describe('previously wired modules still resolve', () => {
    it.each([
      '__codemirrorState',
      '__codemirrorView',
      '__codemirrorLanguage',
      '__codemirrorCommands',
      '__codemirrorAutocomplete',
      '__codemirrorSearch',
      '__lezerCommon',
      '__lezerHighlight',
    ])('%s is populated', (global) => {
      const mod = win()[global] as Mod

      expect(mod).toBeDefined()
      expect(Object.keys(mod).length).toBeGreaterThan(0)
    })
  })
})
