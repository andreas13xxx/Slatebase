import { vi, describe, it, expect, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act } from '@testing-library/react'

// Mock the mermaid module at the vi.mock level (hoisted)
const mockInitialize = vi.fn()
const mockRender = vi.fn()

vi.mock('mermaid', () => ({
  default: {
    initialize: mockInitialize,
    render: mockRender,
  },
}))

import {
  MermaidRenderer,
  generateDiagramId,
  getEffectiveTheme,
  getMermaidTheme,
} from './MermaidRenderer'

// Mock window.matchMedia (not available in jsdom)
function setupMatchMedia(prefersDark: boolean = false) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: prefersDark,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

describe('MermaidRenderer', () => {
  beforeEach(() => {
    mockInitialize.mockClear()
    mockRender.mockClear()
    setupMatchMedia(false)
    document.documentElement.setAttribute('data-theme', 'light')
  })

  afterEach(() => {
    document.documentElement.removeAttribute('data-theme')
  })

  it('shows loading text initially', () => {
    // Use a never-resolving render mock so the component stays in loading state
    mockRender.mockReturnValue(new Promise(() => {}))

    render(<MermaidRenderer code="graph TD; A-->B" diagramKey="loading-test" />)

    expect(screen.getByText('Diagramm wird geladen…')).toBeInTheDocument()
  })

  it('renders SVG inline after successful mermaid.render', async () => {
    const svgContent = '<svg><text>Hello</text></svg>'
    mockRender.mockResolvedValue({ svg: svgContent })

    render(<MermaidRenderer code="graph TD; A-->B" diagramKey="success-test" />)

    await waitFor(() => {
      const container = document.querySelector('.view-mode-mermaid:not(.mermaid-loading)')
      expect(container).toBeInTheDocument()
      // jsdom may normalize HTML; check that SVG content is rendered inline
      expect(container?.querySelector('svg')).toBeInTheDocument()
      expect(container?.querySelector('text')).toBeInTheDocument()
    })

    // Verify no <img> tag is used (Requirement 2.3: inline, not img)
    expect(document.querySelector('img')).not.toBeInTheDocument()
  })

  it('shows error message and raw source when mermaid.render throws', async () => {
    const errorMessage = 'Parse error on line 2'
    mockRender.mockRejectedValue(new Error(errorMessage))

    const code = 'invalid mermaid syntax'

    render(<MermaidRenderer code={code} diagramKey="error-test" />)

    await waitFor(() => {
      expect(screen.getByText(errorMessage)).toBeInTheDocument()
    })

    // Check error container class
    const errorContainer = document.querySelector('.mermaid-error')
    expect(errorContainer).toBeInTheDocument()

    // Check raw source is displayed in pre>code
    const codeElement = errorContainer?.querySelector('pre code')
    expect(codeElement?.textContent).toBe(code)
  })

  it('passes code string unmodified to mermaid.render (directive pass-through)', async () => {
    const codeWithDirectives = `%%{init: {'theme': 'forest'}}%%\ngraph TD\n    A-->B`
    mockRender.mockResolvedValue({ svg: '<svg></svg>' })

    render(<MermaidRenderer code={codeWithDirectives} diagramKey="directive-test" />)

    await waitFor(() => {
      expect(mockRender).toHaveBeenCalled()
    })

    // Verify the code was passed unmodified (second argument to mermaid.render)
    const lastCall = mockRender.mock.calls.find((call) => call[1] === codeWithDirectives)
    expect(lastCall).toBeDefined()
    expect(lastCall?.[1]).toBe(codeWithDirectives)
  })
})

