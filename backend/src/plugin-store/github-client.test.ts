import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest'
import { GitHubClient } from './github-client.js'
import type { IPluginStoreConfig } from './types.js'
import type { ILogger } from '../logger/index.js'
import { GitHubRateLimitError, GitHubFetchError, AssetTooLargeError } from './errors.js'

// ─── Test Helpers ────────────────────────────────────────────────────────────

function createMockLogger(): ILogger {
  return {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }
}

function createMockConfig(overrides?: Partial<IPluginStoreConfig>): IPluginStoreConfig {
  return {
    cacheTtlPluginList: 3600000,
    cacheTtlManifest: 900000,
    maxAssetSize: 10 * 1024 * 1024,
    maxTotalDownloadSize: 15 * 1024 * 1024,
    autoCheckInterval: 86400000,
    ...overrides,
  }
}

function createMockResponse(body: unknown, options?: {
  status?: number
  headers?: Record<string, string>
}): Response {
  const status = options?.status ?? 200
  const headers = new Headers(options?.headers ?? {})
  const bodyStr = typeof body === 'string' ? body : JSON.stringify(body)
  return new Response(bodyStr, { status, headers })
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('GitHubClient', () => {
  let logger: ILogger
  let config: IPluginStoreConfig
  let client: GitHubClient

  beforeEach(() => {
    logger = createMockLogger()
    config = createMockConfig()
    client = new GitHubClient(config, logger)
    vi.stubGlobal('fetch', vi.fn())
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  describe('fetchCommunityPlugins', () => {
    it('returns parsed plugin list', async () => {
      const plugins = [
        { id: 'calendar', name: 'Calendar', author: 'Liam', description: 'Calendar view', repo: 'liamcain/obsidian-calendar-plugin' },
        { id: 'dataview', name: 'Dataview', author: 'Michael', description: 'Data queries', repo: 'blacksmithgu/obsidian-dataview' },
      ]

      vi.mocked(fetch).mockResolvedValueOnce(createMockResponse(plugins, {
        headers: { 'X-RateLimit-Remaining': '59' },
      }))

      const result = await client.fetchCommunityPlugins()
      expect(result).toEqual(plugins)
      expect(result).toHaveLength(2)
    })

    it('throws GitHubFetchError for non-array response', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(createMockResponse({ error: 'not found' }, {
        headers: { 'X-RateLimit-Remaining': '59' },
      }))

      await expect(client.fetchCommunityPlugins()).rejects.toThrow(GitHubFetchError)
    })

    it('includes Authorization header when token is configured', async () => {
      config = createMockConfig({ githubToken: 'ghp_test123' })
      client = new GitHubClient(config, logger)

      vi.mocked(fetch).mockResolvedValueOnce(createMockResponse([], {
        headers: { 'X-RateLimit-Remaining': '4999' },
      }))

      await client.fetchCommunityPlugins()

      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Authorization': 'Bearer ghp_test123',
          }),
        }),
      )
    })

    it('does not include Authorization header when no token', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(createMockResponse([], {
        headers: { 'X-RateLimit-Remaining': '59' },
      }))

      await client.fetchCommunityPlugins()

      const callHeaders = vi.mocked(fetch).mock.calls[0]?.[1]?.headers as Record<string, string>
      expect(callHeaders['Authorization']).toBeUndefined()
    })
  })

  describe('fetchManifest', () => {
    it('fetches manifest from correct URL', async () => {
      const manifest = { id: 'calendar', name: 'Calendar', version: '1.5.1' }

      vi.mocked(fetch).mockResolvedValueOnce(createMockResponse(manifest, {
        headers: { 'X-RateLimit-Remaining': '58' },
      }))

      const result = await client.fetchManifest('liamcain/obsidian-calendar-plugin')

      expect(result).toEqual(manifest)
      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        'https://raw.githubusercontent.com/liamcain/obsidian-calendar-plugin/HEAD/manifest.json',
        expect.any(Object),
      )
    })

    it('throws GitHubFetchError for 404', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(createMockResponse('Not Found', {
        status: 404,
        headers: { 'X-RateLimit-Remaining': '58' },
      }))

      await expect(client.fetchManifest('nonexistent/repo')).rejects.toThrow(GitHubFetchError)
    })
  })

  describe('downloadReleaseAssets', () => {
    const releaseData = {
      tag_name: '1.5.1',
      html_url: 'https://github.com/liamcain/obsidian-calendar-plugin/releases/tag/1.5.1',
      assets: [
        { name: 'main.js', browser_download_url: 'https://github.com/liamcain/obsidian-calendar-plugin/releases/download/1.5.1/main.js', size: 5000 },
        { name: 'manifest.json', browser_download_url: 'https://github.com/liamcain/obsidian-calendar-plugin/releases/download/1.5.1/manifest.json', size: 200 },
        { name: 'styles.css', browser_download_url: 'https://github.com/liamcain/obsidian-calendar-plugin/releases/download/1.5.1/styles.css', size: 1000 },
      ],
    }

    it('downloads all three assets (main.js, manifest.json, styles.css)', async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(createMockResponse(releaseData, {
          headers: { 'X-RateLimit-Remaining': '55' },
        }))
        .mockResolvedValueOnce(createMockResponse('console.log("bundle")', {
          headers: { 'X-RateLimit-Remaining': '54' },
        }))
        .mockResolvedValueOnce(createMockResponse('{"id":"calendar"}', {
          headers: { 'X-RateLimit-Remaining': '53' },
        }))
        .mockResolvedValueOnce(createMockResponse('.calendar { color: red; }', {
          headers: { 'X-RateLimit-Remaining': '52' },
        }))

      const result = await client.downloadReleaseAssets('liamcain/obsidian-calendar-plugin')

      expect(result.bundle).toBeInstanceOf(Buffer)
      expect(result.manifest).toBeInstanceOf(Buffer)
      expect(result.styles).toBeInstanceOf(Buffer)
      expect(result.bundle.toString()).toBe('console.log("bundle")')
      expect(result.manifest.toString()).toBe('{"id":"calendar"}')
      expect(result.styles?.toString()).toBe('.calendar { color: red; }')
    })

    it('handles missing styles.css gracefully', async () => {
      const releaseWithoutStyles = {
        ...releaseData,
        assets: releaseData.assets.filter(a => a.name !== 'styles.css'),
      }

      vi.mocked(fetch)
        .mockResolvedValueOnce(createMockResponse(releaseWithoutStyles, {
          headers: { 'X-RateLimit-Remaining': '55' },
        }))
        .mockResolvedValueOnce(createMockResponse('bundle-code', {
          headers: { 'X-RateLimit-Remaining': '54' },
        }))
        .mockResolvedValueOnce(createMockResponse('{"id":"test"}', {
          headers: { 'X-RateLimit-Remaining': '53' },
        }))

      const result = await client.downloadReleaseAssets('test/repo')

      expect(result.bundle).toBeInstanceOf(Buffer)
      expect(result.manifest).toBeInstanceOf(Buffer)
      expect(result.styles).toBeNull()
    })

    it('throws GitHubFetchError when main.js is missing', async () => {
      const releaseWithoutBundle = {
        ...releaseData,
        assets: releaseData.assets.filter(a => a.name !== 'main.js'),
      }

      vi.mocked(fetch).mockResolvedValueOnce(createMockResponse(releaseWithoutBundle, {
        headers: { 'X-RateLimit-Remaining': '55' },
      }))

      await expect(client.downloadReleaseAssets('test/repo')).rejects.toThrow(GitHubFetchError)
    })

    it('throws AssetTooLargeError when asset exceeds maxAssetSize', async () => {
      const largeRelease = {
        ...releaseData,
        assets: [
          { name: 'main.js', browser_download_url: 'https://github.com/test/repo/releases/download/1.0/main.js', size: 11 * 1024 * 1024 },
          { name: 'manifest.json', browser_download_url: 'https://github.com/test/repo/releases/download/1.0/manifest.json', size: 200 },
        ],
      }

      vi.mocked(fetch).mockResolvedValueOnce(createMockResponse(largeRelease, {
        headers: { 'X-RateLimit-Remaining': '55' },
      }))

      await expect(client.downloadReleaseAssets('test/repo')).rejects.toThrow(AssetTooLargeError)
    })

    it('throws AssetTooLargeError when total exceeds maxTotalDownloadSize', async () => {
      config = createMockConfig({ maxTotalDownloadSize: 6000 })
      client = new GitHubClient(config, logger)

      const releaseWithLargeAssets = {
        ...releaseData,
        assets: [
          { name: 'main.js', browser_download_url: 'https://github.com/test/repo/releases/download/1.0/main.js', size: 4000 },
          { name: 'manifest.json', browser_download_url: 'https://github.com/test/repo/releases/download/1.0/manifest.json', size: 3000 },
        ],
      }

      vi.mocked(fetch)
        .mockResolvedValueOnce(createMockResponse(releaseWithLargeAssets, {
          headers: { 'X-RateLimit-Remaining': '55' },
        }))
        .mockResolvedValueOnce(createMockResponse('x'.repeat(4000), {
          headers: { 'X-RateLimit-Remaining': '54' },
        }))

      await expect(client.downloadReleaseAssets('test/repo')).rejects.toThrow(AssetTooLargeError)
    })

    it('uses version-specific release URL when version is provided', async () => {
      vi.mocked(fetch)
        .mockResolvedValueOnce(createMockResponse(releaseData, {
          headers: { 'X-RateLimit-Remaining': '55' },
        }))
        .mockResolvedValueOnce(createMockResponse('bundle', {
          headers: { 'X-RateLimit-Remaining': '54' },
        }))
        .mockResolvedValueOnce(createMockResponse('manifest', {
          headers: { 'X-RateLimit-Remaining': '53' },
        }))
        .mockResolvedValueOnce(createMockResponse('styles', {
          headers: { 'X-RateLimit-Remaining': '52' },
        }))

      await client.downloadReleaseAssets('liamcain/obsidian-calendar-plugin', '1.5.1')

      expect(vi.mocked(fetch)).toHaveBeenCalledWith(
        'https://api.github.com/repos/liamcain/obsidian-calendar-plugin/releases/tags/1.5.1',
        expect.any(Object),
      )
    })
  })

  describe('Rate Limit Tracking', () => {
    it('tracks rate limit from response headers', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(createMockResponse([], {
        headers: { 'X-RateLimit-Remaining': '42' },
      }))

      await client.fetchCommunityPlugins()
      expect(client.getRateLimitRemaining()).toBe(42)
    })

    it('throws GitHubRateLimitError when rate limit is 0 before request', async () => {
      // First call to set rate limit to 0
      vi.mocked(fetch).mockResolvedValueOnce(createMockResponse([], {
        headers: { 'X-RateLimit-Remaining': '0' },
      }))
      await client.fetchCommunityPlugins()

      // Second call should throw before making request
      await expect(client.fetchCommunityPlugins()).rejects.toThrow(GitHubRateLimitError)
      // fetch should only have been called once (for the first request)
      expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)
    })

    it('throws GitHubRateLimitError on 429 response', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(createMockResponse('rate limited', {
        status: 429,
        headers: {
          'X-RateLimit-Remaining': '0',
          'X-RateLimit-Reset': String(Math.floor(Date.now() / 1000) + 120),
        },
      }))

      await expect(client.fetchCommunityPlugins()).rejects.toThrow(GitHubRateLimitError)
    })

    it('logs warning when rate limit is approaching', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(createMockResponse([], {
        headers: { 'X-RateLimit-Remaining': '5' },
      }))

      await client.fetchCommunityPlugins()
      expect(logger.warn).toHaveBeenCalledWith('GitHub rate limit approaching', { remaining: 5 })
    })

    it('returns -1 when rate limit has not been observed yet', () => {
      expect(client.getRateLimitRemaining()).toBe(-1)
    })
  })

  describe('Domain Allowlist', () => {
    it('allows requests to github.com', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(createMockResponse({ assets: [] }, {
        status: 404,
        headers: { 'X-RateLimit-Remaining': '59' },
      }))

      // This will throw GitHubFetchError for 404 but NOT for domain violation
      await expect(client.fetchManifest('test/repo')).rejects.toThrow(GitHubFetchError)
      expect(vi.mocked(fetch)).toHaveBeenCalled()
    })

    it('allows requests to raw.githubusercontent.com', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(createMockResponse([], {
        headers: { 'X-RateLimit-Remaining': '59' },
      }))

      await client.fetchCommunityPlugins()
      expect(vi.mocked(fetch)).toHaveBeenCalled()
    })
  })

  describe('Timeout', () => {
    it('uses AbortSignal.timeout(30000)', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(createMockResponse([], {
        headers: { 'X-RateLimit-Remaining': '59' },
      }))

      await client.fetchCommunityPlugins()

      const callOptions = vi.mocked(fetch).mock.calls[0]?.[1]
      expect(callOptions?.signal).toBeDefined()
    })

    it('throws GitHubFetchError on timeout', async () => {
      const timeoutErr = new Error('Timeout')
      timeoutErr.name = 'TimeoutError'
      vi.mocked(fetch).mockRejectedValueOnce(timeoutErr)

      await expect(client.fetchCommunityPlugins()).rejects.toThrow(GitHubFetchError)
      expect(logger.error).toHaveBeenCalledWith('GitHub request timed out', expect.any(Object))
    })

    it('throws GitHubFetchError on network error', async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'))

      await expect(client.fetchCommunityPlugins()).rejects.toThrow(GitHubFetchError)
      expect(logger.error).toHaveBeenCalledWith('GitHub request failed', expect.any(Object))
    })
  })
})
