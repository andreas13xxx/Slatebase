import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  hasSyncedBefore,
  markSyncedBefore,
  clearSyncedBefore,
  reportSyncFailure,
  reportSyncSuccess,
  _resetFailureState,
} from './preferenceSync'

vi.mock('../components/ToastNotification', () => ({
  showToast: vi.fn(),
}))

const { showToast } = await import('../components/ToastNotification')

describe('preferenceSync', () => {
  beforeEach(() => {
    // localStorage is cleared in test-setup.ts beforeEach
    _resetFailureState()
    vi.mocked(showToast).mockClear()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  describe('first-sync marker', () => {
    it('reports not-yet-synced for an unknown store', () => {
      expect(hasSyncedBefore('keybindings')).toBe(false)
    })

    it('reports synced after the marker is set', () => {
      markSyncedBefore('keybindings')
      expect(hasSyncedBefore('keybindings')).toBe(true)
    })

    it('keeps markers independent per store', () => {
      markSyncedBefore('favorites')
      expect(hasSyncedBefore('favorites')).toBe(true)
      expect(hasSyncedBefore('keybindings')).toBe(false)
    })

    it('clears the marker on logout so the next account starts clean', () => {
      markSyncedBefore('favorites')
      clearSyncedBefore('favorites')
      expect(hasSyncedBefore('favorites')).toBe(false)
    })

    it('reports not-yet-synced when localStorage throws', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
        throw new Error('denied')
      })
      // Safe direction: the store seeds from its cache rather than dropping it.
      expect(hasSyncedBefore('keybindings')).toBe(false)
      vi.restoreAllMocks()
    })
  })

  describe('failure reporting', () => {
    it('toasts once per failure streak, not once per attempt', () => {
      reportSyncFailure('keybindings', new Error('offline'), 'Tastaturkürzel')
      reportSyncFailure('keybindings', new Error('offline'), 'Tastaturkürzel')
      reportSyncFailure('keybindings', new Error('offline'), 'Tastaturkürzel')

      expect(showToast).toHaveBeenCalledTimes(1)
      expect(vi.mocked(showToast).mock.calls[0]![0]).toBe('error')
      expect(vi.mocked(showToast).mock.calls[0]![1]).toContain('Tastaturkürzel')
    })

    it('toasts again after a success re-arms the store', () => {
      reportSyncFailure('keybindings', new Error('offline'), 'Tastaturkürzel')
      reportSyncSuccess('keybindings')
      reportSyncFailure('keybindings', new Error('offline again'), 'Tastaturkürzel')

      expect(showToast).toHaveBeenCalledTimes(2)
    })

    it('tracks failure streaks per store', () => {
      reportSyncFailure('keybindings', new Error('offline'), 'Tastaturkürzel')
      reportSyncFailure('favorites', new Error('offline'), 'Favoriten')

      expect(showToast).toHaveBeenCalledTimes(2)
    })

    it('logs but does not toast when no label is given', () => {
      reportSyncFailure('recentFiles', new Error('offline'))

      expect(showToast).not.toHaveBeenCalled()
      expect(console.warn).toHaveBeenCalled()
    })
  })
})
