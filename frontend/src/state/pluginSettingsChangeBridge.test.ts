import { describe, it, expect, vi } from 'vitest'
import { onPluginSettingsChange, dispatchPluginSettingsChange } from './pluginSettingsChangeBridge'

describe('pluginSettingsChangeBridge', () => {
  it('delivers a dispatched event to a subscribed callback', () => {
    const cb = vi.fn()
    const unsubscribe = onPluginSettingsChange(cb)

    dispatchPluginSettingsChange({ vaultId: 'v1', pluginId: 'p1' })

    expect(cb).toHaveBeenCalledWith({ vaultId: 'v1', pluginId: 'p1' })
    unsubscribe()
  })

  it('stops delivering events after unsubscribe', () => {
    const cb = vi.fn()
    const unsubscribe = onPluginSettingsChange(cb)
    unsubscribe()

    dispatchPluginSettingsChange({ vaultId: 'v1', pluginId: 'p1' })

    expect(cb).not.toHaveBeenCalled()
  })

  it('delivers to every subscribed callback', () => {
    const a = vi.fn()
    const b = vi.fn()
    const unsubA = onPluginSettingsChange(a)
    const unsubB = onPluginSettingsChange(b)

    dispatchPluginSettingsChange({ vaultId: 'v2', pluginId: 'p2' })

    expect(a).toHaveBeenCalledWith({ vaultId: 'v2', pluginId: 'p2' })
    expect(b).toHaveBeenCalledWith({ vaultId: 'v2', pluginId: 'p2' })
    unsubA()
    unsubB()
  })

  it('does nothing when nobody is subscribed', () => {
    expect(() => dispatchPluginSettingsChange({ vaultId: 'v3', pluginId: 'p3' })).not.toThrow()
  })
})