describe('MermaidRenderer timeout', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mockInitialize.mockClear()
    mockRender.mockClear()
    setupMatchMedia(false)
    document.documentElement.setAttribute('data-theme', 'light')
  })

  afterEach(() => {
    vi.useRealTimers()
    document.documentElement.removeAttribute('data-theme')
  })

  it('shows timeout message when render takes longer than 5 seconds', async () => {
    // Mock render that never resolves (simulates hanging render)
    mockRender.mockImplementation(() => new Promise(() => {}))

    const code = 'graph TD; A-->B-->C-->D'

    let _container: ReturnType<typeof render> | undefined

    await act(async () => {
      _container = render(<MermaidRenderer code={code} diagramKey="timeout-test" />)
    })

    // At this point loadMermaid has resolved (microtask) and setTimeout(5000) is pending.
    // Advance fake timers past the 5-second timeout.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5100)
    })

    // Now check the DOM directly (no waitFor needed since state already updated in act)
    expect(screen.getByText('Diagramm-Rendering abgebrochen (Timeout)')).toBeInTheDocument()

    // Check raw source is displayed in timeout fallback
    const errorContainer = document.querySelector('.mermaid-error')
    expect(errorContainer).toBeInTheDocument()
    const codeElement = errorContainer?.querySelector('pre code')
    expect(codeElement?.textContent).toBe(code)
  }, 15000)
})

describe('MermaidRenderer load failure', () => {
  beforeEach(() => {
    setupMatchMedia(false)
    document.documentElement.setAttribute('data-theme', 'light')
  })

  afterEach(() => {
    document.documentElement.removeAttribute('data-theme')
  })

  it('shows plain code block fallback when mermaid library fails to load', async () => {
    // Reset all modules to clear the cached mermaidPromise
    vi.resetModules()

    // Mock mermaid to throw on import (simulates network failure)
    vi.doMock('mermaid', () => {
      throw new Error('Module not found')
    })

    // Re-import the component (gets a fresh module with cleared mermaidPromise)
    const mod = await import('./MermaidRenderer')
    const FailingMermaidRenderer = mod.MermaidRenderer

    const code = 'graph TD; A-->B'

    render(<FailingMermaidRenderer code={code} diagramKey="load-fail-test" />)

    await waitFor(() => {
      const codeBlock = document.querySelector('pre.view-mode-code code')
      expect(codeBlock).toBeInTheDocument()
      expect(codeBlock?.textContent).toBe(code)
    })
  })
})

describe('generateDiagramId', () => {
  it('returns unique IDs on multiple calls', () => {
    const ids = new Set<string>()
    for (let i = 0; i < 100; i++) {
      ids.add(generateDiagramId())
    }
    // All 100 calls should produce distinct values
    expect(ids.size).toBe(100)
  })

  it('returns strings with the expected prefix', () => {
    const id = generateDiagramId()
    expect(id).toMatch(/^mermaid-diagram-\d+$/)
  })
})

describe('getEffectiveTheme', () => {
  afterEach(() => {
    document.documentElement.removeAttribute('data-theme')
  })

  it('returns "dark" when data-theme is "dark"', () => {
    setupMatchMedia(false)
    document.documentElement.setAttribute('data-theme', 'dark')
    expect(getEffectiveTheme()).toBe('dark')
  })

  it('returns "light" when data-theme is "light"', () => {
    setupMatchMedia(false)
    document.documentElement.setAttribute('data-theme', 'light')
    expect(getEffectiveTheme()).toBe('light')
  })

  it('falls back to "light" when data-theme is not set and system prefers light', () => {
    document.documentElement.removeAttribute('data-theme')
    setupMatchMedia(false)
    expect(getEffectiveTheme()).toBe('light')
  })

  it('falls back to "dark" when data-theme is not set and system prefers dark', () => {
    document.documentElement.removeAttribute('data-theme')
    setupMatchMedia(true)
    expect(getEffectiveTheme()).toBe('dark')
  })
})

describe('getMermaidTheme', () => {
  it('maps "light" to "default"', () => {
    expect(getMermaidTheme('light')).toBe('default')
  })

  it('maps "dark" to "dark"', () => {
    expect(getMermaidTheme('dark')).toBe('dark')
  })
})
