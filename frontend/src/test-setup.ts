import '@testing-library/jest-dom'

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

// Clear sessionStorage and localStorage before each test to prevent auth state leaking between tests
beforeEach(() => {
  sessionStorage.clear()
  localStorage.clear()
})
