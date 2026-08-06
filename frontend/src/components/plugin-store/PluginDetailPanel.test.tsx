/**
 * Regression tests for PluginDetailPanel's README rendering.
 *
 * markdownToHtml() renders untrusted README content (arbitrary GitHub repos)
 * via dangerouslySetInnerHTML. These tests guard the sanitization of link
 * hrefs, image srcs, and image alt text against XSS payloads.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { PluginDetailPanel } from './PluginDetailPanel'
import type { IApiClient } from '../../api'
import type { PluginStoreDisplayEntry } from './types'

// ─── Test Helpers ─────────────────────────────────────────────────────────────

function createTestPlugin(overrides: Partial<PluginStoreDisplayEntry> = {}): PluginStoreDisplayEntry {
  return {
    id: 'test-plugin',
    name: 'Test Plugin',
    author: 'Test Author',
    description: 'A test plugin description',
    repo: 'owner/test-plugin',
    isInstalled: false,
    hasUpdate: false,
    status: 'available',
    ...overrides,
  }
}

function createTestApiClient(readme: string): IApiClient {
  return {
    getPluginReadme: vi.fn().mockResolvedValue(readme),
  } as unknown as IApiClient
}

/** Renders the panel and waits for the README to finish loading. */
async function renderWithReadme(readme: string) {
  const plugin = createTestPlugin()
  const apiClient = createTestApiClient(readme)

  render(
    <PluginDetailPanel
      plugin={plugin}
      apiClient={apiClient}
      onInstall={vi.fn()}
      onUpdate={vi.fn()}
      onClose={vi.fn()}
    />,
  )

  await waitFor(() => {
    expect(document.body.querySelector('.plugin-detail-panel__readme')).toBeInTheDocument()
  })

  return document.body.querySelector('.plugin-detail-panel__readme') as HTMLElement
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PluginDetailPanel README sanitization', () => {
  describe('malicious links', () => {
    it('neutralizes a javascript: URI link into a harmless href', async () => {
      const readme = '[click me](javascript:alert(document.cookie))'
      const el = await renderWithReadme(readme)

      const link = el.querySelector('a')
      expect(link).not.toBeNull()
      expect(link?.getAttribute('href')).toBe('#')
      expect(link?.textContent).toBe('click me')
    })

    it('neutralizes a case/whitespace-obfuscated javascript: URI', async () => {
      const readme = '[click me](Java\tScript:alert(1))'
      const el = await renderWithReadme(readme)

      const link = el.querySelector('a')
      expect(link?.getAttribute('href')).toBe('#')
    })

    it('does not let a quote in the URL break out of the href attribute', async () => {
      const readme = '[click me]("onmouseover="alert(1))'
      const el = await renderWithReadme(readme)

      // A successful attribute breakout would inject a live onmouseover
      // attribute on the <a>. The escaped quote must keep it as inert text
      // inside href's value instead, so only the 3 expected attributes exist.
      const link = el.querySelector('a')
      expect(link).not.toBeNull()
      expect(link?.getAttribute('onmouseover')).toBeNull()
      expect(link?.attributes.length).toBe(3) // href, target, rel
    })

    it('still renders a normal https link unchanged', async () => {
      const readme = '[docs](https://example.com/docs)'
      const el = await renderWithReadme(readme)

      const link = el.querySelector('a')
      expect(link?.getAttribute('href')).toBe('https://example.com/docs')
      expect(link?.getAttribute('target')).toBe('_blank')
      expect(link?.getAttribute('rel')).toBe('noopener noreferrer')
    })

    it('still renders a mailto link unchanged', async () => {
      const readme = '[mail](mailto:foo@bar.com)'
      const el = await renderWithReadme(readme)

      const link = el.querySelector('a')
      expect(link?.getAttribute('href')).toBe('mailto:foo@bar.com')
    })
  })

  describe('malicious images', () => {
    it('does not let a quote in the image src break out of the attribute', async () => {
      const readme = '![alt]("onerror="alert(1))'
      const el = await renderWithReadme(readme)

      const img = el.querySelector('img')
      expect(img).not.toBeNull()
      expect(img?.getAttribute('onerror')).toBeNull()
      expect(img?.attributes.length).toBe(2) // src, alt
    })

    it('does not let a quote in the alt text break out of the attribute', async () => {
      const readme = '![" onerror="alert(1)](https://example.com/img.png)'
      const el = await renderWithReadme(readme)

      const img = el.querySelector('img')
      expect(img).not.toBeNull()
      expect(img?.getAttribute('onerror')).toBeNull()
      expect(img?.attributes.length).toBe(2) // src, alt
    })

    it('still resolves a relative image path against the GitHub raw base', async () => {
      const readme = '![diagram](./diagram.png)'
      const el = await renderWithReadme(readme)

      const img = el.querySelector('img')
      expect(img?.getAttribute('src')).toBe('https://raw.githubusercontent.com/owner/test-plugin/HEAD/diagram.png')
    })
  })

  it('shows the plugin name regardless of README content (sanity check)', async () => {
    await renderWithReadme('# Hello')
    expect(screen.getByText('Test Plugin')).toBeInTheDocument()
  })
})
