import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook } from '@testing-library/react'
import { dispatchRealtimeVaultChange } from '../state/realtimeVaultBridge'
import { isPluginListPath, useVaultPluginChanges } from './useVaultPluginChanges'

function change(vaultId: string, path: string, action: 'saved' | 'deleted' = 'saved'): void {
  dispatchRealtimeVaultChange({ vaultId, action, path, userId: 'u', username: 'u' })
}

describe('isPluginListPath', () => {
  it.each([
    '.obsidian/plugins/dataview/manifest.json',
    '.obsidian/plugins/dataview/main.js',
    '.obsidian/plugins/scrybble.ink/styles.css',
    '.obsidian/community-plugins.json',
  ])('treats %s as a change of the plugin list', (path) => {
    expect(isPluginListPath(path)).toBe(true)
  })

  it.each([
    '.obsidian/plugins/dataview/data.json',
    '.obsidian/appearance.json',
    '.obsidian/snippets/a.css',
    'notes/plugins.md',
  ])('ignores %s', (path) => {
    expect(isPluginListPath(path)).toBe(false)
  })
})

describe('useVaultPluginChanges', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('calls back once for a burst of changes in the vault', () => {
    const onChange = vi.fn()
    renderHook(() => useVaultPluginChanges('vault-1', onChange))

    change('vault-1', '.obsidian/plugins/a/manifest.json')
    change('vault-1', '.obsidian/plugins/b/manifest.json')
    change('vault-1', '.obsidian/community-plugins.json')
    expect(onChange).not.toHaveBeenCalled()

    vi.advanceTimersByTime(300)
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  it('ignores other vaults and unrelated paths', () => {
    const onChange = vi.fn()
    renderHook(() => useVaultPluginChanges('vault-1', onChange))

    change('vault-2', '.obsidian/plugins/a/manifest.json')
    change('vault-1', '.obsidian/plugins/a/data.json')
    change('vault-1', 'notes/a.md')
    vi.advanceTimersByTime(1000)

    expect(onChange).not.toHaveBeenCalled()
  })

  it('uses the latest callback without resubscribing', () => {
    const first = vi.fn()
    const second = vi.fn()
    const { rerender } = renderHook(({ cb }) => useVaultPluginChanges('vault-1', cb), { initialProps: { cb: first } })

    rerender({ cb: second })
    change('vault-1', '.obsidian/plugins/a/manifest.json', 'deleted')
    vi.advanceTimersByTime(300)

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('stops listening and drops a pending call on unmount', () => {
    const onChange = vi.fn()
    const { unmount } = renderHook(() => useVaultPluginChanges('vault-1', onChange))

    change('vault-1', '.obsidian/plugins/a/manifest.json')
    unmount()
    vi.advanceTimersByTime(1000)
    change('vault-1', '.obsidian/plugins/a/manifest.json')
    vi.advanceTimersByTime(1000)

    expect(onChange).not.toHaveBeenCalled()
  })
})
