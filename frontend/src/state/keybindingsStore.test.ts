import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { IApiClient } from '../api'
import {
  initialize,
  disconnect,
  getShortcut,
  setShortcut,
  resetAll,
  _reloadFromStorage,
} from './keybindingsStore'
import { hasSyncedBefore, markSyncedBefore } from './preferenceSync'

vi.mock('../components/ToastNotification', () => ({ showToast: vi.fn() }))

/** Minimal API client stub — only the keybinding endpoints are exercised. */
function createMockApiClient(serverEntries: Array<{ commandId: string; shortcut: string }>) {
  return {
    getKeybindings: vi.fn().mockResolvedValue({ entries: serverEntries }),
    saveKeybindings: vi.fn().mockResolvedValue(undefined),
  } as unknown as IApiClient & {
    getKeybindings: ReturnType<typeof vi.fn>
    saveKeybindings: ReturnType<typeof vi.fn>
  }
}

describe('keybindingsStore — initialize', () => {
  beforeEach(() => {
    // localStorage is cleared in test-setup.ts beforeEach
    disconnect()
    _reloadFromStorage()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('replaces the local cache with the server list', async () => {
    setShortcut('slatebase:open-command-palette', 'Ctrl+X')
    const client = createMockApiClient([
      { commandId: 'slatebase:open-command-palette', shortcut: 'Ctrl+K' },
    ])

    await initialize(client)

    expect(getShortcut('slatebase:open-command-palette')).toBe('Ctrl+K')
    expect(hasSyncedBefore('keybindings')).toBe(true)
  })

  it('seeds the server from the local cache on the very first sync', async () => {
    setShortcut('slatebase:open-command-palette', 'Ctrl+X')
    const client = createMockApiClient([])

    await initialize(client)

    // Local data predates syncing — upload it instead of discarding it.
    expect(client.saveKeybindings).toHaveBeenCalledWith([
      { commandId: 'slatebase:open-command-palette', shortcut: 'Ctrl+X' },
    ])
    expect(getShortcut('slatebase:open-command-palette')).toBe('Ctrl+X')
  })

  it('honours an empty server list once this device has synced before', async () => {
    // The regression this guards: "reset all" on another device used to be
    // undone here, because an empty response was read as "server has no data".
    setShortcut('slatebase:open-command-palette', 'Ctrl+X')
    markSyncedBefore('keybindings')
    const client = createMockApiClient([])

    await initialize(client)

    expect(client.saveKeybindings).not.toHaveBeenCalled()
    expect(getShortcut('slatebase:open-command-palette')).toBe('Mod+P') // back to default
  })

  it('keeps local data and sets no marker when the server is unreachable', async () => {
    setShortcut('slatebase:open-command-palette', 'Ctrl+X')
    const client = {
      getKeybindings: vi.fn().mockRejectedValue(new Error('offline')),
      saveKeybindings: vi.fn(),
    } as unknown as IApiClient

    await initialize(client)

    expect(getShortcut('slatebase:open-command-palette')).toBe('Ctrl+X')
    expect(hasSyncedBefore('keybindings')).toBe(false)
  })

  it('clears the marker on disconnect so the next account starts clean', async () => {
    const client = createMockApiClient([
      { commandId: 'slatebase:open-command-palette', shortcut: 'Ctrl+K' },
    ])
    await initialize(client)
    expect(hasSyncedBefore('keybindings')).toBe(true)

    disconnect()

    expect(hasSyncedBefore('keybindings')).toBe(false)
  })

  it('propagates a reset to the server as an empty list', async () => {
    const client = createMockApiClient([
      { commandId: 'slatebase:open-command-palette', shortcut: 'Ctrl+K' },
    ])
    await initialize(client)

    vi.useFakeTimers()
    try {
      resetAll()
      await vi.advanceTimersByTimeAsync(2000) // SYNC_DEBOUNCE_MS
      expect(client.saveKeybindings).toHaveBeenCalledWith([])
    } finally {
      vi.useRealTimers()
    }
  })
})
