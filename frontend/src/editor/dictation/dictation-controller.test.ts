import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  DictationController,
  dictationAttachmentName,
  extensionForContentType,
  type DictationContext,
} from './dictation-controller'
import type { IDictationRecorder, DictationRecorderResult } from './dictation-recorder'
import { DictationRecorderError } from './dictation-recorder'
import type { IApiClient } from '../../api'

// Mock the active editor view. Each test sets what getActiveEditorView returns.
const dispatch = vi.fn()
let activeView: { state: { selection: { main: { from: number; to: number } } }; dispatch: typeof dispatch; focus: () => void } | null = null
vi.mock('../plugin-extensions', () => ({
  getActiveEditorView: () => activeView,
}))

function makeView(from = 0, to = 0) {
  return {
    state: { selection: { main: { from, to } } },
    dispatch,
    focus: vi.fn(),
  }
}

function makeRecorder(result: DictationRecorderResult = { blob: new Blob(['x'], { type: 'audio/webm' }), contentType: 'audio/webm' }): IDictationRecorder & {
  start: ReturnType<typeof vi.fn>
  stop: ReturnType<typeof vi.fn>
  cancel: ReturnType<typeof vi.fn>
} {
  return {
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn().mockResolvedValue(result),
    cancel: vi.fn(),
    isRecording: vi.fn().mockReturnValue(false),
  }
}

function makeApiClient(overrides: Partial<IApiClient> = {}): IApiClient {
  return {
    transcribe: vi.fn().mockResolvedValue({ text: 'transcribed' }),
    getVaultConfig: vi.fn().mockResolvedValue({ templatesDirectory: 'T', dailyNotesDirectory: '', dailyNoteTemplateName: '', attachmentsDirectory: 'Attachments' }),
    uploadFiles: vi.fn().mockResolvedValue({ uploaded: [{ fileName: 'dictation-x.webm', path: 'Attachments/dictation-x.webm' }] }),
    ...overrides,
  } as unknown as IApiClient
}

function ctx(apiClient: IApiClient, over: Partial<DictationContext> = {}): DictationContext {
  return { apiClient, vaultId: 'vault-1', language: 'auto', saveAudio: false, ...over }
}

describe('helpers', () => {
  it('extensionForContentType strips codecs and maps known types', () => {
    expect(extensionForContentType('audio/webm;codecs=opus')).toBe('webm')
    expect(extensionForContentType('audio/ogg')).toBe('ogg')
    expect(extensionForContentType('audio/unknown')).toBe('webm')
  })

  it('dictationAttachmentName builds a timestamped name', () => {
    const name = dictationAttachmentName(new Date(2026, 0, 2, 3, 4, 5), 'audio/webm')
    expect(name).toBe('dictation-2026-01-02-030405.webm')
  })
})

