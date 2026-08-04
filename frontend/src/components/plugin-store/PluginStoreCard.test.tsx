/**
 * Unit tests for PluginStoreCard component.
 *
 * Tests cover all status variants: available, installed, update available,
 * desktop-only, installing, and error display.
 */
import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { PluginStoreCard } from './PluginStoreCard'
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

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PluginStoreCard', () => {
  const onInstall = vi.fn()
  const onUpdate = vi.fn()

  // ─── Available (not installed) ────────────────────────────────────────────

  describe('Available (not installed)', () => {
    it('shows plugin name, author, and description', () => {
      const plugin = createTestPlugin()

      render(<PluginStoreCard plugin={plugin} onInstall={onInstall} onUpdate={onUpdate} />)

      expect(screen.getByText('Test Plugin')).toBeInTheDocument()
      expect(screen.getByText('Test Author')).toBeInTheDocument()
      expect(screen.getByText('A test plugin description')).toBeInTheDocument()
    })

    it('shows "Installieren" button', () => {
      const plugin = createTestPlugin()

      render(<PluginStoreCard plugin={plugin} onInstall={onInstall} onUpdate={onUpdate} />)

      expect(screen.getByText('Installieren')).toBeInTheDocument()
    })

    it('calls onInstall with correct args when button clicked', () => {
      const plugin = createTestPlugin({ id: 'calendar', repo: 'liamcain/obsidian-calendar-plugin' })

      render(<PluginStoreCard plugin={plugin} onInstall={onInstall} onUpdate={onUpdate} />)

      fireEvent.click(screen.getByText('Installieren'))

      expect(onInstall).toHaveBeenCalledWith('calendar', 'liamcain/obsidian-calendar-plugin')
    })
  })

  // ─── Installed (no update) ────────────────────────────────────────────────

  describe('Installed (no update)', () => {
    it('shows "Installiert" badge with check icon', () => {
      const plugin = createTestPlugin({
        isInstalled: true,
        hasUpdate: false,
        status: 'installed',
        installedVersion: '1.0.0',
      })

      render(<PluginStoreCard plugin={plugin} onInstall={onInstall} onUpdate={onUpdate} />)

      expect(screen.getByText('Installiert')).toBeInTheDocument()
    })

    it('shows installed version', () => {
      const plugin = createTestPlugin({
        isInstalled: true,
        hasUpdate: false,
        status: 'installed',
        installedVersion: '1.0.0',
      })

      render(<PluginStoreCard plugin={plugin} onInstall={onInstall} onUpdate={onUpdate} />)

      expect(screen.getByText('v1.0.0')).toBeInTheDocument()
    })

    it('does NOT show install or update button', () => {
      const plugin = createTestPlugin({
        isInstalled: true,
        hasUpdate: false,
        status: 'installed',
        installedVersion: '1.0.0',
      })

      render(<PluginStoreCard plugin={plugin} onInstall={onInstall} onUpdate={onUpdate} />)

      expect(screen.queryByText('Installieren')).not.toBeInTheDocument()
      expect(screen.queryByText('Aktualisieren')).not.toBeInTheDocument()
    })
  })

  // ─── Update available ─────────────────────────────────────────────────────

  describe('Update available', () => {
    it('shows "Update verfügbar" badge', () => {
      const plugin = createTestPlugin({
        isInstalled: true,
        hasUpdate: true,
        status: 'update-available',
        installedVersion: '1.0.0',
        latestVersion: '1.1.0',
        releaseUrl: 'https://github.com/owner/test-plugin/releases/tag/1.1.0',
      })

      render(<PluginStoreCard plugin={plugin} onInstall={onInstall} onUpdate={onUpdate} />)

      expect(screen.getByText('Update verfügbar')).toBeInTheDocument()
    })

    it('shows version diff ("v1.0.0 → v1.1.0")', () => {
      const plugin = createTestPlugin({
        isInstalled: true,
        hasUpdate: true,
        status: 'update-available',
        installedVersion: '1.0.0',
        latestVersion: '1.1.0',
        releaseUrl: 'https://github.com/owner/test-plugin/releases/tag/1.1.0',
      })

      render(<PluginStoreCard plugin={plugin} onInstall={onInstall} onUpdate={onUpdate} />)

      expect(screen.getByText('v1.0.0 → v1.1.0')).toBeInTheDocument()
    })

    it('shows "Aktualisieren" button', () => {
      const plugin = createTestPlugin({
        isInstalled: true,
        hasUpdate: true,
        status: 'update-available',
        installedVersion: '1.0.0',
        latestVersion: '1.1.0',
        releaseUrl: 'https://github.com/owner/test-plugin/releases/tag/1.1.0',
      })

      render(<PluginStoreCard plugin={plugin} onInstall={onInstall} onUpdate={onUpdate} />)

      expect(screen.getByText('Aktualisieren')).toBeInTheDocument()
    })

    it('shows release notes link', () => {
      const plugin = createTestPlugin({
        isInstalled: true,
        hasUpdate: true,
        status: 'update-available',
        installedVersion: '1.0.0',
        latestVersion: '1.1.0',
        releaseUrl: 'https://github.com/owner/test-plugin/releases/tag/1.1.0',
      })

      render(<PluginStoreCard plugin={plugin} onInstall={onInstall} onUpdate={onUpdate} />)

      expect(screen.getByText('Release Notes')).toBeInTheDocument()
    })

    it('calls onUpdate when button clicked', () => {
      const plugin = createTestPlugin({
        id: 'my-plugin',
        isInstalled: true,
        hasUpdate: true,
        status: 'update-available',
        installedVersion: '1.0.0',
        latestVersion: '1.1.0',
        releaseUrl: 'https://github.com/owner/test-plugin/releases/tag/1.1.0',
      })

      render(<PluginStoreCard plugin={plugin} onInstall={onInstall} onUpdate={onUpdate} />)

      fireEvent.click(screen.getByText('Aktualisieren'))

      expect(onUpdate).toHaveBeenCalledWith('my-plugin')
    })
  })

  // ─── Desktop-only ─────────────────────────────────────────────────────────

  describe('Desktop-only', () => {
    it('has grayed-out class (plugin-store-card--desktop-only)', () => {
      const plugin = createTestPlugin({ status: 'desktop-only' })

      const { container } = render(
        <PluginStoreCard plugin={plugin} onInstall={onInstall} onUpdate={onUpdate} />,
      )

      expect(container.querySelector('.plugin-store-card--desktop-only')).toBeInTheDocument()
    })

    it('shows "Nur Desktop" badge', () => {
      const plugin = createTestPlugin({ status: 'desktop-only' })

      render(<PluginStoreCard plugin={plugin} onInstall={onInstall} onUpdate={onUpdate} />)

      expect(screen.getByText('Nur Desktop')).toBeInTheDocument()
    })

    it('install button is disabled', () => {
      const plugin = createTestPlugin({ status: 'desktop-only' })

      render(<PluginStoreCard plugin={plugin} onInstall={onInstall} onUpdate={onUpdate} />)

      const button = screen.getByText('Installieren')
      expect(button).toBeDisabled()
    })
  })

  // ─── Installing ───────────────────────────────────────────────────────────

  describe('Installing', () => {
    it('button is disabled', () => {
      const plugin = createTestPlugin({ status: 'installing' })

      render(<PluginStoreCard plugin={plugin} onInstall={onInstall} onUpdate={onUpdate} />)

      const button = screen.getByText('Installieren')
      expect(button).toBeDisabled()
    })

    it('shows spinner (Loader2)', () => {
      const plugin = createTestPlugin({ status: 'installing' })

      const { container } = render(
        <PluginStoreCard plugin={plugin} onInstall={onInstall} onUpdate={onUpdate} />,
      )

      expect(container.querySelector('.spin')).toBeInTheDocument()
    })

    it('has plugin-store-card--installing class', () => {
      const plugin = createTestPlugin({ status: 'installing' })

      const { container } = render(
        <PluginStoreCard plugin={plugin} onInstall={onInstall} onUpdate={onUpdate} />,
      )

      expect(container.querySelector('.plugin-store-card--installing')).toBeInTheDocument()
    })
  })

  // ─── Error ────────────────────────────────────────────────────────────────

  describe('Error', () => {
    it('shows error message text in the card', () => {
      const plugin = createTestPlugin({ error: 'Download fehlgeschlagen' })

      render(<PluginStoreCard plugin={plugin} onInstall={onInstall} onUpdate={onUpdate} />)

      expect(screen.getByText('Download fehlgeschlagen')).toBeInTheDocument()
    })
  })
})
