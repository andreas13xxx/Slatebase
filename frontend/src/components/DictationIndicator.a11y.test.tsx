import { describe, test, expect, beforeEach, vi } from 'vitest'
import { render, act } from '@testing-library/react'
import { axe } from 'vitest-axe'
import { DictationIndicator } from './DictationIndicator'
import {
  DictationController,
  _setDictationController,
  getDictationController,
} from '../editor/dictation/dictation-controller'
import type { IDictationRecorder } from '../editor/dictation/dictation-recorder'
import type { IApiClient } from '../api'

// Active editor stub so a recording session can start.
vi.mock('../editor/plugin-extensions', () => ({
  getActiveEditorView: () => ({
    state: { selection: { main: { from: 0, to: 0 } } },
    dispatch: vi.fn(),
    focus: vi.fn(),
  }),
}))

function makeRecorder(): IDictationRecorder {
  let pending: ((v: { blob: Blob; contentType: string }) => void) | null = null
  return {
    start: vi.fn().mockResolvedValue(undefined),
    // Never resolves on its own, so the controller stays in 'processing' for the test.
    stop: vi.fn().mockImplementation(() => new Promise((resolve) => { pending = resolve; void pending })),
    cancel: vi.fn(),
    isRecording: vi.fn().mockReturnValue(false),
  }
}

const apiClient = {
  transcribe: vi.fn().mockReturnValue(new Promise(() => {})), // stays pending → 'processing'
} as unknown as IApiClient

const ctx = { apiClient, vaultId: 'vault-1', language: 'auto', saveAudio: false }

describe('DictationIndicator accessibility', () => {
  beforeEach(() => {
    _setDictationController(new DictationController(makeRecorder()))
  })

  test('renders nothing (no violations) while idle', async () => {
    const { container } = render(<DictationIndicator vaultId="vault-1" apiClient={apiClient} />)
    expect(container.firstChild).toBeNull()
    expect(await axe(container)).toHaveNoViolations()
  })

  test('has no axe violations while recording', async () => {
    await act(async () => { await getDictationController().toggle(ctx) })
    const { container } = render(<DictationIndicator vaultId="vault-1" apiClient={apiClient} />)
    expect(await axe(container)).toHaveNoViolations()
  })

  test('has no axe violations while processing', async () => {
    await act(async () => { await getDictationController().toggle(ctx) }) // start (recording)
    await act(async () => { void getDictationController().toggle(ctx) })  // stop → processing (pending)
    const { container } = render(<DictationIndicator vaultId="vault-1" apiClient={apiClient} />)
    expect(await axe(container)).toHaveNoViolations()
  })

  test('has no axe violations in the error state', async () => {
    const controller = getDictationController()
    // Force an error state deterministically via reset from a fresh recorder that throws.
    const failing = new DictationController({
      start: vi.fn().mockRejectedValue(Object.assign(new Error('denied'), { name: 'Error' })),
      stop: vi.fn(),
      cancel: vi.fn(),
      isRecording: vi.fn().mockReturnValue(false),
    })
    _setDictationController(failing)
    await act(async () => { await failing.toggle(ctx) })
    void controller
    const { container } = render(<DictationIndicator vaultId="vault-1" apiClient={apiClient} />)
    expect(failing.getState().status).toBe('error')
    expect(await axe(container)).toHaveNoViolations()
  })
})
