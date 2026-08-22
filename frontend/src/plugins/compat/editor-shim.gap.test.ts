/**
 * Editor was the one major shim without the non-emulated-access safety net.
 * An unemulated `editor.*` was a bare TypeError thrown from inside plugin code,
 * with no record of what had been asked for — unlike every other surface, which
 * answers with a logged no-op that shows up in `__slatebasePluginApiGaps()`.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { EditorShim } from './editor-shim'
import { clearApiGaps, getApiGaps } from './api-gap-registry'
import { resetLogDedup } from './log'

describe('EditorShim.create()', () => {
  beforeEach(() => {
    clearApiGaps()
    resetLogDedup()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('passes emulated methods straight through', () => {
    const editor = EditorShim.create()
    editor.setValue('Hallo Welt')
    expect(editor.getValue()).toBe('Hallo Welt')
  })

  it('keeps `this` bound to the real instance', () => {
    const editor = EditorShim.create()
    const { setValue, getValue } = editor
    // Detached method references are common in plugin code; binding through the
    // proxy is what keeps them working against the underlying instance.
    setValue('Losgelöst')
    expect(getValue()).toBe('Losgelöst')
  })

  it('answers an unemulated property with a callable no-op instead of throwing', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const editor = EditorShim.create() as unknown as Record<string, () => unknown>
    expect(typeof editor['someUndocumentedInternal']).toBe('function')
    expect(() => editor['someUndocumentedInternal']!()).not.toThrow()
    expect(editor['someUndocumentedInternal']!()).toBeUndefined()
  })

  it('warns once about a non-emulated property', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const editor = EditorShim.create() as unknown as Record<string, unknown>
    void editor['missingThing']
    void editor['missingThing']
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0]?.[0]).toContain('missingThing')
  })

  it('records reads and calls separately in the gap registry', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const editor = EditorShim.create() as unknown as Record<string, () => unknown>
    const fn = editor['unmappedApi']!
    fn()

    const gap = getApiGaps().find((g) => g.property === 'unmappedApi')
    expect(gap?.shim).toBe('Editor')
    // A read alone is often harmless feature detection; a call means the plugin
    // expected something to happen and nothing did.
    expect(gap?.reads).toBe(1)
    expect(gap?.calls).toBe(1)
  })

  it('leaves `then` undefined so an awaited editor cannot hang', () => {
    const editor = EditorShim.create() as unknown as { then?: unknown }
    expect(editor.then).toBeUndefined()
  })

  it('is awaitable without hanging', async () => {
    const editor = EditorShim.create()
    await expect(Promise.resolve(editor)).resolves.toBe(editor)
  })
})
