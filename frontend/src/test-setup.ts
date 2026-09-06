import '@testing-library/jest-dom'
import 'vitest-axe/extend-expect'

// Set navigator.language to German for consistent test behavior
Object.defineProperty(navigator, 'language', { value: 'de-DE', configurable: true })

// Mock ResizeObserver (not available in jsdom)
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

// Mock EventSource (not available in jsdom)
global.EventSource = class EventSource {
  static readonly CONNECTING = 0
  static readonly OPEN = 1
  static readonly CLOSED = 2
  readonly CONNECTING = 0
  readonly OPEN = 1
  readonly CLOSED = 2
  readyState = 0
  url: string
  withCredentials = false
  onopen: ((ev: Event) => void) | null = null
  onmessage: ((ev: MessageEvent) => void) | null = null
  onerror: ((ev: Event) => void) | null = null
  constructor(url: string | URL) {
    this.url = typeof url === 'string' ? url : url.toString()
  }
  addEventListener() {}
  removeEventListener() {}
  dispatchEvent() { return false }
  close() { this.readyState = 2 }
} as unknown as typeof EventSource

// Mock MediaRecorder (not available in jsdom). Minimal, event-driven stand-in
// for the dictation recorder: start() → on stop() emit one dataavailable chunk
// then a stop event. `getUserMedia` is not mocked globally on purpose — tests
// that need it stub navigator.mediaDevices themselves, so the "unsupported /
// permission denied" paths remain exercisable.
class MockMediaRecorder {
  static isTypeSupported(type: string): boolean {
    return type === 'audio/webm;codecs=opus' || type === 'audio/webm'
  }
  state: 'inactive' | 'recording' | 'paused' = 'inactive'
  mimeType: string
  private listeners: Record<string, Array<(ev: unknown) => void>> = {}
  constructor(_stream: unknown, options?: { mimeType?: string }) {
    this.mimeType = options?.mimeType ?? 'audio/webm'
  }
  addEventListener(type: string, cb: (ev: unknown) => void): void {
    ;(this.listeners[type] ??= []).push(cb)
  }
  removeEventListener(): void {}
  start(): void {
    this.state = 'recording'
  }
  stop(): void {
    this.state = 'inactive'
    const chunk = new Blob([new Uint8Array([1, 2, 3])], { type: this.mimeType })
    for (const cb of this.listeners['dataavailable'] ?? []) cb({ data: chunk })
    for (const cb of this.listeners['stop'] ?? []) cb({})
  }
}
global.MediaRecorder = MockMediaRecorder as unknown as typeof MediaRecorder

// Clear sessionStorage and localStorage before each test to prevent auth state leaking between tests
beforeEach(() => {
  sessionStorage.clear()
  localStorage.clear()
})
