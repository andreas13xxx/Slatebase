import '@testing-library/jest-dom'

// Set navigator.language to German for consistent test behavior
Object.defineProperty(navigator, 'language', { value: 'de-DE', configurable: true })

// Mock ResizeObserver (not available in jsdom)
global.ResizeObserver = class ResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
} as unknown as typeof ResizeObserver

// Clear sessionStorage before each test to prevent auth state leaking between tests
beforeEach(() => {
  sessionStorage.clear()
})
