import '@testing-library/jest-dom'

// Set navigator.language to German for consistent test behavior
Object.defineProperty(navigator, 'language', { value: 'de-DE', configurable: true })

// Clear sessionStorage before each test to prevent auth state leaking between tests
beforeEach(() => {
  sessionStorage.clear()
})
