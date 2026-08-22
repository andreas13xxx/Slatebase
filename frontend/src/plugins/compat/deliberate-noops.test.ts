/**
 * Slatebase's quality rules forbid silent no-op stubs: an unimplemented API
 * must either work or say so. These stubs are deliberate — there is genuinely
 * nothing behind them — but they used to return quietly, which is the failure
 * mode that is hardest to diagnose from the outside.
 *
 * Severity is meaningful (see log.ts): `console.debug` for a deliberate
 * trade-off with a working alternative, `console.warn` for a real gap where
 * plugin code silently will not run.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { installObsidianGlobals } from './install-globals'
import { resetLogDedup } from './log'

installObsidianGlobals()

describe('deliberate no-op stubs log rather than fail silently', () => {
  beforeEach(() => {
    resetLogDedup()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('CodeMirror 5 legacy global', () => {
    const cm5 = (window as unknown as { CodeMirror: Record<string, () => void> }).CodeMirror

    it('logs at debug — the CM6 path plugins also ship still works', () => {
      const debug = vi.spyOn(console, 'debug').mockImplementation(() => {})
      cm5['defineMode']!()
      expect(debug).toHaveBeenCalledTimes(1)
      expect(debug.mock.calls[0]?.[0]).toContain('CodeMirror.defineMode()')
    })

    it('logs once per method, not once per call', () => {
      const debug = vi.spyOn(console, 'debug').mockImplementation(() => {})
      cm5['defineMIME']!()
      cm5['defineMIME']!()
      expect(debug).toHaveBeenCalledTimes(1)
    })
  })

  describe('Vim adapter', () => {
    it('logs at debug that Vim bindings never fire', () => {
      const debug = vi.spyOn(console, 'debug').mockImplementation(() => {})
      const vim = (window as unknown as { CodeMirrorAdapter: { Vim: Record<string, () => void> } })
        .CodeMirrorAdapter.Vim
      vim['defineAction']!()
      expect(debug).toHaveBeenCalledTimes(1)
      expect(debug.mock.calls[0]?.[0]).toContain('Vim.defineAction()')
    })
  })

  describe('foldManager', () => {
    it('logs at debug that fold state is not persisted', () => {
      const debug = vi.spyOn(console, 'debug').mockImplementation(() => {})
      const app = (window as unknown as { app: { foldManager: Record<string, () => void> } }).app
      app.foldManager['save']!()
      expect(debug).toHaveBeenCalledTimes(1)
      expect(debug.mock.calls[0]?.[0]).toContain('foldManager.save()')
    })
  })

  describe('HTMLElement.onNodeInserted', () => {
    it('warns — deferred plugin layout code silently never runs', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const el = document.createElement('div') as HTMLElement & {
        onNodeInserted(cb: () => void): () => void
      }
      const unsubscribe = el.onNodeInserted(() => {})
      expect(warn).toHaveBeenCalledTimes(1)
      // The unsubscribe is real in shape, so callers can still clean up.
      expect(typeof unsubscribe).toBe('function')
    })
  })

  describe('HTMLElement.onWindowMigrated', () => {
    it('logs at debug — a single-window app has nothing to report', () => {
      const debug = vi.spyOn(console, 'debug').mockImplementation(() => {})
      const el = document.createElement('div') as HTMLElement & {
        onWindowMigrated(cb: () => void): () => void
      }
      el.onWindowMigrated(() => {})
      expect(debug).toHaveBeenCalledTimes(1)
    })
  })

  describe('bootstrap window.app.commands', () => {
    it('warns and reports failure instead of silently dropping the command', () => {
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      const commands = (window as unknown as {
        app: { commands: { executeCommand(c: { id: string }): boolean } }
      }).app.commands
      // Obsidian's executeCommand returns whether the command ran; a bare
      // `undefined` here reads as success to a plugin checking the result.
      expect(commands.executeCommand({ id: 'app:reload' })).toBe(false)
      expect(warn).toHaveBeenCalledTimes(1)
      expect(warn.mock.calls[0]?.[0]).toContain('app:reload')
    })
  })
})
