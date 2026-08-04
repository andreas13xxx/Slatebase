/**
 * Unit tests for PluginStoreBrowser component.
 *
 * Tests cover rendering, filtering, install flow, and error states.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import { PluginStoreBrowser } from './PluginStoreBrowser'
import type { IApiClient, CommunityPluginEntry, PluginManifest } from '../../api'

// ─── Test Data ────────────────────────────────────────────────────────────────

const mockPlugins: CommunityPluginEntry[] = [
  { id: 'calendar', name: 'Calendar', author: 'Liam Cain', description: 'Explore daily notes', repo: 'liamcain/obsidian-calendar-plugin' },
  { id: 'dataview', name: 'Dataview', author: 'Michael Brenan', description: 'Complex data views', repo: 'blacksmithgu/obsidian-dataview' },
]

const mockInstalledPlugins: PluginManifest[] = [
  { id: 'dataview', name: 'Dataview', version: '0.5.64' },
]

// ─── Mock Factory ─────────────────────────────────────────────────────────────

function createMockApiClient(overrides: Partial<IApiClient> = {}): IApiClient {
  return {
    getStorePlugins: vi.fn().mockResolvedValue({ plugins: mockPlugins, cachedAt: '2026-01-01T00:00:00Z', total: 2 }),
    listPlugins: vi.fn().mockResolvedValue({ plugins: [] }),
    checkPluginUpdates: vi.fn().mockResolvedValue({ plugins: [], checkedAt: '2026-01-01T00:00:00Z', errors: [] }),
    installFromStore: vi.fn().mockResolvedValue({ pluginId: 'calendar', manifest: { id: 'calendar', name: 'Calendar', version: '1.5.1' }, isUpgrade: false }),
    updatePlugin: vi.fn(),
    updateAllPlugins: vi.fn(),
    // Satisfy IApiClient shape
    setToken: vi.fn(),
    getToken: vi.fn(),
    setCsrfToken: vi.fn(),
    getCsrfToken: vi.fn(),
    setOnSessionExpired: vi.fn(),
    checkSessionAlive: vi.fn().mockResolvedValue(true),
    ...overrides,
  } as unknown as IApiClient
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PluginStoreBrowser', () => {
  const vaultId = 'test-vault-id'

  beforeEach(() => {
    vi.clearAllMocks()
  })

  // ─── Rendering ──────────────────────────────────────────────────────────────

  describe('Rendering', () => {
    it('shows loading state initially', () => {
      const api = createMockApiClient({
        getStorePlugins: vi.fn().mockReturnValue(new Promise(() => {})), // never resolves
        listPlugins: vi.fn().mockReturnValue(new Promise(() => {})),
      })

      render(<PluginStoreBrowser vaultId={vaultId} apiClient={api} />)

      expect(screen.getByText('Plugins werden geladen…')).toBeInTheDocument()
    })

    it('renders plugin list after successful load', async () => {
      const api = createMockApiClient()

      render(<PluginStoreBrowser vaultId={vaultId} apiClient={api} />)

      await waitFor(() => {
        expect(screen.getByText('Calendar')).toBeInTheDocument()
      })
      expect(screen.getByText('Dataview')).toBeInTheDocument()
    })

    it('shows search input and filter checkboxes', async () => {
      const api = createMockApiClient()

      render(<PluginStoreBrowser vaultId={vaultId} apiClient={api} />)

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Plugin suchen…')).toBeInTheDocument()
      })
      expect(screen.getByLabelText(/Kompatibel/)).toBeInTheDocument()
      expect(screen.getByLabelText(/Nicht installiert/)).toBeInTheDocument()
    })

    it('shows update banner when updates are available', async () => {
      const api = createMockApiClient({
        listPlugins: vi.fn().mockResolvedValue({ plugins: mockInstalledPlugins }),
        checkPluginUpdates: vi.fn().mockResolvedValue({
          plugins: [
            { pluginId: 'dataview', installedVersion: '0.5.64', latestVersion: '0.5.67', hasUpdate: true, releaseUrl: 'https://github.com/blacksmithgu/obsidian-dataview/releases/tag/0.5.67', repo: 'blacksmithgu/obsidian-dataview' },
          ],
          checkedAt: '2026-01-01T00:00:00Z',
          errors: [],
        }),
      })

      render(<PluginStoreBrowser vaultId={vaultId} apiClient={api} />)

      await waitFor(() => {
        expect(screen.getByText(/1 Updates verfügbar/)).toBeInTheDocument()
      })
    })
  })

  // ─── Filtering ──────────────────────────────────────────────────────────────

  describe('Filtering', () => {
    it('filters plugins by search query (name)', async () => {
      const api = createMockApiClient()

      render(<PluginStoreBrowser vaultId={vaultId} apiClient={api} />)

      await waitFor(() => {
        expect(screen.getByText('Calendar')).toBeInTheDocument()
      })

      const searchInput = screen.getByPlaceholderText('Plugin suchen…')
      fireEvent.change(searchInput, { target: { value: 'Calendar' } })

      await waitFor(() => {
        expect(screen.getByText('Calendar')).toBeInTheDocument()
        expect(screen.queryByText('Dataview')).not.toBeInTheDocument()
      })
    })

    it('filters plugins by search query (author)', async () => {
      const api = createMockApiClient()

      render(<PluginStoreBrowser vaultId={vaultId} apiClient={api} />)

      await waitFor(() => {
        expect(screen.getByText('Calendar')).toBeInTheDocument()
      })

      const searchInput = screen.getByPlaceholderText('Plugin suchen…')
      fireEvent.change(searchInput, { target: { value: 'Liam' } })

      await waitFor(() => {
        expect(screen.getByText('Calendar')).toBeInTheDocument()
        expect(screen.queryByText('Dataview')).not.toBeInTheDocument()
      })
    })

    it('filters plugins by search query (description)', async () => {
      const api = createMockApiClient()

      render(<PluginStoreBrowser vaultId={vaultId} apiClient={api} />)

      await waitFor(() => {
        expect(screen.getByText('Calendar')).toBeInTheDocument()
      })

      const searchInput = screen.getByPlaceholderText('Plugin suchen…')
      fireEvent.change(searchInput, { target: { value: 'Complex data' } })

      await waitFor(() => {
        expect(screen.queryByText('Calendar')).not.toBeInTheDocument()
        expect(screen.getByText('Dataview')).toBeInTheDocument()
      })
    })

    it('"Not installed" filter hides installed plugins', async () => {
      const api = createMockApiClient({
        listPlugins: vi.fn().mockResolvedValue({ plugins: mockInstalledPlugins }),
      })

      render(<PluginStoreBrowser vaultId={vaultId} apiClient={api} />)

      await waitFor(() => {
        expect(screen.getByText('Calendar')).toBeInTheDocument()
        expect(screen.getByText('Dataview')).toBeInTheDocument()
      })

      const notInstalledCheckbox = screen.getByLabelText(/Nicht installiert/)
      fireEvent.click(notInstalledCheckbox)

      await waitFor(() => {
        expect(screen.getByText('Calendar')).toBeInTheDocument()
        expect(screen.queryByText('Dataview')).not.toBeInTheDocument()
      })
    })

    it('shows empty state when no plugins match filters', async () => {
      const api = createMockApiClient()

      render(<PluginStoreBrowser vaultId={vaultId} apiClient={api} />)

      await waitFor(() => {
        expect(screen.getByText('Calendar')).toBeInTheDocument()
      })

      const searchInput = screen.getByPlaceholderText('Plugin suchen…')
      fireEvent.change(searchInput, { target: { value: 'nonexistentpluginxyz' } })

      await waitFor(() => {
        expect(screen.getByText('Keine Plugins gefunden')).toBeInTheDocument()
        expect(screen.getByText('Filter zurücksetzen')).toBeInTheDocument()
      })
    })

    it('shows result counter with correct counts', async () => {
      const api = createMockApiClient()

      render(<PluginStoreBrowser vaultId={vaultId} apiClient={api} />)

      await waitFor(() => {
        expect(screen.getByText('2 von 2 Plugins')).toBeInTheDocument()
      })

      const searchInput = screen.getByPlaceholderText('Plugin suchen…')
      fireEvent.change(searchInput, { target: { value: 'Calendar' } })

      await waitFor(() => {
        expect(screen.getByText('1 von 2 Plugins')).toBeInTheDocument()
      })
    })
  })

  // ─── Install Flow ───────────────────────────────────────────────────────────

  describe('Install Flow', () => {
    it('shows install button for available plugins', async () => {
      const api = createMockApiClient()

      render(<PluginStoreBrowser vaultId={vaultId} apiClient={api} />)

      await waitFor(() => {
        expect(screen.getByText('Calendar')).toBeInTheDocument()
      })

      const installButtons = screen.getAllByText('Installieren')
      expect(installButtons.length).toBeGreaterThanOrEqual(1)
    })

    it('disables button and shows spinner during installation', async () => {
      const installPromise = new Promise<{ pluginId: string; manifest: PluginManifest; isUpgrade: boolean }>(() => {})
      const api = createMockApiClient({
        installFromStore: vi.fn().mockReturnValue(installPromise),
      })

      render(<PluginStoreBrowser vaultId={vaultId} apiClient={api} />)

      await waitFor(() => {
        expect(screen.getByText('Calendar')).toBeInTheDocument()
      })

      const installButtons = screen.getAllByText('Installieren')
      fireEvent.click(installButtons[0]!)

      await waitFor(() => {
        // The button for the installing plugin should be disabled
        const calendarCard = screen.getByText('Calendar').closest('.plugin-store-card')
        const button = calendarCard?.querySelector('button')
        expect(button).toBeDisabled()
      })
    })

    it('marks plugin as installed after successful install', async () => {
      const api = createMockApiClient({
        installFromStore: vi.fn().mockResolvedValue({
          pluginId: 'calendar',
          manifest: { id: 'calendar', name: 'Calendar', version: '1.5.1' },
          isUpgrade: false,
        }),
      })

      render(<PluginStoreBrowser vaultId={vaultId} apiClient={api} />)

      await waitFor(() => {
        expect(screen.getByText('Calendar')).toBeInTheDocument()
      })

      const installButtons = screen.getAllByText('Installieren')
      fireEvent.click(installButtons[0]!)

      await waitFor(() => {
        expect(screen.getByText('Installiert')).toBeInTheDocument()
      })
    })
  })

  // ─── Error States ───────────────────────────────────────────────────────────

  describe('Error States', () => {
    it('shows error message when initial load fails', async () => {
      const api = createMockApiClient({
        getStorePlugins: vi.fn().mockRejectedValue({ code: 'UPSTREAM_ERROR', message: 'GitHub unavailable' }),
        listPlugins: vi.fn().mockRejectedValue({ code: 'UPSTREAM_ERROR', message: 'GitHub unavailable' }),
      })

      render(<PluginStoreBrowser vaultId={vaultId} apiClient={api} />)

      await waitFor(() => {
        expect(screen.getByText('GitHub unavailable')).toBeInTheDocument()
      })
    })

    it('shows retry button on load error', async () => {
      const api = createMockApiClient({
        getStorePlugins: vi.fn().mockRejectedValue({ code: 'UPSTREAM_ERROR', message: 'GitHub unavailable' }),
        listPlugins: vi.fn().mockRejectedValue({ code: 'UPSTREAM_ERROR', message: 'GitHub unavailable' }),
      })

      render(<PluginStoreBrowser vaultId={vaultId} apiClient={api} />)

      await waitFor(() => {
        expect(screen.getByText('Erneut versuchen')).toBeInTheDocument()
      })
    })

    it('shows per-plugin error on failed install', async () => {
      const api = createMockApiClient({
        installFromStore: vi.fn().mockRejectedValue({ code: 'INSTALL_FAILED', message: 'Download failed' }),
      })

      render(<PluginStoreBrowser vaultId={vaultId} apiClient={api} />)

      await waitFor(() => {
        expect(screen.getByText('Calendar')).toBeInTheDocument()
      })

      const installButtons = screen.getAllByText('Installieren')
      fireEvent.click(installButtons[0]!)

      await waitFor(() => {
        expect(screen.getByText('Download failed')).toBeInTheDocument()
      })
    })
  })
})
