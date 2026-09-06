import { describe, it, expect, vi, afterEach } from 'vitest'
import { DictationRecorder, DictationRecorderError, pickSupportedMimeType } from './dictation-recorder'

function stubMediaDevices(getUserMedia: () => Promise<MediaStream>): void {
  const stream = { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream
  void stream
  Object.defineProperty(globalThis.navigator, 'mediaDevices', {
    value: { getUserMedia },
    configurable: true,
  })
}

function fakeStream(): MediaStream {
  return { getTracks: () => [{ stop: vi.fn() }] } as unknown as MediaStream
}

describe('pickSupportedMimeType', () => {
  it('returns the first supported preferred type', () => {
    expect(pickSupportedMimeType()).toBe('audio/webm;codecs=opus')
  })
})

describe('DictationRecorder', () => {
  afterEach(() => {
    // Remove any per-test mediaDevices stub.
    Reflect.deleteProperty(globalThis.navigator as object, 'mediaDevices')
  })

  it('records and returns a blob with a content type', async () => {
    stubMediaDevices(async () => fakeStream())
    const recorder = new DictationRecorder()

    await recorder.start()
    expect(recorder.isRecording()).toBe(true)

    const result = await recorder.stop()
    expect(result.blob).toBeInstanceOf(Blob)
    expect(result.blob.size).toBeGreaterThan(0)
    expect(result.contentType).toContain('audio/webm')
    expect(recorder.isRecording()).toBe(false)
  })

  it('throws a permission-denied error when getUserMedia is rejected with NotAllowedError', async () => {
    stubMediaDevices(async () => {
      throw Object.assign(new Error('denied'), { name: 'NotAllowedError' })
    })
    const recorder = new DictationRecorder()

    await expect(recorder.start()).rejects.toMatchObject({
      name: 'DictationRecorderError',
      reason: 'permission-denied',
    })
    expect(recorder.isRecording()).toBe(false)
  })

  it('throws a generic failure for an unexpected getUserMedia error', async () => {
    stubMediaDevices(async () => {
      throw Object.assign(new Error('device busy'), { name: 'NotReadableError' })
    })
    const recorder = new DictationRecorder()
    await expect(recorder.start()).rejects.toMatchObject({ reason: 'failed' })
  })

  it('throws unsupported when mediaDevices is unavailable in a secure context', async () => {
    Reflect.deleteProperty(globalThis.navigator as object, 'mediaDevices')
    Object.defineProperty(globalThis, 'isSecureContext', { value: true, configurable: true })
    const recorder = new DictationRecorder()
    await expect(recorder.start()).rejects.toMatchObject({ reason: 'unsupported' })
  })

  it('throws insecure-context when not in a secure context', async () => {
    Reflect.deleteProperty(globalThis.navigator as object, 'mediaDevices')
    Object.defineProperty(globalThis, 'isSecureContext', { value: false, configurable: true })
    const recorder = new DictationRecorder()
    await expect(recorder.start()).rejects.toMatchObject({ reason: 'insecure-context' })
    Object.defineProperty(globalThis, 'isSecureContext', { value: true, configurable: true })
  })

  it('stop() without an active recording throws', async () => {
    const recorder = new DictationRecorder()
    await expect(recorder.stop()).rejects.toBeInstanceOf(DictationRecorderError)
  })

  it('start() is idempotent while already recording', async () => {
    const getUserMedia = vi.fn(async () => fakeStream())
    stubMediaDevices(getUserMedia)
    const recorder = new DictationRecorder()
    await recorder.start()
    await recorder.start()
    expect(getUserMedia).toHaveBeenCalledOnce()
    recorder.cancel()
  })

  it('cancel() stops recording and releases the stream', async () => {
    const stop = vi.fn()
    Object.defineProperty(globalThis.navigator, 'mediaDevices', {
      value: { getUserMedia: async () => ({ getTracks: () => [{ stop }] }) as unknown as MediaStream },
      configurable: true,
    })
    const recorder = new DictationRecorder()
    await recorder.start()
    recorder.cancel()
    expect(recorder.isRecording()).toBe(false)
    expect(stop).toHaveBeenCalled()
  })
})
