/**
 * The plugin sandbox's require() shim exists only as a JS string embedded in
 * plugin-loader.ts (interpolated into a Blob-URL-imported module at runtime —
 * see evaluateBundle()), so it has no export to import directly, and the rest
 * of this test suite always injects a mock bundleEvaluator that bypasses it
 * entirely. This extracts and evaluates the exact require()/
 * __unknownModuleStub() source against a minimal `window` stub, so a change
 * to that source that breaks its shape fails this test's extraction rather
 * than silently going untested.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

function loadRequireShim(win: Record<string, unknown>): (id: string) => unknown {
  const filePath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'plugin-loader.ts')
  const source = readFileSync(filePath, 'utf-8')
  const match = source.match(/const __requireWarnedModules[\s\S]*?return __unknownModuleStub\(id\);\r?\n\}/)
  if (!match) {
    throw new Error('require() shim source not found in plugin-loader.ts — extraction pattern is stale')
  }

  const factory = new Function('window', 'console', `${match[0]}\nreturn require;`)
  return factory(win, console) as (id: string) => unknown
}

describe('plugin sandbox require() shim — unknown module safety', () => {
  let warn: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    warn.mockRestore()
  })

  it('does not throw when a method is called on an unrecognized module', () => {
    const req = loadRequireShim({})
    const fs = req('fs') as { readFileSync: (p: string) => unknown }

    expect(() => fs.readFileSync('/x')).not.toThrow()
    expect(fs.readFileSync('/x')).toBeUndefined()
  })

  it('does not throw for genuine Node/Electron builtins', () => {
    const req = loadRequireShim({})
    for (const id of ['child_process', 'net', 'electron', 'os', 'crypto']) {
      const mod = req(id) as Record<string, () => unknown>
      expect(() => mod.someMethod()).not.toThrow()
    }
  })

  it('warns once per module id, not once per member access', () => {
    const req = loadRequireShim({})
    const fs = req('fs') as Record<string, unknown>

    void fs.readFileSync
    void fs.writeFileSync

    const moduleNotFoundWarnings = warn.mock.calls.filter((c) => String(c[0]).includes('Unknown module "fs"'))
    expect(moduleNotFoundWarnings).toHaveLength(1)
  })

  it('still returns the real, working value for recognized modules', () => {
    const req = loadRequireShim({ __slatebasePath: { join: () => 'joined' } })
    const p = req('path') as { join: () => string }

    expect(p.join()).toBe('joined')
  })

  it('the returned stub is falsy-safe but always callable, mirroring the app/vault proxies', () => {
    const req = loadRequireShim({})
    const fs = req('fs') as Record<string, unknown>

    expect(fs.anything).toBeTypeOf('function')
  })
})
