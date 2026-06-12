import { useEffect, useState } from 'react'
import { CheckCircle, ArrowUpCircle, Info, AlertTriangle, Loader } from 'lucide-react'
import { compareSemver } from '../utils/semver'

/**
 * Internal state for the version check logic.
 */
interface VersionCheckState {
  installedVersion: string | null
  latestVersion: string | null
  latestReleaseUrl: string | null
  loading: boolean
  error: 'backend-unreachable' | null
}

/**
 * Self-contained component that displays the current Slatebase version
 * and checks for available updates via the GitHub Releases API.
 * Designed for the Admin configuration page.
 */
export function VersionCheckCard() {
  const [state, setState] = useState<VersionCheckState>({
    installedVersion: null,
    latestVersion: null,
    latestReleaseUrl: null,
    loading: true,
    error: null,
  })

  useEffect(() => {
    let cancelled = false

    async function checkVersion() {
      setState(prev => ({ ...prev, loading: true, error: null }))

      // 1. Fetch installed version from backend
      let installedVersion: string | null
      try {
        const response = await fetch('/api/v1/version')
        if (response.ok) {
          const data = await response.json() as { version?: string }
          installedVersion = data.version ?? null
        } else {
          if (!cancelled) {
            setState(prev => ({
              ...prev,
              loading: false,
              error: 'backend-unreachable',
            }))
          }
          return
        }
      } catch {
        if (!cancelled) {
          setState(prev => ({
            ...prev,
            loading: false,
            error: 'backend-unreachable',
          }))
        }
        return
      }

      // 2. Fetch latest release from GitHub API (10s timeout)
      let latestVersion: string | null = null
      let latestReleaseUrl: string | null = null

      try {
        const controller = new AbortController()
        const timeoutId = setTimeout(() => controller.abort(), 10000)

        const ghResponse = await fetch(
          'https://api.github.com/repos/andreas13xxx/Slatebase/releases/latest',
          {
            signal: controller.signal,
            headers: { 'Accept': 'application/vnd.github.v3+json' },
          }
        )
        clearTimeout(timeoutId)

        if (ghResponse.ok) {
          const release = await ghResponse.json() as { tag_name?: string; html_url?: string }
          if (release.tag_name) {
            // Strip leading 'v' for comparison
            latestVersion = release.tag_name.startsWith('v')
              ? release.tag_name.slice(1)
              : release.tag_name
          }
          latestReleaseUrl = release.html_url ?? null
        }
      } catch {
        // GitHub API failure: silently continue without comparison
      }

      if (!cancelled) {
        setState({
          installedVersion,
          latestVersion,
          latestReleaseUrl,
          loading: false,
          error: null,
        })
      }
    }

    checkVersion()

    return () => {
      cancelled = true
    }
  }, [])

  // --- Render ---

  if (state.loading) {
    return (
      <div className="version-check-card version-check-card--loading">
        <Loader size={16} className="version-check-card__spinner" />
        <span className="version-check-card__text">Version wird geprüft...</span>
      </div>
    )
  }

  if (state.error === 'backend-unreachable') {
    return (
      <div className="version-check-card version-check-card--error">
        <AlertTriangle size={16} className="version-check-card__icon" />
        <span className="version-check-card__text">Verbindung zum Backend nicht möglich</span>
      </div>
    )
  }

  // Development version — no comparison
  if (state.installedVersion === 'development') {
    return (
      <div className="version-check-card version-check-card--development">
        <Info size={16} className="version-check-card__icon" />
        <span className="version-check-card__text">Entwicklungsversion</span>
      </div>
    )
  }

  // No latest version available (GitHub API failed) — show installed only
  if (!state.latestVersion || !state.installedVersion) {
    return (
      <div className="version-check-card version-check-card--current">
        <CheckCircle size={16} className="version-check-card__icon" />
        <span className="version-check-card__text">
          Version {state.installedVersion ? `v${state.installedVersion}` : 'unbekannt'}
        </span>
      </div>
    )
  }

  // Compare versions
  const comparison = compareSemver(state.installedVersion, state.latestVersion)

  // Update available (installed < latest)
  if (comparison < 0) {
    return (
      <div className="version-check-card version-check-card--update">
        <ArrowUpCircle size={16} className="version-check-card__icon" />
        <div className="version-check-card__content">
          <span className="version-check-card__text">
            Neue Version v{state.latestVersion} verfügbar
          </span>
          <span className="version-check-card__installed">
            Installiert: v{state.installedVersion}
          </span>
          {state.latestReleaseUrl && (
            <a
              href={state.latestReleaseUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="version-check-card__link"
            >
              Zum Release →
            </a>
          )}
        </div>
      </div>
    )
  }

  // Current (installed >= latest)
  return (
    <div className="version-check-card version-check-card--current">
      <CheckCircle size={16} className="version-check-card__icon" />
      <span className="version-check-card__text">
        Aktuell — v{state.installedVersion}
      </span>
    </div>
  )
}
