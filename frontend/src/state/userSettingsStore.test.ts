import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { IApiClient, UserUiSettings } from '../api'
import {
  initialize,
  disconnect,
  getUiSettings,
  updateUiSettings,
  refreshFromServer,
  DEFAULT_UI_SETTINGS,
  _reset,
} from './userSettingsStore'
import { hasSyncedBefore, markSyncedBefore } from './preferenceSync'

vi.mock('../components/ToastNotification', () => ({ showToast: vi.fn() }))

/** Server stub that merges patches the way the real backend does. */
function createMockApiClient(initial: Partial<UserUiSettings> = {}) {
  let stored: UserUiSettings = {
    ...structuredClone(DEFAULT_UI_SETTINGS),
    ...initial,
    toolbar: { ...DEFAULT_UI_SETTINGS.toolbar, ...(initial.toolbar ?? {}) },
  }

  return {
    getUiSettings: vi.fn(async () => ({ settings: structuredClone(stored) })),
    saveUiSettings: vi.fn(async (patch: Record<string, unknown>) => {
      stored = {
        ...stored,
        ...patch,
        toolbar: { ...stored.toolbar, ...((patch['toolbar'] as object) ?? {}) },
      } as UserUiSettings
      return { settings: structuredClone(stored) }
    }),
    /** Test helper — what the "server" currently holds. */
    _stored: () => stored,
  } as unknown as IApiClient & {
    getUiSettings: ReturnType<typeof vi.fn>
    saveUiSettings: ReturnType<typeof vi.fn>
    _stored: () => UserUiSettings
  }
}

describe('userSettingsStore', () => {
  beforeEach(() => {
    // localStorage is cleared in test-setup.ts beforeEach
    _reset()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  describe('local behaviour', () => {
    it('starts from the shipped defaults', () => {
      expect(getUiSettings()).toEqual(DEFAULT_UI_SETTINGS)
    })

    it('applies a change immediately, before any server round-trip', () => {
      updateUiSettings({ statusBarVisible: false })
      expect(getUiSettings().statusBarVisible).toBe(false)
    })

    it('merges a toolbar patch without clearing sibling toolbar keys', () => {
      updateUiSettings({ toolbar: { position: 'right' } })
      updateUiSettings({ toolbar: { visible: false } })

      expect(getUiSettings().toolbar.position).toBe('right')
      expect(getUiSettings().toolbar.visible).toBe(false)
    })
  })

  describe('initialize', () => {
    it('takes the server copy once this device has synced before', async () => {
      updateUiSettings({ statusBarVisible: false })
      markSyncedBefore('uiSettings')
      const client = createMockApiClient({ statusBarVisible: true })

      await initialize(client)

      expect(getUiSettings().statusBarVisible).toBe(true)
      expect(client.saveUiSettings).not.toHaveBeenCalled()
    })

    it('seeds the server from the local cache on the very first sync', async () => {
      // The migration case: these settings lived only in localStorage before.
      updateUiSettings({ statusBarVisible: false })
      const client = createMockApiClient()

      await initialize(client)

      expect(client.saveUiSettings).toHaveBeenCalled()
      expect(client._stored().statusBarVisible).toBe(false)
    })

    it('does not seed when the local cache is untouched', async () => {
      const client = createMockApiClient({ statusBarVisible: false })

      await initialize(client)

      expect(client.saveUiSettings).not.toHaveBeenCalled()
      expect(getUiSettings().statusBarVisible).toBe(false)
    })

    it('keeps local data and sets no marker when the server is unreachable', async () => {
      updateUiSettings({ statusBarVisible: false })
      const client = {
        getUiSettings: vi.fn().mockRejectedValue(new Error('offline')),
        saveUiSettings: vi.fn(),
      } as unknown as IApiClient

      await initialize(client)

      expect(getUiSettings().statusBarVisible).toBe(false)
      expect(hasSyncedBefore('uiSettings')).toBe(false)
    })
  })

  describe('server sync', () => {
    it('sends only the changed fields', async () => {
      const client = createMockApiClient()
      await initialize(client)
      client.saveUiSettings.mockClear()

      vi.useFakeTimers()
      try {
        updateUiSettings({ statusBarVisible: false })
        await vi.advanceTimersByTimeAsync(800)
      } finally {
        vi.useRealTimers()
      }

      expect(client.saveUiSettings).toHaveBeenCalledWith({ statusBarVisible: false })
    })

    it('coalesces rapid changes into one request', async () => {
      const client = createMockApiClient()
      await initialize(client)
      client.saveUiSettings.mockClear()

      vi.useFakeTimers()
      try {
        updateUiSettings({ statusBarVisible: false })
        updateUiSettings({ explorerFollowActiveFile: true })
        await vi.advanceTimersByTimeAsync(800)
      } finally {
        vi.useRealTimers()
      }

      expect(client.saveUiSettings).toHaveBeenCalledTimes(1)
      expect(client.saveUiSettings).toHaveBeenCalledWith({
        statusBarVisible: false,
        explorerFollowActiveFile: true,
      })
    })
  })

  describe('refreshFromServer', () => {
    it('adopts what another device changed', async () => {
      const client = createMockApiClient()
      await initialize(client)

      client.getUiSettings.mockResolvedValueOnce({
        settings: { ...structuredClone(DEFAULT_UI_SETTINGS), statusBarVisible: false },
      })
      await refreshFromServer()

      expect(getUiSettings().statusBarVisible).toBe(false)
    })
  })

  describe('disconnect', () => {
    it('clears the first-sync marker so the next account starts clean', async () => {
      const client = createMockApiClient()
      await initialize(client)
      expect(hasSyncedBefore('uiSettings')).toBe(true)

      disconnect()

      expect(hasSyncedBefore('uiSettings')).toBe(false)
    })
  })
})