describe('DictationController', () => {
  beforeEach(() => {
    dispatch.mockClear()
    activeView = makeView()
  })

  it('refuses to start when no editor is active', async () => {
    activeView = null
    const controller = new DictationController(makeRecorder())
    await controller.toggle(ctx(makeApiClient()))
    expect(controller.getState().status).toBe('error')
    expect(controller.getState().error).toMatch(/editor/i)
  })

  it('starts recording when idle and an editor is active', async () => {
    const recorder = makeRecorder()
    const controller = new DictationController(recorder)
    await controller.toggle(ctx(makeApiClient()))
    expect(recorder.start).toHaveBeenCalledOnce()
    expect(controller.getState().status).toBe('recording')
  })

  it('surfaces a recorder start error (e.g. permission denied)', async () => {
    const recorder = makeRecorder()
    recorder.start.mockRejectedValue(new DictationRecorderError('permission-denied', 'Microphone access was denied.'))
    const controller = new DictationController(recorder)
    await controller.toggle(ctx(makeApiClient()))
    expect(controller.getState()).toEqual({ status: 'error', error: 'Microphone access was denied.' })
  })

  it('stops, transcribes, and inserts the text at the cursor', async () => {
    activeView = makeView(5, 5)
    const recorder = makeRecorder()
    const api = makeApiClient({ transcribe: vi.fn().mockResolvedValue({ text: 'hallo welt' }) })
    const controller = new DictationController(recorder)

    await controller.toggle(ctx(api)) // start
    await controller.toggle(ctx(api)) // stop + transcribe

    expect(api.transcribe).toHaveBeenCalledWith('vault-1', expect.any(Blob), {})
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({
      changes: { from: 5, to: 5, insert: 'hallo welt' },
      selection: { anchor: 5 + 'hallo welt'.length },
    }))
    expect(controller.getState().status).toBe('idle')
  })

  it('forwards a concrete language and omits it for auto', async () => {
    const recorder = makeRecorder()
    const api = makeApiClient()
    const controller = new DictationController(recorder)
    await controller.toggle(ctx(api, { language: 'de' }))
    await controller.toggle(ctx(api, { language: 'de' }))
    expect(api.transcribe).toHaveBeenCalledWith('vault-1', expect.any(Blob), { language: 'de' })
  })

  it('saves the audio attachment and appends an embed when saveAudio is on', async () => {
    const recorder = makeRecorder()
    const api = makeApiClient({
      transcribe: vi.fn().mockResolvedValue({ text: 'note' }),
      uploadFiles: vi.fn().mockResolvedValue({ uploaded: [{ fileName: 'dictation-y.webm', path: 'Attachments/dictation-y.webm' }] }),
    })
    const controller = new DictationController(recorder)
    await controller.toggle(ctx(api, { saveAudio: true }))
    await controller.toggle(ctx(api, { saveAudio: true }))

    expect(api.uploadFiles).toHaveBeenCalledWith('vault-1', expect.any(Array), 'Attachments')
    const call = dispatch.mock.calls[0]![0] as { changes: { insert: string } }
    expect(call.changes.insert).toContain('note')
    expect(call.changes.insert).toContain('![[dictation-y.webm]]')
  })

  it('still inserts the transcript if the attachment upload fails', async () => {
    const recorder = makeRecorder()
    const api = makeApiClient({
      transcribe: vi.fn().mockResolvedValue({ text: 'kept' }),
      uploadFiles: vi.fn().mockRejectedValue(new Error('upload failed')),
    })
    const controller = new DictationController(recorder)
    await controller.toggle(ctx(api, { saveAudio: true }))
    await controller.toggle(ctx(api, { saveAudio: true }))

    expect(controller.getState().status).toBe('idle')
    const call = dispatch.mock.calls[0]![0] as { changes: { insert: string } }
    expect(call.changes.insert).toBe('kept')
  })

  it('sets an error when transcription fails and does not insert', async () => {
    const recorder = makeRecorder()
    const api = makeApiClient({ transcribe: vi.fn().mockRejectedValue(new Error('backend 502')) })
    const controller = new DictationController(recorder)
    await controller.toggle(ctx(api))
    await controller.toggle(ctx(api))
    expect(controller.getState().status).toBe('error')
    expect(dispatch).not.toHaveBeenCalled()
  })

  it('does not insert an empty transcript', async () => {
    const recorder = makeRecorder()
    const api = makeApiClient({ transcribe: vi.fn().mockResolvedValue({ text: '' }) })
    const controller = new DictationController(recorder)
    await controller.toggle(ctx(api))
    await controller.toggle(ctx(api))
    expect(dispatch).not.toHaveBeenCalled()
    expect(controller.getState().status).toBe('idle')
  })

  it('notifies subscribers on state changes', async () => {
    const recorder = makeRecorder()
    const controller = new DictationController(recorder)
    const cb = vi.fn()
    const unsub = controller.subscribe(cb)
    await controller.toggle(ctx(makeApiClient()))
    expect(cb).toHaveBeenCalled()
    unsub()
  })

  it('reset() cancels an in-progress recording and returns to idle', async () => {
    const recorder = makeRecorder()
    const controller = new DictationController(recorder)
    await controller.toggle(ctx(makeApiClient()))
    controller.reset()
    expect(recorder.cancel).toHaveBeenCalled()
    expect(controller.getState().status).toBe('idle')
  })
})
